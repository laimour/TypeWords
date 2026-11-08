<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { BaseButton, BaseInput, Form, FormItem, Option, PopConfirm, Select, Toast, type FormType } from '@/base'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { useWebDavSync } from '@/core/composables/useWebDavSync'
import {
  DEFAULT_WEBDAV_DIRECTORY,
  WEBDAV_PROVIDERS,
  getWebDavConfigRaw,
  getWebDavErrorKey,
  isWebDavConfigured,
  isValidWebDavDirectory,
  normalizeWebDavDirectory,
  removeWebDavConfig,
  setWebDavConfig,
  setWebDavStatus,
} from '@/core/utils/webdav'
import SettingItem from './SettingItem.vue'

const props = withDefaults(
  defineProps<{
    /** 自定义文章里有自定义音频时不允许同步（由设置页传入） */
    canSyncToServe?: boolean
  }>(),
  {
    canSyncToServe: true,
  }
)

const { t } = useI18n()
const runtimeStore = useRuntimeStore()
const webdavSync = useWebDavSync()

const initialConfig = getWebDavConfigRaw() ?? {}
const initialProvider =
  WEBDAV_PROVIDERS.find(item => item.id === (initialConfig.provider || 'custom')) ?? WEBDAV_PROVIDERS[0]

const form = reactive({
  provider: initialProvider?.id ?? 'custom',
  url: typeof initialConfig.url === 'string' ? initialConfig.url : '',
  username: typeof initialConfig.username === 'string' ? initialConfig.username : '',
  password: typeof initialConfig.password === 'string' ? initialConfig.password : '',
  directory: normalizeWebDavDirectory(initialConfig.directory),
})

/** 上一次保存的目录，用于判断是否需要「先把旧目录同步完」 */
const previousDirectory = ref(normalizeWebDavDirectory(initialConfig.directory))
/** 是否已有可用配置（本地 localStorage 里有完整 url / username / password） */
const configured = ref(isWebDavConfigured())
const saving = ref(false)
const manualSyncing = ref(false)
const formRef = ref<FormType>()

/**
 * 「服务商地址模板」相关状态：
 * - urlTemplate 非空表示当前地址由模板自动生成（含 {username}）
 * - manualUrl 为 true 表示用户手动改过地址，账号变化时不再自动覆盖
 */
const initialUrlTemplate =
  initialProvider?.url?.includes('{username}') && !initialProvider.url.includes('{host}') ? initialProvider.url : ''
const urlTemplate = ref(initialUrlTemplate)
const manualUrl = ref(!!initialUrlTemplate && form.url !== fillUsername(initialUrlTemplate, form.username.trim()))

const currentPreset = computed(() => WEBDAV_PROVIDERS.find(item => item.id === form.provider))
const needsHost = computed(() => !!currentPreset.value?.url?.includes('{host}'))
const hintText = computed(() => {
  if (needsHost.value) return t('webdav_need_host')
  return currentPreset.value?.hint ?? ''
})

const isSyncing = computed(() => runtimeStore.webdavStatus === 'syncing')
const busy = computed(() => saving.value || manualSyncing.value || isSyncing.value)

/** 地址输入框的占位提示：直接展示所选服务商的地址模板，用户照着填 */
const urlPlaceholder = computed(() => {
  const template = currentPreset.value?.url ?? ''
  if (!template) return t('webdav_server_url')
  return fillUsername(template, form.username.trim() || 'username')
})

const statusClass = computed(() => {
  switch (runtimeStore.webdavStatus) {
    case 'syncing':
      return 'is-syncing'
    case 'success':
      return 'is-success'
    case 'error':
      return 'is-error'
    default:
      return 'is-idle'
  }
})

const statusText = computed(() => {
  switch (runtimeStore.webdavStatus) {
    case 'syncing':
      return t('webdav_status_syncing')
    case 'success':
      return t('webdav_status_success')
    case 'error':
      return t('webdav_status_error')
    default:
      return t('webdav_status_idle')
  }
})

/** 失败原因：优先按错误码映射成可读文案，技术细节放括号里 */
const statusDetail = computed(() => {
  if (runtimeStore.webdavStatus !== 'error') return ''
  const readable = runtimeStore.webdavErrorCode ? t(getWebDavErrorKey(runtimeStore.webdavErrorCode)) : ''
  const detail = (runtimeStore.webdavMessage ?? '').trim()
  if (readable && detail && detail !== readable) return `${readable}（${detail}）`
  return readable || detail
})

const lastSyncText = computed(() => {
  const lastSyncAt = runtimeStore.webdavLastSyncAt
  if (!lastSyncAt) return t('webdav_never_sync')
  return t('webdav_last_sync', { time: formatSyncTime(lastSyncAt) })
})

const formRules = {
  url: [{ required: true, message: t('webdav_url_required'), trigger: 'blur' }],
  username: [{ required: true, message: t('webdav_username_required'), trigger: 'blur' }],
  password: [{ required: true, message: t('webdav_password_required'), trigger: 'blur' }],
}

