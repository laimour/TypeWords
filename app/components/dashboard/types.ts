import type { MsIconName } from './icons'
import type { Statistics } from '@/core/types/types.ts'

/** 热力图单个格子：某一天的学习数据 */
export interface HeatCell {
  /** YYYY-MM-DD */
  date: string
  /** 本地化日期文案（tooltip 标题） */
  label: string
  minutes: number
  newWords: number
  reviewWords: number
}

/** 当天学习记录弹窗的一行 */
export type StudyDayRow = Statistics & { dictName: string }

/** 数据概览卡单组指标（词典 / 单元两种口径） */
export interface OverviewMetrics {
  mastered: number
  masteredSub: string
  due: number
  dueSub: string
  remaining: number
  remainingSub: string
  total: number
  totalSub: string
}

/** 我的词典迷你卡数据 */
export interface DictCardItem {
  id: string
  name: string
  count: number
  isCustom: boolean
  isCurrent: boolean
  icon: MsIconName
  /** 学习中词典的进度副文案（其余为空） */
  progressSub?: string
}

/** 单元环形进度数据 */
export interface UnitRingItem {
  name: string
  learned: number
  total: number
  percent: number
  current: boolean
  status: string
}
