import type { Endpoint } from 'payload'

import { evaluateSourceById, SourceNotEvaluatableError } from '../lib/ai/evaluateSourceById'

// POST /api/ai/evaluate-source { sourceId } — 認証済みユーザーのみ実行可能。
// generateDraft.tsと同じ考え方：AI呼び出しの起点は人間が与えるが、書き込み先の
// editorialStatus（review／editors-choice）自体は人間ゲート対象外（Sources.ts参照）。
export const evaluateSourceEndpoint: Endpoint = {
  path: '/ai/evaluate-source',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { sourceId?: string } | undefined
    const sourceId = body?.sourceId

    if (!sourceId) {
      return Response.json({ error: 'sourceId is required' }, { status: 400 })
    }

    try {
      const { source, evaluation } = await evaluateSourceById(req.payload, sourceId)
      return Response.json({ source, evaluation }, { status: 200 })
    } catch (err) {
      if (err instanceof SourceNotEvaluatableError) {
        return Response.json({ error: err.message }, { status: 409 })
      }
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
