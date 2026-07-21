import type { Endpoint } from 'payload'

import { createDraftFromSource } from '../lib/ai/createDraftFromSource'

// POST /api/ai/generate-draft { sourceId } — 認証済みユーザーのみ実行可能。
export const generateDraftEndpoint: Endpoint = {
  path: '/ai/generate-draft',
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
      const article = await createDraftFromSource(req.payload, sourceId)
      return Response.json({ article }, { status: 201 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
