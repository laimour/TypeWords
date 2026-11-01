<script setup lang="ts">
import { ref, useAttrs, watch, computed, onUnmounted } from 'vue'
import Close from './icon/Close.vue'
import { useDisableEventListener } from '@/core/hooks/event'

const props = defineProps({
  modelValue: [String, Number],
  placeholder: String,
  disabled: Boolean,
  autofocus: Boolean,
  error: Boolean,
  type: {
    type: String,
    default: 'text',
  },
  clearable: {
    type: Boolean,
    default: false,
  },
  searchable: {
    type: Boolean,
    default: false,
  },
  searchLoading: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  maxLength: Number,
  size: {
    type: String,
    default: 'normal',
    validator: (value: string) => ['normal', 'large'].includes(value),
  },
})

const emit = defineEmits(['update:modelValue', 'input', 'change', 'focus', 'blur', 'validation', 'enter', 'search'])
const attrs = useAttrs()

const inputValue = ref(props.modelValue)
let focus = $ref(false)
let inputEl = $ref<HTMLDivElement>()
const passwordVisible = ref(false)

useDisableEventListener(() => focus)

const inputType = computed(() => {
  if (props.type === 'password') {
    return passwordVisible.value ? 'text' : 'password'
  }
  return props.type
})

const togglePasswordVisibility = () => {
  passwordVisible.value = !passwordVisible.value
}

watch(
  () => props.modelValue,
  val => {
    inputValue.value = val
  }
)

const onInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  inputValue.value = target.value
  emit('update:modelValue', target.value)
  emit('input', e)
  emit('change', e)
}

const onChange = (e: Event) => {
  emit('change', e)
}

const onFocus = (e: FocusEvent) => {
  focus = true
  emit('focus', e)
}

const onBlur = (e: FocusEvent) => {
  focus = false
  emit('blur', e)
}

const onEnter = (e: KeyboardEvent) => {
  emit('enter', e)
}

const clearInput = () => {
  inputValue.value = ''
  emit('update:modelValue', '')
}

const onSearch = () => {
  if (props.disabled || props.searchLoading) return
  emit('search')
}

const vFocus = {
  mounted: (el, bind) => {
    if (bind.value) {
      el.focus()
      setTimeout(() => (focus = true))
    }
  },
}
</script>

<template>
  <div
    class="base-input"
    ref="inputEl"
    :class="{ 'is-disabled': disabled, error: props.error, focus, [`base-input--${size}`]: true }"
  >
    <slot name="subfix"></slot>
    <!-- PreIcon slot -->
    <div v-if="$slots.preIcon" class="pre-icon">
      <slot name="preIcon"></slot>
    </div>
    <IconFluentLockClosed20Regular class="pre-icon" v-if="type === 'password'" />
    <IconFluentMail20Regular class="pre-icon" v-if="type === 'email'" />
    <IconFluentPhone20Regular class="pre-icon" v-if="type === 'tel'" />
    <IconFluentNumberSymbol20Regular class="pre-icon" v-if="type === 'code'" />

    <input
      v-bind="attrs"
      :type="inputType"
      :placeholder="placeholder"
      :disabled="disabled"
      :value="inputValue"
      @input="onInput"
      @change="onChange"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.enter="onEnter"
      class="inner"
      v-focus="autofocus"
      :maxlength="maxLength"
    />
    <slot name="prefix"></slot>
    <Close v-if="clearable && inputValue && !disabled" @click="clearInput" />
    <IconFluentSearch20Regular
      v-if="searchable && !disabled"
      class="search-toggle"
      :class="{ 'is-loading': searchLoading }"
      title="搜索"
      @click="onSearch"
    />
    <!-- Password visibility toggle -->
    <div
      v-if="type === 'password' && !disabled"
      class="password-toggle"
      @click="togglePasswordVisibility"
      :title="passwordVisible ? '隐藏密码' : '显示密码'"
    >
      <IconFluentEye16Regular v-if="!passwordVisible" />
      <IconFluentEyeOff16Regular v-else />
    </div>
  </div>
</template>

<style scoped lang="scss">
.base-input {
  position: relative;
  display: inline-flex;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-xs);
  overflow: hidden;
  padding: 0 0.75rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  align-items: center;
  min-height: 3rem;
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);

  ::placeholder {
    font-size: 0.875rem;
    color: var(--md-sys-color-on-surface-variant);
    opacity: 0.8;
  }

  &:hover:not(.focus):not(.error) {
    border-color: var(--md-sys-color-on-surface);
  }

  // normal size (default)
  &--normal {
    .inner {
      height: 2rem;
      font-size: 1rem;
    }
  }

  // large size
  &--large {
    padding: 0 1.5rem;
    border-radius: var(--md-sys-shape-xl);
    min-height: 3.5rem;

    .inner {
      height: 2.25rem;
      font-size: 1.0625rem;
    }
  }

  &.is-disabled {
    opacity: 0.6;
    background: color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent);
  }

  &.error {
    border-color: var(--md-sys-color-error);

    .inner {
      color: var(--md-sys-color-error);
    }
  }

  &.focus {
    border-color: var(--md-sys-color-primary);
    box-shadow: inset 0 0 0 1px var(--md-sys-color-primary);
    background: var(--md-sys-color-surface-container-lowest);
  }

  // PreIcon styling
  &.has-preicon {
    .inner {
      padding-left: 2rem;
    }
  }

  .pre-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-on-surface-variant);
    z-index: 1;
    pointer-events: none;
    margin-right: 0.25rem;
  }

  .inner {
    flex: 1;
    font-size: 1rem;
    outline: none;
    border: none;
    box-sizing: border-box;
    transition: color 0.2s ease;
    height: 2rem;
    color: var(--md-sys-color-on-surface);
    background: transparent;
    width: 100%;
  }

  .password-toggle,
  .search-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: 4px;
    border-radius: var(--md-sys-shape-full);
    cursor: pointer;
    color: var(--md-sys-color-on-surface-variant);
    transition: background-color 0.2s ease, opacity 0.2s ease;

    &:hover {
      background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
    }

    &.is-loading {
      opacity: 0.4;
      pointer-events: none;
    }
  }
}
</style>
