// GINZA WHISKERS / Project 02（2026-09-04、候補選定の自動化）
//
// マロン承認済みルール（2026-09-04）で、morning の A/B 候補から
//   ・安全性は **加点ではなく必須 gate**（不成立なら選定対象にしない）
//   ・gate 通過した「green 候補」だけを、5つの分散比率で順位付けして
//     **推奨10件＋予備5件**（合計15件固定）を決定的に選ぶ
//   ・同一施設は原則1件。2件目は「安全な代替候補がない／記事種別が異なる／
//     開催期間または利用場面が異なる」の3条件をすべて満たすときのみ許可し、
//     理由を自動生成する
//   ・green が10件未満なら無理に10件にしない
//   ・蔦屋書店など特定施設への偏りを検出する（判定はしない・数えて報告）
//
// 純粋・決定的・AI 呼び出しなし・DB 非依存（呼び出し元が ThemeCandidate[] を渡す）。

import { deriveTemporalRelevance, type TemporalRelevanceTier } from '../curation/temporalRelevance'
import { resolveFacilityKey } from '../curation/facilityKey'
import type { CrossCultureFilterResult } from '../crossCulture/crossCultureFilter'
import {
  deriveProvisionalCategory,
  isCategoryResolved,
  type ProvisionalCategoryBasis,
} from './provisionalCategory'

// ---------------------------------------------------------------------------
// 入力
// ---------------------------------------------------------------------------
export interface ThemeCandidate {
  discoveredContentId: number
  title: string
  displayTitle?: string
  sourceName: string
  sourceUrl: string
  /** 情報の確認日時（DiscoveredContent.lastCheckedAt を ISO のまま） */
  verifiedAt?: string | null
  verdict: 'A' | 'B' | 'C'
  expired: boolean
  ginzaRelevant: boolean
  hasTraceableSource: boolean
  /** 既投稿との重複が確定しているか */
  duplicate: boolean
  factKind?: 'event' | 'product_news' | 'unknown' | null
  /** 記事テンプレート種別（known なら exhibition/sale/...、未確定なら 'unknown' / null） */
  templateType?: string | null
  templateTypeConfidence?: 'high' | 'medium' | 'low' | null
  templateEligible?: boolean
  factsSource?: 'none' | 'draft' | 'withdrawn' | 'ready' | null
  /** B の場合の「A 化までの追加時間（分）」。小さいほど green まで速い */
  bAdditionalMinutes?: number | null
  /** テンプレート事前検査の3段階判定 */
  precheckDecision?: '投稿可能' | '確認後可能' | '生成不可' | null
  /** ready 化・記事化に不足している項目（承諾後にマロンが埋める。readiness の不足に展開） */
  missingForTemplate?: string[] | null
  /** 記事種別・記事タイプ分類の決定的根拠（URL 構造／タイトル明記／本文明記。監査記録用） */
  classificationBasis?: string[] | null
  // --- DiscoveredContent / ArticleFacts 由来（呼び出し元が read-only で詰める） ---
  /** 公式ページ本文の抜粋（先頭 400 字。暫定カテゴリーの明記語探索に使う） */
  excerpt?: string | null
  /** 18カテゴリー（ArticleFacts.primaryCategory）。未確定なら null */
  primaryCategory?: string | null
  uxType?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  venue?: string | null
  contentType?: string | null
  /** 表示用の開催期間文字列 */
  eventPeriod?: string
  /**
   * 2026-09-06追加：開催・販売期間（eventStartAt/eventEndAt）の抽出信頼度。
   * DiscoveredContent.dateExtraction（body_label等）由来の 'medium'/'low' は、
   * 集約ページで別記事の会期を誤って拾っている可能性を否定できないため、
   * 根本改善（title近接チェック）後も「要確認」として推奨から分離する
   * （unknownTemporalMaxInRec と同じ0件既定の仕組みを使う）。
   * json_ld/meta等の構造化データ由来、またはタイトル/URLからの明記抽出は 'high'。
   * 日付が無い（temporalUnknown）場合は null（対象外）。
   */
  eventDateConfidence?: 'high' | 'medium' | 'low' | null
  // --- 2026-09-04 追加：偏り補正＋コアターゲット適合（すべて任意。未設定なら従来どおり） ---
  /** DiscoveredContent.editorial_score_total（0-100）。ランキングの一要素に加える */
  editorialScoreTotal?: number | null
  /** コアターゲット（20代後半〜30代女性）適合度 0-100（targetFitScore.ts） */
  targetFit?: number | null
  /** Editorial Compass 各面の内訳（表示・監査用） */
  targetFitCompass?: { kawaii: number; joshitsu: number; totonoeru: number; hakken: number; senobi: number }
  /** targetFit の反応語（監査用） */
  targetFitSignals?: string[]
  /** targetFit の理由（コアターゲット適合理由。候補選定画面の表示用。targetFitScore.ts の reason） */
  targetFitReason?: string | null
  /** 直近の採用でこのカテゴリーが過多なら 0〜0.2 の減点 */
  categoryHistoryPenalty?: number
  /** 直近の採用でこの施設が過多なら 0〜0.2 の減点 */
  venueHistoryPenalty?: number
  /** ソース種別（source_balance 用。百貨店／飲食・菓子／美容・ウェルネス／…） */
  sourceTypeKey?: string | null
  // --- 2026-09-11 追加：収集カバレッジ（candidateCoverageScore.ts。すべて任意・未設定なら従来どおり）---
  /** 公式情報の完全度 0-1（公式URL・開催期間・場所・内容の確認割合） */
  officialCompletenessScore?: number | null
  /** 公式情報で未確認の項目（表示用） */
  officialMissing?: string[] | null
  /** URL・期間・場所・内容がすべて揃っているか。false は最終候補（推奨・予備）に上げない */
  finalEligible?: boolean
  /** 開催終了までの日数（null＝期日なし） */
  daysUntilEnd?: number | null
  daysUntilEndTier?: 'expired' | 'ending_soon' | 'this_week' | 'comfortable' | 'far' | 'no_end' | null
  /** カバレッジ補正（biasAdjust に合流。正＝不足カテゴリー／終了間近／女性適合、負＝大手施設集中）*/
  coverageAdjust?: number
  /** カバレッジ補正の一言（候補一覧の表示用）*/
  coverageReason?: string | null
  /**
   * CROSS CULTURE FILTER の結果（GINZA WHISKERS 適合判定の後段。読み取り専用で付与）。
   * 選定ロジックには一切影響しない —— 派生記事候補生成・有料化候補判定・マロン承認の
   * 参考としてのみ carry する。未評価／スキップ時は undefined。
   */
  crossCulture?: CrossCultureFilterResult
}

