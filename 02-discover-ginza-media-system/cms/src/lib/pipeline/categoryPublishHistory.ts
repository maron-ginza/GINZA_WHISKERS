// GINZA WHISKERS / Project 02（2026-10-03、マロン指示：候補選定のカテゴリー偏り抑制）
//
// 「直近7日間のカテゴリー別・実際の公開本数」を決定的に集計する純粋関数群。
//
// 【最重要の前提（マロン指示）】CMSの reviewStatus=approved や note転記完了（note-transfer
// サーバーの status=success）だけでは「公開済み」と判定しない。実際に note.com へ公開された
// ことを示す記録（Articles.publishHistory の channel='note' エントリ）が存在し、かつ
// reviewStatus も 'published' になっている場合のみ「検証済み公開」として数える。
//
// 【実データで発見した既存の不整合（2026-10-03）】
//   ・Article #2（seedデータ）：reviewStatus='published' だが publishHistory が0件
//     （実際に公開されたことを示す記録が無い＝検証不能。カウント対象から除外）。
//   ・Article #62：publishHistory.note.publishedAt（2026-09-01）が createdAt（2026-09-10）
//     より前という物理的に不可能な値を持つ（おそらく過去のテスト・雛形データの残留）。
//     reviewStatus も 'draft' のまま。publishedAt < createdAt の記録は検証済みとして
//     信用しない（createdAt以降のpublishedAtを持つエントリのみ有効とする）。
// この2件の発見により、「reviewStatus='published' のみ」「publishHistoryの存在のみ」の
// どちらか一方だけでは判定しないという設計にした（両方の整合が取れた記録のみを数える）。
//
// 【8分類の解決】Articles.primaryCategory8（2026-09-24新設）を優先的に使うが、
// それより前に作成された記事はこのフィールドが未設定（null）のものが多い。その場合は
// 既存の deriveProvisionalCategory（タイトル・会場の明記語のみ・推測なし）→
// mapToPrimaryCategory8 で後方互換的に解決する（新しい判定ロジックは作らず、既存の
// 確定的ロジックを再利用するだけ）。どちらでも解決できない場合は「未分類」として
// 特定カテゴリーへ加算しない（推測で埋めない）。

import { mapToPrimaryCategory8, PRIMARY_CATEGORY_8, type PrimaryCategory8 } from './primaryCategory8'
import { deriveProvisionalCategory } from './provisionalCategory'

export interface PublishHistoryEntryLike {
  channel?: string | null
  publishedAt?: string | null
}

export interface ArticleForCategoryHistory {
  id: number
  reviewStatus?: string | null
  createdAt?: string | null
  primaryCategory8?: string | null
  title?: string | null
  venue?: string | null
  publishHistory?: PublishHistoryEntryLike[] | null
}

export type CategoryBasis = 'primaryCategory8Field' | 'titleFallback' | 'unclassified'

export interface VerifiedPublication {
  articleId: number
  category: PrimaryCategory8 | null
  categoryBasis: CategoryBasis
  publishedAt: string
}

function resolveCategory8(a: ArticleForCategoryHistory): { category: PrimaryCategory8 | null; categoryBasis: CategoryBasis } {
  const pc8 = (a.primaryCategory8 ?? '').trim().toUpperCase()
  if (pc8 && (PRIMARY_CATEGORY_8 as readonly string[]).includes(pc8)) {
    return { category: pc8 as PrimaryCategory8, categoryBasis: 'primaryCategory8Field' }
  }
  const prov = deriveProvisionalCategory({ title: a.title ?? null, venue: a.venue ?? null })
  const mapped = prov.category ? mapToPrimaryCategory8(prov.category) : null
  if (mapped) return { category: mapped, categoryBasis: 'titleFallback' }
  return { category: null, categoryBasis: 'unclassified' }
}

/**
 * reviewStatus='published' かつ、createdAt以降のpublishedAtを持つ channel='note' の
 * publishHistoryエントリが存在する場合のみ「検証済み公開」を返す（どちらか一方だけでは
 * 判定しない）。該当するエントリが複数あれば最も古いものを採用する（通常は1件のみ）。
 */
export function resolveVerifiedPublication(a: ArticleForCategoryHistory): VerifiedPublication | null {
  if (a.reviewStatus !== 'published') return null
  const entries = (a.publishHistory ?? []).filter(
    (h): h is PublishHistoryEntryLike & { publishedAt: string } => !!h && h.channel === 'note' && !!h.publishedAt,
  )
  if (entries.length === 0) return null
  const createdMs = a.createdAt ? Date.parse(a.createdAt) : NaN
  const valid = entries.filter((h) => {
    const t = Date.parse(h.publishedAt)
    return Number.isFinite(t) && (!Number.isFinite(createdMs) || t >= createdMs)
  })
  if (valid.length === 0) return null
  const earliest = valid.reduce((p, c) => (Date.parse(c.publishedAt) < Date.parse(p.publishedAt) ? c : p))
  const { category, categoryBasis } = resolveCategory8(a)
  return {
    articleId: a.id,
    category,
    categoryBasis,
    publishedAt: new Date(Date.parse(earliest.publishedAt)).toISOString(),
  }
}

export interface CategoryPublishCountResult {
  windowDays: number
  windowStartIso: string
  windowEndIso: string
  counts: Record<PrimaryCategory8, number>
  unclassifiedCount: number
  totalVerifiedInWindow: number
  /** window内の検証済み公開一覧（新しい順ではなく入力順） */
  entries: VerifiedPublication[]
  /** window外も含む全ての検証済み公開（監査用） */
  allVerified: VerifiedPublication[]
  /** reviewStatus='published' だが検証できなかった件数（#2のような既存の不整合を可視化） */
  unverifiedPublishedCount: number
}

/** 週あたりの目安配分（14枠÷7分類＝各2本）。ルール4の目安値。厳密な割当ではない。 */
export const WEEKLY_PER_CATEGORY_TARGET = 2

export function computeCategoryPublishCounts(
  articles: ArticleForCategoryHistory[],
  opts: { now: Date; windowDays?: number },
): CategoryPublishCountResult {
  const windowDays = opts.windowDays ?? 7
  const windowEnd = opts.now
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000)

  const counts = Object.fromEntries(PRIMARY_CATEGORY_8.map((k) => [k, 0])) as Record<PrimaryCategory8, number>
  let unclassifiedCount = 0
  const allVerified: VerifiedPublication[] = []
  let unverifiedPublishedCount = 0

  for (const a of articles) {
    const v = resolveVerifiedPublication(a)
    if (!v) {
      if (a.reviewStatus === 'published') unverifiedPublishedCount++
      continue
    }
    allVerified.push(v)
  }

  const entries = allVerified.filter((v) => {
    const t = Date.parse(v.publishedAt)
    return t >= windowStart.getTime() && t <= windowEnd.getTime()
  })
  for (const v of entries) {
    if (v.category) counts[v.category] += 1
    else unclassifiedCount += 1
  }

  return {
    windowDays,
    windowStartIso: windowStart.toISOString(),
    windowEndIso: windowEnd.toISOString(),
    counts,
    unclassifiedCount,
    totalVerifiedInWindow: entries.length,
    entries,
    allVerified,
    unverifiedPublishedCount,
  }
}
