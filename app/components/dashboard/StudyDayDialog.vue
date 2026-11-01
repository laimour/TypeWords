<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { Dialog } from '@/base'
import { msToHourMinute } from '@/core/utils'
import type { StudyDayRow } from './types'

// 当天学习记录弹窗（点击热力格子打开），字段与「学习记录」原弹窗保持一致
const props = defineProps<{
  modelValue: boolean
  /** YYYY-MM-DD */
  dateKey: string
  rows: StudyDayRow[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t: $t, locale: $locale } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const title = computed(() => {
  if (!props.dateKey) return $t('study_record')
  const date = new Intl.DateTimeFormat($locale.value, { dateStyle: 'long' }).format(dayjs(props.dateKey).toDate())
  return `${date} · ${$t('study_record')}`
})

const totalMinutes = computed(() => Math.round(props.rows.reduce((a, r) => a + (r.spend ?? 0), 0) / 60000))

function roleLabel(role: StudyDayRow['sessionRole']) {
  if (role === 'start') return $t('m3e_session_start')
  if (role === 'middle') return $t('m3e_session_middle')
  if (role === 'end') return $t('m3e_session_end')
  return ''
}
</script>

<template>
  <Dialog v-model="visible" :title="title" :footer="false" padding>
    <div v-if="!rows.length" class="day-empty">{{ $t('m3e_day_empty') }}</div>

    <div v-else class="day-wrap">
      <div class="day-sum">
        <span class="day-sum-num">{{ totalMinutes }}</span>
        <span class="day-sum-unit">{{ $t('m3e_minutes') }}</span>
      </div>

      <ul class="day-list">
        <li v-for="(row, idx) in rows" :key="idx" class="day-row">
          <div class="day-row-head">
            <span class="day-row-dict">{{ row.dictName }}</span>
            <span v-if="row.sessionRole && row.sessionRole !== 'single'" class="day-role" :class="row.sessionRole">
              {{ roleLabel(row.sessionRole) }}
            </span>
            <span class="day-row-spend">{{ msToHourMinute(row.spend) }}</span>
          </div>
          <div class="day-row-meta">
            {{ $t('new_words') }} {{ row.new ?? 0 }} · {{ $t('review') }} {{ row.review ?? 0 }} ·
            {{ $t('m3e_day_wrong') }} {{ row.wrong ?? 0 }}
            <template v-if="row.total"> · {{ $t('total_words') }} {{ row.total }}</template>
          </div>
        </li>
      </ul>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.day-empty {
  width: 100%;
  padding: 24px 0;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
}

.day-wrap {
  width: 100%;
  min-width: 0;
}

.day-sum {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 12px;
  color: var(--md-sys-color-on-surface);

  .day-sum-num {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.1;
  }
  .day-sum-unit {
    font-size: 13px;
    color: var(--md-sys-color-on-surface-variant);
  }
}

.day-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh;
  overflow-y: auto;
}

.day-row {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--md-sys-color-surface-container-highest);
}

.day-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-row-dict {
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-role {
  flex: none;
  font-size: 11px;
  line-height: 1.4;
  padding: 1px 8px;
  border-radius: 999px;

  &.start {
    background: var(--md-sys-color-success-container);
    color: var(--md-sys-color-on-success-container);
  }
  &.middle {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
  }
  &.end {
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
  }
}

.day-row-spend {
  margin-left: auto;
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--md-sys-color-primary);
}

.day-row-meta {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--md-sys-color-on-surface-variant);
}
</style>