onMounted(() => {
  // 刷新页面后 runtimeStore 会重置，这里用本地配置里的 lastSyncAt 回填展示
  if (!runtimeStore.webdavLastSyncAt && typeof initialConfig.lastSyncAt === 'number') {
    runtimeStore.webdavLastSyncAt = initialConfig.lastSyncAt
  }
})

watch(
  () => form.provider,
  (id, oldId) => {
    if (!id || id === oldId) return
    applyProviderPreset(id)
  }
)

watch(
  () => form.username,
  name => {
    if (manualUrl.value) return
    if (!urlTemplate.value.includes('{username}')) return
    form.url = fillUsername(urlTemplate.value, name.trim())
  }
)

function fillUsername(template: string, name: string): string {
  return template.replace(/\{username\}/g, name)
}

/** 选中服务商后按模板填地址：含 {host} 留空并提示，含 {username} 用当前账号替换 */
function applyProviderPreset(id: string) {
  const preset = WEBDAV_PROVIDERS.find(item => item.id === id)
  if (!preset) return
  const template = preset.url ?? ''
  const byUsername = template.includes('{username}') && !template.includes('{host}')
  urlTemplate.value = byUsername ? template : ''
  manualUrl.value = false
  if (!template || template.includes('{host}')) {
    form.url = ''
  } else if (byUsername) {
    form.url = fillUsername(template, form.username.trim())
  } else {
    form.url = template
  }
}

function onUrlInput() {
  // 用户手动改过地址后，账号变化不再自动覆盖
  manualUrl.value = true
}

function formatSyncTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return ''
  }
}

/** 把同步/测试结果里的错误码与技术信息拼成可读原因 */
function errorText(result?: { errorCode?: string; message?: string } | null): string {
  const code = result?.errorCode || ''
  const detail = (result?.message ?? '').trim()
  if (code) {
    const readable = t(getWebDavErrorKey(code))
    return detail && detail !== readable ? `${readable}（${detail}）` : readable
  }
  if (detail) return detail
  // 结果里没有错误码时，回落到 runtime store 里最近一次同步的错误分类
  return runtimeStore.webdavErrorCode ? t(getWebDavErrorKey(runtimeStore.webdavErrorCode)) : t('webdav_error_network')
}

function onSaveAndTest() {
  if (!props.canSyncToServe || saving.value) return
  formRef.value?.validate(valid => {
    if (!valid) return
    void doSaveAndTest()
  })
}

async function doSaveAndTest() {
  if (saving.value) return
  if (!isValidWebDavDirectory(form.directory)) {
    Toast.error(t('webdav_dir_invalid'))
    return
  }
  const directory = normalizeWebDavDirectory(form.directory)
  saving.value = true
  try {
    // 目录改名：保存前先把旧目录的数据写完（失败不阻塞）
    if (directory !== previousDirectory.value) {
      try {
        await webdavSync.syncAll({ force: true })
      } catch (error) {
        console.warn('[webdav] 同步旧目录失败，继续切换目录', error)
      }
    }

    setWebDavConfig({
      provider: form.provider,
      url: form.url.trim(),
      username: form.username.trim(),
      password: form.password,
      directory,
    })
    form.directory = directory
    previousDirectory.value = directory
    configured.value = true

    const testResult = await webdavSync.testConnection()
    if (!testResult?.ok) {
      Toast.error(`${t('webdav_test_failed')}：${errorText(testResult)}`)
      return
    }
    Toast.success(t('webdav_test_success'))

    // testConnection 只验连接；成功后立刻做一次完整同步
    const syncResult = await webdavSync.syncAll({ force: true })
    if (!syncResult?.ok) {
      Toast.error(t('webdav_sync_failed_with_msg') + errorText(syncResult))
    }
  } catch (error) {
    Toast.error(`${t('webdav_test_failed')}：${(error as Error)?.message ?? String(error)}`)
  } finally {
    saving.value = false
  }
}

async function onManualSync() {
  if (!props.canSyncToServe || busy.value) return
  manualSyncing.value = true
  try {
    const result = await webdavSync.syncAll({ force: true })
    if (result?.ok) {
      Toast.success(t('webdav_sync_done'))
      return
    }
    if (result?.skipped === 'not-configured') {
      configured.value = false
      return
    }
    Toast.error(t('webdav_sync_failed_with_msg') + errorText(result))
  } finally {
    manualSyncing.value = false
  }
}

function onDeleteConfig() {
  removeWebDavConfig()
  setWebDavStatus('idle')
  runtimeStore.webdavLastSyncAt = 0
  configured.value = false
  resetForm()
  Toast.success(t('clear_success'))
}

function resetForm() {
  form.provider = 'custom'
  form.url = ''
  form.username = ''
  form.password = ''
  form.directory = DEFAULT_WEBDAV_DIRECTORY
  previousDirectory.value = DEFAULT_WEBDAV_DIRECTORY
  urlTemplate.value = ''
  manualUrl.value = false
}
</script>

