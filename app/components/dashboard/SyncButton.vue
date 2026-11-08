<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { getWebDavErrorKey, isWebDavConfigured, setWebDavStatus } from '@/core/utils/webdav.ts'
import { useWebDavSync } from '@/core/composables/useWebDavSync.ts'

/**
 * 主页圆形 WebDAV 同步按钮（契约 8.1）。
 *
 * - 视觉状态由 runtimeStore.webdavStatus 决定，未配置 WebDAV 时恒为 idle（透明 + 同步图标）
 * - 未配置 → 跳转设置页第 7 个分区（?index=6）
 * - 已配置 → 触发一次强制全量同步（force 才会弹 toast）
 */
type SyncMode = 'idle' | 'syncing' | 'success' | 'error'

const router = useRouter()
const { t } = useI18n()
const runtimeStore = useRuntimeStore()

// localStorage 只在客户端可读：挂载后再取一次，避免 SSR 阶段误判为「未配置」
const hasConfig = ref(false)
onMounted(() => {
  hasConfig.value = isWebDavConfigured()
})

const mode = computed<SyncMode>(() => {
  if (!hasConfig.value) return 'idle'
  const status = runtimeStore.webdavStatus
  if (status === 'syncing' || status === 'success' || status === 'error') return status
  return 'idle'
})

const tip = computed(() => {
  if (!hasConfig.value) return t('webdav_btn_not_configured')
  switch (runtimeStore.webdavStatus) {
    case 'syncing':
      return t('webdav_btn_syncing')
    case 'success':
      return t('webdav_btn_success')
    case 'error': {
      // 错误分类 → i18n 文案（auth / cors / invalid-url / network / server / conflict …）
      const code = (runtimeStore.webdavErrorCode || '').trim()
      const message = (runtimeStore.webdavMessage || '').trim()
      const base = code ? t(getWebDavErrorKey(code)) : t('webdav_btn_error')
      return message ? `${base}（${message}）` : base
    }
    default:
      return t('webdav_btn_idle')
  }
})

async function handleClick() {
  // 已配置与否以磁盘配置为准（设置页可能刚改动过）
  hasConfig.value = isWebDavConfigured()
  if (!hasConfig.value) {
    router.push('/setting?index=6')
    return
  }
  if (runtimeStore.webdavStatus === 'syncing') return
  try {
    await useWebDavSync().syncAll({ reason: 'manual', force: true })
  } catch (err) {
    // 编排层通常会自行落状态；这里兜底，避免按钮永远停在 syncing
    const message = err instanceof Error ? err.message : String(err ?? '')
    setWebDavStatus('error', message, 'network')
  }
}
</script>

<template>
  <button
    type="button"
    class="sync-btn"
    :class="`is-${mode}`"
    :title="tip"
    :aria-label="tip"
    :aria-busy="mode === 'syncing' ? 'true' : 'false'"
    :aria-disabled="mode === 'syncing' ? 'true' : 'false'"
    @click="handleClick"
  >
    <IconFluentArrowSync20Regular v-if="mode === 'idle' || mode === 'syncing'" class="sync-btn__icon" />
    <IconFluentCheckmarkCircle20Filled v-else-if="mode === 'success'" class="sync-btn__icon" />
    <IconFluentErrorCircle20Filled v-else class="sync-btn__icon" />
  </button>
</template>

<style scoped lang="scss">
.sync-btn {
  /* 固定尺寸，任何状态/交互都不改变，避免页面抖动 */
  width: 40px;
  height: 40px;
  padding: 0;
  /* 放在页面标题行最右侧：与标题 div 同一 flex 行时自动靠右；非 flex 父级下也无副作用 */
  margin: 0 0 0 auto;
  flex: 0 0 auto;
  border: none;
  border-radius: 50%;
  background-color: transparent;
  color: var(--md-sys-color-on-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.2s,
    transform 0.2s;

  :deep(svg) {
    width: 20px;
    height: 20px;
    display: block;
  }

  &:hover {
    background-color: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  }

  &:active {
    transform: scale(0.94);
  }

  &:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }

  /* ---------------- idle / syncing：透明背景 + 同步图标 ---------------- */
  &.is-syncing {
    cursor: progress;
    :deep(svg) {
      animation: sync-btn-spin 0.9s linear infinite;
    }
    /* 同步中不接受 hover 反馈，避免视觉噪声 */
    &:hover {
      background-color: transparent;
    }
  }

  /* ---------------- success：绿色底 + 白勾 ---------------- */
  &.is-success {
    background-color: #2e7d32;
    color: #ffffff;
    &:hover {
      background-color: color-mix(in srgb, #2e7d32 88%, #ffffff);
    }
  }

  /* ---------------- error：黄色底 + 深色感叹号 ---------------- */
  &.is-error {
    background-color: #f9a825;
    color: #3b2f00;
    &:hover {
      background-color: color-mix(in srgb, #f9a825 88%, #ffffff);
    }
  }
}

@keyframes sync-btn-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
