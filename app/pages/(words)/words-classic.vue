<script setup lang="ts">
import { useBaseStore } from '@/core/stores/base.ts'
import { useRouter } from 'vue-router'
import {
  BaseButton,
  BaseIcon,
  BasePage,
  Calendar,
  DeleteIcon,
  Dialog,
  OptionButton,
  PopConfirm,
  Switch,
  Toast,
  Tooltip,
} from '@/base'
import {
  _getAccomplishDate,
  _getDictDataByUrl,
  _nextTick,
  debounce,
  getShufflePracticeWords,
  isMobile,
  loadJsLib,
  msToHourMinute,
  resourceWrap,
  type ShufflePracticeSetting,
  total,
  useNav,
} from '@/core/utils'
import type { DictResource, Statistics } from '@/core/types/types.ts'
import { onMounted, onUnmounted, watch } from 'vue'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import Book from '@/components/Book.vue'
import { getDefaultDict } from '@/core/types/func.ts'
import PracticeSettingDialog from '@/components/word/PracticeSettingDialog.vue'
import UnitProgressDialog from '@/components/word/UnitProgressDialog.vue'
import { useSettingStore } from '@/core/stores/setting.ts'
import { useFetch } from '@vueuse/core'
import {
  APP_NAME,
  DICT_LIST,
  LIB_JS_URL,
  Old_Host,
  Origin,
  TourConfig,
  WordPracticeModeNameMap,
  WordPracticeModeUrlMap,
} from '@/core/config/env.ts'
import PracticeWordListDialog from '@/components/word/PracticeWordListDialog.vue'
import ShufflePracticeSettingDialog from '@/components/word/ShufflePracticeSettingDialog.vue'
import { flushStatToStore } from '@/core/composables/usePracticePersistence'
import { useDataSyncPersistence } from '@/core/composables/useDataSyncPersistence'
import { WordPracticeMode } from '@/core/types/enum.ts'
import {
  type PracticeWordCache,
  UnsupportedPracticeCacheVersionError,
  usePracticeWordPersistence,
} from '@/core/composables/practice-words/practice-word-session.ts'
import dayjs from 'dayjs'
import { getActiveCustomFlowId, getUserFlow } from '@/core/composables/practice-words/practice-flow-runtime.ts'
import { createStudyTask } from '@/core/composables/practice-words/study-task.ts'
import {
  type DictUnit,
  getActiveUnit,
  getDictUnits,
  getNextUnfinishedUnit,
  getOverallUnitProgress,
  getUnitOffset,
  getUnitProgress,
} from '@/core/utils/dict-units.ts'
import { getPracticeWordCacheLocal } from '@/core/utils/cache.ts'

const store = useBaseStore()
const settingStore = useSettingStore()
const wordPersistence = usePracticeWordPersistence()
const dataSync = useDataSyncPersistence()
const router = useRouter()
const { nav } = useNav()
const runtimeStore = useRuntimeStore()
let loading = $ref(true)
let isSaveData = $ref(false)
let unsupportedCacheVersion = false

async function loadPracticeCache() {
  try {
    return await wordPersistence.load()
  } catch (error) {
    if (!(error instanceof UnsupportedPracticeCacheVersionError)) throw error
    unsupportedCacheVersion = true
    Toast.error('练习缓存来自更高版本，请升级后再继续')
    return null
  }
}

const shouldShowDialogPracticeMode = [WordPracticeMode.Shuffle, WordPracticeMode.ShuffleWordsTest]

useSeoMeta({
  title: `在线背单词与英语打字练习｜${APP_NAME}`,
  description: '在电脑上选择 CET-4、CET-6、考研、GRE、IELTS 等词库，通过键盘跟打、拼写和科学间隔复习高效背单词。',
  ogTitle: `在线背单词与英语打字练习｜${APP_NAME}`,
  ogDescription: '在电脑上用键盘打字背单词，支持 50+ 词库和科学间隔复习。',
  twitterTitle: `在线背单词与英语打字练习｜${APP_NAME}`,
  twitterDescription: '在电脑上用键盘打字背单词，支持 50+ 词库和科学间隔复习。',
})

let practiceData = $ref<PracticeWordCache>({
  taskWords: {
    new: [],
    review: [],
  },
} as any)
let dueReviewCount = $ref(0)

function refreshStudyTask() {
  const result = createStudyTask()
  practiceData.taskWords = result.taskWords
  dueReviewCount = result.dueReviewCount
  return result
}

function toggleAutoAddRandomReview(enabled: boolean) {
  settingStore.autoAddRandomReviewWhenNoDue = enabled
  const result = refreshStudyTask()
  if (!enabled) return
  if (result.randomReviewCount > 0) {
    Toast.success(`已将 ${result.randomReviewCount} 个随机复习词加入本次学习`)
  } else {
    Toast.warning('暂无单词可以复习，先学习一些新词后再来看看吧')
  }
}

const effectiveReviewRatio = $computed(() => {
  const dict = store.sdict
  const isEnd = dict.length !== 1 && dict.lastLearnIndex >= dict.length - 1
  return isEnd ? settingStore.wordReviewRatio || 1 : settingStore.wordReviewRatio
})

const reviewWordLimit = $computed(() => {
  return Math.max(0, Math.floor(store.sdict.perDayStudyNumber * effectiveReviewRatio))
})

const reviewWordTip = $computed(() => {
  const dailyGoal = store.sdict.perDayStudyNumber
  const actualCount = practiceData?.taskWords?.review?.length ?? 0
  const rule = `复习词来自记忆曲线中今天及以前到期的已学单词，并会排除本组新词、已掌握词和已忽略词。“${effectiveReviewRatio} 倍”只决定数量上限：每日新词目标 ${dailyGoal} × ${effectiveReviewRatio}，本组最多安排 ${reviewWordLimit} 个。\n`

  if (isSaveData) {
    return `${rule}当前是已生成的未完成任务，共安排 ${actualCount} 个复习词；\n实际数量取决于任务生成时符合条件的到期词，不会用未到期词补足。`
  }
  if (reviewWordLimit === 0) {
    return `${rule}当前数量上限为 0，因此本组不安排复习词。`
  }
  if (dueReviewCount === 0 && actualCount > 0) {
    return `${rule}当前没有到期复习词，已按“加入随机复习”设置从已学单词中随机加入 ${actualCount} 个。`
  }
  if (actualCount < reviewWordLimit) {
    return `${rule}当前只有 ${actualCount} 个符合条件的到期词，因此本组安排 ${actualCount} 个，不会用未到期词补足。`
  }
  return `${rule}当前本组安排 ${actualCount} 个，已达到数量上限。`
})

