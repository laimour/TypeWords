<script setup lang="ts">
import { computed } from 'vue'
import MsIcon from './MsIcon.vue'
import type { MsIconName } from './icons'

// 学习趋势卡（demo/index.html 学习统计三卡实装版）：大数值 + SVG 面积曲线
const props = defineProps<{
  title: string
  icon: MsIconName
  /** 主数值（分钟） */
  value: number
  sub: string
  peak: number
  /** 曲线数据点（分钟序列） */
  points: number[]
  /** true 用平滑曲线（周），false 用折线（月，与 demo 一致） */
  smooth?: boolean
}>()

const W = 280
const H = 64
const PAD = 6

const paths = computed(() => {
  const pts = props.points ?? []
  if (!pts.length) return { area: '', line: '' }
  const max = Math.max(...pts, 1)
  const step = W / Math.max(pts.length - 1, 1)
  const coords = pts.map((v, i) => [i * step, H - PAD - (v / max) * (H - PAD * 2)] as const)
  let line = `M${coords[0][0]},${round(coords[0][1])}`
  for (let i = 1; i < coords.length; i++) {
    const [x, y] = coords[i]
    if (props.smooth) {
      const mx = round((coords[i - 1][0] + x) / 2)
      line += ` C${mx},${round(coords[i - 1][1])} ${mx},${round(y)} ${round(x)},${round(y)}`
    } else {
      line += ` L${round(x)},${round(y)}`
    }
  }
  const area = `${line} L${W},${H} L0,${H} Z`
  return { area, line }
})

function round(n: number) {
  return Math.round(n * 10) / 10
}
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body trend-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon :name="icon" :size="18" /></span>
        {{ title }}
        <span class="m3e-head-actions">{{ $t('m3e_peak', { n: peak }) }}</span>
      </div>
      <div class="big-num">
        {{ value }}<span class="unit">{{ $t('m3e_minutes') }}</span>
      </div>
      <div class="m3e-card-sub">{{ sub }}</div>
      <div class="spark">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
          <path :d="paths.area" class="spark-fill" />
          <path :d="paths.line" class="spark-line" vector-effect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  </m-card>
</template>

<style scoped lang="scss">
.trend-body {
  padding-bottom: 0 !important;
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
.spark {
  margin: 8px -22px 0;
  line-height: 0;
  svg {
    width: 100%;
    height: 64px;
    display: block;
    border-radius: 0 0 18px 18px;
  }
}
.spark-fill {
  fill: color-mix(in srgb, var(--mtrl-sys-color-primary) 18%, transparent);
  stroke: none;
}
.spark-line {
  fill: none;
  stroke: var(--mtrl-sys-color-primary);
  stroke-width: 2;
}
</style>
