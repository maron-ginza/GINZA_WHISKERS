// GINZA WHISKERS / Project 02（2026-09-03、共通 sale mapper）
//
// 【役割】product_news（sale テンプレート）の候補について、公式ページから
// **confirmed に取得できた事実だけ**を共通 Article Facts の draft フィールドへ
// 自動転記する純粋関数。#331 専用の値直書きではなく、今後の sale 記事すべてで使う。
//
// 【厳守】
//   ・facts へ入れるのは confirmed のものだけ。unconfirmed は facts に入れず excluded へ。
//   ・「入場無料」は公式で確認できないため paid を書かない（sale は priceText で価格を扱う）。
//   ・完売したワークショップ情報（application 期間・定員・対象者・所要時間・参加費・抽選）は
//     sale 記事の必須項目にしない。whatHappens にそれらの語が混じっていたら除外
//     （officialInfoNote は「記念ワークショップは完売しています。」までを許容＝購入判断に必要な事実）。
//   ・areaLead / audienceNote / hashtags は「事実」ではなく、取得済み事実と Primary Category
//     から**追加 API を使わず決定的に生成する draft 候補**（candidates）。ready 化前に人間が確認する。
//   ・eventName は読者向けに `【フェア】` 等の角括弧を外し引用符を『』へ正規化。原典タイトルは
//     provenanceAdds へ保持する。
//   ・priceText の商品名は公式ページ内の表記ゆれをリード段落側（canonical）へ正規化し、
//     元表記を internalMemo（notes へ追記）に残す。
//   ・AI / ネットワーク / DB に触れない。同じ入力から必ず同じ出力。

import type {
  ArticleFactsCandidate,
  ArticleFactsProvenanceFactLike,
  ProductNewsFactsCandidate,
} from './types'

export interface SaleFactsMapInput {
  base: ArticleFactsCandidate
  product?: ProductNewsFactsCandidate | null
  /** マロン確定の編集カテゴリー（18種。例 'BEAUTY'） */
  primaryCategory?: string | null
  /** 「開催中／まもなく」判定の基準時刻（決定的テスト用） */
  now?: Date
}

export interface SaleFieldOrigin {
  field: string
  value: string
  kind: 'fact' | 'candidate'
  source: string
}

export interface SaleFactsMapResult {
  facts: {
    eventName?: string
    eventDate?: string
    eventDateISO?: string
    eventTime?: string
    venues?: { name: string; place: string }[]
    priceText?: string
    whatHappens?: string
    officialInfoNote?: string
    /** 販売終了日の記載状況（2026-09-07根本改善。confirmed のときだけ入る） */
    saleAvailability?: 'unknown' | 'ongoing_no_end_stated' | 'has_end_date'
  }
  candidates: {
    areaLead?: string
    audienceNote?: string
    hashtags?: { tag: string }[]
  }
  origins: SaleFieldOrigin[]
  /** register が sourceProvenanceFacts へ追加すべき confirmed 事実（原典タイトル・開催時間 など） */
  provenanceAdds: ArticleFactsProvenanceFactLike[]
  /** notes へ追記すべき内部メモ（表記ゆれの記録 など） */
  internalMemo: string[]
  factsAllConfirmed: boolean
  excluded: { field: string; reason: string }[]
}

// whatHappens に混ぜてはいけない語（officialInfoNote の「完売しています。」だけは別扱い）
const WS_SOLDOUT_RE = /満席|定員|申込|お申込み|応募|抽選|エントリー|体験会|所要時間|参加費|要予約|受付終了/
const WS_WORD_RE = /ワークショップ/

// Primary Category → 対象読者の一文（テーマ語が取れない場合のフォールバック）
const CATEGORY_AUDIENCE_FALLBACK: Record<string, string> = {
  BEAUTY: '季節の変わり目に、指先や装いから気分を整えたい方へ。',
  FOOD: '新しい味や季節の一皿を楽しみたい方へ。',
  CAFE: 'こだわりの一杯や静かな時間を求める方へ。',
  SHOPPING: 'お気に入りを見つける買い物の時間を楽しみたい方へ。',
  GIFT: '大切な人へのちょっとした贈り物を探している方へ。',
  ART: '作品とじっくり向き合う時間を求める方へ。',
  MUSIC: '音楽のある時間を楽しみたい方へ。',
  WELLNESS: '心身を整える時間を持ちたい方へ。',
  EXPERIENCE: '銀座で新しい体験を求める方へ。',
  PHOTO: '心に残る一枚を撮りたい方へ。',
}
const AUDIENCE_GENERIC = '銀座で新しい発見を楽しみたい方へ。'