async function resetCacheData() {
  if (unsupportedCacheVersion) return
  isSaveData && flushStatToStore(practiceData.statStoreData)
  isSaveData = false
  practiceData.practiceData = null
  practiceData.statStoreData = null
  practiceData.sessionSnapshot = undefined
  await wordPersistence.clear()
}

// runtimeStore.globalLoading练习界面，退出时会调用一个保存，可能会卡住。当调用完成再init
//  immediate: true 比 onUmMounted 先执行，只能延时执行
watch(
  [() => store.load, () => runtimeStore.globalLoading],
  debounce(([a, b]) => {
    if (a && !b) {
      init()
      _nextTick(async () => {
        const Shepherd = await loadJsLib('Shepherd', LIB_JS_URL.SHEPHERD)
        const tour = new Shepherd.Tour(TourConfig)
        tour.on('cancel', () => {
          localStorage.setItem('tour-guide', '1')
        })
        tour.addStep({
          id: 'step1',
          text: '点击这里选择一本词典开始学习',
          attachTo: {
            element: '#step1',
            on: 'bottom',
          },
          buttons: [
            {
              text: `下一步（1/${TourConfig.total}）`,
              action() {
                tour.next()
                router.push('/dict-list')
              },
            },
          ],
        })
        const r = localStorage.getItem('tour-guide')
        if (settingStore.first && !r && !isMobile()) tour.start()
      }, 500)
    }
  }),
  { immediate: true }
)

async function onvisibilitychange() {
  if (!document.hidden) {
    //当页面可见时，检查是否需要从缓存恢复
    const d = await loadPracticeCache()
    if (d) {
      practiceData = d
      isSaveData = true
    }
  }
}

async function init() {
  document.removeEventListener('visibilitychange', onvisibilitychange)
  document.addEventListener('visibilitychange', onvisibilitychange)

  let studyIndex = store.word.studyIndex
  if (studyIndex >= 3) {
    if (!store.sdict.custom && !store.sdict.words.length) {
      let dictList = await fetch(resourceWrap(DICT_LIST.WORD.ALL)).then(r => r.json())
      let dict = await _getDictDataByUrl(store.sdict)
      let r = dictList.find(v => [v.enName, v.id].includes(store.sdict.id))
      if (r) {
        store.word.bookList[studyIndex].words = dict.words
        store.word.bookList[studyIndex].id = r.id
        store.word.bookList[studyIndex].enName = r.enName
        store.word.bookList[studyIndex].cover = r.cover
        store.word.bookList[studyIndex].category = r.category
        store.word.bookList[studyIndex].tags = r.tags
        store.word.bookList[studyIndex].url = r.url
        store.word.bookList[studyIndex].description = r.description
        store.word.bookList[studyIndex].name = r.name
      } else {
        store.word.bookList[studyIndex] = dict
      }
      store.word.bookList[studyIndex].length = dict.words.length
      let s = store.word.bookList[studyIndex]
      if (s.lastLearnIndex > s.length) {
        store.word.bookList[studyIndex].lastLearnIndex = s.length
        store.word.bookList[studyIndex].complete = true
        await resetCacheData()
      }
    }
  }

  if (!practiceData?.taskWords.new.length && store.sdict.words.length) {
    const d = await loadPracticeCache()
    if (d) {
      practiceData = d
      isSaveData = true
    } else if (!unsupportedCacheVersion) {
      refreshStudyTask()
    }
  }
  loading = false
}

async function startPractice(practiceMode: WordPracticeMode, resetCache: boolean = false): Promise<void> {
  if (unsupportedCacheVersion) {
    Toast.error('当前客户端无法读取这份练习缓存，请升级后再继续')
    return
  }
  if (practiceMode === WordPracticeMode.Custom) {
    const activeCustomFlowId = getActiveCustomFlowId()
    if (!activeCustomFlowId || !getUserFlow(activeCustomFlowId)) {
      Toast.warning('请先创建并激活一个自定义流程')
      router.push('/practice-flow-editor')
      return
    }
  }
  if (resetCache) await resetCacheData()

  if (shouldShowDialogPracticeMode.includes(practiceMode) && !isSaveData) {
    editingWordPracticeMode = practiceMode
    showShufflePracticeSettingDialog = true
    return
  }

  if (store.sdict.id) {
    if (!store.sdict.words.length) {
      Toast.warning('没有单词可学习！')
      return
    }

    settingStore.wordPracticeMode = practiceMode

    window.umami?.track('startStudyWord', {
      name: store.sdict.name,
      index: String(store.sdict.lastLearnIndex),
      perDayStudyNumber: String(store.sdict.perDayStudyNumber),
      custom: store.sdict.custom,
      complete: store.sdict.complete,
      wordPracticeMode: String(settingStore.wordPracticeMode),
    })
    //把是否是第一次设置为false
    if (settingStore.first) settingStore.first = false
    nav(WordPracticeModeUrlMap[practiceMode] + '/' + store.sdict.id, {}, practiceData)
  } else {
    window.umami?.track('no-dict')
    Toast.warning('请先选择一本词典')
  }
}

function freePractice() {
  startPractice(WordPracticeMode.Free, settingStore.wordPracticeMode !== WordPracticeMode.Free)
}

function systemPractice() {
  const currentMode = settingStore.wordPracticeMode
  const isFree = currentMode === WordPracticeMode.Free
  startPractice(isFree ? WordPracticeMode.System : currentMode, isFree)
}

let editingWordPracticeMode = $ref(0)

let showPracticeSettingDialog = $ref(false)
let showShufflePracticeSettingDialog = $ref(false)
let showPracticeWordListDialog = $ref(false)
let showUnitProgressDialog = $ref(false)
let editingUnit = $ref<DictUnit | null>(null)

type StudyDayRow = Statistics & { dictName: string }

let showStudyDayDialog = $ref(false)
let selectedStudyDateKey = $ref('')
let studyDayRecords = $ref<StudyDayRow[]>([])

const allWordStatistics = $computed(() => store.word.bookList.flatMap(book => book.statistics ?? []))

const cacheSpendMs = $computed(() => practiceData.statStoreData?.spend ?? 0)

const todayDateKey = $computed(() => dayjs().format('YYYY-MM-DD'))

/**
 * 缓存记录中每一天对应的学习毫秒数 Map<'YYYY-MM-DD', spendMs>
 * 有 segments 时按片段精确分组，否则退回到 startDate + spend 整体归一天
 */
const cacheDaySpendMap = $computed((): Map<string, number> => {
  const st = practiceData.statStoreData
  const map = new Map<string, number>()
  if (!st?.spend) return map
  if (Array.isArray(st.segments) && st.segments.length > 0) {
    for (const [segStart, segEnd] of st.segments) {
      const key = dayjs(segStart).format('YYYY-MM-DD')
      map.set(key, (map.get(key) ?? 0) + (segEnd - segStart))
    }
  } else {
    // 老数据 / 无 segments：全部归到 startDate 那天
    map.set(dayjs(st.startDate).format('YYYY-MM-DD'), st.spend)
  }
  return map
})

