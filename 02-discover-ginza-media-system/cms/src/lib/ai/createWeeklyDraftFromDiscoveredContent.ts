import type { Payload } from 'payload'

import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import { generateWeeklyArticleDraft, type WeeklyCandidateInput } from './generateArticleDraft'
import { findRelatedArticles } from './relatedArticles'
import { slugify } from './slugify'

// 週次「旬の銀座」記事のaiGeneratedBy識別子。generateArticleDraft.tsの
// AI呼び出し部分とcreateWeeklyDraftFromDiscoveredContent.ts（本ファイル）の
// 両方で同じ値を使う必要があるため定数化する。
const WEEKLY_AI_GENERATED_BY = 'claude-sonnet-5 (weekly-digest)'
const WEEKLY_SERIES_LABEL = '旬の銀座'

// 複数DiscoveredContent（Maron Editor's ChoiceでcurationStatus: approved済み）
// -> 週次「旬の銀座」Article(reviewStatus: draft) への変換オーケストレーション。
//
// 既存のcreateDraftFromSource.ts（Source単体 -> Article）とは独立した並行の
// エントリーポイントとして追加した。Sources/SourceLedger/既存の単一Source
// フローは変更していない。
//
// 生成された下書きは編集長レビュー（reviewStatus: review以降）を経ないと
// 公開されない（既存フローと同じ人間承認ゲート）。

// contentType -> 収蔵室（6本柱）の対応表（Human Editor Review P2-6）。
// 2026-08-27、Project 02-1「核情報→最大5記事」拡張でも同じ表が必要になった
// ため、`../curation/contentTypeToPillar.ts`へ共有モジュールとして抽出した
// （重複実装を避ける、CLAUDE.md「既存コードを壊さない」原則に基づく最小差分の
// リファクタリング）。対応関係・ロジックは一切変更していない。

export async function createWeeklyDraftFromDiscoveredContent(
  payload: Payload,
  discoveredContentIds: (string | number)[],
  explicitPillarIds: (string | number)[] = [],
) {
  if (discoveredContentIds.length === 0) {
    throw new Error('discoveredContentIdsが空です')
  }

  const discoveredContentDocs = await Promise.all(
    discoveredContentIds.map((id) =>
      payload.findByID({ collection: 'discovered-content', id, depth: 1 }),
    ),
  )

  // 要件4：Editor's Choiceとして選定された（curationStatus: approved）情報
  // だけを記事生成対象にする。ここでハードに弾かないと、未承認（inbox）や
  // 却下済み（rejected）の候補が記事化されてしまう。
  const notApproved = discoveredContentDocs.filter((doc) => doc.curationStatus !== 'approved')
  if (notApproved.length > 0) {
    throw new Error(
      `curationStatusがapproved以外のDiscoveredContentが含まれています（id: ` +
        `${notApproved.map((doc) => doc.id).join(', ')}）。Maron Editor's Choiceで` +
        '承認済みの候補のみを渡してください。',
    )
  }

  // 要件3：各候補のsource provenance（掲載サイト名・記事自体のURL）を、
  // 候補ごとに個別のcandidateとして保持したままAIへ渡す（結合・要約しない）。
  const candidates: WeeklyCandidateInput[] = discoveredContentDocs.map((doc) => {
    const sourceSite = doc.sourceSite
    const sourceName =
      typeof sourceSite === 'object' && sourceSite !== null
        ? sourceSite.name
        : String(sourceSite)

    const period =
      doc.eventStartAt && doc.eventEndAt
        ? `${doc.eventStartAt}〜${doc.eventEndAt}`
        : (doc.eventStartAt ?? undefined)

    return {
      discoveredContentId: doc.id,
      sourceText: [doc.title, doc.excerpt].filter(Boolean).join('\n'),
      sourceName,
      sourceUrl: doc.articleUrl,
      venue: doc.venue ?? undefined,
      period: period ?? undefined,
      // Human Editor Review P0-1：システムが実際に確認した日時のみを使う
      // （AIには生成させない）。lastCheckedAtは「このURLを最後に確認した
      // 日時」、detectedAtは「初回検知〜直近巡回時の確認日時」——いずれも
      // 実際のクロール記録であり、AIの推測ではない。
      verifiedAt: doc.lastCheckedAt ?? doc.detectedAt ?? undefined,
    }
  })

  // 要件P2-6：contentTypeに応じてpillarを自動推定し、呼び出し側が明示指定
  // したpillarIdsと合算する（既存の6本柱タクソノミーの範囲内、重複除去）。
  const inferredPillarNames = Array.from(
    new Set(
      discoveredContentDocs.map((doc) => CONTENT_TYPE_TO_PILLAR_NAME[doc.contentType] ?? '文化'),
    ),
  )
  const inferredPillarDocs =
    inferredPillarNames.length > 0
      ? (
          await payload.find({
            collection: 'tags',
            where: {
              and: [{ type: { equals: 'pillar' } }, { name: { in: inferredPillarNames } }],
            },
            limit: inferredPillarNames.length,
          })
        ).docs
      : []

  const pillarIdSet = new Set<number>([
    ...explicitPillarIds.map((id) => Number(id)),
    ...inferredPillarDocs.map((tag) => Number(tag.id)),
  ])
  const pillarIds = Array.from(pillarIdSet)

  if (pillarIds.length === 0) {
    throw new Error(
      'pillars（収蔵室）を1件も解決できませんでした。既存Tagに対応する' +
        `pillar（推定候補: ${inferredPillarNames.join('・')}）が存在しないか、` +
        'explicitPillarIdsも空です。既存のpillar Tagを作成するか、pillarIdsを明示指定してください。',
    )
  }

  const pillarDocs = await Promise.all(
    pillarIds.map((id) => payload.findByID({ collection: 'tags', id })),
  )
  const pillarNames = pillarDocs.map((tag) => tag.name)

  // シリーズ連番（2026-08-26追加）：既存の週次記事数から機械的に算出する
  // （TNS #32〜#34と同じ「実際に生成した順に振る」考え方、AIには生成させない）。
  const { totalDocs: priorWeeklyArticleCount } = await payload.count({
    collection: 'articles',
    where: { aiGeneratedBy: { equals: WEEKLY_AI_GENERATED_BY } },
  })
  const seriesEditionNumber = priorWeeklyArticleCount + 1

  // 回遊導線（2026-08-26追加）：同じ収蔵室を持つ公開済み記事をDBから機械的に
  // 拾い、AIには関連記事を作文させない（relatedArticles.ts参照）。
  const related = await findRelatedArticles(payload, pillarIds)

  const draft = await generateWeeklyArticleDraft({
    candidates,
    pillars: pillarNames,
    relatedArticles: related.map((r) => ({ title: r.title })),
    seriesEditionNumber,
  })

  const article = await payload.create({
    collection: 'articles',
    locale: 'ja',
    data: {
      reviewStatus: 'draft',
      title: draft.title,
      // 再発防止 #3（2026-09-01 Trial）：文字参照デコード・施設ボイラープレート除去・
      // 角括弧タグ除去・URL 危険文字除去。ローマ字化は将来課題（§20）。
      slug: slugify(draft.title) || draft.title,
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
      series: {
        label: WEEKLY_SERIES_LABEL,
        editionNumber: seriesEditionNumber,
      },
      // Human Editor Review P0-2：fact単位のSource Provenanceを一時データ
      // で終わらせず、Article側にも保存し後から追跡できるようにする。
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
      aiGeneratedBy: WEEKLY_AI_GENERATED_BY,
    },
  })

  return article
}
