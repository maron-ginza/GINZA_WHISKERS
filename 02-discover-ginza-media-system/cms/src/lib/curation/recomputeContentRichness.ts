import type { Payload } from 'payload'

import { applyContentRichnessPenalty, assessContentRichness, type ContentRichnessTier } from './contentRichness'

// 既存の採点済み候補（Sources・DiscoveredContent）へ、本文情報量ペナルティを
// 遡及的に反映するバッチ処理（2026-08-18）。
//
// 【新規AI呼び出しは一切行わない】既に保存済みのcontentRef/excerptテキストと
// 既存のeditorialScore（5軸の値・合計）だけを使う決定的な再計算——課金は
// 発生しない。`./p2 recompute-richness [--dry-run]`から呼び出す。
//
// 【冪等性】既にrawTotalが記録されている（＝一度この処理を通過済みの）候補は
// rawTotal（ペナルティ適用前の値）を基準に再計算する。まだ未処理の候補は
// 既存のtotal（当時はペナルティ未適用だったため、これがそのままrawTotalに
// 相当する）を基準にする。どちらの場合も5軸の値・reason文・scoringMethod・
// scoredAtには一切触れない——Payloadのgroup型フィールドは列単位の部分更新が
// 可能なため、editorialScore.total/rawTotal/contentRichnessTier/
// contentRichnessPenaltyFactorだけを指定して更新する（2026-08-10の実地検証で
// 確認済みの挙動、CLAUDE.md参照）。

export interface RecomputeContentRichnessResult {
  persisted: boolean
  sourcesScanned: number
  sourcesUpdated: number
  discoveredContentScanned: number
  discoveredContentUpdated: number
  tierCounts: Record<ContentRichnessTier, number>
}

function resolveRawTotal(editorialScore: { rawTotal?: number | null; total?: number | null } | null | undefined): number {
  if (!editorialScore) return 0
  if (typeof editorialScore.rawTotal === 'number') return editorialScore.rawTotal
  return typeof editorialScore.total === 'number' ? editorialScore.total : 0
}

export async function recomputeContentRichness(
  payload: Payload,
  options: { persist?: boolean; limit?: number } = {},
): Promise<RecomputeContentRichnessResult> {
  const persist = options.persist ?? true
  const limit = options.limit ?? 1000

  const tierCounts: Record<ContentRichnessTier, number> = { rich: 0, thin: 0, boilerplate: 0 }

  const { docs: sources } = await payload.find({
    collection: 'sources',
    where: { 'editorialScore.scoredAt': { exists: true } },
    limit,
    depth: 0,
    overrideAccess: true,
  })

  let sourcesUpdated = 0
  for (const source of sources) {
    const rawTotal = resolveRawTotal(source.editorialScore)
    const richness = assessContentRichness(source.contentRef)
    tierCounts[richness.tier] += 1
    const total = applyContentRichnessPenalty(rawTotal, richness.penaltyFactor)

    if (!persist) continue

    await payload.update({
      collection: 'sources',
      id: source.id,
      overrideAccess: true,
      data: {
        editorialScore: {
          rawTotal,
          total,
          contentRichnessTier: richness.tier,
          contentRichnessPenaltyFactor: richness.penaltyFactor,
        },
      },
    })
    sourcesUpdated += 1
  }

  const { docs: discoveredContents } = await payload.find({
    collection: 'discovered-content',
    where: { 'editorialScore.scoredAt': { exists: true } },
    limit,
    depth: 0,
    overrideAccess: true,
  })

  let discoveredContentUpdated = 0
  for (const doc of discoveredContents) {
    const rawTotal = resolveRawTotal(doc.editorialScore)
    const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : ''
    const excerpt = typeof doc.excerpt === 'string' ? doc.excerpt.trim() : ''
    const contentRef = [title, excerpt].filter(Boolean).join('\n\n')
    const richness = assessContentRichness(contentRef)
    tierCounts[richness.tier] += 1
    const total = applyContentRichnessPenalty(rawTotal, richness.penaltyFactor)

    if (!persist) continue

    await payload.update({
      collection: 'discovered-content',
      id: doc.id,
      overrideAccess: true,
      data: {
        editorialScore: {
          rawTotal,
          total,
          contentRichnessTier: richness.tier,
          contentRichnessPenaltyFactor: richness.penaltyFactor,
        },
      },
    })
    discoveredContentUpdated += 1
  }

  return {
    persisted: persist,
    sourcesScanned: sources.length,
    sourcesUpdated,
    discoveredContentScanned: discoveredContents.length,
    discoveredContentUpdated,
    tierCounts,
  }
}
