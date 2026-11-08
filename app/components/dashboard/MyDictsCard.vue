<script setup lang="ts">
import { computed, ref } from 'vue'
import MsIcon from './MsIcon.vue'
import type { DictCardItem } from './types'

// 我的词典卡（demo/index.html 我的词典卡实装版）：chips 过滤 + 迷你词典卡网格
const props = defineProps<{
  dicts: DictCardItem[]
}>()

const emit = defineEmits<{
  /** 点击词典卡：切换并进入词典详情 */
  (e: 'open', item: DictCardItem): void
  /** 点击新建词典卡 */
  (e: 'add'): void
  /** 添加单词（导入/手动粘贴到当前词典） */
  (e: 'add-word'): void
}>()

type FilterKey = 'all' | 'builtin' | 'custom'
const filter = ref<FilterKey>('all')

/** m-chip 的实际渲染节点在 m-chips 的 shadow DOM 内，只能通过 m-chips 的 change 事件取值 */
function onFilterChange(e: Event) {
  const value = (e as CustomEvent<{ value?: string }>).detail?.value
  if (value === 'all' || value === 'builtin' || value === 'custom') filter.value = value
}

const filtered = computed(() => {
  if (filter.value === 'custom') return props.dicts.filter(d => d.isCustom)
  if (filter.value === 'builtin') return props.dicts.filter(d => !d.isCustom)
  return props.dicts
})
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon name="menu_book" :size="18" /></span>
        {{ $t('my_dictionaries') }}
        <span class="m3e-head-actions">
          <m-button variant="text" @click="emit('add-word')">
            <span class="btn-inner"><MsIcon name="add" :size="18" />{{ $t('add_word') }}</span>
          </m-button>
        </span>
      </div>
      <m-chips selection="single" :value="filter" @change="onFilterChange">
        <m-chip value="all" :label="$t('m3e_filter_all')" />
        <m-chip value="builtin" :label="$t('m3e_filter_builtin')" />
        <m-chip value="custom" :label="$t('m3e_filter_custom')" />
      </m-chips>
      <div class="dict-grid">
        <m-card
          v-for="d in filtered"
          :key="d.id"
          class="dict-card"
          :class="{ hot: d.isCurrent }"
          :variant="d.isCurrent ? 'filled' : 'elevated'"
          @click="emit('open', d)"
        >
          <div class="card-body">
            <div class="name">
              <MsIcon :name="d.icon" :size="20" />
              {{ d.name }}
            </div>
            <div class="count">{{ d.progressSub || $t('m3e_words_count', { n: d.count }) }}</div>
          </div>
        </m-card>
        <m-card class="dict-card add" variant="outlined" @click="emit('add')">
          <div class="card-body">
            <div class="name">
              <MsIcon name="add" :size="20" />
              {{ $t('m3e_new_dict') }}
            </div>
          </div>
        </m-card>
      </div>
    </div>
  </m-card>
</template>

<style scoped lang="scss">
.btn-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dict-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.dict-card {
  cursor: pointer;
  border-radius: 16px;
  .card-body {
    padding: 16px;
    gap: 8px;
  }
  .name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--mtrl-sys-color-on-surface);
    :deep(.ms-icon) {
      color: var(--mtrl-sys-color-primary);
    }
  }
  .count {
    color: var(--mtrl-sys-color-on-surface-variant);
    font-size: 12px;
  }
  &.hot {
    background: var(--mtrl-sys-color-surface-container-high);
    .name {
      color: var(--mtrl-sys-color-primary);
    }
  }
  &.add {
    .card-body {
      align-items: center;
      justify-content: center;
      min-height: 96px;
    }
    .name {
      color: var(--mtrl-sys-color-on-surface-variant);
      justify-content: center;
    }
  }
}
</style>
