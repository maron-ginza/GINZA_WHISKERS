// GINZA WHISKERS / Project 02（2026-09-09）— 記事下書きの共通・後処理品質調整（決定的・AIなし）。
//
// renderArticleFromTemplate の全テンプレート（sale / exhibition / recurring_event / generic）が
// 生成したタイトル候補・本文ブロック・ハッシュタグへ一律に適用する後処理。
// DC 個別の例外処理は作らない。
//
//   1. ハッシュタグを既存タグ保持のまま重複なしで必ず4個に補完（会場・ブランド・カテゴリー由来）
//   2. 「AMBUSH® × New Era®」等のブランドコラボ名と × / x 記号前後の空白を正規化
//   3. 「秋の秋の」等の隣接語句の重複を検出して除去
//   4. undefined / null / [object Object] / atRelated 等の旧フィールド由来の断片・空括弧を除去
//
// すべて純粋関数（同じ入力→同じ出力）。ネットワーク・DB・AI に触れない。
//
// 5.（2026-09-10）note 冒頭マストヘッド固定文（「GINZA TIME EDIT / by GINZA WHISKERS …」）は
//    note 転記レイヤー（buildNoteDraftPackage）で冒頭へ前置する要素であり、CMS の記事本文
//    （Articles.body）には保存しない。生成物に万一混入した場合は stripMasthead で除去する。

import { stripMasthead } from '../note/noteMasthead'

const CROSS = '×' // ×

// ── 2. ブランドコラボ名／× 記号の空白正規化 ──────────────────────────────
/**
 * 「A×B」「A ✕ B」「AMBUSH® x New Era®」等を「A × B」（U+00D7・前後に半角スペース1つ）へ。
 *  ・実際のクロス記号（× ✕ ✖ ╳ ☓）は前後空白を正規化するだけ。
 *  ・半角/全角 x は「両側に空白がある＝語の区切り」のときだけ置換（"box" 等の語中 x は触らない）。
 */
export function normalizeBrandCollab(input: string): string {
  if (typeof input !== 'string' || input === '') return input
  let out = input
  out = out.replace(/[ 　]*[×✕✖╳☓][ 　]*/g, ` ${CROSS} `)
  out = out.replace(/(\S)[ 　]+[xXｘＸ][ 　]+(\S)/g, `$1 ${CROSS} $2`)
  return out.replace(/[ 　]{2,}/g, ' ').trim()
}

// ── 3. 隣接語句の重複除去 ────────────────────────────────────────────────
/**
 * 直後に同じ語句が繰り返される箇所を1つに畳む。
 *  ・句読点・記号の連続（「。。」→「。」）
 *  ・漢字を含む 2〜8 文字の語の即時反復（「秋の秋の」→「秋の」／間の空白は許容）
 *  ・語尾の1文字漢字の即時反復（「秋秋」→「秋」）
 * ひらがな／カタカナのみの語は正当な畳語（例: はは）を壊さないため対象外。
 */
export function dedupeAdjacentPhrases(input: string): string {
  if (typeof input !== 'string' || input === '') return input
  let s = input
  s = s.replace(/([。、！!？?・…‥　 ])\1+/g, '$1')
  // 漢字始まりの 2〜8 文字語の即時反復
  for (let i = 0; i < 3; i++) {
    const next = s.replace(
      /([一-鿿][\p{L}\p{N}ー々〆぀-ヿ]{1,7})[ 　]?\1/gu,
      '$1',
    )
    if (next === s) break
    s = next
  }
  s = s.replace(/([一-鿿])\1(?=[^぀-ヿ一-鿿]|$)/gu, '$1')
  return s
}

