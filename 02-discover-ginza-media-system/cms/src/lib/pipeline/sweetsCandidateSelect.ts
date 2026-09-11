// GINZA WHISKERS / Project 02（2026-09-11）— スウィーツ候補の安定収集（純粋・決定的・AI/DB非依存）。
//
// 18カテゴリー SWEETS（provisionalCategory.ts で FOOD から分離済み）に分類された候補から、
// 毎朝「確認候補」として最大3件を決定的に選ぶ。以下を必須ハードルとして適用する：
//   ・全公開履歴との重複（alreadyPublished）は除外
//   ・公式URL・期間・場所・内容の4項目が確認できない候補（finalEligible=false）は除外
//   ・同一施設は原則1候補まで（施設分散）
// 上記を満たしたうえで、販売終了日・季節性・情報完全度・ターゲット適合度・施設分散を
// 点数化して順位づけし、上位3件を返す。3件に満たない場合は無理に埋めず、確認できた
// 本数だけを返し、不足理由と次回探索すべき公式情報源の種別を記録する。

import { seasonalSignal, currentSeason } from './dailySelectionSupport'

export interface SweetsCandidateInput {
  dcId: number
  title: string
  displayTitle?: string | null
  /** deriveProvisionalCategory の結果。'SWEETS' 以外は選定対象外 */
  category: string | null
  facilityKey: string | null
  facilityLabel: string | null
  sourceName: string
  sourceUrl: string
  venue?: string | null
  eventPeriod?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  /** candidateCoverageScore.officialCompleteness の結果（assessInboxPool が付与） */
  officialCompletenessScore?: number | null
  officialMissing?: string[] | null
  finalEligible?: boolean
  /** candidateCoverageScore.daysUntilEndScore の日数 */
  daysUntilEnd?: number | null
  targetFit?: number | null
  /** 全公開履歴との重複（publishedThemes.ts の判定結果） */
  alreadyPublished?: boolean
  publishedReason?: string | null
  /** 過去7日間にこの施設からいくつ採用されたか（history.facilityKeyCounts 等） */
  facilityCount7d?: number
}

export interface RankedSweetsCandidate {
  dcId: number
  title: string
  facilityLabel: string | null
  sourceName: string
  sourceUrl: string
  eventPeriod: string | null
  daysUntilEnd: number | null
  officialCompletenessScore: number | null
  targetFit: number | null
  score: number
  scoreParts: {
    endUrgency: number
    seasonal: number
    official: number
    targetFit: number
    facilityDiversity: number
  }
  seasonalNote: string
  reason: string
}

export interface SweetsSelectionResult {
  candidates: RankedSweetsCandidate[]
  /** 3件に満たなかったか */
  shortfall: boolean
  shortfallReason: string | null
  /** 候補不足時、次回優先して探索すべき公式情報源の種別 */
  nextSourceTypesToExplore: string[] | null
  /** 除外された候補（理由つき。監査用） */
  excluded: { dcId: number; title: string; reason: string }[]
  /** 集計：raw SWEETS 候補数・除外内訳 */
  summary: { rawSweetsCount: number; excludedPublished: number; excludedIncomplete: number; excludedFacilityCap: number }
}

// ─────────────── 公式情報源の種別分類（不足検知用） ───────────────

export const SWEETS_SOURCE_FACILITY_TYPES = [
  '銀座の路面洋菓子店',
  '和菓子店',
  '老舗菓子店',
  'ホテルの公式スイーツ情報',
  '喫茶店・カフェの公式情報',
  '百貨店の食品・催事公式情報',
  '商業施設の公式情報',
  'ブランド公式サイト・公式ニュース',
  '銀座の季節イベント公式情報',
] as const
export type SweetsSourceFacilityType = (typeof SWEETS_SOURCE_FACILITY_TYPES)[number]

