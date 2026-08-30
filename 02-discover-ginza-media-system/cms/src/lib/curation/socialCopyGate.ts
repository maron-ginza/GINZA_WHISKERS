// Project 02-2 収益化② Tier S2（2026-08-30）：Social Copy の媒体別 WARNING 検査。
//
// AI呼び出しなし・決定的。normalizeSocialCopy の後（＝最終テキスト）に対して実行し、
// 媒体ごとの役割差が弱い／Fact に無い時期性を書いている／3媒体が横展開になっている
// ／AIっぽい定型句が入っている、を WARNING として報告する。
// 9月Trial は hard drop せず WARNING 記録のみ（呼び出し側が warnings に合流）。
//
//   xMissingWhoWhereWhen        … X本文に「誰(固有名詞)／どこ(銀座 or venue)／いつ(日付語)」のいずれかが欠落
//   socialCopyCrossMediaDuplicate … note/X/IG の任意2媒体の char-bigram 類似度が閾値以上
//   aiBoilerplatePhrase         … 定型句リストにヒット
//   recencyClaimUnbacked        … 「今だけ/旬/話題」等が日付根拠（provenance の会期/月・本文の日付語）に接地せず出現

import { computeCharBigramJaccardSimilarity } from './textSimilarity'

export interface SocialCopyGateConfig {
  /** 2媒体間の char-bigram 類似度がこの値以上なら横展開とみなす（config.socialCopyDupSim） */
  dupSim: number
  /** AI定型句の部分文字列リスト（config.socialCopyBoilerplatePhrases） */
  boilerplatePhrases: string[]
}

export interface SocialCopyGateInput {
  note: string
  x: string
  instagram: string
  /** sourceProvenance の fact 文字列（誰／いつ の裏取りに使う） */
  provenanceFacts: string[]
  /** DiscoveredContent の venue（どこ判定の補助） */
  venue?: string | null
}

export interface SocialCopyGateResult {
  warnings: string[]
  details: Record<string, string>
}

// 日付・会期らしき語（「いつ」判定・時期性の接地判定に共用）。
// 「開催」「まで」「から」単体は緩すぎるため採らない——実日付（月/日/年）か
// 明示的な会期語（会期・開催期間・開催中）、または具体的な時期語のみを根拠とする。
const DATE_HINT_RE =
  /\d{1,2}\s*月|\d{1,2}\s*日|\d{3,4}\s*年|会期|開催期間|開催中|今週|週末|今月|(?:この|今)(?:春|夏|秋|冬|季節)/
// 日付根拠のない時期性表現
const RECENCY_CLAIM_RE = /今だけ|今しか|いま話題|旬(?![の]銀座)|待望の|ついに解禁|急げ|見逃(?:す|せ)な/

// provenance の fact から「固有名詞候補」を抽出する（『』「」内・カタカナ連続・英字連続）。
function extractProperNouns(facts: string[]): string[] {
  const joined = facts.join(' ')
  const out = new Set<string>()
  for (const m of joined.matchAll(/『([^』]{2,40})』|「([^」]{2,40})」/g)) {
    const v = (m[1] ?? m[2] ?? '').trim()
    if (v) out.add(v)
  }
  for (const m of joined.matchAll(/[ァ-ヶー]{3,}(?:・[ァ-ヶー]{2,})*/g)) out.add(m[0])
  for (const m of joined.matchAll(/[A-Za-z][A-Za-z0-9&'’.\- ]{2,}/g)) {
    const v = m[0].trim()
    if (v.length >= 3) out.add(v)
  }
  return Array.from(out)
}

export function evaluateSocialCopyGate(
  input: SocialCopyGateInput,
  config: SocialCopyGateConfig,
): SocialCopyGateResult {
  const warnings: string[] = []
  const details: Record<string, string> = {}
  const note = input.note ?? ''
  const x = input.x ?? ''
  const ig = input.instagram ?? ''
  const venue = (input.venue ?? '').trim()
  const provJoined = input.provenanceFacts.join(' ')

  // --- xMissingWhoWhereWhen ---
  const properNouns = extractProperNouns(input.provenanceFacts)
  const whoOk = properNouns.length === 0 || properNouns.some((n) => x.includes(n))
  const whereOk =
    /銀座|GINZA|Ginza/.test(x) ||
    (venue.length >= 2 && (x.includes(venue) || venue.split(/[\s　]/).some((frag) => frag.length >= 2 && x.includes(frag))))
  const whenOk = DATE_HINT_RE.test(x)
  const missing: string[] = []
  if (!whoOk) missing.push('誰(固有名詞)')
  if (!whereOk) missing.push('どこ(銀座/会場)')
  if (!whenOk) missing.push('いつ(日付/会期)')
  if (missing.length > 0) {
    warnings.push('xMissingWhoWhereWhen')
    details.xMissingWhoWhereWhen = `X本文に欠落: ${missing.join(' / ')}`
  }

  // --- socialCopyCrossMediaDuplicate ---
  const pairs: [string, string, string][] = [
    ['note-X', note, x],
    ['note-IG', note, ig],
    ['X-IG', x, ig],
  ]
  const dupHits: string[] = []
  for (const [name, a, b] of pairs) {
    if (!a || !b) continue
    const sim = computeCharBigramJaccardSimilarity(a, b)
    if (sim >= config.dupSim) dupHits.push(`${name}=${sim.toFixed(2)}`)
  }
  if (dupHits.length > 0) {
    warnings.push('socialCopyCrossMediaDuplicate')
    details.socialCopyCrossMediaDuplicate = `媒体間の類似度が高い（${config.dupSim}以上）: ${dupHits.join(', ')}`
  }

  // --- aiBoilerplatePhrase ---
  const bpHits: string[] = []
  for (const [label, text] of [
    ['note', note],
    ['X', x],
    ['IG', ig],
  ] as const) {
    for (const phrase of config.boilerplatePhrases) {
      if (phrase && text.includes(phrase)) bpHits.push(`${label}:"${phrase}"`)
    }
  }
  if (bpHits.length > 0) {
    warnings.push('aiBoilerplatePhrase')
    details.aiBoilerplatePhrase = `AI定型句: ${Array.from(new Set(bpHits)).slice(0, 4).join(' / ')}`
  }

  // --- recencyClaimUnbacked ---
  const provHasDate = DATE_HINT_RE.test(provJoined)
  const recencyHits: string[] = []
  for (const [label, text] of [
    ['note', note],
    ['X', x],
    ['IG', ig],
  ] as const) {
    if (RECENCY_CLAIM_RE.test(text) && !provHasDate && !DATE_HINT_RE.test(text)) {
      const m = text.match(RECENCY_CLAIM_RE)
      recencyHits.push(`${label}:"${m?.[0] ?? ''}"`)
    }
  }
  if (recencyHits.length > 0) {
    warnings.push('recencyClaimUnbacked')
    details.recencyClaimUnbacked = `日付根拠のない時期性表現: ${recencyHits.join(' / ')}`
  }

  return { warnings, details }
}