// ---------------------------------------------------------------------------
// 設定（9月Trial の週次結果から調整可能。env / CLI で上書き）
// ---------------------------------------------------------------------------
export interface SelectThemesConfig {
  candidateCount: number // 15 固定
  recommendCount: number // 10
  spareCount: number // 5
  /** ランキング比率（既存5軸の合計 1.0。以下は enableTargetFitRanking のとき加算される追加軸） */
  weights: {
    freshness: number // 旬・鮮度 0.30
    categorySpread: number // 18カテゴリー分散 0.25
    sourceFacilitySpread: number // 情報源・施設分散 0.20
    venueAreaSpread: number // 会場・エリア分散 0.15
    templateTypeSpread: number // 記事種別分散 0.10
    // --- 2026-09-04 追加（enableTargetFitRanking のときのみ効く。既存テスト・fixture は非設定なので影響なし） ---
    targetFit: number // コアターゲット適合（±この値。既定 0.30）
    sourceBalance: number // ソース種別分散（既定 0.10）
    editorial: number // 既存 editorial_score（0-1 正規化 ×この値。既定 0.15）
  }
  /** B 候補を「green まで速い」とみなす追加時間の上限（分） */
  maxBAdditionalMinutes: number
  /** 偏り検出：1施設が推奨内で占めてよい最大件数（超えたら flag。後方互換の表示用） */
  facilityBiasMax: number
  /** 偏り検出：1情報源が推奨内で占めてよい最大比率（後方互換の表示用） */
  sourceBiasMaxRatio: number
  // --- 偏り制御の「必須ハードキャップ」（2026-09-04、マロン指示） ---
  /** 推奨10件中、同一施設の最大件数（原則1件・例外で2件） */
  recFacilityMax: number
  /** 推奨10件中、同一情報源の最大件数（＝20%） */
  recSourceMax: number
  /** 予備5件中、同一施設の最大件数（単一施設に偏らせない） */
  spareFacilityMax: number
  /** 推奨＋予備15件全体で、同一施設の最大件数 */
  allFacilityMax: number
  /** 推奨＋予備15件全体で、同一情報源の最大件数 */
  allSourceMax: number
  /** finalized にするために「明記からカテゴリー確定」が必要な推奨内の割合 */
  minCategoryResolvedRatio: number
  /** 推奨10件中、会場不明の最大件数 */
  unknownVenueMaxInRec: number
  /** 推奨10件中、時期不明（開催日なし）の最大件数 */
  unknownTemporalMaxInRec: number
  /** 推奨10件中、開催・販売期間の抽出信頼度が high でない（要確認）候補の最大件数（2026-09-06追加） */
  lowConfidenceTemporalMaxInRec: number
  /** 推奨10件中、同一カテゴリーの最大件数（ART/SHOPPING 等） */
  categoryMaxInRec: number
  /** finalized にするために推奨10件が満たすべき最小カテゴリー種類数 */
  minCategoriesInRec: number
  /**
   * 2026-09-11：実データ経路（enableTargetFitRanking）で、公式URL・開催期間・場所・内容の
   * いずれかが確認できない候補（finalEligible=false）を推奨・予備どちらにも出さない。
   * 既定 true。THEMES_REQUIRE_OFFICIAL_COMPLETE=0 で緩められる。
   */
  requireOfficialCompleteFinal: boolean
}

export const DEFAULT_SELECT_THEMES_CONFIG: SelectThemesConfig = {
  candidateCount: 15,
  recommendCount: 10,
  spareCount: 5,
  weights: {
    freshness: 0.3,
    categorySpread: 0.25,
    sourceFacilitySpread: 0.2,
    venueAreaSpread: 0.15,
    templateTypeSpread: 0.1,
    targetFit: 0.35,
    sourceBalance: 0.12,
    editorial: 0.15,
  },
  maxBAdditionalMinutes: 45,
  facilityBiasMax: 2,
  sourceBiasMaxRatio: 0.5,
  recFacilityMax: 2,
  recSourceMax: 2,
  spareFacilityMax: 2,
  allFacilityMax: 3,
  allSourceMax: 3,
  minCategoryResolvedRatio: 0.5,
  unknownVenueMaxInRec: 1,
  // 2026-09-06：開催・販売期間が一切確認できない候補は推奨から完全に外す（根本改善・0件許容）。
  // 必要な場合のみ THEMES_UNKNOWN_TEMPORAL_MAX で緩められるよう env 上書きは維持する。
  unknownTemporalMaxInRec: 0,
  // 2026-09-06：開催・販売期間はあるが抽出信頼度が high でない（body_label等）候補も、
  // 「要確認」として推奨から外す（0件既定）。THEMES_LOW_CONFIDENCE_TEMPORAL_MAX で緩和可。
  lowConfidenceTemporalMaxInRec: 0,
  categoryMaxInRec: 3,
  minCategoriesInRec: 6,
  requireOfficialCompleteFinal: true,
}