const todayCacheMs = $computed(() => cacheDaySpendMap.get(todayDateKey) ?? 0)

const calendarHighlightDates = $computed(() => {
  const set = new Set<string>()
  for (const s of allWordStatistics) {
    set.add(dayjs(s.startDate).format('YYYY-MM-DD'))
  }
  // 把缓存记录中所有出现过的天都高亮（支持跨天）
  for (const key of cacheDaySpendMap.keys()) {
    set.add(key)
  }
  return [...set]
})

/** 已落库统计总毫秒（全 bookList） */
const persistedTotalMs = $computed(() => total(allWordStatistics, 'spend'))

const totalSpend = $computed(() => {
  const sum = persistedTotalMs + cacheSpendMs
  if (!sum) return 0
  return msToHourMinute(sum)
})

const todayTotalSpend = $computed(() => {
  const todayPersistedMs = total(
    allWordStatistics.filter(v => dayjs(v.startDate).isSame(dayjs(), 'day')),
    'spend'
  )
  const sum = todayPersistedMs + todayCacheMs
  if (!sum) return 0
  return msToHourMinute(sum)
})

const totalDay = $computed(() => {
  const set = new Set(allWordStatistics.map(v => dayjs(v.startDate).format('YYYY-MM-DD')))
  // 把缓存记录中所有出现过的天都计入（支持跨天）
  for (const key of cacheDaySpendMap.keys()) {
    set.add(key)
  }
  return set.size
})

const currentUnits = $computed(() => (store.sdict.id ? getDictUnits(store.sdict) : []))

/** 单元模式仅在已划分单元时生效，否则按整本展示 */
const unitModeActive = $computed(() => store.sdict.studyMode === 'unit' && currentUnits.length > 0)

const overallUnitProgress = $computed(() => {
  if (!store.sdict.id) return { total: 0, learned: 0, percent: 0 }
  //未划分单元时回退为整本进度
  if (!currentUnits.length) {
    const total = store.sdict.length || (store.sdict.words ?? []).length
    const learned = Math.min(store.sdict.lastLearnIndex ?? 0, total)
    return { total, learned, percent: total ? Math.round((learned / total) * 100) : 0 }
  }
  return getOverallUnitProgress(store.sdict)
})

const nextUnfinishedUnit = $computed(() => (unitModeActive ? getNextUnfinishedUnit(store.sdict) : null))

const masteredCount = $computed(() => store.knownWordsSet.size)

/** 已掌握词占当前词典总词数的百分比（用于磁贴微型进度条） */
const masteredPercent = $computed(() => {
  const totalWords = store.sdict.length || (store.sdict.words ?? []).length
  return totalWords ? Math.min(100, Math.round((masteredCount / totalWords) * 100)) : 0
})

const dueReviewTotal = $computed(() => {
  if (!store.sdict.id) return 0
  const wordSet = new Set((store.sdict.words ?? []).map(w => w.word))
  const endOfToday = dayjs().endOf('day').valueOf()
  return Object.entries(store.fsrsData).filter(([word, card]) => {
    return wordSet.has(word) && dayjs(card.due).valueOf() <= endOfToday
  }).length
})

const remainingNew = $computed(() => {
  if (!store.sdict.id) return 0
  if (unitModeActive) {
    const unit = getActiveUnit(store.sdict)
    return unit ? Math.max(0, unit.total - getUnitOffset(store.sdict, unit)) : 0
  }
  return Math.max(0, store.sdict.length - store.sdict.lastLearnIndex)
})

const streakDays = $computed(() => {
  const set = new Set(calendarHighlightDates)
  let cursor = dayjs()
  if (!set.has(cursor.format('YYYY-MM-DD'))) cursor = cursor.subtract(1, 'day')
  let count = 0
  while (set.has(cursor.format('YYYY-MM-DD'))) {
    count++
    cursor = cursor.subtract(1, 'day')
  }
  return count
})

const weeklySpend = $computed(() => {
  const days: { key: string; label: string; ms: number; minutes: number; height: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day')
    const key = d.format('YYYY-MM-DD')
    const persisted = total(
      allWordStatistics.filter(v => dayjs(v.startDate).isSame(d, 'day')),
      'spend'
    )
    const ms = persisted + (cacheDaySpendMap.get(key) ?? 0)
    days.push({ key, label: i === 0 ? '今天' : d.format('MM-DD'), ms, minutes: Math.round(ms / 60000), height: 0 })
  }
  const max = Math.max(...days.map(d => d.ms), 1)
  days.forEach(d => (d.height = Math.max(4, Math.round((d.ms / max) * 100))))
  return days
})

function openUnitProgress(unit: DictUnit) {
  editingUnit = unit
  showUnitProgressDialog = true
}

async function beginUnitStudyFromHome(unit: DictUnit) {
  const dict = store.sdict
  if (!dict.id) return Toast.warning('请先选择一本词典')
  if (!dict.words.length) return Toast.warning('没有单词可学习！')
  dict.studyMode = 'unit'
  dict.activeUnit = unit.name
  const cache = await getPracticeWordCacheLocal()
  if (cache) {
    flushStatToStore((cache as any)?.statStoreData)
    await wordPersistence.clear()
    isSaveData = false
  }
  const task = createStudyTask()
  practiceData = { taskWords: task.taskWords } as any
  dueReviewCount = task.dueReviewCount
  settingStore.wordPracticeMode = WordPracticeMode.System
  nav(WordPracticeModeUrlMap[WordPracticeMode.System] + '/' + dict.id, {}, practiceData)
}

const studyDayDialogTitle = $computed(() =>
  selectedStudyDateKey ? `${dayjs(selectedStudyDateKey).format('YYYY年M月D日')} 学习记录` : ''
)

function isStudyDayKeyToday(dateKey: string) {
  return dateKey === dayjs().format('YYYY-MM-DD')
}

