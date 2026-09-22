// GINZA WHISKERS / Project 02（2026-09-22）— AUTUMN GINZA 2026 サブアイテム登録
// （銀茶会サブイベント・秋のスウィーツ・レストラン・神社・バー）。
//
// registerAutumnGinza2026.ts（親企画7件）の続き。collectionMethod=
// 'field_material' の新スキーマ（DiscoveredContent.ts 2026-09-22変更）を使い、
// Web URLを持たない個別企画・商品・店舗を articleUrl=null のまま登録する。
// 出典キーは (sourceSite, contentFingerprint) の一意制約で管理する。
//
// 【情報源の再利用方針】施設が既存SOURCE_LEDGERに登録済みならその
// source_site_id をそのまま使う（新規SOURCE_LEDGER登録はしない）。未登録の
// 施設は GINZA OFFICIAL（id=1、www.ginza.jp。本冊子の発行元である全銀座会の
// 公式サイトであり、実際にこの冊子情報の集約元）を暫定的な情報源として使う。
//
// 【A/B判定】本スクリプトはverdictを直接書き込まない——判読できた日時・会場・
// 価格をそのままDiscoveredContent/ArticleFactsへ入力し、./p2 am-run の
// 既存 assessCandidate.ts に判定を委ねる（推測補完はしない＝不明な項目は
// 空欄のまま。結果として情報が薄い項目は自然にB判定になる）。
//
// 使用例:
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/registerAutumnGinza2026SubItems.ts --dry-run
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/registerAutumnGinza2026SubItems.ts --yes

import { getPayload } from 'payload'
import config from '../payload.config'
import { getPayloadWithRetry } from '../lib/util/getPayloadWithRetry'
import { computeContentFingerprint } from '../lib/crawler/fieldMaterialProvenance'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const DRY = !process.argv.includes('--yes')
const ROOT = path.resolve(process.cwd(), '..')
const PDF_PATH = path.join(ROOT, 'media', 'manual-source-inbox', 'autumn-ginza-2026', 'オータムギンザ.pdf')
const PDF_RELATIVE_PATH = 'media/manual-source-inbox/autumn-ginza-2026/オータムギンザ.pdf'
const SOURCE_DOCUMENT_ID = 'autumn-ginza-2026-booklet'
const SOURCE_DOCUMENT_NAME = 'AUTUMN GINZA 2026'
const GINZA_OFFICIAL_SOURCE_ID = 1

type Category = 'ART' | 'FOOD' | 'SWEETS' | 'NIGHT'

interface SubItem {
  title: string
  venue: string | null
  sourcePage: string
  eventStartAt: string | null
  eventEndAt: string | null
  eventDate: string | null
  eventTime: string | null
  priceText: string | null
  category: Category
  sourceSiteId?: number // 既存SOURCE_LEDGERを再利用する場合のみ指定。無指定はGINZA OFFICIAL
  note: string
}

