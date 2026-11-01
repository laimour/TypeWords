<script setup lang="ts">
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { useBaseStore } from '@/core/stores/base.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { usePracticeStore } from '@/core/stores/practice.ts'
import { BasePage, Toast } from '@/base'
import { _getDictDataByUrl, resourceWrap, total, useNav } from '@/core/utils'
import { useFetch } from '@vueuse/core'
import { DICT_LIST, DictId } from '@/core/config/env.ts'
import { WordPracticeMode } from '@/core/types/enum.ts'
import { flushStatToStore } from '@/core/composables/usePracticePersistence'
import { usePracticeWordPersistence } from '@/core/composables/practice-words/practice-word-session.ts'
import { createStudyTask } from '@/core/composables/practice-words/study-task.ts'
import { getPracticeWordCacheLocal } from '@/core/utils/cache.ts'
import {
  type DictUnit,
  getActiveUnit,
  getDictUnits,
  getNextUnfinishedUnit,
  getUnitOffset,
  getUnitProgress,
} from '@/core/utils/dict-units.ts'
import UnitProgressDialog from '@/components/word/UnitProgressDialog.vue'
import TodayTaskCard from '@/components/dashboard/TodayTaskCard.vue'
import UnitProgressCard from '@/components/dashboard/UnitProgressCard.vue'
import StatOverviewCard from '@/components/dashboard/StatOverviewCard.vue'
import HeatmapCard from '@/components/dashboard/HeatmapCard.vue'
import UnitRingsCard from '@/components/dashboard/UnitRingsCard.vue'
import MyDictsCard from '@/components/dashboard/MyDictsCard.vue'
import RecommendCard from '@/components/dashboard/RecommendCard.vue'
import StudyDayDialog from '@/components/dashboard/StudyDayDialog.vue'
import type { DictCardItem, HeatCell, OverviewMetrics, StudyDayRow, UnitRingItem } from '@/components/dashboard/types'
import type { MsIconName } from '@/components/dashboard/icons'

dayjs.extend(isoWeek)

const store = useBaseStore()
const settingStore = useSettingStore()
const statStore = usePracticeStore()
const wordPersistence = usePracticeWordPersistence()
const { nav } = useNav()
const { t: $t, locale: $locale } = useI18n()

const hasDict = $computed(() => !!store.sdict.id)
const todayKey = dayjs().format('YYYY-MM-DD')

/* ===================== 学习时长统计（落库 + 本地练习缓存 + 当前会话） ===================== */

const allWordStatistics = $computed(() => store.word.bookList.flatMap(b => b.statistics ?? []))

/** 已落库统计按天聚合（毫秒 + 新学/复习词数），避免逐日反复遍历全量统计 */
const persistedDayMap = $computed(() => {
  const map = new Map<string, { ms: number; newWords: number; reviewWords: number }>()
  for (const s of allWordStatistics) {
    const key = dayjs(s.startDate).format('YYYY-MM-DD')
    const cur = map.get(key) ?? { ms: 0, newWords: 0, reviewWords: 0 }
    cur.ms += s.spend ?? 0
    cur.newWords += s.new ?? 0
    cur.reviewWords += s.review ?? 0
    map.set(key, cur)
  }
  return map
})

// 当前练习会话（practice store，未落库时也有值）
const sessionDaySpendMap = $computed(() => {
  const map = new Map<string, number>()
  if (!statStore.spend) return map
  if (Array.isArray(statStore.segments) && statStore.segments.length > 0) {
    for (const [segStart, segEnd] of statStore.segments) {
      const key = dayjs(segStart).format('YYYY-MM-DD')
      map.set(key, (map.get(key) ?? 0) + (segEnd - segStart))
    }
  } else {
    map.set(dayjs(statStore.startDate).format('YYYY-MM-DD'), statStore.spend)
  }
  return map
})

