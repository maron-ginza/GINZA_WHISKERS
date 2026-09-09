// GINZA WHISKERS / Project 02 P0 続き5（2026-09-02）— product_news 用の構造化事実抽出（決定的・AI なし）。
//
// factKind==='product_news' の候補だけを受け取り、**商品ニュース用の必須項目**で構造化する。
// event 用 EventArticleFields は一切要求しない。DB へは書かない（event 用 ArticleFacts にも登録しない）。
//
// 【安全条件】
//   ・推測補完しない。DiscoveredContent の機械値から確定できる項目だけ埋める。
//   ・「未確認（unknown）」と「公式に該当なし（該当なし＝このタイプに不要）」を区別する。
//   ・商品ニュースへ イベント会場・イベント時刻・申込期限・定員・体験時間・ハッシュタグ・
//     eventName を要求しない（notApplicable として明示）。
//   ・外部ページの本文中の命令・コードは実行しない。AI API を使わない。追加課金しない。

import type { DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'
import { suspectListingDate } from './suspectListingDate'
import type { ImagePreflightResult, OfficialPageSignals, ProductNewsFactsCandidate } from './types'

export interface ExtractProductInput {
  dc: DiscoveredContentLike
  image: ImagePreflightResult
  officialSignals?: OfficialPageSignals | null
  /** 出典ホストが SOURCE LEDGER にあるか */
  trustedSource?: boolean
  now?: Date
}

function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function iso(v: unknown): string | null {
  const x = s(v)
  if (!x) return null
  return Number.isNaN(new Date(x).getTime()) ? null : x
}
function t(v: string | null): number | null {
  if (!v) return null
  const n = new Date(v).getTime()
  return Number.isNaN(n) ? null : n
}

/** 商品ニュース必須（ユーザー確定リスト）。会場・時刻・申込・定員・体験時間・ハッシュタグ・eventName は含めない。 */
const PRODUCT_REQUIRED = [
  'productName（商品名）',
  'brandOrSeller（ブランド名または販売主体）',
  'salesLocation（販売場所・フロア）',
  'saleStartAt（販売開始日）',
  'saleEndAt または limitedTime（販売終了日／期間限定の有無）',
  'price（価格）',
  'productSummary（商品概要）',
  'purchaseConditions（購入・販売条件）',
  'stockNotes（在庫・売切れに関する注意）',
] as const

// 完売ワークショップ・公募情報の語（sale 記事の事実・概要には採用しない）
const WS_SOLDOUT_RE = /完売|満席|定員|申込|応募|抽選|エントリー|ワークショップ|体験会|所要時間|参加費|要予約|受付終了|お申込み/

/** 価格1件（商品名は canonical spelling へ正規化済み） */
export interface TsutayaPriceItem {
  name: string
  yen: string
  /** 元ページの表記（正規化前）。canonical と違うときのみ入る */
  pageSpelling?: string
}

/**
 * store.tsite.jp（銀座 蔦屋書店）の販売フェアページ本文から、商品ニュース必須項目を
 * 決定的に抽出する（正規表現のみ・AI なし・#331 専用の値直書きはしない）。
 * ページ末尾の RELATED EVENT / RELATED ITEMS 以降は別商品なので切り落としてから見る。
 */
export function parseTsutayaSaleBody(bodyRaw: string): {
  productSummary?: string
  /** 表示用の価格文字列（canonical spelling・per-name） */
  price?: string
  /** 構造化した価格明細（mapper が用途に応じて整形する） */
  priceItems?: TsutayaPriceItem[]
  salesLocation?: string
  /** 会場（フロア）ラベルだけ（例「文具売り場」） */
  salesFloor?: string
  purchaseConditions?: string
  stockNotes?: string
  limitedTime?: 'yes'
  /** [販売について] から：EC 予約→店頭 で売る商品名 */
  ecThenStoreItems?: string[]
  /** [販売について] から：EC 予約開始 日時（例「2026年8月28日12時」） */
  ecPreorderAt?: string
  /** [販売について] から：店頭販売開始 日付（例「9月4日」） */
  storeStartAt?: string
  /** [販売について] から：店頭のみ（EC なし）で売る商品名 */
  storeOnlyItems?: string[]
  /** 【購入特典】限定表記（例「蔦屋書店・TSUTAYA BOOK STORE限定」） */
  perkScope?: string
  /** 特典：EC 購入は対象外 */
  perkEcExcluded?: boolean
  /** 特典：ポストカードの付与条件（例「対象商品1本につき1枚」） */
  perkPostcard?: string
  /** 特典：オリジナルショッパーの付与条件（例「1会計につき1枚」） */
  perkShopper?: string
  /** 特典：ショッパーは先着順・なくなり次第終了 */
  perkShopperFirstCome?: boolean
  /** 記念ワークショップが完売している */
  wsSoldOut?: boolean
  /** 会期の終了日が変更されうる旨の注記がある */
  endDateVariable?: boolean
  /** 会期の開始表示（例「2026年9月4日」） */
  saleYear?: string
  rawHits: Record<string, string>
} {
  const cut = (() => {
    let idx = bodyRaw.length
    for (const m of ['一覧に戻る', 'RELATED EVENT', 'RELATED ITEMS', 'メルマガ登録はこちら']) {
      const i = bodyRaw.indexOf(m)
      if (i >= 0 && i < idx) idx = i
    }
    return bodyRaw.slice(0, idx)
  })()
  const norm = cut.replace(/\r/g, '').replace(/[ \t　]+/g, ' ')
  const out: ReturnType<typeof parseTsutayaSaleBody> = { rawHits: {} }

  // 概要リード（[商品紹介] / [ワークショップ] / 【購入特典 / ■ より前の段落。WS・完売文は除外）
  const leadZone = norm.split(/\[\s*商品紹介\s*\]|\[\s*ワークショップ\s*\]|【\s*購入特典|■/)[0] ?? ''
  const leadClean = leadZone
    .replace(/^[\s\S]*?メインコンテンツへ移動/, '')
    .split(/(?<=。)/)
    .map((x) => x.trim())
    .filter((x) => x && !WS_SOLDOUT_RE.test(x) && !/^\|/.test(x) && x.length >= 6 && /[。]$/.test(x))
  if (leadClean.length) {
    let acc = ''
    for (const sen of leadClean) {
      if ((acc + sen).length > 170) break
      acc += sen
    }
    if (acc.length >= 10) {
      out.productSummary = acc
      out.rawHits.productSummary = acc.slice(0, 60)
    }
  }

  // 表記ゆれの canonical：リード段落に出てくる綴りを正とする（例 monocrome→monochrome library）
  const editDistance = (a: string, b: string): number => {
    const m = a.length
    const n = b.length
    const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) d[i][0] = i
    for (let j = 0; j <= n; j++) d[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      }
    }
    return d[m][n]
  }
  const leadEnglishTokens = [...leadZone.matchAll(/[A-Za-z][A-Za-z]{2,}(?:[ .-][A-Za-z]{2,})*/g)].map((x) => x[0])
  const canonicalName = (raw: string): { canonical: string; pageSpelling?: string } => {
    const t = raw.trim()
    const eng = t.match(/[A-Za-z][A-Za-z]{2,}(?:[ .-][A-Za-z]{2,})*/)
    if (!eng) return { canonical: t }
    const w = eng[0]
    let best: string | null = null
    for (const cand of leadEnglishTokens) {
      if (cand.toLowerCase() === w.toLowerCase()) return { canonical: t } // 既に一致
      const dist = editDistance(w.toLowerCase(), cand.toLowerCase())
      if (dist >= 1 && dist <= 2 && Math.abs(cand.length - w.length) <= 2) {
        if (!best || cand.length > best.length) best = cand
      }
    }
    if (best) return { canonical: t.replace(w, best), pageSpelling: t }
    return { canonical: t }
  }

  // 価格：販売セクション（[商品紹介]〜[購入特典]/[ワークショップ]）内の「「名称」：N,NNN円(税込)」
  const priceZone = (norm.match(/\[\s*商品紹介\s*\][\s\S]{0,700}?(?=【\s*購入特典|\[\s*ワークショップ\s*\]|\[\s*販売について\s*\]|\[\s*プロフィール\s*\])/) ?? [''])[0]
  const priceHits: TsutayaPriceItem[] = []
  const priceRe = /[「『]([^」』]{1,30})[」』]\s*[：:]\s*([\d,]+)\s*円\s*[（(]\s*税込\s*[）)]/g
  let pm: RegExpExecArray | null
  while ((pm = priceRe.exec(priceZone)) !== null) {
    const { canonical, pageSpelling } = canonicalName(pm[1])
    priceHits.push({ name: canonical, yen: pm[2], pageSpelling })
  }
  if (priceHits.length) {
    out.priceItems = priceHits
    out.price = priceHits.map((h) => `${h.name}：${h.yen}円（税込）`).join('／')
    out.rawHits.price = `${priceHits[0].pageSpelling ?? priceHits[0].name}：${priceHits[0].yen}円（税込）`
    const varied = priceHits.filter((h) => h.pageSpelling).map((h) => `${h.pageSpelling}→${h.name}`)
    if (varied.length) out.rawHits.priceSpellingNormalized = varied.join(' / ')
  }

  // 販売場所：「場所\n文具売り場」等（会期／時間／場所／主催 が近接するメタ枠）＋店舗名
  const metaZone = (norm.match(/会期[\s\S]{0,400}?問い合わせ先[\s\S]{0,40}/) ?? [''])[0]
  const placeM = metaZone.match(/場所\s*\n?\s*([^\n]{1,24})/) || norm.match(/場所\s*\n?\s*([^\n]{1,24})/)
  if (placeM && placeM[1].trim() && !/銀座\s*蔦屋書店/.test(placeM[1])) {
    out.salesFloor = placeM[1].trim()
    out.salesLocation = `銀座 蔦屋書店 ${placeM[1].trim()}（GINZA SIX 6F）`
    out.rawHits.salesLocation = `場所 ${placeM[1].trim()}`
  } else if (placeM && /銀座\s*蔦屋書店/.test(placeM[1])) {
    out.salesLocation = placeM[1].trim()
    out.rawHits.salesLocation = placeM[0].slice(0, 60)
  }

  // 会期の年月日（開始・表示用）。会期直後の最初の日付だけを見る（非貪欲・短い窓）
  const yr = norm.match(/会期\s{0,3}(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (yr) out.saleYear = `${yr[1]}年${Number(yr[2])}月${Number(yr[3])}日`
  const saleYearNum = yr ? `${yr[1]}年` : ''

  // --- [販売について] ブロック（EC 予約→店頭 / 店頭のみ） ---
  const sellZone = (norm.match(/\[\s*販売について\s*\][\s\S]{0,600}?(?=\[\s*プロフィール\s*\]|＼|会期\s*\n)/) ?? [''])[0]
  if (sellZone) {
    // 予約受付開始 日時（例「8月28日(金)12時」）— 日と時の間に数字を挟ませない
    const ecPre = sellZone.match(/(\d{1,2})月(\d{1,2})日[^\d\n]{0,6}(\d{1,2})時[^\n]{0,20}EC[^\n]{0,10}予約受付開始/)
    const stStart = sellZone.match(/(\d{1,2})月(\d{1,2})日[^\d\n]{0,8}店頭販売開始/)
    if (ecPre) out.ecPreorderAt = `${saleYearNum}${Number(ecPre[1])}月${Number(ecPre[2])}日${Number(ecPre[3])}時`
    if (stStart) out.storeStartAt = `${Number(stStart[1])}月${Number(stStart[2])}日`
    // ■<商品名>… ブロック単位で、次の ■ までを見る（隣の商品の注記を拾わない）
    const heads = [...sellZone.matchAll(/■\s*([^\n■]{1,40})/g)]
    const ecThenStore: string[] = []
    const storeOnly: string[] = []
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i][1].trim()
      const from = (heads[i].index ?? 0) + heads[i][0].length
      const to = i + 1 < heads.length ? (heads[i + 1].index ?? sellZone.length) : sellZone.length
      const block = sellZone.slice(from, to)
      const names = h.split(/[・、,]/).map((x) => x.trim()).filter(Boolean).map((n) => canonicalName(n).canonical)
      const hasEcPre = /EC[^\n]{0,10}予約/.test(block)
      const ecNone = /ECサイトでの販売はございません|EC[^\n]{0,6}販売[^\n]{0,6}ございません/.test(block)
      if (hasEcPre && !ecNone) ecThenStore.push(...names)
      else if (/店頭販売開始/.test(block)) storeOnly.push(...names)
    }
    if (ecThenStore.length) out.ecThenStoreItems = [...new Set(ecThenStore)]
    const so = [...new Set(storeOnly)].filter((n) => !ecThenStore.includes(n))
    if (so.length) out.storeOnlyItems = so
  }

  // --- 【購入特典…】ブロック（WS の申込は含めない） ---
  const perkZone = (norm.match(/【\s*購入特典[^】]*】[\s\S]{0,500}?(?=\[\s*ワークショップ\s*\]|\[\s*販売について\s*\]|＼)/) ?? [''])[0]
  if (perkZone) {
    const scope = perkZone.match(/【\s*購入特典（([^）]+)）】/)
    if (scope) out.perkScope = scope[1].trim()
    out.perkEcExcluded = /EC[^\n]{0,6}(?:ご購入|購入)[^\n]{0,6}特典対象外|特典対象外/.test(perkZone)
    const pc = perkZone.match(/ポストカード[\s\S]{0,80}?(\d\s*本[^。\n]{0,10}(?:1|１)\s*枚|対象商品\s*(?:1|１)\s*本[^。\n]{0,8}(?:1|１)\s*枚)/)
    if (pc || /ポストカード/.test(perkZone)) out.perkPostcard = '対象商品1本につき1枚'
    if (/オリジナルショッパー/.test(perkZone)) out.perkShopper = '1会計につき1枚'
    out.perkShopperFirstCome = /先着順[^\n]{0,10}なくなり次第終了/.test(perkZone)
    // 既存の緩い抽出も維持（後方互換）
    const cond = perkZone.split(/\n/).map((x) => x.trim()).filter((x) => x && !WS_SOLDOUT_RE.test(x)).join(' ').replace(/\s{2,}/g, ' ').slice(0, 180)
    if (/特典|限定|プレゼント/.test(cond)) {
      out.purchaseConditions = cond
      out.rawHits.purchaseConditions = cond.slice(0, 60)
    }
    const stock = perkZone.match(/[^\n]*なくなり次第終了[^\n]*/)
    if (stock) {
      out.stockNotes = stock[0].trim().slice(0, 120)
      out.rawHits.stockNotes = out.stockNotes
    }
  }

  // 記念ワークショップの完売
  out.wsSoldOut = /ワークショップ[\s\S]{0,400}?(?:お申込みは完売|申込みは完売|完売いたしました)/.test(norm)

  // 会期の終了日が変更されうる
  out.endDateVariable = /終了日は変更になる場合があります|会期は変更[^\n]{0,10}場合があります/.test(norm)

  // 期間限定：会期に明確な終了日がある
  if (/会期[\s\S]{0,80}\d{4}年\d{1,2}月\d{1,2}日[\s\S]{0,20}[-–—~〜～][\s\S]{0,20}\d{1,2}月\d{1,2}日/.test(norm)) {
    out.limitedTime = 'yes'
  }

  return out
}

