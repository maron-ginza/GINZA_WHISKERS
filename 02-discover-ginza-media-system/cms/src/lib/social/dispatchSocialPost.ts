import type { Payload } from 'payload'

import { postToInstagram } from '../../workers/postToInstagram'
import { postToX } from '../../workers/postToX'
import type { SocialChannel } from './buildCandidates'

// Phase 15：人間が「配信準備完了(ready)」へ承認したSNS配信候補を、実際に
// 送信する最終ゲート。CLAUDE.md第8章「自動投稿は行わない」＝人間の確認を
// 経ない配信をしない、の原則をここで具体化する。
//
// note：公式投稿APIが存在しないため、人間が手動投稿した事実を明示的に
// 確認（confirmManual: true）した場合のみsentへ進む。
// x/instagram：postToX/postToInstagram（src/workers/）を呼び出す。いずれも
// 認証情報未設定のため実際には送信されず、即座に失敗する（意図した安全な
// 挙動。Phase 15の本セッション範囲では外部認証・実投稿は対象外）。
// テスト・シミュレーション用に送信関数を差し替え可能にしている
// （evaluateSourceById.tsのevaluate差し替えパターンと同じ考え方）。

export class SocialPostNotDispatchableError extends Error {}
export class SocialPostManualConfirmationRequiredError extends Error {}

interface DispatchSenders {
  x?: (input: { text: string }) => Promise<{ postId: string; url: string }>
  instagram?: (input: { imageUrl: string; caption: string }) => Promise<{ mediaId: string }>
}

export interface DispatchOptions {
  userId: number
  confirmManual?: boolean
  senders?: DispatchSenders
}

export async function dispatchSocialPost(payload: Payload, id: number, options: DispatchOptions) {
  const post = await payload.findByID({
    collection: 'social-posts',
    id,
    depth: 1,
    overrideAccess: true,
  })

  if (post.status !== 'ready') {
    throw new SocialPostNotDispatchableError(
      `配信できるのはstatus=readyの項目のみです（現在: ${post.status}）。先に人間の承認でreadyへ遷移させてください`,
    )
  }

  const article = post.article
  const articleId = typeof article === 'object' && article !== null ? article.id : article

  if (post.channel === 'note') {
    if (!options.confirmManual) {
      throw new SocialPostManualConfirmationRequiredError(
        'noteは公式投稿APIが存在しないため、人間が手動投稿した事実の確認（confirmManual: true）が必要です',
      )
    }

    const updated = await payload.update({
      collection: 'social-posts',
      id,
      overrideAccess: true,
      user: { id: options.userId },
      data: { status: 'sent' },
    })

    await appendPublishHistory(payload, articleId, post.channel, options.userId)
    return updated
  }

  const sendX = options.senders?.x ?? postToX
  const sendInstagram = options.senders?.instagram ?? postToInstagram

  try {
    let reference = ''

    if (post.channel === 'x') {
      const result = await sendX({ text: post.copy?.ja || post.copy?.en || '' })
      reference = result.url
    } else if (post.channel === 'instagram') {
      // 実際のヒーロー画像URL解決はPhase 15の本セッション範囲外（実投稿自体を
      // 行わないため）。将来Instagram実配信を有効化する際に実装する。
      const result = await sendInstagram({ imageUrl: '', caption: post.copy?.ja || post.copy?.en || '' })
      reference = result.mediaId
    }

    const updated = await payload.update({
      collection: 'social-posts',
      id,
      overrideAccess: true,
      user: { id: options.userId },
      data: { status: 'sent', reference },
    })

    await appendPublishHistory(payload, articleId, post.channel, options.userId)
    return updated
  } catch (err) {
    return payload.update({
      collection: 'social-posts',
      id,
      overrideAccess: true,
      data: {
        status: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

async function appendPublishHistory(
  payload: Payload,
  articleId: number,
  channel: SocialChannel,
  userId: number,
) {
  const article = await payload.findByID({
    collection: 'articles',
    id: articleId,
    depth: 0,
    overrideAccess: true,
  })

  const history = article.publishHistory ?? []

  // 既に同チャネルの配信記録があれば追加しない（二重配信防止の第二防衛ライン。
  // social-posts側のsent不変ルールと合わせた多重防御）
  if (history.some((r) => r?.channel === channel)) return

  await payload.update({
    collection: 'articles',
    id: articleId,
    overrideAccess: true,
    data: {
      publishHistory: [
        ...history,
        { channel, publishedAt: new Date().toISOString(), publishedBy: userId },
      ],
    },
  })
}
