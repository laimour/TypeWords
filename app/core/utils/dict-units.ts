import { shallowReactive } from 'vue'
import type { Dict, Word } from '@/core/types/types'

export interface DictUnit {
  /** 单元名（唯一标识，导入文本中同名标题自动合并为同一单元） */
  name: string
  /** 单元内第一个词在词典 words 中的下标（用于排序与整本游标换算） */
  start: number
  /** 单元内最后一个词下标 + 1 */
  end: number
  total: number
  words: Word[]
}

export interface UnitProgressInfo {
  total: number
  /** 已学词数（以 unitOffsets 为权威值） */
  learned: number
  /** 已掌握（忽略词 / 已有 FSRS 卡片）数量，仅用于展示 */
  mastered: number
  remaining: number
  percent: number
}

function clamp(val: number, min: number, max: number) {
  if (Number.isNaN(val)) return min
  return Math.max(min, Math.min(max, val))
}

function isUnitName(val: unknown): val is string {
  return typeof val === 'string' && !!val.trim()
}

function unitNameOf(word: Word): string | undefined {
  if (!isUnitName(word.unit)) return undefined
  return word.unit.trim()
}

/**
 * changeDict 用 shallowReactive 保存 words（元素非响应式，避免大词库性能问题），
 * 直接改写 w.unit 不会触发依赖更新；结构变更后需重新赋值 words 数组。
 */
export function notifyDictWordsChanged(dict: Dict) {
  const words = dict.words
  if (Array.isArray(words)) dict.words = shallowReactive(words.slice())
}

/**
 * 获取词典的单元列表。
 * 单元由名字标识，大小完全由实际归属到该单元的单词数量决定（动态），不做任何按词数的预切块；
 * 无任何单元归属时返回空数组（表示未划分单元）。
 */
export function getDictUnits(dict: Dict): DictUnit[] {
  const words = dict.words ?? []
  if (!words.length) return []

  const groups = new Map<string, number[]>()
  words.forEach((w, i) => {
    const name = unitNameOf(w)
    if (!name) return
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push(i)
  })
  if (!groups.size) return []

  return Array.from(groups.entries())
    .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
    .map(([name, indexes]) => {
      const start = Math.min(...indexes)
      const end = Math.max(...indexes) + 1
      return {
        name,
        start,
        end,
        total: indexes.length,
        words: indexes.map(i => words[i]),
      }
    })
}

/** 未分配到任何单元的单词 */
export function getUnassignedWords(dict: Dict): Word[] {
  return (dict.words ?? []).filter(w => !unitNameOf(w))
}

/** 默认单元名（保证不与现有单元重名） */
export function getNextUnitName(dict: Dict): string {
  const units = getDictUnits(dict)
  const names = new Set(units.map(u => u.name))
  let n = units.length + 1
  while (names.has(`第 ${n} 单元`)) n++
  return `第 ${n} 单元`
}

/**
 * 把词典级保存的 unitWordKeys 重放到单词的 unit 字段上。
 * 官方词典刷新后词条会重新拉取（无 unit 字段），需要按保存的成员关系恢复单元归属；
 * 自定义词典词条本身带 unit，重放是幂等的一致性保障（手动调整优先于导入标记）。
 * 旧数字制存档（无 unitNameSchema 标记）视为无效数据，不做重放并清空成员表。
 */
export function applyUnitWordKeys(dict: Dict) {
  const map = dict.unitWordKeys
  if (!map || !dict.unitNameSchema) {
    dict.unitWordKeys = undefined
    return
  }
  const keyToUnit = new Map<string, string>()
  Object.entries(map).forEach(([name, keys]) => {
    if (!isUnitName(name)) return
    ;(keys ?? []).forEach(k => keyToUnit.set(k, name.trim()))
  })
  if (!keyToUnit.size) return
  let changed = false
  ;(dict.words ?? []).forEach(w => {
    const name = keyToUnit.get(w.word)
    if (name !== undefined && w.unit !== name) {
      w.unit = name
      changed = true
    }
  })
  if (changed) notifyDictWordsChanged(dict)
}

/** 由单词的 unit 归属重建词典级成员关系（持久化用），保证与运行时一致 */
export function rebuildUnitWordKeys(dict: Dict) {
  const map: Record<string, string[]> = {}
  let has = false
  ;(dict.words ?? []).forEach(w => {
    const name = unitNameOf(w)
    if (!name) return
    has = true
    if (!map[name]) map[name] = []
    map[name].push(w.word)
  })
  dict.unitWordKeys = has ? map : undefined
  dict.unitNameSchema = has ? true : undefined
}

function readOffset(dict: Dict, unit: DictUnit) {
  const val = dict.unitOffsets?.[unit.name] ?? 0
  return clamp(val, 0, unit.total)
}

/**
 * 一次性把旧 lastLearnIndex 折算为单位进度，并清理已不存在单元的残留进度。
 * 无单元划分时不做任何迁移、不动整本游标。
 */
export function ensureUnitOffsets(dict: Dict): DictUnit[] {
  const units = getDictUnits(dict)
  if (!units.length) return units

  if (dict.unitProgressInitialized) {
    //结构变更（删单元/改成员）后，清理指向不存在单元的残留进度
    const names = new Set(units.map(u => u.name))
    if (dict.unitOffsets) {
      Object.keys(dict.unitOffsets).forEach(name => {
        if (!names.has(name)) delete dict.unitOffsets![name]
      })
    }
    if (dict.activeUnit && !names.has(dict.activeUnit)) dict.activeUnit = undefined
    return units
  }

  const cursor = clamp(dict.lastLearnIndex ?? 0, 0, units[units.length - 1].end)
  const offsets: Record<string, number> = {}
  units.forEach(u => {
    if (u.end <= cursor) offsets[u.name] = u.total
    else if (u.start >= cursor) offsets[u.name] = 0
    else offsets[u.name] = clamp(cursor - u.start, 0, u.total)
  })
  dict.unitOffsets = offsets
  dict.unitProgressInitialized = true
  syncUnitPointer(dict)
  return units
}