// --- ① 銀茶会サブイベント 9件（PDF p.12-16） ---
const GINCHAKAI_SUB: SubItem[] = [
  {
    title: '第17回 学生創作茶席（銀茶会 サブイベント）',
    venue: '銀座三越9階 銀座テラス',
    sourcePage: 'p.12',
    eventStartAt: '2026-10-22T00:00:00.000Z',
    eventEndAt: '2026-10-26T23:59:59.000Z',
    eventDate: '2026年10月22日（木）〜10月26日（月）',
    eventTime: '10:00〜20:00（26日のみ〜18:00）',
    priceText: '無料（展示）',
    category: 'ART',
    note: '日本建築学会主催。学生が創作した茶室デザインの展示。',
  },
  {
    title: 'サタデー茶会（銀茶会 サブイベント）',
    venue: '銀座地区（遠州流茶道・裏千家）',
    sourcePage: 'p.12-13',
    eventStartAt: '2026-10-24T00:00:00.000Z',
    eventEndAt: '2026-10-25T23:59:59.000Z',
    eventDate: '2026年10月24日（土・遠州流茶道）／10月25日（日・裏千家）',
    eventTime: null,
    priceText: null,
    category: 'ART',
    note: '各回30名・先着順受付（一部当日席あり）。参加費はPDF記載を判読できず不明。',
  },
  {
    title: '藝大in銀座茶会2026（銀茶会 サブイベント）',
    venue: 'HandShake Lounge, G.Itoya 10F',
    sourcePage: 'p.13',
    eventStartAt: '2026-10-23T00:00:00.000Z',
    eventEndAt: '2026-10-27T23:59:59.000Z',
    eventDate: '2026年10月23日（金）〜10月27日（火）',
    eventTime: '平日13:00〜18:00／土日11:00〜18:00',
    priceText: '無料（展示）',
    category: 'ART',
    note: '東京藝術大学 デザイン工芸科の学生作品展示。',
  },
  {
    title: '遠州流茶道体験会（薄茶席立礼席）（銀茶会 サブイベント）',
    venue: '銀座4丁目',
    sourcePage: 'p.14',
    eventStartAt: '2026-10-25T00:00:00.000Z',
    eventEndAt: '2026-10-25T23:59:59.000Z',
    eventDate: '2026年10月25日（日）',
    eventTime: '4回開催（詳細時刻は判読不能）',
    priceText: '500円',
    category: 'ART',
    note: '有料体験会。詳細会場・開催時刻はPDF記載が小さく判読困難。',
  },
  {
    title: '銀座金沢茶会（銀茶会 サブイベント）',
    venue: '銀座5-1-8 銀座MSビル1階 KOGEI Art Gallery',
    sourcePage: 'p.14',
    eventStartAt: '2026-10-25T00:00:00.000Z',
    eventEndAt: '2026-10-25T23:59:59.000Z',
    eventDate: '2026年10月25日（日）',
    eventTime: '定員6名・各回（開始時刻は判読不能）',
    priceText: '3,000円',
    category: 'ART',
    note: '有料体験会。開始時刻の詳細はPDF記載が小さく判読困難。',
  },
  {
    title: '遠州茶体験会（裏千家）（銀茶会 サブイベント）',
    venue: '銀座4丁目 駐屋根裏',
    sourcePage: 'p.14',
    eventStartAt: '2026-10-25T00:00:00.000Z',
    eventEndAt: '2026-10-25T23:59:59.000Z',
    eventDate: '2026年10月25日（日）',
    eventTime: null,
    priceText: '2,000円',
    category: 'ART',
    note: '有料体験会。定員15名。開始時刻の詳細はPDF記載が小さく判読困難。',
  },
  {
    title: '伊藤園ティースターのお茶振る舞い（銀茶会 サブイベント）',
    venue: '交詢社通り西側',
    sourcePage: 'p.16',
    eventStartAt: '2026-10-25T00:00:00.000Z',
    eventEndAt: '2026-10-25T23:59:59.000Z',
    eventDate: '2026年10月25日（日）',
    eventTime: null,
    priceText: null,
    category: 'ART',
    note: '参加費の記載を確認できず不明。',
  },
  {
    title: '藝大茶会（伊藤園主催・同時開催イベント）（銀茶会 サブイベント）',
    venue: '交詢社通り西側',
    sourcePage: 'p.16',
    eventStartAt: '2026-10-25T00:00:00.000Z',
    eventEndAt: '2026-10-25T23:59:59.000Z',
    eventDate: '2026年10月25日（日）',
    eventTime: '13:00〜15:30',
    priceText: null,
    category: 'ART',
    note: '参加費の記載を確認できず不明。',
  },
  {
    title: '「おいしいお茶のいれ方」セミナー（銀茶会 サブイベント）',
    venue: null,
    sourcePage: 'p.16',
    eventStartAt: '2026-10-18T00:00:00.000Z',
    eventEndAt: '2026-10-18T23:59:59.000Z',
    eventDate: '2026年10月18日',
    eventTime: '3回開催（詳細時刻は判読不能）',
    priceText: null,
    category: 'ART',
    note: '会場・参加費とも判読不能。',
  },
]

