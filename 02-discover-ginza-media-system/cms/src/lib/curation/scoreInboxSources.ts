import type { Payload, Where } from 'payload'

import type { ScoreSourceInput } from './scoreSource'
import { scoreSourceById } from './scoreSourceById'
import type { CurationResult, ScoringMethod } from './types'

// 「旬の銀座」編集判断レイヤー：Inbox候補をまとめて採点するバッチ処理
// （2026-08-17、evaluateInboxSources.tsと同じ考え方）。
// 対象はeditorial.editorialStatus === 'inbox'のSourcesのみ（SOURCE LEDGER自動巡回
// →generateSourceCandidatesFromSnapshotsが生成する候補と同じ集合）。
// コスト制御のため1回あたりのAPIコール数に既定・上限を設ける（CLAUDE.md第13章）。

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 50

interface ScoreInboxSourcesOptions {
  limit?: number
  force?: boolean
  scoringMethod?: ScoringMethod
  score?: (input: ScoreSourceInput) => Promise<CurationResult> | CurationResult
}

export async function scoreInboxSources(payload: Payload, options: ScoreInboxSourcesOptions = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
  const force = options.force ?? false

  const where: Where = force
    ? { 'editorial.editorialStatus': { equals: 'inbox' } }
    : {
        and: [
          { 'editorial.editorialStatus': { equals: 'inbox' } },
          { 'editorialScore.scoredAt': { exists: false } },
        ],
      }

  const { docs: candidates } = await payload.find({
    collection: 'sources',
    where,
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const results: Array<{
    sourceId: number
    status: 'scored' | 'error'
    total?: number
    error?: string
  }> = []

  for (const candidate of candidates) {
    try {
      const { total } = await scoreSourceById(payload, candidate.id, {
        score: options.score,
        scoringMethod: options.scoringMethod,
        force,
      })
      results.push({ sourceId: Number(candidate.id), status: 'scored', total })
    } catch (err) {
      results.push({
        sourceId: Number(candidate.id),
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
