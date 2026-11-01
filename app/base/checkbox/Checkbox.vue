<template>
  <label class="checkbox" :class="{ 'is-disabled': disabled }" @click.stop>
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="change"
    />
    <span class="checkbox-box">
      <span class="checkbox-inner"></span>
    </span>
    <span class="checkbox-label"><slot/></span>
  </label>
</template>

<script setup lang="ts">
defineProps({
  modelValue: Boolean,
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'click', 'onChange'])

function change($event) {
  emit('update:modelValue', $event.target.checked)
  emit('onChange', $event.target.checked)
}
</script>

<style lang="scss" scoped>
.checkbox {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;

  input {
    display: none;
  }

  .checkbox-box {
    position: relative;
    width: 18px;
    height: 18px;
    border: 2px solid var(--md-sys-color-on-surface-variant);
    border-radius: 2px;
    background-color: transparent;
    margin-right: 8px;
    transition: background-color 0.2s ease, border-color 0.2s ease;

    .checkbox-inner {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 8px;
      height: 8px;
      background-color: var(--md-sys-color-on-primary);
      opacity: 0;
      transition: opacity 0.2s ease;
      border-radius: 1px;
    }
  }

  input:checked + .checkbox-box {
    background-color: var(--md-sys-color-primary);
    border-color: var(--md-sys-color-primary);
  }

  input:checked + .checkbox-box .checkbox-inner {
    opacity: 1;
  }

  &:hover .checkbox-box {
    border-color: var(--md-sys-color-primary);
  }

  .checkbox-label {
    font-size: 14px;
    color: var(--md-sys-color-on-surface);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.38;

    .checkbox-box {
      border-color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
    }
  }
}
</style>