/**
 * parseTsutayaSaleBody の構造化結果から officialInfoNote を **confirmed 事実だけ**で
 * 決定的に組み立てる（sale 共通・#331 専用ではない）。組める節が2つ未満なら undefined。
 */
export function composeSaleOfficialInfoNote(p: ReturnType<typeof parseTsutayaSaleBody>): string | undefined {
  const parts: string[] = []
  if (p.ecThenStoreItems && p.ecThenStoreItems.length && (p.ecPreorderAt || p.storeStartAt)) {
    const items = p.ecThenStoreItems.join('、')
    const ec = p.ecPreorderAt ? `${p.ecPreorderAt}からEC予約受付` : ''
    const st = p.storeStartAt ? `${p.storeStartAt}から店頭販売` : ''
    parts.push(`${items}は、${[ec, st].filter(Boolean).join('、')}。`)
  }
  if (p.storeOnlyItems && p.storeOnlyItems.length && p.storeStartAt) {
    parts.push(`${p.storeOnlyItems.join('、')}は${p.storeStartAt}から店頭のみで販売します。`)
  }
  if (p.perkScope || p.perkEcExcluded || p.perkPostcard || p.perkShopper) {
    const seg: string[] = []
    if (p.perkScope) seg.push(`購入特典は${p.perkScope}で、EC購入は対象外です。`)
    else if (p.perkEcExcluded) seg.push(`購入特典のEC購入は対象外です。`)
    const pcs: string[] = []
    if (p.perkPostcard) pcs.push(`ポストカードは${p.perkPostcard}`)
    if (p.perkShopper) pcs.push(`オリジナルショッパーは${p.perkShopper}`)
    if (pcs.length) {
      let sent = pcs.join('、')
      if (p.perkShopperFirstCome) sent += 'で、ショッパーは先着順・なくなり次第終了です。'
      else sent += 'です。'
      seg.push(sent)
    }
    parts.push(seg.join(''))
  }
  if (p.wsSoldOut) parts.push('記念ワークショップは完売しています。')
  if (p.endDateVariable) parts.push('フェア終了日は変更される場合があります。')
  return parts.length >= 2 ? parts.join('') : undefined
}