// 本地练习缓存（练习中刷新/离开后未落库的部分）
let cacheDaySpendMap = $ref(new Map<string, number>())
// 缓存里的原始统计（当天学习记录弹窗需要新学/复习/错词数）
let cacheStatStoreData = $ref<any>(null)
onMounted(async () => {
  try {
    const cache = await getPracticeWordCacheLocal()
    const st: any = cache?.statStoreData
    cacheStatStoreData = st ?? null
    const map = new Map<string, number>()
    if (st?.spend) {
      if (Array.isArray(st.segments) && st.segments.length > 0) {
        for (const [segStart, segEnd] of st.segments) {
          const key = dayjs(segStart).format('YYYY-MM-DD')
          map.set(key, (map.get(key) ?? 0) + (segEnd - segStart))
        }
      } else {
        map.set(dayjs(st.startDate).format('YYYY-MM-DD'), st.spend)
      }
    }
    cacheDaySpendMap = map
  } catch {}
})

/** 某天的总学习毫秒（落库 + 缓存 + 会话） */
function dayMs(d: dayjs.Dayjs) {
  const key = d.format('YYYY-MM-DD')
  const persisted = persistedDayMap.get(key)?.ms ?? 0
  return persisted + (cacheDaySpendMap.get(key) ?? 0) + (sessionDaySpendMap.get(key) ?? 0)
}

const toMinutes = (ms: number) => Math.round(ms / 60000)

const todayMinutes = $computed(() => toMinutes(dayMs(dayjs())))

/** 所有出现过学习记录的日期 key 集合 */
const studyDayKeys = $computed(() => {
  const set = new Set<string>()
  for (const s of allWordStatistics) set.add(dayjs(s.startDate).format('YYYY-MM-DD'))
  for (const key of cacheDaySpendMap.keys()) set.add(key)
  for (const key of sessionDaySpendMap.keys()) set.add(key)
  return set
})

const totalDays = $computed(() => studyDayKeys.size)

const streakDays = $computed(() => {
  let cursor = dayjs()
  if (!studyDayKeys.has(cursor.format('YYYY-MM-DD'))) cursor = cursor.subtract(1, 'day')
  let count = 0
  while (studyDayKeys.has(cursor.format('YYYY-MM-DD'))) {
    count++
    cursor = cursor.subtract(1, 'day')
  }
  return count
})

/* ===================== 热力网格数据（学习统计 / 本周 / 本月） ===================== */

/** 热力图列数 */
const HEAT_WEEKS = 13

/** 本地化短日期（tooltip 标题用） */
function dateLabel(d: dayjs.Dayjs) {
  return new Intl.DateTimeFormat($locale.value, { month: 'short', day: 'numeric' }).format(d.toDate())
}

/** 某天热力格子；未来日期返回 null（留空） */
function heatDayValue(d: dayjs.Dayjs): HeatCell | null {
  if (d.isAfter(dayjs(), 'day')) return null
  const key = d.format('YYYY-MM-DD')
  const persisted = persistedDayMap.get(key)
  return {
    date: key,
    label: dateLabel(d),
    minutes: toMinutes(dayMs(d)),
    newWords: persisted?.newWords ?? 0,
    reviewWords: persisted?.reviewWords ?? 0,
  }
}

/** 近 13 周：13 列 × 7 行（周一起，旧 → 新） */
const heatWeeks = $computed(() => {
  const firstMonday = dayjs().startOf('isoWeek').subtract(HEAT_WEEKS - 1, 'week')
  const weeks: Array<Array<HeatCell | null>> = []
  for (let c = 0; c < HEAT_WEEKS; c++) {
    const monday = firstMonday.add(c, 'week')
    const col: Array<HeatCell | null> = []
    for (let r = 0; r < 7; r++) col.push(heatDayValue(monday.add(r, 'day')))
    weeks.push(col)
  }
  return weeks
})

