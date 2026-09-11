// GINZA WHISKERS / Project 02（2026-09-11）— 既公開テーマの重複判定（純粋・AI/DB/網なし）。
//
// 「同一URLの重複」だけでなく、**イベント名・店舗名・開催期間・テーマの意味的重複**も判定し、
// 既に note へ公開済みのテーマを 朝刊候補・手動補完・記事生成・レビュー画面 から自動除外する。
// 過去7日ではなく **全公開履歴** を対象にする。

export interface PublishedTheme {
  /** note 記事 URL（分かれば） */
  noteUrl: string | null
  /** 公開時のタイトル */
  title: string
  /** 正規化前のイベント／催事名（分かれば） */
  eventName: string | null
  /** 会場・店舗名（分かれば） */
  venue: string | null
  /** 開催・販売期間の文字列（分かれば） */
  period: string | null
  /** 元 DiscoveredContent の id（分かれば） */
  dcId: number | null
  /** 由来（'db:publishHistory#58' / 'devlog:2026-09-01/dc-373' / 'manual:seed' 等） */
  source: string
  publishedAt: string | null
}

/** 重複判定の入力（候補側）。ArticleFacts / DiscoveredContent / 生成済み Article から作る */
export interface ThemeCandidateForDedup {
  dcId?: number | null
  title?: string | null
  eventName?: string | null
  venue?: string | null
  period?: string | null
  /** 候補が既に note URL を持っている場合（生成済み Article の publishHistory 等） */
  noteUrl?: string | null
}

export interface PublishedMatch {
  match: boolean
  reason: string
  matchedUrl: string | null
  matchedTitle: string | null
}

// ─────────────────────────── 正規化 ───────────────────────────

/** 見出し・かっこ・記号・空白を落とし、比較用の素キーにする */
export function normalizeThemeText(s: string | null | undefined): string {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .replace(/[【】「」『』（）()［］\[\]〈〉《》｜|―—\-‐・･,.、。：:;；!！?？'"’”“]/g, '')
    .replace(/\s+/g, '')
    .replace(/展$|展。$/g, '展')
    .trim()
}

/** 会場名の照合キー（施設のブレを吸収） */
export function normalizeVenue(s: string | null | undefined): string {
  return normalizeThemeText(s)
    .replace(/tokyo|東京|店$|銀座本店|本店/g, '')
    .replace(/kogeiartgallery|コウゲイアートギャラリー/g, 'kogei')
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  if (s.length === 1) out.add(s)
  return out
}

/** 文字 bigram の Jaccard 類似度（0〜1） */
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeThemeText(a)
  const nb = normalizeThemeText(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const A = bigrams(na)
  const B = bigrams(nb)
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * needle の bigram が haystack にどれだけ含まれるか（0〜1）。
 * Jaccard は文字数差が大きいと不当に低くなるため、
 * 「短い候補名が長い既公開タイトルに埋もれている」ケースの判定に使う。
 */
export function bigramCoverage(needle: string | null | undefined, haystack: string | null | undefined): number {
  const n = bigrams(normalizeThemeText(needle))
  const h = bigrams(normalizeThemeText(haystack))
  if (!n.size) return 0
  let hit = 0
  for (const g of n) if (h.has(g)) hit++
  return hit / n.size
}

// ─────────────────────────── 期間の重なり ───────────────────────────

/**
 * 「YYYY-MM-DD」「2026年9月9日」等から数値 (YYYYMMDD) の並びを拾う。
 * 「2026年9月9日〜9月14日」のように 2 つ目の年が省略されるケースは、
 * 直前に出た年で補完する（範囲の両端を確実に取る）。
 */
function periodDates(s: string | null | undefined): number[] {
  if (!s) return []
  const out: number[] = []
  let lastYear = 0
  // 年つき（YYYY[-/年]M[-/月]D）と、年なし（M[月/]D[日]）を左から順に走査
  const re = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})|(?<![\d])(\d{1,2})[月/](\d{1,2})日?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m[1]) {
      lastYear = Number(m[1])
      out.push(lastYear * 10000 + Number(m[2]) * 100 + Number(m[3]))
    } else if (lastYear) {
      out.push(lastYear * 10000 + Number(m[4]) * 100 + Number(m[5]))
    }
  }
  return out
}

/** 2つの期間文字列が「同じ／重なる」か（片方でも日付が拾えなければ false） */
export function periodsOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = periodDates(a)
  const db = periodDates(b)
  if (!da.length || !db.length) return false
  const [as, ae] = [Math.min(...da), Math.max(...da)]
  const [bs, be] = [Math.min(...db), Math.max(...db)]
  return as <= be && bs <= ae
}

