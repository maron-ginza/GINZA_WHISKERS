import type { Payload } from 'payload'

import { generateArticleDraft } from './generateArticleDraft'
import { findRelatedArticles } from './relatedArticles'

// Source(情報収集) -> AI下書きArticle(status: draft) への変換オーケストレーション。
// 生成された下書きは編集長レビュー（status: review以降）を経ないと公開されない。
export async function createDraftFromSource(payload: Payload, sourceId: string) {
  const source = await payload.findByID({ collection: 'sources', id: sourceId })

  const pillarIds = Array.isArray(source.pillars)
    ? source.pillars.map((p) => (typeof p === 'object' && p !== null ? p.id : p))
    : []
  // AIプロンプトには収蔵室のID（例："3"）ではなく名前（例："歴史"）を渡す必要が
  // あるため、pillarIds（Articleのpillarsリレーション用、id配列）とは別に
  // 名前の配列を作る（2026-08-12、next buildの型検査で発覚した既存バグの修正。
  // 従来はIDをそのままプロンプトへ渡していた）。
  const pillarNames = Array.isArray(source.pillars)
    ? source.pillars.map((p) => (typeof p === 'object' && p !== null ? p.name : String(p)))
    : []

  // 回遊導線（2026-08-26追加）：同じ収蔵室を持つ公開済み記事をDBから機械的に
  // 拾い、AIには関連記事を作文させない（relatedArticles.ts参照）。
  const related = await findRelatedArticles(payload, pillarIds)

  const draft = await generateArticleDraft({
    sourceText: source.contentRef,
    pillars: pillarNames,
    relatedArticles: related.map((r) => ({ title: r.title })),
  })

  const article = await payload.create({
    collection: 'articles',
    locale: 'ja',
    data: {
      reviewStatus: 'draft',
      title: draft.title,
      // TODO: 記号除去・ローマ字化を含むスラッグ整形は編集長レビュー前に行う
      slug: draft.title,
      body: draft.body,
      pillars: pillarIds,
      seo: {
        metaTitle: draft.seo.metaTitle,
        metaDescription: draft.seo.metaDescription,
      },
      socialCopy: {
        note: draft.socialCopy.note,
        x: draft.socialCopy.x,
        instagram: draft.socialCopy.instagram,
      },
      callToAction: draft.callToAction,
      relatedArticles: related.map((r) => r.id),
      sourceRefs: [Number(sourceId)],
      aiGeneratedBy: 'claude-sonnet-5',
    },
  })

  await payload.update({
    collection: 'sources',
    id: sourceId,
    data: { status: 'used' },
  })

  return article
}
