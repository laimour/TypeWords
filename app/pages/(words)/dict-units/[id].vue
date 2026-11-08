<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BackIcon, BaseButton, BasePage, PopConfirm, Progress, Toast } from '@/base'
import { useBaseStore } from '@/core/stores/base.ts'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { getDefaultDict } from '@/core/types/func.ts'
import type { Dict } from '@/core/types/types.ts'
import { DICT_LIST } from '@/core/config/env.ts'
import { _getDictDataByUrl, resourceWrap, useNav } from '@/core/utils'
import { getPracticeWordCacheLocal } from '@/core/utils/cache.ts'
import { flushStatToStore } from '@/core/composables/usePracticePersistence'
import { useDataSyncPersistence } from '@/core/composables/useDataSyncPersistence.ts'
import { usePracticeWordPersistence } from '@/core/composables/practice-words/practice-word-session.ts'
import { createStudyTask } from '@/core/composables/practice-words/study-task.ts'
import { useUnitLabel } from '@/core/composables/useUnitLabel.ts'
import {
  applyUnitWordKeys,
  ensureUnitOffsets,
  getDictUnits,
  getNextUnitName,
  getNextUnfinishedUnit,
  getOverallUnitProgress,
  getUnitOffset,
  getUnitProgress,
  getUnassignedWords,
  removeUnit,
  rebuildUnitWordKeys,
  resetUnitOffsets,
  notifyDictWordsChanged,
  type DictUnit,
} from '@/core/utils/dict-units.ts'
import UnitProgressDialog from '@/components/word/UnitProgressDialog.vue'
import UnitWordsPickerDialog from '@/components/word/UnitWordsPickerDialog.vue'
import { WordPracticeMode } from '@/core/types/enum.ts'

const route = useRoute()
const store = useBaseStore()
const settingStore = useSettingStore()
const runtimeStore = useRuntimeStore()
const { nav, back } = useNav()
const wordPersistence = usePracticeWordPersistence()
const dataSync = useDataSyncPersistence()
const unitLabel = useUnitLabel()

const dictId = computed(() => String(route.params.id ?? ''))
const loading = ref(true)
const hasRunningTask = ref(false)
const showProgressDialog = ref(false)
const editingUnit = ref<DictUnit | null>(null)
const showWordsPicker = ref(false)
/** 为 null 表示新建单元 */
const pickerUnit = ref<DictUnit | null>(null)

const dict = computed<Dict>(() => store.sdict)
const units = computed<DictUnit[]>(() => getDictUnits(dict.value))
/** 无单元划分时回退为整本进度展示 */
const overall = computed(() => {
  if (!units.value.length) {
    const total = dict.value.length || (dict.value.words ?? []).length
    const learned = Math.min(dict.value.lastLearnIndex ?? 0, total)
    return {
      total,
      learned,
      percent: total ? Math.round((learned / total) * 100) : 0,
    }
  }
  return getOverallUnitProgress(dict.value)
})
const unassignedCount = computed(() => getUnassignedWords(dict.value).length)
const nextUnit = computed(() => getNextUnfinishedUnit(dict.value))
const defaultUnitName = computed(() => getNextUnitName(dict.value))

// 等待全局存档（IndexedDB）加载完成，避免 loadDict 用新构造的词典覆盖已保存的单元进度。
// 注意：不能 await store.init()，其 initializing 守卫会让并发调用直接返回而不是等待完成。
function waitForStoreLoad() {
  if (store.load) return Promise.resolve()
  return new Promise<void>(resolve => {
    const stop = watch(
      () => store.load,
      v => {
        if (v) {
          stop()
          resolve()
        }
      },
      { immediate: true }
    )
  })
}

async function loadDict() {
  await waitForStoreLoad()
  let target = store.word.bookList.find(item => String(item.id) === dictId.value)
  if (!target) {
    try {
      const dictList = await fetch(resourceWrap(DICT_LIST.WORD.ALL)).then(r => r.json())
      const resource = (dictList ?? []).find(
        (item: any) => String(item.id) === dictId.value || item.enName === dictId.value
      )
      if (resource) target = await _getDictDataByUrl(resource)
    } catch {
      /* 资源加载失败时尝试使用本地已有数据 */
    }
  } else if (!target.custom && !(target.words ?? []).length) {
    try {
      target = await _getDictDataByUrl(target)
    } catch {
      /* 忽略 */
    }
  }

  if (!target || !(target.words ?? []).length) {
    if (!target) {
      Toast.error('词典不存在')
      nav('/dict-list')
      return
    }
  }

  const next = getDefaultDict(target)
  next.length = next.words.length
  await store.changeDict(next)
  //自定义词典词条来自存档，重放保证手动划分与导入标记一致（幂等）
  applyUnitWordKeys(store.sdict)
  ensureUnitOffsets(store.sdict)
  loading.value = false
}

onMounted(async () => {
  await loadDict()
  hasRunningTask.value = !!(await getPracticeWordCacheLocal())
})

