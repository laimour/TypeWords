<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue'
import { BaseButton, InputNumber, Toast } from '@/base'
import { useBaseStore } from '@/core/stores/base.ts'
import { useDataSyncPersistence } from '@/core/composables/useDataSyncPersistence.ts'
import {
  clearTempDailyGoal,
  dictWordCount,
  getEffectiveDailyGoal,
  isTempDailyGoalActive,
  normalizeGoal,
  setTempDailyGoal,
} from '@/core/utils/daily-goal.ts'
import { useI18n } from 'vue-i18n'

const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))

// 每日目标弹窗：permanent = 改词典自身的每日目标；temp = 只对今天生效的临时目标
const props = defineProps<{
  kind: 'permanent' | 'temp'
}>()

const model = defineModel<boolean>()
const emit = defineEmits<{ saved: [] }>()

const store = useBaseStore()
const dataSync = useDataSyncPersistence()
const { t: $t } = useI18n()

let value = $ref(20)
let max = $ref(0)
let tempActive = $ref(false)

const presets = [10, 20, 30, 50, 100]

watch(
  () => [model.value, props.kind] as const,
  ([visible]) => {
    if (!visible) return
    const dict = store.sdict
    max = dictWordCount(dict)
    value = getEffectiveDailyGoal(dict) || Math.min(20, max || 20)
    tempActive = isTempDailyGoalActive(dict)
  },
  { immediate: true }
)

function pick(n: number) {
  value = Math.min(n, max || n)
}

async function save() {
  const dict = store.sdict
  //至少 1 词：0 会让今日任务永远为空，看起来就像「没有可学的单词」
  const next = Math.max(1, normalizeGoal(dict, value))
  if (props.kind === 'temp') {
    setTempDailyGoal(dict, next)
  } else {
    dict.perDayStudyNumber = next
    // 改成固定目标时清掉临时目标，避免“看起来改了但今天仍按临时值走”
    clearTempDailyGoal(dict)
  }
  // 本地刚写好的目标不能被云端较新的旧存档拉回覆盖
  await dataSync.saveDictState(store.$state, { pullWhenRemoteNewer: false })
  Toast.success($t('save_success'))
  emit('saved')
  model.value = false
}

async function resetTemp() {
  clearTempDailyGoal(store.sdict)
  // 本地刚清掉的临时目标同样不能被云端较新的旧存档拉回覆盖
  await dataSync.saveDictState(store.$state, { pullWhenRemoteNewer: false })
  Toast.success($t('restore_success'))
  emit('saved')
  model.value = false
}
</script>

<template>
  <Dialog
    v-model="model"
    padding
    :title="kind === 'temp' ? $t('m3e_temp_goal') : $t('m3e_edit_goal')"
  >
    <div class="goal-dialog">
      <div class="flex items-baseline gap-2">
        <span class="num">{{ value }}</span>
        <span class="unit">{{ $t('m3e_words_unit') }}</span>
      </div>
      <p class="hint">
        {{ kind === 'temp' ? $t('m3e_goal_temp_hint') : $t('m3e_daily_goal') }}
      </p>

      <div class="presets">
        <BaseButton
          v-for="p in presets"
          :key="p"
          :type="value === p ? 'primary' : 'info'"
          size="small"
          @click="pick(p)"
        >
          {{ p }}
        </BaseButton>
      </div>

      <div class="flex items-center gap-3 mt-3">
        <span class="text-sm shrink-0">{{ $t('m3e_daily_goal') }}</span>
        <InputNumber :min="1" :max="max || 9999" v-model="value" class="flex-1" />
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-4">
        <BaseButton v-if="kind === 'temp' && tempActive" type="info" size="small" @click="resetTemp">
          {{ $t('restore_default') }}
        </BaseButton>
        <div class="flex-1" />
        <BaseButton size="small" @click="model = false">{{ $t('cancel') }}</BaseButton>
        <BaseButton size="small" @click="save">{{ $t('save') }}</BaseButton>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.goal-dialog {
  width: min(26rem, 86vw);
}
.num {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  color: var(--md-sys-color-on-surface);
}
.unit {
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
}
.hint {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 0.75rem;
}
</style>
