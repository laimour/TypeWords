<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface IProps {
  modelValue: boolean
  disabled?: boolean
  width?: number // 开关宽度，默认 40px
  activeText?: string // 开启状态显示文字
  inactiveText?: string // 关闭状态显示文字
  type?: 'primary' | 'info'
}

const props = withDefaults(defineProps<IProps>(), {
  activeText: '开',
  inactiveText: '关',
  type: 'primary',
})

const emit = defineEmits(['update:modelValue', 'change'])

const isChecked = ref(props.modelValue)

watch(
  () => props.modelValue,
  val => {
    isChecked.value = val
  }
)

const toggle = () => {
  if (props.disabled) return
  isChecked.value = !isChecked.value
  emit('update:modelValue', isChecked.value)
  emit('change', isChecked.value)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault()
    toggle()
  }
}

const switchWidth = computed(() => props.width ?? 52)
const switchHeight = computed(() => Math.round(switchWidth.value * 0.6))
const ballSize = computed(() => switchHeight.value - 8)
</script>

<template>
  <div
    class="switch"
    :class="{ checked: isChecked, disabled: disabled, [type]: true }"
    :tabindex="disabled ? -1 : 0"
    role="switch"
    :aria-checked="isChecked"
    @click="toggle"
    @keydown="onKeydown"
    :style="{ width: switchWidth + 'px', height: switchHeight + 'px', borderRadius: switchHeight + 'px' }"
  >
    <transition name="fade">
      <span class="text left" v-if="isChecked && activeText">{{ activeText }}</span>
    </transition>
    <div
      class="ball"
      :style="{
        width: ballSize + 'px',
        height: ballSize + 'px',
        transform: isChecked ? 'translateX(' + (switchWidth - ballSize - 4) + 'px)' : 'translateX(4px)',
      }"
    ></div>
    <transition name="fade">
      <span class="text right" v-if="!isChecked && inactiveText">{{ inactiveText }}</span>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.switch {
  @apply inline-flex items-center cursor-pointer user-select-none outline-none position-relative;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  border: 2px solid var(--md-sys-color-outline);
  background: var(--md-sys-color-surface-container-highest);
  box-sizing: content-box;

  .ball {
    @apply rounded-full absolute;
    background: var(--md-sys-color-outline);
    transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s ease, width 0.2s ease, height 0.2s ease;
  }

  .text {
    @apply absolute user-select-none;
    font-size: 0.625rem;
    color: var(--md-sys-color-on-surface-variant);
    &.left {
      @apply ml-2;
    }
    &.right {
      @apply right-2;
    }
  }

  &.primary,
  &.info {
    &.checked {
      background: var(--md-sys-color-primary);
      border-color: var(--md-sys-color-primary);

      .ball {
        background: var(--md-sys-color-on-primary);
      }
      .text {
        color: var(--md-sys-color-on-primary);
      }
    }
  }

  &.disabled {
    @apply cursor-not-allowed;
    opacity: 0.38;
  }
}
</style>
