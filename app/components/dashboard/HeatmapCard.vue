<script setup lang="ts">
import { computed, ref } from 'vue'
import MsIcon from './MsIcon.vue'
import type { MsIconName } from './icons'
import type { HeatCell } from './types'

// 学习统计卡（热力网格版）：大数值 + 日历色阶格子 + 月份标签 + 少→多图例
// 悬停显示当天信息气泡，点击查看当天学习记录
const props = defineProps<{
  title: string
  icon: MsIconName
  /** 主数值（分钟） */
  value: number
  sub: string
  peak: number
  /** 每一列代表一周，最多 7 个格子；null 表示范围外（留空） */
  weeks: Array<Array<HeatCell | null>>
  /** 顶部月份标签（col 为起始列索引） */
  monthLabels?: Array<{ label: string; col: number }>
  /** 网格下方的星期标签（用于单周/整月视图） */
  weekdayLabels?: string[]
  /** 是否显示「少 ▢▢▢▢ 多」图例 */
  legend?: boolean
  /** 格子最大边长（px），不给则按卡片宽度均分 */
  cell?: number
  /** 格子间距（px） */
  gap?: number
}>()

const emit = defineEmits<{
  select: [cell: HeatCell]
}>()

// 组件根节点是「卡片 + Teleport 气泡」两段，需显式透传外部 class（m3e-span-4 等）
defineOptions({ inheritAttrs: false })

/** 传了 cell 用「格子最大边长」，未传则按卡片宽度均分；都随容器自动收缩 */
const gridStyle = computed(() => {
  const gap = `${props.gap ?? 4}px`
  const max = props.cell ? `${props.cell}px` : '1fr'
  const columns = `repeat(${props.weeks.length}, minmax(0, ${max}))`
  return { '--gap': gap, gridTemplateColumns: columns } as Record<string, string>
})

const maxVal = computed(() => {
  let max = 1
  for (const week of props.weeks) {
    for (const v of week) if (v && v.minutes > max) max = v.minutes
  }
  return max
})

/** 按相对峰值分 4 档色阶 */
function level(cell: HeatCell | null) {
  if (!cell) return 'none'
  if (cell.minutes <= 0) return 'lv0'
  const r = cell.minutes / maxVal.value
  if (r < 0.25) return 'lv1'
  if (r < 0.5) return 'lv2'
  if (r < 0.75) return 'lv3'
  return 'lv4'
}

/** 月份标签跨列区间，保证标签不被裁切 */
const monthSpans = computed(() => {
  const labels = props.monthLabels ?? []
  return labels.map((m, i) => ({
    ...m,
    span: Math.max((labels[i + 1]?.col ?? props.weeks.length) - m.col, 1),
  }))
})

const legendLevels = ['lv0', 'lv1', 'lv2', 'lv3', 'lv4']

/* ---------------- 悬停信息气泡（fixed 定位，避免被卡片 overflow 裁掉） ---------------- */

const tip = ref<{ cell: HeatCell; x: number; y: number } | null>(null)

function showTip(e: MouseEvent, cell: HeatCell | null) {
  if (!cell) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tip.value = { cell, x: rect.left + rect.width / 2, y: rect.top - 6 }
}

function hideTip() {
  tip.value = null
}

function onCellClick(cell: HeatCell | null) {
  if (!cell) return
  hideTip()
  emit('select', cell)
}
</script>

