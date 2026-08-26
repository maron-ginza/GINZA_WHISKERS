import type { Endpoint } from 'payload'

import { createWeeklyDraftFromDiscoveredContent } from '../lib/ai/createWeeklyDraftFromDiscoveredContent'

// POST /api/ai/generate-weekly-draft { discoveredContentIds, pillarIds? } —
// 認証済みユーザーのみ実行可能。generateDraft.ts（Source単体）と並行する、
// 複数DiscoveredContent（Maron Editor's Choice承認済み）を入力とする
// 週次「旬の銀座」記事生成エンドポイント。
// pillarIdsは省略可（2026-08-25、Human Editor Review P2-6）——省略時は
// 各DiscoveredContentのcontentTypeから収蔵室を自動推定する
// （createWeeklyDraftFromDiscoveredContent.ts参照）。明示指定した場合は
// 自動推定分と合算される。
export const generateWeeklyDraftEndpoint: Endpoint = {
  path: '/ai/generate-weekly-draft',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as
      | { discoveredContentIds?: (string | number)[]; pillarIds?: (string | number)[] }
      | undefined
    const discoveredContentIds = body?.discoveredContentIds
    const pillarIds = body?.pillarIds ?? []

    if (!discoveredContentIds || discoveredContentIds.length === 0) {
      return Response.json({ error: 'discoveredContentIds is required' }, { status: 400 })
    }

    try {
      const article = await createWeeklyDraftFromDiscoveredContent(
        req.payload,
        discoveredContentIds,
        pillarIds,
      )
      return Response.json({ article }, { status: 201 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
