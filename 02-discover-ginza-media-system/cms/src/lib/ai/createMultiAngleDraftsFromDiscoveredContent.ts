import type { Payload } from 'payload'

import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import {
  generateMultiAngleArticleDrafts,
  type MultiAngleKey,
  type ArticleVolume,
} from './generateMultiAngleArticleDrafts'
import { findRelatedArticles } from './relatedArticles'

// Project 02-1「核情報→最大5記事」拡張（2026-08-27）。
//
// 1件のDiscoveredContent（Maron Editor's Choiceでcurationstatus:approved
// 済み＝核となる旬の銀座情報）-> 最大5件のArticle(reviewStatus: draft)への
// 変換オーケストレーション。
//
// 既存のcreateDraftFromSource.ts（Source単体）・
// createWeeklyDraftFromDiscoveredContent.ts（複数DiscoveredContent→1記事）
// とは独立した第3の並行エントリーポイントとして追加した——既存2系統・
// Sources/DiscoveredContent/Articlesのスキーマ・フックは一切変更していない。
//
// 生成された下書きはすべてreviewStatus: draftで作成され、編集長レビュー
// （review以降）を経ないと公開されない（既存フローと同じ人間承認ゲート、
// Articles.tsのbeforeChangeフックは無変更のためそのまま機能する）。
const MULTI_ANGLE_AI_GENERATED_BY_PREFIX = 'claude-sonnet-5 (multi-angle'

export interface CreatedMultiAngleArticle {
  id: number
  title: string
  angle: MultiAngleKey
  volume: ArticleVolume
}

export interface CreateMultiAngleDraftsResult {
  discoveredContentId: string | number
  createdArticles: CreatedMultiAngleArticle[]
  skipped: { angle: MultiAngleKey; reason: string }[]
}

export async function createMultiAngleDraftsFromDiscoveredContent(
  payload: Payload,
  discoveredContentId: string | number,
): Promise<CreateMultiAngleDraftsResult> {
  const doc = await payload.findByID({
    collection: 'discovered-content',
    id: discoveredContentId,
    depth: 1,
  })

  // 要件（マロン指示）：核情報はMaron Editor's Choiceで承認済みのものに限定する
  // （createWeeklyDraftFromDiscoveredContent.tsのcurationStatusガードと同じ考え方）。
  if (doc.curationStatus !== 'approved') {
    throw new Error(
      `curationStatusが"approved"ではありません（現在: ${doc.curationStatus}）。` +
        "Maron Editor's Choiceで承認済みの候補のみを核情報として使用してください。",
    )
  }

  const sourceSite = doc.sourceSite
  const sourceName =
    typeof sourceSite === 'object' && sourceSite !== null ? sourceSite.name : String(sourceSite)

  const period =
    doc.eventStartAt && doc.eventEndAt
      ? `${doc.eventStartAt}〜${doc.eventEndAt}`
      : (doc.eventStartAt ?? undefined)

  // pillar解決：createWeeklyDraftFromDiscoveredContent.tsと同じcontentType対応表を再利用する
  const pillarName = CONTENT_TYPE_TO_PILLAR_NAME[doc.contentType] ?? '文化'
  const { docs: pillarDocs } = await payload.find({
    collection: 'tags',
    where: {
      and: [{ type: { equals: 'pillar' } }, { name: { equals: pillarName } }],
    },
    limit: 1,
  })
  const pillarDoc = pillarDocs[0]
  if (!pillarDoc) {
    throw new Error(
      `収蔵室（pillar）"${pillarName}"に対応する既存Tagが見つかりません。既存のpillar Tagを作成してください。`,
    )
  }
  const pillarIds = [Number(pillarDoc.id)]

  // 回遊導線（2026-08-26追加の既存関数を再利用）：同じ収蔵室を持つ公開済み記事をDBから機械的に拾う
  const related = await findRelatedArticles(payload, pillarIds)

  const { included, skipped } = await generateMultiAngleArticleDrafts({
    sourceText: [doc.title, doc.excerpt].filter(Boolean).join('\n'),
    sourceName,
    sourceUrl: doc.articleUrl,
    venue: doc.venue ?? undefined,
    period: period ?? undefined,
    // Human Editor Review P0-1の原則（週次フローと同じ）：システムが実際に
    // 確認した日時のみを使う。AIには生成させない。
    verifiedAt: doc.lastCheckedAt ?? doc.detectedAt ?? undefined,
    pillars: [pillarDoc.name],
    relatedArticles: related.map((r) => ({ title: r.title })),
    discoveredContentId,
  })

  if (included.length === 0) {
    throw new Error(
      '全5角度が品質基準を満たさず記事候補を生成できませんでした（詳細: ' +
        skipped.map((s) => `${s.angle}=${s.reason}`).join(' / ') +
        '）',
    )
  }

  const createdArticles: CreatedMultiAngleArticle[] = []
  for (const { angle, volume, draft } of included) {
    const article = await payload.create({
      collection: 'articles',
      locale: 'ja',
      data: {
        reviewStatus: 'draft',
        title: draft.title,
        // TODO: 記号除去・ローマ字化を含むスラッグ整形は編集長レビュー前に行う
        // （createDraftFromSource.ts / createWeeklyDraftFromDiscoveredContent.ts
        // と同じ既知のTODO、今回未着手）
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
        editorialProvenance: (draft.editorialProvenance ?? []).map((entry) => ({
          discoveredContentSource: Number(entry.discoveredContentId),
          sourceName: entry.sourceName,
          sourceUrl: entry.sourceUrl,
          verifiedAt: entry.verifiedAt ?? null,
          fact: entry.fact,
          sourceType: entry.sourceType,
          factType: entry.factType,
          verificationStatus: entry.verificationStatus,
        })),
        // volumeは専用スキーマフィールドを新設せず、aiGeneratedByへ角度と共に
        // 記録する（トレーサビリティ確保のための最小差分、Articles.ts無変更）
        aiGeneratedBy: `${MULTI_ANGLE_AI_GENERATED_BY_PREFIX}:${angle}:${volume})`,
      },
    })

    createdArticles.push({
      id: Number(article.id),
      title: String(article.title),
      angle,
      volume,
    })
  }

  return { discoveredContentId, createdArticles, skipped }
}