<template>
  <m-card class="m3e-card" variant="filled" v-bind="$attrs">
    <div class="m3e-card-body heat-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon :name="icon" :size="18" /></span>
        {{ title }}
        <span class="m3e-head-actions">{{ $t('m3e_peak', { n: peak }) }}</span>
      </div>

      <div class="big-num">
        {{ value }}<span class="unit">{{ $t('m3e_minutes') }}</span>
      </div>
      <div class="m3e-card-sub">{{ sub }}</div>

      <div class="heat">
        <div v-if="monthSpans.length" class="heat-months" :style="gridStyle">
          <span
            v-for="m in monthSpans"
            :key="m.col"
            class="heat-month"
            :style="{ gridColumn: `${m.col + 1} / span ${m.span}` }"
            >{{ m.label }}</span
          >
        </div>

        <div class="heat-grid" :style="gridStyle">
          <div v-for="(week, ci) in weeks" :key="ci" class="heat-col">
            <span
              v-for="(cell, ri) in week"
              :key="ri"
              class="heat-cell"
              :class="[level(cell), { clickable: !!cell }]"
              @mouseenter="showTip($event, cell)"
              @mouseleave="hideTip"
              @click="onCellClick(cell)"
            />
          </div>
        </div>

        <div v-if="weekdayLabels?.length" class="heat-weekdays" :style="gridStyle">
          <span v-for="(w, i) in weekdayLabels" :key="i" class="heat-weekday">{{ w }}</span>
        </div>

        <div v-if="legend" class="heat-legend">
          <span>{{ $t('m3e_heatmap_less') }}</span>
          <span v-for="l in legendLevels" :key="l" class="heat-cell heat-legend-cell" :class="l" />
          <span>{{ $t('m3e_heatmap_more') }}</span>
        </div>
      </div>
    </div>
  </m-card>

  <Teleport to="body">
    <div v-if="tip" class="heat-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
      <div class="heat-tip-date">{{ tip.cell.label }}</div>
      <div class="heat-tip-line">{{ tip.cell.minutes }}{{ $t('m3e_minutes') }}</div>
      <div class="heat-tip-line">
        {{ $t('new_words') }} {{ tip.cell.newWords }} · {{ $t('review') }} {{ tip.cell.reviewWords }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.heat-body {
  padding-bottom: 20px !important;
  // 卡片被拉伸到同排最高时，内容纵向均匀分布，避免底部空白
  flex: 1;
  justify-content: space-between;
}

.big-num {
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--mtrl-sys-color-on-surface);
  .unit {
    font-size: 14px;
    font-weight: 500;
    color: var(--mtrl-sys-color-on-surface-variant);
    margin-left: 8px;
  }
}

.heat {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  // 宽度贴合网格，图例右对齐到网格而不是卡片边缘
  width: fit-content;
  max-width: 100%;
}

.heat-months {
  display: grid;
  column-gap: var(--gap);
  font-size: 11px;
  line-height: 1.2;
  color: var(--mtrl-sys-color-on-surface-variant);
}

.heat-month {
  white-space: nowrap;
  overflow: visible;
}

.heat-grid {
  display: grid;
  column-gap: var(--gap);
}

.heat-col {
  display: flex;
  flex-direction: column;
  row-gap: var(--gap);
}

.heat-cell {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  display: block;
  flex: none;
  transition: background-color 0.15s ease;
}

.heat-cell.clickable {
  cursor: pointer;

  &:hover {
    outline: 2px solid color-mix(in srgb, var(--mtrl-sys-color-primary) 60%, transparent);
    outline-offset: 1px;
  }
}

.heat-weekdays {
  display: grid;
  column-gap: var(--gap);
  margin-top: 2px;
  font-size: 10px;
  line-height: 1;
  color: var(--mtrl-sys-color-on-surface-variant);
  text-align: center;
}

.heat-weekday {
  white-space: nowrap;
  overflow: visible;
}

.heat-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 11px;
  line-height: 1;
  color: var(--mtrl-sys-color-on-surface-variant);
}

.heat-legend-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

/* 色阶：空 → 低 → 高（跟随主题 primary） */
.none {
  background: transparent;
}
.lv0 {
  background: color-mix(in srgb, var(--mtrl-sys-color-on-surface-variant) 14%, transparent);
}
.lv1 {
  background: color-mix(in srgb, var(--mtrl-sys-color-primary) 26%, transparent);
}
.lv2 {
  background: color-mix(in srgb, var(--mtrl-sys-color-primary) 48%, transparent);
}
.lv3 {
  background: color-mix(in srgb, var(--mtrl-sys-color-primary) 72%, transparent);
}
.lv4 {
  background: var(--mtrl-sys-color-primary);
}

/* 悬停气泡（M3 tooltip 风格） */
.heat-tip {
  position: fixed;
  z-index: 3000;
  transform: translate(-50%, -100%);
  pointer-events: none;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-tooltip-bg);
  color: var(--md-sys-color-inverse-on-surface);
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.24);

  .heat-tip-date {
    font-weight: 600;
    margin-bottom: 2px;
  }
  .heat-tip-line {
    opacity: 0.9;
  }
}
</style>
