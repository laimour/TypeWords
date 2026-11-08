import dayjs from 'dayjs'
import type { Dict } from '@/core/types/types'

/** 今天的日期 key（临时目标按自然日失效） */
export function goalDateKey(now: dayjs.Dayjs = dayjs()): string {
  return now.format('YYYY-MM-DD')
}

/** 词典总词数：优先 length，缺失时退回 words 数量 */
export function dictWordCount(dict: Dict): number {
  return dict.length || (dict.words ?? []).length || 0
}

/** 把目标词数收敛到 [0, 总词数] */
export function normalizeGoal(dict: Dict, value: unknown): number {
  const n = Math.floor(Number(value) || 0)
  if (n <= 0) return 0
  const total = dictWordCount(dict)
  return total > 0 ? Math.min(n, total) : n
}

/** 临时目标是否对今天生效 */
export function isTempDailyGoalActive(dict: Dict): boolean {
  return typeof dict.tempPerDayNumber === 'number' && dict.tempPerDayDate === goalDateKey()
}

/** 词典自身每日目标异常（0/空）时的兜底值，避免「每天 0 词」导致任务永远为空 */
const DEFAULT_DAILY_GOAL = 20

/**
 * 今日实际生效的每日目标：临时的今日目标优先，其次词典自身的每日目标。
 * 任务词数（createStudyTask / getCurrentStudyWord）都应走这里。
 */
export function getEffectiveDailyGoal(dict: Dict): number {
  if (isTempDailyGoalActive(dict)) {
    const temp = normalizeGoal(dict, dict.tempPerDayNumber)
    //历史/异常存档里可能存着 0（会让任务永远是空），此时回落到词典自身的每日目标
    if (temp > 0) return temp
  }
  return normalizeGoal(dict, dict.perDayStudyNumber) || DEFAULT_DAILY_GOAL
}

/** 设置仅今天有效的临时目标 */
export function setTempDailyGoal(dict: Dict, value: number) {
  dict.tempPerDayNumber = normalizeGoal(dict, value)
  dict.tempPerDayDate = goalDateKey()
}

/** 清除临时目标，回到词典自身的每日目标 */
export function clearTempDailyGoal(dict: Dict) {
  delete dict.tempPerDayNumber
  delete dict.tempPerDayDate
}
