// 推測補完・数値矛盾ゲート（steps 5・7）。マロン承認基準：
//   ・必須事実の不足 / 数値矛盾 / 推測補完 → red
//
// 本文から「具体的な数値主張」（日付・時刻・価格・定員・申込期限）を機械抽出し、
// それぞれが confirmed provenance か ArticleFacts の確定値に **文字列として現れる**
// ことを確認する。現れなければ「推測補完（unbackedClaim）」= red。
// 数値の単位が確定値に存在するのに値が違う場合は「数値矛盾（numericConflict）」= red。
// 純粋・AI なし。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import type { ArticleUnderAudit } from './types'

/** 全角数字→半角、カンマ・空白除去（照合用の緩い正規化） */
function digits(s: string): string {
  return (s ?? '')
    .replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d)))
    .replace(/[,\s，]/g, '')
}

/**
 * 文字列中のすべての時刻表現を canonical キー（HHMM、4桁ゼロ埋め）へ正規化して列挙。
 * `10:30` / `10時30分` / `21:00` / `21時` を同一視するため。
 */
function timeKeys(s: string): Set<string> {
  const t = digits(s)
  const keys = new Set<string>()
  const pad = (h: string, m?: string) => h.padStart(2, '0') + (m ?? '0').padStart(2, '0')
  const reColon = /(\d{1,2})[:：](\d{2})/g
  const reJp = /(\d{1,2})時(?:(\d{1,2})分)?/g
  let m: RegExpExecArray | null
  while ((m = reColon.exec(t)) !== null) keys.add(pad(m[1], m[2]))
  while ((m = reJp.exec(t)) !== null) keys.add(pad(m[1], m[2]))
  return keys
}

interface Claim {
  raw: string
  /** 照合キー（数字＋単位語） */
  key: string
  /** 単位（date/time/price/capacity/deadline） */
  unit: 'date' | 'time' | 'price' | 'capacity' | 'deadline'
  section: string
}

const PATTERNS: { unit: Claim['unit']; re: RegExp }[] = [
  { unit: 'date', re: /\d{3,4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?/g },
  { unit: 'date', re: /(?<!\d)\d{1,2}\s*月\s*\d{1,2}\s*日/g },
  { unit: 'time', re: /\d{1,2}\s*[:：]\s*\d{2}/g },
  { unit: 'time', re: /\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?(?:\s*から\s*\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?\s*まで)?/g },
  { unit: 'price', re: /[¥￥]\s?[\d,]+|[\d,０-９]+\s*円/g },
  { unit: 'capacity', re: /定員\s*[\d,０-９]+\s*(?:名|人|組)?|各?\s*[\d,０-９]+\s*名(?:さま|様)?/g },
  { unit: 'deadline', re: /締切|申込.{0,6}まで|受付.{0,4}まで|応募.{0,6}まで/g },
]

function extractClaims(sections: ArticleUnderAudit['sections']): Claim[] {
  const claims: Claim[] = []
  for (const s of sections) {
    for (const { unit, re } of PATTERNS) {
      const rx = new RegExp(re.source, re.flags)
      let m: RegExpExecArray | null
      while ((m = rx.exec(s.text)) !== null) {
        const raw = m[0].trim()
        if (!raw) continue
        claims.push({ raw, key: digits(raw), unit, section: s.name })
      }
    }
  }
  return claims
}

/** 確定情報プール（confirmed provenance + ArticleFacts の確定値）を1つの照合文字列に */
function backedPool(a: ArticleUnderAudit): string {
  const f = a.facts
  const provConfirmed = (a.provenance ?? [])
    .filter((p) => p.verificationStatus === 'confirmed' || p.verificationStatus === 'conflicting')
    .map((p) => p.fact)
  const parts = [
    ...provConfirmed,
    f.eventDate,
    f.eventDateISO,
    f.eventTime,
    f.priceText,
    f.officialInfoNote,
    f.applyDeadline,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0)
  return digits(parts.join(' | '))
}

/** eventDateISO を "YYYY年M月D日" / "M月D日" 表記の digits キーへ（照合補助） */
function isoDateKeys(iso: string | null | undefined): string[] {
  if (!iso) return []
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return []
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  const da = d.getUTCDate()
  return [digits(`${y}年${mo}月${da}日`), digits(`${mo}月${da}日`)]
}

export function checkUnbackedClaims(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []
  const pool = backedPool(a)
  const isoKeys = isoDateKeys(a.facts.eventDateISO)
  const claims = extractClaims(a.sections)

  // 時刻は表記ゆれ（10:30 / 10時30分 / 21:00 / 21時）を吸収して照合
  const poolTimeKeys = timeKeys(
    [
      ...(a.provenance ?? []).filter((p) => p.verificationStatus !== 'unconfirmed').map((p) => p.fact),
      a.facts.eventTime,
      a.facts.officialInfoNote,
    ]
      .filter(Boolean)
      .join(' '),
  )

  const seen = new Set<string>()
  for (const c of claims) {
    if (seen.has(c.key + c.unit)) continue
    seen.add(c.key + c.unit)

    // deadline 語は「締切がある」旨だけなので、applyRequired=yes かつ applyDeadline があれば OK
    if (c.unit === 'deadline') {
      if (a.facts.applyRequired === 'yes' && String(a.facts.applyDeadline ?? '').trim()) continue
      out.push({
        checkId: 'unbackedClaim',
        severity: 'red',
        section: c.section,
        excerpt: clipExcerpt(c.raw),
        message: '申込期限に触れているが、確定した applyDeadline が無い（推測補完の疑い）',
      })
      continue
    }

    if (c.unit === 'time') {
      const cks = [...timeKeys(c.raw)]
      if (cks.length > 0 && cks.every((k) => poolTimeKeys.has(k))) continue
    }

    const backed = pool.includes(c.key) || (c.unit === 'date' && isoKeys.includes(c.key))
    if (backed) continue

    // 単位が確定情報に存在するのに値が違う → 数値矛盾
    const unitToken =
      c.unit === 'date' ? '年' : c.unit === 'time' ? '時' : c.unit === 'price' ? '円' : '名'
    const unitPresent = pool.includes(unitToken) || (c.unit === 'date' && isoKeys.length > 0)
    out.push({
      checkId: unitPresent ? 'numericConflict' : 'unbackedClaim',
      severity: 'red',
      section: c.section,
      excerpt: clipExcerpt(c.raw),
      message: unitPresent
        ? `本文の数値「${c.raw}」が確定情報（provenance / ArticleFacts）と一致しない（数値矛盾）`
        : `本文の数値「${c.raw}」が confirmed 事実にも ArticleFacts にも無い（推測補完の疑い）`,
    })
  }

  return out
}
