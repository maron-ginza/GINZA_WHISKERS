import type { TextBlock } from '../ai/lexical'
import { formatVerifiedAtForDisplay } from '../ai/generateArticleDraft'
import { isShopnewsUrl, officialPageLabel } from './polishArticleDraft'
import type { EventArticleFields } from './templates'

// GINZA WHISKERS / Project 02（2026-09-03、共通 sale renderer）
//
// 【役割】商品販売・フェア（templateType='sale'）の ready な ArticleFacts から、
// 読者向けの 8 セクション構成の記事本文を **決定的に**（AI なし・追加課金 0 円）
// 組み立てる純粋関数。#331 専用の値直書きではなく、今後の sale 記事すべてで使う。
//
//   1. 導入（見出しなしのリード段落）
//   2. EDITOR'S CHOICE | <CATEGORY>
//   3. 何が見つかる？
//   4. WHY NOW?
//   5. GINZA WHISKERS' NOTE
//   6. 基本情報
//   7. 購入について
//   8. SOURCE
//
// 【厳守】
//   ・confirmed 事実（EventArticleFields の値）と、人間承認済み editorial 項目
//     （editorsNoteSeed / areaLead / audienceNote）だけを使う。入力にない事実を足さない。
//   ・同じイベント名・会場・開催日を複数セクションで繰り返さない
//     （会場と会期は「基本情報」に 1 回だけ）。
//   ・officialInfoNote を丸ごと 1 段落で転記しない。句点で分解し、
//     日程・特典・ワークショップ完売を役割ごとに再配置する。ワークショップは
//     「完売」の一文だけ（その句は原文のまま）。申込導線・開催詳細は出さない。
//   ・「入場無料」は書かない（sale は priceText で価格を扱う。paid 区分は未確認のまま）。
//   ・AI / ネットワーク / DB に触れない。同じ入力から必ず同じ出力（決定的）。

export interface SaleSourceMeta {
  sourceName: string
  sourceUrl: string
  verifiedAt?: string
}

export interface SaleArticleResult {
  blocks: TextBlock[]
  /** タイトル案（決定的・3件）。[0] が既定タイトル */
  titleCandidates: string[]
}

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 末尾の句点を 1 つに正規化して付け直す */
function endPunct(x: string): string {
  const t = x.replace(/[。．.\s]+$/u, '')
  return t ? `${t}。` : ''
}

/** 文字列を句点で文に分解（空文は捨てる） */
function splitSentences(x: string): string[] {
  return s(x)
    .split(/。/)
    .map((t) => t.trim())
    .filter(Boolean)
}

// テーマ語（記事の切り口）。より具体的な語を先に。mapSaleFactsToDraft と揃える。
const THEME_KEYWORDS = [
  '十二星座', '星座', '干支', '十二支', '花', '植物', '動物', '鳥', '猫', '犬',
  '宇宙', '天体', '星', '月', '海', '山', '森', '空', '音楽', '文学', '詩', '神話',
  '童話', '絵本', 'レトロ', 'ノスタルジー', '和', '季節', '旅', 'クリスマス', '正月', '新年',
] as const

// テーマ語 → タイトル用のイメージ語（詩的だが事実を足さない範囲の言い換え）
const THEME_IMAGE: Record<string, string> = {
  十二星座: '星空',
  星座: '星空',
  星: '星あかり',
  月: '月あかり',
  花: '花の便り',
  海: '海の色',
  空: '空の色',
}

/** 文脈語から催しの種類語 */
function kindWord(context: string): string {
  if (/フェア|FAIR|fair/.test(context)) return 'フェア'
  if (/ポップアップ|POP ?UP|pop-?up/i.test(context)) return 'ポップアップ'
  if (/展(?:$|[^示])|展示|個展|企画展/.test(context)) return '展示'
  return '催し'
}

/** 官公庁的・広報的な敬体を編集的な常体へ（意味は変えない範囲の言い換え） */
function demarketing(x: string): string {
  return s(x)
    .replace(/いたします/g, 'します')
    .replace(/ご好評をいた?だいた/g, '好評だった')
    .replace(/ご用意しております/g, '用意しています')
}