function onSelectCalendarDate(dateKey: string) {
  selectedStudyDateKey = dateKey
  const rows: StudyDayRow[] = []
  for (const book of store.word.bookList) {
    for (const stat of book.statistics ?? []) {
      if (dayjs(stat.startDate).format('YYYY-MM-DD') === dateKey) {
        rows.push({ ...stat, dictName: book.name })
      }
    }
  }
  const st = practiceData.statStoreData
  // 缓存记录跨天时，只要该天在 cacheDaySpendMap 中有记录就展示
  if (st?.spend && cacheDaySpendMap.has(dateKey)) {
    const daySpend = cacheDaySpendMap.get(dateKey)!
    const cacheKeys = [...cacheDaySpendMap.keys()]
    const keyIdx = cacheKeys.indexOf(dateKey)
    const isMultiDay = cacheKeys.length > 1
    // 推算该天在整次练习中的角色（练习未结束，最后一天标为"学习中"而非"学习结束"）
    let sessionRole: StudyDayRow['sessionRole']
    if (!isMultiDay) {
      sessionRole = 'single'
    } else if (keyIdx === 0) {
      sessionRole = 'start'
    } else if (keyIdx === cacheKeys.length - 1) {
      sessionRole = 'middle' // 最后一天仍在进行中，用 middle 表示
    } else {
      sessionRole = 'middle'
    }
    rows.push({
      ...st,
      spend: daySpend,
      new: st.newWordNumber,
      review: st.reviewWordNumber,
      dictName: store.sdict.name,
      sessionRole,
    })
  }
  if (!rows.length) return Toast.info('无学习记录')
  studyDayRecords = rows
  showStudyDayDialog = true
}

async function goDictDetail(val: DictResource) {
  if (!val.id) return nav('/dict-list')
  //词典二级菜单：单元学习管理
  nav('/dict-units/' + val.id)
}

let isManageDict = $ref(false)
let selectIds = $ref([])

async function handleBatchDel() {
  selectIds.forEach(id => {
    let r = store.word.bookList.findIndex(v => v.id === id)
    if (r !== -1) {
      if (store.word.studyIndex === r) {
        store.word.studyIndex = -1
      }
      if (store.word.studyIndex > r) {
        store.word.studyIndex--
      }
      store.word.bookList.splice(r, 1)
    }
  })
  selectIds = []
  Toast.success('删除成功！')
}

function toggleSelect(item) {
  let rIndex = selectIds.findIndex(v => v === item.id)
  if (rIndex > -1) {
    selectIds.splice(rIndex, 1)
  } else {
    selectIds.push(item.id)
  }
}

const progressTextLeft = $computed(() => {
  if (store.sdict.complete) return '已学完，进入总复习阶段'
  return '当前进度：已学' + overallUnitProgress.percent + '%'
})

function check(cb: Function) {
  if (!store.sdict.id) {
    Toast.warning('请先选择一本词典')
  } else {
    runtimeStore.editDict = getDefaultDict(store.sdict)
    cb()
  }
}

async function savePracticeSetting() {
  await resetCacheData()
  await store.changeDict(runtimeStore.editDict)
  refreshStudyTask()
  Toast.success('修改成功')
}

async function onShufflePracticeSettingOk(setting: ShufflePracticeSetting) {
  await dataSync.saveDictState()
  await resetCacheData()
  settingStore.wordPracticeMode = editingWordPracticeMode

  window.umami?.track('startStudyWord', {
    name: store.sdict.name,
    index: store.sdict.lastLearnIndex,
    perDayStudyNumber: store.sdict.perDayStudyNumber,
    custom: store.sdict.custom,
    complete: store.sdict.complete,
    wordPracticeMode: settingStore.wordPracticeMode,
  })

  const result = getShufflePracticeWords(store.sdict.words, setting, store.getIgnoreWordsSet())
  practiceData.taskWords.review = result.words
  nav(
    WordPracticeModeUrlMap[editingWordPracticeMode] + '/' + store.sdict.id,
    {},
    {
      ...practiceData,
      total: result.words.length,
      shuffleRange: result.range,
    }
  )
}

const { data: recommendDictList, isFetching } = useFetch(resourceWrap(DICT_LIST.WORD.RECOMMENDED)).json()

const systemPracticeText = $computed(() => {
  if (settingStore.wordPracticeMode === WordPracticeMode.Free) {
    return '开始学习'
  } else if (settingStore.wordPracticeMode === WordPracticeMode.Custom) {
    return isSaveData ? '继续自定义练习' : '开始自定义练习'
  } else {
    return isSaveData
      ? '继续' + WordPracticeModeNameMap[settingStore.wordPracticeMode]
      : '开始' + WordPracticeModeNameMap[settingStore.wordPracticeMode]
  }
})

let isOldHost = $ref(false)
onMounted(() => {
  isOldHost = window.location.host === Old_Host
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onvisibilitychange)
})
</script>

