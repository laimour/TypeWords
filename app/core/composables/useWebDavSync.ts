import { get, set } from 'idb-keyval'
import { SAVE_DICT_KEY, SAVE_SETTING_KEY } from '../config/env'
import { _getDictDataByUrl, checkAndUpgradeSaveDict, checkAndUpgradeSaveSetting, shakeCommonDict } from '../utils'
import { DictType } from '../types/enum'
import type { SaveData } from '../types/types'
import type { BaseState } from '../stores'
import { useBaseStore, useRuntimeStore, useSettingStore } from '../stores'
import {
  getPracticeArticleCacheLocalWithMeta,
  getPracticeWordCacheLocalWithMeta,
  PRACTICE_ARTICLE_CACHE,
  PRACTICE_WORD_CACHE,
  setPracticeArticleCacheLocal,
  setPracticeWordCacheLocal,
} from '../utils/cache'
import { getWebDavConfig, isWebDavConfigured, setWebDavStatus, type WebDavConfig } from '../utils/webdav'
import { WebDavError, webdavEnsureDirectory, webdavGetText, webdavPutText, webdavTest } from '../utils/webdav-client'
import { mergeSnapshots, type MergeStats, type WebDavSnapshot } from '../utils/webdav-merge'
import { useDataSyncPersistence } from './useDataSyncPersistence'

/** 远端快照文件名，位于 `{WebDAV 根}/{同步目录}/data.json` */
export const WEBDAV_SNAPSHOT_FILE = 'data.json'

/** 同一次同步窗口内，非强制触发的最小间隔（毫秒），避免启动时多个触发点叠加 */
const MIN_SYNC_INTERVAL = 3000

export interface WebDavSyncResult {
  ok: boolean
  skipped?: 'not-configured' | 'syncing' | 'busy' | 'blocked'
  message?: string
  errorCode?: string
  stats?: MergeStats
}

let inFlight: Promise<WebDavSyncResult> | null = null
let lastSuccessAt = 0

type SaveMeta = { val?: unknown; version?: number; updated_at?: string }

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
}

async function readSaveMeta(key: string): Promise<SaveMeta | null> {
  try {
    const raw = await get(key)
    if (!raw) return null
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as SaveMeta
  } catch {
    return null
  }
}

/** 把 WebDavError 或其它异常统一成 { code, message } */
function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof WebDavError) {
    return { code: error.code, message: error.message }
  }
  const err = error as Error
  const message = err?.message ?? String(error)
  if (message.includes('UNSUPPORTED_SCHEMA')) {
    return { code: 'unsupported', message }
  }
  if (/fetch|network|load failed/i.test(message) && err?.name === 'TypeError') {
    return { code: 'cors', message }
  }
  return { code: 'network', message }
}

function serializeSaveData(meta: SaveMeta | null, val: unknown, version: number): SaveData {
  return {
    val,
    version: typeof meta?.version === 'number' ? meta.version : version,
    updated_at: meta?.updated_at,
  }
}