/** 近 13 周峰值（分钟），用于色阶与标题右上角 */
const heatPeak = $computed(() => {
  let max = 0
  for (const w of heatWeeks) for (const v of w) if (v && v.minutes > max) max = v.minutes
  return max
})

/** 月份标签：列首周的月份发生变化时打标，文案用当前语言短月名 */
const heatMonths = $computed(() => {
  const fmt = new Intl.DateTimeFormat($locale.value, { month: 'short' })
  const firstMonday = dayjs().startOf('isoWeek').subtract(HEAT_WEEKS - 1, 'week')
  const labels: Array<{ label: string; col: number }> = []
  let lastMonth = -1
  for (let c = 0; c < HEAT_WEEKS; c++) {
    const monday = firstMonday.add(c, 'week')
    if (monday.month() !== lastMonth) {
      labels.push({ label: fmt.format(monday.toDate()), col: c })
      lastMonth = monday.month()
    }
  }
  return labels
})

/** 星期短名（周一起），用于本周/本月网格下方 */
const weekdayNames = $computed(() => {
  const fmt = new Intl.DateTimeFormat($locale.value, { weekday: 'narrow' })
  const monday = dayjs().startOf('isoWeek')
  return Array.from({ length: 7 }, (_, i) => fmt.format(monday.add(i, 'day').toDate()))
})

/** 本周：7 列 × 1 行，一天一格 */
const weekHeatWeeks = $computed(() =>
  Array.from({ length: 7 }, (_, i) => [heatDayValue(dayjs().startOf('isoWeek').add(i, 'day'))])
)

/** 本月：日历排布，7 列（周一→周日）× 最多 6 行；非本月/未来留空 */
const monthHeatWeeks = $computed(() => {
  const monthStart = dayjs().startOf('month')
  const cols: Array<Array<HeatCell | null>> = Array.from({ length: 7 }, () => [])
  // 本月 1 日是周几 → 首行偏移
  const lead = monthStart.isoWeekday() - 1
  for (let i = 0; i < lead; i++) cols[i].push(null)
  const days = monthStart.daysInMonth()
  for (let d = 0; d < days; d++) {
    const day = monthStart.add(d, 'day')
    cols[(lead + d) % 7].push(heatDayValue(day))
  }
  // 补齐到同样的行数，保证格子对齐
  const rows = Math.max(...cols.map(c => c.length))
  for (const col of cols) while (col.length < rows) col.push(null)
  return cols
})

/* ===================== 当天学习记录弹窗（点击热力格子打开） ===================== */

let dayDialogVisible = $ref(false)
let dayDialogDate = $ref('')
let dayDialogRows = $ref<StudyDayRow[]>([])

/** 缓存 / 当前会话在跨天练习中的角色 */
function sessionRoleBy(map: Map<string, number>, dateKey: string): StudyDayRow['sessionRole'] {
  const keys = [...map.keys()]
  if (keys.length <= 1) return 'single'
  return keys.indexOf(dateKey) === 0 ? 'start' : 'middle'
}

function openDayRecord(cell: HeatCell) {
  const dateKey = cell.date
  const rows: StudyDayRow[] = []
  // 已落库记录
  for (const book of store.word.bookList) {
    for (const stat of book.statistics ?? []) {
      if (dayjs(stat.startDate).format('YYYY-MM-DD') === dateKey) {
        rows.push({ ...stat, dictName: book.name })
      }
    }
  }
  // 本地缓存（练习中刷新/离开，未落库）
  const st = cacheStatStoreData
  if (st?.spend && cacheDaySpendMap.has(dateKey)) {
    rows.push({
      ...st,
      spend: cacheDaySpendMap.get(dateKey) ?? 0,
      new: st.newWordNumber ?? 0,
      review: st.reviewWordNumber ?? 0,
      wrong: st.wrong ?? 0,
      dictName: store.sdict.name,
      sessionRole: sessionRoleBy(cacheDaySpendMap, dateKey),
    } as StudyDayRow)
  }
  // 当前会话（未写入缓存）
  if (statStore.spend && sessionDaySpendMap.has(dateKey)) {
    rows.push({
      startDate: dayjs(dateKey).valueOf(),
      spend: sessionDaySpendMap.get(dateKey) ?? 0,
      total: statStore.total ?? 0,
      new: statStore.newWordNumber ?? 0,
      review: statStore.reviewWordNumber ?? 0,
      wrong: statStore.wrong ?? 0,
      dictName: store.sdict.name,
      sessionRole: sessionRoleBy(sessionDaySpendMap, dateKey),
    })
  }
  dayDialogDate = dateKey
  dayDialogRows = rows
  dayDialogVisible = true
}

