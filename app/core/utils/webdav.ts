import { useRuntimeStore } from '../stores'

/**
 * WebDAV 云同步配置与状态。
 *
 * 设计要点：
 * - 配置存 localStorage（明文，和其他本地配置一致；服务商要求的都是「应用密码」而不是登录密码）
 * - 同步状态镜像到 runtimeStore，供主页圆形按钮 / 设置页响应式读取
 * - 不在这里发起网络请求，传输层见 `webdav-client.ts`，编排见 `useWebDavSync.ts`
 */

export const WEBDAV_CONFIG_KEY = 'webdav_config'

export const DEFAULT_WEBDAV_DIRECTORY = 'typewords-data'

export type WebDavStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface WebDavConfig {
  /** 服务商 id，见 WEBDAV_PROVIDERS；自建为 custom */
  provider: string
  /** WebDAV 根地址，可能带结尾斜杠 */
  url: string
  username: string
  /** 应用密码（坚果云等必须用应用密码） */
  password: string
  /** WebDAV 根目录下的同步子目录名 */
  directory: string
  /** 最近一次同步成功时间戳（毫秒） */
  lastSyncAt?: number
}

export interface WebDavProviderPreset {
  id: string
  label: string
  /** 地址模板，可含 {host}；不含占位符时选中即直接填充 */
  url: string
  docs?: string
  hint?: string
  /** 需要用户额外填写主机（模板含 {host}） */
  needsHost?: boolean
  /** 需要「应用密码」 */
  appPassword?: boolean
}

export const WEBDAV_PROVIDERS: WebDavProviderPreset[] = [
  {
    id: 'custom',
    label: '自定义 / 自建',
    url: '',
    hint: '填写完整的 WebDAV 根地址（例如 https://example.com/dav/）',
  },
  {
    id: 'jianguoyun',
    label: '坚果云 (Nutstore)',
    url: 'https://dav.jianguoyun.com/dav/',
    docs: 'https://help.jianguoyun.com/?p=2064',
    hint: '账号填坚果云登录邮箱；密码必须在「账户信息 → 安全选项 → 第三方应用管理」里生成应用密码',
    appPassword: true,
  },
  {
    id: 'infinicloud',
    label: 'InfiniCLOUD (原 TeraCloud)',
    url: 'https://{host}/dav/',
    docs: 'https://infini-cloud.net/ja/support_service_aboutwebdav.html',
    hint: '主机形如 xxxx.infini-cloud.net 或 xxxx.teracloud.jp；需在 mypage 开启「外部アプリ接続を許可する」并生成应用密码',
    needsHost: true,
    appPassword: true,
  },
  {
    id: 'nextcloud',
    label: 'Nextcloud',
    url: 'https://{host}/remote.php/dav/files/{username}/',
    docs: 'https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html',
    hint: '主机形如 cloud.example.com；强烈建议使用「应用密码」，比登录密码快很多',
    needsHost: true,
    appPassword: true,
  },
  {
    id: 'owncloud',
    label: 'ownCloud',
    url: 'https://{host}/remote.php/dav/files/{username}/',
    docs: 'https://doc.owncloud.com/server/10.16/classic_ui/files/access_webdav.html',
    hint: '主机形如 cloud.example.com；旧版服务端也可改成 https://{host}/remote.php/webdav',
    needsHost: true,
  },
  {
    id: 'synology',
    label: '群晖 DSM (Synology)',
    url: 'https://{host}:5006/',
    docs: 'https://kb.synology.cn/zh-cn/DSM/help/WebDAVServer/webdav_server',
    hint: '需先在套件中心安装并启动 WebDAV Server；HTTPS 默认 5006，HTTP 默认 5005',
    needsHost: true,
  },
  {
    id: 'qnap',
    label: '威联通 QTS (QNAP)',
    url: 'https://{host}:8081/',
    docs: 'https://docs.qnap.com/operating-system/qts/5.0.x/zh-cn/配置-webdav-设置-CDDF133D.html',
    hint: '需先在控制台启用 WebDAV 服务；端口以控制台显示为准（常见 8080/8081）',
    needsHost: true,
  },
  {
    id: 'pcloud',
    label: 'pCloud',
    url: 'https://webdav.pcloud.com/',
    docs: 'https://help.pcloud.com/article/connect-to-pcloud-using-webdav-and-rsync',
    hint: '美国区用 webdav.pcloud.com，欧洲区需改成 https://ewebdav.pcloud.com；账号为注册邮箱与登录密码',
  },
  {
    id: 'yandex',
    label: 'Yandex Disk',
    url: 'https://webdav.yandex.ru/',
    docs: 'https://yandex.com/support/yandex-360/customers/disk/web/en/webdav',
    hint: '需在 Yandex ID → 安全 → 应用密码里生成 WebDAV 专用密码',
    appPassword: true,
  },
  {
    id: 'koofr',
    label: 'Koofr',
    url: 'https://app.koofr.net/dav/Koofr',
    docs: 'https://koofr.eu/help/koofr_with_webdav/how-do-i-connect-a-service-to-koofr-through-webdav/',
    hint: '账号为注册邮箱，密码需在 Koofr 网页版生成应用专用密码',
    appPassword: true,
  },
  {
    id: '123pan',
    label: '123云盘',
    url: 'https://{host}/webdav',
    docs: 'https://www.123pan.com/',
    hint: '需会员；在网页「工具中心 → 第三方挂载 → WebDAV 授权管理」添加应用并复制它给出的完整地址',
    needsHost: true,
    appPassword: true,
  },
]

