import type { Payload } from 'payload'

import type { EvaluateSourceInput, SourceEvaluation } from './evaluateSource'
import { evaluateSourceById } from './evaluateSourceById'

// Phase 14：受信箱(inbox)に溜まったSourcesをまとめて評価する、Editor's Choice
// 候補選定のバッチ処理。1回の呼び出しごとにAPIコール数の上限を設けてコストを
// 制御する（CLAUDE.md 第13章 運用コスト方針）。

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

interface EvaluateInboxSourcesOptions {
  limit?: number
  evaluate?: (input: EvaluateSourceInput) => Promise<SourceEvaluation>
}

export async function evaluateInboxSources(
  payload: Payload,
  options: EvaluateInboxSourcesOptions = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT))

  const { docs: candidates } = await payload.find({
    collection: 'sources',
    where: { 'editorial.editorialStatus': { equals: 'inbox' } },
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const results: Array<{
    sourceId: number
    status: 'evaluated' | 'error'
    editorialStatus?: string
    error?: string
  }> = []

  for (const candidate of candidates) {
    try {
      const { source } = await evaluateSourceById(payload, candidate.id, {
        evaluate: options.evaluate,
      })
      results.push({
        sourceId: Number(candidate.id),
        status: 'evaluated',
        editorialStatus: source.editorial.editorialStatus,
      })
    } catch (err) {
      results.push({
        sourceId: Number(candidate.id),
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    evaluatedCount: results.filter((r) => r.status === 'evaluated').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    editorsChoiceCount: results.filter((r) => r.editorialStatus === 'editors-choice').length,
    results,
  }
}