/** 本周（周一起）7 天分钟序列，未来几天补 0 */
const weekMinutesPoints = $computed(() => {
  const monday = dayjs().startOf('isoWeek')
  const arr: number[] = []
  for (let i = 0; i < 7; i++) {
    const d = monday.add(i, 'day')
    arr.push(d.isAfter(dayjs(), 'day') ? 0 : toMinutes(dayMs(d)))
  }
  return arr
})

const weekMinutes = $computed(() => weekMinutesPoints.reduce((a, b) => a + b, 0))
const weekPeak = $computed(() => Math.max(...weekMinutesPoints, 0))

/** 本月 1 日至今的逐日分钟序列 */
const monthMinutesPoints = $computed(() => {
  const days = dayjs().date()
  const arr: number[] = []
  for (let i = 1; i <= days; i++) arr.push(toMinutes(dayMs(dayjs().date(i))))
  return arr
})
const monthMinutes = $computed(() => monthMinutesPoints.reduce((a, b) => a + b, 0))
const monthPeak = $computed(() => Math.max(...monthMinutesPoints, 0))
const monthDayCount = $computed(() => monthMinutesPoints.filter(v => v > 0).length)

const masteredTotal = $computed(() => store.knownWordsSet.size)

/* ===================== 今日任务（进行中 / 已完成） ===================== */

let taskNewCount = $ref(0)
let taskReviewCount = $ref(0)

function refreshTaskInfo() {
  if (!hasDict || !store.sdict.words.length) {
    taskNewCount = 0
    taskReviewCount = 0
    return
  }
  try {
    const r = createStudyTask()
    taskNewCount = r.taskWords.new.length
    taskReviewCount = r.taskWords.review.length
  } catch {
    taskNewCount = 0
    taskReviewCount = 0
  }
}

watch(
  [() => store.load, () => store.sdict.id, () => store.sdict.lastLearnIndex, () => settingStore.autoAddRandomReviewWhenNoDue],
  refreshTaskInfo,
  { immediate: true }
)

const taskTag = $computed(() =>
  taskNewCount + taskReviewCount > 0 ? $t('m3e_in_progress') : $t('m3e_completed')
)

const randomReview = $computed({
  get: () => settingStore.autoAddRandomReviewWhenNoDue,
  set: (v: boolean) => {
    settingStore.autoAddRandomReviewWhenNoDue = v
    refreshTaskInfo()
  },
})

/* ===================== 单元 / 词典进度 ===================== */

const currentUnits = $computed<DictUnit[]>(() => (hasDict ? getDictUnits(store.sdict) : []))
const unitModeActive = $computed(() => store.sdict.studyMode === 'unit' && currentUnits.length > 0)
const activeUnit = $computed(() => (hasDict ? getActiveUnit(store.sdict) : null))
const ignoreSet = $computed(() => store.getIgnoreWordsSet())
const endOfToday = $computed(() => dayjs().endOf('day').valueOf())

