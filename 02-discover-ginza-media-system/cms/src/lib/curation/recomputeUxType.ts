import type { Payload } from 'payload'

import { classifyUxType, UX_TYPES, type UxType } from './uxType'

// 既存DiscoveredContentへ、参加／体験型UXタイプを遡及的に反映するバッチ処理
// （2026-08-18）。recomputeContentRichness.tsと同じ考え方——新規AI呼び出しは
// 一切行わない。既に保存済みのtitle/excerpt/contentType/
// editorialScore.contentRichnessTierだけを使う決定的な再計算（課金なし）。
//
// `./p2 recompute-ux-type [--dry-run]`から呼び出す。discoveryStatus・
// curationStatus・editorialScore（本体）には一切触れない——更新するのは
// uxTypeフィールドのみ。

export interface RecomputeUxTypeResult {
  persisted: boolean
  scanned: number
  updated: number
  typeCounts: Record<UxType, number>
}

export async function recomputeUxType(
  payload: Payload,
  options: { persist?: boolean; limit?: number } = {},
): Promise<RecomputeUxTypeResult> {
  const persist = options.persist ?? true
  const limit = options.limit ?? 1000

  const { docs } = await payload.find({
    collection: 'discovered-content',
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const typeCounts = Object.fromEntries(UX_TYPES.map((t) => [t, 0])) as Record<UxType, number>
  let updated = 0

  for (const doc of docs) {
    const uxType = classifyUxType(doc.title, doc.excerpt, doc.contentType, doc.editorialScore?.contentRichnessTier)
    typeCounts[uxType] += 1

    if (!persist) continue
    if (doc.uxType === uxType) continue // 冪等：既に同じ値なら書き込みをスキップ

    await payload.update({
      collection: 'discovered-content',
      id: doc.id,
      overrideAccess: true,
      data: { uxType },
    })
    updated += 1
  }

  return { persisted: persist, scanned: docs.length, updated, typeCounts }
}
