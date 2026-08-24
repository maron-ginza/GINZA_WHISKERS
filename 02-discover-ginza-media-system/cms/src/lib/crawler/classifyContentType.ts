import type { ContentType } from './discoveredContentTypes'

// 個別記事・イベントのcontentType分類（2026-08-17）。
// URLパス・タイトル・（取得できた場合）JSON-LDの@typeに基づく単純なキーワード
// ヒューリスティック。サイト固有ハードコードなしの汎用実装——heuristicScore.ts
// と同じ位置づけ（本物の分類AIではなく、参考情報としてのルールベース近似）。

const KEYWORD_RULES: Array<{ type: ContentType; keywords: string[] }> = [
  { type: 'exhibition', keywords: ['展覧会', '展示', 'exhibition', 'gallery', 'ギャラリー', '個展'] },
  { type: 'event', keywords: ['イベント', 'event', 'フェア', 'fair', '開催', 'キャンペーン', 'campaign'] },
  { type: 'news', keywords: ['news', 'お知らせ', 'news', 'notice', 'press', 'topics', 'トピックス'] },
  { type: 'food', keywords: ['グルメ', 'レストラン', 'restaurant', 'カフェ', 'cafe', 'food', 'menu', 'メニュー', 'ダイニング'] },
  { type: 'shopping', keywords: ['ショップ', 'shop', 'store', 'ブティック', 'boutique', '新作', 'collection', 'コレクション'] },
  { type: 'culture', keywords: ['文化', '歴史', 'culture', 'history', 'アート', 'art', '伝統'] },
]

export function classifyContentType(
  url: string,
  title: string,
  jsonLdType?: string | null,
): ContentType {
  if (jsonLdType) {
    const t = jsonLdType.toLowerCase()
    if (t.includes('event')) return 'event'
    if (t.includes('exhibition')) return 'exhibition'
    if (t.includes('newsarticle')) return 'news'
  }

  const haystack = `${url} ${title}`.toLowerCase()
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return rule.type
    }
  }

  return 'other'
}
