// 代表画像URLの抽出（OGP等、2026-08-18、Daily Ranking施設偏り抑制の次工程）。
//
// 【目的】DiscoveredContent（個別記事・イベント）のStage 2取得時に、その
// 記事・イベントを代表する画像候補を構造的に取得し、将来のEditor's Choice・
// note記事生成・SNS展開で利用できるようにする。
//
// 【設計方針（マロン指示）】
// ・og:image（および og:image:url / og:image:secure_url の別名）を
//   最優先候補とする。
// ・見つからない場合のみ twitter:image（twitter:image:src の別名、および
//   一部サイトが誤って name ではなく property で書くケースも許容）を
//   fallback候補として試す。
// ・相対URLは記事ページ自身のURL（pageUrl）を基準に絶対URLへ正規化する。
//   http(s)以外のスキーム（data:等）・不正なURLはnullのまま返す。
// ・画像が取得できない場合でも例外を投げない——他の抽出関数
//   （extractStructuredDates.ts等）と同じ「推測しない・失敗させない」原則。
// ・画像ファイル自体のダウンロード・保存は行わない。URLの取得・保持のみ
//   （著作権上の利用可否判定は本モジュールのスコープ外）。
//
// フルHTMLパーサーは使わない（v1スコープ、extractStructuredDates.ts等と
// 同じ「素朴な正規表現ベースで十分」という既存の方針を踏襲）。

export type ImageUrlSource = 'og_image' | 'twitter_image' | null

export interface ImageUrlResult {
  value: string | null
  source: ImageUrlSource
}

export function emptyImageUrlResult(): ImageUrlResult {
  return { value: null, source: null }
}

// extractStructuredDates.tsのfindMetaContentと同じパターン——meta要素の
// 属性順（property/nameが先か、contentが先か）はサイトによって異なるため、
// 両方の並びに対応する正規表現を用意する。
function findMetaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) return m[1]
  }
  return null
}

function toAbsoluteImageUrl(candidate: string, pageUrl: string): string | null {
  const trimmed = candidate.trim()
  if (!trimmed) return null
  try {
    const resolved = new URL(trimmed, pageUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.toString()
  } catch {
    return null
  }
}

export function extractRepresentativeImageUrl(html: string, pageUrl: string): ImageUrlResult {
  const ogImageRaw = findMetaContent(html, [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i,
  ])
  if (ogImageRaw) {
    const absolute = toAbsoluteImageUrl(ogImageRaw, pageUrl)
    if (absolute) return { value: absolute, source: 'og_image' }
  }

  const twitterImageRaw = findMetaContent(html, [
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    // 一部サイトはtwitter:imageをname属性ではなくproperty属性で誤って
    // 記述している（og:*と混同している）ケースが実データで見られるため、
    // fallbackとしてこちらも許容する。
    /<meta[^>]+property=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:image(?::src)?["']/i,
  ])
  if (twitterImageRaw) {
    const absolute = toAbsoluteImageUrl(twitterImageRaw, pageUrl)
    if (absolute) return { value: absolute, source: 'twitter_image' }
  }

  return emptyImageUrlResult()
}