<template>
  <div class="webdav-setting">
    <SettingItem :mainTitle="$t('webdav_sync_title')" :desc="$t('webdav_sync_desc')" />

    <div class="webdav-panel">
      <Form ref="formRef" :rules="formRules" :model="form">
        <FormItem :label="$t('webdav_provider')" prop="provider">
          <Select v-model="form.provider" :placeholder="$t('webdav_provider')" :disabled="!canSyncToServe">
            <Option v-for="item of WEBDAV_PROVIDERS" :key="item.id" :label="item.label" :value="item.id" />
          </Select>
        </FormItem>
        <FormItem :label="$t('webdav_server_url')" prop="url">
          <BaseInput v-model="form.url" :placeholder="urlPlaceholder" :disabled="!canSyncToServe" @input="onUrlInput" />
        </FormItem>
        <FormItem :label="$t('webdav_username')" prop="username">
          <BaseInput v-model="form.username" :disabled="!canSyncToServe" autocomplete="username" />
        </FormItem>
        <FormItem :label="$t('webdav_password')" prop="password">
          <BaseInput
            v-model="form.password"
            type="password"
            :placeholder="$t('webdav_password_hint')"
            :disabled="!canSyncToServe"
            autocomplete="current-password"
          />
        </FormItem>
        <FormItem :label="$t('webdav_directory')" prop="directory">
          <BaseInput v-model="form.directory" :placeholder="DEFAULT_WEBDAV_DIRECTORY" :disabled="!canSyncToServe" />
        </FormItem>
      </Form>

      <div v-if="hintText" class="webdav-hint">{{ hintText }}</div>
      <div class="webdav-hint">{{ $t('webdav_directory_desc') }}</div>
    </div>

    <div class="webdav-status">
      <div class="status-line">
        <span class="status-dot" :class="statusClass"></span>
        <span class="status-text" :class="statusClass">{{ statusText }}</span>
      </div>
      <div v-if="statusDetail" class="status-detail">{{ statusDetail }}</div>
      <div class="status-time">{{ lastSyncText }}</div>
    </div>

    <div class="webdav-actions">
      <PopConfirm :title="$t('webdav_delete_config')" @confirm="onDeleteConfig">
        <BaseButton size="large" type="info" :disabled="!canSyncToServe || busy">
          {{ $t('webdav_delete_config') }}
        </BaseButton>
      </PopConfirm>
      <BaseButton
        size="large"
        type="info"
        :loading="manualSyncing || (isSyncing && !saving)"
        :disabled="!canSyncToServe || !configured || busy"
        @click="onManualSync"
      >
        {{ $t('webdav_manual_sync') }}
      </BaseButton>
      <BaseButton size="large" :loading="saving" :disabled="!canSyncToServe || busy" @click="onSaveAndTest">
        {{ saving ? $t('webdav_testing') : $t('webdav_save_and_test') }}
      </BaseButton>
    </div>

    <!-- 自定义文章含自定义音频时，整块表单禁用 -->
    <div v-if="!canSyncToServe" class="webdav-mask">
      <div class="webdav-mask-text">{{ $t('custom_audio_sync_disabled') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.webdav-setting {
  position: relative;
}

.webdav-panel {
  margin-top: calc(var(--space) * 1.5);
  padding: calc(var(--space) * 2);
  border: 1px solid var(--color-line);
  border-radius: var(--md-sys-shape-lg);
  background: var(--md-sys-color-surface-container-low);
}

.webdav-hint {
  margin-top: calc(var(--space) * 0.6);
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--color-font-3);
}

.webdav-status {
  margin-top: calc(var(--space) * 2);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  .status-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
  }

  .status-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: var(--md-sys-shape-full);
    background: currentColor;
    flex: none;
  }

  .status-text {
    line-height: 1.4;
  }

  .status-detail {
    padding-left: calc(0.55rem + 0.5rem);
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--md-sys-color-error);
    word-break: break-word;
  }

  .status-time {
    padding-left: calc(0.55rem + 0.5rem);
    font-size: 0.85rem;
    color: var(--color-font-3);
  }

  .is-idle {
    color: var(--color-font-3);
  }

  .is-syncing {
    color: var(--md-sys-color-primary);
  }

  .is-success {
    color: #2e7d32;
  }

  .is-error {
    color: var(--md-sys-color-error);
  }
}

.webdav-actions {
  margin-top: calc(var(--space) * 2);
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space);
}

.webdav-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space);
  border-radius: var(--md-sys-shape-lg);
  background: color-mix(in srgb, var(--md-sys-color-surface) 82%, transparent);
  cursor: not-allowed;
  text-align: center;
}

.webdav-mask-text {
  font-weight: 600;
  line-height: 1.6;
  color: var(--md-sys-color-error);
}
</style>
