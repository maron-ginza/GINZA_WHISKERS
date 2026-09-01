// 再発防止 #3（2026-09-01 Trial）：HTML 文字参照（&#8211; &amp; &quot; 等）を
// タイトル・表示文・slug 生成の「前」に完全にデコードする。
//
// 背景：クローラの既存 decodeBasicEntities（fetchArticlePage.ts / normalizeHtml.ts に
// 重複実装）は &nbsp; &amp; &lt; &gt; &quot; &#39; の6種のみ対応で、
// 数値文字参照 &#8211;（en dash）や16進 &#x2013; を素通しし、
// DiscoveredContent.title にそのまま残っていた（例：「… &#8211; GINZA SIX」）。
// この汎用デコーダで名前付き＋10進＋16進をまとめてデコードする。依存追加なし。
// AI 呼び出しなし・決定的。

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  minus: '−',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  middot: '·',
  bull: '•',
  deg: '°',
  plusmn: '±',
  copy: '©',
  reg: '®',
  trade: '™',
  yen: '¥',
  euro: '€',
  pound: '£',
  cent: '¢',
  sect: '§',
  para: '¶',
  dagger: '†',
  Dagger: '‡',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  hairsp: ' ',
  shy: '',
  zwnj: '‌',
  zwj: '‍',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
}

function fromCodePointSafe(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return ''
  // サロゲート領域は無効
  if (cp >= 0xd800 && cp <= 0xdfff) return ''
  try {
    return String.fromCodePoint(cp)
  } catch {
    return ''
  }
}

/**
 * HTML 文字参照をデコードする。
 * - 16進数値参照 &#x2013; / &#X2013;
 * - 10進数値参照 &#8211;
 * - 名前付き参照（上表。未知の名前はそのまま残す）
 * 3段階を「それぞれ1パス」で処理する＝ &amp;#8211; はリテラル &#8211; になる（HTML 準拠）。
 */
export function decodeHtmlEntities(input: string): string {
  if (!input) return input
  return input
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_m, hex) => fromCodePointSafe(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => fromCodePointSafe(parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m,
    )
}

/** タイトル・表示文向け：文字参照デコード＋ NBSP を通常スペース化＋空白正規化 */
export function decodeAndNormalizeDisplayText(input: string): string {
  if (!input) return input
  return decodeHtmlEntities(input).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}
