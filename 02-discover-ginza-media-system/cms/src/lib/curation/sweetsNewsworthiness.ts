// GINZA WHISKERS / Project 02（2026-09-14）— SWEETS候補の編集ゲート（新規性・話題性判定）。
// 純粋・決定的・AIなし。技術的な完全度判定（candidateCoverageScore.ts）・除外判定
// （sweetsEligibility.ts）とは別レイヤーで、「技術的に取得できた」と「編集候補として
// 旬である」を分離する（マロン指示：候補5件は技術的な取得成功であり、編集候補としては
// 未確定）。
//
// 分類は3種類：
//   'administrative' … 事務告知（消費期限シール変更・価格改定・休業案内等）。
//                       候補から完全に除外する。
//   'evergreen'       … 公開日・更新日が不明で、かつ新規性を示す語も無い常設商品。
//                        「定番候補」として別枠に保存し、朝刊候補には混ぜない。
//   'timely'          … 新規性を示す語がある、または公開日・更新日が確認できる
//                        （原則30日以内を優先）候補。朝刊候補として扱う。

const ADMINISTRATIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /消費期限[^。]{0,6}シール/, label: '消費期限シール変更の告知' },
  { re: /価格改定/, label: '価格改定の告知' },
  { re: /休業(日|のお知らせ|期間)/, label: '休業案内' },
  { re: /営業時間[^。]{0,6}変更/, label: '営業時間変更の告知' },
  { re: /掲載されました/, label: 'メディア掲載の告知（商品案内ではない）' },
  { re: /メンテナンス/, label: 'システムメンテナンスの告知' },
  { re: /個人情報の取(り)?扱い|利用規約|特定商取引/, label: '規約・法定表記ページ' },
]

// 新規性・話題性を示す語（新商品・季節限定・催事・銀座店限定・リニューアル等）。
const NOVELTY_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /新商品/, label: '新商品' },
  { re: /新発売/, label: '新発売' },
  { re: /新登場/, label: '新登場' },
  { re: /新作/, label: '新作' },
  { re: /季節限定|(春季|夏季|秋季|冬季)限定/, label: '季節限定' },
  { re: /期間限定/, label: '期間限定' },
  { re: /数量限定/, label: '数量限定' },
  { re: /限定発売/, label: '限定発売' },
  { re: /限定販売/, label: '限定販売' },
  { re: /フェア/, label: 'フェア' },
  { re: /催事/, label: '催事' },
  { re: /銀座(本)?店限定/, label: '銀座店限定' },
  { re: /銀座限定/, label: '銀座限定' },
  { re: /リニューアル/, label: 'リニューアル' },
  { re: /先行販売/, label: '先行販売' },
  { re: /特別販売/, label: '特別販売' },
  { re: /初出店/, label: '初出店' },
  { re: /コラボ/, label: 'コラボレーション' },
  { re: /登場/, label: '新登場（「登場」表記）' },
  { re: /発売開始/, label: '発売開始' },
  { re: /お披露目/, label: 'お披露目' },
]

export type SweetsNewsworthinessCategory = 'timely' | 'evergreen' | 'administrative'

export interface SweetsNewsworthinessInput {
  title?: string | null
  excerpt?: string | null
  /** DiscoveredContent.publishedAt または contentUpdatedAt（ISO日時、公式に確認できるもの） */
  publishedOrUpdatedAt?: string | null
}

export interface SweetsNewsworthinessResult {
  category: SweetsNewsworthinessCategory
  matchedAdministrative: string[]
  matchedNovelty: string[]
  /** 公開日・更新日から算出した経過日数（不明なら null） */
  daysSincePublished: number | null
  /** 30日以内か（daysSincePublishedがnullならnull） */
  withinPreferredWindow: boolean | null
  /** 監査・表示用の一言 */
  reason: string
}

/** タイトル先頭の「YYYY.MM.DD」「YYYY-MM-DD」「YYYY/MM/DD」表記から日付を拾う（推測しない・明記のみ）。 */
function extractDateFromTitlePrefix(title: string | null | undefined): string | null {
  const t = (title ?? '').trim()
  const m = t.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString()
}

export function evaluateSweetsNewsworthiness(
  input: SweetsNewsworthinessInput,
  opts: { now?: Date } = {},
): SweetsNewsworthinessResult {
  const now = opts.now ?? new Date()
  const text = `${input.title ?? ''} ${input.excerpt ?? ''}`

  const matchedAdministrative = ADMINISTRATIVE_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label)
  if (matchedAdministrative.length > 0) {
    return {
      category: 'administrative',
      matchedAdministrative,
      matchedNovelty: [],
      daysSincePublished: null,
      withinPreferredWindow: null,
      reason: `事務告知のため候補としない（${matchedAdministrative.join('・')}）`,
    }
  }

  const matchedNovelty = NOVELTY_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label)

  const confirmedDate = input.publishedOrUpdatedAt ?? extractDateFromTitlePrefix(input.title)
  let daysSincePublished: number | null = null
  let withinPreferredWindow: boolean | null = null
  if (confirmedDate) {
    const t = Date.parse(confirmedDate)
    if (Number.isFinite(t)) {
      daysSincePublished = Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000))
      withinPreferredWindow = daysSincePublished >= 0 && daysSincePublished <= 30
    }
  }

  if (matchedNovelty.length > 0) {
    const freshNote =
      daysSincePublished != null
        ? withinPreferredWindow
          ? `／公開・更新から${daysSincePublished}日（30日以内）`
          : `／公開・更新から${daysSincePublished}日（30日超）`
        : ''
    return {
      category: 'timely',
      matchedAdministrative: [],
      matchedNovelty,
      daysSincePublished,
      withinPreferredWindow,
      reason: `新規性語を確認（${matchedNovelty.join('・')}）${freshNote}`,
    }
  }

  if (confirmedDate) {
    return {
      category: 'timely',
      matchedAdministrative: [],
      matchedNovelty: [],
      daysSincePublished,
      withinPreferredWindow,
      reason: withinPreferredWindow
        ? `公開・更新日を確認（${daysSincePublished}日前、30日以内）`
        : `公開・更新日を確認（${daysSincePublished}日前、30日超のため優先度は下がる）`,
    }
  }

  return {
    category: 'evergreen',
    matchedAdministrative: [],
    matchedNovelty: [],
    daysSincePublished: null,
    withinPreferredWindow: null,
    reason: '新規性語なし・公開日不明の常設商品のため「定番候補」として別枠に保存する',
  }
}