// --- ② 秋のスウィーツ 15件（PDF p.10-11） ---
const SWEETS: SubItem[] = [
  { title: '木挽町よしや「秋のどら焼き」', venue: '銀座3-12-9', sourceSiteId: 47, priceText: null, note: '表千家 薄茶席にて提供。' },
  { title: 'HIGASHIYA GINZA「秋日和」', venue: '銀座1-7-7 ポーラ銀座ビルB2F', sourceSiteId: 29, priceText: null, note: '江戸千家 薄茶席にて提供。' },
  { title: '清月堂本店「結の菓」', venue: '銀座7-16-15', sourceSiteId: 48, priceText: null, note: '遠州流茶道 薄茶席にて提供。' },
  { title: '東京風月堂「和楽」', venue: '銀座2-6-8', sourceSiteId: 49, priceText: null, note: '裏千家 薄茶席にて提供。' },
  { title: '銀座菊廼舎「秋麗」', venue: '銀座5-9-17 銀座あづまビル1F', sourceSiteId: 34, priceText: null, note: '裏千家 薄茶席にて提供。' },
  { title: '銀座あけぼの「快美」', venue: '銀座5-7-19', sourceSiteId: 25, priceText: null, note: '裏千家 薄茶席にて提供。' },
  { title: '銀座ピエス・モンテ「ほうじ茶のフィナンシェ」', venue: '銀座6-2-22 銀座ピアースビル1F', priceText: null, note: '表千家 薄茶席にて提供。SOURCE_LEDGER未登録のためGINZA OFFICIAL経由。' },
  { title: '菊寿堂宗家本店「きんとん切ぬき」', venue: '銀座7-13-21', priceText: null, note: '武者小路千家 薄茶席にて提供。SOURCE_LEDGER未登録のためGINZA OFFICIAL経由。' },
  { title: 'とらや銀座店', venue: '銀座7-8-17', sourceSiteId: 30, priceText: null, note: '裏千家 薄茶席にて提供。' },
  { title: '宗家源吉兆庵「相ノ月」', venue: '銀座6-9-8', sourceSiteId: 50, priceText: null, note: '和敬流煎茶道にて提供。' },
  { title: '空也もなか', venue: '銀座6-7-19', sourceSiteId: 35, priceText: null, note: '江戸千家 鎮松庵 薄茶席にて提供。' },
  { title: '大江戸松嶋 三味鮮', venue: '銀座3-14-15', priceText: null, note: '表千家 茶道はじめて体験にて提供。SOURCE_LEDGER未登録のためGINZA OFFICIAL経由。' },
  { title: '銀座フェミント ソフトシェル', venue: '銀座3-6', priceText: null, note: '表千家にて提供。店名表記は要再確認。SOURCE_LEDGER未登録のためGINZA OFFICIAL経由。' },
  { title: '松屋銀座 銀茶会オリジナルお菓子セット', venue: '松屋銀座 8階MGテラス', sourceSiteId: 4, priceText: null, eventStartAt: '2026-10-25T00:00:00.000Z', eventEndAt: '2026-10-25T23:59:59.000Z', eventTime: '11:30〜16:30', note: '10/25限定・数量限定販売。価格記載を確認できず不明。' },
  { title: '銀座三越 銀茶会オリジナルお菓子セット（6個入）', venue: '銀座三越 地下2階 菓遊庵', sourceSiteId: 3, priceText: '2,700円（税込）', eventStartAt: '2026-10-25T00:00:00.000Z', eventEndAt: '2026-10-25T23:59:59.000Z', eventTime: '12:00〜', note: '10/25限定・数量限定販売。' },
].map((s) => ({
  sourcePage: 'p.10-11',
  eventStartAt: s.eventStartAt ?? '2026-10-25T00:00:00.000Z',
  eventEndAt: s.eventEndAt ?? '2026-10-25T23:59:59.000Z',
  eventDate: '2026年10月25日（日）を中心に銀茶会の各茶席にて提供',
  eventTime: s.eventTime ?? null,
  category: 'SWEETS' as Category,
  ...s,
}))

