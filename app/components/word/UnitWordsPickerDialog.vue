<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue'
import { BaseButton, Toast } from '@/base'
import type { Dict } from '@/core/types/types'
import type { DictUnit } from '@/core/utils/dict-units.ts'

const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))

const props = defineProps<{
  dict: Dict
  /** 为 null 表示新建单元 */
  unit: DictUnit | null
  /** 新建时输入为空采用的默认单元名 */
  defaultName: string
}>()

const emit = defineEmits<{
  (e: 'save', name: string, keys: string[]): void
}>()

const model = defineModel<boolean>()

let search = $ref('')
let unitName = $ref('')
let selected = $ref<Set<string>>(new Set())

watch(
  () => [model.value, props.unit, props.dict] as const,
  ([visible, unit]) => {
    if (!visible) return
    search = ''
    unitName = unit ? unit.name : ''
    selected = new Set(unit ? unit.words.map(w => w.word) : [])
  },
  { immediate: true }
)

/** 展示列表：搜索时全库匹配；否则编辑单元时先显示成员再显示未分配词，新建单元时只显示未分配词 */
const filteredWords = $computed(() => {
  const words = props.dict.words ?? []
  const key = search.trim().toLowerCase()
  if (key) return words.filter(w => w.word.toLowerCase().includes(key)).slice(0, 100)
  const unassigned = words.filter(w => typeof w.unit !== 'string' || !w.unit.trim())
  if (props.unit) return [...props.unit.words, ...unassigned].slice(0, 100)
  return unassigned.slice(0, 100)
})

const selectedCount = $computed(() => selected.size)
const hiddenCount = $computed(() => {
  if (search.trim()) return 0
  return (props.dict.words ?? []).length - filteredWords.length
})

function toggle(word: string) {
  const next = new Set(selected)
  if (next.has(word)) next.delete(word)
  else next.add(word)
  selected = next
}

/** 单词当前归属单元（未选中时用于展示所在单元角标） */
const wordUnitMap = $computed(() => {
  const map = new Map<string, string>()
  ;(props.dict.words ?? []).forEach(w => {
    if (typeof w.unit === 'string' && w.unit.trim()) map.set(w.word, w.unit.trim())
  })
  return map
})

function unitBadge(word: string): string | null {
  if (selected.has(word)) return null
  return wordUnitMap.get(word) ?? null
}

function save() {
  if (!selected.size) {
    Toast.warning('请至少选择 1 个单词')
    return
  }
  const name = props.unit?.name ?? (unitName.trim() || props.defaultName)
  if (!name) {
    Toast.warning('请输入单元名字')
    return
  }
  //按词库顺序输出成员，保证单元内学习顺序稳定
  const keys = (props.dict.words ?? []).filter(w => selected.has(w.word)).map(w => w.word)
  emit('save', name, keys)
  model.value = false
}
</script>

<template>
  <Dialog
    v-model="model"
    padding
    :title="unit ? `${unit.name} · 编辑单词（${unit.total} 词）` : '新建单元 · 选择单词'"
  >
    <div class="picker-dialog">
      <p class="hint">单元由名字标识，大小由实际选中的单词数量决定，之后可随时增删单词调整。</p>
      <input
        v-if="!unit"
        v-model="unitName"
        class="search"
        type="text"
        :placeholder="`单元名字（留空则为 ${defaultName}）`"
      />
      <input v-model="search" class="search" type="text" placeholder="搜索单词" />

      <div class="word-list">
        <button
          v-for="w in filteredWords"
          :key="w.word"
          type="button"
          class="word-row"
          :class="{ checked: selected.has(w.word) }"
          @click="toggle(w.word)"
        >
          <span class="mark">{{ selected.has(w.word) ? '✓' : '' }}</span>
          <span class="word">{{ w.word }}</span>
          <span class="cn">{{ w.trans?.[0]?.cn ?? '' }}</span>
          <span v-if="unitBadge(w.word) !== null" class="badge">{{ unitBadge(w.word) }}</span>
        </button>
        <div v-if="!filteredWords.length" class="empty">没有匹配的单词</div>
      </div>
      <p v-if="hiddenCount > 0" class="hint">为避免卡顿仅显示前 100 词，请输入关键词搜索其余 {{ hiddenCount }} 词。</p>

      <div class="flex items-center gap-2 mt-4">
        <span class="text-sm">已选 {{ selectedCount }} 词</span>
        <div class="flex-1" />
        <BaseButton size="small" @click="model = false">取消</BaseButton>
        <BaseButton size="small" type="primary" @click="save">保存</BaseButton>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.picker-dialog {
  width: min(32rem, 86vw);
}

.hint {
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant);
}

.search {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-md);
  background: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
  outline: none;

  &:focus {
    border-color: var(--md-sys-color-primary);
  }
}

.word-list {
  margin-top: 0.5rem;
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

  &.checked {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  .mark {
    width: 1.25rem;
    flex-shrink: 0;
    text-align: center;
    font-weight: 700;
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

  .badge {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--md-sys-color-on-surface-variant);
  }
}

.empty {
  padding: 1rem;
  text-align: center;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 0.875rem;
}
</style>
