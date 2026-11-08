<script setup lang="ts">
import MsIcon from './MsIcon.vue'
import type { UnitRingItem } from './types'

// 单元进度总览卡：环形波浪进度 + 操作按钮
defineProps<{
  title: string
  units: UnitRingItem[]
  /** 无单元划分提示（为空时不显示） */
  emptyHint?: string
}>()

const emit = defineEmits<{
  /** 调整进度（打开 UnitProgressDialog） */
  (e: 'adjust'): void
  /** 继续学习 */
  (e: 'study'): void
  /** 点击某个单元 */
  (e: 'select', unit: UnitRingItem): void
}>()
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon name="view_timeline" :size="18" /></span>
        {{ title }}
      </div>
      <div v-if="emptyHint" class="m3e-card-sub">{{ emptyHint }}</div>
      <div class="units-row">
        <div
          v-for="u in units"
          :key="u.name"
          class="unit-item"
          :class="{ current: u.current }"
          @click="emit('select', u)"
        >
          <m-progress
            variant="circular"
            :value="u.percent"
            max="100"
            shape="wavy"
            size="72"
            thickness="7"
            show-label
            :aria-label="u.label"
          ></m-progress>
          <div class="u-name">{{ u.label }}</div>
          <div class="u-sub">
            {{ $t('m3e_word_progress', { a: u.learned, b: u.total }) }} · {{ u.status }}
          </div>
        </div>
      </div>
      <div class="row">
        <m-button variant="tonal" @click="emit('adjust')">
          <span class="btn-inner"><MsIcon name="tune" :size="18" />{{ $t('m3e_adjust_progress') }}</span>
        </m-button>
        <m-button variant="filled" @click="emit('study')">
          <span class="btn-inner"><MsIcon name="play_arrow" :size="18" />{{ $t('m3e_continue_study') }}</span>
        </m-button>
        <div class="grow"></div>
        <span class="footnote">{{ $t('m3e_unlock_hint') }}</span>
      </div>
    </div>
  </m-card>
</template>

<style scoped lang="scss">
.units-row {
  display: flex;
  gap: 12px;
}
.unit-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  padding: 16px 10px 14px;
  background: var(--mtrl-sys-color-surface-container-low);
  border-radius: 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  &:hover {
    background: var(--mtrl-sys-color-surface-container);
  }
  .u-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--mtrl-sys-color-on-surface);
  }
  .u-sub {
    font-size: 12px;
    color: var(--mtrl-sys-color-on-surface-variant);
  }
  &.current {
    background: var(--mtrl-sys-color-surface-container-high);
    .u-name {
      color: var(--mtrl-sys-color-primary);
    }
  }
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  .grow {
    flex: 1;
  }
}
.btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.footnote {
  color: var(--mtrl-sys-color-on-surface-variant);
  font-size: 12px;
}
@media (max-width: 767px) {
  .units-row {
    flex-wrap: wrap;
    .unit-item {
      flex: 1 1 40%;
    }
  }
}
</style>
