// GINZA WHISKERS / Project 02（2026-09-04、アーカイブ誤取得の修正）
//
// URL の粒度を **決定的** に判定する。年度別アーカイブ・一覧ナビ・ページ送り・
// カテゴリートップ・店舗/施設案内ページを「個別記事ではない」と識別し、
// DiscoveredContent の新規候補化から除外する（既存データは削除しない）。
//
// 判断根拠は URL のパス構造と、任意でアンカーテキスト・タイトルの「明記」語のみ。
// 名称からの推測はしない。AI を使わない。

export type UrlGranularity = 'individual' | 'archive' | 'listing' | 'pagination' | 'section' | 'unknown'

export interface UrlGranularityResult {
  granularity: UrlGranularity
  /** 個別記事として扱ってよいか（archive/listing/pagination/section は false） */
  isIndividual: boolean
  reason: string
}

// 一覧・索引を示す最終セグメント
const LISTING_SEGS = new Set([
  '', 'index.html', 'index.htm', 'index.php',
  'news', 'newslist', 'news-list', 'newsrelease', 'news_release', 'pressrelease', 'press-release', 'press',
  'release', 'releases', 'information', 'info', 'topics', 'topic', 'whatsnew', 'whats-new', 'new',
  'list', 'lists', 'all', 'event', 'events', 'eventlist', 'event-list', 'exhibition', 'exhibitions',
  'schedule', 'schedules', 'calendar', 'category', 'categories', 'tag', 'tags', 'search', 'archive', 'archives',
  'backnumber', 'back-number', 'blog', 'blogs', 'column', 'columns', 'notice', 'notices', 'shopnews', 'shopevent',
])

// 店舗・施設・会社案内ページ（個別の催事・商品ではない）
const SECTION_SEGS = new Set([
  'shoplist', 'shop-list', 'shopguide', 'shop-guide', 'floorguide', 'floor-guide', 'floor', 'floormap',
  'access', 'about', 'aboutus', 'company', 'corporate', 'recruit', 'contact', 'faq', 'sitemap', 'privacy',
  'policy', 'policies', 'terms', 'menu', 'menus', 'restaurant', 'restaurants', 'bar', 'cafe', 'shop', 'store', 'stores',
  'brand', 'brands', 'gallery', 'hall', 'guide', 'map', 'parking', 'history', 'concept', 'profile', 'overview',
  'members', 'membership', 'mail', 'mailmagazine', 'app', 'collections', 'products', 'pages', 'blogs',
])
// 「◯◯一覧」を示す前セグメント付き slug（/event-calendar, /event-news, /media-news 等）
const LISTING_SLUG_RE = /^(?:event|events|news|media|press|topics|exhibition|schedule|shop)[-_](?:calendar|news|list|info|index|release|archive)$/

const PAGINATION_ANCHORS = new Set([
  '次へ', '前へ', 'next', 'prev', 'previous', 'もっと見る', 'もっとみる', 'more', 'view more',
  '›', '»', '前のページ', '次のページ', 'back', 'つづきを見る',
])
const LISTING_ANCHOR_RE = /一覧|リスト|バックナンバー|過去の(?:記事|お知らせ|ニュース)|アーカイブ/

const YEAR_RE = /^(?:19|20)\d{2}$/
const YEAR_MONTH_RE = /^(?:19|20)\d{2}[-_./]?(?:0?[1-9]|1[0-2])$/
const DATE_IN_TEXT_RE = /(?:19|20)\d{2}\s?[.\-/年]\s?\d{1,2}\s?[.\-/月]\s?\d{1,2}|開催期間|会期/

function parse(url: string): { segs: string[]; lastSeg: string; search: string } | null {
  try {
    const u = new URL(url.trim())
    const path = u.pathname.replace(/\/+$/, '')
    const segs = path.split('/').filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase())
    return { segs, lastSeg: segs.length ? segs[segs.length - 1] : '', search: u.search.toLowerCase() }
  } catch {
    return null
  }
}

