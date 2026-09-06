// イベントの開催状態判定（2026-08-17、Event Date Extraction拡張）。
// 純粋関数、Payloadに非依存。「現在開催中か、終了済みか、未来開催かを
// 判定できるようにする」（マロン指示）に対応する。
//
// 【推測しない原則の徹底】eventStartAtまたはeventEndAtの一方しか分からない
// 場合、確実に判定できる方向のみ結論を出し、それ以外は'unknown'を返す：
// - 開始日のみ判明：現在より未来なら'upcoming'（確実）。現在以降は終了日が
//   不明なため'ongoing'と断定せず'unknown'（まだ開催中か既に終了したか
//   分からない）。
// - 終了日のみ判明：現在より過去なら'ended'（確実）。現在以前は開始日が
//   不明なため'unknown'（既に始まっているか分からない）。
// - 両方判明：区間比較で確定できる。
// - 両方不明：'unknown'。
//
// 【2026-09-06、根本改善】eventEndAt が日付のみ（時刻情報なし）の場合、
// 日本時間の当日23:59:59までは開催中（'ended'にしない）として扱う
// （isPastEventEnd参照。終了時刻が明示されている場合はその時刻を優先）。

import { isPastEventEnd } from './eventEndBoundary'

export type EventStatus = 'ongoing' | 'upcoming' | 'ended' | 'unknown'

export function deriveEventStatus(
  eventStartAt: string | null | undefined,
  eventEndAt: string | null | undefined,
  now: Date,
): EventStatus {
  const start = eventStartAt ? new Date(eventStartAt) : null
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null
  const validEndIso = eventEndAt && !Number.isNaN(new Date(eventEndAt).getTime()) ? eventEndAt : null
  const nowMs = now.getTime()

  if (validStart && validEndIso) {
    if (nowMs < validStart.getTime()) return 'upcoming'
    if (isPastEventEnd(validEndIso, now)) return 'ended'
    return 'ongoing'
  }
  if (validStart && !validEndIso) {
    return nowMs < validStart.getTime() ? 'upcoming' : 'unknown'
  }
  if (!validStart && validEndIso) {
    return isPastEventEnd(validEndIso, now) ? 'ended' : 'unknown'
  }
  return 'unknown'
}

// 「近日開催で今日知る価値がある」（Daily候補C、マロン指示）の判定窓。
// 14日という値は「文化イベントを事前に知っておく実用的な範囲」としての
// 編集判断上の初期値——固定の正解があるわけではなく、運用しながら調整
// できるよう定数として1箇所にまとめている。
export const UPCOMING_WINDOW_DAYS = 14

export function isUpcomingSoon(
  eventStartAt: string | null | undefined,
  now: Date,
  windowDays: number = UPCOMING_WINDOW_DAYS,
): boolean {
  if (!eventStartAt) return false
  const start = new Date(eventStartAt)
  if (Number.isNaN(start.getTime())) return false
  const diffMs = start.getTime() - now.getTime()
  if (diffMs < 0) return false
  return diffMs <= windowDays * 24 * 60 * 60 * 1000
}
