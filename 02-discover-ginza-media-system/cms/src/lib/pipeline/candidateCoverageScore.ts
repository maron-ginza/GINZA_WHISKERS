// GINZA WHISKERS / Project 02（2026-09-11）— 候補収集カバレッジのスコアリング（純粋・決定的・AIなし・DB非依存）。
//
// 毎朝の候補順位へ「収集の偏り／不足／公式情報の確認可否」を反映するための5点：
//   1. 過去7日間の施設掲載数（大手4施設＝GINZA SIX／銀座三越／松屋銀座／銀座 蔦屋書店 は強めに抑制）
//   2. 18カテゴリーの掲載不足度（週次目標配分との差）
//   3. 公式情報の完全度（公式URL・開催期間・場所・内容が確認できるか）
//   4. 20代後半〜30代女性への適合度（targetFitScore を 0-1 に正規化して合流）
//   5. 開催終了までの日数（終了間近は少し優先、終了済みは対象外）
//
// selectRecommendedThemes / assessInboxPool / themesRecommend が読み取り専用で参照する。
// 判定ロジックは「明記された情報だけ」を見る——推測補完はしない。

// ---------------------------------------------------------------------------
// 大手施設（過集中を強めに抑制する対象）。facilityKey.ts の resolveFacilityKey が返す key に一致させる。
// ---------------------------------------------------------------------------
export const OVEREXPOSED_FACILITY_KEYS = [
  'ginza-six',
  'mitsukoshi-ginza',
  'matsuya-ginza',
  'ginza-tsutaya',
] as const
export type OverexposedFacilityKey = (typeof OVEREXPOSED_FACILITY_KEYS)[number]

const OVEREXPOSED_SET = new Set<string>(OVEREXPOSED_FACILITY_KEYS)

/**
 * 18カテゴリー（＋ ArticleFacts 由来の CULTURE）の週次目標配分。
 * 「1日3本（ビューティー／グルメ・スイーツ／文化・アート）＋18カテゴリーを週・月で循環」
 * （GINZA_JOHOKYOKU_SPEC §8.7）を、週あたりのおおよその目安件数として持つ。
 * 数値の合否判定には使わない——不足度（deficiency）のベースラインとしてのみ使う。
 */
export const CATEGORY_WEEKLY_TARGET: Record<string, number> = {
  // コア3の柱（毎日1本 → 週7前後だが、循環運用なので週あたり目安は控えめに）
  BEAUTY: 3,
  FOOD: 2,
  // 2026-09-11 追加：FOOD から分離。グルメ・スイーツ枠の中でも独立して不足を検知する。
  SWEETS: 2,
  ART: 3,
  // コア3に内包されるサブカテゴリー
  CAFE: 2,
  WELLNESS: 1,
  GIFT: 1,
  CULTURE: 1,
  PHOTO: 1,
  ARCHITECTURE: 1,
  MUSIC: 1,
  WORKSHOP: 1,
  EVENT: 1,
  // 週内で回せれば良い周辺カテゴリー
  SHOPPING: 2,
  HOTEL: 1,
  EXPERIENCE: 1,
  NIGHT: 0,
  NIGHT_VIEW: 0,
  FAMILY: 0,
  RAINY_DAY: 0,
}

export const ALL_18_CATEGORIES = Object.keys(CATEGORY_WEEKLY_TARGET)

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// ---------------------------------------------------------------------------
// 1. 過去7日間の施設掲載数 → ペナルティ（0 以下）
// ---------------------------------------------------------------------------
export interface FacilityConcentrationOptions {
  /** 1件を超えるごとの基本減点（既定 0.06） */
  perExtra?: number
  /** 大手施設の倍率（既定 2.2） */
  bigMultiplier?: number
  /** 減点の下限（既定 -0.4） */
  floor?: number
}

/**
 * 過去7日間に同じ施設が何件採用されたか（count7d）に応じた決定的な減点。
 * 大手4施設は倍率をかけて強めに抑制し、1件でも出ていれば必ずわずかに減点する。
 */
