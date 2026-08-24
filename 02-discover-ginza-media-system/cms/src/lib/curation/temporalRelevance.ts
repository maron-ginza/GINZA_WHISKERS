import { deriveEventStatus } from './eventStatus'

// Temporal Relevance（今日との時間的関連性、2026-08-18）。
//
// 【目的（マロン指示）】「旬の銀座」の候補を、イベント自体の品質だけでなく
// 「いつ体験できるのか」という観点でEditor's Choiceの判断材料にする。
//
// 【重要な設計原則（マロン指示・シミュレーション結果を踏まえた確定方針）】
// ・Editorial Scoreには一切影響しない・加点/減点は行わない——ランキングの
//   並び順（Editorial Score降順→施設多様性調整）には一切関与しない、
//   純粋な参考情報として提供する（facilityDiversity.ts適用後の結果に対し、
//   さらに後段で表示用に計算するだけ）。
// ・将来イベントを低品質とは判定しない——LATER/NEXTは「悪い」ではなく
//   「まだ先」という時間的性質を示すだけ。
// ・日付が不明な場合は推測しない——'unknown'を返す（本プロジェクト全体の
//   「推測しない」原則、eventStatus.tsと同じ）。
// ・シミュレーション（2026-08-18、模擬Editor's Choice運用）で「採用」判断
//   5件が全件NOWタイアと一致する一方、#10（SOON、開始まで1日）は
//   Content Richness＝boilerplateを理由に「却下」されたことを確認済み
//   ——Temporal Relevance単体では採否を予測できず、他の指標（Content
//   Richness等）と並記する補助指標としてのみ有効、という評価に基づき、
//   スコアリングへの組み込みは行わない設計とした。
//
// 【判定方式】既存のderiveEventStatus（eventStatus.ts）の結果を再利用する
// （日付妥当性チェックを重複実装しない）。
//   ongoing → 'now'
//   ended   → 'expired'
//   upcoming → 開始日までの日数で 'soon'(1〜7日) / 'next'(8〜14日) /
//              'later'(15日以上) に細分化
//   unknown → 'unknown'（開催日情報が不十分で判定できない）
// 単日イベント（eventStartAt===eventEndAt）は「開始日までの日数」を
// そのまま使う——マロン指示どおり、単日イベントは開催日までの日数を重視する。

export type TemporalRelevanceTier = 'now' | 'soon' | 'next' | 'later' | 'expired' | 'unknown'

export const TEMPORAL_RELEVANCE_TIERS: TemporalRelevanceTier[] = [
  'now',
  'soon',
  'next',
  'later',
  'expired',
  'unknown',
]

export const TEMPORAL_RELEVANCE_LABELS: Record<TemporalRelevanceTier, string> = {
  now: 'NOW（現在開催中・体験可能）',
  soon: 'SOON（1〜7日以内に開始）',
  next: 'NEXT（8〜14日以内に開始）',
  later: 'LATER（15日以上先）',
  expired: 'EXPIRED（終了済み）',
  unknown: '不明（開催日情報が不十分）',
}

export interface TemporalRelevanceResult {
  tier: TemporalRelevanceTier
  /** 開始日までの日数（'soon'/'next'/'later'のときのみ、切り上げ） */
  daysUntilStart: number | null
  /** 終了日までの日数（'now'のときのみ、終了日が判明していれば、切り上げ） */
  daysUntilEnd: number | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY)
}

export function deriveTemporalRelevance(
  eventStartAt: string | null | undefined,
  eventEndAt: string | null | undefined,
  now: Date,
): TemporalRelevanceResult {
  const status = deriveEventStatus(eventStartAt, eventEndAt, now)

  if (status === 'ongoing') {
    const end = eventEndAt ? new Date(eventEndAt) : null
    const daysUntilEnd = end && !Number.isNaN(end.getTime()) ? daysBetween(now, end) : null
    return { tier: 'now', daysUntilStart: null, daysUntilEnd }
  }

  if (status === 'ended') {
    return { tier: 'expired', daysUntilStart: null, daysUntilEnd: null }
  }

  if (status === 'upcoming') {
    // deriveEventStatusが'upcoming'を返す時点でeventStartAtの妥当性
    // （有効な日付かつnowより未来）は保証済み——ここでの再検証は不要。
    const start = new Date(eventStartAt as string)
    const daysUntilStart = daysBetween(now, start)
    const tier: TemporalRelevanceTier = daysUntilStart <= 7 ? 'soon' : daysUntilStart <= 14 ? 'next' : 'later'
    return { tier, daysUntilStart, daysUntilEnd: null }
  }

  return { tier: 'unknown', daysUntilStart: null, daysUntilEnd: null }
}
