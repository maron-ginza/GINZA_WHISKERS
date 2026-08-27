// note.com/trend（サイト全体の急上昇タグ）HTMLパーサー（2026-08-27）。
//
// 既存クローラー（extractLinks.ts等）と同じ方針：フルHTMLパーサー（cheerio等）は
// 導入せず、対象ブロックを絞り込んだ上での正規表現ベースの抽出で十分と判断した
// （実HTML構造を事前に取得・確認済み——2026-08-27時点の実HTMLで検証）。
//
// 【実HTML構造（2026-08-27確認）】
//   <nav aria-label="急上昇"><ol>
//     <div role="presentation">
//       <a title="Slack Code" ... href="https://note.com/tag/Slack%20Code">
//         <span ...><span class="shrink-0 font-bold"><span>1</span></span>
//         <span class="truncate">Slack Code</span></span>
//       </a>
//     </div>
//     ...（同じ構造が続く）
//   </ol></nav>
//
// 【重要原則（マロン指示）】noteの「急上昇」判定基準（非公開）は推測・再現しない。
// ここで行うのは、noteが既に決定して表示している結果（テーマ名・明示的な順位・URL）
// を機械的に読み取るだけ——独自の順位付け・スコアリングは一切行わない。
//
// 【安全設計】HTML構造が変わりnav自体が見つからない場合は、空データを正常値として
// 返さずエラーを投げる（呼び出し元がこれを「取得失敗」として扱う）。nav自体は
// 見つかったが中身が0件だった場合は、空配列を返す——こちらは呼び出し元が
// 「0件の警告」として区別して扱う（構造破壊とは別の状態として扱うため）。

export interface ParsedNoteTrendItem {
  theme: string
  sourceURL: string
  rankPosition: number
}

const NAV_START_MARKER = '<nav aria-label="急上昇">'
const NAV_END_MARKER = '</nav>'

// <a title="...">...<span>N</span>...</a> のブロックを1件ずつ抽出する。
// タイトル属性・href・アンカー内側HTML（順位を含む）を1つのマッチで取得する。
const ANCHOR_BLOCK_REGEX = /<a title="([^"]*)"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
const RANK_SPAN_REGEX = /<span>(\d+)<\/span>/

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export class NoteTrendHtmlStructureError extends Error {}

export function parseNoteTrendHtml(html: string): ParsedNoteTrendItem[] {
  const navStart = html.indexOf(NAV_START_MARKER)
  if (navStart === -1) {
    throw new NoteTrendHtmlStructureError(
      'note.com/trendのHTMLに「急上昇」navブロックが見つかりませんでした。' +
        'サイト側のHTML構造が変更された可能性があります（推測でのフォールバックは行いません）',
    )
  }

  const navEnd = html.indexOf(NAV_END_MARKER, navStart)
  if (navEnd === -1) {
    throw new NoteTrendHtmlStructureError(
      'note.com/trendのHTMLで「急上昇」navブロックの終端（</nav>）が見つかりませんでした。' +
        'サイト側のHTML構造が変更された可能性があります',
    )
  }

  const block = html.slice(navStart, navEnd)
  const items: ParsedNoteTrendItem[] = []

  let match: RegExpExecArray | null
  ANCHOR_BLOCK_REGEX.lastIndex = 0
  while ((match = ANCHOR_BLOCK_REGEX.exec(block)) !== null) {
    const [, titleAttr, href, innerHtml] = match
    const theme = decodeBasicEntities(titleAttr).trim()
    const rankMatch = RANK_SPAN_REGEX.exec(innerHtml)

    if (!theme || !href || !rankMatch) {
      // 個別項目が期待した構造を満たさない＝構造変更の可能性が高い。
      // 一部だけ欠落したデータを正常値として保存しないよう、ここでも
      // 「空データを正常値として保存せずエラー扱いにする」原則を適用する。
      throw new NoteTrendHtmlStructureError(
        `note.com/trendの項目パースに失敗しました（theme="${theme}", href="${href}", ` +
          `rank検出=${Boolean(rankMatch)}）。サイト側のHTML構造が変更された可能性があります`,
      )
    }

    items.push({ theme, sourceURL: href, rankPosition: Number(rankMatch[1]) })
  }

  return items
}