/** ginza6.tokyo の商品名＋価格 1件 */
export interface GinzaSixPriceItem {
  name: string
  yen: string
}

/**
 * ginza6.tokyo（GINZA SIX）の商品ニュースページ本文から、商品ニュース必須項目の一部を
 * 決定的に抽出する（正規表現のみ・AI なし、2026-09-07根本改善）。
 *
 * 【重要】このページ形式には明示的な「販売期間」ラベルが無く、末尾の「YYYY.MM.DD UP」は
 * 記事の掲載日であって販売開始日ではない——販売期間（saleStartAt/saleEndAt）は
 * この関数では一切推測抽出しない（人間が公式で確認する対象のまま残す）。
 * 抽出するのは、本文中に明示された商品名・価格・フロア・商品概要のみ。
 */
export function parseGinzaSixSaleBody(bodyRaw: string): {
  /** 表示用の価格文字列（複数商品は「／」区切り） */
  price?: string
  priceItems?: GinzaSixPriceItem[]
  /** 「店舗名 フロア: XF」の店舗名部分 */
  storeName?: string
  /** フロア表記（例 "B1F" "3F"） */
  salesFloor?: string
  /** 店舗名＋フロアを結合した販売場所（例「花西子 FLORASIS GINZA フロア: B1F」） */
  salesLocation?: string
  /** 商品概要（WS・完売・申込語を含む文は除外） */
  productSummary?: string
  rawHits: Record<string, string>
} {
  const norm = bodyRaw.replace(/\r/g, '').replace(/[ \t　]+/g, ' ')
  const out: ReturnType<typeof parseGinzaSixSaleBody> = { rawHits: {} }

  // 商品名＋価格：「<商品名> 価格：N,NNN円(税込)」の並び（複数商品可）。
  // 直前の商品の末尾（カラー／サイズ表記）を巻き込まないよう、商品名側は短めの窓に限定する。
  const priceRe = /([^\n。]{2,40}?)\s*価格[：:]\s*([\d,，]{3,10})\s*円\s*[（(]\s*税込\s*[）)]/g
  const priceHits: GinzaSixPriceItem[] = []
  let pm: RegExpExecArray | null
  while ((pm = priceRe.exec(norm)) !== null) {
    const name = pm[1].trim().replace(/^.*(?:サイズ|カラー)[：:][^\s]+\s*/, '') // 前の商品のカラー/サイズが混入した場合の保険
    const yen = pm[2].replace(/[，,]/g, '')
    if (name.length >= 2) priceHits.push({ name, yen })
  }
  if (priceHits.length) {
    out.priceItems = priceHits
    out.price = priceHits.map((h) => `${h.name}：${Number(h.yen).toLocaleString('en-US')}円（税込）`).join('／')
    out.rawHits.price = `${priceHits[0].name}：${priceHits[0].yen}円（税込）`
  }

  // 店舗名＋フロア：「<店舗名> フロア: XF」（店舗情報こちら の直前に現れる）
  const floorRe = /([^\n。]{2,40}?)\s*フロア[：:]\s*(B?\d{1,2}F)/
  const floorM = floorRe.exec(norm)
  if (floorM) {
    out.storeName = floorM[1].trim()
    out.salesFloor = floorM[2].trim()
    out.salesLocation = `${out.storeName} フロア: ${out.salesFloor}`
    out.rawHits.salesLocation = floorM[0].trim()
  }

  // 商品概要：店舗名見出し〜最初の「価格：」出現より前の文（WS・完売・申込語は除外、句点区切り）
  const leadZone = priceHits.length ? norm.split(/価格[：:]/)[0] : norm.slice(0, 400)
  const leadClean = leadZone
    .split(/(?<=。)/)
    .map((x) => x.trim())
    .filter((x) => x && !WS_SOLDOUT_RE.test(x) && x.length >= 8 && /。$/.test(x))
  if (leadClean.length) {
    let acc = ''
    for (const sen of leadClean) {
      if ((acc + sen).length > 170) break
      acc += sen
    }
    if (acc.length >= 10) {
      out.productSummary = acc
      out.rawHits.productSummary = acc.slice(0, 60)
    }
  }

  return out
}

