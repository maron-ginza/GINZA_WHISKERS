// GINZA WHISKERS / Project 02（2026-09-04、非 GINZA SIX 候補の分類率向上）
//
// 情報源の「ページ種別」を **決定的** に判定する。名称だけからカテゴリー・記事種別を
// 推測しない——判断根拠は次のみ：
//   ・公式ページの URL（ホスト＋パス構造）
//   ・SOURCE LEDGER の sourceName（どの公式サイトか。URL ホストの裏取りに使うだけ）
//   ・venue（DiscoveredContent.venue）
//   ・title（明記された語：【フェア】／◯◯展／トークイベント／第N回…フェスティバル 等）
//   ・excerpt（本文に明記された「開催期間 YYYY年M月D日」「会期：」等）
//
// 出力は「個別記事ページか／一覧・索引ページか／判定不能か」と、個別記事のときだけ
// 決定的に導ける factKind / templateType のヒント。**ヒントは classifyFactKind /
// classifyTemplateType の複数シグナル集計に 1 票を加えるだけ**で、単独では
// 何も確定しない（1 シグナルでは決めない既存ルールを維持）。
//
// 【安全条件】AI を使わない／追加課金しない／HTML を解釈・実行しない（呼び出し元が
// 渡す文字列のみ）／根拠が足りなければ unknown のまま（推測で寄せない）。

import { classifyUrlGranularity } from '../crawler/urlGranularity'

export type SourcePageKind = 'article' | 'index' | 'unknown'

export interface SourcePageInput {
  /** SOURCE LEDGER の表示名（URL ホストの裏取り用。名称単独で分類しない） */
  sourceName?: string | null
  /** DiscoveredContent.articleUrl */
  url?: string | null
  venue?: string | null
  title?: string | null
  excerpt?: string | null
  contentType?: string | null
  uxType?: string | null
}

export interface SourcePageClassification {
  pageKind: SourcePageKind
  /**
   * ヒントの決定的強度。
   *   high   … URL 構造で個別イベント詳細と確定 ＋ タイトル/本文の明記が corroborate
   *            → 呼び出し元は他のあいまいなキーワードより優先してよい
   *   medium … URL 構造 or タイトル明記の一方のみ → 既存の複数シグナル集計に 1 票
   *   low    … 何も導けない
   */
  confidence: 'high' | 'medium' | 'low'
  /** 個別記事ページのときだけ、決定的に導ける factKind。導けなければ null */
  factKindHint: 'event' | 'product_news' | null
  /** 個別記事ページのときだけ、決定的に導ける templateType。導けなければ null */
  templateTypeHint: 'exhibition' | 'workshop' | 'recurring_event' | 'sale' | null
  /** 人が読める判定根拠（ルールごとに 1 行）。監査記録に残す */
  evidence: string[]
  /** 機械タグ（監査記録・集計用） */
  ruleIds: string[]
}

interface ParsedUrl {
  host: string
  path: string
  segs: string[]
  lastSeg: string
  search: string
}

function parseUrl(u: string): ParsedUrl | null {
  const raw = (u ?? '').trim()
  if (!/^https?:\/\/\S+$/i.test(raw)) return null
  try {
    const p = new URL(raw)
    const path = p.pathname.replace(/\/+$/, '') || '/'
    const segs = path.split('/').filter(Boolean)
    return {
      host: p.host.toLowerCase(),
      path,
      segs,
      lastSeg: segs.length ? segs[segs.length - 1] : '',
      search: p.search.toLowerCase(),
    }
  } catch {
    return null
  }
}

function t(...vals: (string | null | undefined)[]): string {
  return vals.map((v) => (typeof v === 'string' ? v : '')).join(' \n ')
}

/** 全角英数字を半角へ（タイトル中の「２０２６年」等を日付判定できるようにする） */
function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[　]/g, ' ')
}

