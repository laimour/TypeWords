<script setup lang="ts">
import MsIcon from './MsIcon.vue'

// 推荐卡（demo/index.html 推荐卡实装版）：单行推荐 + 加入我的词典
defineProps<{
  name: string
  sub: string
}>()

const emit = defineEmits<{
  (e: 'add'): void
}>()
</script>

<template>
  <m-card class="m3e-card" variant="filled">
    <div class="m3e-card-body">
      <div class="m3e-card-title">
        <span class="m3e-title-chip"><MsIcon name="recommend" :size="18" /></span>
        {{ $t('recommend') }}
      </div>
      <div class="row">
        <div>
          <div class="rec-name">{{ name }}</div>
          <div class="m3e-card-sub">{{ sub }}</div>
        </div>
        <div class="grow"></div>
        <m-button variant="tonal" @click="emit('add')">{{ $t('m3e_join_dicts') }}</m-button>
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
.rec-name {
  font-weight: 600;
  color: var(--mtrl-sys-color-on-surface);
}
</style>