const unitCardData = $computed(() => {
  if (unitModeActive && activeUnit) {
    const info = getUnitProgress(store.sdict, activeUnit, ignoreSet, store.fsrsData)
    const next = getNextUnfinishedUnit(store.sdict)
    return {
      title: activeUnit.name,
      remaining: info.remaining,
      percent: info.percent,
      learned: info.learned,
      total: info.total,
      nextName: next?.name ?? null,
    }
  }
  // 无单元划分：回退整本进度
  const totalWords = store.sdict.length || (store.sdict.words ?? []).length
  const learned = Math.min(store.sdict.lastLearnIndex ?? 0, totalWords)
  return {
    title: hasDict ? store.sdict.name : $t('m3e_no_dict'),
    remaining: Math.max(0, totalWords - learned),
    percent: totalWords ? Math.round((learned / totalWords) * 100) : 0,
    learned,
    total: totalWords,
    nextName: null,
  }
})

function goDictManage() {
  if (!hasDict) return nav('/dict-list')
  nav('/dict-units/' + store.sdict.id)
}

function startStudy(unitName?: string) {
  if (!hasDict) return Toast.warning($t('m3e_select_dict_first'))
  if (!store.sdict.words.length) return Toast.warning($t('m3e_no_words'))
  if (unitName) {
    store.sdict.studyMode = 'unit'
    store.sdict.activeUnit = unitName
  }
  nav('/practice-words/' + store.sdict.id)
}

/** 开始复习：与 words-classic 的复习入口一致，先落库并清掉未完成的练习缓存，避免续接旧任务 */
async function startReview() {
  if (!hasDict) return Toast.warning($t('m3e_select_dict_first'))
  if (!store.sdict.words.length) return Toast.warning($t('m3e_no_words'))
  if (!taskReviewCount) return Toast.warning($t('m3e_no_review_words'))
  const cache = await getPracticeWordCacheLocal()
  if (cache) {
    flushStatToStore((cache as any)?.statStoreData)
    await wordPersistence.clear()
  }
  settingStore.wordPracticeMode = WordPracticeMode.Review
  nav('/practice-words/' + store.sdict.id)
}

/** 添加单词：进入「导入单词」向导页（支持上传文件或手动粘贴多行单词） */
function addWord() {
  if (!hasDict) return Toast.warning($t('m3e_select_dict_first'))
  nav('/import-words')
}

function onRefreshTask() {
  refreshTaskInfo()
  Toast.success($t('m3e_task_refreshed'))
}

/* ===================== 数据概览（词典 / 单元两种口径，真实计算） ===================== */

const dueReviewTotal = $computed(() => {
  if (!hasDict) return 0
  const wordSet = new Set((store.sdict.words ?? []).map(w => w.word))
  return Object.entries(store.fsrsData).filter(([word, card]) => {
    return wordSet.has(word) && dayjs((card as any).due).valueOf() <= endOfToday
  }).length
})

const remainingNew = $computed(() => {
  if (!hasDict) return 0
  if (unitModeActive) {
    return activeUnit ? Math.max(0, activeUnit.total - getUnitOffset(store.sdict, activeUnit)) : 0
  }
  return Math.max(0, store.sdict.length - store.sdict.lastLearnIndex)
})

const dictMetrics = $computed<OverviewMetrics>(() => {
  const words = store.sdict.words ?? []
  const totalWords = store.sdict.length || words.length
  let mastered: number
  if (words.length) {
    mastered = words.reduce((n, w) => n + (ignoreSet.has(w.word) || store.fsrsData[w.word] ? 1 : 0), 0)
  } else {
    // TODO(数据源): 非当前选中词典内存中无 words，无法精确统计该词典已掌握数，退回全局已掌握数
    mastered = store.knownWordsSet.size
  }
  const pct = (n: number) => (totalWords ? Math.round((n / totalWords) * 100) : 0)
  return {
    mastered,
    masteredSub: $t('m3e_mastered_ratio', { p: pct(mastered) }),
    due: dueReviewTotal,
    dueSub: dueReviewTotal > 0 ? $t('m3e_due_today', { n: dueReviewTotal }) : $t('m3e_today_no_due'),
    remaining: remainingNew,
    remainingSub: $t('m3e_dict_pending_all', { p: pct(remainingNew) }),
    total: totalWords,
    totalSub: $t('m3e_dict_total_sub', {
      name: store.sdict.name,
      c: store.collectWord.words.length,
      w: store.wrong.words.length,
    }),
  }
})