export function facilityConcentrationPenalty(
  facilityKey: string | null | undefined,
  count7d: number,
  opts: FacilityConcentrationOptions = {},
): number {
  const perExtra = opts.perExtra ?? 0.06
  const bigMult = opts.bigMultiplier ?? 2.2
  const floor = opts.floor ?? -0.4
  if (!facilityKey || count7d <= 0) return 0
  const isBig = OVEREXPOSED_SET.has(facilityKey)
  // 1件目は据え置き（isBig のときだけ軽い先行減点）、2件目以降を逓増減点
  let penalty = -perExtra * Math.max(0, count7d - 1)
  if (isBig) {
    penalty *= bigMult
    penalty -= 0.08 // 大手は1件出ている時点で軽く減点
  }
  return clamp(penalty, floor, 0)
}

// ---------------------------------------------------------------------------
// 2. 18カテゴリーの掲載不足度 → ボーナス（0 以上）
// ---------------------------------------------------------------------------
export interface CategoryDeficiencyOptions {
  /** 不足を最大まで満たした時のボーナス（既定 0.16） */
  maxBonus?: number
  /** その週まだ0件のカテゴリーへの追加ボーナス（既定 0.05） */
  zeroExtra?: number
  /** 目標配分の上書き */
  target?: Record<string, number>
}

/**
 * 過去7日間の 18カテゴリー別採用件数（counts7d）と週次目標配分の差から、
 * 掲載が不足しているカテゴリーの候補を決定的に押し上げるボーナス。
 */
export function categoryDeficiencyBonus(
  category: string | null | undefined,
  counts7d: Record<string, number>,
  opts: CategoryDeficiencyOptions = {},
): number {
  if (!category) return 0
  const cat = category.toUpperCase()
  const target = (opts.target ?? CATEGORY_WEEKLY_TARGET)[cat]
  if (target == null || target <= 0) return 0
  const maxBonus = opts.maxBonus ?? 0.16
  const zeroExtra = opts.zeroExtra ?? 0.05
  const actual = Math.max(0, counts7d[cat] ?? 0)
  const deficiency = clamp((target - actual) / target, 0, 1)
  let bonus = maxBonus * deficiency
  if (actual === 0) bonus += zeroExtra
  return bonus
}

// ---------------------------------------------------------------------------
// 3. 公式情報の完全度（公式URL・開催期間・場所・内容）
// ---------------------------------------------------------------------------
export interface OfficialCompletenessInput {
  /** 公式ページ URL（http(s):// で始まること） */
  sourceUrl?: string | null
  /** 機械日付（どちらか片方でもあれば「期間あり」の弱シグナル） */
  eventStartAt?: string | null
  eventEndAt?: string | null
  /** 表示用の開催期間文字列（「2026年9月9日〜9月14日」等。数字を含めば「期間あり」） */
  eventPeriod?: string | null
  /** 会場テキスト */
  venue?: string | null
  /** 会場が空でも施設キーが決定的に解決できているか（facilityKey.ts） */
  facilityResolved?: boolean
  /** 内容（ArticleFacts.whatHappens 等） */
  whatHappens?: string | null
  /** 公式ページ本文抜粋（40字以上あれば「内容あり」の弱シグナル） */
  excerpt?: string | null
  /** product_news（販売）で会期がなく「発売中」等のときは期間の代わりに販売開始日を見る */
  saleStartAt?: string | null
}

export interface OfficialCompletenessResult {
  /** 4項目（URL・期間・場所・内容）のうち確認できた割合 0-1 */
  score: number
  have: string[]
  missing: string[]
  /** 4項目すべて確認できたか。false のものは「最終候補に上げない」対象 */
  finalEligible: boolean
}

const DATE_DIGIT_RE = /\d{1,4}\s*[-/年.]|\d{1,2}\s*月|\d{1,2}\s*日/

function hasHttpUrl(u: string | null | undefined): boolean {
  return typeof u === 'string' && /^https?:\/\/\S+/.test(u.trim())
}