// --- ③ AUTUMN GINZA NIGHT 参加バー 15件（PDF p.28-31） ---
const NIGHT_BARS: { title: string; venue: string; priceText: string | null }[] = [
  { title: 'STAR BAR GINZA', venue: '銀座1-5-13 ハイアットセントリックGINZA東京3階', priceText: '1,100円（税込）' },
  { title: 'Bar Four Seasons', venue: '銀座4-3-12 伊藤ビル4F', priceText: '1,100円（税込）' },
  { title: 'Ginza Zenith', venue: '銀座6-4-7 GOWEST BLDG. 7F', priceText: '1,650円（税込）' },
  { title: 'BAR蛎川', venue: '銀座6-4-12 KNビル1F', priceText: '1,650円（税込）' },
  { title: 'Bar Landscape.', venue: '銀座4-6-9 SANWA GINZA Bldg. B1F', priceText: '1,100円（税込）' },
  { title: 'LITTLE SMITH', venue: '銀座6-4-12 KNビルB2F', priceText: '1,650円（税込）' },
  { title: 'Sherlock', venue: '銀座6-9-13 第一ポールスタービル5F', priceText: '無料〜（サービス料別）' },
  { title: 'BAR AGROS', venue: '銀座7-6-7 銀座近江ビル5F', priceText: '1,100円（税込）' },
  { title: 'BAR EVITA.', venue: '銀座8-4-24 銀座藤井ビル9F', priceText: '1,100円（税込）' },
  { title: '銀座 VAULT', venue: '銀座7-6-11 ミレニ銀座ビル7F', priceText: null },
  { title: 'BARエルロン', venue: '銀座8-4-2 高木屋ビル2F', priceText: '1,430円（税込）' },
  { title: 'Barガスライト本店', venue: '銀座8-6-19 銀座渡辺ビル3F', priceText: null },
  { title: 'BAR GINZA江', venue: '銀座8-7-2 福嶋ビル3F', priceText: '1,100円（税込）' },
  { title: '酒向BAR', venue: '銀座8-5-1 プラザG8ビル4F', priceText: '1,500円（税込）' },
]
const NIGHT: SubItem[] = NIGHT_BARS.map((b) => ({
  title: `${b.title}（AUTUMN GINZA NIGHT 参加店）`,
  venue: b.venue,
  sourcePage: 'p.28-31',
  eventStartAt: '2026-10-16T00:00:00.000Z',
  eventEndAt: '2026-11-03T23:59:59.000Z',
  eventDate: '2026年10月16日（金）〜11月3日（火・祝）',
  eventTime: null,
  priceText: b.priceText,
  category: 'NIGHT',
  note: 'オリジナルカクテル1杯限りの提供。',
}))

// --- ④ 銀座八丁神社めぐり 参加神社 13件（PDF p.18-19） ---
const SHRINES: { title: string; venue: string }[] = [
  { title: '幸稲荷神社', venue: '銀座1-5-13' },
  { title: '銀座稲荷神社', venue: '銀座2-6-5' },
  { title: '龍光不動尊', venue: '銀座3-6-1 松屋銀座 屋上' },
  { title: '朝日稲荷神社', venue: '銀座3-8-12' },
  { title: '宝珠稲荷神社', venue: '銀座3-14-15' },
  { title: '銀座山王地霊尊', venue: '銀座4-6-16 銀座三越9階 銀座テラス' },
  { title: '宝童稲荷神社', venue: '銀座4-3-14' },
  { title: '歌舞伎稲荷神社', venue: '銀座4-12-15 歌舞伎座正面・右側' },
  { title: 'あづま稲荷神社', venue: '銀座5-9-19' },
  { title: '龍神稲荷神社', venue: '銀座6-10-1 GINZA SIX屋上' },
  { title: '成功稲荷神社', venue: '銀座7-5-5' },
  { title: '豊岩稲荷神社', venue: '銀座7-8-14' },
  { title: '熊谷稲荷神社', venue: '銀座7-12-9' },
]
const HACCHOJINJA: SubItem[] = SHRINES.map((s) => ({
  title: `${s.title}（銀座八丁神社めぐり2026 対象社）`,
  venue: s.venue,
  sourcePage: 'p.18-19',
  eventStartAt: '2026-10-30T00:00:00.000Z',
  eventEndAt: '2026-10-31T23:59:59.000Z',
  eventDate: '2026年10月30日（金）・31日（土）',
  eventTime: '11時〜16時',
  priceText: '無料（巡拝で記念品あり）',
  category: 'ART',
  note: '銀座八丁神社めぐり2026の対象神社。',
}))

