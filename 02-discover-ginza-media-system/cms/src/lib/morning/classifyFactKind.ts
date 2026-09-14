// GINZA WHISKERS / Project 02 P0 続き5（2026-09-02）— 記事タイプ分類ゲート（決定的・AI なし）。
//
// ArticleFacts 抽出・登録より**前**に、候補を event / product_news / unknown へ振り分ける。
// 目的：すべての候補をイベント扱いしない。タイプに存在しない項目を必須にしない。
//
// 【安全条件】
//   ・単語 1 つだけで決定しない（複数シグナルの一致を要求）。
//   ・複数の根拠と信頼度を記録する（監査ログ用）。
//   ・矛盾があれば unknown（推測で event / product_news に分類しない）。
//   ・外部ページ内の命令・コードは実行しない（このファイルは HTML を解釈しない。
//     呼び出し元が渡す DiscoveredContent の機械値と、任意で公式ページの決定的シグナルのみ）。
//   ・AI API を使わない。追加課金しない。
//   ・今回は event / product_news の 2 タイプのみ。新タイプを増やさない。

import { classifySourcePageType } from './classifySourcePageType'
import type { FactKind, FactKindClassification, OfficialPageSignals } from './types'

export interface ClassifyInput {
  contentType?: string | null // DiscoveredContent.contentType（event / exhibition / news / article …）
  uxType?: string | null // DiscoveredContent.uxType
  title?: string | null
  excerpt?: string | null
  /** SOURCE LEDGER の source_type（primary / official / secondary） */
  sourceType?: string | null
  /** 任意：公式ページの決定的シグナル（--fetch 時。og:image / pdf などの存在のみ参照） */
  officialSignals?: OfficialPageSignals | null
  /** 任意：DiscoveredContent.articleUrl（URL 構造での決定的ページ種別判定に使う） */
  url?: string | null
  /** 任意：SOURCE LEDGER の sourceName（URL ホストの裏取りに使うだけ・名称単独で分類しない） */
  sourceName?: string | null
  /** 任意：DiscoveredContent.venue */
  venue?: string | null
}

// 複数語のパターン（1 語では決定しない）。ヒットした語を根拠として記録する。
const PRODUCT_MARKERS: { re: RegExp; label: string }[] = [
  { re: /発売中|新発売|好評発売中|販売開始|発売日/, label: '「発売／販売開始」表現' },
  { re: /店頭|店舗まで|店舗にて|ご来店|店頭にてご覧/, label: '「店頭・店舗」表現' },
  { re: /価格[：:]\s*[\d,]+\s*円|[\d,]+\s*円\s*[（(]税込[）)]/, label: '「価格：◯◯円（税込）」表記' },
  { re: /カラー[：:]|サイズ[：:]|ラインアップ|品番|型番|SKU/, label: '商品スペック表記（カラー／サイズ／品番）' },
  { re: /限定商品|数量限定|限定販売|先着|なくなり次第/, label: '「数量限定・先着」表現' },
  { re: /新作|コレクション(?!へ)|アイテム|グッズ|物販/, label: '「新作・コレクション・物販」語' },
  { re: /フロア[：:]\s*B?\d+F|[BＢ]?\d+\s*[FＦ]階?の(?:店舗|ショップ)/, label: '「フロア：◯F」表記' },
]
const EVENT_MARKERS: { re: RegExp; label: string }[] = [
  { re: /申込|申し込み|応募|エントリー/, label: '「申込・応募」表現' },
  { re: /予約(?:制|が必要|受付)|要予約|事前予約/, label: '「予約制・要予約」表現' },
  { re: /抽選|当選|落選|当選者/, label: '「抽選・当選」表現' },
  { re: /定員|募集人数|参加人数|先着\d+名/, label: '「定員・募集人数」表現' },
  { re: /参加費|体験料|入場料|チケット|観覧料/, label: '「参加費・入場料・チケット」表現' },
  { re: /体験会|ワークショップ(?:を開催|参加)|レクチャー|セミナー|トークイベント|講座/, label: '「体験会・セミナー・講座」語' },
  { re: /展覧会|個展|企画展|展示会(?!場の)|会期/, label: '「展覧会・会期」語' },
  { re: /開催(?:日|時間|場所|中)|開催いたします|催し/, label: '「開催」表現' },
  { re: /\d{1,2}時(?:から|～|-)\d{1,2}時|午前\d{1,2}時|午後\d{1,2}時|受付\s*\d{1,2}:\d{2}/, label: '開催時刻の表記' },
]