const unitMetrics = $computed<OverviewMetrics>(() => {
  if (!unitModeActive || !activeUnit) {
    return {
      mastered: 0,
      masteredSub: '—',
      due: 0,
      dueSub: $t('m3e_unit_no_due'),
      remaining: 0,
      remainingSub: '—',
      total: 0,
      totalSub: $t('m3e_no_units_hint'),
    }
  }
  const info = getUnitProgress(store.sdict, activeUnit, ignoreSet, store.fsrsData)
  const due = activeUnit.words.filter(w => {
    const card = store.fsrsData[w.word]
    return card && dayjs((card as any).due).valueOf() <= endOfToday
  }).length
  const pct = info.total ? Math.round((info.remaining / info.total) * 100) : 0
  return {
    mastered: info.mastered,
    masteredSub: $t('m3e_unit_mastered_detail', { a: info.learned, b: info.total, p: info.percent }),
    due,
    dueSub: due > 0 ? $t('m3e_due_today', { n: due }) : $t('m3e_unit_no_due'),
    remaining: info.remaining,
    remainingSub: $t('m3e_unit_pending', { p: pct }),
    total: info.total,
    totalSub: activeUnit.name,
  }
})

/* ===================== 单元环形进度 ===================== */

const ringsTitle = $computed(() =>
  $t('m3e_unit_rings_title', { name: hasDict ? store.sdict.name : '—' })
)

const ringUnits = $computed<UnitRingItem[]>(() => {
  if (!hasDict) return []
  if (!currentUnits.length) {
    const totalWords = store.sdict.length || 0
    const learned = Math.min(store.sdict.lastLearnIndex ?? 0, totalWords)
    return [
      {
        name: store.sdict.name,
        learned,
        total: totalWords,
        percent: totalWords ? Math.round((learned / totalWords) * 100) : 0,
        current: true,
        status: $t('m3e_learning_status'),
      },
    ]
  }
  return currentUnits.map(u => {
    const off = getUnitOffset(store.sdict, u)
    const current = u.name === activeUnit?.name
    return {
      name: u.name,
      learned: off,
      total: u.total,
      percent: u.total ? Math.round((off / u.total) * 100) : 0,
      current,
      status: off >= u.total ? $t('m3e_completed') : current ? $t('m3e_in_progress') : $t('m3e_not_started'),
    }
  })
})

let showUnitProgressDialog = $ref(false)
let editingUnit = $ref<DictUnit | null>(null)

function openUnitProgressByName(name?: string | null) {
  if (!name) return
  const unit = currentUnits.find(v => v.name === name)
  if (unit) {
    editingUnit = unit
    showUnitProgressDialog = true
  }
}

/* ===================== 我的词典 ===================== */

const dictItems = $computed<DictCardItem[]>(() =>
  store.word.bookList.map((d, i) => {
    const isCurrent = i === store.word.studyIndex
    let icon: MsIconName = 'school'
    if ([d.enName, d.id].includes(DictId.wordCollect)) icon = 'favorite'
    else if ([d.enName, d.id].includes(DictId.wordWrong)) icon = 'error'
    else if ([d.enName, d.id].includes(DictId.wordKnown)) icon = 'task_alt'
    else if (isCurrent) icon = 'menu_book'
    const count = d.words?.length || d.length || 0
    let progressSub: string | undefined
    if ([d.enName, d.id].includes(DictId.wordWrong)) {
      progressSub = $t('m3e_wrong_sub', { n: count })
    } else if (isCurrent && count) {
      const learned = Math.min(d.lastLearnIndex ?? 0, count)
      progressSub = $t('m3e_dict_progress_sub', {
        a: learned,
        b: count,
        p: count ? Math.round((learned / count) * 100) : 0,
      })
    }
    return {
      id: String(d.id ?? i),
      name: d.name,
      count,
      isCustom: !!d.custom,
      isCurrent,
      icon,
      progressSub,
    }
  })
)

