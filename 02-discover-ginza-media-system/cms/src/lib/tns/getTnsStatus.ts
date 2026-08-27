import type { Payload } from 'payload'

// `./p2 tns status`用の状態取得（2026-08-27）。読み取り専用、AI呼び出し・
// 外部API呼び出しは一切行わない。

export interface TnsStatusResult {
  found: boolean
  editionNumber?: number
  weekStart?: string
  weekEnd?: string
  articleId?: number | null
  articleReviewStatus?: string | null
  visualStatus?: string | null
  musicUsageLedgerRegistered?: boolean
  pendingHumanSelectionCount?: number
  approvalState?: 'pending_human_approval' | 'in_review' | 'published'
}

// 「最新」は、CMS外で公開済みの過去号を遡及登録しただけのhistorical_import
// を除き、直近で作成・更新されたeditionを指す（updatedAt降順）。
// editionNumberの大小では判断しない——過去のテスト・修正で番号の前後関係が
// 実態と一致しない期間があったため（CLAUDE.md/DECISION_LOG参照）、
// 「マロンが直近に触ったもの」を最も素直に表すupdatedAtを基準にする。
export async function getTnsStatus(payload: Payload): Promise<TnsStatusResult> {
  const { docs } = await payload.find({
    collection: 'soundtrack-editions',
    where: { status: { not_equals: 'historical_import' } },
    sort: '-updatedAt',
    limit: 1,
    depth: 1,
  })

  const edition = docs[0]
  if (!edition) {
    return { found: false }
  }

  const article = edition.generatedArticle
  const articleId = article ? (typeof article === 'object' ? Number(article.id) : Number(article)) : null
  const articleReviewStatus = article && typeof article === 'object' ? String(article.reviewStatus) : null

  let musicUsageLedgerRegistered = false
  const { totalDocs } = await payload.count({
    collection: 'music-usage-ledger',
    where: { soundtrackEdition: { equals: edition.id } },
  })
  musicUsageLedgerRegistered = totalDocs > 0

  const pendingHumanSelectionCount = (edition.dailyScenes ?? []).filter(
    (scene: { musicSelected?: { pendingHumanSelection?: boolean | null } }) =>
      Boolean(scene.musicSelected?.pendingHumanSelection),
  ).length

  let approvalState: TnsStatusResult['approvalState'] = 'pending_human_approval'
  if (articleReviewStatus === 'published') {
    approvalState = 'published'
  } else if (articleReviewStatus === 'review' || articleReviewStatus === 'approved') {
    approvalState = 'in_review'
  }

  return {
    found: true,
    editionNumber: Number(edition.editionNumber),
    weekStart: String(edition.weekStart).slice(0, 10),
    weekEnd: String(edition.weekEnd).slice(0, 10),
    articleId,
    articleReviewStatus,
    visualStatus: edition.visual?.visualStatus ?? null,
    musicUsageLedgerRegistered,
    pendingHumanSelectionCount,
    approvalState,
  }
}