// ─────────────────────────── 重複判定 ───────────────────────────

export interface ThemeMatchThresholds {
  /** イベント名の類似度でこれ以上なら重複（既定 0.62） */
  eventNameSim: number
  /** タイトルの類似度でこれ以上なら重複（既定 0.70） */
  titleSim: number
}
export const DEFAULT_THEME_THRESHOLDS: ThemeMatchThresholds = { eventNameSim: 0.62, titleSim: 0.7 }

/**
 * 候補が既公開テーマのいずれかと重複するか。
 *  1. 同一 DiscoveredContent id
 *  2. 同一 note URL（候補が既に持っている場合）
 *  3. イベント名の類似度が高い
 *  4. 会場が一致 かつ 期間が重なる（または一方に期間が無ければ会場一致＋イベント名の弱一致）
 *  5. タイトルの類似度が高い
 */
export function matchPublishedTheme(
  cand: ThemeCandidateForDedup,
  published: PublishedTheme[],
  thresholds: ThemeMatchThresholds = DEFAULT_THEME_THRESHOLDS,
): PublishedMatch {
  const candVenue = normalizeVenue(cand.venue)
  for (const p of published) {
    // 1. 同一 DC
    if (cand.dcId != null && p.dcId != null && Number(cand.dcId) === Number(p.dcId)) {
      return { match: true, reason: `同一 DiscoveredContent #${p.dcId}`, matchedUrl: p.noteUrl, matchedTitle: p.title }
    }
    // 2. 同一 note URL
    if (cand.noteUrl && p.noteUrl && cand.noteUrl.trim() === p.noteUrl.trim()) {
      return { match: true, reason: '同一 note URL', matchedUrl: p.noteUrl, matchedTitle: p.title }
    }
    // 3. イベント名
    const evSim = textSimilarity(cand.eventName, p.eventName)
    if (evSim >= thresholds.eventNameSim && (cand.eventName?.length ?? 0) >= 3) {
      return {
        match: true,
        reason: `イベント名が意味的に一致（類似度 ${evSim.toFixed(2)}）: 「${p.eventName ?? p.title}」`,
        matchedUrl: p.noteUrl,
        matchedTitle: p.title,
      }
    }
    // 4. 会場一致 ＋ 期間重なり（or 会場一致＋イベント名の弱一致）
    const pVenue = normalizeVenue(p.venue)
    const venueHit = !!candVenue && !!pVenue && (candVenue.includes(pVenue) || pVenue.includes(candVenue))
    if (venueHit) {
      if (periodsOverlap(cand.period, p.period)) {
        return { match: true, reason: `同一会場「${p.venue}」＋開催期間が重なる`, matchedUrl: p.noteUrl, matchedTitle: p.title }
      }
      // 期間の記述が弱くても、会場が一致しテーマ語が既公開タイトル／催事名に埋もれていれば重複とみなす
      const pText = `${p.title} ${p.eventName ?? ''}`
      const themeCov = Math.max(bigramCoverage(cand.eventName, pText), bigramCoverage(cand.title, pText))
      if (evSim >= 0.4 || textSimilarity(cand.title, p.title) >= 0.45 || themeCov >= 0.6) {
        return { match: true, reason: `同一会場「${p.venue}」＋テーマが近い`, matchedUrl: p.noteUrl, matchedTitle: p.title }
      }
    }
    // 5. タイトル
    const tSim = textSimilarity(cand.title, p.title)
    if (tSim >= thresholds.titleSim) {
      return { match: true, reason: `タイトルが意味的に一致（類似度 ${tSim.toFixed(2)}）: 「${p.title}」`, matchedUrl: p.noteUrl, matchedTitle: p.title }
    }
  }
  return { match: false, reason: '', matchedUrl: null, matchedTitle: null }
}

/** 候補配列を「未公開」だけに絞る（除外分は理由つきで返す） */
export function filterUnpublishedThemes<T extends ThemeCandidateForDedup>(
  candidates: T[],
  published: PublishedTheme[],
  thresholds?: ThemeMatchThresholds,
): { kept: T[]; excluded: { candidate: T; reason: string; matchedUrl: string | null; matchedTitle: string | null }[] } {
  const kept: T[] = []
  const excluded: { candidate: T; reason: string; matchedUrl: string | null; matchedTitle: string | null }[] = []
  for (const c of candidates) {
    const m = matchPublishedTheme(c, published, thresholds)
    if (m.match) excluded.push({ candidate: c, reason: m.reason, matchedUrl: m.matchedUrl, matchedTitle: m.matchedTitle })
    else kept.push(c)
  }
  return { kept, excluded }
}
