import type { Article, Dict, TaskWords, Word } from '../types'
import { DictType, getDefaultDict } from '../types'
import { useBaseStore } from '../stores/base.ts'
import { useSettingStore } from '../stores/setting.ts'
import { _getDictDataByUrl, cloneDeep, isDictIdMatch, resourceWrap, shuffle } from '../utils'
import { computed, onMounted, watch } from 'vue'
import { DICT_LIST, DictId } from '../config/env.ts'
import { useRuntimeStore } from '../stores/runtime.ts'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { advancePointerPastFinishedUnits, ensureUnitOffsets, getActiveUnit, getUnitOffset } from '../utils/dict-units.ts'
import { getEffectiveDailyGoal } from '../utils/daily-goal.ts'

dayjs.extend(isSameOrBefore)

export function useWordOptions() {
  const store = useBaseStore()

  function isWordCollect(val: Word) {
    return !!store.collectWord.words.find(v => v.word.toLowerCase() === val.word.toLowerCase())
  }

  function toggleWordCollect(val: Word) {
    let rIndex = store.collectWord.words.findIndex(v => v.word.toLowerCase() === val.word.toLowerCase())
    if (rIndex > -1) {
      store.collectWord.words.splice(rIndex, 1)
    } else {
      store.collectWord.words.push(val)
    }
    store.collectWord.length = store.collectWord.words.length
  }

  function isWordSimple(val: Word) {
    return !!store.knownWordsSet.has(val.word.toLowerCase())
  }

  function toggleWordSimple(val: Word) {
    let rIndex = store.knownWords.findIndex(v => v === val.word.toLowerCase())
    if (rIndex > -1) {
      store.known.words.splice(rIndex, 1)
    } else {
      store.known.words.push(val)
    }
    store.known.length = store.known.words.length
  }

  function delWrongWord(val: Word) {
    let rIndex = store.wrong.words.findIndex(v => v.word.toLowerCase() === val.word.toLowerCase())
    if (rIndex > -1) {
      store.wrong.words.splice(rIndex, 1)
    }
    store.wrong.length = store.wrong.words.length
  }

  function delSimpleWord(val: Word) {
    let rIndex = store.known.words.findIndex(v => v.word.toLowerCase() === val.word.toLowerCase())
    if (rIndex > -1) {
      store.known.words.splice(rIndex, 1)
    }
    store.known.length = store.known.words.length
  }

  function getCollectibleDicts(excludeDictId?: string) {
    return store.word.bookList.filter(dict => {
      if (dict.id !== DictId.wordCollect && !dict.custom) return false
      if (excludeDictId && isDictIdMatch(dict, excludeDictId)) return false
      return true
    })
  }

  function resolveDictInBookList(dict: Dict) {
    return store.word.bookList.find(d => isDictIdMatch(d, dict.id)) ?? dict
  }

  function addWordToDict(val: Word, dict: Dict): { ok: boolean } {
    const target = resolveDictInBookList(dict)
    const rIndex = target.words.findIndex(v => v.word.toLowerCase() === val.word.toLowerCase())
    if (rIndex > -1) return { ok: false }
    target.words.push(val)
    target.length = target.words.length
    return { ok: true }
  }

  async function createCustomDict(
    name: string
  ): Promise<{ ok: true; dict: Dict } | { ok: false; reason: 'empty' | 'duplicate' | 'api' }> {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (store.word.bookList.find(v => v.name === trimmed)) {
      return { ok: false, reason: 'duplicate' }
    }
    let data: Dict = getDefaultDict({
      name: trimmed,
      id: 'custom-dict-' + Date.now(),
      custom: true,
    })
    data.type = DictType.word
    store.word.bookList.push(cloneDeep(data))
    return { ok: true, dict: data }
  }

  return {
    isWordCollect,
    toggleWordCollect,
    getCollectibleDicts,
    addWordToDict,
    createCustomDict,
    isWordSimple,
    toggleWordSimple,
    delWrongWord,
    delSimpleWord,
  }
}

export function useArticleOptions() {
  const store = useBaseStore()

  function isArticleCollect(val: Article) {
    return !!store.collectArticle?.articles?.find(v => v.id === val.id)
  }

  //todo 这里先收藏，再修改。收藏里面的未同步。单词也是一样的
  function toggleArticleCollect(val: Article) {
    let rIndex = store.collectArticle.articles.findIndex(v => v.id === val.id)
    if (rIndex > -1) {
      store.collectArticle.articles.splice(rIndex, 1)
    } else {
      store.collectArticle.articles.push(val)
    }
    store.collectArticle.length = store.collectArticle.articles.length
  }

  return {
    isArticleCollect,
    toggleArticleCollect,
  }
}

