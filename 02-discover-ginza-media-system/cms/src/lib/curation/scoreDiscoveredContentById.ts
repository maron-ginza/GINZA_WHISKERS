import type { Payload } from 'payload'

import { applyContentRichnessPenalty, assessContentRichness } from './contentRichness'
import type { ScoreSourceInput } from './scoreSource'
import { scoreSource } from './scoreSource'
import {
  computeEditorialScoreTotal,
  sanitizeAudienceTags,
  type CurationResult,
  type ScoringMethod,
} from './types'
import { classifyUxType } from './uxType'

// 「旬の銀座」編集判断レイヤーを個別記事・イベント（DiscoveredContent）単位に
// 接続する（2026-08-17）。scoreSourceById.ts（Sources向け）と全く同じ構造——
// スコアリングの中身（scoreSource.ts／heuristicScore.ts）は完全に共用し、
// 書き込み先の型・コレクションだけを差し替えている（AIロジックの重複実装はしない）。
//
// curationStatus（承認・却下の状態）には一切触れない——ここで書き込むのは
// editorialScore/audienceTagsのみ。最終採用（Maron Editor's Choice）は
// DiscoveredContent.curationStatusの人間ゲート（collections/DiscoveredContent.ts）で
// 別途行う。

export class DiscoveredContentAlreadyScoredError extends Error {}

interface ScoreDiscoveredContentByIdOptions {
  score?: (input: ScoreSourceInput) => Promise<CurationResult> | CurationResult
  scoringMethod?: ScoringMethod
  force?: boolean
}

export async function scoreDiscoveredContentById(
  payload: Payload,
  id: number | string,
  options: ScoreDiscoveredContentByIdOptions = {},
) {
  const score = options.score ?? scoreSource
  const scoringMethod: ScoringMethod = options.scoringMethod ?? 'claude'
  const force = options.force ?? false

  const doc = await payload.findByID({
    collection: 'discovered-content',
    id,
    depth: 0,
    overrideAccess: true,
  })

  const alreadyScored = Boolean(doc.editorialScore?.scoredAt)
  if (alreadyScored && !force) {
    throw new DiscoveredContentAlreadyScoredError(
      `この候補は既に採点済みです（scoringMethod: ${doc.editorialScore?.scoringMethod}）。` +
        `再採点する場合はforce:trueを指定してください。`,
    )
  }

  // Sourcesのcontentref（記事本文の代替テキスト）に相当する入力として、
  // title＋excerptを組み合わせる（Sources.generateSourceCandidates.tsの
  // buildContentRefと同じ考え方——AIには実際に読める文章を渡す）。
  const title = typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : '(タイトル取得なし)'
  const excerpt = typeof doc.excerpt === 'string' ? doc.excerpt.trim() : ''
  const contentRef = [title, excerpt, `(出典: ${doc.articleUrl})`].filter(Boolean).join('\n\n')

  const result = await score({
    contentRef,
    sourceType: 'url',
    pillarNames: [],
  })

  const rawTotal = computeEditorialScoreTotal(result)
  const richness = assessContentRichness(contentRef)
  const total = applyContentRichnessPenalty(rawTotal, richness.penaltyFactor)
  const audienceTags = sanitizeAudienceTags(result)
  // contentRichnessTierが確定したこの時点で、UXタイプも合わせて再判定する
  // （excerptがナビ文言主体〈boilerplate/thin〉のページをexcerptキーワード
  // マッチから除外できる、実データで検証済みの精度改善。2026-08-18）。
  const uxType = classifyUxType(doc.title, doc.excerpt, doc.contentType, richness.tier)

  const updated = await payload.update({
    collection: 'discovered-content',
    id,
    overrideAccess: true,
    data: {
      uxType,
      editorialScore: {
        now: result.now,
        nowReason: result.nowReason,
        ginza: result.ginza,
        ginzaReason: result.ginzaReason,
        ux: result.ux,
        uxReason: result.uxReason,
        story: result.story,
        storyReason: result.storyReason,
        discovery: result.discovery,
        discoveryReason: result.discoveryReason,
        rawTotal,
        total,
        contentRichnessTier: richness.tier,
        contentRichnessPenaltyFactor: richness.penaltyFactor,
        scoringMethod,
        scoredAt: new Date().toISOString(),
      },
      audienceTags,
    },
  })

  return { doc: updated, total, rawTotal, contentRichness: richness }
}