async function openDict(item: DictCardItem) {
  const d = store.word.bookList.find(v => String(v.id) === item.id)
  if (!d) return
  await store.changeDict(d)
  nav('/dict-units/' + d.id)
}

/* ===================== 推荐 ===================== */

const { data: recommendDictList } = useFetch(resourceWrap(DICT_LIST.WORD.RECOMMENDED)).json()

const recommendDict = $computed(() => (recommendDictList.value as any[] | null)?.[0])
const recommendName = $computed(() => recommendDict?.name ?? '')
const recommendSub = $computed(() =>
  recommendDict ? $t('m3e_recommend_sub', { n: recommendDict.length ?? 0 }) : ''
)

async function addRecommend() {
  if (!recommendDict) return
  Toast.info($t('m3e_loading_dict'))
  try {
    const dict = await _getDictDataByUrl(recommendDict)
    await store.changeDict(dict)
    Toast.success($t('m3e_dict_added'))
  } catch {
    Toast.error($t('m3e_dict_add_failed'))
  }
}

/* ===================== 页头 ===================== */

const headTitle = $computed(() => `${hasDict ? store.sdict.name : $t('m3e_no_dict')} · ${$t('m3e_learning')}`)
const headSub = $computed(() =>
  $t('m3e_head_sub', { streak: streakDays, minutes: todayMinutes, mastered: masteredTotal })
)
</script>

<template>
  <BasePage>
    <div class="m3e-page">
      <div class="m3e-page-head">
        <div>
          <h1>{{ headTitle }}</h1>
          <div class="sub">{{ headSub }}</div>
        </div>
      </div>

      <div class="m3e-grid">
        <TodayTaskCard
          class="m3e-span-6"
          :dict-name="hasDict ? store.sdict.name : '—'"
          :tag="taskTag"
          :minutes="todayMinutes"
          :daily-goal="store.sdict.perDayStudyNumber || 0"
          v-model:random-review="randomReview"
          @play="startStudy()"
          @review="startReview()"
          @add-word="addWord()"
        />

        <UnitProgressCard
          class="m3e-span-6"
          :title="unitCardData.title"
          :remaining="unitCardData.remaining"
          :percent="unitCardData.percent"
          :learned="unitCardData.learned"
          :total="unitCardData.total"
          :next-name="unitCardData.nextName"
          @refresh="onRefreshTask"
          @manage="goDictManage"
          @next="goDictManage"
        />

        <StatOverviewCard class="m3e-span-12" :dict-scope="dictMetrics" :unit-scope="unitMetrics" />

        <HeatmapCard
          class="m3e-span-4 m3e-trend-span"
          :title="$t('m3e_study_stats')"
          icon="local_fire_department"
          :value="todayMinutes"
          :sub="$t('m3e_total_streak_sub', { d: totalDays, s: streakDays })"
          :peak="heatPeak"
          :weeks="heatWeeks"
          :month-labels="heatMonths"
          :cell="22"
          legend
          @select="openDayRecord"
        />

        <HeatmapCard
          class="m3e-span-4 m3e-trend-span"
          :title="$t('weekly_study_record')"
          icon="calendar_month"
          :value="weekMinutes"
          :sub="$t('m3e_week_sub', { n: weekPeak })"
          :peak="weekPeak"
          :weeks="weekHeatWeeks"
          :weekday-labels="weekdayNames"
          :cell="40"
          :gap="6"
          legend
          @select="openDayRecord"
        />

        <HeatmapCard
          class="m3e-span-4 m3e-trend-span"
          :title="$t('m3e_monthly_study_record')"
          icon="insights"
          :value="monthMinutes"
          :sub="$t('m3e_month_sub', { d: monthDayCount, s: streakDays })"
          :peak="monthPeak"
          :weeks="monthHeatWeeks"
          :weekday-labels="weekdayNames"
          :cell="26"
          legend
          @select="openDayRecord"
        />

        <UnitRingsCard
          class="m3e-span-12"
          :title="ringsTitle"
          :units="ringUnits"
          :empty-hint="hasDict && !currentUnits.length ? $t('m3e_no_units_hint') : ''"
          @adjust="openUnitProgressByName(activeUnit?.name ?? currentUnits[0]?.name)"
          @study="startStudy(activeUnit?.name)"
          @select="(u: UnitRingItem) => openUnitProgressByName(u.name)"
        />

        <MyDictsCard class="m3e-span-12" :dicts="dictItems" @open="openDict" @add="nav('/dict-list')" />

        <RecommendCard
          v-if="recommendName"
          class="m3e-span-12"
          :name="recommendName"
          :sub="recommendSub"
          @add="addRecommend"
        />
      </div>

      <UnitProgressDialog v-model="showUnitProgressDialog" :unit="editingUnit" />

      <StudyDayDialog v-model="dayDialogVisible" :date-key="dayDialogDate" :rows="dayDialogRows" />
    </div>
  </BasePage>