export function classifyUrlGranularity(
  url: string,
  anchorText?: string | null,
  title?: string | null,
): UrlGranularityResult {
  const p = parse(url)
  const anchor = (anchorText ?? '').trim()
  const text = `${anchorText ?? ''} ${title ?? ''}`.trim()
  const mk = (granularity: UrlGranularity, reason: string): UrlGranularityResult => ({
    granularity,
    isIndividual: granularity === 'individual',
    reason,
  })

  if (!p) return mk('unknown', 'URL を解釈できない')

  // 1) ページ送り
  if (/[?&](?:page|p|paged|pg)=\d+/.test(p.search) || /^page$/.test(p.lastSeg) || /\/page\/\d+$/.test('/' + p.segs.join('/')))
    return mk('pagination', `ページ送りURL（${p.lastSeg || p.search}）`)
  if (PAGINATION_ANCHORS.has(anchor.toLowerCase()) || /^p?\d{1,3}$/.test(anchor))
    return mk('pagination', `アンカーがページ送り（「${anchor}」）`)

  // 2) 年度・年月アーカイブ
  if (YEAR_RE.test(p.lastSeg)) return mk('archive', `URL 末尾が年（${p.lastSeg}）＝年度別アーカイブ`)
  if (YEAR_MONTH_RE.test(p.lastSeg)) return mk('archive', `URL 末尾が年月（${p.lastSeg}）＝月別アーカイブ`)
  if (p.segs.some((s) => /^(?:archive|archives|backnumber|back-number)$/.test(s)))
    return mk('archive', 'パスに archive/backnumber セグメント')
  if (/^(?:19|20)\d{2}$/.test(anchor)) return mk('archive', `アンカーが年（「${anchor}」）＝年度別アーカイブ`)

  // 3) 一覧・索引
  if (LISTING_SEGS.has(p.lastSeg)) return mk('listing', `URL 末尾が一覧セグメント（${p.lastSeg || '/'}）`)
  if (LISTING_SLUG_RE.test(p.lastSeg)) return mk('listing', `URL 末尾が「◯◯一覧」slug（${p.lastSeg}）`)
  if (LISTING_ANCHOR_RE.test(text)) return mk('listing', `アンカー/タイトルが一覧表現（「${text.slice(0, 30)}」）`)

  // 4) 店舗・施設・会社案内・固定ページ（個別の催事・商品ではない）。日付の明記があれば除外しない
  if (SECTION_SEGS.has(p.lastSeg) && !DATE_IN_TEXT_RE.test(text))
    return mk('section', `URL 末尾が店舗・施設案内セグメント（${p.lastSeg}）で日付の明記なし`)
  if (p.segs.length >= 2 && SECTION_SEGS.has(p.segs[p.segs.length - 2]) && !DATE_IN_TEXT_RE.test(text))
    return mk('section', `店舗・固定ページ・商品ディレクトリ配下（/${p.segs[p.segs.length - 2]}/${p.lastSeg}）で日付の明記なし`)

  // 4b) パラメータなしの「詳細テンプレート」URL（記事IDを持たない detail.html 等）は個別記事ではない
  if (
    /^(?:detail|article|entry|view|show|single)\.(?:html?|php|aspx?)$/.test(p.lastSeg) &&
    !/\d{3,}/.test('/' + p.segs.join('/')) &&
    !/\d{3,}/.test(p.search)
  )
    return mk('listing', `記事IDを持たない詳細テンプレートURL（${p.lastSeg}）`)

  // 5) 個別記事として positively 識別できるもの
  if (/\d{3,}/.test(p.lastSeg)) return mk('individual', `URL 末尾に記事ID（${p.lastSeg}）`)
  const base = p.lastSeg.replace(/\.html?$|\.php$/i, '')
  if (base && base !== 'index' && /[a-z0-9]/.test(base) && base.replace(/[^a-z0-9]/g, '').length >= 6 && /[-_]/.test(base))
    return mk('individual', `URL 末尾が個別記事スラッグ（${p.lastSeg}）`)
  if (DATE_IN_TEXT_RE.test(text) && p.segs.length >= 2)
    return mk('individual', 'タイトル/アンカーに開催日・会期の明記あり')

  return mk('unknown', `URL 構造から個別記事と断定できない（/${p.segs.join('/')}）`)
}
