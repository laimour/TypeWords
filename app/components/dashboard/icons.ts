/**
 * Material Symbols 图标（内联 SVG 版）。
 * demo 用 Google Fonts 图标字体（国内/离线会退化成英文文字），实装改用项目已有的
 * @iconify-json/material-symbols + unplugin-icons `?raw`（构建期内联 SVG，颜色跟随 currentColor）。
 * 用于 mtrl 组件 icon 属性（setHTML 注入 shadow DOM 的 HTML 字符串）与页面内 MsIcon 组件。
 */
import flag from '~icons/material-symbols/flag?raw'
import playArrow from '~icons/material-symbols/play-arrow?raw'
import timeline from '~icons/material-symbols/timeline?raw'
import refresh from '~icons/material-symbols/refresh?raw'
import chevronRight from '~icons/material-symbols/chevron-right?raw'
import monitoring from '~icons/material-symbols/monitoring?raw'
import taskAlt from '~icons/material-symbols/task-alt?raw'
import schedule from '~icons/material-symbols/schedule?raw'
import autoStories from '~icons/material-symbols/auto-stories?raw'
import libraryBooks from '~icons/material-symbols/library-books?raw'
import localFireDepartment from '~icons/material-symbols/local-fire-department?raw'
import calendarMonth from '~icons/material-symbols/calendar-month?raw'
import insights from '~icons/material-symbols/insights?raw'
import viewTimeline from '~icons/material-symbols/view-timeline?raw'
import tune from '~icons/material-symbols/tune?raw'
import menuBook from '~icons/material-symbols/menu-book?raw'
import favorite from '~icons/material-symbols/favorite?raw'
import error from '~icons/material-symbols/error?raw'
import school from '~icons/material-symbols/school?raw'
import add from '~icons/material-symbols/add?raw'
import edit from '~icons/material-symbols/edit?raw'
import recommend from '~icons/material-symbols/recommend?raw'
import check from '~icons/material-symbols/check?raw'
import home from '~icons/material-symbols/home?raw'
import settings from '~icons/material-symbols/settings?raw'
import description from '~icons/material-symbols/description?raw'
import help from '~icons/material-symbols/help?raw'
import forum from '~icons/material-symbols/forum?raw'

export const msIcons = {
  flag,
  play_arrow: playArrow,
  timeline,
  refresh,
  chevron_right: chevronRight,
  monitoring,
  task_alt: taskAlt,
  schedule,
  auto_stories: autoStories,
  library_books: libraryBooks,
  local_fire_department: localFireDepartment,
  calendar_month: calendarMonth,
  insights,
  view_timeline: viewTimeline,
  tune,
  menu_book: menuBook,
  favorite,
  error,
  school,
  add,
  edit,
  recommend,
  check,
  home,
  settings,
  description,
  help,
  forum,
} as const

export type MsIconName = keyof typeof msIcons

/** 供 mtrl 组件 icon 属性使用（icon="<svg .../>"） */
export function msIcon(name: MsIconName): string {
  return msIcons[name]
}