/** 由单元进度推导整本游标：定位到第一个未完成单元（无单元时不改变游标） */
export function syncUnitPointer(dict: Dict): DictUnit | null {
  const units = getDictUnits(dict)
  if (!units.length) return null
  for (const u of units) {
    if (readOffset(dict, u) < u.total) {
      dict.lastLearnIndex = u.start + readOffset(dict, u)
      dict.complete = false
      return u
    }
  }
  dict.lastLearnIndex = units[units.length - 1].end
  dict.complete = true
  return null
}

export function getUnitOffset(dict: Dict, unit: DictUnit) {
  ensureUnitOffsets(dict)
  return readOffset(dict, unit)
}

/** 写入某单元进度，并自动推导整本游标 */
export function setUnitOffset(dict: Dict, unit: DictUnit, value: number) {
  ensureUnitOffsets(dict)
  if (!dict.unitOffsets) dict.unitOffsets = {}
  dict.unitOffsets[unit.name] = clamp(Math.floor(value), 0, unit.total)
  syncUnitPointer(dict)
}

/** 删除单元：成员移出（单词保留在词库中），进度与激活状态一并清理 */
export function removeUnit(dict: Dict, unitName: string) {
  ;(dict.words ?? []).forEach(w => {
    if (unitNameOf(w) === unitName) delete w.unit
  })
  if (dict.unitOffsets) delete dict.unitOffsets[unitName]
  if (dict.activeUnit === unitName) dict.activeUnit = undefined
  rebuildUnitWordKeys(dict)
  notifyDictWordsChanged(dict)
  syncUnitPointer(dict)
}

/** 重置单元进度：传入单元名则只重置该单元，否则全部重置 */
export function resetUnitOffsets(dict: Dict, unitName?: string) {
  const units = ensureUnitOffsets(dict)
  if (!units.length) return
  if (!dict.unitOffsets) dict.unitOffsets = {}
  if (unitName === undefined) {
    units.forEach(u => {
      dict.unitOffsets![u.name] = 0
    })
  } else {
    dict.unitOffsets[unitName] = 0
  }
  syncUnitPointer(dict)
}

export function getNextUnfinishedUnit(dict: Dict): DictUnit | null {
  const units = ensureUnitOffsets(dict)
  return units.find(u => readOffset(dict, u) < u.total) ?? null
}

/** 整本模式创建任务前调用一次，跳过所有已完成单元 */
export function advancePointerPastFinishedUnits(dict: Dict): DictUnit | null {
  return syncUnitPointer(dict)
}

export function getUnitProgress(
  dict: Dict,
  unit: DictUnit,
  ignoreSet?: Set<string>,
  fsrsData?: Record<string, unknown>
): UnitProgressInfo {
  ensureUnitOffsets(dict)
  const learned = readOffset(dict, unit)
  let mastered = 0
  if (ignoreSet || fsrsData) {
    unit.words.forEach(w => {
      if (ignoreSet?.has(w.word) || fsrsData?.[w.word]) mastered++
    })
  }
  return {
    total: unit.total,
    learned,
    mastered,
    remaining: Math.max(0, unit.total - learned),
    percent: unit.total ? Math.round((learned / unit.total) * 100) : 0,
  }
}

/** 判断单元内第 localIndex 个词是否无需再学 */
export function isWordLearnedWithinUnit(
  dict: Dict,
  unit: DictUnit,
  localIndex: number,
  word: Word,
  ignoreSet?: Set<string>,
  fsrsData?: Record<string, unknown>
) {
  return (
    localIndex < getUnitOffset(dict, unit) || !!ignoreSet?.has(word.word) || !!fsrsData?.[word.word]
  )
}

/** 当前应学习的单元（优先 activeUnit，否则第一个未完成单元） */
export function getActiveUnit(dict: Dict): DictUnit | null {
  const units = ensureUnitOffsets(dict)
  if (!units.length) return null
  if (dict.activeUnit) {
    const active = units.find(u => u.name === dict.activeUnit)
    if (active) return active
  }
  return getNextUnfinishedUnit(dict) ?? units[0]
}

/** 重做/重复练习时回退进度（单元模式回退当前单元，整本模式回退游标所在单元） */
export function rollbackUnitProgress(dict: Dict, count: number) {
  ensureUnitOffsets(dict)
  const units = getDictUnits(dict)
  const targetUnit =
    dict.studyMode === 'unit'
      ? getActiveUnit(dict)
      : units.find(u => dict.lastLearnIndex >= u.start && dict.lastLearnIndex < u.end) ?? null
  if (!targetUnit) {
    dict.lastLearnIndex = clamp(dict.lastLearnIndex - count, 0, dict.length ?? 0)
    return
  }
  setUnitOffset(dict, targetUnit, getUnitOffset(dict, targetUnit) - count)
}

/** 单元总进度：Σ 已学 / Σ 总词数（无单元时全为 0，展示层应回退到整本进度） */
export function getOverallUnitProgress(dict: Dict) {
  const units = ensureUnitOffsets(dict)
  const total = units.reduce((sum, u) => sum + u.total, 0)
  const learned = units.reduce((sum, u) => sum + readOffset(dict, u), 0)
  return {
    total,
    learned,
    percent: total ? Math.round((learned / total) * 100) : 0,
    units,
  }
}
