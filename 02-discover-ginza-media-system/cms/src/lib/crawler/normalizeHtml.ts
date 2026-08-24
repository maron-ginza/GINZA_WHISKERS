// SOURCE LEDGER 自動巡回：差分検知用のHTML正規化（2026-08-16、取得品質改善）。
//
// 2026-08-16の初回巡回でGINZA OFFICIAL（ginza.jp）が「変化なし」であるべき2回目の
// 巡回で`changed`と誤検知された。原因調査の結果、同一の協賛バナー群
// （<a><img/></a>の集合）がリクエストのたびに**表示順序だけランダムにシャッフル**
// されており、生バイト列のハッシュはこの並び替えにも反応してしまうことが判明した
// （実データでの検証はCLAUDE.md参照）。
//
// この正規化は特定サイト向けのハードコードではなく、「ブロック要素の集合を
// 順序に依存しない形でハッシュする」という汎用的な手法——同種の回転バナー・
// シャッフルされるスポンサー枠・カルーセル等、多くのサイトに共通するノイズ源に
// 一般的に有効な設計とした。トレードオフとして、ページ内での要素の並び順「だけ」が
// 意味を持つケース（例：ランキング順）ではその変化を検知できなくなる（既知の制約）。

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// href/src/alt/title は、要素がどのタグ種別であっても意味のある内容を運んでいる
// ことが多い汎用属性のため、これらの値だけを抽出してブロックのテキスト表現に含める
// （class/style/onClick/data-*等の見た目・トラッキング用途の属性はノイズとして除外）。
function blockToNormalizedText(block: string): string {
  const attrValues: string[] = []
  const attrRegex = /\b(?:href|src|alt|title)\s*=\s*"([^"]*)"/gi
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(block))) {
    attrValues.push(match[1])
  }
  const innerText = block.replace(/<[^>]+>/g, ' ')
  return decodeBasicEntities([innerText, ...attrValues].join(' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 差分検知専用の正規化テキストを生成する（人間向けexcerpt/titleとは別系統）。
 * 1) script/style/comment/noscriptを除去（実行のたびに変わりうるインラインJS等を排除）
 * 2) a/li/div/tr/td/p/section/article/h1-6 の開始位置で粗くブロック分割
 * 3) 各ブロックからhref/src/alt/titleと可視テキストのみを抽出し正規化
 * 4) ブロック集合を辞書順にソートしてから結合（＝要素の並び替えに対して不変）
 */
export function normalizeHtmlForDiff(html: string): string {
  const withoutVolatileBlocks = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')

  const blocks = withoutVolatileBlocks
    .split(/(?=<(?:a\s|li[\s>]|div[\s>]|tr[\s>]|td[\s>]|p[\s>]|section[\s>]|article[\s>]|h[1-6][\s>]))/i)
    .map(blockToNormalizedText)
    .filter(Boolean)

  blocks.sort()
  return blocks.join('\n')
}
