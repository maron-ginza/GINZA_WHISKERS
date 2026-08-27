import type { Payload } from 'payload'

import { computeCharBigramJaccardSimilarity } from '../curation/textSimilarity'
import { normalizeThemeKey } from './normalizeThemeKey'
import type { InterestConfidence, InterestSourceType } from './types'

// Project 02-2 Phase A統合ロジック：Interest Score計算（2026-08-27、マロン承認済み方針）。
//
// 【このスコアが表すもの（重要、マロン指示）】「人気そのもの」でも「収益性」でも
// ない。noteの内部人気ロジックを一切推測せず、あくまで「note上でのInterest
// Signalが、どの程度複数の根拠・鮮度・継続性をもって確認されたか」を表す
// GINZA WHISKERS側の読み取り確度の集約値。
//
// 【承認済み方針の反映】
// 1. Signal Weight＝confidence比例配分——sourceType自体には重みを持たせない。
//    各InterestThemesレコードのconfidence（＝「GINZA WHISKERS側がそのSignalを
//    どの程度確実に読み取れているか」、note自身の確度ではない）だけを重みにする。
// 2. Cross-source overlap＝正規化後に同一themeが異なるsourceTypeで確認された
//    場合のみ加点。同一sourceType内の複数観測（例：note_risingが別日に
//    再観測された）は加点しない——sourceTypeの「種類数」のみを見る。
// 3. Freshness＝直近観測ほど高く緩やかに減衰。sourceTypeごとに減衰速度を変える
//    （note_rising＝瞬間的シグナルのため急減衰、note_hashtag_popularは総数が
//    短期間でほぼ動かないためほぼ減衰なし、note_official_topicは継続企画の
//    ため中間的な緩やかな減衰——「開催中か」の不確実性は減衰ではなくconfidence
//    側で表現済みのため、ここで二重に減点しない）。
// 4. Persistence bonus＝今回は観測初日のため常に0（複数日分のデータが
//    蓄積されてから有効化する、マロン指示）。
// 5. Confidence＝クラスタ単位では「独立したsourceTypeでの確認が増えるほど
//    信頼できる」という考えで、最低confidenceを基準にK≥2なら1段階引き上げる。

const CONFIDENCE_WEIGHT: Record<InterestConfidence, number> = { high: 1.0, medium: 0.6, low: 0.3 }
const CONFIDENCE_ORDER: InterestConfidence[] = ['low', 'medium', 'high']

// overlap bonus：sourceType種類数(K)に応じた逓減乗数。2026-08-27の統合設計
// レポートで提示した初期値をそのまま採用——今回のマロン承認は「仕組み」
// （異なるsourceTypeでの確認のみ加点）であり、この具体的な数値自体は
// 実データでK≥2の事例が出た際に改めて調整対象とする（未確定の初期値である旨、
// report側にも明記する）。
const OVERLAP_BONUS_BY_SOURCE_COUNT: Record<number, number> = { 1: 1.0, 2: 1.3, 3: 1.6 }

// sourceTypeごとのfreshness減衰テーブル（capturedAtからの経過日数→係数）。
// 日数の閾値・係数はいずれも初期提案であり、確定値ではない。
type DecayTier = { maxDays: number; factor: number }

const RISING_DECAY: DecayTier[] = [
  { maxDays: 0, factor: 1.0 },
  { maxDays: 2, factor: 0.6 },
  { maxDays: 7, factor: 0.3 },
  { maxDays: Infinity, factor: 0.1 },
]

const HASHTAG_POPULAR_DECAY: DecayTier[] = [
  { maxDays: 7, factor: 1.0 },
  { maxDays: 30, factor: 0.9 },
  { maxDays: Infinity, factor: 0.7 },
]

const OFFICIAL_TOPIC_DECAY: DecayTier[] = [
  { maxDays: 7, factor: 1.0 },
  { maxDays: 21, factor: 0.8 },
  { maxDays: 45, factor: 0.6 },
  { maxDays: Infinity, factor: 0.4 },
]

const DECAY_TABLE: Record<InterestSourceType, DecayTier[]> = {
  note_rising: RISING_DECAY,
  note_hashtag_popular: HASHTAG_POPULAR_DECAY,
  note_official_topic: OFFICIAL_TOPIC_DECAY,
  note_popular: RISING_DECAY, // 未使用の予約値。仮にレコードが存在した場合の安全側フォールバック
  external_trend: RISING_DECAY, // 同上（Priority 3未着手）
}

function daysSince(capturedAt: string, now: Date): number {
  const captured = new Date(capturedAt)
  const diffMs = now.getTime() - captured.getTime()
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)))
}

function freshnessFactor(sourceType: InterestSourceType, days: number): number {
  const tiers = DECAY_TABLE[sourceType] ?? RISING_DECAY
  for (const tier of tiers) {
    if (days <= tier.maxDays) return tier.factor
  }
  return tiers[tiers.length - 1].factor
}

