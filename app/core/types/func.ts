import type { Article, ArticleWord, Dict, Sentence, Word } from './types'
import { shallowReactive } from 'vue'
import { cloneDeep } from '../utils'
import { nanoid } from 'nanoid'
import { DictType, PracticeArticleWordType } from './enum'

export function getDefaultWord(val: Partial<Word> = {}): Word {
  return {
    custom: false,
    id: nanoid(6),
    word: '',
    phonetic0: '',
    phonetic1: '',
    trans: [],
    sentences: [],
    phrases: [],
    synos: [],
    relWords: {
      root: '',
      rels: [],
    },
    etymology: [],
    ...val,
  }
}

export function getDefaultArticleWord(val: Partial<ArticleWord> = {}): ArticleWord {
  return getDefaultWord({
    nextSpace: true,
    symbolPosition: '',
    input: '',
    type: PracticeArticleWordType.Word,
    ...val,
  }) as ArticleWord
}

export function getDefaultArticle(val: Partial<Article> = {}): Article {
  return {
    id: nanoid(6),
    title: '',
    titleTranslate: '',
    text: '',
    textTranslate: '',
    newWords: [],
    sections: [],
    audioSrc: '',
    audioFileId: '',
    lrcPosition: [],
    questions: [],
    nameList: [],
    ...cloneDeep(val),
  }
}

export function getDefaultDict(val: Partial<Dict> = {}): Dict {
  return {
    id: '',
    name: '',
    description: '',
    url: '',
    length: 0,
    category: '',
    tags: [],
    translateLanguage: '',
    type: DictType.word,
    language: 'en',
    lastLearnIndex: 0,
    perDayStudyNumber: 20,
    custom: false,
    system: false,
    sourceId: '',
    complete: false,
    studyMode: 'book',
    activeUnit: undefined,
    //占位键：checkRiskKey 按默认键名拷贝存档字段，缺了会导致加载时丢失单元数据
    unitWordKeys: undefined,
    unitOffsets: undefined,
    unitProgressInitialized: undefined,
    /** 单元标识是否已升级为名字制；旧数字制存档的 unitWordKeys 不做重放（视为无效数据） */
    unitNameSchema: undefined,

    createdBy: '',
    enName: '',
    category_id: null,
    is_default: false,
    update: false,
    cover: '',
    sync: false,

    ...val,
    words: shallowReactive(val.words ?? []),
    articles: shallowReactive(val.articles ?? []),
    statistics: shallowReactive(val.statistics ?? []),
  }
}
export function getDefaultSentence(val?: Partial<Sentence>): Sentence {
  return {
    text: '',
    translate: '',
    words: [],
    audioPosition: [],
    ...val,
  }
}