// ---------------------------------------------------------------------------
// タイトル・本文の「明記」シグナル（名称推測ではなく、書かれている語）
// ---------------------------------------------------------------------------
// 「◯◯展」で終わる名称（展示会場・展開・展望 等の一般語は除外。直前が非単語文字＝
// 括弧・記号・行頭でも拾う。「】華雅展」等）
const ENDS_WITH_TEN_RE = /(?<![一-龥ぁ-んァ-ヶーA-Za-z0-9])[一-龥ぁ-んァ-ヶー]{2,10}展(?![示会場開])/
const EXPLICIT_EXHIBITION_RE =
  /【\s*フェア\s*】|個展|回顧展|遺作展|作品展|原画展|写真展|絵画展|版画展|工芸展|陶芸展|書展|作陶展|イラスト展|立体展|インスタレーション/
const ARTIST_SHOW_RE = /(?:漆|陶|木工|金工|硝子|ガラス)?作家|画家|写真家|陶芸家|書家|アーティスト(?:個展|作品)/
const EXPLICIT_WORKSHOP_RE =
  /トークイベント|トークショー|サイン会|サイン本(?:お渡し会?)?|ワークショップ|実演販売|実演会|体験教室|制作体験|づくり体験|ハンズオン|レクチャー(?:会|イベント)?/
const EXPLICIT_RECURRING_RE =
  /第\s?[0-9０-９]{1,3}\s?回[^。]{0,24}(?:フェスティバル|フェス|マーチ|祭|まつり|コンクール|大会|博覧会)/
// 「発売記念」は展示・トークとセットのことが多いので sale 語からは除外する
const EXPLICIT_SALE_RE =
  /新発売|好評発売中|発売開始|数量限定|限定販売|新商品|新作(?:コスメ|チーク|リップ|フレグランス|香水|コフレ)|コレクション発売|予約受付中の新作/
// 本文/タイトルに開催期間・会期が「明記」されている（一覧ページのノイズと区別できる強い日付シグナル）。
// ①「開催期間 YYYY年M月D日」「会期：」型 ②「YYYY年M月D日(曜) - YYYY年M月D日」型の日付レンジ。
// 判定前に全角→半角へ正規化する。
const EXPLICIT_PERIOD_RE =
  /開催期間\s*[:：]?\s*20\d{2}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日|会期\s*[:：]|会期\s?[:：]?\s?20\d{2}\s?年|20\d{2}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日\s?[（(]?[日月火水木金土][)）]?\s*[-–—〜~－ー]\s*(?:20\d{2}\s?年\s?)?\d{1,2}\s?月\s?\d{1,2}\s?日/

// 一覧・索引ページを示す URL 末尾セグメント
// 【2026-09-14追加】マロン指示（候補抽出の根本原因対応）：検索結果・マイページ・
// 通信販売トップ・カート・ログイン等の「共通案内・システム」ページを一般に除外する
// （個別記事ではない、Shopify/EC 系サイトで頻出）。
const INDEX_LAST_SEG = new Set([
  '', 'index.html', 'index.htm', 'index.php',
  'event', 'events', 'news', 'newslist', 'news_archives', 'information', 'info',
  'exhibition', 'exhibitions', 'schedule', 'list', 'archive', 'archives',
  'guide', 'story', 'topics', 'category', 'shopevent', 'shopnews', 'magazine',
  'story-and-guide', 'see-and-do', 'new-and-now', 'whats-new',
  'account', 'my-account', 'login', 'signin', 'cart', 'search', 'sitemap',
  'mail-order', 'mailorder', 'facility-access',
])
// 一覧・索引ページを示す（短い・数字を含まない）タイトル
// 【2026-09-14追加】My account／検索結果／マイページ／通信販売トップ／カート を追加
// （マロン指示：候補対象外として識別すべき「共通案内・システム告知」の明示要求）。
const INDEX_TITLE_RE =
  /^(?:最新情報|お知らせ(?:・新着情報)?|新着情報|イベント情報|おすすめイベント(?:・新着情報)?|ニュース(?:一覧)?|イベント一覧|.{0,10}一覧|ストーリー\s*[＆&]\s*ガイド|.{0,8}ガイド|江戸の歴史・文化|アクセス(?:・営業時間)?|フロアガイド|ショップリスト|ショップガイド|会社概要|Food|Fashion|Art|Beauty|My\s?[Aa]ccount|マイページ|検索結果|通信販売(?:トップ)?|カートを見る|ショッピングカート|ログイン|会員登録)$/

