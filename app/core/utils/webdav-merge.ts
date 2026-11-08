import type { Article, Dict, SaveData, Statistics, Word } from '../types'
import type { BaseState } from '../stores'

/**
 * WebDAV 快照合并（纯函数）。
 *
 * 约束（见 `.dsh/webdav-sync-contract.md` 第 4、5 节）：
 * - 入参 / 出参都是普通 JSON 对象，不依赖 Pinia、Vue 响应式或浏览器 API；
 * - 本地优先，远端只补缺 / 补新：任何情况下都不会出现「本地数据被远端整体覆盖」；
 * - 输入对象不会被原地修改（内部全部深拷贝）。
 */

/** 远端 `{root}/{directory}/data.json` 的结构 */
export interface WebDavSnapshot {
  meta: {
    schema: 1
    app: 'typewords'
    updatedAt: string
  }
  data: {
    dict?: SaveData | null
    setting?: SaveData | null
    practiceWord?: SaveData | null
    practiceArticle?: SaveData | null
  }
}

export interface MergeStats {
  remoteOnlyDicts: number
  mergedDicts: number
  addedWords: number
  addedArticles: number
  addedStatistics: number
  addedFsrs: number
}

type DictListKind = 'word' | 'article'
type JsonObject = Record<string, any>

/** 系统虚拟词典：身份只认 id，不参与 custom / sourceId 分类 */
const SYSTEM_DICT_IDS = ['wordCollect', 'wordWrong', 'wordKnown', 'articleCollect']

/** Word 中需要特殊合并的字段 */
const WORD_UNION_FIELDS = ['trans', 'sentences', 'phrases', 'etymology'] as const
const WORD_SPECIAL_FIELDS = new Set<string>([...WORD_UNION_FIELDS, 'synos', 'relWords', 'unit'])

/**
 * 词典资源描述字段：本地为空 / 未定义时用远端。
 * `length` 有更具体的 max 规则，不放在这里。
 */
const DICT_RESOURCE_FIELDS = [
  'name',
  'enName',
  'description',
  'url',
  'cover',
  'category',
  'tags',
  'translateLanguage',
  'language',
  'createdBy',
  'category_id',
  'is_default',
  'update',
  'sync',
  'userDictId',
  'sourceId',
  'custom',
  'system',
  'type',
  'version',
] as const

/** BaseState 顶层已单独处理的字段，其余未知字段按「本地优先、缺失取远端」补齐 */
const BASE_STATE_HANDLED_FIELDS = new Set([
  'simpleWords',
  'load',
  'word',
  'article',
  'dictListVersion',
  'fsrsData',
  'noteData',
  '_ignoreWatch',
])

function isObjectLike(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

/** 纯 JSON 深拷贝；undefined / 基本类型原样返回 */
function cloneJson<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

/** 视为「空」的取值：缺省、空串、空数组（空对象不算） */
function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function toRecord<T>(value: unknown): Record<string, T> {
  return isObjectLike(value) ? (value as Record<string, T>) : {}
}

function toStringArray(value: unknown): string[] {
  return toArray<unknown>(value).filter((item): item is string => typeof item === 'string')
}

function countNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text
  } catch {
    return String(value)
  }
}

/** 解析时间戳：支持 ISO 字符串 / 毫秒数 / Date；无法解析返回 null */
function parseTime(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const time = Date.parse(String(value))
  return Number.isNaN(time) ? null : time
}