/** eventName（『』正規化済み想定）→ ブランド名（先頭〜最初の『「（ の直前） */
function brandFromEventName(name: string): string {
  const t = s(name).replace(/^【[^】]*】\s*/, '')
  const m = t.match(/^([^\s　「」『』（(]{2,24})[\s　「」『』（(]/)
  if (m) return m[1].trim()
  return t.split(/\s+/)[0] ?? t
}

/** eventName の『…』/「…」内から末尾の動作語を除いたシリーズ名。
 *  ブラケットが無い場合は「シリーズ名なし」（''）を返す——名称全体（ブランドコラボ名等）を
 *  空白除去して潰すと「AMBUSH® × New Era®」→「xNewEra®」のような壊れた表示になるため。 */
function seriesFromEventName(name: string): string {
  const m = s(name).match(/[「『]([^」』]{2,48})[」』]/)
  if (!m) return ''
  return m[1]
    .replace(/\s*(?:開幕|開催中|開催|スタート|開始|はじまる|始まる|フェア|展)\s*$/u, '')
    .replace(/\s+/g, '')
    .trim()
}

/** 「〜的な表現を避ける」sale か（継続販売中／販売期間の公式記載なし） */
function isProductSale(f: EventArticleFields): boolean {
  return f.saleAvailability === 'ongoing_no_end_stated' || f.saleAvailability === 'no_period_stated'
}

function themeKeywordFrom(text: string): string {
  for (const k of THEME_KEYWORDS) if (text.includes(k)) return k
  return ''
}

/** Primary Category（＋文脈語）→ 記事内で使う名詞 */
function categoryNoun(cat: string, context: string): string {
  if (cat === 'BEAUTY') {
    if (/チーク/.test(context)) return 'チーク'
    if (/ネイル/.test(context)) return 'ネイル'
    if (/香水|フレグランス|パフューム|香り/.test(context)) return '香り'
    if (/コスメ|化粧品|メイク|リップ|アイシャドウ|ファンデ/.test(context)) return 'コスメ'
    if (/スキンケア|美容液|保湿/.test(context)) return 'スキンケア'
    return '美容'
  }
  const map: Record<string, string> = {
    FOOD: 'グルメ', CAFE: 'コーヒー', SHOPPING: '雑貨', GIFT: 'ギフト', ART: 'アート',
    MUSIC: '音楽', WELLNESS: '癒し', EXPERIENCE: '体験', PHOTO: '写真',
  }
  return map[cat] ?? ''
}

/**
 * Primary Category（＋名詞）→ 「どこに」の語（助詞なしの素の形）。
 * タイトルでは `${lead}に、`、本文では `${lead}から` のように助詞を付けて使う。
 */
function categoryLead(cat: string, noun: string): string {
  if (cat === 'BEAUTY') {
    if (noun === 'ネイル') return '指先'
    if (noun === '香り') return 'まとう空気'
    if (noun === 'コスメ') return '顔まわり'
    if (noun === 'スキンケア') return '素肌'
    return '装い'
  }
  const map: Record<string, string> = {
    FOOD: '食卓', CAFE: '一杯', SHOPPING: '暮らし', GIFT: '贈り物',
    ART: '視界', MUSIC: '耳もと', WELLNESS: '呼吸', PHOTO: '一枚',
  }
  return map[cat] ?? '毎日'
}

/** 「銀座 蔦屋書店 文具売り場（GINZA SIX 6F）」→ { store, floor } */
function splitVenue(place: string): { store: string; floor: string } {
  const m = s(place).match(/^(.+?(?:書店|百貨店|ホール|ギャラリー|ストア|美術館|店))[\s　]+(.+?)(?:（|\(|$)/)
  if (m) return { store: m[1].trim(), floor: m[2].trim() }
  const m2 = s(place).match(/^(.+?)(?:（|\()/)
  return { store: (m2 ? m2[1] : s(place)).trim(), floor: '' }
}

/** 「10時30分から21時まで」→「10:30〜21:00」。読めなければ入力のまま */
function normalizeTimeRange(x: string): string {
  const m = s(x).match(/^(\d{1,2})時(?:(\d{1,2})分)?から(\d{1,2})時(?:(\d{1,2})分)?まで$/)
  if (!m) return s(x)
  const pad = (h: string, mi?: string) => `${h}:${(mi ?? '0').padStart(2, '0')}`
  return `${pad(m[1], m[2])}〜${pad(m[3], m[4])}`
}

/** priceText「name：price／name：price」→ [{name, price}]。パースできなければ [] */
function parsePriceItems(priceText: string): { name: string; price: string }[] {
  const t = s(priceText)
  if (!t) return []
  const parts = t.split(/／|\/|、/).map((p) => p.trim()).filter(Boolean)
  const items: { name: string; price: string }[] = []
  for (const p of parts) {
    const m = p.match(/^(.+?)[：:]\s*(.+)$/)
    if (!m) return []
    items.push({ name: m[1].trim(), price: m[2].trim() })
  }
  return items
}

/** 価格アイテムを「A と B が各X、C がY」の日本語へ（同額はまとめる）。件数 0 なら空 */
function priceProse(items: { name: string; price: string }[]): string {
  if (items.length === 0) return ''
  const byPrice = new Map<string, string[]>()
  for (const it of items) {
    const arr = byPrice.get(it.price) ?? []
    arr.push(it.name)
    byPrice.set(it.price, arr)
  }
  const chunks: string[] = []
  for (const [price, names] of byPrice) {
    if (names.length === 1) chunks.push(`${names[0]}が${price}`)
    else chunks.push(`${names.join('と')}が各${price}`)
  }
  return chunks.join('、')
}

// ---------------------------------------------------------------------------
// タイトル案（決定的・3件）。
//   [0] 編集タイトル：<categoryLead>、<season>の<themeImage>を。銀座で<動詞>る<brand>「<series>」
//   [1] シリーズ名＋販売期間
//   [2] ブランド＋テーマ＋名詞
// ---------------------------------------------------------------------------
export function buildTitleCandidatesSale(f: EventArticleFields): string[] {
  const cat = s(f.primaryCategory).toUpperCase()
  const context = `${f.eventName} ${f.whatHappens} ${f.areaLead}`
  const brand = brandFromEventName(f.eventName)
  const series = seriesFromEventName(f.eventName) // ブラケットが無ければ '' （名称を潰さない）
  // series があれば「brand「series」」、無ければ eventName 全体（コラボ名等）を主語にする。
  const subject = series ? `${brand}「${series}」` : s(f.eventName)
  const theme = themeKeywordFrom(context)
  const noun = categoryNoun(cat, context)
  const lead = categoryLead(cat, noun)
  const image = (theme && THEME_IMAGE[theme]) || theme || `${f.season || 'この季節'}の色`
  // 2026-09-07 / 2026-09-09 根本改善：継続販売中／販売期間の公式記載なし の sale では
  // 「始まる／開かれる」という開催・イベント的な動詞を使わない（商品販売をイベントと混同しない）。
  const startsVerb = isProductSale(f)
    ? '見つかる'
    : /始まり|開幕|スタート|オープン/.test(context)
      ? '始まる'
      : '開かれる'
  const seasonWord = s(f.season)

  const t0 = seasonWord
    ? `${lead}に、${seasonWord}の${image}を。銀座で${startsVerb}${subject}`
    : `${lead}に、${image}を。銀座で${startsVerb}${subject}`
  const t1 = f.eventDate.trim()
    ? `${series ? `「${series}」` : subject}、${f.eventDate.trim()}`
    : `${series ? `「${series}」` : subject}、銀座で${startsVerb}`
  const t2 =
    theme && noun
      ? `${series ? `${brand}が贈る${theme}の${noun}——「${series}」` : `${subject}——${theme}の${noun}`}`
      : `${subject}、銀座で`

  return [t0, t1, t2]
}

// ---------------------------------------------------------------------------
// 本文（8 セクション）
// ---------------------------------------------------------------------------
export function buildSaleArticle(f: EventArticleFields, source: SaleSourceMeta): SaleArticleResult {
  const cat = s(f.primaryCategory).toUpperCase()
  const context = `${f.eventName} ${f.whatHappens} ${f.areaLead}`
  const brand = brandFromEventName(f.eventName)
  const series = seriesFromEventName(f.eventName) // ブラケットが無ければ ''
  const subject = series ? `「${series}」` : s(f.eventName) // 導入の主語
  const theme = themeKeywordFrom(context)
  const noun = categoryNoun(cat, context)
  const lead = categoryLead(cat, noun) // 助詞なしの素の形（「指先」）。用途に応じて に / から を付ける
  // 2026-09-07 / 2026-09-09 根本改善：継続販売中／販売期間の公式記載なし の sale では
  // 「催し／フェア／展示」等のイベント的な種類語を使わず、商品として自然な語にする
  // （商品の継続販売をイベントと混同しない）。
  const kind = isProductSale(f) ? '新作' : kindWord(context)
  const seasonWord = s(f.season)
  const seasonAdj = seasonWord ? `${seasonWord}の` : ''
  const { store } = splitVenue(f.venues[0]?.place ?? '')

  const blocks: TextBlock[] = []
  const push = (b: TextBlock) => {
    if (b.type === 'paragraph' && !b.text.trim()) return
    blocks.push(b)
  }

  // --- whatHappens を文に分解して役割ごとに使い分ける ---
  const whSents = splitSentences(f.whatHappens)
  const leadSentence = whSents[0] ?? ''
  // 何が見つかる？ 用：商品・色・弾数・再販に触れた文だけ（launch の言い換え文は導入と重複するので落とす）
  const productLines = whSents
    .slice(1)
    .filter(
      (t) =>
        /新色|新作|限定色|人気色|再販|再登場|第[0-9０-９一二三四五六七八九]+弾|カラー|ラインナップ/.test(t) ||
        parsePriceItems(f.priceText ?? '').some((p) => t.includes(p.name)),
    )
  const productSentences = productLines.length > 0 ? productLines : whSents.slice(1)

  // === 1. 導入（見出しなし・2 段落） ===
  const introTopic = theme
    ? `${theme}をモチーフにした${noun || 'アイテム'}`
    : noun
      ? `${noun}`
      : '新シリーズ'
  // series があれば「brand の 新シリーズ「series」」、無ければ eventName（コラボ名等）そのものを主語に。
  const introSubject = series
    ? `${brand ? `${brand}の` : ''}新シリーズ「${series}」`
    : subject
  push({
    type: 'paragraph',
    text: isProductSale(f)
      ? `${seasonAdj}銀座で、${noun || (theme ? `${theme}のアイテム` : '新しいアイテム')}が手に取れます。${introSubject}です。`
      : `${seasonAdj}銀座に、${introTopic}の${kind}が登場します。${introSubject}です。`,
  })
  push({
    type: 'paragraph',
    text: leadSentence
      ? `${endPunct(leadSentence)}装いを変えなくても、${lead}から${seasonWord ? `${seasonWord}` : 'これからの季節'}を先取りできます。`
      : `${lead}から、季節の変わり目を楽しむ${kind}です。`,
  })

  // === 2. EDITOR'S CHOICE | <CATEGORY> ===
  push({ type: 'heading', level: 2, text: cat ? `EDITOR'S CHOICE | ${cat}` : "EDITOR'S CHOICE" })
  push({
    type: 'paragraph',
    text:
      `GINZA WHISKERS が今週の銀座から選んだのは、季節の変わり目を${noun ? `${noun}で` : ''}楽しむ、この小さな模様替えです。` +
      `いつも目に入る${lead}だからこそ、色ひとつで一日の気分が変わります。`,
  })

  // === 3. 何が見つかる？ ===
  push({ type: 'heading', level: 2, text: '何が見つかる？' })
  if (productSentences.length > 0) {
    push({ type: 'paragraph', text: productSentences.map((t) => endPunct(demarketing(t))).join('') })
  } else if (leadSentence) {
    push({ type: 'paragraph', text: endPunct(demarketing(leadSentence)) })
  }
  const priceItems = parsePriceItems(f.priceText ?? '')
  const prose = priceProse(priceItems)
  if (prose) {
    push({ type: 'paragraph', text: `価格は、${prose}です。` })
  } else if (s(f.priceText)) {
    push({ type: 'paragraph', text: `価格は${s(f.priceText)}。` })
  }

  // === 4. WHY NOW? ===
  //   「${lead}から〜」は導入で 1 度だけ使う。ここでは同じ語を繰り返さず、
  //   意味（＝いまが季節の変わり目でちょうどいい）は保ったまま別表現にする。
  push({ type: 'heading', level: 2, text: 'WHY NOW?' })
  push({
    type: 'paragraph',
    text:
      `${
        seasonWord === '秋'
          ? '夏の名残がまだ残るいま、ひと足先に秋の色を迎えられます。'
          : `${seasonWord ? `${seasonWord}の` : 'いまの'}空気に合わせて、手もとの色を変えられます。`
      }予定を空けなくても、買い物のついでに${isProductSale(f) ? '手に取れる' : '立ち寄れる'}${kind}です。`,
  })
  push({
    type: 'paragraph',
    text: `新しい色をひとつ取り入れるだけで、気持ちは自然と${seasonWord || 'その季節'}へ向きます。ささやかな衣替えに、ちょうどいい時期です。`,
  })

  // === 5. GINZA WHISKERS' NOTE ===
  push({ type: 'heading', level: 2, text: "GINZA WHISKERS' NOTE" })
  const seed = s(f.editorsNoteSeed)
  if (seed) {
    push({ type: 'paragraph', text: seed })
  } else {
    if (theme) {
      push({
        type: 'paragraph',
        text: `${theme}を選ぶ、という小さな楽しみがあります。自分の${theme}を選んでもいいし、その日の気分で選んでもいい。`,
      })
    }
    const aud = s(f.audienceNote)
    if (aud) {
      // audienceNote（承認済み editorial 項目）を意味を保って言い換える。
      //   ・「指先から」は導入で使うため NOTE では落とす（語の繰り返しを避ける）
      //   ・末尾の「〜方へ／〜人へ」を外し、編集文へつなぐ
      const softened = endPunct(aud)
        .replace(/。\s*$/u, '')
        .replace(/指先から/g, '')
        .replace(/気分を整えたい/g, '自分を整えたい')
        .replace(/(?:方|人)へ\s*$/u, '')
        .replace(/、\s*、/g, '、')
        .replace(/[、\s]+$/u, '')
      push({ type: 'paragraph', text: `${softened}——そんな人に、よく似合う${kind}です。` })
    } else {
      push({
        type: 'paragraph',
        text: `気軽に楽しみながら、季節の変わり目に自分を整えたい人に向いた${kind}です。`,
      })
    }
  }

  // 出典種別の表示語（shopnews → 公式ショップニュース。req 2・全 sale 共通）
  const pageWord = isShopnewsUrl(source.sourceUrl) ? '公式ショップニュース' : '公式イベントページ'

  // === 6. 基本情報（販売期間・時間・会場はここに 1 回だけ） ===
  push({ type: 'heading', level: 2, text: '基本情報' })
  const endDateChanges = /(?:終了日|会期|販売期間|会期終了).*変更|変更.*(?:終了日|会期|販売期間)/.test(f.officialInfoNote)
  // req 1：product_news・sale は「会期」でなく「販売期間」。
  // req 3：no_period_stated 等で eventDate が「販売期間の記載なし（…）」の場合は
  //        「販売期間：公式に記載なし」に統合し、店頭取扱の案内は「購入について」へ一本化する。
  if (isProductSale(f) && /記載なし|未定|未発表|不明/.test(s(f.eventDate))) {
    push({ type: 'paragraph', text: '販売期間：公式に記載なし' })
  } else if (s(f.eventDate)) {
    push({
      type: 'paragraph',
      text: `販売期間：${s(f.eventDate)}${endDateChanges ? '（終了日は変更される場合があります）' : ''}`,
    })
  }
  if (s(f.eventTime)) {
    // sale（物販フェア）の「時間」は会場の営業時間であることがほとんどで、
    // フェア固有の開催時刻ではない。公式ページの「時間」欄由来である点も併記する。
    push({
      type: 'paragraph',
      text: `店舗営業時間：${normalizeTimeRange(f.eventTime)}（${pageWord}の「時間」欄より）`,
    })
  }
  if (f.venues[0]?.place) {
    // 2026-09-07根本改善：venues[0].name（confirmed な店舗名。汎用フォールバック
    // 「販売会場」やイベント名との重複は除く）があれば併記する。place（フロア等）だけでは
    // 「どの店に立ち寄るか」が読者に伝わらないため。
    const vname = s(f.venues[0]?.name)
    const vplace = s(f.venues[0].place)
    const venueText = vname && vname !== vplace && vname !== '販売会場' && vname !== f.eventName ? `${vname}（${vplace}）` : vplace
    push({ type: 'paragraph', text: `会場：${venueText}` })
  }

  // === 7. 購入について ===
  // req 3：販売期間の公式記載がない商品（no_period_stated / ongoing）は、
  //   「販売期間の記載なし」「店頭にて取扱」「詳細は店舗で確認」を各所で繰り返さず、
  //   基本情報＝「販売期間：公式に記載なし」／購入について＝1文 に統合する。
  if (isProductSale(f)) {
    push({ type: 'heading', level: 2, text: '購入について' })
    push({
      type: 'paragraph',
      text: `店頭での取り扱いです。販売期間や在庫の詳細は、${officialPageLabel(source.sourceUrl, source.sourceName)}でご確認ください。`,
    })
  } else {
    renderNonProductPurchaseInfo()
  }
  // 上記の非商品 sale 用ロジックを関数化（挙動不変）
  function renderNonProductPurchaseInfo(): void {
  const infoSents = splitSentences(f.officialInfoNote)
  const wsSoldOut = infoSents.filter((t) => /ワークショップ/.test(t) && /完売|終了/.test(t))
  const purchaseSents = infoSents.filter(
    (t) =>
      !(/ワークショップ/.test(t) && /完売|終了/.test(t)) && // 完売 WS は別段落・原文のまま
      !(/(?:終了日|会期|販売期間).*変更|変更.*(?:終了日|会期|販売期間)/.test(t)), // 終了日変更は基本情報へ
  )
  if (purchaseSents.length > 0 || wsSoldOut.length > 0) {
    push({ type: 'heading', level: 2, text: '購入について' })
    if (purchaseSents.length > 0) {
      // 先頭に「商品名の羅列＋EC予約」が来る場合は商品名を「対象の◯色」等へ言い換えて重複を避ける
      const rejoined = purchaseSents
        .map((t, i) => {
          if (i === 0 && /EC予約/.test(t) && priceItems.length >= 2) {
            const n = priceItems.length
            return t.replace(
              new RegExp(`^${priceItems.map((x) => x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[、,]')}(?:は)?[、,]?`),
              `対象の${n}色は、`,
            )
          }
          return t
        })
        .map(endPunct)
        .join('')
      push({ type: 'paragraph', text: rejoined })
    }
    for (const w of wsSoldOut) {
      push({ type: 'paragraph', text: endPunct(w) })
    }
  }
  } // end renderNonProductPurchaseInfo

  // === 本文末尾の CTA（1 ブロック）===
  //   f.callToAction は mapDiscoveredContentToEventFields が「購入 / 申込がある記事」だけ
  //   confirmed 事実（公式 URL）に裏づけて埋める。空なら CTA ブロックを出さない（推測しない）。
  //   req 3：商品（isProductSale）は購入案内を「購入について」1文に統合済みのため CTA は出さない
  //   （「公式ページで確認」の重複を避ける）。
  const cta = s(f.callToAction)
  if (cta && !isProductSale(f)) {
    push({ type: 'paragraph', text: endPunct(cta) })
  }

  // === 8. SOURCE ===
  push({ type: 'heading', level: 2, text: 'SOURCE' })
  push({
    type: 'paragraph',
    text:
      `情報：${source.sourceName}（確認日 ${formatVerifiedAtForDisplay(source.verifiedAt)}）` +
      `／${source.sourceUrl}`,
  })

  return { blocks, titleCandidates: buildTitleCandidatesSale(f) }
}
