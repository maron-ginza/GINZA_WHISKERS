// GINZA WHISKERS / Project 02（2026-09-11）— 本日記事レビュー画面のデータ整形（純粋・AI/DB/網なし）。
//
// `./p2 review-today` が、本日生成した記事下書きを1画面（承認／修正／保留）にまとめるための
// 決定的関数。推測でデータを補完しない——無い項目は「公式記載なし」を維持。

export const REVIEW_DECISIONS = ['approve', 'revise', 'hold'] as const
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]

/**
 * 記事本文（プレーンテキスト）＋タイトル＋会期から Instagram 用の短文を決定的に生成する。
 * Editorial Style Engine 項目8：情景・体験・余韻、ハッシュタグ1〜2個、note URL 誘導はしない。
 * Fact にない語は足さない（本文中の文を組み替えるだけ）。
 */
export function deriveInstagramCopy(input: {
  title: string
  bodyText: string
  hashtags: string[]
  period?: string | null
}): string {
  const body = (input.bodyText ?? '').replace(/\r/g, '')
  // 「見どころ」節の最初の実文、無ければ本文最初の実文
  const paras = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^#/.test(l) && !/^GINZA TIME EDIT|^by GINZA WHISKERS|^400年の銀座|^新しい店、|^次の銀ブラ|^※画像は記事内容/.test(l))
  const headings = new Set([
    'なぜ今、この一軒か',
    'なぜ今、見に行くか',
    '見どころ',
    '開催期間・時間・料金・会場',
    '会期・時間・会場',
    '訪問前の注意',
    '出典',
    'GINZA WHISKERSの視点',
    '挿絵注釈',
  ])
  const sentences = paras.filter((p) => !headings.has(p))
  // 「見どころ」直後の段落を優先
  const midIdx = paras.findIndex((p) => p === '見どころ')
  const lead =
    midIdx >= 0 && paras[midIdx + 1] && !headings.has(paras[midIdx + 1])
      ? paras[midIdx + 1]
      : sentences[0] ?? ''
  // 情景は1〜2文・約90字まで（Instagram は短く。列挙が続く長い2文目は落とす）。
  const firstSentence = (lead.split('。')[0] ?? lead).trim()
  const secondSentence = (lead.split('。')[1] ?? '').trim()
  const useSecond = secondSentence && firstSentence.length + secondSentence.length <= 90
  const scene =
    (useSecond ? `${firstSentence}。${secondSentence}` : firstSentence) + (firstSentence ? '。' : '')

  const periodTail = input.period && !/公式記載なし|未確認/.test(input.period) ? `${input.period}。` : ''
  const tags = (input.hashtags ?? []).slice(0, 2).join(' ')
  return [scene, periodTail, tags].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** レビュー画面 1 記事分の表示データ（HTML レンダラへ渡す形） */
export interface ReviewItem {
  articleId: number
  discoveredContentId: number | null
  bucketLabel: string
  title: string
  lead: string
  noteBody: string
  articleFacts: { label: string; value: string }[]
  officialSources: { name: string; url: string }[]
  verifiedAt: string
  xCopy: string
  instagramCopy: string
  hashtags: string[]
  illustrationCaption: string
  warnings: { code: string; message: string }[]
  notStatedFields: string[]
  status: 'ok' | 'warning' | 'blocked'
  packageFiles: { body: string; json: string }
}

/** 本文プレーンテキストから「リード文」（マストヘッド固定文を除いた最初の実段落）を取り出す */
export function extractLead(noteBody: string): string {
  const skip =
    /^(GINZA TIME EDIT|by GINZA WHISKERS|400年の銀座を、今日の私へ。|新しい店、季節の味|次の銀ブラに、私だけの銀座時間を。)/
  const headingLike = (s: string) => s.length <= 24 && !/[。.！？]$/.test(s) && !/[「」（）]/.test(s)
  for (const raw of noteBody.split('\n')) {
    const l = raw.trim()
    if (!l || skip.test(l) || headingLike(l)) continue
    return l
  }
  return ''
}

/** decision.json（POST /confirm が書く形） */
export interface ReviewDecisionFile {
  date: string
  confirmedAt: string
  decisions: Record<string, { decision: ReviewDecision; note?: string }>
}

/**
 * 転記ゲート：decision.json で当該 articleId が 'approve' のときだけ true。
 * 'revise' / 'hold' / 未決定 / ファイル無し は false。
 */
export function canTransfer(
  decisionFile: ReviewDecisionFile | null,
  articleId: number,
): { ok: boolean; reason: string } {
  if (!decisionFile) return { ok: false, reason: 'まだ「選択内容を確定」されていません（decision ファイルなし）' }
  const d = decisionFile.decisions[String(articleId)]
  if (!d) return { ok: false, reason: `Article #${articleId} の判定が確定されていません` }
  if (d.decision !== 'approve') return { ok: false, reason: `Article #${articleId} の判定は「${d.decision}」（承認のみ転記可）` }
  return { ok: true, reason: `Article #${articleId} は承認済み` }
}