/** 字符串数组并集（保持原顺序、按字符串值去重） */
function unionStrings(base: unknown, extra: unknown): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of [...toStringArray(base), ...toStringArray(extra)]) {
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

/** 数组并集：先本地元素，再追加远端 JSON.stringify 未出现过的元素 */
function unionByJson<T>(base: unknown, extra: unknown): T[] {
  const result = toArray<T>(base).map(item => cloneJson(item))
  const seen = new Set(result.map(item => safeJson(item)))
  for (const item of toArray<T>(extra)) {
    const key = safeJson(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cloneJson(item))
  }
  return result
}

/* ------------------------------ 身份 key ------------------------------ */

/** 词典身份 key（契约 5.1，顺序不能改） */
function dictKey(dict: Dict | JsonObject | null | undefined): string {
  const id = String(dict?.id ?? '')
  if (SYSTEM_DICT_IDS.includes(id)) return `system:${id}`
  if (dict?.custom) return `custom:${id || dict?.enName || dict?.name}`
  if (dict?.sourceId) return `official:${dict.sourceId}`
  return `dict:${id || dict?.enName || dict?.name || dict?.url}`
}

/**
 * 单词身份 key：以单词内容为准，空单词才退化为 id。
 * 单词 id 是 nanoid，两台设备各自收藏同一个词时 id 不同，按 id 会重复。
 */
function wordKey(word: Word | JsonObject | null | undefined): string {
  const text = String(word?.word ?? '').trim()
  if (text) return `w:${text.toLowerCase()}`
  return `id:${String(word?.id ?? '')}`
}

/** 文章身份 key：以标题为准，空标题才退化为 id（原因同 wordKey） */
function articleKey(article: Article | JsonObject | null | undefined): string {
  const title = String(article?.title ?? '').trim()
  if (title) return `t:${title}`
  return `id:${String(article?.id ?? '')}`
}

/** 学习记录身份 key（契约 5.5） */
function statisticsKey(statistics: Statistics | JsonObject | null | undefined): string {
  return [
    statistics?.startDate,
    statistics?.sessionRole ?? 'single',
    statistics?.title ?? '',
    statistics?.total,
    statistics?.new,
    statistics?.review,
    statistics?.wrong,
    statistics?.spend,
  ].join('|')
}

function synoKey(syno: JsonObject | null | undefined): string {
  return `${String(syno?.pos ?? '')}\u0000${String(syno?.cn ?? '')}`
}

/* ------------------------------ 单词 / 文章 ------------------------------ */

/** `synos`：按 pos + cn 合并，ws 取并集 */
function mergeSynos(localSynos: unknown, remoteSynos: unknown): JsonObject[] {
  const result = toArray<JsonObject>(localSynos).map(item => cloneJson(item))
  const index = new Map<string, number>()
  result.forEach((syno, position) => {
    const key = synoKey(syno)
    if (!index.has(key)) index.set(key, position)
  })

  for (const remoteSyno of toArray<JsonObject>(remoteSynos)) {
    const key = synoKey(remoteSyno)
    const position = index.get(key)
    if (position === undefined) {
      result.push(cloneJson(remoteSyno))
      index.set(key, result.length - 1)
      continue
    }
    const target = result[position]
    target.ws = unionStrings(target.ws, remoteSyno?.ws)
    for (const field of Object.keys(remoteSyno ?? {})) {
      if (field === 'ws') continue
      if (isEmptyValue(target[field])) target[field] = cloneJson(remoteSyno[field])
    }
  }
  return result
}

/** `relWords`：root 本地优先；rels 按 pos 合并，words 取并集 */
function mergeRelWords(localRelWords: unknown, remoteRelWords: unknown): JsonObject {
  const merged = cloneJson(isObjectLike(localRelWords) ? localRelWords : ((remoteRelWords as JsonObject) ?? {}))
  const localRoot = (localRelWords as JsonObject | undefined)?.root
  merged.root = !isEmptyValue(localRoot) ? localRoot : ((remoteRelWords as JsonObject | undefined)?.root ?? '')

  const result = toArray<JsonObject>((localRelWords as JsonObject | undefined)?.rels).map(item => cloneJson(item))
  const index = new Map<string, number>()
  result.forEach((rel, position) => {
    const key = String(rel?.pos ?? '')
    if (!index.has(key)) index.set(key, position)
  })

  for (const remoteRel of toArray<JsonObject>((remoteRelWords as JsonObject | undefined)?.rels)) {
    const key = String(remoteRel?.pos ?? '')
    const position = index.get(key)
    if (position === undefined) {
      result.push(cloneJson(remoteRel))
      index.set(key, result.length - 1)
      continue
    }
    const target = result[position]
    target.words = unionByJson(target.words, remoteRel?.words)
    for (const field of Object.keys(remoteRel ?? {})) {
      if (field === 'words') continue
      if (isEmptyValue(target[field])) target[field] = cloneJson(remoteRel[field])
    }
  }

  merged.rels = result
  return merged
}

/** 同 key 单词深填充：字段级本地优先补缺（契约 5.3） */
function deepFillWord(localWord: JsonObject, remoteWord: JsonObject): Word {
  const merged = cloneJson(localWord)
  const remote = remoteWord ?? {}

  for (const field of Object.keys(remote)) {
    if (WORD_SPECIAL_FIELDS.has(field)) continue
    if (isEmptyValue(merged[field])) merged[field] = cloneJson(remote[field])
  }

  for (const field of WORD_UNION_FIELDS) {
    merged[field] = unionByJson(merged[field], remote[field])
  }
  merged.synos = mergeSynos(merged.synos, remote.synos)
  merged.relWords = mergeRelWords(merged.relWords, remote.relWords)
  // unit：本地优先
  if (isEmptyValue(merged.unit) && !isEmptyValue(remote.unit)) merged.unit = cloneJson(remote.unit)

  return merged as Word
}

/** 单词并集：本地顺序 + 远端新增（契约 5.3） */
function mergeWordLists(localWords: unknown, remoteWords: unknown, stats: MergeStats): Word[] {
  const result = toArray<JsonObject>(localWords).map(word => cloneJson(word))
  const index = new Map<string, number>()
  result.forEach((word, position) => {
    const key = wordKey(word)
    if (!index.has(key)) index.set(key, position)
  })

  for (const remoteWord of toArray<JsonObject>(remoteWords)) {
    const key = wordKey(remoteWord)
    const position = index.get(key)
    if (position === undefined) {
      result.push(cloneJson(remoteWord))
      index.set(key, result.length - 1)
      stats.addedWords++
      continue
    }
    result[position] = deepFillWord(result[position], remoteWord) as JsonObject
  }

  return result as Word[]
}

/** 同 key 文章深填充：字段级本地优先补缺（契约 5.4） */
function deepFillArticle(localArticle: JsonObject, remoteArticle: JsonObject, stats: MergeStats): Article {
  const merged = cloneJson(localArticle)
  const remote = remoteArticle ?? {}

  for (const field of Object.keys(remote)) {
    if (field === 'newWords' || field === 'sections') continue
    if (isEmptyValue(merged[field])) merged[field] = cloneJson(remote[field])
  }

  merged.newWords = mergeWordLists(merged.newWords, remote.newWords, stats)
  // sections 运行时再生，取本地（本地没有时才退回远端）
  if (!Array.isArray(merged.sections)) merged.sections = cloneJson(toArray(remote.sections))

  return merged as Article
}

/** 文章并集：本地顺序 + 远端新增（契约 5.4） */
function mergeArticleLists(localArticles: unknown, remoteArticles: unknown, stats: MergeStats): Article[] {
  const result = toArray<JsonObject>(localArticles).map(article => cloneJson(article))
  const index = new Map<string, number>()
  result.forEach((article, position) => {
    const key = articleKey(article)
    if (!index.has(key)) index.set(key, position)
  })

  for (const remoteArticle of toArray<JsonObject>(remoteArticles)) {
    const key = articleKey(remoteArticle)
    const position = index.get(key)
    if (position === undefined) {
      result.push(cloneJson(remoteArticle))
      index.set(key, result.length - 1)
      stats.addedArticles++
      continue
    }
    result[position] = deepFillArticle(result[position], remoteArticle, stats) as JsonObject
  }

  return result as Article[]
}

/** 学习记录并集（契约 5.5） */
function mergeStatistics(localStatistics: unknown, remoteStatistics: unknown, stats: MergeStats): Statistics[] {
  const result = toArray<JsonObject>(localStatistics).map(item => cloneJson(item))
  const seen = new Set(result.map(item => statisticsKey(item)))

  for (const remoteItem of toArray<JsonObject>(remoteStatistics)) {
    const key = statisticsKey(remoteItem)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cloneJson(remoteItem))
    stats.addedStatistics++
  }

  return result as Statistics[]
}

