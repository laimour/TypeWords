const cache = new Map<string, any>()
const CACHE_LIMIT = 500

type TransItem = { pos: string; cn: string }

function pickText(raw: any): string {
  if (Array.isArray(raw)) return raw.map(pickText).filter(Boolean).join('；')
  if (raw && typeof raw === 'object') return pickText(raw.i ?? raw.l ?? '')
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * 免 key 在线词典（有道 jsonapi）词条查询，用于本地部署时缺少官方词库接口的兜底
 */
export default defineEventHandler(async event => {
  const word = String(getQuery(event).word ?? '').trim()
  if (!word) return { ok: false }

  const key = word.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  try {
    const data: any = await $fetch('https://dict.youdao.com/jsonapi', {
      params: { q: word },
      timeout: 6000,
      headers: { 'user-agent': 'Mozilla/5.0' },
    })

    const ec = Array.isArray(data?.ec) ? data.ec[0] : data?.ec
    const entry = ec?.word?.[0]
    if (!entry) return { ok: false }

    const trans: TransItem[] = (entry.trs ?? [])
      .flatMap((item: any) => item?.tr ?? [])
      .map((item: any) => {
        const text = pickText(item?.l?.i)
        const matched = text.match(/^([a-z]+\.)\s*(.+)$/i)
        return matched ? { pos: matched[1], cn: matched[2] } : { pos: '', cn: text }
      })
      .filter((item: TransItem) => !!item.cn)
      .slice(0, 8)

    if (!trans.length) return { ok: false }

    const sentences = (data?.blng_sents_part?.['sentence-pair'] ?? [])
      .slice(0, 5)
      .map((item: any) => ({ c: String(item?.sentence ?? ''), cn: String(item?.['sentence-translation'] ?? '') }))
      .filter((item: any) => !!item.c)

    const phrases = (data?.phrs?.phrs ?? [])
      .slice(0, 8)
      .map((item: any) => ({ c: String(item?.phr?.headword?.l?.i ?? ''), cn: pickText(item?.phr?.trs?.[0]?.tr) }))
      .filter((item: any) => !!item.c)

    const result = {
      ok: true,
      word: {
        word: pickText(entry['return-phrase']?.l?.i) || word,
        phonetic0: String(entry.ukphone ?? ''),
        phonetic1: String(entry.usphone ?? ''),
        trans,
        sentences,
        phrases,
      },
    }

    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(key, result)
    return result
  } catch {
    return { ok: false }
  }
})