/** event 由来で product_news には不要な概念（未確認とは区別する＝「該当なし」） */
const EVENT_ONLY_NOT_APPLICABLE = [
  'eventName（イベント名：商品ニュースには不要）',
  'イベント会場（venue：商品ニュースには不要。販売場所は salesLocation で扱う）',
  'イベント時刻（eventTime：商品ニュースには不要）',
  '申込期限（applyDeadline：商品ニュースには不要）',
  '定員（商品ニュースには不要）',
  '体験時間（所要時間：商品ニュースには不要）',
  'ハッシュタグ（product_news の ready 必須ではない）',
]

export function extractProductNewsFactsCandidate(input: ExtractProductInput): ProductNewsFactsCandidate {
  const { dc, image } = input
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const sig = input.officialSignals ?? null
  const capturedAt = s(dc.lastCheckedAt) ?? s(dc.detectedAt)
  const srcUrl = /^https?:\/\/\S+$/.test(dc.articleUrl ?? '') ? (dc.articleUrl as string) : null
  const trustedSource = input.trustedSource ?? false

  // 機械値から取れるもの：出典・確認日時・（shopnews の）販売期間候補
  //   2026-09-07根本改善：extractArticleFactsCandidate.ts と同じ判定（suspectListingDate）を
  //   適用する。1ページに複数記事が並ぶリスティング型サイト（GINZA SIX 等）で body_label 由来・
  //   confidence が high でない場合、DC の会期を信用せず JSON-LD があればそちらだけを使う
  //   （#369/#370 で実際に確認：別記事＝UNO YOSHIHIKO個展／KOH SANVERの開催期間を拾っていた）。
  const isSuspectListingDate = suspectListingDate({ articleUrl: dc.articleUrl, dateExtraction: dc.dateExtraction })
  const jsonLdStart = sig?.ok ? iso(sig.jsonLdEventStart) : null
  const jsonLdEnd = sig?.ok ? iso(sig.jsonLdEventEnd) : null
  const saleStartAt = isSuspectListingDate ? jsonLdStart : (iso(dc.eventStartAt) ?? jsonLdStart)
  const saleEndAt = isSuspectListingDate ? jsonLdEnd : (iso(dc.eventEndAt) ?? jsonLdEnd)

  const fields: ProductNewsFactsCandidate['fields'] = {
    productName: null, // excerpt からのあいまい抽出はしない（推測補完しない）
    brandOrSeller: null,
    salesLocation: null,
    saleStartAt,
    saleEndAt,
    limitedTime: 'unknown',
    price: null,
    productSummary: null,
    purchaseConditions: null,
    stockNotes: null,
    sourceName: s(dc.sourceSiteName),
    sourceUrl: srcUrl,
    verifiedAt: capturedAt,
    saleAvailability: 'unknown',
  }

  // --- store.tsite.jp（銀座 蔦屋書店）の公式ページ本文からの決定的抽出（あれば） ---
  const host = (() => {
    try {
      return new URL(dc.articleUrl ?? '').hostname.toLowerCase()
    } catch {
      return ''
    }
  })()
  let tsutayaHits: Record<string, string> = {}
  let ginzaSixHits: Record<string, string> = {}
  let siteParsed: Record<string, unknown> | null = null
  let composedOfficialInfoNote: string | undefined

  // 商品／シリーズ名：タイトルから決定的に（【フェア】等の角括弧・「…開幕」を除去）。
  // サイト固有ではなく、本文が取得できていればどのサイトでも同じ方法で確認する
  // （タイトルの一部が実際に本文へ現れているかを照合してから採用＝推測ではない）。
  if (sig?.ok && s(sig.bodyText)) {
    const bodyTextForTitle = sig.bodyText as string
    const titleName = s(dc.title)
      ?.replace(/^【[^】]*】\s*/, '')
      .replace(/\s*[｜|].*$/, '')
      .replace(/\s*[–—-]\s*GINZA\s*SIX\s*$/i, '') // 「<商品> – GINZA SIX」等のサイト名サフィックスを除去
      .replace(/\s*開幕」\s*$/, '」')
      .replace(/\s*(?:開幕|開催|開催中|スタート)\s*$/, '')
      .trim()
    if (titleName && titleName.length >= 2 && bodyTextForTitle.includes(titleName.replace(/[「」『』\s]/g, '').slice(0, 4))) {
      fields.productName = titleName
    }
  }

  if (host === 'store.tsite.jp' && sig?.ok && s(sig.bodyText)) {
    const p = parseTsutayaSaleBody(sig.bodyText as string)
    siteParsed = p as unknown as Record<string, unknown>
    composedOfficialInfoNote = composeSaleOfficialInfoNote(p)
    tsutayaHits = p.rawHits
    if (p.productSummary) fields.productSummary = p.productSummary
    if (p.price) fields.price = p.price
    if (p.salesLocation) fields.salesLocation = p.salesLocation
    if (p.purchaseConditions) fields.purchaseConditions = p.purchaseConditions
    if (p.stockNotes) fields.stockNotes = p.stockNotes
    if (p.limitedTime === 'yes' && fields.limitedTime === 'unknown') fields.limitedTime = 'yes'
  } else if (host === 'ginza6.tokyo' && sig?.ok && s(sig.bodyText)) {
    // 2026-09-07、根本改善：GINZA SIX の商品ニュースページも同じ「confirmed 事実のみ」原則で
    // 決定的抽出する。販売期間（saleStartAt/saleEndAt）はこのページ形式に明示ラベルが無いため
    // 一切推測しない（末尾の「YYYY.MM.DD UP」は掲載日であり販売開始日ではない）。
    const p = parseGinzaSixSaleBody(sig.bodyText as string)
    siteParsed = p as unknown as Record<string, unknown>
    ginzaSixHits = p.rawHits
    if (p.productSummary) fields.productSummary = p.productSummary
    if (p.price) fields.price = p.price
    if (p.salesLocation) fields.salesLocation = p.salesLocation
  }

  // --- 商品名の上書き（2026-09-07根本改善・host非依存）：ページに商品が1点だけのときは、
  //   タイトル（キャンペーン見出しのことが多い）より、価格直前に現れる商品名そのものを優先する
  //   （例：タイトル「新作 洛花飛霞 チークで自然な血色感を。」より本文の「洛花飛霞(ラクカヒカ)
  //   チーク 14パープルロータス」の方が具体的・確定的）。複数商品のページ（例：キャップ3色）は
  //   「どれが the 商品か」を機械的に決められないため、タイトル（シリーズ名）のままにする。 ---
  {
    const priceItems = (siteParsed as { priceItems?: { name?: string }[] } | null)?.priceItems
    if (priceItems && priceItems.length === 1 && priceItems[0]?.name && priceItems[0].name!.length >= 2) {
      fields.productName = priceItems[0].name!
    }
  }

  // --- 販売終了日の記載状況（2026-09-07根本改善。host非依存・決定的） ---
  // 「発売中/販売中」の明記があり、かつ完売・数量限定・期間限定等の終了を示す語が
  // 本文に無い場合に限り「終了日は公式記載なし（販売中）」と確定する。それ以外は
  // 一切推測しない（'unknown' のまま人間が公式で確認する）。
  if (sig?.ok && s(sig.bodyText)) {
    const bodyForAvailability = sig.bodyText as string
    // 既存の ongoing_no_end_stated 判定は従来どおり本文全体で（挙動不変）。
    const hasOngoingMarker = /発売中|販売中|好評発売中/.test(bodyForAvailability)
    const hasEndSignal =
      /完売|売り切れ|品切れ|数量限定|個数限定|期間限定|なくなり次第終了|残りわずか|早期終了/.test(bodyForAvailability) ||
      fields.limitedTime === 'yes' ||
      !!fields.saleEndAt
    // 2026-09-09 no_period_stated 判定は「記事本文だけ」を見る：末尾のナビ（RECENT POSTS /
    // 関連記事 / カテゴリー一覧 / RELATED / 一覧に戻る）以降は別記事の会期ラベル・日付が並ぶため
    // 切り落とす（ginza6.tokyo のリスティングノイズ対策。dateExtraction の suspectListingDate と同じ発想）。
    const mainBodyForAvailability = (() => {
      let idx = bodyForAvailability.length
      for (const mk of ['RECENT POSTS', 'RECENT POST', '関連記事', 'RELATED EVENT', 'RELATED ITEMS', '一覧に戻る', 'カテゴリー\n', 'All News', 'メルマガ登録はこちら']) {
        const i = bodyForAvailability.indexOf(mk)
        if (i >= 0 && i < idx) idx = i
      }
      return bodyForAvailability.slice(0, idx)
    })()
    // 末尾の「YYYY.MM.DD UP」は掲載日なので日付レンジ検出から除外する（前処理で削る）。
    const bodyNoUp = mainBodyForAvailability.replace(/\d{4}\.\d{1,2}\.\d{1,2}\s*UP/g, ' ')
    const hasPeriodLabel = /会期|開催期間|販売期間|発売日|販売開始|販売終了|募集期間|受付期間/.test(bodyNoUp)
    const hasDateRange = /\d{4}[年./]\s?\d{1,2}[月./]\s?\d{1,2}\s?日?\s*[-–—~〜～]\s*(?:\d{4}[年./]\s?)?\d{1,2}[月./]\s?\d{1,2}/.test(bodyNoUp)
    const hasStoreOnlyMarker = /店頭にて|店頭で|各店舗|店舗にて|お取り扱い|お取扱い|取り扱い中|販売しております|お求めいただけます|ご覧くださ/.test(mainBodyForAvailability)
    if (hasOngoingMarker && !hasEndSignal) {
      fields.saleAvailability = 'ongoing_no_end_stated'
    } else if (fields.saleEndAt) {
      fields.saleAvailability = 'has_end_date'
    } else if (
      !fields.saleStartAt &&
      !fields.saleEndAt &&
      !hasPeriodLabel &&
      !hasDateRange &&
      hasStoreOnlyMarker &&
      !hasEndSignal
    ) {
      fields.saleAvailability = 'no_period_stated'
    }
  }

  const provenance: ProductNewsFactsCandidate['provenance'] = {}
  const put = (key: string, value: string | null, method: string, note = ''): void => {
    if (value == null) return
    provenance[key] = {
      value: note ? `${value}  ※${note}` : value,
      sourceUrl: srcUrl,
      capturedAt,
      verifiedAt: capturedAt,
      method,
      confirmationStatus: 'confirmed',
    }
  }
  put('sourceName', fields.sourceName, 'DiscoveredContent.sourceSite.name')
  put('sourceUrl', fields.sourceUrl, 'DiscoveredContent.articleUrl')
  put('verifiedAt', fields.verifiedAt, 'DiscoveredContent.lastCheckedAt/detectedAt')
  // サイト本文由来（決定的抽出。confirmed）。host により store.tsite.jp / ginza6.tokyo の
  // どちらのパーサーが効いたかを method 文言に明示する。
  const siteLabel = host === 'store.tsite.jp' ? 'tsutaya' : host === 'ginza6.tokyo' ? 'ginza6' : host || 'site'
  if (fields.productName) put('productName', fields.productName, `${siteLabel}: タイトル（角括弧・「開幕」除去）を本文で照合`)
  if (fields.productSummary)
    put(
      'productSummary',
      fields.productSummary,
      `${siteLabel} body: リード段落（WS・完売文は除外）${(tsutayaHits.productSummary ?? ginzaSixHits.productSummary) ? ` 「${tsutayaHits.productSummary ?? ginzaSixHits.productSummary}…」` : ''}`,
    )
  if (fields.price)
    put(
      'price',
      fields.price,
      `${siteLabel} body: 「名称」価格：N円（税込）${(tsutayaHits.price ?? ginzaSixHits.price) ? ` 例「${tsutayaHits.price ?? ginzaSixHits.price}」` : ''}`,
    )
  if (fields.salesLocation)
    put(
      'salesLocation',
      fields.salesLocation,
      `${siteLabel} body: ${host === 'ginza6.tokyo' ? '「店舗名 フロア: XF」表記' : 'メタ枠「場所」＋店舗名'}${(tsutayaHits.salesLocation ?? ginzaSixHits.salesLocation) ? ` 「${tsutayaHits.salesLocation ?? ginzaSixHits.salesLocation}」` : ''}`,
    )
  if (fields.purchaseConditions) put('purchaseConditions', fields.purchaseConditions, `${siteLabel} body: 【購入特典…】ブロック（WS 申込は除外）`)
  if (fields.stockNotes) put('stockNotes', fields.stockNotes, `${siteLabel} body: 「なくなり次第終了」明記`)
  if (composedOfficialInfoNote)
    put('officialInfoNote', composedOfficialInfoNote, `${siteLabel} body: [販売について]＋【購入特典】＋ワークショップ完売＋会期注記を confirmed 事実だけで合成（composeSaleOfficialInfoNote）`)
  if (tsutayaHits.priceSpellingNormalized)
    put('priceSpellingNormalized', tsutayaHits.priceSpellingNormalized, 'tsutaya body: [商品紹介]の綴りをリード段落の canonical へ正規化（元表記→正）')
  if (fields.saleAvailability === 'ongoing_no_end_stated')
    put(
      'saleAvailability',
      'ongoing_no_end_stated',
      `${siteLabel} body: 「発売中/販売中」の明記あり、完売・数量限定・期間限定等の終了を示す語なし（決定的判定・推測ではない）`,
    )
  else if (fields.saleAvailability === 'no_period_stated')
    put(
      'saleAvailability',
      'no_period_stated',
      `${siteLabel} body: 販売期間ラベル・日付レンジが本文に一切なく、店頭取扱等の販売明示のみ＝「販売期間の公式記載なし」を確認（決定的判定・推測ではない。掲載日「YYYY.MM.DD UP」は除外）`,
    )
  // 販売期間候補は「開催期間ラベル」由来で、当該記事のものか不明瞭なことがある → 注記を必ず添える
  const dateNote = '「開催期間」ラベルからの抽出。ページ内の別記事の期間を拾っている可能性あり（要人間確認）'
  put('saleStartAt', fields.saleStartAt, 'DiscoveredContent.eventStartAt（dateExtraction）', dateNote)
  put('saleEndAt', fields.saleEndAt, 'DiscoveredContent.eventEndAt（dateExtraction）', dateNote)

  const detailPage: ProductNewsFactsCandidate['detailPage'] = {
    url: srcUrl,
    lastCrawledAt: capturedAt,
    activeFetch: sig ?? null,
  }

  // 矛盾チェック（検出のみ・推測しない）
  const conflicts: string[] = []
  const st = t(fields.saleStartAt)
  const en = t(fields.saleEndAt)
  if (st != null && en != null && st > en) conflicts.push(`販売開始 > 終了（${fields.saleStartAt} > ${fields.saleEndAt}）`)
  // 「発売中」型で日付範囲が本文に無いのに 4 か月超の期間が付いている → 別記事由来の疑い
  const hasSellingNow = /発売中|販売中|好評発売中/.test(dc.excerpt ?? '')
  const hasDateRange = /\d{4}[.\/]\d{1,2}[.\/]\d{1,2}\s*[-〜~]\s*\d{4}[.\/]\d{1,2}[.\/]\d{1,2}/.test(dc.excerpt ?? '')
  if (fields.saleStartAt && fields.saleEndAt && hasSellingNow && !hasDateRange)
    conflicts.push('本文に「発売中」表記があり、本文には明確な会期の日付範囲が無いのに販売期間が設定されている（dateExtraction が別記事の期間を拾った疑い・要人間確認）')

  // 未確認（人間が admin で入力） vs 公式記載なし（確認済み） vs 取得失敗（再取得で解消しうる）
  const unknownItems: string[] = []
  const officiallyNotStated: string[] = []
  const missingBecauseFetchFailed: string[] = []
  const fetchTriedButFailed = !!sig && sig.requested === true && sig.ok !== true
  const noteFetchFailed = fetchTriedButFailed
    ? `（公式ページ取得失敗 fetchOutcome=${sig?.fetchOutcome ?? 'unknown'}。再取得で解消しうる）`
    : ''
  if (!fields.productName) unknownItems.push('productName（商品名。excerpt にあるが推測抽出しない・公式で人間が確定）')
  if (!fields.brandOrSeller) unknownItems.push('brandOrSeller（ブランド名／販売主体。公式で人間が確定）')
  if (!fields.salesLocation) unknownItems.push('salesLocation（販売場所・フロア。excerpt に「フロア: ◯F」があるが人間が確定）')
  if (!fields.price) unknownItems.push('price（価格。excerpt にあるが人間が確定）')
  if (!fields.productSummary) unknownItems.push('productSummary（商品概要。公式本文から人間がまとめる）')
  if (!fields.purchaseConditions) unknownItems.push('purchaseConditions（購入・販売条件。公式で人間が確認）')
  if (!fields.stockNotes) unknownItems.push('stockNotes（在庫・売切れの注意。公式で人間が確認）')
  // 販売期間の扱い：no_period_stated（取得成功＋期間記載なしを確認）と、取得失敗を明確に分ける。
  if (fields.saleAvailability === 'no_period_stated') {
    officiallyNotStated.push(
      'saleStartAt / saleEndAt（販売期間）：公式ページに販売期間ラベル・日付レンジの記載なし（店頭取扱商品）。この記事タイプでは A 判定の必須にしない',
    )
  } else if (fetchTriedButFailed) {
    if (!fields.saleStartAt) missingBecauseFetchFailed.push(`saleStartAt（販売開始日）${noteFetchFailed}`)
    if (!fields.saleEndAt) missingBecauseFetchFailed.push(`saleEndAt／limitedTime（販売終了日・期間限定）${noteFetchFailed}`)
  } else {
    if (!fields.saleStartAt) unknownItems.push('saleStartAt（販売開始日。公式で人間が確認）')
    if (fields.saleStartAt && fields.saleEndAt && hasSellingNow && !hasDateRange)
      unknownItems.push('saleEndAt／limitedTime（現在の販売期間は別記事由来の疑い。公式で「発売中（終了日なし）」か会期があるかを人間が確認）')
    else if (fields.saleAvailability === 'ongoing_no_end_stated')
      officiallyNotStated.push(
        'saleEndAt（販売終了日。公式本文に「発売中/販売中」の明記があり、完売・数量限定等の終了を示す語がないため、終了日は「公式記載なし」と確定）',
      )
    else if (!fields.saleEndAt) unknownItems.push('saleEndAt／limitedTime（販売終了日・期間限定の有無。公式で人間が確認）')
  }

  const notApplicable = [...EVENT_ONLY_NOT_APPLICABLE]

  // ready 判定の内訳
  const REQ_KEYS = ['sourceName', 'sourceUrl', 'verifiedAt']
  const presentReq = REQ_KEYS.filter((k) => provenance[k])
  const allRequiredPresent = false // 商品固有必須（productName 等）は機械値から埋まらない
  const everyRequiredHasSourceUrl = presentReq.every((k) => !!provenance[k]?.sourceUrl)
  const datesValidNow = (() => {
    const e0 = t(fields.saleEndAt)
    const s0 = t(fields.saleStartAt)
    const ref = e0 ?? s0
    if (ref == null) return true // 「発売中（会期なし）」なら期限切れの概念がない → 判定不能を false 扱いにしない
    return ref >= nowMs
  })()
  const noConflicts = conflicts.length === 0

  const blockers: string[] = []
  blockers.push(
    `product_news 必須（${PRODUCT_REQUIRED.length}項目）のうち機械値から確定できたのは 出典3項目のみ。` +
      'productName / brandOrSeller / salesLocation / price / productSummary / purchaseConditions / stockNotes / ' +
      '販売期間 は公式ページで人間が確定入力する必要がある。',
  )
  if (!trustedSource) blockers.push('出典が SOURCE LEDGER の公式/信頼済みドメインと確認できていない')
  if (!noConflicts) blockers.push(`相互矛盾あり: ${conflicts.join(' / ')}`)

  return {
    discoveredContentId: Number(dc.id),
    factKind: 'product_news',
    fields,
    provenance,
    detailPage,
    imagePolicy: image.policy,
    unknownItems,
    officiallyNotStated,
    missingBecauseFetchFailed,
    notApplicable,
    conflicts,
    readyCheck: {
      allRequiredPresent,
      everyRequiredHasSourceUrl,
      datesValidNow,
      noConflicts,
      trustedSource,
      blockers,
    },
    readyEligible: false, // 機械抽出のみでは常に false。人間が公式で確定入力して初めて ready 候補
    proposedStatus: 'draft',
    siteParsed,
  }
}