// --- ⑤ ダイナースクラブ銀座レストランウィーク 参加店 34件（PDF p.22-28） ---
// 【重要】住所まで確実に判読できたのは一部のみ。誤った住所を記載しないため、
// 住所が確認できなかった店舗は venue を null のまま登録する（推測補完しない）。
const RESTAURANTS: { title: string; venue: string | null }[] = [
  { title: '銀座吉澤 内割烹', venue: null },
  { title: '銀座 招福 本店', venue: null },
  { title: '鳥幸', venue: null },
  { title: '焼鳥ひら野', venue: '銀座8-12-15' },
  { title: '銀座天國本店', venue: null },
  { title: '金田中 銀座店', venue: '銀座8-9-15' },
  { title: '銀座方寸 大吟醸料亭いろり', venue: '銀座4-3-12' },
  { title: '銀座割烹 磯なぎ', venue: null },
  { title: '日本料理 なだ万', venue: '銀座4-3-12' },
  { title: '松坂屋精肉', venue: null },
  { title: '銀座すし処ふく', venue: null },
  { title: 'ビフテキのかもがわ', venue: '銀座8-8-8' },
  { title: 'THE NIIGATA Bit GINZA', venue: '銀座5-6-7' },
  { title: '三笑会館 浅草料理翠鑾', venue: null },
  { title: 'LA MAISON DE LA BERGERONETTE GINZA', venue: '銀座6-5-6' },
  { title: '銀座陶治のかもがわ', venue: '銀座8-8-8' },
  { title: '南洋 銀座圓亭', venue: null },
  { title: '鉄板焼 すきやばし次郎', venue: null },
  { title: '鉄板焼 大吟醸すぎ焼き店', venue: null },
  { title: 'Latina Parrilla', venue: '銀座8-8-1 HULIC New GINZA MIYUKI 12F' },
  { title: 'IL PINOLO 銀座', venue: '銀座7-8-7' },
  { title: 'ラール・エ・ラ・マニエール', venue: '銀座3-4-17' },
  { title: 'CACHETTE chez.T.et.Y', venue: '銀座6-1-5 NHビル9階' },
  { title: 'NAMIKI667', venue: '銀座6-6-7 ハイアットセントリック3階' },
  { title: '銀座麻布十番', venue: null },
  { title: 'ホテル西洋銀座エスカール', venue: null },
  { title: '銀座KAZAN', venue: '銀座3-4-6' },
  { title: 'ステーキハウス Bistecchería INTORNO', venue: '銀座4-1-1 NISHIGINZA2階' },
  { title: '三笑会館 銀座圓亭', venue: '銀座5-17-4' },
  { title: '銀座オザミミ・デ・ヴァン本店', venue: null },
  { title: 'REIKASAI GINZA銀座店', venue: '銀座3-5-4' },
  { title: '御宝軒 インペリアル・トレジャー', venue: null },
  { title: '赤坂璃宮 銀座店', venue: '銀座6-8-7' },
  { title: '三笑会館 中国料理綺洲', venue: null },
]
const RESTAURANT_WEEK: SubItem[] = RESTAURANTS.map((r) => ({
  title: `${r.title}（ダイナースクラブ銀座レストランウィーク参加店）`,
  venue: r.venue,
  sourcePage: 'p.22-28',
  eventStartAt: '2026-10-16T00:00:00.000Z',
  eventEndAt: '2026-11-03T23:59:59.000Z',
  eventDate: '2026年10月16日（金）〜11月3日（火・祝）',
  eventTime: null,
  priceText: 'ランチセットコース5,500円（税込）／ディナーコース1: 11,000円（税込）／ディナーコース2: 16,500円（税込）',
  category: 'FOOD',
  note: '価格は参加店共通の3コース制。個別メニュー内容はPDFに記載なし。',
}))

const ALL_ITEMS: SubItem[] = [...GINCHAKAI_SUB, ...SWEETS, ...NIGHT, ...HACCHOJINJA, ...RESTAURANT_WEEK]