<template>
  <BasePage>
    <div class="my-100 text-4xl font-bold color-[var(--md-sys-color-error)]" v-if="isOldHost">
      已启用新域名
      <a class="mr-4" :href="`${Origin}/words?from_old_site=1`">{{ Origin }}</a
      >当前 2study.top 域名将在 7 月 3 号停止使用
    </div>

    <!-- Sober 为 Web Components，仅客户端渲染；fallback 提供骨架屏避免布局塌陷 -->
    <ClientOnly>
      <template #fallback>
        <div class="dashboard-skeleton" aria-busy="true">
          <div v-for="i in 3" :key="i" class="skeleton-block"></div>
        </div>
      </template>

      <!-- 响应式网格：xl 双列并排，消灭大卡片永远竖排 -->
      <div class="dash-root grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <!-- 词典状态卡 -->
        <div class="dash-card flex flex-col">
      <div class="flex-1 flex flex-col justify-between">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex gap-3 items-center">
            <div class="p-1.5 center rounded-full bg-[var(--md-sys-color-primary-container)]">
              <IconFluentBookNumber20Filled class="text-xl color-[var(--md-sys-color-on-primary-container)]" />
            </div>
            <div @click="goDictDetail(store.sdict)" class="text-2xl font-bold cursor-pointer">
              {{ store.sdict.name || $t('no_dict_selected') }}
            </div>
          </div>
          <!-- 状态指示器（参考 M3E 绿点样式） -->
          <span
            class="status-chip"
            :class="store.sdict.id ? (store.sdict.complete ? 'status-chip--active' : 'status-chip--running') : 'status-chip--idle'"
          >
            <span class="status-dot" aria-hidden="true"></span>
            {{ store.sdict.id ? (store.sdict.complete ? '已学完' : '学习中') : '未开始' }}
          </span>
        </div>

        <template v-if="store.sdict.id">
          <div class="mt-3 space-y-2">
            <div class="text-sm flex justify-between">
              <span v-if="unitModeActive">
                按单元学习 · {{ nextUnfinishedUnit ? `下一个未完成：${nextUnfinishedUnit.name}` : '全部单元已完成' }}
              </span>
              <span
                v-else
                v-opacity="store.sdict.id && store.sdict.lastLearnIndex < store.sdict.length"
              >
                {{ $t('estimated_completion') }}：{{
                  _getAccomplishDate(
                    store.sdict.words.length - store.sdict.lastLearnIndex,
                    store.sdict.perDayStudyNumber
                  )
                }}
              </span>
            </div>
            <m-progress
              class="dash-progress"
              variant="linear"
              shape="wavy"
              thickness="8"
              :value="overallUnitProgress.percent"
              max="100"
            ></m-progress>

            <div class="text-sm flex justify-between">
              <span>{{ progressTextLeft }}</span>
              <span> {{ overallUnitProgress.learned }} / {{ overallUnitProgress.total }} 词</span>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
              <div class="stat2">
                <div class="num">{{ masteredCount }}</div>
                <div class="txt">已掌握</div>
                <div class="tile-track" role="presentation">
                  <div class="tile-fill" :style="{ width: masteredPercent + '%' }"></div>
                </div>
              </div>
              <div class="stat2">
                <div class="num">{{ dueReviewTotal }}</div>
                <div class="txt">待复习</div>
              </div>
              <div class="stat2">
                <div class="num">{{ remainingNew }}</div>
                <div class="txt">剩余新词</div>
              </div>
              <div class="stat2">
                <div class="num">{{ store.sdict.length }}</div>
                <div class="txt">总词数</div>
              </div>
            </div>
          </div>
          <div class="flex items-center mt-3 gap-3 flex-wrap">
            <s-button type="filled-tonal" @click="router.push('/dict-list')">
              <div class="center gap-1">
                <IconFluentArrowSwap20Regular />
                <span>{{ $t('select_dict') }}</span>
              </div>
            </s-button>
            <s-button type="text" @click="nav('/dict-units/' + store.sdict.id)">
              <div class="center gap-1">
                <IconFluentSlideTextTitleEdit20Regular />
                <span>单元管理</span>
              </div>
            </s-button>
          </div>
        </template>

        <div class="flex flex-col items-start gap-4 my-auto pt-6" v-else>
          <div class="title">{{ $t('select_dict_to_start') }}</div>
          <s-button id="step1" type="filled" @click="router.push('/dict-list')">
            <div class="center gap-1">
              <IconFluentAdd16Regular />
              <span>{{ $t('select_dict') }}</span>
            </div>
          </s-button>
        </div>
      </div>
      </div>

      <!-- 今日任务卡 -->
      <div class="dash-card flex flex-col" :class="!store.sdict.id && 'opacity-40 cursor-not-allowed'">
        <div class="flex justify-between">
          <div class="flex items-center gap-2">
            <div class="p-2 center rounded-full bg-[var(--md-sys-color-tertiary-container)]">
              <IconFluentStar20Filled class="text-lg color-[var(--md-sys-color-on-tertiary-container)]" />
            </div>
            <div class="text-xl font-bold">
              {{ isSaveData ? $t('last_task') : $t('today_task') }}
            </div>
            <span class="color-link cursor-pointer" v-if="store.sdict.id" @click="showPracticeWordListDialog = true">{{
              $t('word_list')
            }}</span>
            <!--            <span class="color-link cursor-pointer ml-2" @click="nav('/practice-flow-editor', {})">流程编排</span>-->
          </div>
          <div class="flex gap-1 items-center" v-if="store.sdict.id">
            {{ $t('daily_goal') }}
            <div
              class="bg-[var(--md-sys-color-primary-container)] color-[var(--md-sys-color-on-primary-container)] px-3 h-10 flex center text-2xl rounded-full"
            >
              {{ store.sdict.id ? store.sdict.perDayStudyNumber : 0 }}
            </div>
            {{ $t('words_count') }}
            <PopConfirm
              :disabled="!isSaveData"
              title="当前存在未完成的学习任务，修改会重新生成学习任务，是否继续？"
              @confirm="check(() => (showPracticeSettingDialog = true))"
            >
              <s-button type="text">{{ $t('change') }}</s-button>
            </PopConfirm>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-3">
          <div class="stat">
            <div class="num">{{ practiceData?.taskWords?.new?.length }}</div>
            <div class="txt">{{ $t('new_words') }}</div>
          </div>
          <div class="stat">
            <div class="num flex items-center gap-2">
              {{ practiceData?.taskWords?.review?.length }}
              <Tooltip>
                <IconFluentQuestionCircle20Regular class="color-[var(--md-sys-color-outline)]" width="18" />
                <template #reference>
                  <div class="whitespace-pre-wrap">{{ reviewWordTip }}</div>
                </template>
              </Tooltip>
            </div>
            <div class="txt flex items-center gap-1">
              <span>{{ $t('review') }}</span>
              <span class="text-xs" v-if="!practiceData?.taskWords?.review?.length">（暂无到期词）</span>
            </div>
          </div>
        </div>
        <div class="row-card mt-3" v-if="!isSaveData && dueReviewCount === 0">
          <span class="row-label">没有到期复习词时</span>
          <span class="flex-1"></span>
          <span class="text-sm">加入随机复习</span>
          <Switch :model-value="settingStore.autoAddRandomReviewWhenNoDue" @change="toggleAutoAddRandomReview" />
        </div>
        <div class="flex items-end mt-auto pt-4 gap-4 btn-no-margin">
          <OptionButton
            :class="settingStore.wordPracticeMode !== WordPracticeMode.Free ? 'flex-1 orange-btn' : 'primary-btn'"
          >
            <BaseButton
              size="large"
              :type="settingStore.wordPracticeMode !== WordPracticeMode.Free ? 'orange' : 'primary'"
              :disabled="!store.sdict.id"
              :loading="loading"
              @click="systemPractice"
            >
              <div class="flex items-center gap-2">
                <span class="line-height-[2]">{{ systemPracticeText }}</span>
                <IconFluentArrowCircleRight16Regular class="text-xl" />
              </div>
            </BaseButton>
            <template #options>
              <BaseButton
                class="w-full"
                v-if="
                  settingStore.wordPracticeMode !== WordPracticeMode.System &&
                  settingStore.wordPracticeMode !== WordPracticeMode.Free
                "
                @click="startPractice(WordPracticeMode.System, true)"
              >
                {{ $t('smart_learning') }}
              </BaseButton>

              <BaseButton
                class="w-full"
                v-if="settingStore.wordPracticeMode !== WordPracticeMode.Review"
                :disabled="!practiceData?.taskWords?.review?.length"
                @click="startPractice(WordPracticeMode.Review, true)"
              >
                {{ $t('review') }}
              </BaseButton>
              <BaseButton
                class="w-full"
                v-if="settingStore.wordPracticeMode !== WordPracticeMode.Shuffle"
                :disabled="store.sdict.lastLearnIndex < 10 && !store.sdict.complete"
                @click="startPractice(WordPracticeMode.Shuffle, true)"
              >
                {{ $t('random_review') }}
              </BaseButton>
              <BaseButton
                class="w-full"
                v-if="settingStore.wordPracticeMode !== WordPracticeMode.ReviewWordsTest"
                :disabled="store.sdict.lastLearnIndex < 10 && !store.sdict.complete"
                @click="startPractice(WordPracticeMode.ReviewWordsTest, true)"
              >
                {{ $t('words') }}{{ $t('test') }}
              </BaseButton>
              <BaseButton
                class="w-full"
                v-if="settingStore.wordPracticeMode !== WordPracticeMode.ShuffleWordsTest"
                :disabled="store.sdict.lastLearnIndex < 10 && !store.sdict.complete"
                @click="startPractice(WordPracticeMode.ShuffleWordsTest, true)"
              >
                {{ $t('random_words_test') }}
              </BaseButton>
            </template>
          </OptionButton>

          <s-button
            :class="settingStore.wordPracticeMode === WordPracticeMode.Free ? 'flex-1' : ''"
            type="filled"
            :disabled="loading"
            @click="freePractice()"
          >
            <div class="flex items-center gap-2">
              <span>
                {{
                  settingStore.wordPracticeMode === WordPracticeMode.Free && isSaveData
                    ? $t('continue_free_practice')
                    : $t('free_practice')
                }}
              </span>
              <IconStreamlineColorPenDrawFlat class="text-xl" />
            </div>
          </s-button>
        </div>
      </div>

    <!-- 统计卡 -->
    <div class="dash-card flex flex-col">
      <div class="title">统计</div>
      <div class="grid grid-cols-2 gap-3 mt-3">
        <div class="stat">
          <div class="num">{{ todayTotalSpend }}</div>
          <div class="txt">{{ $t('today_study_time') }}</div>
        </div>
        <div class="stat">
          <div class="num">{{ streakDays }}</div>
          <div class="txt">连续天数</div>
        </div>
        <div class="stat">
          <div class="num">{{ totalDay }}</div>
          <div class="txt">{{ $t('total_study_days') }}</div>
        </div>
        <div class="stat">
          <div class="num">{{ totalSpend }}</div>
          <div class="txt">{{ $t('total_study_time') }}</div>
        </div>
      </div>
        <m-divider class="my-3"></m-divider>

        <!-- FlClash 式行式二级卡片：补充更多有效统计信息 -->
        <div class="space-y-2">
          <div class="row-card">
            <span class="row-label">{{ $t('daily_goal') }}</span>
            <span class="flex-1"></span>
            <span class="row-value">{{ store.sdict.perDayStudyNumber || 0 }} {{ $t('words_count') }} / 天</span>
          </div>
          <div class="row-card">
            <span class="row-label">记忆队列</span>
            <span class="flex-1"></span>
            <span class="row-value">待复习 {{ dueReviewTotal }} 词 · 剩余新词 {{ remainingNew }} 词</span>
          </div>
        </div>
    </div>

    <!-- 学习日历卡 -->
    <div class="dash-card flex flex-col items-center">
      <div class="title self-start">{{ $t('this_week_record') }}</div>
      <Calendar
        class="mt-3 w-full flex justify-center"
        :highlighted-dates="calendarHighlightDates"
        @select-date="onSelectCalendarDate"
      >
      </Calendar>

      <!-- 柱状图移入日历卡空白区，平衡双列高度 -->
      <div class="w-full mt-4">
        <div class="text-sm color-[var(--md-sys-color-on-surface-variant)] mb-2">近 7 日学习时长（分钟）</div>
        <div class="flex items-end gap-2 h-20">
          <Tooltip v-for="d in weeklySpend" :key="d.key" :title="`${d.label}：${d.minutes} 分钟`">
            <div class="flex-1 flex flex-col items-center gap-1 h-full">
              <div class="w-full flex-1 flex items-end justify-center">
                <div
                  class="w-2.5 rounded-full transition-all"
                  :class="d.ms ? 'bg-[var(--md-sys-color-primary)]' : 'bg-[var(--md-sys-color-surface-variant)]'"
                  :style="{ height: Math.max(d.height, 4) + '%' }"
                ></div>
              </div>
              <span class="text-xs color-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{{
                d.label
              }}</span>
            </div>
          </Tooltip>
        </div>
      </div>
    </div>

    <!-- 单元进度卡：FlClash 式行式二级卡片，跨双列 -->
    <div class="dash-card flex flex-col xl:col-span-2" v-if="store.sdict.id && currentUnits.length">
      <div class="flex justify-between items-center">
        <div class="title">单元进度</div>
        <div class="color-link cursor-pointer text-sm" @click="nav('/dict-units/' + store.sdict.id)">查看全部单元</div>
      </div>
      <div class="flex flex-col gap-2 mt-4">
        <div
          v-for="unit in currentUnits.slice(0, 8)"
          :key="unit.name"
          class="unit-row"
        >
          <span
            class="status-chip status-chip--mini"
            :class="
              getUnitProgress(store.sdict, unit).percent >= 100
                ? 'status-chip--active'
                : getUnitOffset(store.sdict, unit) > 0
                  ? 'status-chip--running'
                  : 'status-chip--idle'
            "
          >
            <span class="status-dot" aria-hidden="true"></span>
            {{
              getUnitProgress(store.sdict, unit).percent >= 100
                ? '已完成'
                : getUnitOffset(store.sdict, unit) > 0
                  ? '进行中'
                  : '未开始'
            }}
          </span>
          <span class="font-medium truncate max-w-40">{{ unit.name }}</span>
          <m-progress
            class="unit-progress"
            variant="linear"
            shape="wavy"
            thickness="6"
            :value="getUnitProgress(store.sdict, unit).percent"
            max="100"
          ></m-progress>
          <span class="text-xs color-[var(--md-sys-color-on-surface-variant)] tabular-nums shrink-0">
            {{ getUnitOffset(store.sdict, unit) }}/{{ unit.total }} 词
          </span>
          <div class="flex gap-2 shrink-0">
            <s-button type="filled-tonal" @click="beginUnitStudyFromHome(unit)">学习</s-button>
            <s-button type="text" @click="openUnitProgress(unit)">调整进度</s-button>
          </div>
        </div>
      </div>
    </div>

    <div class="dash-card flex flex-col xl:col-span-2">
      <div class="flex justify-between">
        <div class="title">{{ $t('my_dictionaries') }}</div>
        <div class="flex gap-4 items-center">
          <PopConfirm title="确认删除所有选中词典？" @confirm="handleBatchDel" v-if="selectIds.length">
            <BaseIcon class="del" :title="$t('delete')">
              <DeleteIcon />
            </BaseIcon>
          </PopConfirm>

          <div
            class="color-link cursor-pointer"
            v-if="store.word.bookList.length > 3"
            @click="
              () => {
                isManageDict = !isManageDict
                selectIds = []
              }
            "
          >
            {{ isManageDict ? $t('cancel') : $t('manage_dict') }}
          </div>
          <div class="color-link cursor-pointer" @click="nav('/import-words')">导入单词</div>
          <div class="color-link cursor-pointer" @click="nav('/dict', { isAdd: true })">
            {{ $t('create_personal_dict') }}
          </div>
        </div>
      </div>
      <div class="flex gap-4 flex-wrap mt-4">
        <Book
          :is-add="false"
          quantifier="词"
          :item="item"
          :checked="selectIds.includes(item.id)"
          @check="() => toggleSelect(item)"
          :show-checkbox="isManageDict && j >= 3"
          v-for="(item, j) in store.word.bookList"
          @click="goDictDetail(item)"
        />
        <Book :is-add="true" @click="router.push('/dict-list')" />
      </div>
    </div>

    <div class="dash-card flex flex-col overflow-hidden xl:col-span-2" v-loading="isFetching">
      <div class="flex justify-between">
        <div class="title">{{ $t('recommend') }}</div>
        <div class="flex gap-4 items-center">
          <div class="color-link cursor-pointer" @click="router.push('/dict-list')">{{ $t('more') }}</div>
        </div>
      </div>

      <div class="flex gap-4 flex-wrap mt-4 min-h-50">
        <Book
          :is-add="false"
          quantifier="词"
          :item="item as any"
          v-for="(item, j) in recommendDictList"
          @click="goDictDetail(item as any)"
        />
      </div>
    </div>
      </div>
    </ClientOnly>
  </BasePage>

  <PracticeSettingDialog
    :show-left-option="false"
    v-model="showPracticeSettingDialog"
    :onConfirm="savePracticeSetting"
  />

  <UnitProgressDialog v-model="showUnitProgressDialog" :unit="editingUnit" />

  <PracticeWordListDialog :data="practiceData?.taskWords" v-model="showPracticeWordListDialog" />

  <ShufflePracticeSettingDialog
    v-model="showShufflePracticeSettingDialog"
    :onConfirm="onShufflePracticeSettingOk"
    :wordPracticeMode="editingWordPracticeMode"
  />

  <Dialog v-model="showStudyDayDialog" :title="studyDayDialogTitle" :footer="false" :padding="true">
    <div
      v-if="!studyDayRecords.length && !(isStudyDayKeyToday(selectedStudyDateKey) && todayCacheMs > 0)"
      class="color-[var(--md-sys-color-on-surface-variant)] py-6 text-center"
    >
      当日无学习记录
    </div>
    <ul v-if="studyDayRecords.length" class="study-day-list max-h-70vh overflow-y-auto space-y-2">
      <li v-for="(row, idx) in studyDayRecords" :key="idx" class="row-card flex-col items-stretch gap-1">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ row.dictName }}</span>
          <span
            v-if="row.sessionRole && row.sessionRole !== 'single'"
            class="text-xs px-1.5 py-0.5 rounded-full"
            :class="{
              'bg-[var(--md-sys-color-success-container)] color-[var(--md-sys-color-on-success-container)]':
                row.sessionRole === 'start',
              'bg-[var(--md-sys-color-secondary-container)] color-[var(--md-sys-color-on-secondary-container)]':
                row.sessionRole === 'middle',
              'bg-[var(--md-sys-color-tertiary-container)] color-[var(--md-sys-color-on-tertiary-container)]':
                row.sessionRole === 'end',
            }"
          >
            {{ { start: '学习开始', middle: '学习中', end: '学习结束' }[row.sessionRole] }}
          </span>
        </div>
        <div class="text-sm color-[var(--md-sys-color-on-surface-variant)]">
          时长 {{ msToHourMinute(row.spend) }} · 新学 {{ row.new }} · 复习 {{ row.review }} · 错词 {{ row.wrong }}
          <template v-if="row.total"> · 共 {{ row.total }} 词</template>
        </div>
      </li>
    </ul>
  </Dialog>
