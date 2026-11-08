/**
 * Cloudflare Pages Function：WebDAV 同源代理（静态部署时使用）。
 *
 * 与 `server/api/webdav.post.ts`（Nuxt/Nitro 本地服务）逻辑一致：
 * 浏览器直连第三方 WebDAV 会因 CORS 预检被拒，这里在同源下代为转发。
 * 部署说明：`wrangler pages deploy .output/public --functions-dir=functions`
 * （或把 functions/ 放在 Pages 项目根目录后走 Git 集成）。
 */

const ALLOWED_METHODS = new Set(['GET', 'PUT', 'DELETE', 'MKCOL', 'PROPFIND', 'HEAD'])
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024
const TIMEOUT_MS = 20000

function isBlockedHostname(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (!host) return true
  if (host === 'localhost' || host === '0.0.0.0') return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true
  }
  if (host.startsWith('::ffff:')) return isBlockedHostname(host.slice('::ffff:'.length))

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  return false
}

function resolveUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (isBlockedHostname(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function basicAuth(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return 'Basic ' + btoa(binary)
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequestPost({ request }) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'invalid-body' }, 400)
  }

  const method = String(payload?.method ?? 'PROPFIND').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) return json({ error: 'invalid-method' }, 400)

  const target = resolveUrl(payload?.url)
  if (!target) return json({ error: 'invalid-url' }, 400)

  const headers = { 'User-Agent': 'TypeWords-WebDAV/1.0' }
  const username = String(payload?.username ?? '')
  const password = String(payload?.password ?? '')
  if (username || password) headers.Authorization = basicAuth(username, password)

  const extra = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {}
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value !== 'string') continue
    if (/^(host|authorization|content-length|connection|transfer-encoding)$/i.test(key)) continue
    headers[key] = value
  }

  const rawBody = typeof payload?.body === 'string' ? payload.body : undefined
  if (rawBody !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json; charset=utf-8'
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
    const text = await res.text()
    return json({
      status: res.status,
      body: text.length > MAX_RESPONSE_BYTES ? text.slice(0, MAX_RESPONSE_BYTES) : text,
      etag: res.headers.get('etag') || '',
      lastModified: res.headers.get('last-modified') || '',
    })
  } catch (error) {
    const aborted = error?.name === 'AbortError'
    return json({ error: aborted ? 'timeout' : 'upstream-failed' }, aborted ? 504 : 502)
  } finally {
    clearTimeout(timer)
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 })
}
