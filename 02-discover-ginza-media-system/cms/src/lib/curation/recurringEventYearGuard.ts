// GINZA WHISKERS / Project 02（2026-09-13）— 毎年開催される定例イベントの
// 「今年の情報がまだ公開されていないのに、前年の情報を今年の候補として扱う」事故を防ぐ。
//
// 背景：マロン指示「銀茶会2026は公式情報が未公開のため、2025年情報を2026年候補として
// 扱わない」。銀茶会（ginchakai.ginza.jp）は毎年秋開催の定例イベントで、2026年
// （第24回）ページが準備中・未公開のまま2025年（第23回）の情報が公式サイトに残って
// いる状態だった（2026-09-13、朝刊実運用開始時に確認）。
//
// このガードは、既知の「定例・年次イベント」名パターンに一致する情報源について、
// 抽出された開催期間・タイトルに **明示的に現在年（または未来年）が含まれているか** を
// 確認する。含まれていなければ「今年の情報として確認できない」として除外する
// （推測で年を補完しない＝Editorial Trust Layerの原則をそのまま適用）。
//
// 対象は既知パターンのみ（銀茶会など）——通常の商品・イベント候補には一切影響しない。

export interface RecurringEventYearCheckInput {
  sourceName?: string | null
  sourceUrl?: string | null
  title?: string | null
  eventPeriod?: string | null
}

export interface RecurringEventYearCheckResult {
  /** true＝今年の情報として問題なし（対象外パターンも含む）。false＝年不明のため除外すべき */
  ok: boolean
  reason: string | null
}

// 毎年開催の定例イベントで、過去に「前年情報の使い回し」事故歴・リスクが確認されているもの。
// 新しいパターンは判明次第ここへ追加する（コード1箇所で完結、他ロジックに影響しない）。
const RECURRING_ANNUAL_EVENT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /銀茶会|ginchakai/i, label: '銀茶会' },
]

export function checkRecurringEventYearClaim(
  input: RecurringEventYearCheckInput,
  opts: { now?: Date } = {},
): RecurringEventYearCheckResult {
  const now = opts.now ?? new Date()
  const currentYear = now.getUTCFullYear()

  const sourceText = `${input.sourceName ?? ''} ${input.sourceUrl ?? ''}`
  const matched = RECURRING_ANNUAL_EVENT_PATTERNS.find((p) => p.re.test(sourceText))
  if (!matched) return { ok: true, reason: null }

  const claimText = `${input.title ?? ''} ${input.eventPeriod ?? ''}`
  const years = [...claimText.matchAll(/(20\d{2})\s*年/g)].map((m) => Number(m[1]))
  const hasCurrentOrFutureYear = years.some((y) => y >= currentYear)
  if (hasCurrentOrFutureYear) return { ok: true, reason: null }

  const pastYearNote = years.length > 0 ? `（本文中の年は ${[...new Set(years)].join('・')} のみ）` : '（年の明記なし）'
  return {
    ok: false,
    reason:
      `「${matched.label}」は毎年開催の定例イベントだが、${currentYear}年の情報として本文・期間に` +
      `明記された確認が取れない${pastYearNote}。前年情報を今年の候補として扱わない（公式記載なし）。`,
  }
}
