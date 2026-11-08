import type { WebDavConfig } from './webdav'
import { withAppBaseURL } from './base-url.ts'

/**
 * WebDAV 传输层（纯 fetch，无第三方依赖）。
 *
 * 传输策略（见 `.dsh/webdav-sync-contract.md` 第 2 节）：
 * 1. 优先 `POST /api/webdav` 同源代理（Nuxt/Nitro 部署时可用，避免第三方 WebDAV 的 CORS 限制）；
 * 2. 代理路由不存在或不可用时降级为浏览器直连（静态部署）；
 * 3. 首次确认代理不可用后记住结果，后续请求不再尝试代理；
 * 4. 所有请求串行执行，避免并发打到同一个 WebDAV 服务端。
 *
 * 注意：`segments` 是相对 `config.url` **根地址**的路径片段，
 * 例如读取快照用 `[config.directory, 'data.json']`，建目录用 `[config.directory]`。
 */

export type WebDavErrorCode =
  'invalid-url' | 'auth' | 'not-found' | 'forbidden' | 'conflict' | 'network' | 'cors' | 'server'

export class WebDavError extends Error {
  code: WebDavErrorCode
  status?: number

  constructor(message: string, code: WebDavErrorCode, status?: number) {
    super(message)
    this.name = 'WebDavError'
    this.code = code
    this.status = status
    // 兼容经 Babel/ES5 降级后 instanceof 失效的场景
    Object.setPrototypeOf(this, WebDavError.prototype)
  }
}

export interface WebDavRequestInit {
  method: 'GET' | 'PUT' | 'DELETE' | 'MKCOL' | 'PROPFIND' | 'HEAD'
  /** 相对 `config.url` 根地址的路径片段，例如 [config.directory, 'data.json'] */
  segments: string[]
  body?: string
  headers?: Record<string, string>
  /** 是否允许走服务端代理，默认 true */
  allowProxy?: boolean
}

/** 同源代理路由（见 `server/api/webdav.post.ts`）；支持非根 baseURL 部署 */
const WEBDAV_PROXY_PATH = '/api/webdav'

/** 直连超时（毫秒）：避免网络黑洞时同步 promise 永远挂着 */
const DIRECT_TIMEOUT_MS = 60_000

const PROPFIND_BODY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'

const XML_CONTENT_TYPE = 'application/xml; charset=utf-8'
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

/** 代理是否被判定为不可用（模块级，静态部署时只探测一次） */
let proxyUnavailable = false

/** 请求串行队列：同一时刻只允许一个 WebDAV 请求在飞 */
let requestQueue: Promise<unknown> = Promise.resolve()

/** 代理失败后返回 null，表示「本次请改用直连」 */
type ProxyResult = { status: number; body: string } | null

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 拆分 / 去空 / 去首尾斜杠，避免拼出 `//` 或空片段 */
function normalizeSegments(segments: string[] | undefined | null): string[] {
  if (!Array.isArray(segments)) return []
  const result: string[] = []
  for (const segment of segments) {
    if (typeof segment !== 'string') continue
    for (const part of segment.split('/')) {
      const trimmed = part.trim()
      if (trimmed) result.push(trimmed)
    }
  }
  return result
}

/** 拼接根地址与相对路径；URL 非法时抛 `invalid-url` */
function buildTargetUrl(config: WebDavConfig, segments: string[]): string {
  const rawRoot = typeof config?.url === 'string' ? config.url.trim() : ''
  if (!rawRoot) {
    throw new WebDavError('WebDAV 服务器地址为空', 'invalid-url')
  }
  const root = rawRoot.endsWith('/') ? rawRoot : `${rawRoot}/`
  if (!isHttpUrl(root)) {
    throw new WebDavError(`WebDAV 服务器地址无效（只支持 http/https）：${rawRoot}`, 'invalid-url')
  }
  if (!segments.length) return root
  const target = `${root}${segments.map(segment => encodeURIComponent(segment)).join('/')}`
  if (!isHttpUrl(target)) {
    throw new WebDavError(`WebDAV 请求地址无效：${target}`, 'invalid-url')
  }
  return target
}

/** UTF-8 安全的 Basic 认证头（不能直接 btoa 中文密码） */
function buildBasicAuth(username: string, password: string): string {
  const raw = `${username ?? ''}:${password ?? ''}`
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index])
  }
  return `Basic ${btoa(binary)}`
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase()
  return Object.keys(headers).some(key => key.toLowerCase() === target)
}

