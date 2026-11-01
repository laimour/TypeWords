<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from './Tooltip.vue'
import type { ButtonProps } from './types.ts'

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'primary',
  size: 'normal',
})

defineEmits(['click'])

const loadingColor = computed(() => {
  if (props.type === 'info') return 'var(--md-sys-color-on-secondary-container)'
  if (props.type === 'text') return 'var(--md-sys-color-primary)'
  if (props.type === 'orange') return 'var(--md-sys-color-on-tertiary)'
  return 'var(--md-sys-color-on-primary)'
})
</script>

<template>
  <Tooltip :disabled="!keyboard" :title="`${keyboard}`">
    <div
      class="base-button"
      v-bind="$attrs"
      @click="e => !disabled && !loading && $emit('click', e)"
      :class="[active && 'active', size, type, (disabled || loading) && 'disabled']"
    >
      <span :style="{ opacity: loading ? 0 : 1 }"><slot></slot></span>
      <IconEosIconsLoading v-if="loading" class="loading" width="18" :color="loadingColor" />
    </div>
  </Tooltip>
</template>

<style scoped lang="scss">
.base-button {
  position: relative;
  cursor: pointer;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  outline: none;
  text-align: center;
  user-select: none;
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  border-radius: var(--md-sys-shape-full);
  padding: 0 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  height: 2.5rem;
  color: var(--md-sys-color-on-primary);
  background: transparent;
  transition: box-shadow 0.2s ease, background-color 0.2s ease, color 0.2s ease;

  /* MD3 state layer */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: currentColor;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  &:hover::before {
    opacity: var(--md-sys-state-hover-opacity);
  }

  &:active::before {
    opacity: var(--md-sys-state-pressed-opacity);
  }

  & + .base-button {
    margin-left: 0.75rem;
  }

  &.disabled {
    cursor: not-allowed;
    user-select: none;
    pointer-events: none;
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
    color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
    box-shadow: none;
  }

  .loading {
    position: absolute;
  }

  &.small {
    padding: 0 1rem;
    height: 2rem;
    font-size: 0.8125rem;
  }

  &.large {
    padding: 0 1.75rem;
    height: 3rem;
    font-size: 1rem;
  }

  & > span {
    position: relative;
    z-index: 1;
    line-height: 1;
    display: inline-flex;
    align-items: center;

    :deep(a) {
      color: inherit;
    }
  }

  &.primary {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);

    &:hover {
      box-shadow: var(--md-sys-elevation-1);
    }
  }

  &.info {
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);

    &:hover {
      box-shadow: var(--md-sys-elevation-1);
    }
  }

  &.text {
    background: transparent;
    color: var(--md-sys-color-primary);
  }

  &.orange {
    background: var(--md-sys-color-tertiary);
    color: var(--md-sys-color-on-tertiary);

    &:hover {
      box-shadow: var(--md-sys-elevation-1);
    }
  }

  &.active {
    opacity: 0.6;
  }

  &.primary.disabled,
  &.info.disabled,
  &.orange.disabled,
  &.text.disabled {
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
    color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
    box-shadow: none;
  }
}
</style>
