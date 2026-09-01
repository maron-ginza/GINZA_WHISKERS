// 再発防止 #1（2026-09-01 Trial）：開催期間・経過日数・残日数を「コードで」計算する。
//
// 背景：2026-09-01 の note 下書き Trial で、生成AI（および手作業）が
// 「開幕から2週間が過ぎ、会期はあと半分です」と書いたが、実際は
// 2026-08-28 開催 / 2026-09-01 確認 ＝ 経過4日（全18日）で「あと半分」は誤り
// だった。時間経過・残り日数・割合の表現は AI に自由計算させず、この決定的
// ヘルパーが返す数値だけを使う（生成プロンプトへ数値注入する運用は §20 の
// 次工程。本ファイルは計算ロジックとその回帰テストのみ）。
//
// 既存の temporalRelevance.ts / eventStatus.ts は広く import されているため
// 触らず、別ファイルとして追加する（「開始からの経過日数」は既存には無い）。

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type EventPhase = 'not_started' | 'early' | 'mid' | 'late' | 'ended' | 'unknown'

export interface EventTiming {
  hasStart: boolean
  hasEnd: boolean
  /** 開始日から now までの経過日数（暦日ベース・四捨五入）。now < 開始日なら負値。開始日不明なら null */
  daysSinceStart: number | null
  /** now から終了日までの残り日数（暦日ベース・四捨五入）。now > 終了日なら負値。終了日不明なら null */
  daysUntilEnd: number | null
  /** 開始日〜終了日のスパン日数（終了日 − 開始日、暦日ベース）。どちらか不明なら null */
  totalDays: number | null
  /** 経過割合（daysSinceStart / totalDays）を 0〜1 にクランプ。算出不能なら null */
  elapsedFraction: number | null
  phase: EventPhase
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 時刻を無視した暦日差（b の日 − a の日）。UTC の暦日で数える（イベント日付は 00:00:00+00 保存のため） */
function calendarDayDiff(a: Date, b: Date): number {
  const au = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
  const bu = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  return Math.round((bu - au) / MS_PER_DAY)
}

export function computeEventTiming(
  startAt: string | Date | null | undefined,
  endAt: string | Date | null | undefined,
  now: Date,
): EventTiming {
  const start = toDate(startAt)
  const end = toDate(endAt)
  const hasStart = start !== null
  const hasEnd = end !== null

  const daysSinceStart = start ? calendarDayDiff(start, now) : null
  const daysUntilEnd = end ? calendarDayDiff(now, end) : null
  const totalDays = start && end ? calendarDayDiff(start, end) : null

  let elapsedFraction: number | null = null
  if (daysSinceStart !== null && totalDays !== null && totalDays > 0) {
    elapsedFraction = Math.min(1, Math.max(0, daysSinceStart / totalDays))
  }

  let phase: EventPhase
  if (!hasStart && !hasEnd) {
    phase = 'unknown'
  } else if (daysSinceStart !== null && daysSinceStart < 0) {
    phase = 'not_started'
  } else if (daysUntilEnd !== null && daysUntilEnd < 0) {
    phase = 'ended'
  } else if (elapsedFraction !== null) {
    phase = elapsedFraction < 0.34 ? 'early' : elapsedFraction < 0.67 ? 'mid' : 'late'
  } else if (daysSinceStart !== null && daysSinceStart >= 0) {
    // 終了日不明・開催中
    phase = 'early'
  } else if (daysUntilEnd !== null && daysUntilEnd >= 0) {
    // 開始日不明・終了前
    phase = 'mid'
  } else {
    phase = 'unknown'
  }

  return { hasStart, hasEnd, daysSinceStart, daysUntilEnd, totalDays, elapsedFraction, phase }
}

/** 生成AIへ渡す「確認済みの時間情報」1行。数値が無い項目は出さない（推測させない）。 */
export function formatTimingForPrompt(timing: EventTiming): string {
  const parts: string[] = []
  if (timing.daysSinceStart !== null && timing.daysSinceStart >= 0) {
    parts.push(`会期の経過: ${timing.daysSinceStart}日`)
  }
  if (timing.daysUntilEnd !== null && timing.daysUntilEnd >= 0) {
    parts.push(`会期の残り: ${timing.daysUntilEnd}日`)
  }
  if (timing.totalDays !== null && timing.totalDays > 0) {
    parts.push(`会期の全日数: ${timing.totalDays}日`)
  }
  if (parts.length === 0) return '会期の経過・残り日数: 不明（時間経過に関する表現を書かないこと）'
  return `${parts.join(' / ')}（この数値のみを使い、経過・残り・割合を自分で計算しないこと）`
}
