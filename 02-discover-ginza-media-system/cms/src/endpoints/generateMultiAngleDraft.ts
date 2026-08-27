import type { Endpoint } from 'payload'

import { createMultiAngleDraftsFromDiscoveredContent } from '../lib/ai/createMultiAngleDraftsFromDiscoveredContent'

// POST /api/ai/generate-multi-angle-draft { discoveredContentId } —
// 認証済みユーザーのみ実行可能（generateDraft.ts/generateWeeklyDraft.tsと
// 同じ認証パターン）。Project 02-1「核情報→最大5記事」拡張（2026-08-27）。
export const generateMultiAngleDraftEndpoint: Endpoint = {
  path: '/ai/generate-multi-angle-draft',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { discoveredContentId?: string | number } | undefined
    const discoveredContentId = body?.discoveredContentId

    if (!discoveredContentId) {
      return Response.json({ error: 'discoveredContentId is required' }, { status: 400 })
    }

    try {
      const result = await createMultiAngleDraftsFromDiscoveredContent(req.payload, discoveredContentId)
      return Response.json(result, { status: 201 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