export function useWebDavSync() {
  const store = useBaseStore()
  const settingStore = useSettingStore()
  const runtimeStore = useRuntimeStore()
  const dataSync = useDataSyncPersistence()

  /** 从内存 store + IndexedDB meta 组装本地快照（dict 走 shake，官方词典不落盘词条） */
  async function buildLocalSnapshot(): Promise<WebDavSnapshot> {
    const nowIso = new Date().toISOString()
    const [dictMeta, settingMeta, practiceWordMeta, practiceArticleMeta] = await Promise.all([
      readSaveMeta(SAVE_DICT_KEY.key),
      readSaveMeta(SAVE_SETTING_KEY.key),
      getPracticeWordCacheLocalWithMeta().catch(() => null),
      getPracticeArticleCacheLocalWithMeta().catch(() => null),
    ])

    const dictData = serializeSaveData(dictMeta, shakeCommonDict(store.$state), SAVE_DICT_KEY.version)
    const settingData = serializeSaveData(
      settingMeta,
      JSON.parse(JSON.stringify(settingStore.$state)),
      SAVE_SETTING_KEY.version
    )
    // 注意：本地没有 updated_at 时保持 undefined，不能兜底成 now。
    // 否则新设备第一次同步会被判定为「本地最新」，永远拉不到远端设置。

    return {
      meta: { schema: 1, app: 'typewords', updatedAt: nowIso },
      data: {
        dict: dictData,
        setting: settingData,
        practiceWord: practiceWordMeta?.val
          ? {
              val: practiceWordMeta.val,
              version: practiceWordMeta.version ?? PRACTICE_WORD_CACHE.version,
              updated_at: practiceWordMeta.updated_at,
            }
          : null,
        practiceArticle: practiceArticleMeta?.val
          ? {
              val: practiceArticleMeta.val,
              version: practiceArticleMeta.version ?? PRACTICE_ARTICLE_CACHE.version,
              updated_at: practiceArticleMeta.updated_at,
            }
          : null,
      },
    }
  }

  async function readRemoteSnapshot(config: WebDavConfig): Promise<WebDavSnapshot | null> {
    const text = await webdavGetText(config, [config.directory, WEBDAV_SNAPSHOT_FILE])
    if (!text) return null
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new WebDavError('远端 data.json 不是合法 JSON，已中止同步以避免覆盖', 'server')
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
      throw new WebDavError('远端 data.json 数据结构无效，已中止同步以避免覆盖', 'server')
    }
    const schema = Number(parsed.meta?.schema ?? 0)
    if (Number.isFinite(schema) && schema > 1) {
      throw new Error(`UNSUPPORTED_SCHEMA:${schema}`)
    }
    return parsed as WebDavSnapshot
  }

  /** 官方词典的词条不落盘，应用存档后需要按需补拉（与 useDataSyncPersistence 的 applyDictData 一致） */
  function applyDictState(data: BaseState) {
    store.setState(data)
    if (store.word.studyIndex >= 3) {
      if (!store.sdict.custom && !store.sdict.system && !store.sdict.words.length) {
        _getDictDataByUrl(store.sdict).then(r => {
          store.word.bookList[store.word.studyIndex] = r
        })
      }
    }
    if (store.article.studyIndex >= 1) {
      if (!store.sbook.custom && !store.sbook.system && !store.sbook.articles.length) {
        _getDictDataByUrl(store.sbook, DictType.article).then(r => {
          store.article.bookList[store.article.studyIndex] = r
        })
      }
    }
  }

  /** 把合并结果写回本地（store + IndexedDB），期间屏蔽 $subscribe 的保存回写 */
  async function applyMergedSnapshot(snapshot: WebDavSnapshot, local: WebDavSnapshot): Promise<void> {
    runtimeStore.globalLoading = true
    try {
      const dictData = snapshot.data.dict
      if (dictData) {
        const normalized = await checkAndUpgradeSaveDict({ val: dictData.val, version: dictData.version })
        normalized.load = true
        normalized._ignoreWatch = true
        // 内容没变化就不重建 store（$reset + $patch 会替换所有响应式引用，代价不小）
        const changed = safeStringify(dictData.val) !== safeStringify(local.data.dict?.val)
        if (changed) applyDictState(normalized)
        await set(
          SAVE_DICT_KEY.key,
          JSON.stringify({ val: normalized, version: SAVE_DICT_KEY.version, updated_at: dictData.updated_at })
        )
      }

      const settingData = snapshot.data.setting
      if (settingData) {
        const normalized = await checkAndUpgradeSaveSetting({ val: settingData.val, version: settingData.version })
        normalized.load = true
        normalized._ignoreWatch = true
        if (safeStringify(settingData.val) !== safeStringify(local.data.setting?.val)) {
          settingStore.setState(normalized)
        }
        await set(
          SAVE_SETTING_KEY.key,
          JSON.stringify({ val: normalized, version: SAVE_SETTING_KEY.version, updated_at: settingData.updated_at })
        )
      }

      const practiceWord = snapshot.data.practiceWord
      if (practiceWord) {
        await setPracticeWordCacheLocal(practiceWord.val, practiceWord.updated_at)
      }
      const practiceArticle = snapshot.data.practiceArticle
      if (practiceArticle) {
        await setPracticeArticleCacheLocal(practiceArticle.val, practiceArticle.updated_at)
      }
    } finally {
      runtimeStore.globalLoading = false
    }
  }

  /**
   * 等本地存档应用完成再同步。
   * 子页面（/words）的 onMounted 早于布局的 init()，若此时直接取 store.$state，
   * 拿到的是默认词典（3 个系统词典、没有自定义词典），会把默认数据合并进远端/覆盖内存。
   */
  function waitForStoresReady(timeoutMs = 15000): Promise<void> {
    if (store.load && settingStore.load) return Promise.resolve()
    return new Promise<void>(resolve => {
      const startedAt = Date.now()
      const timer = setInterval(() => {
        if ((store.load && settingStore.load) || Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  }

  /** 真正的同步流程：确保目录 → 拉远端 → 合并 → 覆盖本地 → 全量覆盖远端 */
  async function runSync(): Promise<WebDavSyncResult> {
    const config = getWebDavConfig()
    if (!config) {
      setWebDavStatus('idle')
      return { ok: false, skipped: 'not-configured' }
    }

    await waitForStoresReady()

    // 自定义文章里的本地音频无法上传，直接拦截（与旧 Supabase 行为一致）
    const blockReason = dataSync.getDictSyncBlockReason(store.$state)
    if (blockReason) {
      setWebDavStatus('error', blockReason, 'blocked')
      return { ok: false, skipped: 'blocked', message: blockReason, errorCode: 'blocked' }
    }

    setWebDavStatus('syncing')
    try {
      await webdavEnsureDirectory(config, [config.directory])
      const remote = await readRemoteSnapshot(config)
      const local = await buildLocalSnapshot()
      const { merged, stats } = mergeSnapshots(local, remote)
      await applyMergedSnapshot(merged, local)
      await webdavPutText(config, [config.directory, WEBDAV_SNAPSHOT_FILE], JSON.stringify(merged))
      setWebDavStatus('success')
      lastSuccessAt = Date.now()
      return { ok: true, stats }
    } catch (error) {
      const { code, message } = describeError(error)
      console.error('[webdav] sync failed', code, message, error)
      setWebDavStatus('error', message, code)
      return { ok: false, message, errorCode: code }
    }
  }

  async function syncAll(options: { reason?: string; force?: boolean } = {}): Promise<WebDavSyncResult> {
    if (inFlight) return inFlight
    if (!isWebDavConfigured()) {
      setWebDavStatus('idle')
      return { ok: false, skipped: 'not-configured' }
    }
    if (!options.force && Date.now() - lastSuccessAt < MIN_SYNC_INTERVAL) {
      return { ok: true, skipped: 'syncing' }
    }
    if (runtimeStore.globalLoading) {
      return { ok: false, skipped: 'busy' }
    }

    let task: Promise<WebDavSyncResult>
    task = runSync().finally(() => {
      if (inFlight === task) inFlight = null
    })
    inFlight = task
    return task
  }

  /** 设置页「保存并测试连接」：验证账号密码 + 目录可写，不做数据合并 */
  async function testConnection(): Promise<WebDavSyncResult> {
    const config = getWebDavConfig()
    if (!config) return { ok: false, skipped: 'not-configured' }
    setWebDavStatus('syncing')
    try {
      await webdavTest(config)
      await webdavEnsureDirectory(config, [config.directory])
      setWebDavStatus('idle')
      return { ok: true }
    } catch (error) {
      const { code, message } = describeError(error)
      setWebDavStatus('error', message, code)
      return { ok: false, message, errorCode: code }
    }
  }

  /**
   * 不做合并，直接用本地全量覆盖远端。
   * 用于「导入备份 / 恢复历史版本 / 清空所有数据」这类明确要求覆盖的场景，
   * 否则合并会把远端旧数据又拉回本地。
   */
  async function overwriteRemote(): Promise<WebDavSyncResult> {
    if (inFlight) return inFlight
    const config = getWebDavConfig()
    if (!config) {
      setWebDavStatus('idle')
      return { ok: false, skipped: 'not-configured' }
    }
    setWebDavStatus('syncing')
    try {
      await webdavEnsureDirectory(config, [config.directory])
      const local = await buildLocalSnapshot()
      await webdavPutText(config, [config.directory, WEBDAV_SNAPSHOT_FILE], JSON.stringify(local))
      setWebDavStatus('success')
      lastSuccessAt = Date.now()
      return { ok: true }
    } catch (error) {
      const { code, message } = describeError(error)
      console.error('[webdav] overwrite failed', code, message, error)
      setWebDavStatus('error', message, code)
      return { ok: false, message, errorCode: code }
    }
  }

  return {
    isConfigured: isWebDavConfigured,
    syncAll,
    testConnection,
    overwriteRemote,
  }
}
