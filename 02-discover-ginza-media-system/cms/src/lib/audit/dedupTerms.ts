// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// 重複判定の共通処理（純粋・決定的）。
//
// マロン承認基準：
//   ・正規化後10文字以上の同一表現が別セクションで2回以上 → yellow
//   ・同一文の実質的重複 → yellow
//   ・固有名詞 / 正式商品名 / 会場名 / 日付 / 価格 / 出典表示は重複判定の対象外
//
// → 判定前に「対象外トークン」をマスクしてから正規化・共通部分列を取る。

import { computeCharBigramJaccardSimilarity } from '../curation/textSimilarity'

export interface DedupMaskInput {
  /** 対象外にする固有名詞（イベント名・ブランド・シリーズ・会場名・出典名・ハッシュタグ語 等） */
  properNouns: string[]
  /** 対象外にする出典 URL（出典表示） */
  sourceUrls: string[]
}

// 対象外：日付・価格・時刻・URL（正規表現で機械的に落とす）
const DATE_RE =
  /\d{3,4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?(?:（[^）]{1,4}）)?|\d{1,2}\s*月\s*\d{1,2}\s*日(?:（[^）]{1,4}）)?/g
const PRICE_RE = /[¥￥]\s?[\d,]+|[\d,]+\s*円(?:（税込）|（税抜）)?/g
const TIME_RE =
  /\d{1,2}\s*[:：]\s*\d{2}(?:\s*[〜～\-–—]\s*\d{1,2}\s*[:：]\s*\d{2})?|\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?(?:\s*から\s*\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?\s*まで)?/g
const URL_RE = /https?:\/\/\S+/g

/** 重複判定用の正規化：空白・記号・約物を除去（対象外マスク後に使う） */
export function normalizeForDedup(text: string): string {
  return (text ?? '')
    .replace(/[\s　、。，．・「」『』（）()[\]【】〜～\-–—:：/／|｜…]/gu, '')
    .trim()
}

/** 対象外トークン（固有名詞・URL・日付・価格・時刻）をスペースへ置換 */
export function maskExcluded(text: string, input: DedupMaskInput): string {
  let t = text ?? ''
  t = t.replace(URL_RE, ' ')
  for (const u of input.sourceUrls) {
    const s = (u ?? '').trim()
    if (s) t = t.split(s).join(' ')
  }
  t = t.replace(DATE_RE, ' ').replace(PRICE_RE, ' ').replace(TIME_RE, ' ')
  // 長い固有名詞から先に落とす（部分一致の取りこぼしを減らす）
  for (const p of [...input.properNouns].filter((x) => (x ?? '').trim().length >= 2).sort((a, b) => b.length - a.length)) {
    t = t.split(p.trim()).join(' ')
  }
  return t
}

/** a, b の共通部分文字列（長さ minLen 以上）を列挙。文字列が短い前提の素朴実装。 */
export function commonSubstrings(a: string, b: string, minLen: number): string[] {
  const found = new Set<string>()
  if (a.length < minLen || b.length < minLen) return []
  for (let i = 0; i + minLen <= a.length; i++) {
    // i から始まる最長の、b に含まれる部分文字列を求める
    let len = minLen
    if (!b.includes(a.slice(i, i + len))) continue
    while (i + len < a.length && b.includes(a.slice(i, i + len + 1))) len++
    found.add(a.slice(i, i + len))
  }
  return [...found]
}

export interface RepeatedTermHit {
  /** 正規化後の同一表現（対象外マスク済み） */
  term: string
  /** その表現が現れたセクション名（2件以上） */
  sections: string[]
}

/**
 * 別セクション間で「正規化後 minLen 字以上の同一表現」が現れるものを列挙。
 * ネストした部分文字列は最長のものだけ残す。
 */
export function findCrossSectionRepeats(
  sections: { name: string; text: string }[],
  mask: DedupMaskInput,
  minLen = 10,
): RepeatedTermHit[] {
  const norm = sections.map((s) => ({ name: s.name, n: normalizeForDedup(maskExcluded(s.text, mask)) }))
  const termSections = new Map<string, Set<string>>()
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (norm[i].name === norm[j].name) continue
      for (const sub of commonSubstrings(norm[i].n, norm[j].n, minLen)) {
        if (!termSections.has(sub)) termSections.set(sub, new Set())
        termSections.get(sub)!.add(norm[i].name)
        termSections.get(sub)!.add(norm[j].name)
      }
    }
  }
  const terms = [...termSections.keys()].sort((a, b) => b.length - a.length)
  const kept: string[] = []
  for (const t of terms) {
    if (!kept.some((k) => k !== t && k.includes(t))) kept.push(t)
  }
  return kept
    .filter((t) => (termSections.get(t)?.size ?? 0) >= 2)
    .map((t) => ({ term: t, sections: [...(termSections.get(t) ?? [])].sort() }))
}

export interface DuplicateSentenceHit {
  a: { section: string; text: string }
  b: { section: string; text: string }
  similarity: number
}

/** 文へ分割（日本語の句点・改行） */
export function splitSentences(text: string): string[] {
  return (text ?? '')
    .split(/(?<=。)|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * 「同一文の実質的重複」検出：任意 2 文の char-bigram Jaccard 類似度が
 * threshold 以上、かつ対象外マスク後も一定の実体がある場合に hit。
 */
export function findDuplicateSentences(
  sections: { name: string; text: string }[],
  mask: DedupMaskInput,
  threshold = 0.8,
  minMaskedLen = 8,
): DuplicateSentenceHit[] {
  const items: { section: string; text: string; masked: string }[] = []
  for (const s of sections) {
    for (const sent of splitSentences(s.text)) {
      items.push({ section: s.name, text: sent, masked: normalizeForDedup(maskExcluded(sent, mask)) })
    }
  }
  const hits: DuplicateSentenceHit[] = []
  for (let i = 0; i < items.length; i++) {
    if (items[i].masked.length < minMaskedLen) continue
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].masked.length < minMaskedLen) continue
      const sim = Number(computeCharBigramJaccardSimilarity(items[i].masked, items[j].masked).toFixed(3))
      if (sim >= threshold) {
        hits.push({
          a: { section: items[i].section, text: items[i].text },
          b: { section: items[j].section, text: items[j].text },
          similarity: sim,
        })
      }
    }
  }
  return hits
}
