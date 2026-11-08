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
  /** 已掌握占该口径总词数的百分比（环形进度） */
  masteredPct: number
  due: number
  dueSub: string
  /** 待复习占已掌握的百分比（环形进度） */
  duePct: number
  remaining: number
  remainingSub: string
  /** 剩余生词占该口径总词数的百分比（环形进度） */
  remainingPct: number
  total: number
  totalSub: string
  /** 该口径的学习进度百分比（已学 / 总数，环形进度） */
  totalPct: number
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
  /** 展示用单元名（Unit 4 / 单元 4） */
  label: string
  learned: number
  total: number
  percent: number
  current: boolean
  status: string
}