/** sourceName（SOURCE LEDGER の名称）から施設種別を決定的に推定する（明記のキーワード一致のみ） */
export function classifySweetsSourceFacilityType(sourceName: string | null | undefined): SweetsSourceFacilityType | null {
  const s = (sourceName ?? '').trim()
  if (!s) return null
  if (/千疋屋|ウエスト|WEST|HIGASHIYA/i.test(s)) return '銀座の路面洋菓子店'
  if (/とらや|TORAYA|木村家|木村屋/i.test(s)) return '和菓子店'
  if (/あけぼの|菊廼舎|空也/i.test(s)) return '老舗菓子店'
  if (/帝国ホテル|ホテル|HOTEL/i.test(s)) return 'ホテルの公式スイーツ情報'
  if (/資生堂パーラー|カフェ|喫茶|パーラー/i.test(s)) return '喫茶店・カフェの公式情報'
  if (/三越|松屋銀座|百貨店/i.test(s)) return '百貨店の食品・催事公式情報'
  if (/GINZA SIX|蔦屋|Sony Park|プラザ|商業施設/i.test(s)) return '商業施設の公式情報'
  if (/和光|SEIKO HOUSE|ブランド/i.test(s)) return 'ブランド公式サイト・公式ニュース'
  if (/GINZA OFFICIAL|中央区観光|GO TOKYO|季節/i.test(s)) return '銀座の季節イベント公式情報'
  return null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function endUrgencyScore(days: number | null | undefined): number {
  if (days == null) return 0.4
  if (days < 0) return 0
  if (days <= 3) return 1
  if (days <= 10) return 0.8
  if (days <= 30) return 0.55
  return 0.35
}

function targetFitNorm(tf: number | null | undefined): number {
  if (tf == null) return 0.4
  return clamp((tf - 10) / 60, 0, 1)
}

export interface SweetsSelectOptions {
  now?: Date
  /** 返す最大件数（既定3） */
  maxCandidates?: number
  weights?: { endUrgency?: number; seasonal?: number; official?: number; targetFit?: number }
}

export function selectSweetsCandidates(
  inputs: SweetsCandidateInput[],
  opts: SweetsSelectOptions = {},
): SweetsSelectionResult {
  const now = opts.now ?? new Date()
  const max = opts.maxCandidates ?? 3
  const w = {
    endUrgency: opts.weights?.endUrgency ?? 0.25,
    seasonal: opts.weights?.seasonal ?? 0.2,
    official: opts.weights?.official ?? 0.25,
    targetFit: opts.weights?.targetFit ?? 0.3,
  }

  const excluded: SweetsSelectionResult['excluded'] = []
  let excludedPublished = 0
  let excludedIncomplete = 0
  let excludedFacilityCap = 0

  const sweetsOnly = inputs.filter((c) => (c.category ?? '').toUpperCase() === 'SWEETS')
  const rawSweetsCount = sweetsOnly.length

  const pool: (SweetsCandidateInput & { score: number; scoreParts: RankedSweetsCandidate['scoreParts']; seasonalNote: string })[] = []

  for (const c of sweetsOnly) {
    if (c.alreadyPublished) {
      excluded.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, reason: `既公開テーマとの重複（${c.publishedReason ?? '全公開履歴と一致'}）` })
      excludedPublished++
      continue
    }
    if (c.finalEligible === false) {
      excluded.push({
        dcId: c.dcId,
        title: c.displayTitle ?? c.title,
        reason: `公式情報の完全度不足（未確認: ${(c.officialMissing ?? ['公式URL/期間/場所/内容']).join('・')}）`,
      })
      excludedIncomplete++
      continue
    }
    const due = endUrgencyScore(c.daysUntilEnd)
    const seas = seasonalSignal(c.title ?? '', now)
    const seasScore = seas.cityWide ? 1 : seas.inSeason ? 0.8 : seas.season ? 0.3 : 0.5
    const off = c.officialCompletenessScore ?? 0
    const tf = targetFitNorm(c.targetFit)
    const score = w.endUrgency * due + w.seasonal * seasScore + w.official * off + w.targetFit * tf
    pool.push({
      ...c,
      score,
      scoreParts: { endUrgency: due, seasonal: seasScore, official: off, targetFit: tf, facilityDiversity: 0 },
      seasonalNote: seas.note,
    })
  }

  // 同一施設は原則1候補まで（施設分散）：施設キーごとに最良スコアの1件だけ残す
  pool.sort((a, b) => b.score - a.score)
  const seenFacility = new Set<string>()
  const afterFacilityCap: typeof pool = []
  for (const c of pool) {
    const fk = c.facilityKey ?? `title:${c.title}`
    if (seenFacility.has(fk)) {
      excluded.push({ dcId: c.dcId, title: c.displayTitle ?? c.title, reason: `施設「${c.facilityLabel ?? fk}」から既に1件採用済み（同一施設は原則1候補まで）` })
      excludedFacilityCap++
      continue
    }
    seenFacility.add(fk)
    afterFacilityCap.push(c)
  }

  const top = afterFacilityCap.slice(0, max)
  const candidates: RankedSweetsCandidate[] = top.map((c) => ({
    dcId: c.dcId,
    title: c.displayTitle ?? c.title,
    facilityLabel: c.facilityLabel ?? null,
    sourceName: c.sourceName,
    sourceUrl: c.sourceUrl,
    eventPeriod: c.eventPeriod ?? null,
    daysUntilEnd: c.daysUntilEnd ?? null,
    officialCompletenessScore: c.officialCompletenessScore ?? null,
    targetFit: c.targetFit ?? null,
    score: c.score,
    scoreParts: c.scoreParts,
    seasonalNote: c.seasonalNote,
    reason: `score ${c.score.toFixed(2)}（終了緊急度 ${c.scoreParts.endUrgency.toFixed(2)} / 季節性 ${c.scoreParts.seasonal.toFixed(2)} / 公式完全度 ${c.scoreParts.official.toFixed(2)} / 女性適合 ${c.scoreParts.targetFit.toFixed(2)}）`,
  }))

  const shortfall = candidates.length < max
  let shortfallReason: string | null = null
  let nextSourceTypesToExplore: string[] | null = null
  if (shortfall) {
    shortfallReason =
      `SWEETS分類の生候補 ${rawSweetsCount} 件のうち、既公開重複 ${excludedPublished} 件・` +
      `公式情報不完全 ${excludedIncomplete} 件・施設偏り(同一施設2件目以降) ${excludedFacilityCap} 件を除外した結果、` +
      `確認候補は ${candidates.length} 件（目標3件）にとどまった。`
    const coveredTypes = new Set(
      sweetsOnly.map((c) => classifySweetsSourceFacilityType(c.sourceName)).filter((t): t is SweetsSourceFacilityType => t != null),
    )
    const missingTypes = SWEETS_SOURCE_FACILITY_TYPES.filter((t) => !coveredTypes.has(t))
    nextSourceTypesToExplore = missingTypes.length > 0 ? missingTypes : [...SWEETS_SOURCE_FACILITY_TYPES]
  }

  return {
    candidates,
    shortfall,
    shortfallReason,
    nextSourceTypesToExplore,
    excluded,
    summary: { rawSweetsCount, excludedPublished, excludedIncomplete, excludedFacilityCap },
  }
}

// 季節を伴わないダミー export（季節ロジックを外部から直接使いたい呼び出し元向け）
export { currentSeason }