// 「NFKC等の安全な正規化は自動、意味的な近似統合は人間承認後のみ」の方針
// （近似判定のみ行い、自動統合はしない）。1文字テーマはバイグラムが
// 生成できずJaccard類似度が常に0になるため、包含関係チェックで補う
// （2026-08-27の設計検討で「旅」→「旅行」を実データで検証済み）。
const NEAR_DUPLICATE_JACCARD_THRESHOLD = 0.4

function isNearDuplicate(a: string, b: string): boolean {
  if (a === b) return false
  if (a.includes(b) || b.includes(a)) return true
  return computeCharBigramJaccardSimilarity(a, b) >= NEAR_DUPLICATE_JACCARD_THRESHOLD
}

export interface RawInterestThemeRecord {
  theme: string
  sourceType: InterestSourceType
  confidence: InterestConfidence
  capturedAt: string
}

export interface InterestScoreRow {
  normalizedTheme: string
  originalTheme: string
  sourceTypes: InterestSourceType[]
  sourceCount: number
  confidence: InterestConfidence
  freshness: { mostRecentDaysAgo: number; factorOfMostRecent: number }
  overlapBonus: number
  persistenceBonus: number
  totalInterestScore: number
  humanReviewNeeded: boolean
  nearDuplicateCandidates: string[]
}

function aggregateConfidence(confidences: InterestConfidence[], sourceCount: number): InterestConfidence {
  const minLevel = confidences.reduce(
    (min, c) => (CONFIDENCE_ORDER.indexOf(c) < CONFIDENCE_ORDER.indexOf(min) ? c : min),
    confidences[0],
  )
  if (sourceCount < 2) return minLevel
  const idx = CONFIDENCE_ORDER.indexOf(minLevel)
  return CONFIDENCE_ORDER[Math.min(idx + 1, CONFIDENCE_ORDER.length - 1)]
}

// 読み取り専用——DB書き込みは一切行わない（`./p2 interest score`のCLI実装から
// 呼び出される、Project 02-2 Phase A統合ロジックの最小実装）。
export async function computeInterestScore(payload: Payload, now: Date = new Date()): Promise<InterestScoreRow[]> {
  const { docs } = await payload.find({
    collection: 'interest-themes',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const records: RawInterestThemeRecord[] = docs.map((d) => ({
    theme: String(d.theme),
    sourceType: d.sourceType as InterestSourceType,
    confidence: d.confidence as InterestConfidence,
    capturedAt: String(d.capturedAt),
  }))

  return computeInterestScoreFromRecords(records, now)
}

// payload.findから切り離した純粋なコア計算部分——DBアクセスなしで単体検証できる
// ようにexportする（テスト専用の一時スクリプトから利用、testWeeklySoundtrackSelection.ts
// と同じ「テスト用にロジック本体を分離する」方針を踏襲）。
export function computeInterestScoreFromRecords(
  records: RawInterestThemeRecord[],
  now: Date = new Date(),
): InterestScoreRow[] {
  const clusters = new Map<string, RawInterestThemeRecord[]>()
  for (const r of records) {
    const key = normalizeThemeKey(r.theme)
    const bucket = clusters.get(key)
    if (bucket) bucket.push(r)
    else clusters.set(key, [r])
  }

  const normalizedThemes = Array.from(clusters.keys())

  const rows: InterestScoreRow[] = []
  for (const [normalizedTheme, members] of clusters.entries()) {
    const sourceTypes = Array.from(new Set(members.map((m) => m.sourceType)))
    const sourceCount = sourceTypes.length

    let rawScore = 0
    let mostRecentDays = Infinity
    let mostRecentFactor = 0
    for (const m of members) {
      const days = daysSince(m.capturedAt, now)
      const factor = freshnessFactor(m.sourceType, days)
      rawScore += CONFIDENCE_WEIGHT[m.confidence] * factor
      if (days < mostRecentDays) {
        mostRecentDays = days
        mostRecentFactor = factor
      }
    }

    const overlapBonus = OVERLAP_BONUS_BY_SOURCE_COUNT[sourceCount] ?? OVERLAP_BONUS_BY_SOURCE_COUNT[3]
    // 「今回はまだ観測初日のため、継続観測ボーナスは0として扱う」（マロン指示）。
    const persistenceBonus = 0
    const totalInterestScore = rawScore * overlapBonus + persistenceBonus

    const confidence = aggregateConfidence(
      members.map((m) => m.confidence),
      sourceCount,
    )

    const nearDuplicateCandidates = normalizedThemes.filter(
      (other) => other !== normalizedTheme && isNearDuplicate(normalizedTheme, other),
    )

    rows.push({
      normalizedTheme,
      originalTheme: members[0].theme,
      sourceTypes,
      sourceCount,
      confidence,
      freshness: { mostRecentDaysAgo: mostRecentDays, factorOfMostRecent: mostRecentFactor },
      overlapBonus,
      persistenceBonus,
      totalInterestScore,
      humanReviewNeeded: confidence === 'low' || nearDuplicateCandidates.length > 0,
      nearDuplicateCandidates,
    })
  }

  return rows.sort((a, b) => b.totalInterestScore - a.totalInterestScore)
}