export function loadSelectThemesConfigFromEnv(
  base: SelectThemesConfig = DEFAULT_SELECT_THEMES_CONFIG,
): SelectThemesConfig {
  const num = (k: string, d: number) => {
    const v = Number(process.env[k])
    return Number.isFinite(v) && v >= 0 ? v : d
  }
  const bool = (k: string, d: boolean) => {
    const v = process.env[k]
    if (v == null || v === '') return d
    return !/^(0|false|no|off)$/i.test(v.trim())
  }
  return {
    ...base,
    weights: {
      freshness: num('THEMES_W_FRESHNESS', base.weights.freshness),
      categorySpread: num('THEMES_W_CATEGORY', base.weights.categorySpread),
      sourceFacilitySpread: num('THEMES_W_SOURCE_FACILITY', base.weights.sourceFacilitySpread),
      venueAreaSpread: num('THEMES_W_VENUE_AREA', base.weights.venueAreaSpread),
      templateTypeSpread: num('THEMES_W_TEMPLATE_TYPE', base.weights.templateTypeSpread),
      targetFit: num('THEMES_W_TARGET_FIT', base.weights.targetFit),
      sourceBalance: num('THEMES_W_SOURCE_BALANCE', base.weights.sourceBalance),
      editorial: num('THEMES_W_EDITORIAL', base.weights.editorial),
    },
    maxBAdditionalMinutes: num('THEMES_MAX_B_MIN', base.maxBAdditionalMinutes),
    facilityBiasMax: num('THEMES_FACILITY_BIAS_MAX', base.facilityBiasMax),
    sourceBiasMaxRatio: num('THEMES_SOURCE_BIAS_MAX_RATIO', base.sourceBiasMaxRatio),
    recFacilityMax: num('THEMES_REC_FACILITY_MAX', base.recFacilityMax),
    recSourceMax: num('THEMES_REC_SOURCE_MAX', base.recSourceMax),
    spareFacilityMax: num('THEMES_SPARE_FACILITY_MAX', base.spareFacilityMax),
    allFacilityMax: num('THEMES_ALL_FACILITY_MAX', base.allFacilityMax),
    allSourceMax: num('THEMES_ALL_SOURCE_MAX', base.allSourceMax),
    minCategoryResolvedRatio: num('THEMES_MIN_CATEGORY_RESOLVED_RATIO', base.minCategoryResolvedRatio),
    unknownVenueMaxInRec: num('THEMES_UNKNOWN_VENUE_MAX', base.unknownVenueMaxInRec),
    unknownTemporalMaxInRec: num('THEMES_UNKNOWN_TEMPORAL_MAX', base.unknownTemporalMaxInRec),
    lowConfidenceTemporalMaxInRec: num('THEMES_LOW_CONFIDENCE_TEMPORAL_MAX', base.lowConfidenceTemporalMaxInRec),
    categoryMaxInRec: num('THEMES_CATEGORY_MAX', base.categoryMaxInRec),
    minCategoriesInRec: num('THEMES_MIN_CATEGORIES', base.minCategoriesInRec),
    requireOfficialCompleteFinal: bool('THEMES_REQUIRE_OFFICIAL_COMPLETE', base.requireOfficialCompleteFinal),
  }
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
export type SafetyGateFailCode =
  | 'verdict_c'
  | 'expired'
  | 'duplicate'
  | 'not_ginza'
  | 'no_source'
  | 'unknown_type'
  | 'unknown_factkind'
  | 'no_title'
  | 'official_incomplete'

/**
 * 生成準備の状態（安全性 gate とは別。gate は「安全な候補か」、readiness は
 * 「承諾後にどれだけ手を入れれば記事化できるか」）。
 *   ready        … ArticleFacts が ready ＋ 18カテゴリー確定 → そのまま記事化可
 *   needs-category … ArticleFacts ready だが primaryCategory 未確定
 *   needs-facts   … ArticleFacts が draft/none → 承諾後に事実確認・入力・ready 化が必要
 */
export type ReadinessState = 'ready' | 'needs-category' | 'needs-facts'

export interface EvaluatedCandidate {
  candidate: ThemeCandidate
  /** 安全性 gate を通過したか（必須・加点ではない） */
  safe: boolean
  gateFails: SafetyGateFailCode[]
  /** 生成準備の状態 */
  readiness: ReadinessState
  /** 記事化までに承諾後で必要になる項目（不足の具体） */
  missingForGeneration: string[]
  /** @deprecated readiness を使う。後方互換のため残す */
  readyState: 'ready' | 'needs-ready'
  // --- 順位付けの内訳（gate 通過分のみ算出。0〜1） ---
  scores: {
    freshness: number
    categorySpread: number
    sourceFacilitySpread: number
    venueAreaSpread: number
    templateTypeSpread: number
    /** 2026-09-04 追加：コアターゲット適合の寄与（enableTargetFitRanking のとき非0） */
    targetFit: number
    /** 2026-09-04 追加：source_balance の寄与 */
    sourceBalance: number
    /** 2026-09-04 追加：editorial_score の寄与 */
    editorial: number
    /** 2026-09-04 追加：直近採用ペナルティ＋上位5施設分散＋ART/CULTURE 抑制の合計（負） */
    biasAdjust: number
    total: number
  }
  temporalTier: TemporalRelevanceTier
  /** 開催日・会期が一切分からない（時期不明） */
  temporalUnknown: boolean
  /** 開催日・会期はあるが抽出信頼度が high でない（body_label等・要確認。2026-09-06追加） */
  temporalLowConfidence: boolean
  /** 暫定カテゴリー（明記から確定できたら 18 のいずれか。無ければ '未確定'） */
  categoryKey: string
  /** 暫定カテゴリーの根拠（primaryCategory / title / templateType / null） */
  categoryBasis: ProvisionalCategoryBasis
  facilityKey: string | null
  /** 偏り制御・集計に使うバケット（施設キー、無ければ '(会場不明)'） */
  facilityBucket: string
  facilityLabel: string
  areaKey: string
  templateTypeKey: string
  sourceName: string
  /** 同一施設2件として採用した場合の理由（採用時のみ） */
  sameFacilityException?: string
}

export interface SelectThemesResult {
  now: string
  config: SelectThemesConfig
  /** 安全性 gate を通過した候補数（＝選定対象プール） */
  gatePassed: number
  /** 合計15件（推奨10＋予備5）。green 候補が不足すれば少なくなる（水増ししない） */
  candidates: EvaluatedCandidate[]
  recommended: EvaluatedCandidate[]
  spare: EvaluatedCandidate[]
  /** gate 落ちした候補（理由つき） */
  rejected: { candidate: ThemeCandidate; gateFails: SafetyGateFailCode[] }[]
  /** green 候補が recommendCount に届かなかったか（＝10件を無理に満たさなかった） */
  shortfall: boolean
  shortfallBy: number
  /** 予備が spareCount に満たなかったか（偏りキャップ等で分散候補が不足） */
  spareShortfall: boolean
  /** 暫定カテゴリーの分散（承諾前・明記から。18 の外に「未確定」を別行） */
  provisionalCategories: {
    recommended: { category: string; basis: ProvisionalCategoryBasis; count: number }[]
    resolvedCount: number // 推奨内で明記から確定できた件数
    resolvedRatio: number
    unusedCategories: string[] // 推奨に出てこない 18カテゴリー
  }
  /** 偏り検出（判定はしない・数えて報告） */
  bias: {
    facilityCounts: { key: string; label: string; count: number; spare: number; overMax: boolean }[]
    sourceCounts: { name: string; count: number; spare: number; ratio: number; overRatio: boolean }[]
    flags: string[]
  }
  /**
   * 推奨結果を「確定」としてよいか。偏りフラグ（例：蔦屋書店100%）や
   * 推奨数の不足があるときは false ＝ 追加収集してから再選定する。
   */
  finalized: boolean
  notFinalizedReasons: string[]
  /** 追加収集で広げるべき軸（morning の次回収集にヒント） */
  broadenAxes: {
    categories: string[] // 未使用の18カテゴリー
    temporal: string[] // 手薄な旬 tier（now/soon が少ない等）
    facilities: string[] // 過集中している施設（別施設を増やす）
    sources: string[] // 過集中している情報源
  }
  /** recommended の DC id 一覧（承諾前。admin の「候補確認・一括承諾」用） */
  recommendedDcIds: number[]
}

// ---------------------------------------------------------------------------
const KNOWN_TEMPLATE_TYPES = new Set([
  'exhibition',
  'sale',
  'application',
  'workshop',
  'recurring_event',
  'generic',
])

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\/\S+$/.test(u.trim())
}

/**
 * 安全性 gate（必須・加点ではない）。**候補選定は承諾前**に行うため、gate は
 * 「安全で・実在し・銀座の・追跡可能な・分類できるテーマか」だけを見る。
 * ArticleFacts が ready かどうか（＝記事化の準備）は gate ではなく readiness で扱う。
 * gate を緩めて件数を水増ししない：C／終了済み／重複／出典なし／銀座関連なし／
 * 種別不明 は必ず落とす。
 */
