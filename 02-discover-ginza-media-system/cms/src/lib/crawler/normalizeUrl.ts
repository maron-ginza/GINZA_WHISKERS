// 個別記事・イベントURLの正規化（2026-08-17）。
//
// 同一記事のURL表記揺れ（大文字小文字のホスト名、末尾スラッシュ、フラグメント、
// クエリパラメータ、デフォルトポート）による重複候補を防ぐための正規化。
// サイト固有ルールは持たない汎用実装（normalizeHtml.tsと同じ設計方針）。
//
// トレードオフ（既知の制約、意図的な設計判断）：クエリパラメータは全て除去する。
// 多くのサイトでは記事の識別子はパス自体に含まれる（例: /news/2026-08-17/）ため
// 実用上問題ないが、`?id=123`のようにクエリ自体が記事IDのサイトでは、異なる
// 記事が誤って同一URLに正規化される可能性がある。今回のCore Source群では
// パスベースのURL構造が中心のため、この単純化を採用した。
//
// 将来この正規化ロジック自体を変更する場合に備え、DiscoveredContent側は
// 正規化後のURL（articleUrl、重複判定キー）だけでなく元の生URL（rawUrl）も
// 保持する設計にしている——再正規化が必要になっても生データから再現できる
// （SOURCE LEDGERのnormalizedContentHash導入時に得た教訓と同じ考え方）。

export function normalizeArticleUrl(rawUrl: string, baseUrl: string): string | null {
  let resolved: URL
  try {
    resolved = new URL(rawUrl, baseUrl)
  } catch {
    return null
  }

  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null
  }

  resolved.hash = ''
  resolved.search = ''
  resolved.hostname = resolved.hostname.toLowerCase()

  // デフォルトポートの除去（http:80 / https:443）
  if (
    (resolved.protocol === 'http:' && resolved.port === '80') ||
    (resolved.protocol === 'https:' && resolved.port === '443')
  ) {
    resolved.port = ''
  }

  // 末尾スラッシュを除去（ルートパス"/"自体は残す）
  if (resolved.pathname.length > 1 && resolved.pathname.endsWith('/')) {
    resolved.pathname = resolved.pathname.slice(0, -1)
  }

  return resolved.toString()
}

export function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

// 2026-08-17、Source Coverage拡張の実運用テストで、一覧ページ（NEWS/EVENT等）が
// PDF（IR資料・ニュースリリース）やPNG（イベントフライヤー画像）へ直接リンクして
// いるケースを実データで発見した。これらはHTMLではないため個別記事・イベント
// ページとして取得・パースする対象にならない——バイナリをUTF-8として無理に
// デコードすると不正なバイト列になり、Postgresへの書き込みが失敗する事故が
// 実際に発生した（歌舞伎座・資生堂ギャラリー・Sony Park・SEIKO HOUSE GINZAの
// 4サイトで発生、詳細はCLAUDE.md該当セッション参照）。extractLinks.ts・
// discoverListingPages.tsの両方の抽出段階で、既知の非HTML拡張子を持つURLを
// 候補から除外する（fetchArticlePage.ts/fetchListingPage.ts側のContent-Type
// チェックと合わせた二重防御——拡張子だけでは判定できないケースを後段で拾う）。
const NON_HTML_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.zip',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.mp4',
  '.mp3',
  '.csv',
]

export function isNonHtmlResourcePath(url: string): boolean {
  let pathname: string
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return false
  }
  return NON_HTML_EXTENSIONS.some((ext) => pathname.endsWith(ext))
}