// ── 4. 旧フィールド由来の断片・未定義値・空括弧の除去 ────────────────────
const LEAK_PATTERNS: RegExp[] = [
  /\bundefined\b/g,
  /\bnull\b/g,
  /\bNaN\b/g,
  /\[object Object\]/g,
  /\batRelated\b/gi,
  /\bat_related\b/gi,
  /\brelatedArticles?\b/g,
  /\bareaLed\b/g, // 旧フィールド名の綴り違い
]
export function stripLeakedFragments(input: string): string {
  if (typeof input !== 'string' || input === '') return input
  let s = input
  for (const re of LEAK_PATTERNS) s = s.replace(re, '')
  s = s.replace(/[「『（(][ 　]*[」』）)]/g, '') // 空の括弧対
  s = s.replace(/^[ 　]*[:：][ 　]*$/gm, '') // 行が孤立コロンだけ
  s = s.replace(/[ 　]{2,}/g, ' ')
  s = s.replace(/[ 　]+([。、）)」』])/g, '$1')
  s = s.replace(/([（(「『])[ 　]+/g, '$1')
  s = s.replace(/^[ 　]+$/gm, '')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

// ── 出典種別の表示語（shopnews → 公式ショップニュース） ────────────────
/** 出典 URL が「ショップニュース」系か（GINZA SIX: /news/detail/shopnews/、ginza.jp: /shopnews/ ・ /shopnews-） */
export function isShopnewsUrl(u?: string): boolean {
  return /\/shopnews\/|\/shopnews-|\/news\/detail\/shopnews\//.test(String(u ?? ''))
}
/** 出典 URL の種別から「（出典名 ）公式◯◯」の表示語を決める。 */
export function officialPageLabel(sourceUrl?: string, sourceName?: string): string {
  const kind = isShopnewsUrl(sourceUrl) ? '公式ショップニュース' : '公式ページ'
  const nm = String(sourceName ?? '').trim()
  return nm ? `${nm} ${kind}` : kind
}

// ── 1. ハッシュタグを必ず4個へ ──────────────────────────────────────────
export interface PolishContext {
  appliedTemplate?: string
  eventName?: string
  brand?: string
  category?: string
  venueNames?: string[]
  venuePlaces?: string[]
  /** 出典 URL。shopnews のとき本文中の「公式イベントページ」を「公式ショップニュース」へ置換する */
  sourceUrl?: string
}

const CATEGORY_TAG: Record<string, string> = {
  FOOD: '#グルメ', CAFE: '#カフェ', SHOPPING: '#ショッピング', ARCHITECTURE: '#建築',
  ART: '#アート', EVENT: '#イベント', NIGHT: '#バー', MUSIC: '#音楽', BEAUTY: '#ビューティー',
  HOTEL: '#ホテル', WELLNESS: '#ウェルネス', EXPERIENCE: '#体験', GIFT: '#手土産',
  WORKSHOP: '#ワークショップ', PHOTO: '#フォトスポット', FAMILY: '#おでかけ',
  NIGHT_VIEW: '#夜景', RAINY_DAY: '#雨の日',
}

/** 先頭 # を1つに整え、記号・空白を除去。空なら '' */
function normTag(raw: unknown): string {
  let t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return ''
  t = t.replace(/^#+/, '')
  t = t.replace(/[®™×\s　·・,、/／|｜'"`]+/g, '')
  return t ? `#${t}` : ''
}

/** 会場・ブランド・カテゴリー・イベント名から重複なしのハッシュタグ候補を決定的に導出 */
export function deriveHashtagCandidates(ctx: PolishContext): string[] {
  const out: string[] = []
  const push = (t: unknown): void => {
    const n = normTag(t)
    if (n && n !== '#' && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n)
  }
  const venueText = [...(ctx.venuePlaces ?? []), ...(ctx.venueNames ?? [])].join('  ')
  if (/GINZA ?SIX|ギンザ ?シックス|銀座シックス|GSIX/i.test(venueText)) push('#GINZASIX')
  if (/蔦屋書店/.test(venueText)) push('#銀座蔦屋書店')
  if (/三越/.test(venueText)) push('#銀座三越')
  if (/松屋/.test(venueText)) push('#銀座松屋')
  if (/和光|SEIKO ?HOUSE/i.test(venueText)) push('#和光')
  if (/歌舞伎座/.test(venueText)) push('#歌舞伎座')
  if (/資生堂/.test(venueText)) push('#資生堂')
  // 会場店舗名の先頭語
  for (const nm of ctx.venueNames ?? []) {
    const m = String(nm ?? '').replace(/^[ 　]+/, '').match(
      /^([A-Za-z][A-Za-z0-9&.\-]{2,}|[぀-ヿ一-鿿]{2,10})/,
    )
    if (m) push(`#${m[1]}`)
  }
  if (ctx.brand) push(`#${ctx.brand}`)
  const cat = (ctx.category ?? '').toUpperCase()
  if (CATEGORY_TAG[cat]) push(CATEGORY_TAG[cat])
  // イベント名（コラボ相手を含む）。「New Era®」のような空白入りブランドは空白を詰めて1タグに。
  for (const part of normalizeBrandCollab(ctx.eventName ?? '')
    .split(new RegExp(`[ 　]${CROSS}[ 　]|${CROSS}|「|」|『|』|【|】|\\||｜|,|、|/|／`))
    .map((x) => x.trim())
    .filter(Boolean)) {
    const clean = part.replace(/[ 　]+/g, '').replace(/[®™]/g, '')
    if (/^[A-Za-z0-9&.\-]{3,24}$/.test(clean) || /^[぀-ヿ一-鿿]{2,14}$/.test(clean)) {
      push(`#${clean}`)
    } else {
      const m = clean.match(/^([A-Za-z][A-Za-z0-9&.\-]{2,}|[぀-ヿ一-鿿]{2,12})/)
      if (m) push(`#${m[1]}`)
    }
  }
  // 汎用フォールバック（順序＝優先度）
  push('#銀座')
  push('#今週の銀座')
  push('#東京')
  push('#GINZAWHISKERS')
  return out
}

/** 既存タグを保持したまま、重複なしで必ず4個返す（会場・ブランド・カテゴリー由来で補完） */
export function ensureFourHashtags(existing: string[] | undefined, ctx: PolishContext): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const add = (t: unknown): void => {
    const n = normTag(t)
    if (!n || n === '#') return
    const k = n.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    result.push(n)
  }
  for (const t of existing ?? []) add(t)
  add('#銀座') // GINZA WHISKERS の必須タグ（既にあれば no-op）
  for (const c of deriveHashtagCandidates(ctx)) {
    if (result.length >= 4) break
    add(c)
  }
  for (const p of ['#今週の銀座', '#東京', '#おでかけ', '#GINZAWHISKERS']) {
    if (result.length >= 4) break
    add(p)
  }
  return result.slice(0, 4)
}

// ── まとめて適用 ────────────────────────────────────────────────────────
export function polishTextFragment(s: string): string {
  return stripMasthead(stripLeakedFragments(dedupeAdjacentPhrases(normalizeBrandCollab(s))))
}

export type PolishableBlock = { type: string; text?: string }

export interface PolishArticleInput<B extends PolishableBlock = PolishableBlock> {
  titleCandidates: string[]
  blocks: B[]
  hashtags: string[]
}
export interface PolishArticleResult<B extends PolishableBlock = PolishableBlock> {
  titleCandidates: string[]
  blocks: B[]
  hashtags: string[]
}

/**
 * 生成済み記事下書き（タイトル候補・本文ブロック・ハッシュタグ）へ後処理を一括適用する。
 * テンプレート種別に依存しない共通処理。DC 個別の分岐は持たない。
 */
export function polishArticleDraft<B extends PolishableBlock>(
  input: PolishArticleInput<B>,
  ctx: PolishContext,
): PolishArticleResult<B> {
  // 出典が shopnews のときは「公式イベントページ」→「公式ショップニュース」（req 2）
  const srcWord = (s: string): string =>
    isShopnewsUrl(ctx.sourceUrl) ? s.replace(/公式イベントページ/g, '公式ショップニュース') : s
  const clean = (s: string): string => srcWord(polishTextFragment(s))
  const titleCandidates = input.titleCandidates
    .map(clean)
    .map((t) =>
      t
        .replace(/[「『][」』]/g, '')
        .replace(/[ 　]{2,}/g, ' ')
        .replace(/[\s、。]+$/u, (m) => (m.includes('。') ? '。' : ''))
        .trim(),
    )
    .filter(Boolean)
  const blocks = input.blocks
    .map((b) => (typeof b.text === 'string' ? ({ ...b, text: clean(b.text) } as B) : b))
    // 後処理（マストヘッド除去等）で本文が空になったブロックは落とす（段落・見出しとも）
    .filter((b) => !(typeof b.text === 'string' && b.text.trim() === ''))
  const hashtags = ensureFourHashtags(input.hashtags, ctx)
  return { titleCandidates, blocks, hashtags }
}