export function officialCompleteness(input: OfficialCompletenessInput): OfficialCompletenessResult {
  const have: string[] = []
  const missing: string[] = []

  // ① 公式URL
  if (hasHttpUrl(input.sourceUrl)) have.push('公式URL')
  else missing.push('公式URL')

  // ② 開催・販売期間（機械日付 or 期間テキストに数字）
  const periodText = (input.eventPeriod ?? '').trim()
  const hasPeriod =
    hasIso(input.eventStartAt) ||
    hasIso(input.eventEndAt) ||
    hasIso(input.saleStartAt) ||
    (periodText.length > 0 && DATE_DIGIT_RE.test(periodText))
  if (hasPeriod) have.push('開催・販売期間')
  else missing.push('開催・販売期間')

  // ③ 場所（会場テキスト or 施設キー解決）
  const hasPlace = (input.venue ?? '').trim().length > 0 || input.facilityResolved === true
  if (hasPlace) have.push('場所')
  else missing.push('場所')

  // ④ 内容（whatHappens or 抜粋40字以上）
  const wh = (input.whatHappens ?? '').trim()
  const ex = (input.excerpt ?? '').trim()
  const hasContent = wh.length >= 8 || ex.length >= 40
  if (hasContent) have.push('内容')
  else missing.push('内容')

  const score = have.length / 4
  return { score, have, missing, finalEligible: missing.length === 0 }
}

function hasIso(v: string | null | undefined): boolean {
  if (!v) return false
  const t = Date.parse(v)
  return Number.isFinite(t)
}

// ---------------------------------------------------------------------------
// 4. 20代後半〜30代女性への適合度（0-100 → 0-1）
// ---------------------------------------------------------------------------
/** targetFitScore（0-100、実分布の中央値 35）を 0-1 のカバレッジ寄与へ正規化する */
export function targetWomenFitScore(targetFit: number | null | undefined): number {
  if (targetFit == null || !Number.isFinite(targetFit)) return 0.4 // 未評価は中立
  return clamp((targetFit - 10) / 60, 0, 1)
}

// ---------------------------------------------------------------------------
// 5. 開催終了までの日数
// ---------------------------------------------------------------------------
export type DaysUntilEndTier = 'expired' | 'ending_soon' | 'this_week' | 'comfortable' | 'far' | 'no_end'

export interface DaysUntilEndResult {
  days: number | null
  tier: DaysUntilEndTier
  /** 0-1。終了間近ほど高い（今すぐ紹介する価値）。終了済みは 0 */
  score: number
  expired: boolean
}

export function daysUntilEndScore(
  eventEndAt: string | null | undefined,
  now: Date = new Date(),
): DaysUntilEndResult {
  if (!eventEndAt || !hasIso(eventEndAt)) {
    return { days: null, tier: 'no_end', score: 0.4, expired: false }
  }
  const end = new Date(eventEndAt)
  const ms = end.getTime() - now.getTime()
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days < 0) return { days, tier: 'expired', score: 0, expired: true }
  if (days <= 3) return { days, tier: 'ending_soon', score: 1, expired: false }
  if (days <= 10) return { days, tier: 'this_week', score: 0.8, expired: false }
  if (days <= 30) return { days, tier: 'comfortable', score: 0.55, expired: false }
  return { days, tier: 'far', score: 0.35, expired: false }
}

// ---------------------------------------------------------------------------
// まとめ：1候補ぶんのカバレッジ補正（selectRecommendedThemes の biasAdjust に合流）
// ---------------------------------------------------------------------------
export interface CandidateCoverageInput {
  category: string | null | undefined
  facilityKey: string | null | undefined
  categoryCounts7d: Record<string, number>
  facilityCounts7d: Record<string, number>
  official: OfficialCompletenessInput
  targetFit: number | null | undefined
  eventEndAt: string | null | undefined
  now?: Date
  /** 重み（env / CLI で上書き可能に。既定は下） */
  weights?: {
    categoryDeficiency?: number // 既定 1.0
    facilityConcentration?: number // 既定 1.0
    endUrgency?: number // 既定 0.10（score 0-1 ×この値の加点）
    womenFit?: number // 既定 0.10（score 0-1 ×この値の加点）
  }
}

export interface CandidateCoverageResult {
  /** biasAdjust に足す合計（正負両方あり） */
  adjust: number
  /** 正の寄与（不足カテゴリー・終了間近・女性適合） */
  bonus: number
  /** 負の寄与（施設集中） */
  penalty: number
  official: OfficialCompletenessResult
  daysUntilEnd: DaysUntilEndResult
  /** 表示用の内訳 */
  parts: {
    categoryDeficiency: number
    facilityConcentration: number
    endUrgency: number
    womenFit: number
  }
  /** 表示用の一言（監査・候補一覧） */
  reason: string
}