</template>

<style scoped lang="scss">
/* ═══ M3E 仪表盘：网格布局 + 表面层级分层（全程无描边）═══
   层级：页面 surface → 卡片 container-low → 子卡/磁贴 container（背景色阶分层，不靠边框） */
.dash-root {
  /* Sober token 映射（穿透 shadow DOM） */
  --s-color-primary: var(--md-sys-color-primary);
  --s-color-on-primary: var(--md-sys-color-on-primary);
  --s-color-primary-container: var(--md-sys-color-primary-container);
  --s-color-on-primary-container: var(--md-sys-color-on-primary-container);
  --s-color-secondary: var(--md-sys-color-secondary);
  --s-color-on-secondary: var(--md-sys-color-on-secondary);
  --s-color-secondary-container: var(--md-sys-color-secondary-container);
  --s-color-on-secondary-container: var(--md-sys-color-on-secondary-container);
  --s-color-tertiary: var(--md-sys-color-tertiary);
  --s-color-on-tertiary: var(--md-sys-color-on-tertiary);
  --s-color-tertiary-container: var(--md-sys-color-tertiary-container);
  --s-color-on-tertiary-container: var(--md-sys-color-on-tertiary-container);
  --s-color-error: var(--md-sys-color-error);
  --s-color-on-error: var(--md-sys-color-on-error);
  --s-color-error-container: var(--md-sys-color-error-container);
  --s-color-on-error-container: var(--md-sys-color-on-error-container);
  --s-color-success: var(--md-sys-color-success);
  --s-color-on-success: var(--md-sys-color-on-success);
  --s-color-success-container: var(--md-sys-color-success-container);
  --s-color-on-success-container: var(--md-sys-color-on-success-container);
  --s-color-background: var(--md-sys-color-surface);
  --s-color-on-background: var(--md-sys-color-on-surface);
  --s-color-surface: var(--md-sys-color-surface);
  --s-color-on-surface: var(--md-sys-color-on-surface);
  --s-color-surface-variant: var(--md-sys-color-surface-variant);
  --s-color-on-surface-variant: var(--md-sys-color-on-surface-variant);
  --s-color-surface-container-lowest: var(--md-sys-color-surface-container-lowest);
  --s-color-surface-container-low: var(--md-sys-color-surface-container-low);
  --s-color-surface-container: var(--md-sys-color-surface-container);
  --s-color-surface-container-high: var(--md-sys-color-surface-container-high);
  --s-color-surface-container-highest: var(--md-sys-color-surface-container-highest);
  --s-color-outline: var(--md-sys-color-outline);
  --s-color-outline-variant: var(--md-sys-color-outline-variant);
  --s-color-inverse-surface: var(--md-sys-color-inverse-surface);
  --s-color-inverse-on-surface: var(--md-sys-color-inverse-on-surface);

  /* mtrl token 映射：m-progress / m-divider 等跟随项目 M3 明暗主题 */
  --mtrl-sys-color-primary: var(--md-sys-color-primary);
  --mtrl-sys-color-on-primary: var(--md-sys-color-on-primary);
  --mtrl-sys-color-primary-container: var(--md-sys-color-primary-container);
  --mtrl-sys-color-on-primary-container: var(--md-sys-color-on-primary-container);
  --mtrl-sys-color-secondary: var(--md-sys-color-secondary);
  --mtrl-sys-color-on-secondary: var(--md-sys-color-on-secondary);
  --mtrl-sys-color-secondary-container: var(--md-sys-color-secondary-container);
  --mtrl-sys-color-on-secondary-container: var(--md-sys-color-on-secondary-container);
  --mtrl-sys-color-tertiary: var(--md-sys-color-tertiary);
  --mtrl-sys-color-on-tertiary: var(--md-sys-color-on-tertiary);
  --mtrl-sys-color-tertiary-container: var(--md-sys-color-tertiary-container);
  --mtrl-sys-color-on-tertiary-container: var(--md-sys-color-on-tertiary-container);
  --mtrl-sys-color-error: var(--md-sys-color-error);
  --mtrl-sys-color-on-error: var(--md-sys-color-on-error);
  --mtrl-sys-color-error-container: var(--md-sys-color-error-container);
  --mtrl-sys-color-success: var(--md-sys-color-success);
  --mtrl-sys-color-on-success: var(--md-sys-color-on-success);
  --mtrl-sys-color-surface: var(--md-sys-color-surface);
  --mtrl-sys-color-on-surface: var(--md-sys-color-on-surface);
  --mtrl-sys-color-surface-variant: var(--md-sys-color-surface-variant);
  --mtrl-sys-color-on-surface-variant: var(--md-sys-color-on-surface-variant);
  --mtrl-sys-color-surface-container-lowest: var(--md-sys-color-surface-container-lowest);
  --mtrl-sys-color-surface-container-low: var(--md-sys-color-surface-container-low);
  --mtrl-sys-color-surface-container: var(--md-sys-color-surface-container);
  --mtrl-sys-color-surface-container-high: var(--md-sys-color-surface-container-high);
  --mtrl-sys-color-surface-container-highest: var(--md-sys-color-surface-container-highest);
  --mtrl-sys-color-outline: var(--md-sys-color-outline);
  --mtrl-sys-color-outline-variant: var(--md-sys-color-outline-variant);
  --mtrl-sys-color-inverse-surface: var(--md-sys-color-inverse-surface);
  --mtrl-sys-color-inverse-on-surface: var(--md-sys-color-inverse-on-surface);
}

