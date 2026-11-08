<script setup lang="ts">
import { ref } from 'vue'
import MsIcon from './MsIcon.vue'
import type { OverviewMetrics } from './types'

// 数据概览卡：词典 / 单元 单选胶囊切换 4 个指标，每个指标右侧带环形进度
const props = defineProps<{
  dictScope: OverviewMetrics
  unitScope: OverviewMetrics
}>()

const scope = ref<'dict' | 'unit'>('dict')
const current = () => (scope.value === 'dict' ? props.dictScope : props.unitScope)
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon name="monitoring" :size="18" /></span>
        {{ $t('m3e_data_overview') }}
        <span class="m3e-head-actions">
          <span class="scope-toggle">
            <button class="seg" :class="{ active: scope === 'dict' }" type="button" @click="scope = 'dict'">
              {{ $t('m3e_scope_dict') }}
            </button>
            <button class="seg" :class="{ active: scope === 'unit' }" type="button" @click="scope = 'unit'">
              {{ $t('m3e_scope_unit') }}
            </button>
          </span>
        </span>
      </div>
      <div class="stat-grid">
        <div class="stat-tile">
          <div class="stat-main">
            <div class="stat-head">
              <MsIcon name="task_alt" :size="18" />
              <span class="stat-label">{{ $t('m3e_mastered') }}</span>
            </div>
            <div class="stat-num">{{ current().mastered }} {{ $t('m3e_words_unit') }}</div>
            <div class="m3e-card-sub">{{ current().masteredSub }}</div>
          </div>
          <m-progress
            class="stat-ring"
            variant="circular"
            :value="current().masteredPct"
            max="100"
            shape="wavy"
            size="56"
            thickness="5"
            show-label
            :aria-label="$t('m3e_mastered')"
          ></m-progress>
        </div>
        <div class="stat-tile">
          <div class="stat-main">
            <div class="stat-head">
              <MsIcon name="schedule" :size="18" />
              <span class="stat-label">{{ $t('m3e_due_review') }}</span>
            </div>
            <div class="stat-num">{{ current().due }} {{ $t('m3e_words_unit') }}</div>
            <div class="m3e-card-sub">{{ current().dueSub }}</div>
          </div>
          <m-progress
            class="stat-ring"
            variant="circular"
            :value="current().duePct"
            max="100"
            shape="wavy"
            size="56"
            thickness="5"
            show-label
            :aria-label="$t('m3e_due_review')"
          ></m-progress>
        </div>
        <div class="stat-tile">
          <div class="stat-main">
            <div class="stat-head">
              <MsIcon name="auto_stories" :size="18" />
              <span class="stat-label">{{ $t('m3e_remaining_new') }}</span>
            </div>
            <div class="stat-num">{{ current().remaining }} {{ $t('m3e_words_unit') }}</div>
            <div class="m3e-card-sub">{{ current().remainingSub }}</div>
          </div>
          <m-progress
            class="stat-ring"
            variant="circular"
            :value="current().remainingPct"
            max="100"
            shape="wavy"
            size="56"
            thickness="5"
            show-label
            :aria-label="$t('m3e_remaining_new')"
          ></m-progress>
        </div>
        <div class="stat-tile">
          <div class="stat-main">
            <div class="stat-head">
              <MsIcon name="library_books" :size="18" />
              <span class="stat-label">{{ $t('total_words') }}</span>
            </div>
            <div class="stat-num">{{ current().total }} {{ $t('m3e_words_unit') }}</div>
            <div class="m3e-card-sub">{{ current().totalSub }}</div>
          </div>
          <m-progress
            class="stat-ring"
            variant="circular"
            :value="current().totalPct"
            max="100"
            shape="wavy"
            size="56"
            thickness="5"
            show-label
            :aria-label="$t('total_words')"
          ></m-progress>
        </div>
      </div>
    </div>
  </m-card>
</template>

<style scoped lang="scss">
.scope-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  background: var(--mtrl-sys-color-surface-container-highest);
  border-radius: 999px;
  .seg {
    border: 0;
    cursor: pointer;
    padding: 7px 16px;
    border-radius: 999px;
    background: transparent;
    color: var(--mtrl-sys-color-on-surface-variant);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    transition: background-color 0.15s ease;
    &.active {
      background: var(--mtrl-sys-color-primary);
      color: var(--mtrl-sys-color-on-primary);
    }
  }
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.stat-tile {
  background: var(--mtrl-sys-color-surface-container-low);
  border-radius: 16px;
  padding: 16px 14px 16px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.stat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stat-ring {
  flex: 0 0 auto;
}
.stat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--mtrl-sys-color-primary);
}
.stat-label {
  color: var(--mtrl-sys-color-on-surface-variant);
  font-size: 13px;
}
.stat-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--mtrl-sys-color-on-surface);
  letter-spacing: 0.5px;
  line-height: 1.15;
}
@media (max-width: 1199px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
