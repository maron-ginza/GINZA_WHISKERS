import type { Payload } from 'payload'

import { buildSocialPostCandidates, type ArticleSocialCopyRaw } from './buildCandidates'

// Phase 15：published/approved記事を走査し、SNS配信候補（social-posts、
// status=pending）を生成する。冪等——既存のdedupeKey（{articleId}:{channel}）が
// あれば作成しない。承認・公開の状態遷移（人間ゲート）には一切触れない
// 読み取り＋pending追加のみの安全な操作。

const ELIGIBLE_REVIEW_STATUSES = ['approved', 'published'] as const

export interface GenerateQueueResult {
  scannedArticles: number
  createdCount: number
  created: Array<{ id: string | number; articleId: string | number; channel: string }>
}

export async function generateSocialQueue(payload: Payload): Promise<GenerateQueueResult> {
  const { docs: articles } = await payload.find({
    collection: 'articles',
    where: { reviewStatus: { in: [...ELIGIBLE_REVIEW_STATUSES] } },
    locale: 'all',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })

  const created: GenerateQueueResult['created'] = []

  for (const article of articles) {
    const socialCopy = (article as unknown as { socialCopy?: ArticleSocialCopyRaw }).socialCopy
    const publishHistory = Array.isArray(
      (article as unknown as { publishHistory?: unknown[] }).publishHistory,
    )
      ? ((article as unknown as { publishHistory: Array<{ channel?: string }> }).publishHistory ?? [])
      : []

    const alreadyPublishedChannels = new Set(
      publishHistory.filter((r) => Boolean(r?.channel)).map((r) => r.channel as string),
    )

    const candidates = buildSocialPostCandidates(socialCopy, alreadyPublishedChannels)

    for (const candidate of candidates) {
      const dedupeKey = `${article.id}:${candidate.channel}`

      const existing = await payload.find({
        collection: 'social-posts',
        where: { dedupeKey: { equals: dedupeKey } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (existing.totalDocs > 0) continue

      const doc = await payload.create({
        collection: 'social-posts',
        overrideAccess: true,
        data: {
          article: article.id,
          channel: candidate.channel,
          copy: candidate.copy,
          status: 'pending',
        },
      })

      created.push({ id: doc.id, articleId: article.id, channel: candidate.channel })
    }
  }

  return { scannedArticles: articles.length, createdCount: created.length, created }
}
