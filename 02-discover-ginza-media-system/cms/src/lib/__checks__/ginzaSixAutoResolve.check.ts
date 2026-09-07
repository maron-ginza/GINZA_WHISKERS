// GINZA WHISKERS / Project 02（2026-09-07、根本改善）
//
// DC#369（花西子 FLORASIS「洛花飛霞チーク」）・DC#370（AMBUSH x New Era）の
// 実データ（実際にDBに保存されているtitle/articleUrl/excerpt/dateExtraction、
// および実際に公式ページから取得済みの本文＝2026-09-05に確認した本文）を使って、
// 「朝の自動収集 → 抽出 → sale mapper → evaluateReadyGate」のフルパイプラインを
// オフラインで回帰テストする（DB・ネットワークに一切触れない・決定的）。
//
// 目的：
//   ・DC#369＝手入力0項目・出典confirmedで自動的にready化可能（missing.length===0）になること。
//   ・DC#370＝公式本文に「発売中/販売中」の明記が無いため saleAvailability は 'unknown' のままで、
//     不足項目が明示され、要確認（保留）として扱われること（手入力を強制しない）。
//   ・DC#369/#370 とも、DC レベルの event_start_at/event_end_at（body_label・confidence=medium・
//     実際は別記事＝UNO YOSHIHIKO個展／KOH SANVERの開催期間を拾ったもの）が、sale mapper の
//     eventDateISO へ紛れ込まないこと（extractArticleFactsCandidate の FIX 4 で null 化される）。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { extractArticleFactsCandidate } from '../morning/extractArticleFactsCandidate'
import { extractProductNewsFactsCandidate } from '../morning/extractProductNewsFacts'
import { mapSaleFactsToDraft } from '../morning/mapSaleFactsToDraft'
import { evaluateReadyGate, type CommonArticleFacts } from '../template/readyGate'
import { deriveProvisionalCategory, isCategoryResolved } from '../pipeline/provisionalCategory'
import type { DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'
import type { ImagePreflightResult, OfficialPageSignals } from '../morning/types'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const NOW = new Date('2026-09-07T09:00:00+09:00')
const NO_IMAGE: ImagePreflightResult = {
  available: false,
  policy: '画像なし（外部転載禁止・独自生成はマロン判断後）',
  externalImageProhibited: true,
}

// --- DC#369 実データ（2026-09-07時点のDB値そのまま） ---
const DC369: DiscoveredContentLike = {
  id: 369,
  title: '【花西子 FLORASIS】新作 洛花飛霞 チークで自然な血色感を。 – GINZA SIX | GSIX | ギンザ シックス | 銀座シックス',
  excerpt: '（実際の excerpt は長大なため省略。本文は officialSignals.bodyText で与える）',
  articleUrl: 'https://ginza6.tokyo/news/detail/shopnews/224270',
  sourceSiteName: 'GINZA SIX',
  eventStartAt: '2026-09-11T00:00:00.000Z', // 別記事（UNO YOSHIHIKO個展）由来の疑い値（DB実値）
  eventEndAt: '2026-09-13T00:00:00.000Z',
  venue: null,
  contentType: 'news',
  uxType: null,
  lastCheckedAt: '2026-09-06T21:01:36.096Z',
  detectedAt: '2026-09-06T21:01:36.096Z',
  dateExtraction: {
    eventStartAt: { value: '2026-09-11T00:00:00.000Z', confidence: 'medium', source: 'body_label' },
    eventEndAt: { value: '2026-09-13T00:00:00.000Z', confidence: 'medium', source: 'body_label' },
  },
}
const DC369_BODY =
  '花西子 FLORASIS GINZA Beauty 花西子 FLORASISでは、新作チークを発売中！ ' +
  '肌馴染みの良い繊細カラーで、内側からにじむような自然な血色感を。持ち運びにも便利なサイズで、ミラー付きなのも嬉しいポイント。 ' +
  '洛花飛霞(ラクカヒカ) チーク 14パープルロータス 価格：3,190円(税込) ' +
  '商品の詳細などご不明な点がございましたら、お気軽に店舗までお問い合わせください。 ' +
  '花西子 FLORASIS GINZA フロア: B1F 店舗情報はこちら 2026.08.31 UP カテゴリー All Art Beauty'
const DC369_SIGNALS: OfficialPageSignals = {
  requested: true,
  ok: true,
  httpStatus: 200,
  fetchedAt: '2026-09-05T00:00:00.000Z',
  bodyText: DC369_BODY,
}

// --- DC#370 実データ（2026-09-07時点のDB値そのまま） ---
const DC370: DiscoveredContentLike = {
  id: 370,
  title: 'AMBUSH® x New Era® – GINZA SIX | GSIX | ギンザ シックス | 銀座シックス',
  excerpt: '（実際の excerpt は長大なため省略。本文は officialSignals.bodyText で与える）',
  articleUrl: 'https://ginza6.tokyo/news/detail/shopnews/224269',
  sourceSiteName: 'GINZA SIX',
  eventStartAt: '2026-09-01T00:00:00.000Z', // 別記事（KOH SANVER）由来の疑い値（DB実値）
  eventEndAt: '2026-09-15T00:00:00.000Z',
  venue: null,
  contentType: 'news',
  uxType: null,
  lastCheckedAt: '2026-09-05T00:00:00.000Z',
  detectedAt: '2026-09-05T00:00:00.000Z',
  dateExtraction: {
    eventStartAt: { value: '2026-09-01T00:00:00.000Z', confidence: 'medium', source: 'body_label' },
    eventEndAt: { value: '2026-09-15T00:00:00.000Z', confidence: 'medium', source: 'body_label' },
  },
}
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
const DC370_SIGNALS: OfficialPageSignals = {
  requested: true,
  ok: true,
  httpStatus: 200,
  fetchedAt: '2026-09-05T00:00:00.000Z',
  bodyText: DC370_BODY,
}

function runFullPipeline(dc: DiscoveredContentLike, signals: OfficialPageSignals) {
  const base = extractArticleFactsCandidate({ dc, image: NO_IMAGE, officialSignals: signals, trustedSource: true, now: NOW })
  const product = extractProductNewsFactsCandidate({ dc, image: NO_IMAGE, officialSignals: signals, trustedSource: true, now: NOW })
  const category = deriveProvisionalCategory({
    primaryCategory: null,
    title: dc.title,
    venue: dc.venue,
    templateType: 'sale',
    contentType: dc.contentType,
  })
  const primaryCategory = isCategoryResolved(category.basis) ? category.category : null
  const mapped = mapSaleFactsToDraft({ base, product, primaryCategory, now: NOW })

  const hashtags = mapped.candidates.hashtags ?? []
  const commonFacts: CommonArticleFacts = {
    primaryCategory,
    templateType: 'sale',
    contentTitle: mapped.facts.eventName,
    contentSummary: mapped.facts.whatHappens,
    availablePeriod: mapped.facts.eventDate,
    eventDateISO: mapped.facts.eventDateISO,
    eventTime: mapped.facts.eventTime,
    venues: mapped.facts.venues,
    priceText: mapped.facts.priceText,
    saleAvailability: mapped.facts.saleAvailability,
    officialInfoNote: mapped.facts.officialInfoNote,
    hashtags: hashtags.length ? hashtags : [{ tag: '#銀座' }],
    sourceProvenanceFacts: mapped.provenanceAdds.map((p) => ({ fact: p.fact, verificationStatus: p.verificationStatus })),
    enrichmentStatus: 'ready',
  }
  const gate = evaluateReadyGate(commonFacts, 'sale', { now: NOW })
  return { base, product, category, primaryCategory, mapped, gate }
}

const cases: CheckCase[] = [
  {
    name: 'DC#369: base.fields.eventStartAt/eventEndAt が null 化される（別記事の期間を採用しない・FIX 4）',
    fn: () => {
      const { base } = runFullPipeline(DC369, DC369_SIGNALS)
      assert(base.fields.eventStartAt == null, `nullのはず（実際: ${base.fields.eventStartAt}）`)
      assert(base.fields.eventEndAt == null, `nullのはず（実際: ${base.fields.eventEndAt}）`)
      assert(base.conflicts.some((c) => c.includes('別記事')), '別記事の疑いが conflicts に記録される')
    },
  },
  {
    name: 'DC#369: primaryCategory が basis=title で自動解決される（BEAUTY）',
    fn: () => {
      const { category, primaryCategory } = runFullPipeline(DC369, DC369_SIGNALS)
      assert(category.basis === 'title', `basisはtitleのはず（実際: ${category.basis}）`)
      assert(primaryCategory === 'BEAUTY', `実際: ${primaryCategory}`)
    },
  },
  {
    name: 'DC#369: saleAvailability が ongoing_no_end_stated に自動確定する（発売中・終了示唆語なし）',
    fn: () => {
      const { product, mapped } = runFullPipeline(DC369, DC369_SIGNALS)
      assert(product.fields.saleAvailability === 'ongoing_no_end_stated', `実際: ${product.fields.saleAvailability}`)
      assert(mapped.facts.saleAvailability === 'ongoing_no_end_stated', 'mapper facts へも伝播する')
    },
  },
  {
    name: 'DC#369: eventName/whatHappens/priceText/venues/eventDate/officialInfoNote がすべて自動確定する',
    fn: () => {
      const { mapped } = runFullPipeline(DC369, DC369_SIGNALS)
      assert(mapped.facts.eventName === '洛花飛霞(ラクカヒカ) チーク 14パープルロータス', `実際: ${mapped.facts.eventName}`)
      assert(!!mapped.facts.whatHappens, 'whatHappens が入る')
      assert(mapped.facts.priceText === '洛花飛霞(ラクカヒカ) チーク 14パープルロータス：3,190円（税込）', `実際: ${mapped.facts.priceText}`)
      assert(mapped.facts.venues?.[0]?.place === '花西子 FLORASIS GINZA フロア: B1F', `実際: ${JSON.stringify(mapped.facts.venues)}`)
      assert(mapped.facts.eventDate === '発売中（開始日・終了日とも公式記載なし）', `実際: ${mapped.facts.eventDate}`)
      assert(mapped.facts.officialInfoNote === '販売終了日の記載なし（発売中）。', `実際: ${mapped.facts.officialInfoNote}`)
    },
  },
  {
    name: 'DC#369: 出典確認の confirmed 事実が provenanceAdds に追加される（sourceProvenanceFacts≥1 を満たす経路）',
    fn: () => {
      const { mapped } = runFullPipeline(DC369, DC369_SIGNALS)
      assert(
        mapped.provenanceAdds.some((p) => p.fact.includes('出典確認') && p.fact.includes('ginza6.tokyo')),
        `実際: ${JSON.stringify(mapped.provenanceAdds)}`,
      )
    },
  },
  {
    name: 'DC#369: evaluateReadyGate が eligible=true（missing.length===0）——手入力0項目で承認可能',
    fn: () => {
      const { gate } = runFullPipeline(DC369, DC369_SIGNALS)
      assert(gate.eligible === true, `missing=${JSON.stringify(gate.missing)}`)
      assert(gate.missing.length === 0, `missing=${JSON.stringify(gate.missing)}`)
    },
  },
  {
    name: 'DC#370: 公式本文に「発売中/販売中」の明記が無いため saleAvailability は unknown のまま（推測しない）',
    fn: () => {
      const { product } = runFullPipeline(DC370, DC370_SIGNALS)
      assert(product.fields.saleAvailability === 'unknown', `実際: ${product.fields.saleAvailability}`)
    },
  },
  {
    name: 'DC#370: eventName/price/venues は自動確定するが、eventDate/officialInfoNoteが無くready不可（要確認・保留）',
    fn: () => {
      const { mapped, gate } = runFullPipeline(DC370, DC370_SIGNALS)
      assert(mapped.facts.eventName === 'AMBUSH® x New Era®', `実際: ${mapped.facts.eventName}`)
      assert(!!mapped.facts.priceText, 'priceText は自動確定する')
      assert(!mapped.facts.eventDate, 'eventDate は自動確定しない（推測しない）')
      assert(!mapped.facts.officialInfoNote, 'officialInfoNote は自動確定しない（推測しない）')
      assert(gate.eligible === false, '要確認（保留）のまま')
      assert(gate.missing.some((m) => m.includes('availablePeriod')), `missingにavailablePeriodを含む（実際: ${JSON.stringify(gate.missing)}）`)
    },
  },
  {
    name: 'DC#370: 不足項目一覧は提示されるが、手入力を強制する仕組みではない（missing は情報表示のみ）',
    fn: () => {
      const { gate } = runFullPipeline(DC370, DC370_SIGNALS)
      assert(Array.isArray(gate.missing) && gate.missing.length > 0, '不足項目が配列で提示される')
    },
  },
]

export const suite = () => runSuite('ginzaSixAutoResolve(DC369/DC370 実データ)', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