.dash-card {
  @apply box-border relative p-5;
  border-radius: var(--md-sys-shape-xl);
  background: var(--md-sys-color-surface-container-low);
  box-shadow: var(--md-sys-elevation-1);
  color: var(--md-sys-color-on-surface);
}

/* ═══ 状态指示器（绿点徽章，参考 FlClash）═══ */
.status-chip {
  @apply inline-flex items-center gap-2 shrink-0 text-sm font-medium px-3 py-1 rounded-full;
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface-variant);

  .status-dot {
    @apply w-2 h-2 rounded-full shrink-0;
    background: var(--md-sys-color-outline);
  }

  /* 运行中：主色容器 */
  &--running {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);

    .status-dot {
      background: var(--md-sys-color-primary);
      animation: status-pulse 2s ease-in-out infinite;
    }
  }

  /* 已完成：成功色容器 */
  &--active {
    background: var(--md-sys-color-success-container);
    color: var(--md-sys-color-on-success-container);

    .status-dot {
      background: var(--md-sys-color-success);
      animation: status-pulse 2s ease-in-out infinite;
    }
  }

  /* 未开始：中性 */
  &--idle {
    background: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface-variant);
  }

  &--mini {
    @apply text-xs px-2 py-0.5 gap-1.5;

    .status-dot {
      @apply w-1.5 h-1.5;
    }
  }
}

