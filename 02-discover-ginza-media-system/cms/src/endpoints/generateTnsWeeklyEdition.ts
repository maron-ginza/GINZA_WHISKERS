import type { Endpoint } from 'payload'

import { createWeeklySoundtrackEdition } from '../lib/tns/createWeeklySoundtrackEdition'

// POST /api/tns/generate-weekly-edition { maronWeeklyObservation, maronOptional? } —
// 認証済みユーザーのみ実行可能（既存generateDraft.ts等と同じ認証パターン）。
// 🌈Tokyo Nostalgic Soundtrack 週次生成（2026-08-27）。
export const generateTnsWeeklyEditionEndpoint: Endpoint = {
  path: '/tns/generate-weekly-edition',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as
      | {
          maronWeeklyObservation?: string
          maronOptional?: { mustIncludeEvent?: string; fieldworkNotes?: string }
        }
      | undefined

    if (!body?.maronWeeklyObservation) {
      return Response.json({ error: 'maronWeeklyObservation is required' }, { status: 400 })
    }

    try {
      const result = await createWeeklySoundtrackEdition(req.payload, {
        maronWeeklyObservation: body.maronWeeklyObservation,
        maronOptional: body.maronOptional,
      })
      return Response.json(result, { status: 201 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
