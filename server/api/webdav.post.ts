/**
 * WebDAV 同源代理。
 *
 * 浏览器的 fetch 直连第三方 WebDAV（坚果云、InfiniCLOUD、Nextcloud 等）时，
 * 带 Authorization 的请求会触发 CORS 预检，而绝大多数 WebDAV 服务端不返回
 * Access-Control-Allow-Origin，导致请求必然失败。
 *
 * 本路由在 Nuxt/Nitro 服务端（本地 Node 版、开发服务器）代为转发，客户端只与
 * 同源的 /api/webdav 通信。静态部署（nuxt generate，无服务端）时该路由不存在，
 * 客户端会自动降级为浏览器直连。
 *
 * 安全措施：只允许 http/https、禁止内网与回环地址、限制方法与响应体大小、20s 超时。
 */

const ALLOWED_METHODS = new Set(['GET', 'PUT', 'DELETE', 'MKCOL', 'PROPFIND', 'HEAD'])
const MAX_BODY_BYTES = 64 * 1024 * 1024
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024
const TIMEOUT_MS = 20_000

function isBlockedHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')

  if (!host) return true
  if (host === 'localhost' || host === '0.0.0.0') return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

  // IPv6 回环 / 链路本地 / ULA
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true
  }
  if (host.startsWith('::ffff:')) {
    return isBlockedHostname(host.slice('::ffff:'.length))
  }

  // IPv4 字面量
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }

  return false
}

function resolveUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(String(rawUrl))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (isBlockedHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

export default defineEventHandler(async event => {
  if (event.node.req.method !== 'POST') {
    setResponseStatus(event, 405)
    return { error: 'method-not-allowed' }
  }

  const payload = (await readBody(event)) as {
    url?: string
    method?: string
    username?: string
    password?: string
    body?: string
    headers?: Record<string, string>
  } | null

  const method = String(payload?.method ?? 'PROPFIND').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) {
    setResponseStatus(event, 400)
    return { error: 'invalid-method' }
  }

  const target = resolveUrl(String(payload?.url ?? ''))
  if (!target) {
    setResponseStatus(event, 400)
    return { error: 'invalid-url' }
  }

  const headers: Record<string, string> = {
    'User-Agent': 'TypeWords-WebDAV/1.0',
  }

  const username = String(payload?.username ?? '')
  const password = String(payload?.password ?? '')
  if (username || password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
  }

  const extra = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {}
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value !== 'string') continue
    // 只允许少量业务头，禁止覆盖鉴权 / Host / Content-Length 等
    if (/^(host|authorization|content-length|connection|transfer-encoding)$/i.test(key)) continue
    headers[key] = value
  }

  const rawBody = typeof payload?.body === 'string' ? payload.body : undefined
  if (rawBody !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json; charset=utf-8'
    headers['Content-Length'] = String(Buffer.byteLength(rawBody))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(target.toString(), {
      method,
      headers,
      body: rawBody !== undefined && method !== 'GET' && method !== 'HEAD' ? rawBody : undefined,
      signal: controller.signal,
      redirect: 'follow',
    })

    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength && contentLength > MAX_RESPONSE_BYTES) {
      setResponseStatus(event, 502)
      return { error: 'response-too-large' }
    }

    const text = await res.text()
    const clipped = text.length > MAX_RESPONSE_BYTES ? text.slice(0, MAX_RESPONSE_BYTES) : text

    // 始终返回 HTTP 200，把 WebDAV 的真实状态码放在 body 里，避免 Nitro 改写状态
    return {
      status: res.status,
      body: clipped,
      etag: res.headers.get('etag') ?? '',
      lastModified: res.headers.get('last-modified') ?? '',
    }
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError'
    setResponseStatus(event, aborted ? 504 : 502)
    return { error: aborted ? 'timeout' : 'upstream-failed' }
  } finally {
    clearTimeout(timer)
  }
})
