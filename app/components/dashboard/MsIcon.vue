<script setup lang="ts">
import { computed } from 'vue'
import { msIcons, type MsIconName } from './icons'

// 页面内 Material Symbols 图标（内联 SVG，尺寸跟随 font-size，颜色跟随 currentColor）
const props = defineProps<{
  name: MsIconName
  /** 图标尺寸（px），默认 24 */
  size?: number
}>()

const svg = computed(() => msIcons[props.name])
</script>

<template>
  <span class="ms-icon" :style="{ fontSize: (size ?? 24) + 'px' }" v-html="svg"></span>
</template>

<style scoped>
.ms-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex: 0 0 auto;
}
.ms-icon :deep(svg) {
  width: 1em;
  height: 1em;
  fill: currentColor;
  display: block;
}
</style>
