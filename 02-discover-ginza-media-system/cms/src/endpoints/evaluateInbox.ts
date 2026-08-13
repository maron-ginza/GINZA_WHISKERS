import type { Endpoint } from 'payload'

import { evaluateInboxSources } from '../lib/ai/evaluateInboxSources'

// POST /api/ai/evaluate-inbox { limit? } — 認証済みユーザーのみ実行可能。
// 受信箱(inbox)のSourcesをまとめてAI評価し、Editor's Choice候補を選定する
// バッチ処理（Phase 14）。limitはコスト制御のため既定5・上限20（evaluateInboxSources.ts参照）。
export const evaluateInboxEndpoint: Endpoint = {
  path: '/ai/evaluate-inbox',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { limit?: number } | undefined

    try {
      const result = await evaluateInboxSources(req.payload, { limit: body?.limit })
      return Response.json(result, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
