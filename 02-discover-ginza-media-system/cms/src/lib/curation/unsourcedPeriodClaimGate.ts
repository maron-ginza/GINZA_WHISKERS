// 再発防止 #5（2026-09-13、マロンの最終照合で発見——Article #64「ISHIYA G
// アイガトー」で、公式ページに記載のない販売終了日「2026年8月29日から9月16日
// まで」が本文・WHY NOW・editorialProvenanceに confirmed として記録されて
// いた）：本文中の具体的な日付レンジ（「〜月〜日から〜月〜日まで」）表現を
// 決定的に検出し、開始日・終了日それぞれが出典テキスト（DiscoveredContent
// の title/excerpt/venue 等、実際に取得できたテキスト）に literal に含まれて
// いるかを確認する。Editorial Trust Layer「推測で補完しない」の一環——
// 公式ページに明記されていない販売・開催期間を生成しない。
//
// unsourcedClaimGate.ts と同じ設計：AI 呼び出しなし・決定的・既定 WARNING
// 記録のみ（hard drop 化は誤検知率をTrialで観測してから、既存
// socialCopyGate / interestArticlePostGate と同じ規律）。

export type PeriodClaimCode = 'unsourcedPeriodClaim'

export interface PeriodClaimHit {
  phrase: string
  code: PeriodClaimCode
  unbackedPart: 'start' | 'end' | 'both'
  detail: string
}

export interface PeriodClaimGateResult {
  hits: PeriodClaimHit[]
}

// 「2026年8月29日から9月16日まで」「8月29日（土）から9月16日（水）まで」等。
// 開始日・終了日とも年は任意（省略されることが多い）、月日は必須。
// 開始日・終了日の間の曜日表記（全角/半角括弧）は無視する。
const DATE_RANGE_RE =
  /(?:\d{4}年)?(\d{1,2})月(\d{1,2})日(?:\s*[（(][日月火水木金土][）)])?\s*(?:から|〜|～|-)\s*(?:\d{4}年)?(\d{1,2})月(\d{1,2})日(?:\s*[（(][日月火水木金土][）)])?\s*まで/g

function monthDayKey(month: string, day: string): string {
  // 「8月29日」「08月29日」の表記ゆれを吸収するため数値化して比較する
  return `${Number(month)}月${Number(day)}日`
}

export function checkUnsourcedPeriodClaims(
  bodyText: string,
  backingTexts: (string | null | undefined)[],
): PeriodClaimGateResult {
  const backing = backingTexts.filter(Boolean).join('\n')
  const hits: PeriodClaimHit[] = []
  const seen = new Set<string>()

  DATE_RANGE_RE.lastIndex = 0
  for (const m of (bodyText ?? '').matchAll(DATE_RANGE_RE)) {
    const phrase = m[0].trim()
    const startKey = monthDayKey(m[1], m[2])
    const endKey = monthDayKey(m[3], m[4])
    const startBacked = backing.includes(startKey)
    const endBacked = backing.includes(endKey)
    if (startBacked && endBacked) continue

    const key = `unsourcedPeriodClaim:${phrase}`
    if (seen.has(key)) continue
    seen.add(key)

    const unbackedPart: 'start' | 'end' | 'both' =
      !startBacked && !endBacked ? 'both' : !startBacked ? 'start' : 'end'
    hits.push({
      phrase,
      code: 'unsourcedPeriodClaim',
      unbackedPart,
      detail:
        unbackedPart === 'both'
          ? `開始日「${startKey}」・終了日「${endKey}」のいずれも出典テキストに見当たらない（公式記載のない期間を生成した疑い）`
          : unbackedPart === 'start'
            ? `開始日「${startKey}」が出典テキストに見当たらない（公式記載のない期間を生成した疑い）`
            : `終了日「${endKey}」が出典テキストに見当たらない（公式記載のない期間を生成した疑い）`,
    })
  }

  return { hits }
}