@keyframes status-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 35%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 0%, transparent);
  }
}

/* ═══ KPI 磁贴：大数字 + 弱色标签，背景色阶分层无边框 ═══ */
.stat {
  @apply box-border flex flex-col items-start justify-center gap-0.5 p-3;
  border-radius: var(--md-sys-shape-lg);
  background: var(--md-sys-color-surface-container);

  .num {
    @apply text-2xl font-medium tabular-nums;
    color: var(--md-sys-color-primary);
  }

  .txt {
    @apply text-sm;
    color: var(--md-sys-color-on-surface-variant);
  }
}

.stat2 {
  @extend .stat;
  @apply p-3;

  .num {
    @apply text-xl break-keep;
  }
}

/* 磁贴内微型进度条 */
.tile-track {
  @apply w-full h-1.5 rounded-full overflow-hidden mt-1;
  background: var(--md-sys-color-surface-container-highest);

  .tile-fill {
    @apply h-full rounded-full transition-all duration-500;
    background: var(--md-sys-color-success);
  }
}

/* ═══ FlClash 式行式二级子卡：全宽圆角条，左标签右数值 ═══ */
.row-card {
  @apply box-border flex items-center gap-3 px-4 py-2.5 text-sm;
  border-radius: var(--md-sys-shape-md);
  background: var(--md-sys-color-surface-container);

  .row-label {
    color: var(--md-sys-color-on-surface-variant);
  }

  .row-value {
    @apply font-medium tabular-nums;
  }
}

/* 单元进度行子卡 */
.unit-row {
  @apply box-border flex items-center flex-wrap gap-x-3 gap-y-2 px-4 py-2.5;
  border-radius: var(--md-sys-shape-md);
  background: var(--md-sys-color-surface-container);

  m-progress.unit-progress {
    @apply flex-1 min-w-40;
  }
}

/* ═══ mtrl 组件适配 ═══ */
m-progress {
  display: block;
}

.dash-progress {
  @apply w-full;
}

m-divider {
  --mtrl-divider-color: var(--md-sys-color-outline-variant);
}

/* ═══ ClientOnly 骨架屏（fallback，仅用语义 token）═══ */
.dashboard-skeleton {
  @apply flex flex-col gap-6;
}

.skeleton-block {
  @apply box-border relative overflow-hidden;
  height: 13rem;
  border-radius: var(--md-sys-shape-xl);
  background: var(--md-sys-color-surface-container-low);

  &::after {
    content: '';
    @apply absolute inset-0;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--md-sys-color-on-surface) 6%, transparent),
      transparent
    );
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }

  &:nth-child(2) {
    height: 11rem;
  }

  &:nth-child(3) {
    height: 9rem;
  }
}

@keyframes skeleton-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
</style>
