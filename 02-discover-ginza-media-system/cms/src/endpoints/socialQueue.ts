import type { Endpoint } from 'payload'

import {
  dispatchSocialPost,
  SocialPostManualConfirmationRequiredError,
  SocialPostNotDispatchableError,
} from '../lib/social/dispatchSocialPost'
import { dryRunSocialQueue } from '../lib/social/dryRun'
import { generateSocialQueue } from '../lib/social/generateQueue'

// Phase 15：generateDraft.ts/evaluateSource.tsと同じ考え方——AI・自動化の
// 起点は必ず認証済みの人間が与える。書き込み先のpending生成自体は人間ゲート
// 対象外だが、エンドポイント呼び出し自体は認証必須にする。

// POST /api/social/generate-queue — published/approved記事からSNS配信候補を生成（冪等）
export const generateSocialQueueEndpoint: Endpoint = {
  path: '/social/generate-queue',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    try {
      const result = await generateSocialQueue(req.payload)
      return Response.json(result, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}

// POST /api/social/dry-run — pending/ready項目の配信内容プレビュー（実配信なし）
export const dryRunSocialQueueEndpoint: Endpoint = {
  path: '/social/dry-run',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    try {
      const result = await dryRunSocialQueue(req.payload)
      return Response.json(result, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}

// POST /api/social/mark-ready { id } — 人間がpending候補を配信準備完了(ready)にする
export const markSocialPostReadyEndpoint: Endpoint = {
  path: '/social/mark-ready',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { id?: string } | undefined
    if (!body?.id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    try {
      const updated = await req.payload.update({
        collection: 'social-posts',
        id: body.id,
        user: req.user,
        data: { status: 'ready' },
      })
      return Response.json({ post: updated }, { status: 200 })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}

// POST /api/social/dispatch { id, confirmManual? } — 人間の最終承認後の実配信
// （note＝手動投稿確認、x/instagram＝実API送信。認証情報未設定のため実際には失敗する）
export const dispatchSocialPostEndpoint: Endpoint = {
  path: '/social/dispatch',
  method: 'post',
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await req.json?.()) as { id?: string | number; confirmManual?: boolean } | undefined
    if (!body?.id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    try {
      const updated = await dispatchSocialPost(req.payload, Number(body.id), {
        userId: Number(req.user.id),
        confirmManual: body.confirmManual,
      })
      return Response.json({ post: updated }, { status: 200 })
    } catch (err) {
      if (
        err instanceof SocialPostNotDispatchableError ||
        err instanceof SocialPostManualConfirmationRequiredError
      ) {
        return Response.json({ error: err.message }, { status: 409 })
      }
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  },
}
