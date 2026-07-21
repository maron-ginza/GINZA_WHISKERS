import type { Payload } from 'payload'

import { generateArticleDraft } from './generateArticleDraft'

// Source(情報収集) -> AI下書きArticle(status: draft) への変換オーケストレーション。
// 生成された下書きは編集長レビュー（status: review以降）を経ないと公開されない。
export async function createDraftFromSource(payload: Payload, sourceId: string) {
  const source = await payload.findByID({ collection: 'sources', id: sourceId })

  const pillarIds = Array.isArray(source.pillars)
    ? source.pillars.map((p) => (typeof p === 'string' ? p : p.id))
    : []

  const draft = await generateArticleDraft({
    sourceText: source.contentRef,
    pillars: pillarIds as string[],
  })

  const article = await payload.create({
    collection: 'articles',
    locale: 'ja',
    data: {
      status: 'draft',
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
      sourceRefs: [sourceId],
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