export function computeCandidateCoverage(input: CandidateCoverageInput): CandidateCoverageResult {
  const now = input.now ?? new Date()
  const w = input.weights ?? {}
  const wCat = w.categoryDeficiency ?? 1
  const wFac = w.facilityConcentration ?? 1
  const wEnd = w.endUrgency ?? 0.1
  const wWomen = w.womenFit ?? 0.1

  const catBonus = wCat * categoryDeficiencyBonus(input.category, input.categoryCounts7d)
  const facPenalty = wFac * facilityConcentrationPenalty(input.facilityKey, input.facilityCounts7d[input.facilityKey ?? ''] ?? 0)
  const official = officialCompleteness(input.official)
  const due = daysUntilEndScore(input.eventEndAt, now)
  const endBonus = wEnd * due.score
  const womenBonus = wWomen * targetWomenFitScore(input.targetFit)

  const bonus = catBonus + endBonus + womenBonus
  const penalty = facPenalty
  const adjust = bonus + penalty

  const bits: string[] = []
  if (catBonus > 0.001) bits.push(`不足カテゴリー +${catBonus.toFixed(2)}`)
  if (facPenalty < -0.001) bits.push(`施設集中 ${facPenalty.toFixed(2)}`)
  if (due.tier === 'ending_soon') bits.push(`終了間近（あと${due.days}日）`)
  else if (due.tier === 'expired') bits.push('終了済み')
  if (!official.finalEligible) bits.push(`公式未確認: ${official.missing.join('・')}`)

  return {
    adjust,
    bonus,
    penalty,
    official,
    daysUntilEnd: due,
    parts: {
      categoryDeficiency: catBonus,
      facilityConcentration: facPenalty,
      endUrgency: endBonus,
      womenFit: womenBonus,
    },
    reason: bits.join(' / ') || 'カバレッジ補正なし',
  }
}

// ---------------------------------------------------------------------------
// 診断：登録済み情報源／収集済み候補を 18カテゴリー・施設・エリア別に集計
// ---------------------------------------------------------------------------
export interface CoverageRow {
  category: string | null
  facilityKey: string | null
  facilityLabel: string | null
  areaKey: string | null
  sourceName: string | null
}

export interface CoverageAggregate {
  total: number
  byCategory: Record<string, number>
  byFacility: Record<string, number>
  byArea: Record<string, number>
  bySource: Record<string, number>
  /** 週次目標があるのに 収集 0 件のカテゴリー */
  missingCategories: string[]
  /** 週次目標の半分未満しか収集できていないカテゴリー */
  thinCategories: { category: string; count: number; target: number }[]
  /** 全体の3割以上を占める（＝過集中の）施設 */
  overweightFacilities: { facility: string; count: number; ratio: number }[]
}

export function aggregateCoverage(rows: CoverageRow[], opts: { target?: Record<string, number> } = {}): CoverageAggregate {
  const target = opts.target ?? CATEGORY_WEEKLY_TARGET
  const byCategory: Record<string, number> = {}
  const byFacility: Record<string, number> = {}
  const byArea: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const r of rows) {
    const cat = (r.category ?? '未確定').toUpperCase()
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
    const fac = r.facilityLabel ?? r.facilityKey ?? '(会場不明)'
    byFacility[fac] = (byFacility[fac] ?? 0) + 1
    const area = r.areaKey ?? r.facilityKey ?? '(エリア不明)'
    byArea[area] = (byArea[area] ?? 0) + 1
    const src = r.sourceName ?? '(情報源不明)'
    bySource[src] = (bySource[src] ?? 0) + 1
  }
  const total = rows.length
  const missingCategories: string[] = []
  const thinCategories: CoverageAggregate['thinCategories'] = []
  for (const [cat, tgt] of Object.entries(target)) {
    if (tgt <= 0) continue
    const count = byCategory[cat] ?? 0
    if (count === 0) missingCategories.push(cat)
    else if (count < tgt / 2) thinCategories.push({ category: cat, count, target: tgt })
  }
  const overweightFacilities = Object.entries(byFacility)
    .map(([facility, count]) => ({ facility, count, ratio: total ? count / total : 0 }))
    .filter((f) => f.ratio >= 0.3 && f.facility !== '(会場不明)')
    .sort((a, b) => b.count - a.count)
  return { total, byCategory, byFacility, byArea, bySource, missingCategories, thinCategories, overweightFacilities }
}