// ---------------------------------------------------------------------------
// ホスト別ルール（URL のパス構造だけで「個別記事」か「一覧」かを決める）
// ---------------------------------------------------------------------------
interface HostRule {
  hostRe: RegExp
  sourceLabel: string
  /** 個別記事詳細ページ（数値 ID を持つ等）。タイトルの語からヒントを補強してよい */
  articleRe?: RegExp
  /** 記事詳細のうち「イベント」と URL 構造で確定できるもの */
  articleEventRe?: RegExp
  /** 記事詳細のうち「商品ニュース」と URL 構造で確定できるもの */
  articleProductRe?: RegExp
  /**
   * 「告知・お知らせ」専用パス（例：中央区の /blogs/news・/blogs/information）。
   * 個別ページではあるが、イベント本体ではなく「◯◯が決まりました」型の告知が主。
   * タイトルの語で factKind/templateType を昇格させない（推測で event 化しない）。
   */
  articleAnnounceRe?: RegExp
  /** 一覧・セクション・ガイドページ */
  indexRe: RegExp
}

const HOST_RULES: HostRule[] = [
  {
    // 銀座 蔦屋書店：/ginza/event/<分類>/<記事ID>.html が個別イベント詳細
    hostRe: /(?:^|\.)store\.tsite\.jp$/,
    sourceLabel: '銀座 蔦屋書店',
    articleEventRe: /^\/ginza\/(?:event|feature)\/[a-z0-9-]+\/\d[\d-]*\.html?$/i,
    indexRe:
      /^\/ginza(?:\/(?:event|feature|news|magazine)(?:\/[A-Za-z0-9-]+)?)?$/i,
  },
  {
    // 中央区観光協会：/blogs/event/<id> が個別イベント、/blogs/news|information/<id> は告知
    hostRe: /(?:^|\.)chuo-kanko\.or\.jp$/,
    sourceLabel: '中央区観光関連',
    articleEventRe: /^\/blogs\/event\/[^/]+$/i,
    articleAnnounceRe: /^\/blogs\/(?:news|information)\/[^/]+$/i,
    indexRe: /^\/(?:blogs|event|spot|feature|areaguide|tour)s?$/i,
  },
  {
    // GINZA OFFICIAL：/shopnews/shopnews-<shop>/<id> が個別、/event/page/N・/shopevent は一覧
    hostRe: /(?:^|\.)ginza\.jp$/,
    sourceLabel: 'GINZA OFFICIAL',
    articleRe: /^\/shopnews\/shopnews-[a-z0-9-]+\/\d+$/i,
    indexRe: /^\/(?:shopevent|event|shopnews|news|feature)(?:\/page\/\d+)?$/i,
  },
  {
    // GINZA SIX：/news/detail/<種別>/<id> が個別、/news/<種別>_category/... は一覧
    hostRe: /(?:^|\.)ginza6\.tokyo$/,
    sourceLabel: 'GINZA SIX',
    articleRe: /^\/news\/detail\/(?:news|shopnews|art|event)\/\d+$/i,
    indexRe:
      /^\/(?:news(?:\/(?:news_category|shopnews_category)\/[a-z0-9-]+)?|shopguide|art|magazine|floorguide)$/i,
  },
  {
    // GO TOKYO：/jp/event/<cat>/<slug>.html（index.html でない）が個別イベント
    hostRe: /(?:^|\.)gotokyo\.org$/,
    sourceLabel: 'GO TOKYO',
    articleEventRe: /^\/jp\/event\/[^/]+\/[^/]+\.html$/i,
    indexRe:
      /^\/jp\/(?:index\.html|story(?:-and-guide)?|see-and-do|new-and-now|story\/guide\/[a-z]+\/index\.html|event\/[^/]+\/index\.html)?$/i,
  },
  {
    // 歌舞伎座：/news_archives/<数値id> が個別、/news_archives/info・/miyage/... は一覧・店舗案内
    hostRe: /(?:^|\.)kabuki-za\.co\.jp$/,
    sourceLabel: '歌舞伎座',
    articleRe: /^\/news_archives\/\d+$/i,
    indexRe: /^\/(?:news_archives(?:\/(?:info|list))?|miyage(?:\/.*)?|schedule|restaurant|access)?$/i,
  },
  {
    // 資生堂ギャラリー：/jp/exhibition/<id> ・/jp/<6桁以上> が個別展示。
    // /jp/artegg・/jp/artegg/prize（賞制度の常設案内）・/jp/press（プレスリリース一覧）は
    // 個別記事ではない（2026-09-14追加：実データ確認で判明した誤判定の是正）。
    hostRe: /(?:^|\.)gallery\.shiseido\.com$/,
    sourceLabel: '資生堂ギャラリー',
    articleEventRe: /^\/jp\/(?:exhibition\/[\w-]+|\d{6,})$/i,
    indexRe: /^\/jp(?:\/(?:exhibition|archive|about|artegg(?:\/prize)?|press))?$/i,
  },
  {
    // POLA MUSEUM ANNEX：/m-annex/exhibition/<id> が個別展示
    hostRe: /(?:^|\.)po-holdings\.co\.jp$/,
    sourceLabel: 'POLA MUSEUM ANNEX',
    articleEventRe: /^\/m-annex\/exhibition\/[\w-]+$/i,
    indexRe: /^\/m-annex(?:\/(?:exhibition|archive|access))?$/i,
  },
  {
    // 和光：/hall/... ・/news/<id> が個別、ルート・セクションは一覧
    hostRe: /(?:^|\.)wako\.co\.jp$/,
    sourceLabel: '和光',
    articleRe: /^\/(?:hall|news|topics)\/[\w-]*\d[\w-]*$/i,
    indexRe: /^\/(?:hall|news|topics|about|shopguide)?$/i,
  },
  {
    // SEIKO HOUSE GINZA：英語コーポレート配下（/en/...）は銀座コンテンツではない＝一覧扱い
    hostRe: /(?:^|\.)seiko\.co\.jp$/,
    sourceLabel: 'SEIKO HOUSE GINZA',
    indexRe: /^\/(?:en\/.*|products\/.*|news\/\d{4}|corporate\/.*|group\/.*)?$/i,
  },
  {
    // Sony Park：ルート・セクションは一覧
    hostRe: /(?:^|\.)ginzasonypark\.com$/,
    sourceLabel: 'Sony Park',
    articleRe: /^\/(?:program|news|exhibition)\/[\w-]*\d[\w-]*$/i,
    indexRe: /^\/(?:program|news|exhibition|about|access)?$/i,
  },
  {
    // 銀座もとじ：/blogs/events/<slug>（末尾に年月）が個別催事、/blogs/events が一覧
    hostRe: /(?:^|\.)motoji\.co\.jp$/,
    sourceLabel: '銀座もとじ',
    articleEventRe: /^\/blogs\/events\/[a-z0-9-]+$/i,
    articleRe: /^\/blogs\/(?:reading|column)\/[a-z0-9-]+$/i,
    indexRe: /^\/(?:blogs(?:\/(?:events|news|reading|column))?|collections\/[a-z0-9-]+|pages\/[a-z0-9-]+)?$/i,
  },
  {
    // 山野楽器 銀座本店：/information/<数値id> が個別、/information/ が一覧
    hostRe: /(?:^|\.)yamano-music\.co\.jp$/,
    sourceLabel: '山野楽器 銀座本店',
    articleRe: /^\/information\/\d+$/i,
    indexRe: /^\/(?:information|news|shop(?:\/[a-z0-9-]+)?)?$/i,
  },
  {
    // 銀座夏野：/blog/news/<数値id> が個別、/blog/news/ が一覧
    hostRe: /(?:^|\.)e-ohashi\.com$/,
    sourceLabel: '銀座夏野',
    articleRe: /^\/blog\/news\/\d+$/i,
    indexRe: /^\/(?:blog(?:\/news)?|information)?$/i,
  },
  {
    // 相田みつを美術館：/news/detail_<...>.html が個別、/news/ が一覧
    hostRe: /(?:^|\.)mitsuo\.co\.jp$/,
    sourceLabel: '相田みつを美術館',
    articleRe: /^\/news\/detail_[a-z0-9_-]+\.html$/i,
    indexRe: /^\/(?:news|exhibition|museum|about)?(?:\/index\.html)?$/i,
  },
  {
    // 教文館：/<売場>/event-news/<種別>/entry-<id>.html 等が個別催事、/event-news/ が一覧
    hostRe: /(?:^|\.)kyobunkwan\.co\.jp$/,
    sourceLabel: '教文館',
    articleEventRe: /^\/[a-z]+\/event-news\/[a-z-]+\/[a-z0-9-]+\.html$/i,
    articleRe: /^\/[a-z]+\/news\/entry-\d+\.html$/i,
    indexRe: /^\/(?:event-news|event_calendar|[a-z]+\/(?:news|event-news))\/?$/i,
  },
  {
    // 月光荘画材店：/<数値id> が個別、/news・/blogs/<slug> 等が一覧・固定ページ
    hostRe: /(?:^|\.)gekkoso\.jp$/,
    sourceLabel: '月光荘画材店',
    articleRe: /^\/\d{3,}$/i,
    indexRe: /^\/(?:news|blogs(?:\/[a-z0-9-]+)?|collections\/[a-z0-9-]+|policies\/[a-z0-9-]+|pages\/[a-z0-9-]+)?$/i,
  },
  {
    // 木挽町よしや（Shopify）：/nichinichi_<id> が個別コラム、/news/<slug> が個別告知、
    // /my-account・/wp-sitemap.xsl 等はシステム・共通案内として一覧扱い。
    hostRe: /(?:^|\.)kobikichoyoshiya\.com$/,
    sourceLabel: '木挽町よしや',
    articleAnnounceRe: /^\/news\/[^/]+$/i,
    articleRe: /^\/nichinichi[\w-]*$/i,
    indexRe: /^\/(?:my-account|account|cart|search|wp-sitemap(?:-index)?\.xsl|news|collections\/[a-z0-9-]+|pages\/[a-z0-9-]+)?$/i,
  },
  {
    // 帝国ホテル（東京／大阪 共通パス構造）：
    //   /(tokyo|osaka)/hotelshop/seasonal|column/<slug> … 個別の季節商品・ギフト特集記事
    //   /(tokyo|osaka)/event/<slug>                     … 個別イベント詳細
    //   /(tokyo|osaka)/restaurant/<venue>/plan/<slug>、/restaurant/scene/<slug> … 個別レストランプラン
    //   /(tokyo|osaka)/news/<slug>                       … 告知（イベント本体ではない）
    //   /hotelshop/mail-order（通信販売トップ）・/hotelshop/category/<slug>（商品一覧）・
    //   /facility-access・/special 配下・/iclub 配下・各セクション直下（スラッグ無し）は
    //   一覧・共通案内として除外する（2026-09-14、マロン指示の検証対象host）。
    hostRe: /(?:^|\.)imperialhotel\.co\.jp$/,
    sourceLabel: '帝国ホテル',
    articleEventRe: /^\/(?:tokyo|osaka)\/event\/[\w-]+$/i,
    articleRe:
      /^\/(?:tokyo|osaka)\/hotelshop\/seasonal\/[\w-]+$|^\/(?:tokyo|osaka)\/hotelshop\/column\/[\w-]+$|^\/(?:tokyo|osaka)\/restaurant\/[\w-]+\/plan\/[\w-]+$|^\/(?:tokyo|osaka)\/restaurant\/scene\/[\w-]+$/i,
    articleAnnounceRe: /^\/(?:tokyo|osaka)\/news\/[\w-]+$/i,
    indexRe:
      /^\/(?:tokyo|osaka)\/hotelshop(?:\/(?:seasonal|column))?$|^\/(?:tokyo|osaka)\/hotelshop\/mail-order$|^\/(?:tokyo|osaka)\/hotelshop\/category\/[\w-]+$|^\/(?:tokyo|osaka)\/(?:event|news|restaurant)$|^\/(?:tokyo|osaka)\/facility-access(?:\/[\w-]+)?$|^\/(?:tokyo|osaka)\/special(?:\/[\w-]+)?$|^\/special(?:\/[\w-]+)?$|^\/iclub(?:\/.*)?$/i,
  },
]