/* ------------------------------ 词典 ------------------------------ */

/** unitOffsets：每个 unit key 取 max */
function mergeNumberMaxRecord(localValue: unknown, remoteValue: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(toRecord<unknown>(localValue))) {
    result[key] = countNumber(value)
  }
  for (const [key, value] of Object.entries(toRecord<unknown>(remoteValue))) {
    const remoteNumber = countNumber(value)
    result[key] = hasOwn(result, key) ? Math.max(result[key], remoteNumber) : remoteNumber
  }
  return result
}

/** unitWordKeys：每个 unit 名字取单词数组并集（保持顺序、去重） */
function mergeUnitWordKeys(localValue: unknown, remoteValue: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(toRecord<unknown>(localValue))) {
    result[key] = unionStrings(value, [])
  }
  for (const [key, value] of Object.entries(toRecord<unknown>(remoteValue))) {
    result[key] = unionStrings(hasOwn(result, key) ? result[key] : [], value)
  }
  return result
}

/** 临时每日目标：日期字符串更大的生效；同日期本地优先 */
function mergeTempDailyGoal(merged: JsonObject, localDict: JsonObject, remoteDict: JsonObject): void {
  const localDate = typeof localDict?.tempPerDayDate === 'string' ? localDict.tempPerDayDate.trim() : ''
  const remoteDate = typeof remoteDict?.tempPerDayDate === 'string' ? remoteDict.tempPerDayDate.trim() : ''

  if (remoteDate && (!localDate || remoteDate > localDate)) {
    merged.tempPerDayDate = remoteDate
    merged.tempPerDayNumber = cloneJson(remoteDict?.tempPerDayNumber)
    return
  }
  if (localDate) {
    merged.tempPerDayDate = localDate
    merged.tempPerDayNumber = cloneJson(localDict?.tempPerDayNumber)
  }
}