export function getCurrentStudyWord(): TaskWords {
  const store = useBaseStore()
  let data: TaskWords = { new: [], review: [] }
  let dict = store.sdict
  let words = dict.words.slice()

  if (words?.length) {
    const settingStore = useSettingStore()
    const units = ensureUnitOffsets(dict)
    //单元模式：只学习当前单元；整本模式：按整本游标顺序
    const unitMode = dict.studyMode === 'unit' && units.length > 0
    const activeUnit = unitMode ? getActiveUnit(dict) : null
    if (activeUnit) dict.activeUnit = activeUnit.name
    const scopeWords = activeUnit ? activeUnit.words.slice() : words
    if (!unitMode) advancePointerPastFinishedUnits(dict)

    //忽略列表：简单词或已掌握
    const ignoreSet = [store.allIgnoreWordsSet, store.knownWordsSet][settingStore.ignoreSimpleWord ? 0 : 1]
    //每日目标：临时目标（仅今天）优先于词典设置
    const perDay = getEffectiveDailyGoal(dict)
    const start = activeUnit
      ? getUnitOffset(dict, activeUnit)
      : Math.min(Math.max(0, dict.lastLearnIndex), scopeWords.length)
    const complete = dict.complete
    const isEnd = start >= scopeWords.length - 1 && scopeWords.length !== 1
    const reviewRatio = settingStore.wordReviewRatio

    if (!isEnd) {
      //从start往后取perDay个单词，作为新词
      for (let i = start; i < scopeWords.length; i++) {
        let item = scopeWords[i]
        if (data.new.length >= perDay) break
        //整本模式额外跳过已有 FSRS 记录的词（单元模式以手动进度为准，不跳过）
        const alreadyStudied = !activeUnit && !!store.fsrsData[item.word]
        if (!ignoreSet.has(item.word) && !alreadyStudied) {
          data.new.push(item)
        }
      }
    }

    //如果复习比大于等于1，或者已完成，才生成复习词
    if (reviewRatio >= 1 || complete || isEnd) {
      //Map建立索引，用于查找、包含
      const wordMap = new Map(scopeWords.map(s => [s.word, s]))
      //复习总数量;如果已结束那么复习比最小是1
      const totalNeed = perDay * (isEnd ? reviewRatio || 1 : reviewRatio)
      const now = dayjs()
      let waitRemoveFromFsrsData = []
      //取 due 到期的单词
      let reviewWordStrList = Object.entries(store.fsrsData)
        .filter(([word, card]) => {
          //1、这里的due字段被json序列化之后又恢复是字符串了，所以要用dayjs比较
          //2、要在当前学习范围里面（单元模式仅本单元）
          //3、不在新词里面
          //4、到自然日就算到期
          let isMastered = ignoreSet.has(word)
          if (isMastered) {
            waitRemoveFromFsrsData.push(word)
          }
          return (
            !isMastered &&
            dayjs(card.due).isSameOrBefore(now, 'day') &&
            wordMap.has(word) &&
            !data.new.find(v => v.word === word)
          )
        })
        .sort((a, b) => dayjs(a[1].due).valueOf() - dayjs(b[1].due).valueOf())
        .map(([word]) => word)

      waitRemoveFromFsrsData.map(word => {
        delete store.fsrsData[word]
      })

      data.review = shuffle(
        reviewWordStrList
          .slice(0, totalNeed)
          .map(word => wordMap.get(word))
          .filter(obj => obj)
      )
    }
  }
  return data
}

export function useGetDict() {
  const store = useBaseStore()
  const runtimeStore = useRuntimeStore()
  let waiting = $ref(false)
  let fetching = $ref(false)
  const route = useRoute()
  const router = useRouter()

  watch(
    [() => store.load, () => waiting],
    ([a, b]) => {
      if (a && b) {
        loadDict()
      }
    },
    { immediate: true }
  )

  onMounted(() => {
    // console.log('onMounted')
    if (route.query?.isAdd) {
      runtimeStore.editDict = getDefaultDict()
    } else {
      if (!runtimeStore.editDict?.id) {
        let dictId = route.params?.id
        if (!dictId) {
          return router.push('/articles')
        }
        waiting = true
      } else {
        loadDict(runtimeStore.editDict)
      }
    }
  })

  async function loadDict(dict?: Dict) {
    if (!dict) {
      dict = getDefaultDict()
      let dictId = route.params.id
      //先在自己的词典列表里面找，如果没有再在资源列表里面找
      dict = store.article.bookList.find(v => isDictIdMatch(v, dictId))
      let r = await fetch(resourceWrap(DICT_LIST.ARTICLE.ALL))
      let dict_list = await r.json()
      if (!dict) dict = dict_list.flat().find(v => isDictIdMatch(v, dictId)) as Dict
    }
    if (dict && dict.id) {
      if (!dict?.articles?.length && !dict?.custom && !dict?.system && !dict?.is_default) {
        fetching = true
        let r = await _getDictDataByUrl(dict, DictType.article)
        runtimeStore.editDict = r
      }
      if (store.article.bookList.find(book => book.id === runtimeStore.editDict.id)) {
      }
    } else {
      router.push('/articles')
    }

    waiting = false
    fetching = false
  }

  const loading = computed(() => waiting || fetching)

  return { loading }
}
