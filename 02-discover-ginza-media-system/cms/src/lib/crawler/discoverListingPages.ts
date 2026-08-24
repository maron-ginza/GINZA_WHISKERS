import { isNonHtmlResourcePath, isSameOrigin, normalizeArticleUrl } from './normalizeUrl'

// Source Coverage拡張：一覧ページ（NEWS/EVENT/EXHIBITION等）の自動発見
// （2026-08-17）。
//
// 【背景】実運用テスト（2026-08-17 13:30 JST）でDaily候補が0件になった。
// 原因は個別記事・イベントのURL自体を、各サイトのトップページ上のリンクからしか
// 発見できていなかったこと——トップページに載らない「一覧ページ配下の個別記事」が
// 構造的に取得漏れになっていた。本モジュールは、トップページ（および将来的には
// 一覧ページ自身）のHTML上から、NEWS/EVENT/EXHIBITION等の「記事・イベント一覧
// ページ」らしきリンクを発見する——個別記事・イベント自体の抽出はこれまで通り
// extractLinks.ts（extractGinzaRelevantLinks）が担当し、本モジュールは
// 「どのページを追加で巡回すべきか」の候補だけを返す。
//
// フルHTMLパーサー・NLPは使わない（v1スコープ、extractLinks.ts等と同じ
// 「素朴な正規表現ベースで十分」という既存方針を踏襲）。サイト固有のハード
// コードは持たない——キーワード表はユーザー指定の一般的な語彙のみで構成する。

export interface ListingPageCandidate {
  url: string
  anchorText: string
  matchedKeyword: string
}

interface ListingKeywordRule {
  /** 表示・報告用の正規化ラベル */
  keyword: string
  /** URLパスセグメント一致用（ハイフン・アンダースコア除去後の比較） */
  pathTokens: string[]
  /** アンカーテキスト一致用の正規表現（英語・日本語） */
  anchorPatterns: RegExp[]
}

const LISTING_PAGE_KEYWORDS: ListingKeywordRule[] = [
  { keyword: 'NEWS', pathTokens: ['news'], anchorPatterns: [/\bnews\b/i, /お知らせ/, /新着情報/] },
  { keyword: 'EVENT', pathTokens: ['event', 'events'], anchorPatterns: [/\bevents?\b/i, /イベント/] },
  {
    keyword: 'EXHIBITION',
    pathTokens: ['exhibition', 'exhibitions'],
    anchorPatterns: [/\bexhibitions?\b/i, /展覧会/, /催事/],
  },
  { keyword: 'TOPICS', pathTokens: ['topics'], anchorPatterns: [/\btopics\b/i] },
  {
    keyword: "WHAT'S ON",
    pathTokens: ['whatson', 'whatsonguide'],
    anchorPatterns: [/what'?s\s*on/i],
  },
  { keyword: 'INFORMATION', pathTokens: ['information', 'info'], anchorPatterns: [/\binformation\b/i] },
  { keyword: 'PRESS', pathTokens: ['press'], anchorPatterns: [/\bpress\b/i] },
  { keyword: 'CALENDAR', pathTokens: ['calendar'], anchorPatterns: [/\bcalendar\b/i] },
]

const MAX_CANDIDATES = 8

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function isDateLikePath(pathname: string): boolean {
  return /20\d{2}[-/]\d{1,2}([-/]\d{1,2})?/.test(pathname)
}

function normalizeSegment(segment: string): string {
  return segment.replace(/[-_]/g, '')
}

// 一覧ページ本体（例: /news）ではなく、日付を含む個別記事らしいパス
// （例: /news/2026/08/17/foo）まで一覧ページ候補として拾ってしまわないための
// ガード。個別記事自体はextractLinks.tsが別途拾う。
function matchListingKeyword(url: string, anchorText: string): string | null {
  let pathname: string
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return null
  }

  if (isDateLikePath(pathname)) return null

  const segments = pathname.split('/').filter(Boolean).map(normalizeSegment)

  for (const rule of LISTING_PAGE_KEYWORDS) {
    if (rule.pathTokens.some((token) => segments.includes(normalizeSegment(token)))) {
      return rule.keyword
    }
  }

  const anchor = anchorText.trim()
  if (anchor) {
    for (const rule of LISTING_PAGE_KEYWORDS) {
      if (rule.anchorPatterns.some((pattern) => pattern.test(anchor))) {
        return rule.keyword
      }
    }
  }

  return null
}

// パスの深さが浅いほど一覧ページ（ナビゲーション直下）らしい。深すぎるパスは
// 個別記事の可能性が高いため軽く減点する（除外はしない——サイトによっては
// /en/news/のように2階層が一覧ページ自体のケースもあるため）。
function depthPenalty(pathname: string): number {
  const segments = pathname.split('/').filter(Boolean)
  return Math.max(0, segments.length - 2)
}

export function discoverListingPageCandidates(html: string, baseUrl: string): ListingPageCandidate[] {
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const candidates = new Map<string, { candidate: ListingPageCandidate; score: number }>()

  let match: RegExpExecArray | null
  while ((match = anchorRe.exec(html)) !== null) {
    const rawHref = match[1]
    const anchorText = stripTags(match[2])

    if (!rawHref || /^(javascript:|mailto:|tel:|#)/i.test(rawHref.trim())) continue

    const normalized = normalizeArticleUrl(rawHref, baseUrl)
    if (!normalized) continue
    if (!isSameOrigin(normalized, baseUrl)) continue
    if (normalized === normalizeArticleUrl(baseUrl, baseUrl)) continue
    if (isNonHtmlResourcePath(normalized)) continue

    const matchedKeyword = matchListingKeyword(normalized, anchorText)
    if (!matchedKeyword) continue

    const pathname = new URL(normalized).pathname.toLowerCase()
    const score = 10 - depthPenalty(pathname)

    const existing = candidates.get(normalized)
    if (!existing || score > existing.score) {
      candidates.set(normalized, { candidate: { url: normalized, anchorText, matchedKeyword }, score })
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map(({ candidate }) => candidate)
}
