import type { Payload } from 'payload'

// 記事生成時の回遊導線候補（2026-08-26、note編集部ノウハウ「次の閲覧につながる
// 回遊導線」対応）。同じ収蔵室（pillar）を持つ公開済み記事を機械的に拾うだけの
// 決定的ロジックで、AI呼び出しは行わない——存在しない関連性をAIに作文させない
// ため（Editorial Trust Layerの「推測で補完しない」方針と同じ考え方）。
// あくまで自動候補であり、Articles.relatedArticlesは人間が公開前に調整する。
export interface RelatedArticleRef {
  id: number
  title: string
}

export async function findRelatedArticles(
  payload: Payload,
  pillarIds: (string | number)[],
  limit = 3,
): Promise<RelatedArticleRef[]> {
  if (pillarIds.length === 0) return []

  const { docs } = await payload.find({
    collection: 'articles',
    locale: 'ja',
    depth: 0,
    limit,
    sort: '-createdAt',
    where: {
      and: [
        { reviewStatus: { equals: 'published' } },
        { pillars: { in: pillarIds } },
      ],
    },
  })

  return docs.map((doc) => ({ id: Number(doc.id), title: String(doc.title) }))
}
