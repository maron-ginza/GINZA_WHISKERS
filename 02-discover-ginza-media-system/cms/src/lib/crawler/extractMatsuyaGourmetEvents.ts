// GINZA WHISKERS / Project 02（2026-09-16続き8、マロン指示：銀座三越・松屋銀座の
// 公式デパ地下情報を6時収集へ正しく接続する）
//
// 松屋銀座「グルメ」一覧ページ（Storyblokスラッグ ginza/events/gourmet）のcontent
// JSONから、個別の催事・フェア・商品紹介ページ（/jp/ginza/events/配下）のURLを
// 一覧化する純粋関数（ネットワークなし）。一覧ページ全体を1件として保存せず、
// 個別ページ単位に分割するためのdiscovery層。
//
// column（コラム記事）・restaurant（レストランガイド）・services（宅配サービス）
// 等、催事・商品情報ではないリンクは対象外にする（推測でイベント扱いしない）。

export interface DiscoveredGourmetEventLink {
  /** Storyblok API呼び出し用スラッグ（例: "ginza/events/food/sweets/ginza20260916"） */
  slug: string
  /** 表示・保存用のフルURL */
  url: string
}

function collectCachedUrls(node: unknown, out: Set<string>): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectCachedUrls(item, out)
    return
  }
  const obj = node as Record<string, unknown>
  const cachedUrl = obj.cached_url
  if (typeof cachedUrl === 'string' && cachedUrl.length > 0) out.add(cachedUrl)
  for (const key of Object.keys(obj)) {
    if (key === 'cached_url') continue
    collectCachedUrls(obj[key], out)
  }
}

/** cached_url（"/jp/ginza/events/..." または完全URL）をStoryblok APIスラッグへ正規化する。 */
function toSlug(cachedUrl: string): string | null {
  let path = cachedUrl
  const httpMatch = path.match(/^https?:\/\/[^/]+(\/.*)$/)
  if (httpMatch) path = httpMatch[1]
  path = path.replace(/^\/+/, '').replace(/^jp\//, '')
  if (!path.startsWith('ginza/events/')) return null
  // column（コラム記事）・restaurant（レストランガイド）等、催事・商品ページで
  // ないものは対象外（このディレクトリ配下には現れないため、通常は素通り）。
  return path
}

export function discoverMatsuyaGourmetEventLinks(gourmetStoryContent: unknown): DiscoveredGourmetEventLink[] {
  const cachedUrls = new Set<string>()
  collectCachedUrls(gourmetStoryContent, cachedUrls)

  const seen = new Set<string>()
  const out: DiscoveredGourmetEventLink[] = []
  for (const raw of cachedUrls) {
    const slug = toSlug(raw)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push({ slug, url: `https://www.matsuyaginza.com/jp/${slug}` })
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

/**
 * 個別イベントページのタイトルを決める（推測しない・実在するテキストのみ使う）。
 * story.name がスラッグそのまま／数字のみ等の低品質な場合、平坦化した本文の
 * 最初の非空行（多くの場合は見出し）で補う。どちらも使えなければ null を返す
 * （呼び出し元がスラッグ由来の仮タイトルを使うか判断する）。
 */
export function pickMatsuyaEventTitle(storyName: string, flattenedBody: string): string | null {
  const looksLikeRawSlug = /^[a-zA-Z0-9-]+$/.test(storyName.trim()) || /^\d+$/.test(storyName.trim())
  if (storyName.trim() && !looksLikeRawSlug) return storyName.trim()
  const firstLine = flattenedBody
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (firstLine) return firstLine
  return storyName.trim() || null
}
