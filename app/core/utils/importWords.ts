export type ParsedWord = {
  word: string
  trans?: string
  /** 单元名，由 `unit 名字` / `第N单元` 等标题行识别；同名标题自动合并为同一单元 */
  unit?: string
}

const NUMBER_PREFIX = /^\s*\d+\s*[.)、]\s*/
const QUOTES = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const CJK = /[\u4e00-\u9fff]/
/** `unit 任意名字`（大小写不敏感，名字与 unit 之间以空格分隔）；lesson/list/chapter 后跟数字也按单元处理 */
const UNIT_EN = /^\s*(?:unit|lesson|list|chapter)\s+(?:no\.?\s*)?[#:：]?\s*(.+?)\s*[.:：]?\s*$/i
const UNIT_CN = /^\s*第\s*[0-9一二三四五六七八九十百零]+\s*(?:单元|课|章|讲|部分)\s*$/i

/** 识别单元标题行，返回单元名（`unit` 后的任意内容 / 中文标题原文）；不是标题行返回 null */
export function parseUnitHeader(line: string): string | null {
  const trimmed = String(line ?? '').trim()
  const en = trimmed.match(UNIT_EN)
  if (en) {
    const name = en[1].trim()
    return name || null
  }
  if (UNIT_CN.test(trimmed)) return trimmed
  return null
}

function cleanText(value: string): string {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(NUMBER_PREFIX, '')
    .replace(QUOTES, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 按 `|` 拆分词形合并写法，如 lead|led|led */
export function splitByDelimiter(line: string): string[] {
  return String(line ?? '')
    .split('|')
    .map(cleanText)
    .filter(Boolean)
}

/** 重复判定用的归一化 key */
export function normalizeKey(word: string): string {
  return cleanText(word).toLowerCase()
}

/**
 * 解析导入文本，每行一条词条。
 * 支持：
 * - 纯单词 / 词组（e-payment、with ease）
 * - `单词:= 释义`（the Olympics:= the Olympic Games）
 * - `lead|led|led`（`|` 拆分）
 * - `单词,释义` 或 `单词<TAB>释义`（csv）
 * - 「单词」一行 + 下一行中文释义（两行一条，直接采用该释义，不再请求词典/翻译）
 */
export function parseImportText(raw: string): ParsedWord[] {
  const result: ParsedWord[] = []
  const seen = new Set<string>()
  let currentUnit: string | undefined

  const push = (word: string, trans?: string) => {
    const cleaned = cleanText(word)
    if (!cleaned) return
    const key = normalizeKey(cleaned)
    if (seen.has(key)) return
    seen.add(key)
    result.push({ word: cleaned, trans: cleanText(trans ?? '') || undefined, unit: currentUnit })
  }

  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map(line => line.replace(/\uFEFF/g, '').trim())
    .filter(line => !!line && !line.startsWith('#'))

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]
    const next = lines[i + 1]

    const unitName = parseUnitHeader(trimmed)
    if (unitName !== null) {
      currentUnit = unitName
      continue
    }

    const nextIsTrans = !!next && CJK.test(next) && !parseUnitHeader(next)

    if (trimmed.includes(':=')) {
      const [left, ...rest] = trimmed.split(':=')
      push(left, rest.join(':='))
      continue
    }

    if (trimmed.includes('\t')) {
      const [left, ...rest] = trimmed.split('\t')
      push(left, rest.join(' '))
      continue
    }

    if (trimmed.includes(',')) {
      const [left, ...rest] = trimmed.split(',')
      push(left, rest.join(','))
      continue
    }

    if (trimmed.includes('|')) {
      const forms = splitByDelimiter(trimmed)
      if (nextIsTrans) {
        forms.forEach(word => push(word, next))
        i++
      } else {
        forms.forEach(word => push(word))
      }
      continue
    }

    // 单独出现的中文行说明上一行已把释义用掉，跳过，避免把中文当成单词
    if (CJK.test(trimmed)) continue

    if (nextIsTrans) {
      push(trimmed, next)
      i++
      continue
    }

    push(trimmed)
  }

  return result
}
