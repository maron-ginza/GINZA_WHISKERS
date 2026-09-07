// GINZA WHISKERS / Project 02（2026-09-07、根本改善）
//
// 【役割】ArticleFacts 管理画面の「候補要約」欄（読み取り専用・virtual field）を
// 1つの純粋関数で組み立てる。マロンが個別項目を一つずつ確認しなくても、この1画面の
// 要約と「不足項目」一覧だけを見て「承認／保留／却下」のいずれかを選べることを目的とする。
//
// 【厳守】
//   ・DB / AI / ネットワークに一切触れない（siblingData から読み取るだけ）。
//   ・ready 化の可否判定は evaluateReadyGate に一本化する（ここで別の判定基準を作らない）。
//   ・不足項目があっても「個別入力が必須」とは書かない——保留のまま保存してよいことを明示する。

import { evaluateReadyGate, type CommonArticleFacts, type TemplateType } from './readyGate'

const KNOWN_TEMPLATE_TYPES = [
  'exhibition',
  'application',
  'workshop',
  'sale',
  'recurring_event',
  'generic',
  'unknown',
] as const

function s(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  return ''
}

function clip(v: string, n = 80): string {
  return v.length > n ? `${v.slice(0, n)}…` : v
}

function isoStr(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString()
  return s(v)
}

interface VenueLike {
  name?: string | null
  place?: string | null
}
interface HashtagLike {
  tag?: string | null
}
interface ProvenanceLike {
  fact?: string | null
  verificationStatus?: string | null
}

/** ArticleFacts の siblingData から読み取る値（緩い型。Payload 生成型に依存しない） */
export interface ArticleFactsSummaryInput {
  enrichmentStatus?: string | null
  primaryCategory?: string | null
  templateType?: string | null
  season?: string | null
  eventName?: string | null
  whatHappens?: string | null
  eventDate?: string | null
  eventDateISO?: unknown
  eventTime?: string | null
  venues?: (VenueLike | null)[] | null
  priceText?: string | null
  saleAvailability?: string | null
  officialInfoNote?: string | null
  areaLead?: string | null
  audienceNote?: string | null
  applyRequired?: string | null
  hashtags?: (HashtagLike | null)[] | null
  sourceProvenanceFacts?: (ProvenanceLike | null)[] | null
}

export function buildArticleFactsReviewSummary(doc: ArticleFactsSummaryInput | null | undefined): string {
  const d = doc ?? {}
  const tt = ((KNOWN_TEMPLATE_TYPES as readonly string[]).includes(s(d.templateType))
    ? s(d.templateType)
    : 'unknown') as TemplateType

  const venues = (Array.isArray(d.venues) ? d.venues : [])
    .map((v) => ({ name: s(v?.name), place: s(v?.place) }))
    .filter((v) => v.name && v.place)
  const hashtags = (Array.isArray(d.hashtags) ? d.hashtags : []).map((h) => s(h?.tag)).filter(Boolean)
  const provenance = Array.isArray(d.sourceProvenanceFacts) ? d.sourceProvenanceFacts : []
  const confirmedProvenance = provenance.filter(
    (p) => s(p?.fact) !== '' && (p?.verificationStatus ?? 'confirmed') === 'confirmed',
  )

  const commonFacts: CommonArticleFacts = {
    primaryCategory: s(d.primaryCategory) || null,
    templateType: tt,
    contentTitle: s(d.eventName) || undefined,
    contentSummary: s(d.whatHappens) || undefined,
    availablePeriod: s(d.eventDate) || undefined,
    eventDateISO: isoStr(d.eventDateISO) || undefined,
    eventTime: s(d.eventTime) || undefined,
    venues,
    priceText: s(d.priceText) || undefined,
    saleAvailability: s(d.saleAvailability) || undefined,
    paid: undefined,
    applyRequired: s(d.applyRequired) || undefined,
    officialInfoNote: s(d.officialInfoNote) || undefined,
    areaLead: s(d.areaLead) || undefined,
    audienceNote: s(d.audienceNote) || undefined,
    hashtags: hashtags.map((t) => ({ tag: t })),
    sourceProvenanceFacts: provenance.map((p) => ({
      fact: s(p?.fact),
      verificationStatus: s(p?.verificationStatus) || 'confirmed',
    })),
    enrichmentStatus: 'ready',
  }
  const gate = evaluateReadyGate(commonFacts, tt)

  const lines: string[] = []
  lines.push(
    gate.eligible
      ? '【承認可能】必須項目はすべて確認済みです。「enrichmentStatus」を「承認（ready化・テンプレ生成可）」に変更して保存してください。'
      : '【要確認】下記の不足項目を確認してください（個別入力は必須ではありません。確認できなければ「保留」のまま保存してよい）。',
  )
  lines.push('')
  lines.push(`記事テンプレート種別: ${tt}${tt === 'unknown' ? '（マロンが admin で確定するまで承認不可）' : ''}`)
  if (s(d.primaryCategory)) lines.push(`編集カテゴリー: ${s(d.primaryCategory)}`)
  if (s(d.eventName)) lines.push(`商品名／イベント名: ${s(d.eventName)}`)
  if (s(d.whatHappens)) lines.push(`概要: ${clip(s(d.whatHappens))}`)
  if (s(d.eventDate)) {
    const ongoingNote = d.saleAvailability === 'ongoing_no_end_stated' ? '（終了日は公式記載なし・確認済み）' : ''
    lines.push(`期間: ${s(d.eventDate)}${ongoingNote}`)
  }
  if (s(d.priceText)) lines.push(`価格: ${s(d.priceText)}`)
  if (venues.length) lines.push(`場所: ${venues.map((v) => `${v.name}／${v.place}`).join('、')}`)
  if (s(d.officialInfoNote)) lines.push(`公式情報の補足: ${clip(s(d.officialInfoNote))}`)
  if (hashtags.length) lines.push(`ハッシュタグ: ${hashtags.join(' ')}`)
  lines.push(`出典（confirmed）: ${confirmedProvenance.length}件`)
  lines.push('')

  if (gate.eligible) {
    lines.push('不足項目: なし。')
  } else {
    lines.push('不足項目（確認先: 出典URL・notes欄の[auto:morning]記載）:')
    for (const m of gate.missing) lines.push(`  ・${m}`)
  }

  return lines.join('\n')
}
