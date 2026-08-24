import { isNonHtmlResourcePath, isSameOrigin, normalizeArticleUrl } from './normalizeUrl'

// トップページHTMLからの個別記事・イベントリンク抽出（Stage 1、2026-08-17）。
//
// フルHTMLパーサーは導入しない——normalizeHtml.ts・fetchSource.tsと同じ
// 「素朴な正規表現ベースの処理で十分」という既存方針を踏襲する（v1スコープ、
// サイト固有ハードコードなしの汎用実装）。生HTMLはこの関数の呼び出し元
// （fetchSource.ts）がメモリ上でのみ扱い、抽出結果（URL・アンカーテキストの
// 配列）以外は一切永続化しない。

export interface DiscoveredLink {
  url: string
  anchorText: string
}

const MAX_LINKS_PER_PAGE = 15

// 記事・イベントらしいURLパスの手がかり（サイト非依存の一般的な語彙のみ）
const RELEVANT_PATH_KEYWORDS = [
  'event',
  'news',
  'exhibition',
  'notice',
  'info',
  'topics',
  'blog',
  'press',
  'release',
  'campaign',
  'fair',
  'special',
  'gallery',
]

// ナビゲーション・共通リンク（本文中の記事リンクではない）を除外するための
// アンカーテキストの手がかり
const BOILERPLATE_ANCHOR_TEXTS = new Set([
  'home',
  'top',
  'menu',
  'en',
  'jp',
  'ja',
  'english',
  '日本語',
  'privacy',
  'sitemap',
  'contact',
  'about',
  'facebook',
  'instagram',
  'twitter',
  'x',
  'youtube',
  'line',
  '会社概要',
  'お問い合わせ',
  'プライバシーポリシー',
  'サイトマップ',
])

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

function relevanceScore(url: string, anchorText: string): number {
  let score = 0
  let pathname = ''
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return -1
  }

  if (RELEVANT_PATH_KEYWORDS.some((kw) => pathname.includes(kw))) score += 3
  if (isDateLikePath(pathname)) score += 2
  if (anchorText.length >= 8) score += 1
  if (anchorText.length >= 16) score += 1

  const lowerAnchor = anchorText.trim().toLowerCase()
  if (BOILERPLATE_ANCHOR_TEXTS.has(lowerAnchor)) score -= 5
  if (anchorText.trim().length < 4) score -= 3

  // トップページ自身やルート直下1階層のみのパスは記事ではなく導線ページの
  // 可能性が高いため軽く減点（例: /news のようなインデックスページ自体）
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) score -= 5
  if (segments.length === 1 && !isDateLikePath(pathname)) score -= 1

  return score
}

export interface ExtractLinksResult {
  links: DiscoveredLink[]
  /**
   * 同一トップページ内で、既に候補として採用済みの正規化後URLへ再度到達した
   * アンカー数（表記揺れ・複数箇所からの同一記事へのリンク等による重複）。
   * 「今回のローカル検証」の重複除外件数の算出に使用する（2026-08-17）。
   */
  duplicatesRemoved: number
}

export function extractGinzaRelevantLinks(html: string, baseUrl: string): ExtractLinksResult {
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const candidates = new Map<string, { url: string; anchorText: string; score: number }>()
  let duplicatesRemoved = 0

  let match: RegExpExecArray | null
  while ((match = anchorRe.exec(html)) !== null) {
    const rawHref = match[1]
    const anchorText = stripTags(match[2])

    if (!rawHref || /^(javascript:|mailto:|tel:|#)/i.test(rawHref.trim())) continue

    const normalized = normalizeArticleUrl(rawHref, baseUrl)
    if (!normalized) continue
    if (!isSameOrigin(normalized, baseUrl)) continue
    if (normalized === normalizeArticleUrl(baseUrl, baseUrl)) continue // トップページ自身を除外
    if (isNonHtmlResourcePath(normalized)) continue // PDF/画像等のバイナリは対象外

    const score = relevanceScore(normalized, anchorText)
    if (score <= 0) continue

    const existing = candidates.get(normalized)
    if (existing) {
      duplicatesRemoved += 1
      if (score > existing.score) {
        candidates.set(normalized, { url: normalized, anchorText, score })
      }
    } else {
      candidates.set(normalized, { url: normalized, anchorText, score })
    }
  }

  const links = Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LINKS_PER_PAGE)
    .map(({ url, anchorText }) => ({ url, anchorText }))

  return { links, duplicatesRemoved }
}
