import { APP_VERSION } from '../config/env'
import { debounce } from '../utils'
import type { BaseState, SettingState } from '../stores'
import { useBaseStore, useRuntimeStore, useSettingStore } from '../stores'
import { ensureHashGuardBeforeInit, useDataSyncPersistence } from './useDataSyncPersistence'
import { useWebDavSync } from './useWebDavSync'
import { SyncDataType } from '../types'
import type { SubscriptionCallbackMutation } from 'pinia'
import { onUnmounted } from 'vue'

let unsub = null
let unsub2 = null

export function useInit() {
  const store = useBaseStore()
  const settingStore = useSettingStore()
  const runtimeStore = useRuntimeStore()
  const dataSync = useDataSyncPersistence()
  const webdavSync = useWebDavSync()
  let initializing = false // 标记是否正在初始化
  let focus = true
  let fetching = false
  let fetching2 = false
  let restoreFetching = false

  /** 练习页有独立的会话状态，切回页面时不在这里同步，避免替换 store 引用打断练习 */
  const isPracticeRoute = () => /\/practice-(words|articles)\//.test(window.location.pathname)

  const onvisibilitychange = async () => {
    focus = !document.hidden
    if (!focus) return
    if (isPracticeRoute()) return
    try {
      if (restoreFetching) return
      restoreFetching = true
      // 切回页面时对齐一次远端（合并式同步，不会覆盖本地新增数据）
      await webdavSync.syncAll({ reason: 'visibility' })
    } finally {
      restoreFetching = false
    }
  }

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onvisibilitychange)
  })

  //init 有可能重复执行，因为从老网站导了数据之后需要 init
  async function init() {
    if (initializing) return
    initializing = true
    console.time('init')

    //先清理副作用，避免重复监听
    unsub?.()
    unsub2?.()
    document.removeEventListener('visibilitychange', onvisibilitychange)

    await ensureHashGuardBeforeInit()
    // 旧版本使用 Supabase 云同步，已由 WebDAV 取代：清掉遗留配置，避免后台继续请求旧后端
    try {
      localStorage.removeItem('supabase_config')
    } catch {
      // 忽略隐私模式下的存储异常
    }
    // await userStore.init()
    await store.init()
    await settingStore.init()
    settingStore.load = true
    store.load = true
    console.timeEnd('init')
    initializing = false // 初始化完成，允许保存数据

    //等数据全部准备好，再开启监听，避免循环保存-同步
    document.addEventListener('visibilitychange', onvisibilitychange)
    //用 $subscribe 替代 watch
    unsub = store.$subscribe(
      debounce(async (mutation, data: BaseState) => {
        if (fetching || !focus || runtimeStore.globalLoading || restoreFetching) return
        if (data._ignoreWatch) {
          data._ignoreWatch = false
          return
        }
        if (mutation.type === 'direct' && mutation.events?.key === '_ignoreWatch') {
          return
        }
        console.log('store.$subscribe', mutation, data, data._ignoreWatch)
        fetching = true
        try {
          await dataSync.saveDictState(data)
        } finally {
          fetching = false
        }
      }, 1000)
    )

    unsub2 = settingStore.$subscribe(
      debounce(async (mutation: SubscriptionCallbackMutation<SettingState>, data: SettingState) => {
        if (fetching2 || !focus || runtimeStore.globalLoading || restoreFetching) return
        console.log('settingStore.$subscribe', mutation, data, data._ignoreWatch)
        if (data._ignoreWatch) {
          data._ignoreWatch = false
          return
        }
        if (mutation.type === 'direct' && mutation.events?.key === '_ignoreWatch') {
          return
        }
        fetching2 = true
        try {
          await dataSync.saveLocalAndSync(SyncDataType.setting, data)
        } finally {
          fetching2 = false
        }
      }, 1000)
    )

    runtimeStore.isNew = APP_VERSION.version > Number(settingStore.webAppVersion)
    // runtimeStore.isNew = true
    window.umami?.track('host', { host: window.location.host })

    // 打开站点时同步一次（未配置 WebDAV 时内部直接跳过）
    void webdavSync.syncAll({ reason: 'startup' }).catch(() => {})
  }

  return init
}