async function discardRunningTask() {
  const cache = await getPracticeWordCacheLocal()
  if (!cache) return
  flushStatToStore((cache as any)?.statStoreData)
  await wordPersistence.clear()
  hasRunningTask.value = false
}

async function changeStudyMode(mode: 'book' | 'unit') {
  if (dict.value.studyMode === mode) return
  if (mode === 'unit' && !units.value.length) {
    Toast.warning('该词库还没有单元，请先添加单元')
    return
  }
  dict.value.studyMode = mode
  await discardRunningTask()
  await dataSync.saveDictState()
}

function openProgressDialog(unit: DictUnit) {
  editingUnit.value = unit
  showProgressDialog.value = true
}

function openWordsPicker(unit: DictUnit | null) {
  pickerUnit.value = unit
  showWordsPicker.value = true
}

/** 保存单元成员：单元由名字标识，大小完全由选中的单词数量决定（动态） */
async function onPickerSave(name: string, keys: string[]) {
  const targetName = pickerUnit.value?.name ?? name
  if (!targetName) return
  const keySet = new Set(keys)
  ;(dict.value.words ?? []).forEach(w => {
    const unit = typeof w.unit === 'string' ? w.unit.trim() : undefined
    if (keySet.has(w.word)) w.unit = targetName
    else if (unit === targetName) delete w.unit
  })
  rebuildUnitWordKeys(dict.value)
  notifyDictWordsChanged(dict.value)
  dict.value.activeUnit = targetName
  ensureUnitOffsets(dict.value)
  await discardRunningTask()
  await dataSync.saveDictState()
  const isNew = !pickerUnit.value
  Toast.success(isNew ? `「${targetName}」已创建（${keys.length} 词）` : `「${targetName}」成员已更新（${keys.length} 词）`)
}

async function deleteUnitAction(unit: DictUnit) {
  removeUnit(dict.value, unit.name)
  await discardRunningTask()
  await dataSync.saveDictState()
  Toast.success(`「${unitLabel(unit.name)}」已删除，成员单词保留在词库中`)
}

function unitInfo(unit: DictUnit) {
  return getUnitProgress(dict.value, unit, store.getIgnoreWordsSet(), store.fsrsData)
}

async function beginStudy(unit?: DictUnit) {
  if (!(dict.value.words ?? []).length) {
    Toast.warning('没有单词可学习')
    return
  }
  if (unit) {
    dict.value.studyMode = 'unit'
    dict.value.activeUnit = unit.name
  } else {
    dict.value.studyMode = 'book'
    dict.value.activeUnit = nextUnit.value?.name ?? dict.value.activeUnit
  }
  await discardRunningTask()
  settingStore.wordPracticeMode = WordPracticeMode.System
  const task = createStudyTask()
  if (!task.taskWords.new.length && !task.taskWords.review.length) {
    Toast.info('该范围已学完，暂无需要学习的新词')
    return
  }
  nav('/practice-words/' + dict.value.id, {}, { taskWords: task.taskWords })
}

async function resetUnit(unit: DictUnit) {
  resetUnitOffsets(dict.value, unit.name)
  await discardRunningTask()
  await dataSync.saveDictState()
  Toast.success(`${unitLabel(unit.name)} 进度已重置`)
}

async function resetAll() {
  resetUnitOffsets(dict.value)
  await discardRunningTask()
  await dataSync.saveDictState()
  Toast.success('全部单元进度已重置')
}

async function editWords() {
  await store.changeDict(dict.value)
  runtimeStore.editDict = getDefaultDict(store.sdict)
  nav('/dict', { from: 'list' })
}
</script>

