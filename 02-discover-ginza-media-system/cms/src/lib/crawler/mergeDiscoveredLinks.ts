import type { DiscoveredLink } from './extractLinks'

// トップページ由来のリンクと、複数の一覧ページ（NEWS/EVENT/EXHIBITION等）由来の
// リンクを1つに統合する（Source Coverage拡張、2026-08-17）。
//
// 個々の抽出元（extractGinzaRelevantLinks）は既にnormalizeArticleUrlで正規化
// 済みのURLを返すため、単純な文字列一致でdedupeできる——同じ記事がトップ
// ページと一覧ページの両方から見つかっても、DiscoveredContentには1行しか
// 作られない（canonical/normalized URLをそのまま重複判定キーに使う設計は
// normalizeUrl.tsから変更しない）。先に現れたページ（＝呼び出し順）の
// アンカーテキストを優先する（トップページ→一覧ページの順で渡す想定）。

export function mergeDiscoveredLinks(...groups: DiscoveredLink[][]): {
  links: DiscoveredLink[]
  duplicatesRemoved: number
} {
  const seen = new Map<string, DiscoveredLink>()
  let duplicatesRemoved = 0

  for (const group of groups) {
    for (const link of group) {
      if (seen.has(link.url)) {
        duplicatesRemoved += 1
        continue
      }
      seen.set(link.url, link)
    }
  }

  return { links: Array.from(seen.values()), duplicatesRemoved }
}