/** 归并请求头：PROPFIND 默认 `Depth: 0`，PUT 默认 JSON Content-Type */
function buildRequestHeaders(init: WebDavRequestInit): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    if (typeof value === 'string') headers[key] = value
  }
  const hasBody = typeof init.body === 'string' && init.body.length > 0
  if (init.method === 'PROPFIND') {
    if (!hasHeader(headers, 'Depth')) headers.Depth = '0'
    if (hasBody && !hasHeader(headers, 'Content-Type')) headers['Content-Type'] = XML_CONTENT_TYPE
  }
  if (init.method === 'PUT' && !hasHeader(headers, 'Content-Type')) {
    headers['Content-Type'] = JSON_CONTENT_TYPE
  }
  return headers
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError'
}

/** HTTP 状态码 → WebDavError（message 中带状态码，供设置页展示技术细节） */
function toStatusError(status: number, method: string, targetUrl: string): WebDavError {
  const prefix = `${method} ${targetUrl} 失败（HTTP ${status}）`
  if (status === 401) return new WebDavError(`${prefix}：账号或应用密码错误 / 未授权`, 'auth', status)
  if (status === 403) return new WebDavError(`${prefix}：服务器拒绝访问（无权限或目录只读）`, 'forbidden', status)
  if (status === 404 || status === 410) return new WebDavError(`${prefix}：路径不存在`, 'not-found', status)
  if (status === 409 || status === 423) return new WebDavError(`${prefix}：资源冲突或已被锁定`, 'conflict', status)
  if (status >= 500) return new WebDavError(`${prefix}：WebDAV 服务器内部错误`, 'server', status)
  return new WebDavError(`${prefix}：未预期的响应状态`, 'server', status)
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(task, task)
  requestQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function canUseProxy(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function'
}

/**
 * 走同源代理。
 * - 返回 `{ status, body }`：代理拿到了 WebDAV 的真实响应；
 * - 返回 `null`：代理本身不可用（路由不存在 / 静态部署返回 HTML），调用方改走直连；
 * - 抛 `WebDavError`：代理可用但上游 WebDAV 返回了错误状态。
 */
async function requestViaProxy(
  config: WebDavConfig,
  init: WebDavRequestInit,
  targetUrl: string,
  headers: Record<string, string>
): Promise<ProxyResult> {
  const payload = {
    url: targetUrl,
    method: init.method,
    username: config.username,
    password: config.password,
    body: init.body,
    headers,
  }

  let response: Response
  try {
    response = await fetch(withAppBaseURL(WEBDAV_PROXY_PATH), {
      method: 'POST',
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: JSON.stringify(payload),
    })
  } catch {
    // 同源代理都请求不到，通常是没有服务端（静态部署）
    proxyUnavailable = true
    return null
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.includes('json')) {
    // 静态部署下 /api/webdav 会返回站点 404 HTML
    proxyUnavailable = true
    return null
  }

  let result: any
  try {
    result = await response.json()
  } catch {
    proxyUnavailable = true
    return null
  }
  if (!result || typeof result !== 'object') {
    proxyUnavailable = true
    return null
  }

  if (typeof result.status === 'number') {
    if (result.status >= 200 && result.status < 300) {
      return {
        status: result.status,
        body: typeof result.body === 'string' ? result.body : '',
      }
    }
    throw toStatusError(result.status, init.method, targetUrl)
  }

  const proxyError = typeof result.error === 'string' ? result.error : ''
  if (proxyError === 'invalid-url') {
    // 代理拒绝内网 / 回环地址（自建 WebDAV）：本次改走浏览器直连，但不标记代理整体不可用
    return null
  }
  if (proxyError) {
    throw new WebDavError(
      `WebDAV 代理请求失败（HTTP ${response.status}）：${proxyError}`,
      response.status >= 500 ? 'server' : 'network',
      response.status
    )
  }

  // 形如静态部署的 JSON 404：认为代理路由不可用
  proxyUnavailable = true
  return null
}

/** 浏览器直连 WebDAV；CORS / 网络层失败统一抛 `cors`/`network` */
async function requestDirect(
  config: WebDavConfig,
  init: WebDavRequestInit,
  targetUrl: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  const requestHeaders: Record<string, string> = {
    ...headers,
    Authorization: buildBasicAuth(config.username, config.password),
  }
  const body = init.body !== undefined && (init.method === 'PUT' || init.method === 'PROPFIND') ? init.body : undefined

  let response: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS)
  try {
    response = await fetch(targetUrl, {
      method: init.method,
      headers: requestHeaders,
      body,
      signal: controller.signal,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (isAbortError(error)) {
      throw new WebDavError(`请求 ${targetUrl} 超时或被中断（${DIRECT_TIMEOUT_MS / 1000}s）：${detail}`, 'network')
    }
    if (error instanceof TypeError) {
      // 浏览器直连第三方 WebDAV 时，CORS 预检被拒只会表现为 TypeError: Failed to fetch
      throw new WebDavError(`浏览器直连 WebDAV 失败（CORS 或网络不可达）：${detail}`, 'cors')
    }
    throw new WebDavError(`浏览器直连 WebDAV 失败：${detail}`, 'network')
  } finally {
    clearTimeout(timer)
  }

  let text = ''
  try {
    text = await response.text()
  } catch {
    text = ''
  }
  if (!response.ok) {
    throw toStatusError(response.status, init.method, targetUrl)
  }
  return { status: response.status, body: text }
}

/**
 * 发起一次 WebDAV 请求。
 * 成功（2xx，含 207）返回 `{ status, body }`；失败抛 `WebDavError`。
 */
export async function webdavRequest(
  config: WebDavConfig,
  init: WebDavRequestInit
): Promise<{ status: number; body: string }> {
  const segments = normalizeSegments(init.segments)
  const targetUrl = buildTargetUrl(config, segments)
  const headers = buildRequestHeaders(init)
  const useProxy = init.allowProxy !== false && !proxyUnavailable && canUseProxy()

  return enqueue(async () => {
    if (useProxy) {
      const proxied = await requestViaProxy(config, init, targetUrl, headers)
      if (proxied) return proxied
    }
    return requestDirect(config, init, targetUrl, headers)
  })
}

/** 读取文本文件；远端不存在（404）返回 null */
export async function webdavGetText(config: WebDavConfig, segments: string[]): Promise<string | null> {
  try {
    const { body } = await webdavRequest(config, { method: 'GET', segments })
    return body
  } catch (error) {
    if (error instanceof WebDavError && error.code === 'not-found') return null
    throw error
  }
}

/** 写入文本文件（PUT，覆盖写） */
export async function webdavPutText(config: WebDavConfig, segments: string[], text: string): Promise<void> {
  await webdavRequest(config, {
    method: 'PUT',
    segments,
    body: text,
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
  })
}

/** PROPFIND 判断目录是否存在；405 也按不存在处理（部分服务端如此响应） */
async function directoryExists(config: WebDavConfig, segments: string[]): Promise<boolean> {
  try {
    await webdavRequest(config, {
      method: 'PROPFIND',
      segments,
      body: PROPFIND_BODY,
      headers: { Depth: '0', 'Content-Type': XML_CONTENT_TYPE },
    })
    return true
  } catch (error) {
    if (error instanceof WebDavError) {
      if (error.code === 'not-found' || error.status === 405) return false
    }
    throw error
  }
}

/** MKCOL 创建目录；405 视为「已存在」，按成功处理 */
async function createDirectory(config: WebDavConfig, segments: string[]): Promise<void> {
  try {
    await webdavRequest(config, { method: 'MKCOL', segments })
  } catch (error) {
    if (error instanceof WebDavError && error.status === 405) return
    throw error
  }
}

/** 递归确保目录存在（逐层 PROPFIND → MKCOL） */
export async function webdavEnsureDirectory(config: WebDavConfig, segments: string[]): Promise<void> {
  const parts = normalizeSegments(segments)
  if (!parts.length) {
    // 根目录无法创建，只校验地址合法
    buildTargetUrl(config, [])
    return
  }
  for (let depth = 1; depth <= parts.length; depth++) {
    const prefix = parts.slice(0, depth)
    if (await directoryExists(config, prefix)) continue
    await createDirectory(config, prefix)
  }
}

/** 连接测试：PROPFIND 根地址（Depth: 0），失败抛 `WebDavError` */
export async function webdavTest(config: WebDavConfig): Promise<void> {
  const rootUrl = buildTargetUrl(config, [])
  try {
    await webdavRequest(config, {
      method: 'PROPFIND',
      segments: [],
      body: PROPFIND_BODY,
      headers: { Depth: '0', 'Content-Type': XML_CONTENT_TYPE },
    })
  } catch (error) {
    if (error instanceof WebDavError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new WebDavError(`连接 WebDAV 根目录失败（${rootUrl}）：${detail}`, 'network')
  }
}