/** 同 key 词典合并（契约 5.2，顺序很重要：本地优先） */
function mergeDict(localDict: JsonObject, remoteDict: JsonObject, kind: DictListKind, stats: MergeStats): Dict {
  const merged = cloneJson(localDict ?? {})
  const remote = remoteDict ?? {}

  // 进度 / 完成 / 单元
  merged.lastLearnIndex = Math.max(countNumber(localDict?.lastLearnIndex), countNumber(remote.lastLearnIndex))
  merged.length = Math.max(countNumber(localDict?.length), countNumber(remote.length))
  merged.complete = !!(localDict?.complete || remote.complete)
  merged.unitProgressInitialized = !!(localDict?.unitProgressInitialized || remote.unitProgressInitialized)
  merged.unitNameSchema = !!(localDict?.unitNameSchema || remote.unitNameSchema)
  if (isObjectLike(localDict?.unitOffsets) || isObjectLike(remote.unitOffsets)) {
    merged.unitOffsets = mergeNumberMaxRecord(localDict?.unitOffsets, remote.unitOffsets)
  }
  if (isObjectLike(localDict?.unitWordKeys) || isObjectLike(remote.unitWordKeys)) {
    merged.unitWordKeys = mergeUnitWordKeys(localDict?.unitWordKeys, remote.unitWordKeys)
  }

  // 每日学习数量：本地为 0 / 空时取远端
  const localPerDay = countNumber(localDict?.perDayStudyNumber)
  merged.perDayStudyNumber = localPerDay > 0 ? localPerDay : countNumber(remote.perDayStudyNumber)

  // 学习模式 / 当前单元：本地有值用本地
  merged.studyMode = !isEmptyValue(localDict?.studyMode) ? localDict.studyMode : cloneJson(remote.studyMode)
  merged.activeUnit = !isEmptyValue(localDict?.activeUnit) ? localDict.activeUnit : cloneJson(remote.activeUnit)
  mergeTempDailyGoal(merged, localDict ?? {}, remote)

  // 词条 / 文章 / 学习记录
  if (kind === 'word') {
    merged.words = mergeWordLists(localDict?.words, remote.words, stats)
  } else {
    merged.articles = mergeArticleLists(localDict?.articles, remote.articles, stats)
  }
  merged.statistics = mergeStatistics(localDict?.statistics, remote.statistics, stats)

  // 资源描述字段：本地为空 / 未定义时用远端
  for (const field of DICT_RESOURCE_FIELDS) {
    if (isEmptyValue(merged[field])) merged[field] = cloneJson(remote[field])
  }

  // 其它未知字段：本地优先，缺失时用远端
  for (const field of Object.keys(remote)) {
    if (hasOwn(merged, field) && merged[field] !== undefined) continue
    merged[field] = cloneJson(remote[field])
  }

  return merged as Dict
}

