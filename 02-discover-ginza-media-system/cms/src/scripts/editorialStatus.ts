import { getPayload } from 'payload'

import config from '../payload.config'

// `./p2 editorial` から `payload run` 経由で呼び出す読み取り専用の集計スクリプト。
// Local APIをoverrideAccess:trueで使うため、Sourcesが匿名読み取り不可（2026-07-22決定）
// でも編集パイプラインの状況をCLIから確認できる。書き込みは一切行わない。

const EDITORIAL_ORDER = [
  'inbox',
  'review',
  'editors-choice',
  'approved',
  'published',
  'rejected',
] as const

const REVIEW_ORDER = ['draft', 'review', 'approved', 'published'] as const

async function main() {
  const payload = await getPayload({ config })

  const [sources, articles] = await Promise.all([
    payload.find({ collection: 'sources', limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'articles', limit: 1000, depth: 0, overrideAccess: true }),
  ])

  const sourceCounts = new Map<string, number>()
  for (const s of sources.docs) {
    const key = s.editorial?.editorialStatus ?? '(unknown)'
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1)
  }

  const articleCounts = new Map<string, number>()
  for (const a of articles.docs) {
    const key = a.reviewStatus ?? '(unknown)'
    articleCounts.set(key, (articleCounts.get(key) ?? 0) + 1)
  }

  const editorsChoicePending = sources.docs.filter(
    (s) => s.editorial?.editorialStatus === 'editors-choice',
  )

  const result = {
    sources: {
      total: sources.totalDocs,
      byStatus: Object.fromEntries(EDITORIAL_ORDER.map((k) => [k, sourceCounts.get(k) ?? 0])),
    },
    articles: {
      total: articles.totalDocs,
      byStatus: Object.fromEntries(REVIEW_ORDER.map((k) => [k, articleCounts.get(k) ?? 0])),
    },
    editorsChoicePending: editorsChoicePending.map((s) => ({
      id: s.id,
      contentRef: typeof s.contentRef === 'string' ? s.contentRef.slice(0, 60) : '',
    })),
  }

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