export function evaluateSafetyGate(c: ThemeCandidate, _cfg: SelectThemesConfig): SafetyGateFailCode[] {
  const fails: SafetyGateFailCode[] = []
  if (c.verdict === 'C') fails.push('verdict_c')
  if (c.expired) fails.push('expired')
  if (c.duplicate) fails.push('duplicate')
  if (!c.ginzaRelevant) fails.push('not_ginza')
  if (!c.hasTraceableSource || !isHttpUrl(s(c.sourceUrl))) fails.push('no_source')

  const tt = s(c.templateType)
  const ttOk = KNOWN_TEMPLATE_TYPES.has(tt) && c.templateTypeConfidence !== 'low'
  if (!ttOk) fails.push('unknown_type')

  if (c.factKind === 'unknown') fails.push('unknown_factkind')

  // 2026-09-06：正式タイトルが確認できない候補は推奨・予備どちらにも出さない（0件許容・推測しない）。
  if (!s(c.title) && !s(c.displayTitle)) fails.push('no_title')

  return fails
}

/** 安全性 gate の各条件の合否（gate 通過の「根拠」表示用） */
export const SAFETY_GATE_CHECKS = [
  '記事候補として妥当（verdict != C）',
  '開催が終了していない',
  '既投稿と重複していない',
  '銀座関連性を確認できる',
  '追跡可能な公式出典 URL を持つ',
  '記事種別を判別できる（unknown でない）',
  '正式タイトルを確認できる',
  '公式URL・開催期間・場所・内容をすべて確認できる',
] as const

export function safetyGateEvidence(c: ThemeCandidate): { passed: string[]; failed: SafetyGateFailCode[] } {
  const failed = evaluateSafetyGate(c, DEFAULT_SELECT_THEMES_CONFIG)
  const failCodeToCheck: Record<string, string> = {
    verdict_c: SAFETY_GATE_CHECKS[0],
    expired: SAFETY_GATE_CHECKS[1],
    duplicate: SAFETY_GATE_CHECKS[2],
    not_ginza: SAFETY_GATE_CHECKS[3],
    no_source: SAFETY_GATE_CHECKS[4],
    unknown_type: SAFETY_GATE_CHECKS[5],
    unknown_factkind: SAFETY_GATE_CHECKS[5],
    no_title: SAFETY_GATE_CHECKS[6],
    official_incomplete: SAFETY_GATE_CHECKS[7],
  }
  const failedChecks = new Set(failed.map((f) => failCodeToCheck[f]))
  return { passed: SAFETY_GATE_CHECKS.filter((ch) => !failedChecks.has(ch)), failed }
}

/** 生成準備の状態と、承諾後に埋める不足項目を決定的に出す（gate ではない）。 */
export function evaluateReadiness(c: ThemeCandidate): { readiness: ReadinessState; missing: string[] } {
  const fs = c.factsSource ?? 'none'
  if (fs === 'ready') {
    if (!s(c.primaryCategory)) {
      return {
        readiness: 'needs-category',
        missing: ['primaryCategory（18カテゴリー）未確定 — ready 化時にマロンが確定'],
      }
    }
    return { readiness: 'ready', missing: [] }
  }
  // draft / withdrawn / none
  const miss: string[] = []
  if (fs === 'none') miss.push('ArticleFacts 未作成（morning --write-facts で draft 作成 → 承諾後に確認）')
  else miss.push(`ArticleFacts が enrichmentStatus=${fs}（ready 化が必要）`)
  const mt = Array.isArray(c.missingForTemplate) ? c.missingForTemplate : []
  if (mt.length > 0) {
    miss.push(...mt.map((m) => `未確認: ${m}`))
  } else if (c.templateType === 'sale') {
    miss.push('sale 必須: priceText / officialInfoNote / 販売期間 の公式確認')
  } else {
    miss.push('必須テキスト（whatHappens / eventDate / eventTime / areaLead / audienceNote / officialInfoNote 等）の公式確認')
  }
  miss.push('primaryCategory（18カテゴリー）確定')
  return { readiness: 'needs-facts', missing: miss }
}

/** 旬・鮮度スコア（0〜1）。開催の近さ 0.7 ＋ 情報の新しさ 0.3 */
function freshnessScore(c: ThemeCandidate, now: Date): { score: number; tier: TemporalRelevanceTier } {
  const t = deriveTemporalRelevance(c.eventStartAt, c.eventEndAt, now)
  const tierScore: Record<TemporalRelevanceTier, number> = {
    now: 1.0,
    soon: 0.85,
    next: 0.6,
    later: 0.3,
    expired: 0,
    unknown: 0.45,
  }
  const verified = c.verifiedAt ? Date.parse(c.verifiedAt) : NaN
  let recency = 0.3
  if (!Number.isNaN(verified)) {
    const days = (now.getTime() - verified) / 86_400_000
    recency = days <= 3 ? 1 : days <= 7 ? 0.7 : days <= 14 ? 0.4 : 0.2
  }
  return { score: 0.7 * tierScore[t.tier] + 0.3 * recency, tier: t.tier }
}

/** 出現数 n（このキーが既に選ばれている件数）→ 限界分散スコア（新規=1、以降減衰） */
function marginalSpread(n: number): number {
  return n <= 0 ? 1 : n === 1 ? 0.4 : n === 2 ? 0.15 : 0.05
}

