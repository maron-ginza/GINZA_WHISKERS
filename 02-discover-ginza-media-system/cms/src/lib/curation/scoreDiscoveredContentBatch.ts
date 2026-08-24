import type { Payload, Where } from 'payload'

import type { ScoreSourceInput } from './scoreSource'
import { scoreDiscoveredContentById } from './scoreDiscoveredContentById'
import type { CurationResult, ScoringMethod } from './types'

// DiscoveredContent（個別記事・イベント）のバッチ採点（2026-08-17）。
// scoreInboxSources.ts（Sources向け）と同じ考え方——対象はcurationStatus:'inbox'の
// 候補のみ、コスト制御のため既定・上限のあるlimitを設ける。
//
// スコアリング自体は「Daily」の新鮮さでは絞り込まない（広く採点しておき、
// 新鮮さに基づく絞り込みは表示側のdailyRanking.tsが担当する）——採点済みデータを
// 後から日次ランキングに使い回せるようにするため。

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

interface ScoreDiscoveredContentBatchOptions {
  limit?: number
  force?: boolean
  scoringMethod?: ScoringMethod
  score?: (input: ScoreSourceInput) => Promise<CurationResult> | CurationResult
}

export async function scoreDiscoveredContentBatch(
  payload: Payload,
  options: ScoreDiscoveredContentBatchOptions = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
  const force = options.force ?? false

  const where: Where = force
    ? { curationStatus: { equals: 'inbox' } }
    : {
        and: [
          { curationStatus: { equals: 'inbox' } },
          { 'editorialScore.scoredAt': { exists: false } },
        ],
      }

  const { docs: candidates } = await payload.find({
    collection: 'discovered-content',
    where,
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const results: Array<{
    id: number
    status: 'scored' | 'error'
    total?: number
    error?: string
  }> = []

  for (const candidate of candidates) {
    try {
      const { total } = await scoreDiscoveredContentById(payload, candidate.id, {
        score: options.score,
        scoringMethod: options.scoringMethod,
        force,
      })
      results.push({ id: Number(candidate.id), status: 'scored', total })
    } catch (err) {
      results.push({
        id: Number(candidate.id),
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    scannedCandidates: candidates.length,
    scoredCount: results.filter((r) => r.status === 'scored').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    results,
  }
}