// ---------------------------------------------------------------------------
export function classifySourcePageType(input: SourcePageInput): SourcePageClassification {
  const evidence: string[] = []
  const ruleIds: string[] = []
  const parsed = parseUrl(input.url ?? '')
  const titleText = (input.title ?? '').trim()
  // 正規表現マッチ用は全角→半角に正規化（「２０２６年」等を日付として拾えるように）
  const titleNorm = toHalfWidth(titleText)
  const bodyNorm = toHalfWidth(t(input.title, input.excerpt))

  if (!parsed) {
    return { pageKind: 'unknown', confidence: 'low', factKindHint: null, templateTypeHint: null, evidence: ['URL が無い／不正のため判定不能'], ruleIds: ['no_url'] }
  }

  let pageKind: SourcePageKind | null = null
  let factKindHint: SourcePageClassification['factKindHint'] = null
  let templateTypeHint: SourcePageClassification['templateTypeHint'] = null
  // タイトルの語で factKind/templateType を昇格してよいか（告知専用ページは false）
  let allowTitlePromotion = true

  // 0) URL 粒度：年度別アーカイブ・一覧ナビ・ページ送り・店舗案内は「個別記事ではない」
  //    ＝ どのホストでも index として確定する（2026-09-04、アーカイブ誤取得の修正）。
  const gran = classifyUrlGranularity(input.url ?? '', null, input.title ?? null)
  if (gran.granularity === 'archive' || gran.granularity === 'listing' || gran.granularity === 'pagination' || gran.granularity === 'section') {
    return {
      pageKind: 'index',
      confidence: 'low',
      factKindHint: null,
      templateTypeHint: null,
      evidence: [`個別記事ではない（${gran.granularity}）: ${gran.reason}`],
      ruleIds: [`granularity:${gran.granularity}`],
    }
  }

  // 1) ホスト別 URL 構造ルール
  const hr = HOST_RULES.find((r) => r.hostRe.test(parsed.host))
  if (hr) {
    if (hr.indexRe.test(parsed.path)) {
      pageKind = 'index'
      evidence.push(`${hr.sourceLabel} の一覧・索引ページ形式（${parsed.path}）`)
      ruleIds.push(`host:${parsed.host}:index`)
    } else if (hr.articleEventRe && hr.articleEventRe.test(parsed.path)) {
      pageKind = 'article'
      factKindHint = 'event'
      evidence.push(`${hr.sourceLabel} の個別イベント詳細ページ形式（${parsed.path}）`)
      ruleIds.push(`host:${parsed.host}:article_event`)
    } else if (hr.articleProductRe && hr.articleProductRe.test(parsed.path)) {
      pageKind = 'article'
      factKindHint = 'product_news'
      evidence.push(`${hr.sourceLabel} の個別商品ニュースページ形式（${parsed.path}）`)
      ruleIds.push(`host:${parsed.host}:article_product`)
    } else if (hr.articleAnnounceRe && hr.articleAnnounceRe.test(parsed.path)) {
      pageKind = 'article'
      allowTitlePromotion = false
      evidence.push(`${hr.sourceLabel} の告知・お知らせページ形式（${parsed.path}）＝イベント本体ではない`)
      ruleIds.push(`host:${parsed.host}:announce`)
    } else if (hr.articleRe && hr.articleRe.test(parsed.path)) {
      pageKind = 'article'
      evidence.push(`${hr.sourceLabel} の個別記事ページ形式（${parsed.path}）`)
      ruleIds.push(`host:${parsed.host}:article`)
    }
  }

  // 2) ホスト非依存の一覧・索引フォールバック（未確定のとき）
  if (pageKind == null) {
    const pageParam = /[?&]page=\d+/.test(parsed.search) || /\/page\/\d+$/.test(parsed.path)
    const idxSeg = INDEX_LAST_SEG.has(parsed.lastSeg.toLowerCase())
    const idxTitle = titleText.length > 0 && titleText.length <= 24 && !/\d/.test(titleNorm) && INDEX_TITLE_RE.test(titleText)
    if (pageParam || idxSeg || idxTitle) {
      pageKind = 'index'
      evidence.push(
        `一覧・索引ページ（${[pageParam ? 'ページ送りパラメータ' : '', idxSeg ? `URL 末尾が索引セグメント「${parsed.lastSeg || '/'}」` : '', idxTitle ? `タイトルが索引形式「${titleText}」` : ''].filter(Boolean).join(' / ')}）`,
      )
      ruleIds.push('generic:index')
    }
  }

  // 3) それでも未確定 → unknown（推測で article/index に寄せない）
  if (pageKind == null) {
    return {
      pageKind: 'unknown',
      confidence: 'low',
      factKindHint: null,
      templateTypeHint: null,
      evidence: [`URL 構造・タイトルから個別記事／一覧の判定がつかない（host=${parsed.host} path=${parsed.path}）`],
      ruleIds: ['undetermined'],
    }
  }

  // 4) 個別記事ページなら、タイトル・本文の「明記」でヒントを補強
  //    告知専用ページ（allowTitlePromotion=false）はタイトルの語で昇格しない。
  if (pageKind === 'article') {
    if (EXPLICIT_PERIOD_RE.test(bodyNorm)) {
      if (!factKindHint) factKindHint = 'event'
      evidence.push('本文に開催期間／会期の明記（個別イベント）')
      ruleIds.push('body:period')
    }
    // タイトル語による昇格は、URL/本文で個別イベントが確定しているか、告知専用でない場合のみ
    const canPromote = allowTitlePromotion && (factKindHint === 'event' || !hr?.articleAnnounceRe)
    if (canPromote) {
      if (EXPLICIT_SALE_RE.test(titleNorm)) {
        factKindHint = 'product_news'
        templateTypeHint = 'sale'
        evidence.push('タイトルに発売・新商品・数量限定の明記（商品ニュース）')
        ruleIds.push('title:sale')
      } else if (EXPLICIT_RECURRING_RE.test(titleNorm)) {
        if (!factKindHint) factKindHint = 'event'
        templateTypeHint = 'recurring_event'
        evidence.push('タイトルに「第N回…（フェスティバル／マーチ／コンクール等）」の明記（恒例行事）')
        ruleIds.push('title:recurring')
      } else if (EXPLICIT_WORKSHOP_RE.test(titleNorm)) {
        if (!factKindHint) factKindHint = 'event'
        templateTypeHint = 'workshop'
        evidence.push('タイトルにトークイベント／サイン会／ワークショップ／実演の明記（参加型）')
        ruleIds.push('title:workshop')
      } else if (EXPLICIT_EXHIBITION_RE.test(titleNorm) || ENDS_WITH_TEN_RE.test(titleNorm) || ARTIST_SHOW_RE.test(titleNorm)) {
        if (!factKindHint) factKindHint = 'event'
        templateTypeHint = 'exhibition'
        evidence.push('タイトルに【フェア】／「◯◯展」／作家名＋展示の明記（展覧会）')
        ruleIds.push('title:exhibition')
      }
    }
  }

  // 5) 決定的強度：
  //    high  = URL が個別イベント詳細（host article_event）＋ タイトル/本文の明記が corroborate
  //          または host article_event ＋ 本文に開催期間の明記
  //          または host article（非イベント）＋ タイトル明記 ＋ 本文に開催期間の明記
  //    medium= URL 構造 or タイトル明記のいずれか一方
  //    low   = index / それ以外
  const hasArticleEventUrl = ruleIds.some((r) => r.endsWith(':article_event'))
  const hasArticleUrl = ruleIds.some((r) => r.endsWith(':article') || r.endsWith(':article_event') || r.endsWith(':article_product'))
  const hasTitleMark = ruleIds.some((r) => r.startsWith('title:'))
  const hasPeriodMark = ruleIds.includes('body:period')
  let confidence: SourcePageClassification['confidence'] = 'low'
  if (pageKind === 'article') {
    if (hasArticleEventUrl && (hasTitleMark || hasPeriodMark)) confidence = 'high'
    else if (hasArticleUrl && hasTitleMark && hasPeriodMark) confidence = 'high'
    else if (hasArticleEventUrl || hasTitleMark || (hasArticleUrl && hasPeriodMark)) confidence = 'medium'
  }

  return { pageKind, confidence, factKindHint, templateTypeHint, evidence, ruleIds }
}
