import type { Endpoint } from 'payload'

import { scoreInboxSources } from '../lib/curation/scoreInboxSources'
import { scoreSourceById, SourceAlreadyScoredError } from '../lib/curation/scoreSourceById'

// 「旬の銀座」編集判断レイヤー（2026-08-17）。evaluateSource.ts/evaluateInbox.tsと
// 同じ考え方——AI呼び出しの起点は必ず認証済みの人間が与える。書き込み先の
// editorialScore/audienceTags自体は人間ゲート対象外（採否を決めるものではなく、
// 順位付けのための追加メタデータのため）。
//
// パスは`/ai/...`配下——`/source-ledger/...`のような既存コレクションslugと
// 衝突するパスは使わない（2026-08-17、crawlSourceLedgerEndpointで発見・修正した
// Payloadルーティングの罠。詳細はcollections/SourceLedger.tsのコメント参照）。

// POST /api/ai/score-source { sourceId, force? }
export const scoreSourceEndpoint: Endpoint = {
  path: '/ai/score-source',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { sourceId?: string; force?: boolean } | undefined
    const sourceId = body?.sourceId

    if (!sourceId) {
      return Response.json({ error: 'sourceId is required' }, { status: 400 })
    }

    try {
      const { source, total } = await scoreSourceById(req.payload, sourceId, {
        force: body?.force,
      })
      return Response.json({ source, total }, { status: 200 })
    } catch (err) {
      if (err instanceof SourceAlreadyScoredError) {
        return Response.json({ error: err.message }, { status: 409 })
      }
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}

// POST /api/ai/score-inbox { limit?, force? }
export const scoreInboxEndpoint: Endpoint = {
  path: '/ai/score-inbox',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { limit?: number; force?: boolean } | undefined

    try {
      const result = await scoreInboxSources(req.payload, {
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
