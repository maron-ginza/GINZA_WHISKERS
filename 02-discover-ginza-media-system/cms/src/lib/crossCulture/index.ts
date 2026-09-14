// GINZA WHISKERS / Project 02 — GINZA CROSS CULTURE MAP（2026-09-04）
//
// 「情報収集 → 裏どり → 旬判定 → GINZA WHISKERS 適合判定 → CROSS CULTURE FILTER
//  → 派生記事候補生成 → 有料化候補判定 → マロン承認」の CROSS CULTURE FILTER 部分。
//
// 使い方（呼び出し元は必ず try/catch なしで呼べる。内部で握りつぶす）:
//   import { getOrComputeCrossCulture } from '../crossCulture'
//   const cc = getOrComputeCrossCulture({ title, excerpt, venue, contentType, factKind, ... })
//   if (cc.mode === 'has_derivative') { ... cc.derivativeMarkets ... }

export {
  runCrossCultureFilter,
  type CrossCultureInput,
  type CrossCultureFilterResult,
  type MarketScore,
  type ArticlePotential,
  type MatchConfidence,
} from './crossCultureFilter'
export {
  getOrComputeCrossCulture,
  loadCrossCultureByKey,
  themeCacheKey,
  type CachedCrossCulture,
} from './crossCultureCache'
export {
  MARKET_AXES,
  CROSS_CULTURE_VERSION,
  activeMarkets,
  loadCrossCultureThresholds,
  type MarketDef,
  type AxisDef,
  type CrossCultureThresholds,
} from './marketAxes'
export {
  SOURCE_AFFINITY,
  lookupSourceAffinity,
  sourceAxisBonuses,
  type SourceAffinityEntry,
} from './sourceAffinity'
export {
  buildCrossCultureDerivativePlan,
  derivativePlanSummaryLine,
  type DerivativePlan,
  type DerivativeMarketPlan,
  type BuildDerivativePlanInput,
  type DerivativeConfirmedFact,
} from './derivativeCandidate'

import type { CrossCultureFilterResult } from './crossCultureFilter'

/** 監査カード・themes 出力・note-draft に載せる 1 行サマリ */
export function crossCultureSummaryLine(cc: CrossCultureFilterResult | null | undefined): string {
  if (!cc) return 'CROSS CULTURE: —'
  if (cc.skipped) return `CROSS CULTURE: スキップ（${cc.skipReason ?? 'unknown'}）→ 通常記事のみ`
  if (cc.mode === 'normal_only') return 'CROSS CULTURE: 派生候補なし（全市場 < 70）→ 通常記事のみ'
  const top = cc.markets
    .filter((m) => cc.derivativeMarkets.includes(m.market))
    .map((m) => `${m.market} ${m.score}〔${m.articlePotential}〕`)
    .join(' / ')
  return `CROSS CULTURE: 派生候補 ${top}`
}
