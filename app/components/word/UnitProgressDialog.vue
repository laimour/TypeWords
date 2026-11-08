<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue'
import { BaseButton, InputNumber, Progress, Toast } from '@/base'
import { useBaseStore } from '@/core/stores/base.ts'
import { flushStatToStore } from '@/core/composables/usePracticePersistence'
import { useDataSyncPersistence } from '@/core/composables/useDataSyncPersistence.ts'
import { usePracticeWordPersistence } from '@/core/composables/practice-words/practice-word-session.ts'
import { getPracticeWordCacheLocal } from '@/core/utils/cache.ts'
import {
  getUnitOffset,
  setUnitOffset,
  type DictUnit,
} from '@/core/utils/dict-units.ts'
import { useUnitLabel } from '@/core/composables/useUnitLabel.ts'

const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))
const unitLabel = useUnitLabel()

const props = defineProps<{
  /** 要调整进度的单元 */
  unit: DictUnit | null
}>()

const model = defineModel<boolean>()

const store = useBaseStore()
const wordPersistence = usePracticeWordPersistence()
const dataSync = useDataSyncPersistence()

let value = $ref(0)
let total = $ref(0)

watch(
  () => [model.value, props.unit] as const,
  ([visible, unit]) => {
    if (!visible || !unit) return
    total = unit.total
    value = getUnitOffset(store.sdict, unit)
  },
  { immediate: true }
)

const percent = $computed(() => (total ? Math.round((value / total) * 100) : 0))

function setTo(index: number) {
  value = Math.max(0, Math.min(total, index))
}

async function discardRunningTask() {
  const cache = await getPracticeWordCacheLocal()
  if (cache) {
    flushStatToStore((cache as any)?.statStoreData)
    await wordPersistence.clear()
  }
}

async function save() {
  if (!props.unit) return
  setUnitOffset(store.sdict, props.unit, value)
  await discardRunningTask()
  //立即持久化，避免刷新后单元进度丢失
  await dataSync.saveDictState()
  Toast.success('单元进度已更新')
  model.value = false
}

function resetUnitProgress() {
  value = 0
}

function markAllLearned() {
  value = total
}
</script>

<template>
  <Dialog v-model="model" padding :title="unit ? `${unitLabel(unit.name)} · ${$t('m3e_adjust_progress')}` : $t('m3e_adjust_progress')">
    <div class="unit-dialog" v-if="unit">
      <div class="flex justify-between items-center text-sm">
        <span>已学 {{ value }} / {{ unit.total }} 词</span>
        <span>{{ percent }}%</span>
      </div>
      <Progress class="mt-2" :percentage="percent" :show-text="false" />

      <div class="flex items-center gap-3 mt-4">
        <span class="text-sm shrink-0">已学词数</span>
        <InputNumber :min="0" :max="unit.total" v-model="value" class="flex-1" />
      </div>
      <p class="hint">点击下方任意单词，表示学到该词为止；之后的词会重新进入学习任务。</p>

      <div class="word-list">
        <button
          v-for="(word, index) in unit.words"
          :key="index"
          type="button"
          class="word-row"
          :class="{ learned: index < value }"
          @click="setTo(index + 1)"
        >
          <span class="idx">{{ index + 1 }}</span>
          <span class="word">{{ word.word }}</span>
          <span class="cn">{{ word.trans?.[0]?.cn ?? '' }}</span>
          <span class="state">{{ index < value ? '已学' : '待学' }}</span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-4">
        <BaseButton type="info" size="small" @click="resetUnitProgress">重置本单元</BaseButton>
        <BaseButton type="info" size="small" @click="markAllLearned">标记整单元已学</BaseButton>
        <div class="flex-1" />
        <BaseButton size="small" @click="model = false">取消</BaseButton>
        <BaseButton size="small" @click="save">保存</BaseButton>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.unit-dialog {
  width: min(32rem, 86vw);
}

.hint {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant);
}

.word-list {
  margin-top: 0.75rem;
  max-height: 16rem;
  overflow-y: auto;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-md);
  padding: 0.25rem;
}

.word-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: none;
  background: transparent;
  border-radius: var(--md-sys-shape-sm);
  cursor: pointer;
  text-align: left;
  color: var(--md-sys-color-on-surface);
  transition: background 0.15s;

  &:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  &.learned {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  .idx {
    width: 2rem;
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--md-sys-color-on-surface-variant);
  }

  .word {
    font-weight: 600;
  }

  .cn {
    flex: 1;
    font-size: 0.8125rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.8;
  }

  .state {
    font-size: 0.75rem;
    flex-shrink: 0;
    opacity: 0.7;
  }
}
</style>
