import type { Endpoint } from 'payload'

import { scoreDiscoveredContentBatch } from '../lib/curation/scoreDiscoveredContentBatch'
import {
  DiscoveredContentAlreadyScoredError,
  scoreDiscoveredContentById,
} from '../lib/curation/scoreDiscoveredContentById'

// 個別記事・イベント（DiscoveredContent）向けのEditorial Score/Audience Tags
// エンドポイント（2026-08-17）。endpoints/scoreSource.tsと同じパターン——
// `/ai/...`名前空間を使い、コレクションslugと衝突するパス
// （`/discovered-content/...`のようなパス）は避ける
// （2026-08-17に発見・修正したPayloadルーティングの罠、
// collections/SourceLedger.tsのコメント参照）。

// POST /api/ai/score-discovered-content { id, force? }
export const scoreDiscoveredContentEndpoint: Endpoint = {
  path: '/ai/score-discovered-content',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { id?: string; force?: boolean } | undefined
    if (!body?.id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    try {
      const { doc, total } = await scoreDiscoveredContentById(req.payload, body.id, {
        force: body?.force,
      })
      return Response.json({ doc, total }, { status: 200 })
    } catch (err) {
      if (err instanceof DiscoveredContentAlreadyScoredError) {
        return Response.json({ error: err.message }, { status: 409 })
      }
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}

// POST /api/ai/score-discovered-inbox { limit?, force? }
export const scoreDiscoveredInboxEndpoint: Endpoint = {
  path: '/ai/score-discovered-inbox',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { limit?: number; force?: boolean } | undefined

    try {
      const result = await scoreDiscoveredContentBatch(req.payload, {
        limit: body?.limit,
        force: body?.force,
      })
      return Response.json(result, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