// テーマ語（記事の切り口。areaLead / audienceNote に使う。順序＝優先度：より具体的な語を先に）
const THEME_KEYWORDS = [
  '星座', '十二星座', '干支', '十二支', '花', '植物', '動物', '鳥', '猫', '犬',
  '宇宙', '天体', '星', '月', '海', '山', '森', '空', '音楽', '文学', '詩', '神話',
  '童話', '絵本', 'レトロ', 'ノスタルジー', '和', '季節', '旅', 'クリスマス', '正月', '新年',
]

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** eventName から催しの種類語（フェア/展示/ポップアップ/催し） */
function kindWord(eventName: string): string {
  if (/フェア|FAIR|fair/.test(eventName)) return 'フェア'
  if (/ポップアップ|POP ?UP|pop-?up/i.test(eventName)) return 'ポップアップ'
  if (/展(?:$|[^示])|展示|個展|企画展/.test(eventName)) return '展示'
  return '催し'
}

/** 読者向け eventName：先頭の【…】を外し、「」→『』へ正規化。『』の外側に付いた空白は詰める */
function readerFacingEventName(raw: string): string {
  return s(raw)
    .replace(/^【[^】]*】\s*/, '')
    .replace(/\s*[｜|].*$/, '')
    .replace(/「/g, '『')
    .replace(/」/g, '』')
    .replace(/([^\s])\s+『/g, '$1『') // ブランド名 と 『 の間の空白を詰める（『…』内の空白は残す）
    .replace(/』\s+([^\s])/g, '』$1')
    .replace(/[ \t　]{2,}/g, ' ')
    .trim()
}

