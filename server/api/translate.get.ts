// 免 key 翻译代理：先有道网页接口，失败回退 MyMemory
const cache = new Map<string, string>()
const CACHE_LIMIT = 500

async function fetchJson(url: string, timeout = 5000): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
      },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const text = String(query.text ?? '').trim()
  const from = String(query.from ?? 'en')
  const to = String(query.to ?? 'zh-CN')
  if (!text) return { ok: false, trans: '' }

  const key = `${from}|${to}|${text}`
  const cached = cache.get(key)
  if (cached) return { ok: true, trans: cached }

  // 1) 有道网页接口
  const youdao = await fetchJson(
    `https://fanyi.youdao.com/translate?doctype=json&jsonversion=&type=AUTO&i=${encodeURIComponent(text)}`
  )
  const youdaoTrans = youdao?.translateResult?.[0]?.[0]?.tgt
  if (typeof youdaoTrans === 'string' && youdaoTrans.trim()) {
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(key, youdaoTrans.trim())
    return { ok: true, trans: youdaoTrans.trim() }
  }

  // 2) MyMemory 回退
  const myMemory = await fetchJson(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
  )
  const myMemoryTrans = myMemory?.responseData?.translatedText
  if (typeof myMemoryTrans === 'string' && myMemoryTrans.trim() && !/no query specified/i.test(myMemoryTrans)) {
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(key, myMemoryTrans.trim())
    return { ok: true, trans: myMemoryTrans.trim() }
  }

  return { ok: false, trans: '' }
})
