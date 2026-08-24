import type { Payload } from 'payload'

import type { Tag } from '../../payload-types'
import { applyContentRichnessPenalty, assessContentRichness } from './contentRichness'
import type { ScoreSourceInput } from './scoreSource'
import { scoreSource } from './scoreSource'
import {
  computeEditorialScoreTotal,
  sanitizeAudienceTags,
  type CurationResult,
  type ScoringMethod,
} from './types'

// 「旬の銀座」編集判断レイヤー：1件のSourceにEditorial Score・Audience Tagsを
// 付与するオーケストレーション（2026-08-17）。
//
// evaluateSourceById.tsとは独立した書き込み対象——editorialStatus（編集パイプライン
// の状態機械）には一切触れない。このレイヤーはあくまで「順位付けのための追加
// メタデータ」であり、承認・却下のような不可逆な意思決定は行わない
// （マロン指示：AIはEditorial Desk＝下読み・順位付け、最終採用は人間）。
//
// 冪等性：デフォルトでは既に採点済み（editorialScore.scoredAt が存在）のSourceは
// 再採点しない（コスト制御、CLAUDE.md第13章）。`force:true`で再採点を許可する
// ——有効なANTHROPIC_API_KEYが用意でき次第、heuristic-placeholderで採点済みの
// Sourceだけをforce再採点する運用を想定。

export class SourceAlreadyScoredError extends Error {}

interface ScoreSourceByIdOptions {
  /** テスト・ヒューリスティックモードでの差し替え用（既定は実際のAnthropic API呼び出し） */
  score?: (input: ScoreSourceInput) => Promise<CurationResult> | CurationResult
  scoringMethod?: ScoringMethod
  force?: boolean
}

export async function scoreSourceById(
  payload: Payload,
  sourceId: number | string,
  options: ScoreSourceByIdOptions = {},
) {
  const score = options.score ?? scoreSource
  const scoringMethod: ScoringMethod = options.scoringMethod ?? 'claude'
  const force = options.force ?? false

  const source = await payload.findByID({
    collection: 'sources',
    id: sourceId,
    depth: 1,
    overrideAccess: true,
  })

  const alreadyScored = Boolean(source.editorialScore?.scoredAt)
  if (alreadyScored && !force) {
    throw new SourceAlreadyScoredError(
      `このソースは既に採点済みです（scoringMethod: ${source.editorialScore?.scoringMethod}）。` +
        `再採点する場合はforce:trueを指定してください。`,
    )
  }

  const pillarNames = Array.isArray(source.pillars)
    ? source.pillars
        .filter((p): p is Tag => typeof p === 'object' && p !== null)
        .map((p) => p.name)
        .filter((name): name is string => Boolean(name))
    : []

  const result = await score({
    contentRef: source.contentRef,
    sourceType: source.type,
    pillarNames,
  })

  const rawTotal = computeEditorialScoreTotal(result)
  const richness = assessContentRichness(source.contentRef)
  const total = applyContentRichnessPenalty(rawTotal, richness.penaltyFactor)
  const audienceTags = sanitizeAudienceTags(result)

  const updated = await payload.update({
    collection: 'sources',
    id: sourceId,
    overrideAccess: true,
    data: {
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

  return { source: updated, total, rawTotal, contentRichness: richness }
}