</template>

<style lang="scss">
// ---- M3 Expressive 仪表盘共享样式（m3e- 前缀防冲突；非 scoped 供 dashboard 子组件复用） ----
m-card.m3e-card {
  display: block;
  border-radius: 18px;
  overflow: hidden;
}
.m3e-card-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.m3e-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--mtrl-sys-color-on-surface);
}
.m3e-title-chip {
  display: inline-flex;
  align-items: center;
  font-size: 18px;
  background: var(--mtrl-sys-color-surface-container-highest);
  border-radius: 9px;
  padding: 6px;
  color: var(--mtrl-sys-color-primary);
}
.m3e-card-sub {
  color: var(--mtrl-sys-color-on-surface-variant);
  font-size: 13px;
}
.m3e-card-link {
  color: var(--mtrl-sys-color-primary);
  font-size: 13px;
  cursor: pointer;
  align-self: flex-end;
  &:hover {
    text-decoration: underline;
  }
}
.m3e-head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--mtrl-sys-color-on-surface-variant);
  font-size: 13px;
}
.m3e-page-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  h1 {
    font-size: 28px;
    margin: 0;
    color: var(--mtrl-sys-color-on-surface);
  }
  .sub {
    color: var(--mtrl-sys-color-on-surface-variant);
    font-size: 14px;
    margin-top: 4px;
  }
}
.m3e-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.m3e-span-4 {
  grid-column: span 4;
}
.m3e-span-6 {
  grid-column: span 6;
}
.m3e-span-12 {
  grid-column: span 12;
}

// 中屏（768–1199）：两列，今日任务与单元进度上下叠，趋势卡两列
@media (max-width: 1199px) {
  .m3e-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .m3e-span-4,
  .m3e-span-6,
  .m3e-span-12 {
    grid-column: span 2;
  }
  .m3e-trend-span {
    grid-column: span 1;
  }
}

// 小屏（<768）：单列
@media (max-width: 767px) {
  .m3e-grid {
    grid-template-columns: 1fr;
  }
  .m3e-span-4,
  .m3e-span-6,
  .m3e-span-12,
  .m3e-trend-span {
    grid-column: span 1;
  }
  .m3e-page-head {
    h1 {
      font-size: 22px;
    }
  }
  .m3e-card-body {
    padding: 16px;
  }
}
</style>