<template>
  <BasePage>
    <div class="card unit-page" v-loading="loading">
      <div class="flex items-center relative gap-2 header-section">
        <!-- 返回走 history.back，避免 push 污染历史栈（否则浏览器返回又会回到本页） -->
        <BackIcon class="z-2" @click="history.length > 1 ? back() : nav('/dict-list')" />
        <span class="page-title absolute w-full center">{{ dict.name || '单元学习' }}</span>
        <div class="flex-1 flex justify-end z-1">
          <BaseButton type="info" size="small" @click="editWords">编辑词库</BaseButton>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-3">
        <div class="flex justify-between text-sm">
          <span>整本进度：已学 {{ overall.learned }} / {{ overall.total }} 词</span>
          <span>{{ overall.percent }}%</span>
        </div>
        <Progress :percentage="overall.percent" :show-text="false" />
      </div>

      <div class="setting-row mt-5">
        <div class="label">学习模式</div>
        <div class="flex gap-2 flex-wrap">
          <BaseButton :type="dict.studyMode !== 'unit' ? 'primary' : 'info'" size="small" @click="changeStudyMode('book')">
            整本顺序学习
          </BaseButton>
          <BaseButton :type="dict.studyMode === 'unit' ? 'primary' : 'info'" size="small" :disabled="!units.length" @click="changeStudyMode('unit')">
            按单元学习
          </BaseButton>
        </div>
        <p class="hint">
          {{
            dict.studyMode === 'unit' && units.length
              ? '只在当前选中的单元内学习，整本进度不受影响。'
              : '从上一个未学完的单元继续，已学完的单元与已掌握的单词会自动跳过。'
          }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-5">
        <PopConfirm
          v-if="hasRunningTask"
          title="当前存在未完成的学习任务，重新开始会覆盖该任务，是否继续？"
          @confirm="beginStudy()"
        >
          <BaseButton size="large">
            {{ dict.studyMode === 'unit' && units.length ? '学习当前单元' : `继续整本学习${nextUnit ? `（${nextUnit.name}）` : ''}` }}
          </BaseButton>
        </PopConfirm>
        <BaseButton v-else size="large" @click="beginStudy()">
          {{ dict.studyMode === 'unit' && units.length ? '学习当前单元' : `继续整本学习${nextUnit ? `（${nextUnit.name}）` : ''}` }}
        </BaseButton>
        <PopConfirm v-if="units.length" title="确认重置全部单元进度？" @confirm="resetAll">
          <BaseButton type="info" size="small">重置全部进度</BaseButton>
        </PopConfirm>
      </div>

      <div class="flex justify-between items-center mt-6 mb-2">
        <div class="title">单元列表</div>
        <div class="flex items-center gap-3">
          <span class="hint">
            {{
              units.length
                ? `共 ${units.length} 个单元${unassignedCount ? `，未分配 ${unassignedCount} 词` : ''}`
                : unassignedCount
                  ? `尚未划分单元，共 ${unassignedCount} 个未分配单词`
                  : '尚未划分单元'
            }}
          </span>
          <BaseButton type="primary" size="small" @click="openWordsPicker(null)">添加单元</BaseButton>
        </div>
      </div>

      <p v-if="!units.length" class="hint mb-2">
        单元由名字标识、大小由实际加入的单词数量决定：点击「添加单元」输入名字并从词库中选词即可创建；
        导入词库时也可以在文本中使用 `unit 3` / `Unit One` / `第1单元` 等标题行自动划分，同名标题会合并为同一单元。
        官方词库刷新后会自动恢复已划分的单元。
      </p>

      <div class="unit-grid" v-if="units.length">
        <div
          v-for="unit in units"
          :key="unit.name"
          class="unit-item"
          :class="{ active: dict.activeUnit === unit.name && dict.studyMode === 'unit', done: unitInfo(unit).learned >= unit.total }"
        >
          <div class="flex justify-between items-center">
            <span class="font-bold">{{ unitLabel(unit.name) }}</span>
            <span class="hint">{{ unit.total }} 词</span>
          </div>
          <div class="text-sm mt-1 text-[var(--md-sys-color-on-surface-variant)]">
            已学 {{ getUnitOffset(dict, unit) }} / {{ unit.total }}（{{ unitInfo(unit).percent }}%）
          </div>
          <Progress class="mt-2" :percentage="unitInfo(unit).percent" :show-text="false" />
          <div class="flex gap-2 mt-3 flex-wrap">
            <BaseButton
              size="small"
              :type="dict.activeUnit === unit.name && dict.studyMode === 'unit' ? 'primary' : 'info'"
              :disabled="!unit.total"
              @click="beginStudy(unit)"
            >
              学习本单元
            </BaseButton>
            <BaseButton size="small" type="info" @click="openWordsPicker(unit)">编辑单词</BaseButton>
            <BaseButton size="small" type="info" @click="openProgressDialog(unit)">调整进度</BaseButton>
            <PopConfirm title="确认重置本单元进度？" @confirm="resetUnit(unit)">
              <BaseButton size="small" type="info">重置</BaseButton>
            </PopConfirm>
            <PopConfirm title="确认删除该单元？成员单词会保留在词库中。" @confirm="deleteUnitAction(unit)">
              <BaseButton size="small" type="info">删除单元</BaseButton>
            </PopConfirm>
          </div>
        </div>
      </div>
    </div>

    <UnitProgressDialog v-model="showProgressDialog" :unit="editingUnit" />
    <UnitWordsPickerDialog v-model="showWordsPicker" :dict="dict" :unit="pickerUnit" :default-name="defaultUnitName" @save="onPickerSave" />
  </BasePage>
</template>

<style scoped lang="scss">
.unit-page {
  padding-bottom: 2rem;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;

  .label {
    width: 6rem;
    flex-shrink: 0;
    color: var(--md-sys-color-on-surface);
  }

  .hint {
    width: 100%;
    font-size: 0.8125rem;
    color: var(--md-sys-color-on-surface-variant);
  }
}

.hint {
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant);
}

.unit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem;
}

.unit-item {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-lg);
  padding: 0.9rem;
  background: var(--md-sys-color-surface-container-low);
  transition: background 0.15s, border-color 0.15s;

  &.active {
    border-color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
  }

  &.done {
    opacity: 0.85;
  }
}
</style>