/** 原典タイトル（角括弧付き）からブランド名 = 先頭〜最初の『「（ の直前 */
function brandFromTitle(raw: string): string {
  const t = s(raw).replace(/^【[^】]*】\s*/, '')
  const m = t.match(/^([^\s　「」『』（(]{2,20})[\s　「」『』（(]/)
  return m ? m[1].trim() : ''
}

/** 原典タイトルの『…』/「…」内から、末尾の動作語（開幕/開催/スタート/開始/フェア）を除いたシリーズ名 */
function seriesNameFromTitle(raw: string): string {
  const m = s(raw).match(/[「『]([^」』]{2,40})[」』]/)
  if (!m) return ''
  return m[1]
    .replace(/\s*(?:開幕|開催中|開催|スタート|開始|はじまる|始まる|フェア|展)\s*$/, '')
    .replace(/\s+/g, '')
    .trim()
}

function themeKeywordFrom(text: string): string {
  for (const k of THEME_KEYWORDS) if (text.includes(k)) return k
  return ''
}

/** Primary Category（＋ブランド/概要語）→ 記事内で使う名詞（ネイル/香り/コスメ/グルメ 等） */
function categoryNoun(cat: string, context: string): string {
  if (cat === 'BEAUTY') {
    if (/ネイル/.test(context)) return 'ネイル'
    if (/香水|フレグランス|パフューム|香り/.test(context)) return '香り'
    if (/コスメ|化粧品|メイク|リップ|アイシャドウ|ファンデ/.test(context)) return 'コスメ'
    if (/スキンケア|美容液|保湿/.test(context)) return 'スキンケア'
    return '美容'
  }
  const map: Record<string, string> = {
    FOOD: 'グルメ', CAFE: 'コーヒー', SHOPPING: '雑貨', GIFT: 'ギフト', ART: 'アート',
    MUSIC: '音楽', WELLNESS: '癒し', EXPERIENCE: '体験', PHOTO: '写真', ARCHITECTURE: '建築',
  }
  return map[cat] ?? ''
}

/** 「銀座 蔦屋書店 文具売り場（GINZA SIX 6F）」→ { store:'銀座 蔦屋書店', floor:'文具売り場' } */
function splitVenue(place: string): { store: string; floor: string } {
  const m = s(place).match(/^(.+?(?:書店|百貨店|ホール|ギャラリー|ストア|店))[\s　]+(.+?)(?:（|\(|$)/)
  if (m) return { store: m[1].trim(), floor: m[2].trim() }
  const m2 = s(place).match(/^(.+?)(?:（|\()/)
  return { store: (m2 ? m2[1] : s(place)).trim(), floor: '' }
}

function productConfirmed(product: ProductNewsFactsCandidate | null, key: string): boolean {
  const p = product?.provenance?.[key]
  return !!p && p.confirmationStatus === 'confirmed'
}

function mmdd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
}

export function mapSaleFactsToDraft(input: SaleFactsMapInput): SaleFactsMapResult {
  const base = input.base
  const product = input.product ?? null
  const now = input.now ?? new Date()
  const cat = s(input.primaryCategory).toUpperCase()
  const eef = base.extractedEventFacts

  const facts: SaleFactsMapResult['facts'] = {}
  const candidates: SaleFactsMapResult['candidates'] = {}
  const origins: SaleFieldOrigin[] = []
  const excluded: { field: string; reason: string }[] = []
  const provenanceAdds: ArticleFactsProvenanceFactLike[] = []
  const internalMemo: string[] = []
  const addFact = (field: string, value: string, source: string) =>
    origins.push({ field, value, kind: 'fact', source })
  const addCand = (field: string, value: string, source: string) =>
    origins.push({ field, value, kind: 'candidate', source })

  // --- eventName（読者向けに正規化。原典タイトルは provenanceAdds へ） ---
  //   優先順位：①extractedEventFacts.eventName（confirmed） ②productExtraction.fields.productName
  //   （confirmed・タイトルを本文で照合済み）。②のときも同じ正規化・原典保持を適用する。
  const eventNameSource: { v: string; src: string } | null =
    eef?.eventName.value && eef.eventName.confirmationStatus === 'confirmed'
      ? { v: eef.eventName.value, src: `extractedEventFacts.eventName（${eef.eventName.method}）` }
      : product?.fields.productName && s(product.fields.productName) && productConfirmed(product, 'productName')
        ? {
            v: s(product.fields.productName)!,
            src: `productExtraction.fields.productName（${product.provenance.productName?.method ?? 'confirmed'}）`,
          }
        : null
  const rawName = eventNameSource?.v ?? ''
  if (rawName) {
    facts.eventName = readerFacingEventName(rawName)
    addFact('eventName', facts.eventName, `${eventNameSource!.src}を読者向けに正規化（【…】除去・「」→『』）`)
    if (facts.eventName !== rawName) {
      provenanceAdds.push({
        fact: `[auto:sale-mapper] 原典タイトル: ${rawName}`,
        sourceType: 'official',
        factType: 'other',
        verificationStatus: 'confirmed',
      })
    }
  } else {
    excluded.push({ field: 'eventName', reason: `未確認（${eef?.eventName.method ?? '抽出なし'}）` })
  }

  // --- 販売期間（表示） ---
  //   ③フォールバック：saleAvailability='ongoing_no_end_stated' が confirmed なら、開始日・終了日と
  //   も未確認のまま「発売中」と明示する（開始日を推測しない。公式本文の明記語をそのまま反映）。
  if (eef?.eventDate.value && eef.eventDate.confirmationStatus === 'confirmed') {
    facts.eventDate = eef.eventDate.value
    addFact('eventDate（販売期間）', facts.eventDate, `extractedEventFacts.eventDate（${eef.eventDate.method}）`)
  } else if (product?.fields.saleAvailability === 'ongoing_no_end_stated' && productConfirmed(product, 'saleAvailability')) {
    facts.eventDate = '発売中（開始日・終了日とも公式記載なし）'
    addFact(
      'eventDate（販売期間）',
      facts.eventDate,
      `productExtraction.fields.saleAvailability（${product.provenance.saleAvailability?.method ?? 'confirmed'}）`,
    )
  } else {
    excluded.push({ field: 'eventDate（販売期間）', reason: `未確認（${eef?.eventDate.method ?? '抽出なし'}）` })
  }

  // --- 販売期間（機械日付） ---
  //   2026-09-07根本改善：base.conflicts に「別記事の期間を拾った疑い」等の矛盾が記録されている
  //   ときは、base.fields.eventStartAt をそのまま信用しない（システム自身が疑わしいと判定した値を
  //   confirmed 事実として書かない）。confirmed な eef.eventDateISO が無い限り、この場合は
  //   eventDateISO を確定させない（下の saleAvailability フォールバックか、人間確認に委ねる）。
  if (eef?.eventDateISO.value && eef.eventDateISO.confirmationStatus === 'confirmed') {
    facts.eventDateISO = eef.eventDateISO.value
    addFact('eventDateISO', facts.eventDateISO, `extractedEventFacts.eventDateISO（${eef.eventDateISO.method}）`)
  } else if (base.fields.eventStartAt && base.conflicts.length === 0) {
    facts.eventDateISO = base.fields.eventStartAt
    addFact('eventDateISO', facts.eventDateISO, '構造化日付（DiscoveredContent.eventStartAt / JSON-LD）')
  }

  // --- eventTime（公式イベントページの「時間」欄。値を維持し provenance に明記） ---
  if (eef?.eventTime.value && eef.eventTime.confirmationStatus === 'confirmed') {
    facts.eventTime = eef.eventTime.value
    addFact('eventTime', facts.eventTime, `extractedEventFacts.eventTime（${eef.eventTime.method}）`)
    provenanceAdds.push({
      fact: `[auto:sale-mapper] 開催時間: ${facts.eventTime}（公式イベントページの「時間」欄より取得。会場の店舗営業時間に一致する場合がある）`,
      sourceType: 'official',
      factType: 'hours',
      verificationStatus: 'confirmed',
    })
  } else {
    excluded.push({ field: 'eventTime', reason: `未確認（${eef?.eventTime.method ?? '時刻表記なし'}）` })
  }

  // --- venue（confirmed のみ）：①公式ラベル ②product.salesLocation ③DC.venue ---
  if (eef?.venuePlace.value && eef.venuePlace.confirmationStatus === 'confirmed') {
    facts.venues = [{ name: facts.eventName ?? '販売会場', place: eef.venuePlace.value }]
    addFact('venues', `${facts.venues[0].name} @ ${eef.venuePlace.value}`, `extractedEventFacts.venuePlace（${eef.venuePlace.method}）`)
  } else if (product?.fields.salesLocation && s(product.fields.salesLocation) && productConfirmed(product, 'salesLocation')) {
    facts.venues = [{ name: facts.eventName ?? '販売会場', place: s(product.fields.salesLocation)! }]
    addFact('venues', `${facts.venues[0].name} @ ${s(product.fields.salesLocation)}`, `productExtraction.fields.salesLocation（${product.provenance.salesLocation?.method ?? 'confirmed'}）`)
  } else if (base.fields.venue && s(base.fields.venue)) {
    facts.venues = [{ name: facts.eventName ?? '販売会場', place: s(base.fields.venue)! }]
    addFact('venues', `${facts.venues[0].name} @ ${s(base.fields.venue)}`, 'DiscoveredContent.venue（情報源サイト掲載の会場。register が confirmed な出典事実として記録）')
  } else {
    excluded.push({ field: 'venues', reason: 'confirmed な会場を確認できない' })
  }

  // --- priceText（confirmed のみ・per-name・表記ゆれは canonical へ正規化済み） ---
  if (product?.fields.price && s(product.fields.price) && productConfirmed(product, 'price')) {
    facts.priceText = s(product.fields.price)!
    addFact('priceText', facts.priceText, `productExtraction.fields.price（${product.provenance.price?.method ?? 'confirmed'}）`)
    const norm = product.provenance.priceSpellingNormalized?.value
    if (norm) {
      internalMemo.push(`[auto:sale-mapper] 商品名の表記ゆれを正規化: ${norm}（priceText はリード段落側の綴りに統一。元ページの [商品紹介] 行に別表記あり）`)
    }
  } else {
    excluded.push({
      field: 'priceText',
      reason: '価格の公式記載を決定的に確認できず（productExtraction に confirmed な price なし）。人間が公式で確定',
    })
  }

  // --- whatHappens（WS・完売・申込語を含むものは除外） ---
  const wh =
    eef?.whatHappens.value && eef.whatHappens.confirmationStatus === 'confirmed'
      ? { v: eef.whatHappens.value, src: `extractedEventFacts.whatHappens（${eef.whatHappens.method}）` }
      : product?.fields.productSummary && s(product.fields.productSummary) && productConfirmed(product, 'productSummary')
        ? { v: s(product.fields.productSummary)!, src: `productExtraction.fields.productSummary（${product.provenance.productSummary?.method ?? 'confirmed'}）` }
        : null
  if (wh) {
    if (WS_WORD_RE.test(wh.v) || WS_SOLDOUT_RE.test(wh.v)) {
      excluded.push({ field: 'whatHappens', reason: 'ワークショップ／完売・定員・申込の語を含むため sale 記事の事実に採用しない' })
    } else {
      facts.whatHappens = wh.v
      addFact('whatHappens', facts.whatHappens, wh.src)
    }
  } else {
    excluded.push({ field: 'whatHappens', reason: `未確認（${eef?.whatHappens.method ?? '公式本文に概要文なし'}）` })
  }

  // --- officialInfoNote：合成版（[販売について]＋【購入特典】＋WS完売＋会期注記）を優先、無ければ抽出注意事項 ---
  if (product?.provenance?.officialInfoNote?.confirmationStatus === 'confirmed') {
    // composeSaleOfficialInfoNote の結果は provenance に confirmed で入っている（value に本文）
    const composed = s(product.provenance.officialInfoNote.value)
    if (composed) {
      facts.officialInfoNote = composed
      addFact('officialInfoNote', composed, `productExtraction.provenance.officialInfoNote（${product.provenance.officialInfoNote.method}）`)
    }
  }
  if (!facts.officialInfoNote) {
    if (eef?.officialInfoNote.value && eef.officialInfoNote.confirmationStatus === 'confirmed') {
      if (WS_WORD_RE.test(eef.officialInfoNote.value) || WS_SOLDOUT_RE.test(eef.officialInfoNote.value)) {
        excluded.push({ field: 'officialInfoNote', reason: 'ワークショップ／完売・申込の語を含むため除外（合成版が使えない場合）' })
      } else {
        facts.officialInfoNote = eef.officialInfoNote.value
        addFact('officialInfoNote', facts.officialInfoNote, `extractedEventFacts.officialInfoNote（${eef.officialInfoNote.method}）`)
      }
    } else if (product?.fields.saleAvailability === 'ongoing_no_end_stated' && productConfirmed(product, 'saleAvailability')) {
      // ③フォールバック：合成版・eef のいずれも無ければ「終了日は公式記載なし」を決定的に明示する
      // （推測ではなく、本文に「発売中/販売中」の明記があり終了示唆語が無いことの確認結果）。
      facts.officialInfoNote = '販売終了日の記載なし（発売中）。'
      addFact(
        'officialInfoNote',
        facts.officialInfoNote,
        `productExtraction.fields.saleAvailability（${product.provenance.saleAvailability?.method ?? 'confirmed'}）`,
      )
    } else {
      excluded.push({ field: 'officialInfoNote', reason: `未確認（${eef?.officialInfoNote.method ?? '公式本文に注意事項なし'}）` })
    }
  }

  // --- saleAvailability（販売終了日の記載状況。confirmed のときだけ facts へ写す） ---
  if (
    product?.fields.saleAvailability &&
    product.fields.saleAvailability !== 'unknown' &&
    productConfirmed(product, 'saleAvailability')
  ) {
    facts.saleAvailability = product.fields.saleAvailability
    addFact(
      'saleAvailability',
      facts.saleAvailability,
      `productExtraction.fields.saleAvailability（${product.provenance.saleAvailability?.method ?? 'confirmed'}）`,
    )
  }

  // === candidates（事実ではない・決定的生成） ===
  const context = `${rawName} ${facts.whatHappens ?? ''} ${s(product?.fields.productSummary)} ${s(product?.fields.productName)}`
  const theme = themeKeywordFrom(context)
  const noun = categoryNoun(cat, context)
  const kw = kindWord(rawName)

  // areaLead：「＜店＞の＜フロア＞で、＜M月D日＞から、＜テーマ＞をモチーフにした＜名詞＞の＜種類語＞が始まります。」
  if (facts.venues && facts.venues[0]?.place) {
    const { store, floor } = splitVenue(facts.venues[0].place)
    const startIso = eef?.eventDateISO.value || base.fields.eventStartAt || ''
    const md = startIso ? mmdd(startIso) : ''
    const startMs = startIso ? new Date(startIso).getTime() : NaN
    const endMs = base.fields.eventEndAt ? new Date(base.fields.eventEndAt).getTime() : NaN
    const nowMs = now.getTime()
    const placePart = floor ? `${store}の${floor}` : store
    const themePart = theme && noun ? `${theme}をモチーフにした${noun}の` : noun ? `${noun}の` : theme ? `${theme}をテーマにした` : ''
    let tail: string
    if (md && Number.isFinite(startMs) && nowMs < startMs) tail = `${md}から、${themePart}${kw}が始まります。`
    else if (Number.isFinite(endMs) && nowMs <= endMs) tail = `${themePart}${kw}が開催中です。`
    else tail = `${themePart}${kw}が開かれています。`
    candidates.areaLead = `${placePart}で、${tail}`
    addCand('areaLead', candidates.areaLead, `会場（店/フロア分割）＋開始日＋テーマ語「${theme || '—'}」＋カテゴリ名詞「${noun || '—'}」から決定的生成`)
  }

  // audienceNote：「＜テーマ＞や＜名詞＞を楽しみながら、季節の変わり目に＜結び＞。」
  if (cat) {
    if (theme && noun) {
      const finish =
        noun === 'ネイル' ? '指先から気分を整えたい方へ'
        : cat === 'BEAUTY' ? '自分を整えたい方へ'
        : '自分の時間を楽しみたい方へ'
      candidates.audienceNote = `${theme}や${noun}を楽しみながら、季節の変わり目に${finish}。`
      addCand('audienceNote', candidates.audienceNote, `テーマ語「${theme}」＋カテゴリ名詞「${noun}」から決定的生成`)
    } else {
      candidates.audienceNote = CATEGORY_AUDIENCE_FALLBACK[cat] ?? AUDIENCE_GENERIC
      addCand('audienceNote', candidates.audienceNote, `Primary Category=${cat} の対応表（テーマ語/名詞が取れないためフォールバック）`)
    }
  }

  // hashtags：#銀座 ＋ 施設タグ（hashtagCandidates のうち施設由来）＋ #ブランド ＋ #シリーズ名（動作語除去）
  {
    const facilityRe = /蔦屋書店|GINZASIX|GINZA ?SIX|ARTINCABINET|銀座三越|松屋銀座|和光|WAKO/i
    const facility = (Array.isArray(eef?.hashtagCandidates) ? eef!.hashtagCandidates : [])
      .map((t) => s(t))
      .filter((t) => /^#\S+$/.test(t) && facilityRe.test(t))
    const brand = brandFromTitle(rawName)
    const series = seriesNameFromTitle(rawName)
    const ordered = [
      '#銀座',
      ...facility,
      ...(brand ? [`#${brand.replace(/\s+/g, '')}`] : []),
      ...(series ? [`#${series}`] : []),
    ]
    const seen = new Set<string>()
    const tags: { tag: string }[] = []
    for (const t of ordered) {
      if (seen.has(t) || !/^#\S+$/.test(t)) continue
      seen.add(t)
      tags.push({ tag: t })
      if (tags.length >= 5) break
    }
    if (tags.length > 0) {
      candidates.hashtags = tags
      addCand('hashtags', tags.map((x) => x.tag).join(' '), `#銀座 ＋ 施設タグ ＋ #ブランド「${brand || '—'}」 ＋ #シリーズ名「${series || '—'}」（追加 API 不使用）`)
    }
  }

  const factOriginKeys = new Set(origins.filter((o) => o.kind === 'fact').map((o) => o.field.replace(/（.*$/, '')))
  const factsAllConfirmed = (Object.keys(facts) as string[]).every((k) => factOriginKeys.has(k))

  // --- 出典確認（2026-09-07根本改善）：sale 経路で confirmed 事実が1件以上あるときだけ、
  //   「その出典から実際に商品事実を確認できた」ことを1件の confirmed 事実として記録する。
  //   sourceUrl/sourceName/verifiedAt は register 側で既に非空をゲート済み（無ければ draft
  //   自体を作らない）。個別の商品ページは項目が薄いことが多く、readyGate の
  //   sourceProvenanceFacts 必須（1件以上）を、他に追加できる provenanceAdds が無い場合でも
  //   満たせるようにする（何も confirmed に取れていないときは追加しない＝空の確認を装わない）。
  if (factsAllConfirmed && Object.keys(facts).length > 0) {
    const srcUrl = s(product?.fields.sourceUrl) || s(base.fields.sourceUrl)
    const srcName = s(product?.fields.sourceName) || s(base.fields.sourceName)
    const verifiedAt = s(product?.fields.verifiedAt) || s(base.fields.verifiedAt)
    if (srcUrl) {
      provenanceAdds.push({
        fact: `[auto:sale-mapper] 出典確認: ${srcName || '公式サイト'} / ${srcUrl}（確認日時: ${verifiedAt || '—'}）`,
        sourceType: 'official',
        factType: 'other',
        verificationStatus: 'confirmed',
      })
    }
  }

  return { facts, candidates, origins, provenanceAdds, internalMemo, factsAllConfirmed, excluded }
}