const defaultConfig: WebDavConfig = {
  provider: 'custom',
  url: '',
  username: '',
  password: '',
  directory: DEFAULT_WEBDAV_DIRECTORY,
}

/** 目录名非法字符（Windows / 常见网盘不允许） */
const INVALID_DIR_CHARS = /[\\/:*?"<>|\u0000-\u001f]/

export function sanitizeWebDavDirectory(raw: unknown): string {
  const str = typeof raw === 'string' ? raw.trim() : ''
  const stripped = str.replace(/^\/+|\/+$/g, '').trim()
  if (!stripped) return DEFAULT_WEBDAV_DIRECTORY
  if (INVALID_DIR_CHARS.test(stripped)) return DEFAULT_WEBDAV_DIRECTORY
  if (stripped === '.' || stripped === '..') return DEFAULT_WEBDAV_DIRECTORY
  return stripped
}

export function isValidWebDavDirectory(raw: unknown): boolean {
  const str = typeof raw === 'string' ? raw.trim() : ''
  if (!str) return false
  const stripped = str.replace(/^\/+|\/+$/g, '').trim()
  if (!stripped || stripped === '.' || stripped === '..') return false
  return !INVALID_DIR_CHARS.test(stripped)
}

export function normalizeWebDavDirectory(raw: unknown): string {
  return sanitizeWebDavDirectory(raw)
}

/** 原样读取配置（不做完整性校验），供设置页回填表单 */
export function getWebDavConfigRaw(): Partial<WebDavConfig> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(WEBDAV_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WebDavConfig>
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** 读取可用配置：url / username / password 缺一不可，否则返回 null */
export function getWebDavConfig(): WebDavConfig | null {
  const raw = getWebDavConfigRaw()
  if (!raw) return null
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  const username = typeof raw.username === 'string' ? raw.username.trim() : ''
  const password = typeof raw.password === 'string' ? raw.password : ''
  if (!url || !username || !password) return null
  return {
    provider: typeof raw.provider === 'string' && raw.provider ? raw.provider : 'custom',
    url,
    username,
    password,
    directory: sanitizeWebDavDirectory(raw.directory),
    lastSyncAt: typeof raw.lastSyncAt === 'number' ? raw.lastSyncAt : undefined,
  }
}

export function setWebDavConfig(partial: Partial<WebDavConfig>): void {
  if (typeof localStorage === 'undefined') return
  const current = getWebDavConfigRaw() ?? {}
  const next: Partial<WebDavConfig> = {
    ...current,
    ...partial,
  }
  if (partial.directory !== undefined) {
    next.directory = sanitizeWebDavDirectory(partial.directory)
  }
  localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(next))
}

export function removeWebDavConfig(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(WEBDAV_CONFIG_KEY)
}

export function isWebDavConfigured(): boolean {
  return !!getWebDavConfig()
}

/** 把根地址与目录拼起来，保证结尾斜杠；用于 PROPFIND / 拼接文件 URL */
export function joinWebDavUrl(baseUrl: string, dir?: string): string {
  const base = (baseUrl ?? '').trim()
  if (!base) return ''
  const dirName = sanitizeWebDavDirectory(dir)
  const baseWithSlash = base.endsWith('/') ? base : `${base}/`
  return `${baseWithSlash}${dirName}/`
}

export function getWebDavStatus(): {
  status: WebDavStatus
  message?: string
  errorCode?: string
  lastSyncAt?: number
} {
  try {
    const store = useRuntimeStore()
    return {
      status: store.webdavStatus,
      message: store.webdavMessage || undefined,
      errorCode: store.webdavErrorCode || undefined,
      lastSyncAt: store.webdavLastSyncAt || undefined,
    }
  } catch {
    return { status: 'idle' }
  }
}

export function setWebDavStatus(status: WebDavStatus, message?: string, errorCode?: string): void {
  try {
    const store = useRuntimeStore()
    store.webdavStatus = status
    if (status === 'error') {
      store.webdavMessage = message ?? ''
      store.webdavErrorCode = errorCode ?? ''
    } else {
      store.webdavMessage = message ?? ''
      store.webdavErrorCode = ''
    }
    if (status === 'success') {
      store.webdavLastSyncAt = Date.now()
    }
  } catch {
    // 在 store 未初始化时静默失败（例如极早期启动）
  }
  if (status === 'success') {
    setWebDavConfig({ lastSyncAt: Date.now() })
  }
}

/** 把技术错误翻译成用户可读文案的 key（由调用方 i18n） */
export function getWebDavErrorKey(code?: string): string {
  switch (code) {
    case 'auth':
    case 'forbidden':
      return 'webdav_error_auth'
    case 'cors':
      return 'webdav_error_cors'
    case 'invalid-url':
    case 'not-found':
      return 'webdav_error_url'
    case 'conflict':
      return 'webdav_error_conflict'
    case 'unsupported':
      return 'webdav_unsupported'
    case 'blocked':
      return 'custom_audio_sync_disabled'
    case 'server':
      return 'webdav_error_server'
    default:
      return 'webdav_error_network'
  }
}
