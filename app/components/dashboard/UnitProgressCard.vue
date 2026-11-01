<script setup lang="ts">
import MsIcon from './MsIcon.vue'

// 单元进度卡（demo/index.html 单元进度卡实装版）：波浪线性进度 + 下一个未完成单元链接
defineProps<{
  /** 单元名 / 无单元时为词典名 */
  title: string
  remaining: number
  percent: number
  learned: number
  total: number
  /** 下一个未完成单元名（null 时隐藏链接） */
  nextName: string | null
}>()

const emit = defineEmits<{
  /** ↻ 刷新学习任务 */
  (e: 'refresh'): void
  /** › 前往单元管理 */
  (e: 'manage'): void
  /** 点击“下一个未完成”链接 */
  (e: 'next'): void
}>()
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon name="timeline" :size="18" /></span>
        {{ $t('m3e_unit_progress') }}
        <span class="m3e-head-actions">
          <span class="action-icon" :title="$t('m3e_task_refreshed')" @click="emit('refresh')">
            <MsIcon name="refresh" :size="18" />
          </span>
          <span class="action-icon" @click="emit('manage')">
            <MsIcon name="chevron_right" :size="18" />
          </span>
        </span>
      </div>
      <div class="row">
        <div class="big-num" style="font-size: 28px">{{ title }}</div>
        <div class="grow"></div>
        <span class="m3e-card-sub">{{ $t('m3e_remaining_words', { n: remaining }) }}</span>
      </div>
      <div class="row">
        <span class="used">{{ $t('m3e_learned_percent', { p: percent }) }}</span>
        <div class="grow"></div>
        <span class="m3e-card-sub">{{ $t('m3e_words_ratio', { a: learned, b: total }) }}</span>
      </div>
      <m-progress
        class="unit-progress"
        variant="linear"
        :value="percent"
        max="100"
        shape="wavy"
        thickness="8"
        :aria-label="$t('m3e_unit_progress')"
      ></m-progress>
      <div v-if="nextName" class="m3e-card-link" @click="emit('next')">
        {{ $t('m3e_next_unfinished', { name: nextName }) }}
      </div>
    </div>
  </m-card>
</template>

<style scoped lang="scss">
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  .grow {
    flex: 1;
  }
}
.used {
  font-size: 15px;
  font-weight: 700;
  color: var(--mtrl-sys-color-on-surface);
}
.big-num {
  font-weight: 800;
  line-height: 1.1;
  color: var(--mtrl-sys-color-on-surface);
}
.action-icon {
  display: inline-flex;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  transition: background-color 0.15s ease;
  &:hover {
    background: var(--mtrl-sys-color-surface-container-highest);
  }
}
.unit-progress {
  display: block;
}
</style>
