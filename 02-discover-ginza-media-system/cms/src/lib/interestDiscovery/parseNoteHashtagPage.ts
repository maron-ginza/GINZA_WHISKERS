// note.com/hashtag/<tag>（ハッシュタグページ）HTMLパーサー（2026-08-27）。
//
// 【調査結果（2026-08-27、実HTML取得で確認済み、2タグで検証）】
// - 総記事数は`<div class="... text-text-secondary md:pt-0">337,601件</div>`
//   という形式で1箇所のみ表示される。件数が一定規模（実地確認では10,000）を
//   超えると`約10,000件`のように「約」が付いた概数表示になることをPhase B
//   paidRatio試験（2026-08-27）で発見——TOTAL_COUNT_REGEXは「約」の有無に
//   関わらずマッチするようにしている（概数か正確な数かは呼び出し元では
//   区別していない、今回は数値のみ扱う）。
// - 「関連タグ」は`<h2>関連タグ</h2>`直後のブロックに
//   `<a data-name="Tag" ... href="/hashtag/...">...#<!-- -->名前<!-- -->
//   (<span>件数</span>)</a>`という形式で並ぶ（明示的な順位番号は付与されていない）。
// - `?f=hot`（急上昇）・`?f=new`（新着）を付与しても、総記事数・関連タグの
//   両方とも`?f=`無し（人気=既定）の場合と完全に同一であることを確認した——
//   ハッシュタグページ単位で区別可能な「急上昇」固有データは存在しない
//   （このためnote_hashtag_risingは実装していない、fetchNoteHashtagPage.ts参照）。
//
// 既存クローラーと同じ方針でフルHTMLパーサーは導入せず、対象ブロックに絞った
// 正規表現ベースの抽出で十分と判断した。

export interface ParsedRelatedTag {
  name: string
  tagCount: number
  sourceURL: string
}

export interface ParsedNoteHashtagPage {
  totalArticleCount: number | null
  relatedTags: ParsedRelatedTag[]
}

const TOTAL_COUNT_REGEX = /text-text-secondary md:pt-0">(?:約)?([\d,]+)件<\/div>/
const RELATED_TAGS_START_MARKER = '関連タグ</h2>'
const RELATED_TAG_ITEM_REGEX =
  /<a data-name="Tag"[^>]*href="([^"]+)"[^>]*>[\s\S]*?#<!-- -->([^<]*)<!-- --> \(<span>([\d,]+)<\/span>\)<\/span><\/a>/g

function parseCount(text: string): number {
  return Number(text.replace(/,/g, ''))
}

export class NoteHashtagPageStructureError extends Error {}

export function parseNoteHashtagPage(html: string): ParsedNoteHashtagPage {
  const totalMatch = TOTAL_COUNT_REGEX.exec(html)
  const relatedStart = html.indexOf(RELATED_TAGS_START_MARKER)

  if (!totalMatch && relatedStart === -1) {
    // 両方とも見つからない＝ページ構造が大きく変わった可能性が高い。
    // 空データを正常値として保存せずエラーにする。
    throw new NoteHashtagPageStructureError(
      'note.com/hashtag/<tag>のHTMLに総記事数・関連タグのいずれも見つかりませんでした。' +
        'サイト側のHTML構造が変更された可能性があります（推測でのフォールバックは行いません）',
    )
  }

  const totalArticleCount = totalMatch ? parseCount(totalMatch[1]) : null

  const relatedTags: ParsedRelatedTag[] = []
  if (relatedStart !== -1) {
    const nextH2 = html.indexOf('<h2', relatedStart + RELATED_TAGS_START_MARKER.length)
    const block = nextH2 === -1 ? html.slice(relatedStart) : html.slice(relatedStart, nextH2)

    let match: RegExpExecArray | null
    RELATED_TAG_ITEM_REGEX.lastIndex = 0
    while ((match = RELATED_TAG_ITEM_REGEX.exec(block)) !== null) {
      const [, href, name, countText] = match
      if (!name.trim()) continue
      const sourceURL = href.startsWith('http') ? href : `https://note.com${href}`
      relatedTags.push({ name: name.trim(), tagCount: parseCount(countText), sourceURL })
    }
  }

  return { totalArticleCount, relatedTags }
}