async function run() {
  const pdfBuf = readFileSync(PDF_PATH)
  const pdfHash = createHash('sha256').update(pdfBuf).digest('hex')
  console.log(`PDF SHA-256: ${pdfHash}`)
  console.log(DRY ? '=== DRY RUN（--yes 未指定、書き込みなし） ===' : '=== 実書き込みモード ===')
  console.log(`対象件数: ${ALL_ITEMS.length}`)

  const payload = await getPayloadWithRetry(() => getPayload({ config }))
  const before = {
    dc: await payload.count({ collection: 'discovered-content', overrideAccess: true }),
    af: await payload.count({ collection: 'article-facts', overrideAccess: true }),
  }
  console.log('登録前件数:', JSON.stringify({ dc: before.dc.totalDocs, af: before.af.totalDocs }))

  const results = { created: 0, skippedExisting: 0, errors: [] as string[] }
  let transactionID: string | number | null = null

  try {
    if (!DRY) transactionID = (await payload.db.beginTransaction()) as string | number | null
    const reqCtx = transactionID != null ? { req: { transactionID } as any } : {}

    for (const item of ALL_ITEMS) {
      const fingerprint = computeContentFingerprint([SOURCE_DOCUMENT_ID, item.sourcePage, item.title])
      const sourceSiteId = item.sourceSiteId ?? GINZA_OFFICIAL_SOURCE_ID

      const { docs: existing } = await payload.find({
        collection: 'discovered-content',
        where: { and: [{ sourceSite: { equals: sourceSiteId } }, { contentFingerprint: { equals: fingerprint } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        ...reqCtx,
      })
      if (existing.length > 0) {
        results.skippedExisting++
        console.log(`[skip] 既存: ${item.title} (DC#${existing[0].id})`)
        continue
      }

      if (DRY) {
        console.log(`[would create] ${item.title}`)
        continue
      }

      const excerptParts = [
        `[マロン現地収集資料] sourceDocument: ${SOURCE_DOCUMENT_NAME}／発行: 全銀座会`,
        `collectionMethod: field_material／collectedBy: Maron`,
        `PDF掲載ページ: ${item.sourcePage}／保存先: ${PDF_RELATIVE_PATH}／SHA-256: ${pdfHash}`,
        item.venue ? `会場: ${item.venue}` : '会場: PDF記載を判読できず不明',
        item.note,
      ]

      const dc = await payload.create({
        collection: 'discovered-content',
        overrideAccess: true,
        data: {
          sourceSite: sourceSiteId,
          articleUrl: null,
          collectionMethod: 'field_material',
          sourceDocumentId: SOURCE_DOCUMENT_ID,
          sourcePage: item.sourcePage,
          contentFingerprint: fingerprint,
          sourceMaterialName: SOURCE_DOCUMENT_NAME,
          sourceMaterialHash: pdfHash,
          sourceMaterialLocation: PDF_RELATIVE_PATH,
          collectedBy: 'Maron',
          title: item.title,
          venue: item.venue ?? undefined,
          eventStartAt: item.eventStartAt ?? undefined,
          eventEndAt: item.eventEndAt ?? undefined,
          excerpt: excerptParts.join('／'),
          detectedAt: new Date().toISOString(),
          discoveryStatus: 'first_seen',
          contentType: item.category === 'FOOD' ? 'food' : item.category === 'SWEETS' ? 'food' : item.category === 'NIGHT' ? 'food' : 'culture',
          articleFetchStatus: 'fetched',
          curationStatus: 'inbox',
        },
        ...reqCtx,
      })

      await payload.create({
        collection: 'article-facts',
        overrideAccess: true,
        data: {
          discoveredContent: dc.id,
          enrichmentStatus: 'draft',
          primaryCategory: item.category,
          eventName: item.title,
          eventDate: item.eventDate ?? undefined,
          eventDateISO: item.eventStartAt ?? undefined,
          eventTime: item.eventTime ?? undefined,
          areaLead: '全銀座会主催「AUTUMN GINZA 2026」の参加企画・店舗。',
          paid: item.priceText ? (item.priceText.includes('無料') ? 'free' : 'paid') : 'unknown',
          priceText: item.priceText ?? undefined,
          officialInfoNote: `AUTUMN GINZA 2026冊子（${item.sourcePage}）掲載情報。最新情報は公式サイト（https://www.ginza.jp/autumnginza2026/）でご確認ください。`,
          sourceProvenanceFacts: [
            {
              fact: `会場・開催情報（PDF掲載ページ ${item.sourcePage}）`,
              sourceType: 'official',
              factType: 'venue',
              verificationStatus: 'confirmed',
            },
          ],
          notes: excerptParts.join('\n'),
        },
        ...reqCtx,
      })

      results.created++
      console.log(`[created] ${item.title} -> DC#${dc.id}`)
    }

    if (!DRY && transactionID != null) {
      await payload.db.commitTransaction(transactionID)
      console.log('=== トランザクションをコミットしました ===')
    }
  } catch (err) {
    if (!DRY && transactionID != null) {
      await payload.db.rollbackTransaction(transactionID)
      console.log('=== エラーのためロールバックしました ===')
    }
    console.error(err)
    results.errors.push(err instanceof Error ? err.message : String(err))
    console.log(JSON.stringify({ results, error: true }))
    process.exit(1)
  }

  const after = {
    dc: await payload.count({ collection: 'discovered-content', overrideAccess: true }),
    af: await payload.count({ collection: 'article-facts', overrideAccess: true }),
  }
  console.log(
    JSON.stringify({
      dryRun: DRY,
      totalItems: ALL_ITEMS.length,
      before: { dc: before.dc.totalDocs, af: before.af.totalDocs },
      after: { dc: after.dc.totalDocs, af: after.af.totalDocs },
      results,
    }),
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