/** 词典列表并集：本地顺序 + 远端独有（契约 5.2） */
function mergeDictLists(kind: DictListKind, localList: unknown, remoteList: unknown, stats: MergeStats): Dict[] {
  const result = toArray<JsonObject>(localList).map(item => cloneJson(item))
  const index = new Map<string, number>()
  result.forEach((dict, position) => {
    const key = dictKey(dict)
    if (!index.has(key)) index.set(key, position)
  })

  for (const remoteDict of toArray<JsonObject>(remoteList)) {
    const key = dictKey(remoteDict)
    const position = index.get(key)
    if (position === undefined) {
      result.push(cloneJson(remoteDict))
      index.set(key, result.length - 1)
      stats.remoteOnlyDicts++
      continue
    }
    result[position] = mergeDict(result[position], remoteDict, kind, stats) as JsonObject
    stats.mergedDicts++
  }

  return result as Dict[]
}

/* ------------------------------ BaseState ------------------------------ */

/** fsrs 卡片时间：last_review 优先，无则 due */
function cardTime(card: JsonObject | null | undefined): number {
  const lastReview = parseTime(card?.last_review)
  if (lastReview !== null) return lastReview
  return parseTime(card?.due) ?? 0
}

/** fsrsData 并集：同词取更晚的卡片，相等取本地（契约 5.6） */
function mergeFsrsData(localValue: unknown, remoteValue: unknown, stats: MergeStats): JsonObject {
  const result: JsonObject = {}
  for (const [word, card] of Object.entries(toRecord<JsonObject>(localValue))) {
    result[word] = cloneJson(card)
  }
  for (const [word, remoteCard] of Object.entries(toRecord<JsonObject>(remoteValue))) {
    if (!hasOwn(result, word) || result[word] === undefined) {
      result[word] = cloneJson(remoteCard)
      stats.addedFsrs++
      continue
    }
    if (cardTime(remoteCard) > cardTime(result[word])) {
      result[word] = cloneJson(remoteCard)
    }
  }
  return result
}

/** noteData：同词本地非空用本地，否则远端 */
function mergeNoteData(localValue: unknown, remoteValue: unknown): JsonObject {
  const result: JsonObject = {}
  for (const [word, note] of Object.entries(toRecord<unknown>(localValue))) {
    result[word] = cloneJson(note)
  }
  for (const [word, remoteNote] of Object.entries(toRecord<unknown>(remoteValue))) {
    if (isEmptyValue(result[word])) result[word] = cloneJson(remoteNote)
  }
  return result
}

