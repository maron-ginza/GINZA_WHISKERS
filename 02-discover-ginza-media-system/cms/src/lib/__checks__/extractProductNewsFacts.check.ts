// GINZA WHISKERS / Project 02 — parseGinzaSixSaleBody の回帰テスト（2026-09-07・根本改善）
//
// GINZA SIX（ginza6.tokyo）の商品ニュースページ本文から、価格・販売場所（フロア）・
// 商品概要を決定的に抽出できることを、DC#369・#370で実際に取得済みの本文（excerpt）を
// そのまま用いて検証する。販売期間（saleStartAt/saleEndAt）は抽出しないことも確認する
// （「YYYY.MM.DD UP」は掲載日であり販売開始日ではないため）。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { parseGinzaSixSaleBody } from '../morning/extractProductNewsFacts'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

// DC#369「花西子 FLORASIS」の実excerpt（2026-09-05取得）をそのまま使用
const DC369_BODY =
  '花西子 FLORASIS GINZA Beauty 花西子 FLORASISでは、新作チークを発売中！ ' +
  '肌馴染みの良い繊細カラーで、内側からにじむような自然な血色感を。持ち運びにも便利なサイズで、ミラー付きなのも嬉しいポイント。 ' +
  '洛花飛霞(ラクカヒカ) チーク 14パープルロータス 価格：3,190円(税込) ' +
  '商品の詳細などご不明な点がございましたら、お気軽に店舗までお問い合わせください。 ' +
  '花西子 FLORASIS GINZA フロア: B1F 店舗情報はこちら 2026.08.31 UP カテゴリー All Art Beauty'

// DC#370「AMBUSH x New Era」の実excerpt（2026-09-05取得）をそのまま使用
const DC370_BODY =
  'AMBUSH® WORKSHOP GINZA Fashion New Era®を象徴するクラシックなフォルムに、AMBUSH®ならではの大胆な素材使いとグラフィックを融合したコレクション。 ' +
  'フロントには立体的な"A"ロゴ刺繍、サイドにはNew Era®フラッグロゴ、バックにはAMBUSH®ロゴを配置。 ' +
  'レオパード柄や異素材を組み合わせたパッチワークモデルなど、クラシックなキャップにAMBUSH®らしい遊び心を加えたラインアップが揃います。 ' +
  'シンプルなスタイリングのアクセントとして、ストリートからデイリーまで幅広く楽しめるアイテムです。 ' +
  'NEW ERA A-PATCH CAP 価格：16,500円(税込) カラー：Black,Beige サイズ：Free ' +
  'NEW ERA A-PATCH LEOPARD CAP 価格：16,500円(税込) カラー：Leopard サイズ：Free ' +
  'NEW ERA A-PATCH MIX CAP 価格：17,600円(税込) カラー：Multi サイズ：Free ' +
  '是非、店頭にてご覧くださいませ。 ' +
  'AMBUSH® WORKSHOP GINZA フロア: 3F 店舗情報はこちら 2026.08.30 UP カテゴリー All Art Beauty'

const cases: CheckCase[] = [
  {
    name: 'DC#369再現：価格を抽出する（3,190円）',
    fn: () => {
      const r = parseGinzaSixSaleBody(DC369_BODY)
      assert(r.price === '洛花飛霞(ラクカヒカ) チーク 14パープルロータス：3,190円（税込）', `実際: ${r.price}`)
      assert(r.priceItems?.length === 1, `1件のはず（実際: ${r.priceItems?.length}）`)
    },
  },
  {
    name: 'DC#369再現：店舗名＋フロアを抽出する（花西子 FLORASIS GINZA／B1F）',
    fn: () => {
      const r = parseGinzaSixSaleBody(DC369_BODY)
      assert(r.storeName === '花西子 FLORASIS GINZA', `実際: ${r.storeName}`)
      assert(r.salesFloor === 'B1F', `実際: ${r.salesFloor}`)
      assert(r.salesLocation === '花西子 FLORASIS GINZA フロア: B1F', `実際: ${r.salesLocation}`)
    },
  },
  {
    name: 'DC#369再現：商品概要（リード文）を抽出し、価格行は含まない',
    fn: () => {
      const r = parseGinzaSixSaleBody(DC369_BODY)
      assert(!!r.productSummary, '概要が抽出できるはず')
      assert(r.productSummary!.includes('自然な血色感'), `概要に本文が含まれるはず（実際: ${r.productSummary}）`)
      assert(!r.productSummary!.includes('価格'), '概要に価格行を含めない')
    },
  },
  {
    name: 'DC#370再現：3商品の価格をすべて抽出する（重複を除く2種の価格）',
    fn: () => {
      const r = parseGinzaSixSaleBody(DC370_BODY)
      assert(r.priceItems?.length === 3, `3件のはず（実際: ${r.priceItems?.length}）`)
      assert(r.priceItems![0].yen === '16500', `1件目16,500円（実際: ${r.priceItems![0].yen}）`)
      assert(r.priceItems![2].yen === '17600', `3件目17,600円（実際: ${r.priceItems![2].yen}）`)
      assert(r.price!.includes('16,500円（税込）') && r.price!.includes('17,600円（税込）'), `複数価格を／区切りで含む（実際: ${r.price}）`)
    },
  },
  {
    name: 'DC#370再現：店舗名＋フロアを抽出する（AMBUSH WORKSHOP GINZA／3F）、直前商品のカラー/サイズを巻き込まない',
    fn: () => {
      const r = parseGinzaSixSaleBody(DC370_BODY)
      assert(r.storeName === 'AMBUSH® WORKSHOP GINZA', `実際: ${r.storeName}`)
      assert(r.salesFloor === '3F', `実際: ${r.salesFloor}`)
      assert(!r.storeName!.includes('カラー') && !r.storeName!.includes('サイズ'), '直前商品のカラー/サイズ表記が混入していない')
    },
  },
  {
    name: '販売期間（saleStartAt/saleEndAt相当）は一切抽出しない（このパーサーの戻り値にフィールド自体が存在しない）',
    fn: () => {
      const r369 = parseGinzaSixSaleBody(DC369_BODY) as Record<string, unknown>
      const r370 = parseGinzaSixSaleBody(DC370_BODY) as Record<string, unknown>
      assert(!('saleStartAt' in r369) && !('saleEndAt' in r369), 'DC#369: 販売期間フィールドを持たない')
      assert(!('saleStartAt' in r370) && !('saleEndAt' in r370), 'DC#370: 販売期間フィールドを持たない')
    },
  },
  {
    name: '「YYYY.MM.DD UP」（掲載日）を販売期間として誤って抽出しない（本文に UP 表記があっても price/salesLocation 以外は増えない）',
    fn: () => {
      const r = parseGinzaSixSaleBody(DC369_BODY)
      const keys = Object.keys(r).filter((k) => k !== 'rawHits')
      assert(
        keys.every((k) => ['price', 'priceItems', 'storeName', 'salesFloor', 'salesLocation', 'productSummary'].includes(k)),
        `想定外のフィールドが無い（実際: ${keys.join(',')}）`,
      )
    },
  },
  {
    name: '価格・フロアの明示表記が無い本文では何も抽出しない（推測しない）',
    fn: () => {
      const r = parseGinzaSixSaleBody('これは価格やフロアの記載が一切無い一般的な告知文です。')
      assert(r.price === undefined, '価格なし')
      assert(r.salesLocation === undefined, '販売場所なし')
    },
  },
]

export const suite = () => runSuite('extractProductNewsFacts(ginza6)', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
