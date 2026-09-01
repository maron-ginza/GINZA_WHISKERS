// 再発防止 #1（2026-09-01 Trial）：本文中の「時間経過・残り日数・会期の位置」表現を
// computeEventTiming の決定的な数値と突き合わせ、食い違い／検証不能を検出する。
//
// 9月Trial は WARNING 記録のみ（呼び出し側で扱いを決める）。hard drop 化は
// 誤検知率を観測してから（既存 socialCopyGate / interestArticlePostGate と同じ規律）。
// AI 呼び出しなし・決定的。

import type { EventTiming } from './eventTiming'

export type TimingClaimCode = 'timingClaimMismatch' | 'timingClaimUnverifiable'

export interface TimingClaimHit {
  phrase: string
  code: TimingClaimCode
  detail: string
}

export interface TimingClaimGateResult {
  hits: TimingClaimHit[]
}

export interface TimingClaimGateOptions {
  /** 日数の許容差（既定 2日）。「約」を伴う概算表現の揺れを吸収する。 */
  toleranceDays?: number
}

const UNIT_TO_DAYS: Record<string, number> = {
  日: 1,
  週間: 7,
  週: 7,
  か月: 30,
  ヶ月: 30,
  カ月: 30,
  かげつ: 30,
}

/** 「開幕/開催/初日/スタートから N日/N週間/Nか月（過ぎた/経過）」 */
const SINCE_START_RE =
  /(?:開幕|開催|初日|スタート)から\s*(?:約|およそ)?\s*(\d+)\s*(日|週間|週|か月|ヶ月|カ月)/g
/** 「残り N日 / あと N日 / N週間」 */
const UNTIL_END_RE = /(?:残り|あと)\s*(?:約|およそ)?\s*(\d+)\s*(日|週間|週)/g
/** 「会期は（あと）半分 / 折り返し / 後半 / 終盤 / 前半 / 序盤」「折り返し（地点）」 */
const FRACTION_WORD_RE = /(?:会期(?:は|も)?\s*(?:あと)?\s*)?(半分|折り返し|後半|終盤|中盤|前半|序盤)/g
/** 「あと わずか / 少し / 数日」= 残りが少ないニュアンス */
const NEARLY_ENDED_RE = /あと\s*(わずか|少し|数日|僅か)/g

function approxDays(n: number, unit: string): number {
  return n * (UNIT_TO_DAYS[unit] ?? 1)
}

export function checkEventTimingClaims(
  bodyText: string,
  timing: EventTiming,
  options: TimingClaimGateOptions = {},
): TimingClaimGateResult {
  const tol = options.toleranceDays ?? 2
  const hits: TimingClaimHit[] = []
  const body = bodyText ?? ''

  const pushUnverifiable = (phrase: string, need: string) => {
    hits.push({
      phrase,
      code: 'timingClaimUnverifiable',
      detail: `${need}が不明なため、この時間表現は裏付けできない（確認済みの会期に接地させること）`,
    })
  }

  for (const m of body.matchAll(SINCE_START_RE)) {
    const phrase = m[0].trim()
    const claimedDays = approxDays(Number(m[1]), m[2])
    if (timing.daysSinceStart === null) {
      pushUnverifiable(phrase, '開催開始日')
      continue
    }
    if (Math.abs(claimedDays - timing.daysSinceStart) > Math.max(tol, m[2] === '日' ? tol : 7)) {
      hits.push({
        phrase,
        code: 'timingClaimMismatch',
        detail: `本文は約${claimedDays}日経過と読めるが、計算値は${timing.daysSinceStart}日`,
      })
    }
  }

  for (const m of body.matchAll(UNTIL_END_RE)) {
    const phrase = m[0].trim()
    const claimedDays = approxDays(Number(m[1]), m[2])
    if (timing.daysUntilEnd === null) {
      pushUnverifiable(phrase, '開催終了日')
      continue
    }
    if (Math.abs(claimedDays - timing.daysUntilEnd) > Math.max(tol, m[2] === '日' ? tol : 7)) {
      hits.push({
        phrase,
        code: 'timingClaimMismatch',
        detail: `本文は残り約${claimedDays}日と読めるが、計算値は${timing.daysUntilEnd}日`,
      })
    }
  }

  for (const m of body.matchAll(FRACTION_WORD_RE)) {
    const phrase = m[0].trim()
    const word = m[1]
    if (timing.elapsedFraction === null) {
      pushUnverifiable(phrase, '開催開始日と終了日の両方')
      continue
    }
    const f = timing.elapsedFraction
    let ok = true
    if (word === '半分' || word === '折り返し' || word === '中盤') ok = f >= 0.34 && f <= 0.66
    else if (word === '後半' || word === '終盤') ok = f > 0.5
    else if (word === '前半' || word === '序盤') ok = f < 0.5
    if (!ok) {
      hits.push({
        phrase,
        code: 'timingClaimMismatch',
        detail: `本文は「${word}」と書くが、経過割合は${Math.round(f * 100)}%`,
      })
    }
  }

  for (const m of body.matchAll(NEARLY_ENDED_RE)) {
    const phrase = m[0].trim()
    if (timing.daysUntilEnd === null) {
      pushUnverifiable(phrase, '開催終了日')
      continue
    }
    if (timing.daysUntilEnd > 5) {
      hits.push({
        phrase,
        code: 'timingClaimMismatch',
        detail: `「${phrase}」だが残り日数は${timing.daysUntilEnd}日ある`,
      })
    }
  }

  // フレーズ重複除去
  const seen = new Set<string>()
  return {
    hits: hits.filter((h) => {
      const key = `${h.code}:${h.phrase}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}