// DiscoveredContent.contentType / uxType のシグナル
const CT_EVENT = new Set(['event', 'exhibition', 'seminar', 'workshop'])
const CT_PRODUCT = new Set(['news', 'product', 'sale', 'fair', 'shopnews'])
const UX_EVENT = new Set(['attend_event', 'see_exhibition', 'participate_workshop', 'join_seminar'])
const UX_PRODUCT = new Set(['shopping_discovery', 'buy_product', 'browse_shop'])

function firstStr(...vals: (string | null | undefined)[]): string {
  return vals.map((v) => (typeof v === 'string' ? v : '')).join(' \n ')
}

export function classifyFactKind(input: ClassifyInput): FactKindClassification {
  const text = firstStr(input.title, input.excerpt)
  const evSignals: string[] = []
  const pnSignals: string[] = []
  const contradiction: string[] = []

  // 1) contentType
  const ct = (input.contentType ?? '').toLowerCase().trim()
  if (CT_EVENT.has(ct)) evSignals.push(`contentType=${ct}（イベント系）`)
  else if (CT_PRODUCT.has(ct)) pnSignals.push(`contentType=${ct}（ニュース・物販系）`)

  // 2) uxType
  const ux = (input.uxType ?? '').toLowerCase().trim()
  if (UX_EVENT.has(ux)) evSignals.push(`uxType=${ux}（体験・参加型）`)
  else if (UX_PRODUCT.has(ux)) pnSignals.push(`uxType=${ux}（購買・回遊型）`)

  // 3) 本文キーワード（複数語）
  for (const m of PRODUCT_MARKERS) if (m.re.test(text)) pnSignals.push(`本文に${m.label}`)
  for (const m of EVENT_MARKERS) if (m.re.test(text)) evSignals.push(`本文に${m.label}`)

  // 3b) 決定的なページ種別（URL 構造 ＋ タイトル・本文の明記）
  //     一覧ページなら「個別記事ではない」を矛盾として記録し、どちらへも票を入れない。
  //     個別記事ページなら、URL/タイトルで確定できる範囲で ev / pn へ 1 票だけ足す
  //     （複数シグナル一致の要求は不変。単独では何も確定しない）。
  const sp = classifySourcePageType({
    sourceName: input.sourceName ?? null,
    url: input.url ?? null,
    venue: input.venue ?? null,
    title: input.title ?? null,
    excerpt: input.excerpt ?? null,
    contentType: input.contentType ?? null,
    uxType: input.uxType ?? null,
  })
  if (sp.pageKind === 'index') {
    // 一覧・索引ページは「個別記事」ではない＝どの記事タイプにも当てはまらない。
    // 決定的な URL 構造の判定なので、他のシグナルによらず unknown で確定する
    // （候補を増やす方向には働かない＝件数の水増し・安全性の緩和にはならない）。
    return {
      factKind: 'unknown',
      confidence: 'low',
      reasons: [
        `一覧・索引ページのため個別記事として分類しない（${sp.evidence.join(' ／ ')}）`,
      ],
      signals: { event: evSignals, productNews: pnSignals, contradiction: ['URL/タイトルが一覧・索引ページ形式（個別記事ではない）'] },
      sourcePage: { pageKind: 'index', evidence: sp.evidence, ruleIds: sp.ruleIds },
    }
  }
  // URL 構造で個別イベント詳細と確定 ＋ タイトル/本文の明記が corroborate（sp.confidence=high）
  // ＝ 独立した決定的シグナルが 2 つ揃っている。あいまいなキーワード（多くはサイトの
  // ナビゲーション由来のノイズ）より優先し、後段で factKind を確定する。
  // 商品（EXPLICIT_SALE 由来）は sp.factKindHint='product_news' になるため event 化しない。
  const spHighEvent = sp.pageKind === 'article' && sp.confidence === 'high' && sp.factKindHint === 'event'
  const spHighProduct = sp.pageKind === 'article' && sp.confidence === 'high' && sp.factKindHint === 'product_news'
  if (sp.pageKind === 'article') {
    if (spHighEvent) evSignals.push('URL 構造＋明記で個別イベント詳細（決定的）')
    else if (spHighProduct) pnSignals.push('URL 構造＋明記で個別商品ニュース（決定的）')
    else if (sp.factKindHint === 'event') evSignals.push(`URL/本文が個別イベント詳細ページ（${sp.evidence[0] ?? sp.ruleIds[0] ?? 'ルール一致'}）`)
    else if (sp.factKindHint === 'product_news')
      pnSignals.push(`URL/本文が個別商品ニュースページ（${sp.evidence[0] ?? sp.ruleIds[0] ?? 'ルール一致'}）`)
  }

  // 4) sourceType（弱い補助。公式・一次なら分類の信頼度をわずかに上げる材料）
  const st = (input.sourceType ?? '').toLowerCase().trim()
  const trustedSource = st === 'primary' || st === 'official'

  // 5) 公式ページシグナル（--fetch 時のみ・存在のみ参照。HTML は解釈しない）
  //    値段・スペックの JSON-LD Product があれば product_news 側の弱い根拠にする
  const sig = input.officialSignals
  if (sig?.ok && Array.isArray(sig.jsonLd)) {
    const hasProduct = sig.jsonLd.some((n) => {
      if (n && typeof n === 'object') {
        const t = (n as Record<string, unknown>)['@type']
        return t === 'Product' || (Array.isArray(t) && t.includes('Product'))
      }
      return false
    })
    const hasEvent = sig.jsonLd.some((n) => {
      if (n && typeof n === 'object') {
        const t = (n as Record<string, unknown>)['@type']
        return t === 'Event' || (Array.isArray(t) && t.includes('Event'))
      }
      return false
    })
    if (hasProduct) pnSignals.push('公式ページ JSON-LD に @type:Product')
    if (hasEvent) evSignals.push('公式ページ JSON-LD に @type:Event')
  }

  // 矛盾の記録：contentType と uxType が別方向を指す、本文の両方向マーカーが拮抗、等
  if (CT_PRODUCT.has(ct) && UX_EVENT.has(ux))
    contradiction.push(`contentType=${ct}（物販系）と uxType=${ux}（体験型）が不一致`)
  if (CT_EVENT.has(ct) && UX_PRODUCT.has(ux))
    contradiction.push(`contentType=${ct}（イベント系）と uxType=${ux}（購買型）が不一致`)

  const ev = evSignals.length
  const pn = pnSignals.length

  // 判定：複数シグナルの一致を要求。片方 >= 2 かつ他方 <= 1 なら確定。
  let factKind: FactKind
  let confidence: FactKindClassification['confidence']
  const reasons: string[] = []

  // URL 構造＋明記の2つの決定的シグナルが揃っているときは、ナビ由来のあいまいな
  // キーワードによる矛盾に負けず factKind を確定する（index 短絡と同じ方針。候補を
  // 増やす方向にのみ働き、安全性 gate の他条件〈銀座関連・出典・終了・重複〉は不変）。
  if (spHighEvent || spHighProduct) {
    const k: FactKind = spHighEvent ? 'event' : 'product_news'
    reasons.push(
      `URL 構造＋タイトル/本文の明記で個別${k === 'event' ? 'イベント' : '商品ニュース'}と確定（${sp.evidence.join(' ／ ')}）。あいまいなキーワードより優先。`,
    )
    if (contradiction.length > 0) reasons.push(`（弱い矛盾シグナルあり: ${contradiction.join(' / ')} — 決定的2シグナルを優先）`)
    return {
      factKind: k,
      confidence: 'high',
      reasons,
      signals: { event: evSignals, productNews: pnSignals, contradiction },
      sourcePage: { pageKind: 'article', evidence: sp.evidence, ruleIds: sp.ruleIds },
    }
  }

  if (pn >= 2 && ev <= 1) {
    factKind = 'product_news'
    confidence = contradiction.length > 0 ? 'medium' : pn >= 3 ? 'high' : 'medium'
    reasons.push(`product_news シグナル ${pn} 件、event シグナル ${ev} 件`)
  } else if (ev >= 2 && pn <= 1) {
    factKind = 'event'
    confidence = contradiction.length > 0 ? 'medium' : ev >= 3 ? 'high' : 'medium'
    reasons.push(`event シグナル ${ev} 件、product_news シグナル ${pn} 件`)
  } else {
    factKind = 'unknown'
    confidence = 'low'
    if (ev >= 2 && pn >= 2) reasons.push(`event（${ev}）と product_news（${pn}）の両方に強いシグナル＝矛盾のため unknown`)
    else reasons.push(`いずれのタイプも 2 件以上のシグナルが揃わない（event ${ev} / product_news ${pn}）＝unknown`)
  }
  if (contradiction.length > 0) reasons.push(`矛盾シグナル: ${contradiction.join(' / ')}`)
  if (trustedSource) reasons.push('出典は公式/一次情報源')
  if (sp.evidence.length > 0 && sp.ruleIds[0] !== 'no_url') reasons.push(`ページ種別判定: ${sp.pageKind}（${sp.evidence.join(' ／ ')}）`)

  return {
    factKind,
    confidence,
    reasons,
    signals: { event: evSignals, productNews: pnSignals, contradiction },
    sourcePage:
      sp.ruleIds[0] === 'no_url'
        ? null
        : { pageKind: sp.pageKind, evidence: sp.evidence, ruleIds: sp.ruleIds },
  }
}