/** 词典数据按之前约定的规则合并（契约 5.2 ~ 5.6） */
function mergeBaseState(localState: unknown, remoteState: unknown, stats: MergeStats): BaseState {
  if (!isObjectLike(localState)) {
    const cloned = cloneJson((remoteState as BaseState) ?? ({} as BaseState))
    if (isObjectLike(cloned)) {
      // 本地没有状态时按「新设备」处理：load 保持 false，且屏蔽 watch
      cloned.load = false
      cloned._ignoreWatch = false
    }
    return cloned
  }
  if (!isObjectLike(remoteState)) {
    const cloned = cloneJson(localState as BaseState)
    if (isObjectLike(cloned)) cloned._ignoreWatch = false
    return cloned
  }

  const merged = cloneJson(localState)
  const localWord = isObjectLike(merged.word) ? merged.word : {}
  const remoteWord = isObjectLike(remoteState.word) ? remoteState.word : {}

  merged.word = {
    ...cloneJson(localWord),
    // 当前词典用本地，不能让合并改掉用户正在学的词典
    studyIndex: typeof localWord.studyIndex === 'number' ? localWord.studyIndex : (remoteWord.studyIndex ?? -1),
    bookList: mergeDictLists('word', localWord.bookList, remoteWord.bookList, stats),
  }
  const localArticle = isObjectLike(merged.article) ? merged.article : {}
  const remoteArticle = isObjectLike(remoteState.article) ? remoteState.article : {}
  merged.article = {
    ...cloneJson(localArticle),
    studyIndex:
      typeof localArticle.studyIndex === 'number' ? localArticle.studyIndex : (remoteArticle.studyIndex ?? -1),
    bookList: mergeDictLists('article', localArticle.bookList, remoteArticle.bookList, stats),
  }

  merged.simpleWords = unionStrings(merged.simpleWords, remoteState.simpleWords)
  merged.dictListVersion = Math.max(countNumber(merged.dictListVersion), countNumber(remoteState.dictListVersion))
  merged.fsrsData = mergeFsrsData(merged.fsrsData, remoteState.fsrsData, stats)
  merged.noteData = mergeNoteData(merged.noteData, remoteState.noteData)
  // load 保留本地；_ignoreWatch 复位
  merged.load = !!localState.load
  merged._ignoreWatch = false

  // 其它未知字段：本地优先，缺失时用远端
  for (const field of Object.keys(remoteState)) {
    if (BASE_STATE_HANDLED_FIELDS.has(field)) continue
    if (hasOwn(merged, field) && merged[field] !== undefined) continue
    merged[field] = cloneJson(remoteState[field])
  }

  return merged as BaseState
}

/**
 * 与 `shakeCommonDict()` 等价：官方词典的词条不落盘，文章 sections 运行时再生。
 * 远端快照约定必须是 shake 过的数据（契约第 4 节），合并结果落盘前再兜一次底。
 */
function shakeSnapshotState(state: BaseState): BaseState {
  const wordBookList = toArray<Dict>((state as JsonObject)?.word?.bookList)
  for (const dict of wordBookList) {
    if (!dict) continue
    if (!dict.custom && !dict.system) dict.words = []
  }

  const articleBookList = toArray<Dict>((state as JsonObject)?.article?.bookList)
  for (const dict of articleBookList) {
    if (!dict) continue
    const articles = toArray<Article>(dict.articles)
    if (!dict.custom && !dict.system) {
      dict.articles = []
      continue
    }
    for (const article of articles) {
      if (article) article.sections = []
    }
  }
  return state
}

/* ------------------------------ SaveData ------------------------------ */

type PickedSaveData = { data: SaveData; fromRemote: boolean } | null

/** 按 SaveData.updated_at 做 last-write-wins；远端更晚才用远端 */
function pickNewerSaveData(localData: unknown, remoteData: unknown): PickedSaveData {
  const localValid = isObjectLike(localData)
  const remoteValid = isObjectLike(remoteData)
  if (!localValid && !remoteValid) return null
  if (!localValid) return { data: cloneJson(remoteData as SaveData), fromRemote: true }
  if (!remoteValid) return { data: cloneJson(localData as SaveData), fromRemote: false }

  const localTime = parseTime((localData as SaveData)?.updated_at)
  const remoteTime = parseTime((remoteData as SaveData)?.updated_at)
  const remoteNewer = remoteTime !== null && (localTime === null || remoteTime > localTime)

  return remoteNewer
    ? { data: cloneJson(remoteData as SaveData), fromRemote: true }
    : { data: cloneJson(localData as SaveData), fromRemote: false }
}

