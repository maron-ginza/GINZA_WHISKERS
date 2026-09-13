// GINZA WHISKERS / Project 02（2026-09-13）— 「既にArticle／note下書き化済みのDiscoveredContent」
// を判定する共通ヘルパー（DB問い合わせ・reviewStatus不問＝draftも含めて拾う）。
//
// morningBrief.ts に重複していた同一ロジック（2箇所）を1関数へ集約した
// （リファクターのみ・挙動は従来と同一）。

import type { Payload } from 'payload'

/**
 * 指定した DiscoveredContent id 群のうち、Articles.editorialProvenance で参照済み
 * （＝reviewStatus を問わず何らかの Article が既に生成されている）ものの id 集合を返す。
 * 空配列を渡した場合は空の Set を返す（DB問い合わせしない）。
 */
export async function loadAlreadyDraftedDcIds(payload: Payload, dcIds: number[]): Promise<Set<number>> {
  const result = new Set<number>()
  if (dcIds.length === 0) return result

  const prov = await payload.find({
    collection: 'articles',
    where: { 'editorialProvenance.discoveredContentSource': { in: dcIds } },
    limit: 500,
    depth: 1,
    overrideAccess: true,
  })
  for (const a of prov.docs as unknown as Record<string, unknown>[]) {
    for (const p of (Array.isArray(a.editorialProvenance) ? a.editorialProvenance : []) as Record<string, unknown>[]) {
      const ref = p.discoveredContentSource
      const id = typeof ref === 'object' && ref ? Number((ref as { id?: number }).id) : Number(ref)
      if (Number.isFinite(id)) result.add(id)
    }
  }
  return result
}
