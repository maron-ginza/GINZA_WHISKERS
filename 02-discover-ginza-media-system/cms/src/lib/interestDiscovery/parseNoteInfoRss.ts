// note.com/info（note公式アカウント）RSS取得用パーサー（2026-08-27）。
//
// 【なぜHTMLではなくRSSか】note.com/infoのプロフィールフィードは、記事カードの
// 実URLがNext.jsのRSC（React Server Components）ストリーミングJSONペイロード
// （`self.__next_f.push(...)`）内に埋め込まれており、初期HTML上に素朴な
// `<a href="/info/n/...">`が存在しない（2026-08-27に実HTMLを取得し確認済み）。
// 一方`https://note.com/info/rss`は標準的なRSS 2.0（title/link/pubDate/description
// を持つ`<item>`の並び）であり、大幅に堅牢——本実装ではこちらを情報源とする。
// note.com/trend（parseNoteTrendHtml.ts）のHTML取得ロジックには一切手を入れていない。
//
// 既存クローラーと同じ方針でフルXMLパーサーは導入せず、正規表現ベースの抽出で
// 十分と判断した（RSS 2.0の`<item>`構造は標準化されており、HTMLよりむしろ安定）。

export interface ParsedNoteInfoRssItem {
  title: string
  link: string
  pubDate: string | null
}

const ITEM_BLOCK_REGEX = /<item>([\s\S]*?)<\/item>/g
const TITLE_REGEX = /<title>([\s\S]*?)<\/title>/
const LINK_REGEX = /<link>([\s\S]*?)<\/link>/
const PUBDATE_REGEX = /<pubDate>([\s\S]*?)<\/pubDate>/

function stripCdata(text: string): string {
  const m = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(text.trim())
  return (m ? m[1] : text).trim()
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export class NoteInfoRssStructureError extends Error {}

export function parseNoteInfoRss(xml: string): ParsedNoteInfoRssItem[] {
  if (!/<rss[\s>]/.test(xml)) {
    throw new NoteInfoRssStructureError(
      'note.com/info/rssのレスポンスに<rss>ルート要素が見つかりませんでした。' +
        'RSSフォーマット自体が変更された可能性があります（推測でのフォールバックは行いません）',
    )
  }

  const items: ParsedNoteInfoRssItem[] = []
  let match: RegExpExecArray | null
  ITEM_BLOCK_REGEX.lastIndex = 0
  while ((match = ITEM_BLOCK_REGEX.exec(xml)) !== null) {
    const block = match[1]
    const titleMatch = TITLE_REGEX.exec(block)
    const linkMatch = LINK_REGEX.exec(block)
    const pubDateMatch = PUBDATE_REGEX.exec(block)

    if (!titleMatch || !linkMatch) {
      // title/linkはRSS 2.0の<item>における必須要素相当——欠落は構造変更の
      // 疑いが強いため、空データを正常値として扱わずエラーにする。
      throw new NoteInfoRssStructureError(
        `note.com/info/rssの<item>からtitle/linkの抽出に失敗しました（title検出=${Boolean(
          titleMatch,
        )}, link検出=${Boolean(linkMatch)}）。RSSフォーマットが変更された可能性があります`,
      )
    }

    items.push({
      title: decodeBasicEntities(stripCdata(titleMatch[1])),
      link: decodeBasicEntities(stripCdata(linkMatch[1])),
      pubDate: pubDateMatch ? stripCdata(pubDateMatch[1]) : null,
    })
  }

  return items
}