/** Setting：LWW；采用远端时仍强制 load = 本地.load、_ignoreWatch = false */
function mergeSettingSaveData(localData: unknown, remoteData: unknown): SaveData | null {
  const picked = pickNewerSaveData(localData, remoteData)
  if (!picked) return null

  const data = picked.data
  const localLoad =
    isObjectLike(localData) && isObjectLike((localData as SaveData).val) ? (localData as SaveData).val.load : undefined

  if (isObjectLike(data.val)) {
    if (picked.fromRemote) {
      data.val.load = typeof localLoad === 'boolean' ? localLoad : false
    }
    data.val._ignoreWatch = false
  }
  return data
}

/** dict：合并 BaseState；version 沿用本地（缺失时用远端） */
function mergeDictSaveData(localData: unknown, remoteData: unknown, stats: MergeStats): SaveData | null {
  const localVal = isObjectLike(localData) ? (localData as SaveData).val : undefined
  const remoteVal = isObjectLike(remoteData) ? (remoteData as SaveData).val : undefined
  if (!isObjectLike(localVal) && !isObjectLike(remoteVal)) {
    if (isObjectLike(localData)) return cloneJson(localData as SaveData)
    if (isObjectLike(remoteData)) return cloneJson(remoteData as SaveData)
    return null
  }

  const mergedVal = shakeSnapshotState(mergeBaseState(localVal, remoteVal, stats))
  const localVersion = isObjectLike(localData) ? (localData as SaveData).version : undefined
  const remoteVersion = isObjectLike(remoteData) ? (remoteData as SaveData).version : undefined
  const version =
    typeof localVersion === 'number' ? localVersion : typeof remoteVersion === 'number' ? remoteVersion : 0

  return { val: mergedVal, version, updated_at: undefined }
}

/* ------------------------------ 入口 ------------------------------ */

/**
 * 合并本地与远端快照。
 * `remote` 为 null（首次同步 / 远端文件不存在）时等价于「本地 + 空远端」。
 * 不修改入参；`meta.updatedAt` 与 `dict.updated_at` 刷新为当前时间，
 * LWW 的 `setting` / 练习缓存保留被选中一侧的原始 `updated_at`（否则永远同步不过去）。
 */
export function mergeSnapshots(
  local: WebDavSnapshot,
  remote: WebDavSnapshot | null
): { merged: WebDavSnapshot; stats: MergeStats } {
  const stats: MergeStats = {
    remoteOnlyDicts: 0,
    mergedDicts: 0,
    addedWords: 0,
    addedArticles: 0,
    addedStatistics: 0,
    addedFsrs: 0,
  }

  const localData: JsonObject = isObjectLike(local?.data) ? (local.data as JsonObject) : {}
  const remoteSnapshot = isObjectLike(remote) && isObjectLike(remote?.data) ? remote : null
  const remoteData: JsonObject = remoteSnapshot ? (remoteSnapshot.data as JsonObject) : {}

  const dictData = mergeDictSaveData(localData.dict, remoteData.dict, stats)
  const settingData = mergeSettingSaveData(localData.setting, remoteData.setting)
  const practiceWord = pickNewerSaveData(localData.practiceWord, remoteData.practiceWord)?.data ?? null
  const practiceArticle = pickNewerSaveData(localData.practiceArticle, remoteData.practiceArticle)?.data ?? null

  const updatedAt = new Date().toISOString()
  const merged: WebDavSnapshot = {
    meta: { schema: 1, app: 'typewords', updatedAt },
    data: {
      dict: dictData,
      setting: settingData,
      practiceWord,
      practiceArticle,
    },
  }

  // 只刷新 dict.updated_at：dict 是内容合并，不靠时间戳决策；
  // setting / practiceWord / practiceArticle 走 LWW，必须保留被选中一侧的原始时间戳，
  // 否则每次同步都刷成 now，另一台设备永远认为「本地更新」，设置永远同步不过去。
  if (merged.data.dict) merged.data.dict.updated_at = updatedAt

  return { merged, stats }
}