function periodOverlaps(a: ThemeCandidate, b: ThemeCandidate): boolean {
  const as = a.eventStartAt ? Date.parse(a.eventStartAt) : NaN
  const ae = a.eventEndAt ? Date.parse(a.eventEndAt) : as
  const bs = b.eventStartAt ? Date.parse(b.eventStartAt) : NaN
  const be = b.eventEndAt ? Date.parse(b.eventEndAt) : bs
  if ([as, ae, bs, be].some((x) => Number.isNaN(x))) {
    // 日付が取れないときは表示文字列で比較（不一致なら「異なる」とみなす）
    return s(a.eventPeriod) !== '' && s(a.eventPeriod) === s(b.eventPeriod)
  }
  return as <= be && bs <= ae
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
export function selectRecommendedThemes(
  input: ThemeCandidate[],
  opts: {
    now?: Date
    config?: SelectThemesConfig
    /**
     * 2026-09-04：偏り補正（直近採用ペナルティ・上位5件の施設分散・ART/CULTURE 抑制）と
     * コアターゲット適合・source_balance・editorial_score をランキングへ加える。
     * **既定 false**（＝従来の5軸のみ）。既存テスト・fixture は非設定なので挙動不変。
     * themesRecommend.ts の実データ経路が true で呼ぶ。
     */
    enableTargetFitRanking?: boolean
  } = {},
): SelectThemesResult {
  const now = opts.now ?? new Date()
  const cfg = opts.config ?? DEFAULT_SELECT_THEMES_CONFIG
  const w = cfg.weights
  const tfOn = opts.enableTargetFitRanking === true

  const rejected: SelectThemesResult['rejected'] = []
  // gate 通過分だけを EvaluatedCandidate の素にする
  const pool: EvaluatedCandidate[] = []
  for (const c of input) {
    const fails = evaluateSafetyGate(c, cfg)
    // 2026-09-11：実データ経路（tfOn）では、公式URL・開催期間・場所・内容のいずれかが
    // 確認できない候補（finalEligible=false）を推奨・予備どちらにも出さない（推測補完しない・0件許容）。
    if (tfOn && cfg.requireOfficialCompleteFinal && c.finalEligible === false && !fails.includes('official_incomplete')) {
      fails.push('official_incomplete')
    }
    if (fails.length > 0) {
      rejected.push({ candidate: c, gateFails: fails })
      continue
    }
    // 会場が空でも sourceName / 公式URL / タイトルの【店名】から施設キーを決定的に解決
    const fk = resolveFacilityKey({
      venue: c.venue,
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl,
      title: c.title,
    })
    const fr = freshnessScore(c, now)
    const rd = evaluateReadiness(c)
    const prov = deriveProvisionalCategory({
      primaryCategory: c.primaryCategory,
      title: c.title,
      venue: c.venue,
      templateType: c.templateType,
      contentType: c.contentType,
      excerpt: c.excerpt,
    })
    pool.push({
      candidate: c,
      safe: true,
      gateFails: [],
      readiness: rd.readiness,
      missingForGeneration: rd.missing,
      readyState: rd.readiness === 'ready' ? 'ready' : 'needs-ready',
      scores: { freshness: fr.score, categorySpread: 0, sourceFacilitySpread: 0, venueAreaSpread: 0, templateTypeSpread: 0, targetFit: 0, sourceBalance: 0, editorial: 0, biasAdjust: 0, total: 0 },
      temporalTier: fr.tier,
      temporalUnknown: !s(c.eventStartAt) && !s(c.eventEndAt),
      temporalLowConfidence:
        (!!s(c.eventStartAt) || !!s(c.eventEndAt)) && !!c.eventDateConfidence && c.eventDateConfidence !== 'high',
      categoryKey: prov.category ?? '未確定',
      categoryBasis: prov.basis,
      facilityKey: fk.key,
      facilityBucket: fk.key ?? '(会場不明)',
      facilityLabel: fk.store || s(c.venue) || '(会場不明)',
      areaKey: fk.areaKey || fk.key || slug(fk.store) || '(会場不明)',
      templateTypeKey: s(c.templateType) || 'unknown',
      sourceName: s(c.sourceName) || '(情報源不明)',
    })
  }

  // ---------------------------------------------------------------------------
  // 3フェーズの「必須ハードキャップ付き」貪欲選定（2026-09-04、マロン指示）
  //   Phase1 推奨: 同一施設 <= 1 ／ 同一情報源 <= recSourceMax ／ 全体施設 <= allFacilityMax
  //   Phase2 推奨(例外): 同一施設 <= recFacilityMax（2）だが 3条件＋理由が必要
  //   Phase3 予備: 予備内 同一施設 <= spareFacilityMax ／ 全体 <= allFacilityMax ／ 全体情報源 <= allSourceMax
  // 推奨が10件に満たなくても、GINZA SIX 等で穴埋めしない＝shortfall（finalized=false）。
  // ---------------------------------------------------------------------------
  const recommended: EvaluatedCandidate[] = []
  const spare: EvaluatedCandidate[] = []
  const remaining = [...pool]

  const catCount = new Map<string, number>()
  const areaCount = new Map<string, number>()
  const ttCount = new Map<string, number>()
  const facAll = new Map<string, number>()
  const srcAll = new Map<string, number>()
  const facRec = new Map<string, number>()
  const srcRec = new Map<string, number>()
  const catRec = new Map<string, number>()
  const facSpare = new Map<string, number>()
  const srcTypeCount = new Map<string, number>() // source_balance（推奨＋予備通算）
  let unkVenueRec = 0
  let unkTemporalRec = 0
  let lowConfTemporalRec = 0
  let artCultureRec = 0 // 推奨内の ART + CULTURE 合計（ART/CULTURE 過集中の抑制）
  const g = (m: Map<string, number>, k: string) => m.get(k) ?? 0
  // 推奨フェーズで候補 e を採れるか（会場不明・時期不明・同一カテゴリーのハードキャップ）
  const recCategoryOk = (e: EvaluatedCandidate) =>
    e.categoryKey === '未確定' || g(catRec, e.categoryKey) < cfg.categoryMaxInRec
  const recVenueOk = (e: EvaluatedCandidate) =>
    e.facilityKey != null || unkVenueRec < cfg.unknownVenueMaxInRec
  const recTemporalOk = (e: EvaluatedCandidate) => !e.temporalUnknown || unkTemporalRec < cfg.unknownTemporalMaxInRec
  // 期間はあるが抽出信頼度が high でない（body_label等・要確認）候補のハードキャップ（2026-09-06追加）
  const recTemporalConfidenceOk = (e: EvaluatedCandidate) =>
    !e.temporalLowConfidence || lowConfTemporalRec < cfg.lowConfidenceTemporalMaxInRec

  const ART_CULTURE = new Set(['ART', 'CULTURE'])

  function scoreParts(e: EvaluatedCandidate): EvaluatedCandidate['scores'] {
    const parts = {
      freshness: e.scores.freshness,
      categorySpread: marginalSpread(g(catCount, e.categoryKey)),
      sourceFacilitySpread:
        0.5 * marginalSpread(g(facAll, e.facilityBucket)) + 0.5 * marginalSpread(g(srcAll, e.sourceName)),
      venueAreaSpread: marginalSpread(g(areaCount, e.areaKey)),
      templateTypeSpread: marginalSpread(g(ttCount, e.templateTypeKey)),
      targetFit: 0,
      sourceBalance: 0,
      editorial: 0,
      biasAdjust: 0,
      total: 0,
    }
    parts.total =
      w.freshness * parts.freshness +
      w.categorySpread * parts.categorySpread +
      w.sourceFacilitySpread * parts.sourceFacilitySpread +
      w.venueAreaSpread * parts.venueAreaSpread +
      w.templateTypeSpread * parts.templateTypeSpread
    parts.total += e.readiness === 'ready' ? 0.05 : e.readiness === 'needs-category' ? 0.02 : 0
    // 会場不明・時期不明・明記でないカテゴリーは推奨枠が希少なので後回しにする（決定的な減点）。
    if (e.facilityKey == null) parts.total -= 0.25
    if (e.temporalUnknown) parts.total -= 0.25
    if (e.temporalLowConfidence) parts.total -= 0.25
    if (!isCategoryResolved(e.categoryBasis)) parts.total -= 0.15
    // まだ推奨に無い明記カテゴリーは強く優先（最低カテゴリー種類数の達成のため）。
    if (isCategoryResolved(e.categoryBasis) && g(catRec, e.categoryKey) === 0) parts.total += 0.4

    // --- 2026-09-04：偏り補正＋コアターゲット適合（enableTargetFitRanking のときのみ） ---
    // すべて「フィールドが無ければ 0」で、既存 fixture・テストには一切影響しない。
    if (tfOn) {
      const c = e.candidate
      // コアターゲット（20代後半〜30代女性）適合：実分布の中央値 35 を中立に ±w.targetFit
      // （実データの target_fit は 0〜60 に寄るため、50 中立だと全体が減点方向に偏る）
      if (c.targetFit != null) parts.targetFit = w.targetFit * Math.max(-1, Math.min(1.2, (c.targetFit - 35) / 35))
      // 既存 editorial_score（0-100 → 0-1）。未取得は中立 0.5
      const es = c.editorialScoreTotal
      parts.editorial = w.editorial * Math.max(0, Math.min(1, (es == null ? 50 : es) / 100))
      // source_balance：まだ出ていないソース種別を軽く優先
      if (c.sourceTypeKey) parts.sourceBalance = w.sourceBalance * marginalSpread(g(srcTypeCount, c.sourceTypeKey))
      // 直近採用でのカテゴリー／施設の過多 → 決定的減点
      parts.biasAdjust -= c.categoryHistoryPenalty ?? 0
      parts.biasAdjust -= c.venueHistoryPenalty ?? 0
      // 施設分散：推奨に同一施設が既に1件入っていれば2件目を減点（上位5件はより強く）。
      // ハードキャップ（recFacilityMax=2）は維持しつつ、2件目の採用ハードルを上げる。
      if (e.facilityKey != null && g(facRec, e.facilityBucket) >= 1)
        parts.biasAdjust -= recommended.length < 5 ? 0.18 : 0.1
      // ART / CULTURE の過集中を抑制（合計3件目以降は逓増減点。旬度が高ければ freshness で相殺可）
      if (ART_CULTURE.has(e.categoryKey)) parts.biasAdjust -= 0.12 * artCultureRec
      // 2026-09-11：収集カバレッジ補正（過去7日の大手施設集中−／18カテゴリー不足＋／終了間近＋／女性適合＋）。
      // assessInboxPool が candidateCoverageScore.computeCandidateCoverage で決定的に算出済み。
      parts.biasAdjust += c.coverageAdjust ?? 0

      parts.total += parts.targetFit + parts.editorial + parts.sourceBalance + parts.biasAdjust
    }
    return parts
  }

  /** predicate を満たす remaining のうち最良（total→freshness→小さい DC id）の idx。無ければ -1 */
  function pickBest(predicate: (e: EvaluatedCandidate) => boolean): { idx: number; parts: EvaluatedCandidate['scores'] } | null {
    let best: { idx: number; parts: EvaluatedCandidate['scores'] } | null = null
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i]
      if (!predicate(e)) continue
      const parts = scoreParts(e)
      const better =
        !best ||
        parts.total > best.parts.total + 1e-9 ||
        (Math.abs(parts.total - best.parts.total) <= 1e-9 &&
          (parts.freshness > best.parts.freshness + 1e-9 ||
            (Math.abs(parts.freshness - best.parts.freshness) <= 1e-9 &&
              e.candidate.discoveredContentId < remaining[best.idx].candidate.discoveredContentId)))
      if (better) best = { idx: i, parts }
    }
    return best
  }

  function commit(idx: number, parts: EvaluatedCandidate['scores'], bucket: 'rec' | 'spare', exception?: string): void {
    const [picked] = remaining.splice(idx, 1)
    picked.scores = parts
    if (exception) picked.sameFacilityException = exception
    catCount.set(picked.categoryKey, g(catCount, picked.categoryKey) + 1)
    areaCount.set(picked.areaKey, g(areaCount, picked.areaKey) + 1)
    ttCount.set(picked.templateTypeKey, g(ttCount, picked.templateTypeKey) + 1)
    facAll.set(picked.facilityBucket, g(facAll, picked.facilityBucket) + 1)
    srcAll.set(picked.sourceName, g(srcAll, picked.sourceName) + 1)
    if (picked.candidate.sourceTypeKey)
      srcTypeCount.set(picked.candidate.sourceTypeKey, g(srcTypeCount, picked.candidate.sourceTypeKey) + 1)
    if (bucket === 'rec') {
      facRec.set(picked.facilityBucket, g(facRec, picked.facilityBucket) + 1)
      srcRec.set(picked.sourceName, g(srcRec, picked.sourceName) + 1)
      catRec.set(picked.categoryKey, g(catRec, picked.categoryKey) + 1)
      if (picked.facilityKey == null) unkVenueRec++
      if (picked.temporalUnknown) unkTemporalRec++
      if (picked.temporalLowConfidence) lowConfTemporalRec++
      if (ART_CULTURE.has(picked.categoryKey)) artCultureRec++
      recommended.push(picked)
    } else {
      facSpare.set(picked.facilityBucket, g(facSpare, picked.facilityBucket) + 1)
      spare.push(picked)
    }
  }

  // --- Phase 1: 推奨（同一施設 <= 1 ＋ 会場不明・時期不明・同一カテゴリーのハードキャップ） ---
  while (recommended.length < cfg.recommendCount) {
    const b = pickBest(
      (e) =>
        g(facAll, e.facilityBucket) < cfg.allFacilityMax &&
        g(facRec, e.facilityBucket) < 1 &&
        g(srcRec, e.sourceName) < cfg.recSourceMax &&
        recCategoryOk(e) &&
        recVenueOk(e) &&
        recTemporalOk(e) &&
        recTemporalConfidenceOk(e),
    )
    if (!b) break
    commit(b.idx, b.parts, 'rec')
  }

  // --- Phase 2: 推奨（例外で同一施設 2 件目。3条件＋理由が必要） ---
  while (recommended.length < cfg.recommendCount) {
    let chosen: { idx: number; parts: EvaluatedCandidate['scores']; reason: string } | null = null
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i]
      if (g(facAll, e.facilityBucket) >= cfg.allFacilityMax) continue
      if (g(facRec, e.facilityBucket) >= cfg.recFacilityMax) continue
      if (g(srcRec, e.sourceName) >= cfg.recSourceMax) continue
      if (!recCategoryOk(e) || !recVenueOk(e) || !recTemporalOk(e) || !recTemporalConfidenceOk(e)) continue
      // 同一施設2件目 → 上限は recFacilityMax（2）。編集的な別物であることを理由として記録する。
      // （マロン確定条件は「同一施設は推奨中最大2件」の単純キャップ。3条件は理由生成にのみ使う）
      let reason = `同一施設の2件目ではない`
      if (g(facRec, e.facilityBucket) >= 1) {
        const prior = recommended.find((x) => x.facilityBucket === e.facilityBucket)
        if (!prior) continue
        const diffType = e.templateTypeKey !== prior.templateTypeKey
        const diffCategory = e.categoryKey !== '未確定' && e.categoryKey !== prior.categoryKey
        const diffPeriod = !periodOverlaps(e.candidate, prior.candidate)
        const diffScene =
          (s(e.candidate.uxType) !== '' && s(e.candidate.uxType) !== s(prior.candidate.uxType)) ||
          e.temporalTier !== prior.temporalTier
        // 2件とも「記事種別も18カテゴリーも開催期間も利用場面も同一」なら重複感が強いので採らない
        if (!diffType && !diffCategory && !diffPeriod && !diffScene) continue
        const parts_ = [
          diffType ? `記事種別が異なる（${prior.templateTypeKey} ↔ ${e.templateTypeKey}）` : '',
          diffCategory ? `カテゴリーが異なる（${prior.categoryKey} ↔ ${e.categoryKey}）` : '',
          diffPeriod
            ? `開催期間が異なる（${prior.candidate.eventPeriod || '?'} ↔ ${e.candidate.eventPeriod || '?'}）`
            : diffScene
              ? `利用場面が異なる（${prior.candidate.uxType || prior.temporalTier} ↔ ${e.candidate.uxType || e.temporalTier}）`
              : '',
        ].filter(Boolean)
        reason = `同一施設「${e.facilityLabel}」から2件目を許可（上限2件）：${parts_.join('／')}`
      }
      const parts = scoreParts(e)
      const better =
        !chosen ||
        parts.total > chosen.parts.total + 1e-9 ||
        (Math.abs(parts.total - chosen.parts.total) <= 1e-9 &&
          e.candidate.discoveredContentId < remaining[chosen.idx].candidate.discoveredContentId)
      if (better) chosen = { idx: i, parts, reason }
    }
    if (!chosen) break
    commit(chosen.idx, chosen.parts, 'rec', g(facRec, remaining[chosen.idx].facilityBucket) >= 1 ? chosen.reason : undefined)
  }

  // --- Phase 3: 予備（予備内 同一施設 <= spareFacilityMax／全体 <= allFacilityMax／全体情報源 <= allSourceMax） ---
  while (spare.length < cfg.spareCount) {
    const b = pickBest(
      (e) =>
        g(facAll, e.facilityBucket) < cfg.allFacilityMax &&
        g(facSpare, e.facilityBucket) < cfg.spareFacilityMax &&
        g(srcAll, e.sourceName) < cfg.allSourceMax,
    )
    if (!b) break
    commit(b.idx, b.parts, 'spare')
  }

  const selected = [...recommended, ...spare]
  const shortfallBy = Math.max(0, cfg.recommendCount - recommended.length)

  // --- 偏り集計（推奨＋予備。数えて報告） ---
  const facMap = new Map<string, { label: string; rec: number; spare: number }>()
  const srcMap = new Map<string, { rec: number; spare: number }>()
  for (const e of recommended) {
    const f = facMap.get(e.facilityBucket) ?? { label: e.facilityLabel, rec: 0, spare: 0 }
    f.rec++
    facMap.set(e.facilityBucket, f)
    const sc = srcMap.get(e.sourceName) ?? { rec: 0, spare: 0 }
    sc.rec++
    srcMap.set(e.sourceName, sc)
  }
  for (const e of spare) {
    const f = facMap.get(e.facilityBucket) ?? { label: e.facilityLabel, rec: 0, spare: 0 }
    f.spare++
    facMap.set(e.facilityBucket, f)
    const sc = srcMap.get(e.sourceName) ?? { rec: 0, spare: 0 }
    sc.spare++
    srcMap.set(e.sourceName, sc)
  }
  const denom = Math.max(1, recommended.length)
  const facilityCounts = [...facMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      count: v.rec,
      spare: v.spare,
      overMax: v.rec > cfg.recFacilityMax || v.rec + v.spare > cfg.allFacilityMax,
    }))
    .sort((a, b) => b.count - a.count || b.spare - a.spare || a.key.localeCompare(b.key))
  const sourceCounts = [...srcMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.rec,
      spare: v.spare,
      ratio: Number((v.rec / denom).toFixed(2)),
      overRatio: v.rec > cfg.recSourceMax || v.rec + v.spare > cfg.allSourceMax,
    }))
    .sort((a, b) => b.count - a.count || b.spare - a.spare || a.name.localeCompare(b.name))

  const flags: string[] = []
  for (const f of facilityCounts) {
    if (f.count > cfg.recFacilityMax) flags.push(`施設偏り: 「${f.label}」が推奨内で ${f.count} 件（上限 ${cfg.recFacilityMax}）`)
    else if (f.count + f.spare > cfg.allFacilityMax) flags.push(`施設偏り: 「${f.label}」が推奨＋予備で ${f.count + f.spare} 件（上限 ${cfg.allFacilityMax}）`)
  }
  for (const sc of sourceCounts) {
    if (sc.count > cfg.recSourceMax) flags.push(`情報源偏り: 「${sc.name}」が推奨内で ${sc.count} 件（上限 ${cfg.recSourceMax}＝20%）`)
    else if (sc.count + sc.spare > cfg.allSourceMax) flags.push(`情報源偏り: 「${sc.name}」が推奨＋予備で ${sc.count + sc.spare} 件（上限 ${cfg.allSourceMax}）`)
  }
  const spareFacFlag = [...facSpare.entries()].filter(([, n]) => n > cfg.spareFacilityMax)
  for (const [k, n] of spareFacFlag) flags.push(`予備の施設偏り: 「${k}」が予備で ${n} 件（上限 ${cfg.spareFacilityMax}）`)
  // 同一施設2件（＝上限内）は「偏り」ではないため flags には入れない。理由は
  // sameFacilityException / selectionBalance.sameFacilityExceptions で参照できる。
  const unknownVenueRec = recommended.filter((e) => e.facilityKey == null).length
  if (unknownVenueRec > cfg.unknownVenueMaxInRec)
    flags.push(`会場不明が推奨内で ${unknownVenueRec} 件（上限 ${cfg.unknownVenueMaxInRec}）`)
  if (unkTemporalRec > cfg.unknownTemporalMaxInRec)
    flags.push(`時期不明が推奨内で ${unkTemporalRec} 件（上限 ${cfg.unknownTemporalMaxInRec}）`)
  if (lowConfTemporalRec > cfg.lowConfidenceTemporalMaxInRec)
    flags.push(`会期の抽出信頼度が要確認（high未満）の候補が推奨内で ${lowConfTemporalRec} 件（上限 ${cfg.lowConfidenceTemporalMaxInRec}）`)
  const recCatOver = [...catRec.entries()].filter(([k, n]) => k !== '未確定' && n > cfg.categoryMaxInRec)
  for (const [k, n] of recCatOver) flags.push(`カテゴリー偏り: ${k} が推奨 ${n} 件（上限 ${cfg.categoryMaxInRec}）`)
  const recCategoryKinds = new Set(recommended.filter((e) => e.categoryKey !== '未確定').map((e) => e.categoryKey)).size
  if (recommended.length >= cfg.recommendCount && recCategoryKinds < cfg.minCategoriesInRec)
    flags.push(`カテゴリー種類不足: 推奨のカテゴリーが ${recCategoryKinds} 種（下限 ${cfg.minCategoriesInRec}）`)

  // --- 暫定カテゴリー分散 ---
  const catBasisByKey = new Map<string, ProvisionalCategoryBasis>()
  const recCatCount = new Map<string, number>()
  for (const e of recommended) {
    recCatCount.set(e.categoryKey, g(recCatCount, e.categoryKey) + 1)
    if (!catBasisByKey.has(e.categoryKey)) catBasisByKey.set(e.categoryKey, e.categoryBasis)
  }
  const provRecommended = [...recCatCount.entries()]
    .map(([category, count]) => ({ category, basis: catBasisByKey.get(category) ?? null, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
  const resolvedCount = recommended.filter((e) => isCategoryResolved(e.categoryBasis)).length
  const resolvedRatio = recommended.length > 0 ? Number((resolvedCount / recommended.length).toFixed(2)) : 0
  const usedCats = new Set(recommended.map((e) => e.categoryKey))
  const unusedCategories = PRIMARY_18.filter((c) => !usedCats.has(c))

  // --- 確定してよいか（不足・偏り・カテゴリー根拠不足があれば false。穴埋めしない）---
  const notFinalizedReasons: string[] = []
  if (recommended.length === 0) notFinalizedReasons.push('推奨候補が 0 件')
  if (shortfallBy > 0)
    notFinalizedReasons.push(`推奨が ${cfg.recommendCount} 件に ${shortfallBy} 件不足（GINZA SIX 等での穴埋めはしない＝shortfall）`)
  for (const f of facilityCounts) {
    if (f.count > cfg.recFacilityMax) notFinalizedReasons.push(`施設偏り: ${f.label} が推奨 ${f.count} 件（上限 ${cfg.recFacilityMax}）`)
    else if (f.count + f.spare > cfg.allFacilityMax) notFinalizedReasons.push(`施設偏り: ${f.label} が推奨＋予備 ${f.count + f.spare} 件（上限 ${cfg.allFacilityMax}）`)
  }
  for (const sc of sourceCounts) {
    if (sc.count > cfg.recSourceMax) notFinalizedReasons.push(`情報源偏り: ${sc.name} が推奨 ${sc.count} 件（上限 ${cfg.recSourceMax}）`)
  }
  for (const [k, n] of spareFacFlag) notFinalizedReasons.push(`予備の施設偏り: ${k} が ${n} 件（上限 ${cfg.spareFacilityMax}）`)
  if (recommended.length > 0 && resolvedRatio < cfg.minCategoryResolvedRatio)
    notFinalizedReasons.push(
      `推奨 ${recommended.length} 件中、明記からカテゴリーを確定できたのは ${resolvedCount} 件（${Math.round(resolvedRatio * 100)}% < ${Math.round(cfg.minCategoryResolvedRatio * 100)}%）。暫定カテゴリーの根拠不足`,
    )
  if (unknownVenueRec > cfg.unknownVenueMaxInRec)
    notFinalizedReasons.push(`会場不明が推奨 ${unknownVenueRec} 件（上限 ${cfg.unknownVenueMaxInRec}）`)
  if (unkTemporalRec > cfg.unknownTemporalMaxInRec)
    notFinalizedReasons.push(`時期不明が推奨 ${unkTemporalRec} 件（上限 ${cfg.unknownTemporalMaxInRec}）`)
  if (lowConfTemporalRec > cfg.lowConfidenceTemporalMaxInRec)
    notFinalizedReasons.push(`会期の抽出信頼度が要確認の候補が推奨 ${lowConfTemporalRec} 件（上限 ${cfg.lowConfidenceTemporalMaxInRec}）`)
  for (const [k, n] of recCatOver) notFinalizedReasons.push(`カテゴリー偏り: ${k} が推奨 ${n} 件（上限 ${cfg.categoryMaxInRec}）`)
  if (recommended.length >= cfg.recommendCount && recCategoryKinds < cfg.minCategoriesInRec)
    notFinalizedReasons.push(`推奨のカテゴリー種類が ${recCategoryKinds} 種（下限 ${cfg.minCategoriesInRec}）`)
  const finalized = notFinalizedReasons.length === 0

  // --- 追加収集で広げる軸 ---
  const tmpCount = new Map<string, number>()
  for (const e of recommended) tmpCount.set(e.temporalTier, g(tmpCount, e.temporalTier) + 1)
  const thinTemporal: string[] = []
  if ((g(tmpCount, 'now')) + (g(tmpCount, 'soon')) < Math.ceil(cfg.recommendCount * 0.5))
    thinTemporal.push('NOW/SOON（開催中・まもなくの候補が半数未満）')
  const lowConfWaiting = remaining.filter((e) => e.temporalLowConfidence).length
  if (lowConfWaiting > 0)
    thinTemporal.push(
      `会期の抽出信頼度が要確認（body_label等・high未満）のため推奨に入れなかった候補が ${lowConfWaiting} 件（公式ページの再確認で high 化すれば推奨対象）`,
    )
  // キャップに当たって取りこぼした施設・情報源（＝別ソースを増やすべき軸）
  const cappedFac = new Set<string>()
  const cappedSrc = new Set<string>()
  for (const e of remaining) {
    if (g(facRec, e.facilityBucket) >= cfg.recFacilityMax) cappedFac.add(e.facilityLabel)
    if (g(srcRec, e.sourceName) >= cfg.recSourceMax) cappedSrc.add(e.sourceName)
  }
  const broadenAxes = {
    categories: unusedCategories,
    temporal: thinTemporal,
    facilities: [...cappedFac].map((x) => `${x}（推奨キャップ到達・別施設を増やす）`),
    sources: [...cappedSrc].map((x) => `${x}（推奨キャップ到達・別情報源を増やす）`),
  }

  return {
    now: now.toISOString(),
    config: cfg,
    gatePassed: pool.length,
    candidates: selected,
    recommended,
    spare,
    rejected,
    shortfall: shortfallBy > 0,
    shortfallBy,
    spareShortfall: spare.length < cfg.spareCount,
    provisionalCategories: { recommended: provRecommended, resolvedCount, resolvedRatio, unusedCategories },
    bias: { facilityCounts, sourceCounts, flags },
    finalized,
    notFinalizedReasons,
    broadenAxes,
    recommendedDcIds: recommended.map((e) => e.candidate.discoveredContentId),
  }
}

const PRIMARY_18 = [
  'FOOD', 'CAFE', 'SHOPPING', 'ARCHITECTURE', 'ART', 'EVENT', 'NIGHT', 'MUSIC', 'BEAUTY',
  'HOTEL', 'WELLNESS', 'EXPERIENCE', 'GIFT', 'WORKSHOP', 'PHOTO', 'FAMILY', 'NIGHT_VIEW', 'RAINY_DAY',
] as const

function slug(x: string): string {
  return (x ?? '').trim().toLowerCase().replace(/\s+/g, '-') || 'x'
}
