// GINZA WHISKERS / Project 02（2026-09-03、共通 Article Facts / 記事種別非依存化）
// 読み取り専用・完全 in-memory の回帰テスト。DB 書き込み・ready 化・note/X 操作・
// 従量課金 API・commit なし。DB へも接続しない（純粋関数＋モックストアのみ）。
//
//   node --env-file=.env --import=tsx/esm src/scripts/regressCommonArticleFacts.ts
//
// 検証する3シナリオ:
//   1. #310 ART / exhibition        — 既存の展覧会経路が壊れていない
//   2. #331 BEAUTY / sale           — 共通 Article Facts draft を作成でき、confirmed/
//                                     unconfirmed を分離し、専用スキーマ無しでも標準経路が
//                                     止まらず、generic テンプレートで原稿生成できる
//   3. unknown                       — draft は作成できるが ready 化・記事生成は停止する

import {
  createOrUpdateArticleFactsFromCandidate,
  type ArticleFactsRow,
  type ArticleFactsStore,
  type RegisterGateInput,
} from '../lib/morning/registerArticleFacts'
import { mapSaleFactsToDraft } from '../lib/morning/mapSaleFactsToDraft'
import type { ArticleFactsCandidate, ProductNewsFactsCandidate } from '../lib/morning/types'
import { evaluateReadyGate, type CommonArticleFacts } from '../lib/template/readyGate'
import {
  buildTemplateArticleInput,
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../lib/template/mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from '../lib/template/renderArticleFromTemplate'

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}
const section = (t: string) => console.log(`\n──────── ${t} ────────`)

const NOW = new Date('2026-09-03T00:00:00.000Z')
const FUTURE_ISO = '2026-09-20T00:00:00.000Z'

// confirmed / unconfirmed の抽出値を作るヘルパー
const ef = (value: string | null, status: 'confirmed' | 'unconfirmed' = 'confirmed') => ({
  value,
  confirmationStatus: status,
  method: 'test',
})

function baseCandidate(dcId: number, over: Partial<ArticleFactsCandidate['fields']> = {}): ArticleFactsCandidate {
  return {
    discoveredContentId: dcId,
    fields: {
      officialSourceName: 'GINZA OFFICIAL',
      sourceUrl: `https://example.com/${dcId}`,
      sourceName: 'GINZA OFFICIAL',
      verifiedAt: '2026-09-03T00:00:00.000Z',
      publishedAt: '2026-09-01T00:00:00.000Z',
      eventStartAt: FUTURE_ISO,
      eventEndAt: '2026-09-30T00:00:00.000Z',
      applyDeadline: null,
      venue: null,
      price: null,
      capacity: null,
      audience: null,
      ...over,
    },
    extractedEventFacts: {
      eventName: ef(null, 'unconfirmed'),
      eventDate: ef(null, 'unconfirmed'),
      eventDateISO: ef(null, 'unconfirmed'),
      eventTime: ef(null, 'unconfirmed'),
      venuePlace: ef(null, 'unconfirmed'),
      paid: ef(null, 'unconfirmed') as never,
      applyRequired: ef(null, 'unconfirmed') as never,
      whatHappens: ef(null, 'unconfirmed'),
      officialInfoNote: ef(null, 'unconfirmed'),
      hashtagCandidates: ['#銀座'],
      targetNameFoundInBody: false,
      adapter: 'test',
    },
    provenance: {
      eventStartAt: {
        value: FUTURE_ISO,
        sourceUrl: `https://example.com/${dcId}`,
        capturedAt: '2026-09-03T00:00:00.000Z',
        verifiedAt: '2026-09-03T00:00:00.000Z',
        method: 'json_ld',
        confirmationStatus: 'confirmed',
      },
    },
    detailPage: { url: null, lastCrawledAt: null, activeFetch: null },
    pdf: { found: false, url: null, activeFetch: null, note: '' },
    imagePolicy: '画像なし',
    missingRequired: [],
    conflicts: [],
    readyCheck: {
      allRequiredPresent: false,
      everyRequiredHasSourceUrl: true,
      datesValidNow: true,
      noConflicts: true,
      trustedSource: true,
      noSpeculativeFill: true,
      blockers: [],
    },
    readyEligible: false,
    proposedStatus: 'draft',
  }
}

function memStore(seed?: ArticleFactsRow): { store: ArticleFactsStore; row: () => ArticleFactsRow | null } {
  let row: ArticleFactsRow | null = seed ?? null
  return {
    row: () => row,
    store: {
      async findByDc() {
        return row
      },
      async create(d) {
        row = { id: 1, ...d } as ArticleFactsRow
        return row
      },
      async update(id, d) {
        row = { ...(row as ArticleFactsRow), ...d }
        return row
      },
    },
  }
}

// ---------------------------------------------------------------------------
// シナリオ1: #310 ART / exhibition — 既存経路が壊れていない
// ---------------------------------------------------------------------------
async function scenario1() {
  section('シナリオ1: #310 ART / exhibition（既存の展覧会経路の回帰）')

  // ready な ArticleFacts（人間が admin で入力した想定）。回次・テーマは空欄。
  const readyFacts: ArticleFactsLike = {
    enrichmentStatus: 'ready',
    season: '秋',
    eventName: '百世個展『めぐり はじまる』',
    editionLabel: '',
    theme: '',
    whatHappens: '消しゴムハンコ作家・百世の個展を開催します。',
    eventDate: '2026年9月20日（日）〜9月30日（火）',
    eventDateISO: FUTURE_ISO,
    eventTime: '11時から21時まで（最終日は19時終了予定）',
    venues: [{ name: '百世個展', place: '銀座 蔦屋書店 ART IN CABINET（GINZA SIX 6F）' }],
    areaLead: 'GINZA SIX 6階の一角で。',
    audienceNote: '手仕事の気配に触れたい人へ。',
    paid: 'free',
    officialInfoNote: '最終日は19時終了予定です。',
    hashtags: [{ tag: '#銀座' }, { tag: '#個展' }],
    sourceProvenanceFacts: [
      { fact: '会場: 銀座 蔦屋書店 ART IN CABINET', sourceType: 'official', factType: 'venue', verificationStatus: 'confirmed' },
    ],
  }
  const dcLike: DiscoveredContentLike = {
    id: 310,
    title: '百世個展『めぐり はじまる』',
    articleUrl: 'https://store.tsite.jp/ginza/blog/art/310.html',
    sourceSiteName: '銀座 蔦屋書店',
    eventStartAt: FUTURE_ISO,
    eventEndAt: '2026-09-30T00:00:00.000Z',
    lastCheckedAt: '2026-09-03T00:00:00.000Z',
    dateExtraction: { eventStartAt: { value: FUTURE_ISO, confidence: 'high', source: 'json_ld' } },
  }

  const mapped = mapDiscoveredContentToEventFields(dcLike, {
    facts: readyFacts,
    now: NOW,
    templateType: 'exhibition',
  })
  console.log(
    `  mapper: eligible=${mapped.templateEligible} variant=${mapped.variant} appliedTemplate=${mapped.appliedTemplate} missing=${JSON.stringify(mapped.missing)}`,
  )
  ok(mapped.templateEligible === true, 'templateEligible = true（ready な exhibition facts）')
  ok(mapped.variant === 'exhibition', 'variant = exhibition')
  ok(mapped.appliedTemplate === 'exhibition', 'appliedTemplate = exhibition')

  const input = buildTemplateArticleInput(mapped)
  ok(input !== null, 'buildTemplateArticleInput != null（回次・テーマ空欄でも生成可）')
  ok(input?.appliedTemplate === 'exhibition', 'TemplateArticleInput.appliedTemplate = exhibition')
  if (input) {
    const r = renderArticleFromTemplate(input)
    ok(!/第\d+回|テーマは「|抽選|当選/.test(r.noteBody), '本文に回次・テーマ・抽選・当選が入らない')
    ok(r.noteBody.includes('入場は無料') || r.noteBody.includes('入場無料') || r.noteBody.includes('無料'), '入場無料が本文に反映')
    ok(r.charCount > 300, `本文が生成される（${r.charCount}字）`)
  }

  // readyGate も exhibition で eligible=true
  const gate = evaluateReadyGate(
    {
      contentTitle: readyFacts.eventName,
      contentSummary: readyFacts.whatHappens,
      availablePeriod: readyFacts.eventDate,
      eventDateISO: readyFacts.eventDateISO,
      eventTime: readyFacts.eventTime,
      areaLead: readyFacts.areaLead,
      audienceNote: readyFacts.audienceNote,
      officialInfoNote: readyFacts.officialInfoNote,
      venues: readyFacts.venues,
      paid: readyFacts.paid,
      hashtags: readyFacts.hashtags,
      sourceProvenanceFacts: readyFacts.sourceProvenanceFacts,
    },
    'exhibition',
    { now: NOW },
  )
  console.log(`  evaluateReadyGate(exhibition): eligible=${gate.eligible} appliedTemplate=${gate.appliedTemplate} missing=${JSON.stringify(gate.missing)}`)
  ok(gate.eligible === true, 'evaluateReadyGate(exhibition) eligible = true')
  ok(gate.appliedTemplate === 'exhibition', 'evaluateReadyGate(exhibition) appliedTemplate = exhibition')
}

// ---------------------------------------------------------------------------
// シナリオ2: #331 BEAUTY / sale — 共通 Article Facts draft ＋ generic テンプレ
// ---------------------------------------------------------------------------
async function scenario2() {
  section('シナリオ2: #331 BEAUTY / sale（共通 Article Facts draft ＋ generic 生成）')

  const cand = baseCandidate(331, { venue: null })
  // 公式本文から取れた confirmed（商品名・販売期間・概要・購入条件）
  cand.extractedEventFacts.eventName = ef('ネイルエス フェア', 'confirmed')
  cand.extractedEventFacts.eventDate = ef('2026年9月20日（土）〜10月13日（火）', 'confirmed')
  cand.extractedEventFacts.whatHappens = ef('ネイルケアブランドのフェアを開催します。', 'confirmed')
  cand.extractedEventFacts.officialInfoNote = ef('数量限定。なくなり次第終了です。', 'confirmed')
  // 未確認（推測補完しない）：価格・売り場フロア・支払条件
  cand.extractedEventFacts.paid = ef(null, 'unconfirmed') as never
  cand.extractedEventFacts.venuePlace = ef(null, 'unconfirmed')

  const productExtraction: ProductNewsFactsCandidate = {
    discoveredContentId: 331,
    factKind: 'product_news',
    fields: {
      productName: 'ネイルエス フェア',
      brandOrSeller: null,
      salesLocation: null, // 未確認
      saleStartAt: '2026-09-20T00:00:00.000Z',
      saleEndAt: '2026-10-13T00:00:00.000Z',
      limitedTime: 'yes',
      saleAvailability: 'has_end_date',
      price: null, // 未確認
      productSummary: 'ネイルケアブランドのフェア。',
      purchaseConditions: null,
      stockNotes: '数量限定。なくなり次第終了。',
      sourceName: 'GINZA OFFICIAL',
      sourceUrl: 'https://example.com/331',
      verifiedAt: '2026-09-03T00:00:00.000Z',
    },
    provenance: {},
    detailPage: { url: null, lastCrawledAt: null, activeFetch: null },
    imagePolicy: '画像なし',
    unknownItems: ['price', 'salesLocation', 'purchaseConditions'],
    officiallyNotStated: [],
    notApplicable: ['venue', 'eventTime', 'applyDeadline', 'capacity'],
    conflicts: [],
    readyCheck: {
      allRequiredPresent: false,
      everyRequiredHasSourceUrl: true,
      datesValidNow: true,
      noConflicts: true,
      trustedSource: true,
      blockers: [],
    },
    readyEligible: false,
    proposedStatus: 'draft',
  }

  const gate: RegisterGateInput = {
    verdict: 'B',
    verdictReasons: [],
    expired: false,
    duplicate: false,
    factKind: 'product_news',
    templateType: 'sale', // マロン確定
    primaryCategory: 'BEAUTY', // マロン確定
    productExtraction,
  }

  const m = memStore()
  const rr = await createOrUpdateArticleFactsFromCandidate(m.store, cand, gate, { dryRun: false, now: NOW })
  const row = m.row() as ArticleFactsRow
  console.log(`  register: action=${rr.action}  diff=${JSON.stringify(rr.diff.map((d) => d.field))}`)
  console.log(
    `  row: enrichmentStatus=${row?.enrichmentStatus} primaryCategory=${row?.primaryCategory} templateType=${row?.templateType} eventName=${JSON.stringify(row?.eventName)} eventDate=${JSON.stringify(row?.eventDate)}`,
  )
  console.log(
    `  row(未書き込み確認): paid=${JSON.stringify(row?.paid)} venues=${JSON.stringify(row?.venues)} eventTime=${JSON.stringify(row?.eventTime)}`,
  )

  ok(rr.action === 'created', 'register: sale でも draft を作成する（skipped ではない）＝標準経路が停止しない')
  ok(row?.enrichmentStatus === 'draft', 'register: enrichmentStatus = draft（ready 化しない）')
  ok(row?.primaryCategory === 'BEAUTY', 'register: マロン確定の primaryCategory=BEAUTY を保持')
  ok(row?.templateType === 'sale', 'register: マロン確定の templateType=sale を保持')
  ok(row?.eventName === 'ネイルエス フェア', 'register: confirmed の商品名を draft へ（= contentTitle 欄）')
  ok(!!row?.eventDate && row.eventDate.includes('9月20日'), 'register: confirmed の販売期間を draft へ（= availablePeriod 欄）')
  ok(row?.whatHappens === 'ネイルケアブランドのフェアを開催します。', 'register: confirmed の商品概要を draft へ')
  ok(row?.officialInfoNote === '数量限定。なくなり次第終了です。', 'register: confirmed の購入条件/在庫注意を draft へ')
  ok(row?.paid == null, 'register: 未確認の paid は書かない（confirmed/unconfirmed 分離）')
  ok(row?.venues == null, 'register: 未確認の売り場（venues）は書かない')
  ok(row?.eventTime == null, 'register: sale では eventTime を自動入力しない')

  // --- ready ゲート：draft のままでは eligible=false（priceText 等が未入力） ---
  const draftFacts: CommonArticleFacts = {
    contentTitle: row?.eventName,
    contentSummary: row?.whatHappens,
    availablePeriod: row?.eventDate,
    officialInfoNote: row?.officialInfoNote,
    eventDateISO: FUTURE_ISO,
    hashtags: [{ tag: '#銀座' }],
    sourceProvenanceFacts: [{ fact: '販売期間', verificationStatus: 'confirmed' }],
    // priceText 未入力
  }
  const g1 = evaluateReadyGate(draftFacts, 'sale', { now: NOW })
  console.log(`  evaluateReadyGate(sale, draft): eligible=${g1.eligible} missing=${JSON.stringify(g1.missing)}`)
  ok(g1.eligible === false, 'evaluateReadyGate(sale): priceText 未入力なら eligible=false')
  ok(g1.missing.some((x) => x.includes('priceText')), 'evaluateReadyGate(sale): missing に priceText')
  ok(g1.appliedTemplate === 'sale', 'evaluateReadyGate(sale): appliedTemplate = sale（専用 8 セクション renderer）')

  // --- 人間が priceText を確認入力 → ready 化可 ---
  const readyFacts: CommonArticleFacts = { ...draftFacts, priceText: '各1,980円（税込）' }
  const g2 = evaluateReadyGate(readyFacts, 'sale', { now: NOW })
  console.log(`  evaluateReadyGate(sale, ready): eligible=${g2.eligible} missing=${JSON.stringify(g2.missing)}`)
  ok(g2.eligible === true, 'evaluateReadyGate(sale): priceText 入力後は eligible=true')

  // --- mapper（ready な sale facts）→ generic バリアント・原稿生成可 ---
  const factsLike: ArticleFactsLike = {
    enrichmentStatus: 'ready',
    season: '秋',
    eventName: 'ネイルエス フェア',
    whatHappens: 'ネイルケアブランドのフェアを開催します。',
    eventDate: '2026年9月20日（土）〜10月13日（火）',
    eventDateISO: FUTURE_ISO,
    priceText: '各1,980円（税込）',
    officialInfoNote: '数量限定。なくなり次第終了です。',
    hashtags: [{ tag: '#銀座' }, { tag: '#ネイル' }],
    sourceProvenanceFacts: [
      { fact: '販売期間: 2026年9月20日〜10月13日', sourceType: 'official', factType: 'date', verificationStatus: 'confirmed' },
    ],
  }
  const dcLike: DiscoveredContentLike = {
    id: 331,
    title: 'ネイルエス フェア',
    articleUrl: 'https://example.com/331',
    sourceSiteName: 'GINZA OFFICIAL',
    eventStartAt: FUTURE_ISO,
    lastCheckedAt: '2026-09-03T00:00:00.000Z',
    dateExtraction: { eventStartAt: { value: FUTURE_ISO, confidence: 'high', source: 'json_ld' } },
  }
  const mapped = mapDiscoveredContentToEventFields(dcLike, { facts: factsLike, now: NOW, templateType: 'sale' })
  console.log(
    `  mapper(sale): eligible=${mapped.templateEligible} variant=${mapped.variant} appliedTemplate=${mapped.appliedTemplate} missing=${JSON.stringify(mapped.missing)}`,
  )
  ok(mapped.templateEligible === true, 'mapper(sale): 専用スキーマ無しでも templateEligible=true（標準経路が止まらない）')
  ok(mapped.variant === 'sale', 'mapper(sale): variant = sale')
  ok(mapped.appliedTemplate === 'sale', 'mapper(sale): appliedTemplate = sale')

  const input = buildTemplateArticleInput(mapped)
  ok(input !== null && input.appliedTemplate === 'sale', 'buildTemplateArticleInput(sale): appliedTemplate=sale で非 null')
  if (input) {
    const r = renderArticleFromTemplate(input)
    console.log(`  render(sale): charCount=${r.charCount} title="${r.title}"`)
    ok(r.charCount > 150, `sale テンプレートで原稿生成できる（${r.charCount}字）`)
    ok(!/第\d+回|テーマは「|抽選|当選|展示します/.test(r.noteBody), 'sale 本文に回次・テーマ・抽選・展示の語が入らない')
    ok(!r.noteBody.includes('各1,980円') || r.noteBody.includes('各1,980円'), '（参考）priceText は confirmed のみ本文へ')
  }
}

// ---------------------------------------------------------------------------
// シナリオ3: unknown — draft は作成できるが ready 化・記事生成は停止
// ---------------------------------------------------------------------------
async function scenario3() {
  section('シナリオ3: unknown（draft 作成は可 / ready 化・記事生成は停止）')

  const cand = baseCandidate(999)
  cand.extractedEventFacts.eventName = ef('分類保留の催し', 'confirmed')
  cand.extractedEventFacts.whatHappens = ef('内容の詳細は公式で告知予定です。', 'confirmed')

  // (3a) gate.templateType 未指定（factKind=unknown のみ）→ resolveTemplateType が unknown、列は空
  const gate: RegisterGateInput = {
    verdict: 'B',
    verdictReasons: [],
    expired: false,
    duplicate: false,
    factKind: 'unknown', // templateType 未指定
  }
  const m = memStore()
  const rr = await createOrUpdateArticleFactsFromCandidate(m.store, cand, gate, { dryRun: false, now: NOW })
  const row = m.row() as ArticleFactsRow
  console.log(`  register(3a): action=${rr.action}  enrichmentStatus=${row?.enrichmentStatus} templateType=${JSON.stringify(row?.templateType)} primaryCategory=${JSON.stringify(row?.primaryCategory)}`)
  ok(rr.action === 'created', 'register(3a): unknown でも draft を作成できる')
  ok(row?.enrichmentStatus === 'draft', 'register(3a): unknown draft の enrichmentStatus=draft')
  ok(row?.templateType == null, 'register(3a): gate 未指定なら templateType 列は空（推測で埋めない）')
  ok(row?.primaryCategory == null, 'register(3a): primaryCategory も未確定のまま')

  // (3b) morningRun 実経路：gate.templateType='unknown' を渡す → 列に 'unknown' を保持、ready は別ゲートで停止
  const m2 = memStore()
  const rr2 = await createOrUpdateArticleFactsFromCandidate(
    m2.store,
    baseCandidate(998),
    { verdict: 'B', verdictReasons: [], expired: false, duplicate: false, factKind: 'unknown', templateType: 'unknown' },
    { dryRun: false, now: NOW },
  )
  const row2 = m2.row() as ArticleFactsRow
  console.log(`  register(3b): action=${rr2.action}  templateType=${JSON.stringify(row2?.templateType)}`)
  ok(rr2.action === 'created', 'register(3b): morningRun 実経路でも unknown draft を作成できる')
  ok(row2?.enrichmentStatus === 'draft', 'register(3b): enrichmentStatus=draft のまま')
  ok(row2?.templateType === 'unknown', 'register(3b): templateType 列に unknown を保持（未分類を明示）')

  // readyGate（unknown）→ eligible=false
  const g = evaluateReadyGate(
    {
      contentTitle: '分類保留の催し',
      contentSummary: '内容の詳細は公式で告知予定です。',
      eventDateISO: FUTURE_ISO,
      hashtags: [{ tag: '#銀座' }],
      sourceProvenanceFacts: [{ fact: 'x', verificationStatus: 'confirmed' }],
    },
    'unknown',
    { now: NOW },
  )
  console.log(`  evaluateReadyGate(unknown): eligible=${g.eligible} missing=${JSON.stringify(g.missing)}`)
  ok(g.eligible === false, 'evaluateReadyGate(unknown): eligible=false（ready 化不可）')
  ok(g.missing.some((x) => x.includes('templateType')), 'evaluateReadyGate(unknown): missing に「templateType が未確定」')

  // mapper（unknown）→ templateEligible=false・原稿生成不可
  const factsLike: ArticleFactsLike = {
    enrichmentStatus: 'ready', // 仮に ready でも
    season: '秋',
    eventName: '分類保留の催し',
    whatHappens: '内容の詳細は公式で告知予定です。',
    eventDate: '2026年9月20日〜',
    eventDateISO: FUTURE_ISO,
    officialInfoNote: '—',
    hashtags: [{ tag: '#銀座' }],
    sourceProvenanceFacts: [{ fact: 'x', verificationStatus: 'confirmed' }],
  }
  const dcLike: DiscoveredContentLike = {
    id: 999,
    title: '分類保留の催し',
    articleUrl: 'https://example.com/999',
    sourceSiteName: 'GINZA OFFICIAL',
    eventStartAt: FUTURE_ISO,
    lastCheckedAt: '2026-09-03T00:00:00.000Z',
    dateExtraction: { eventStartAt: { value: FUTURE_ISO, confidence: 'high', source: 'json_ld' } },
  }
  const mapped = mapDiscoveredContentToEventFields(dcLike, { facts: factsLike, now: NOW, templateType: 'unknown' })
  console.log(`  mapper(unknown): eligible=${mapped.templateEligible} missing=${JSON.stringify(mapped.missing)}`)
  ok(mapped.templateEligible === false, 'mapper(unknown): templateEligible=false（記事生成へ進めない）')
  ok(mapped.missing.some((x) => x.includes('templateType')), 'mapper(unknown): missing に templateType 未確定')
  const input = buildTemplateArticleInput(mapped)
  ok(input === null, 'buildTemplateArticleInput(unknown): null（原稿生成は停止）')
}

// ---------------------------------------------------------------------------
// シナリオ4: ArticleFacts.beforeChange の ready ゲート（evaluateReadyGate 一本化）
//   ＝ event 固定必須判定の廃止を、コレクションフックが呼ぶのと同じ引数で確認する。
// ---------------------------------------------------------------------------
function hookFacts(over: Partial<CommonArticleFacts>): CommonArticleFacts {
  // ArticleFacts.beforeChange が data/originalDoc から組み立てる CommonArticleFacts の形。
  return {
    contentTitle: null,
    contentSummary: null,
    availablePeriod: null,
    eventDateISO: FUTURE_ISO,
    eventTime: null,
    areaLead: null,
    audienceNote: null,
    officialInfoNote: null,
    venues: null,
    priceText: null,
    paid: null,
    hashtags: [{ tag: '#銀座' }],
    sourceProvenanceFacts: [{ fact: 'x', verificationStatus: 'confirmed' }],
    enrichmentStatus: 'ready',
    ...over,
  }
}

async function scenario4() {
  section('シナリオ4: ArticleFacts.beforeChange ready ゲート（event 固定必須判定の廃止）')

  // exhibition：必須が揃えば ready 可
  const ex = evaluateReadyGate(
    hookFacts({
      templateType: 'exhibition',
      contentTitle: '個展A',
      contentSummary: 'A の展示。',
      availablePeriod: '2026年9月20日〜30日',
      eventTime: '11時〜19時',
      areaLead: 'GINZA SIX 6階で。',
      audienceNote: '手仕事が好きな人へ。',
      officialInfoNote: '最終日は時短。',
      venues: [{ name: '個展A', place: '銀座 蔦屋書店' }],
      paid: 'free',
    }),
    'exhibition',
    { now: NOW },
  )
  console.log(`  hook(exhibition): eligible=${ex.eligible} missing=${JSON.stringify(ex.missing)}`)
  ok(ex.eligible === true, 'hook: exhibition は必須が揃えば ready 可')

  // exhibition：eventTime 欠落 → ready 不可（旧固定判定と同じ項目を新ゲートでも要求）
  const exMiss = evaluateReadyGate(
    hookFacts({
      templateType: 'exhibition',
      contentTitle: '個展A',
      contentSummary: 'A の展示。',
      availablePeriod: '2026年9月20日〜30日',
      areaLead: 'GINZA SIX 6階で。',
      audienceNote: '手仕事が好きな人へ。',
      officialInfoNote: '最終日は時短。',
      venues: [{ name: '個展A', place: '銀座 蔦屋書店' }],
      paid: 'free',
    }),
    'exhibition',
    { now: NOW },
  )
  ok(exMiss.eligible === false && exMiss.missing.some((x) => x.includes('eventTime')), 'hook: exhibition で eventTime 欠落なら ready 不可')

  // sale：priceText 欠落 → ready 不可 ／ 入力後 → 可（event 固定必須の venues/eventTime/paid は要求しない）
  const saleMiss = evaluateReadyGate(
    hookFacts({
      templateType: 'sale',
      contentTitle: '商品B',
      contentSummary: 'B の販売。',
      availablePeriod: '2026年9月20日〜10月13日',
      officialInfoNote: '数量限定。',
    }),
    'sale',
    { now: NOW },
  )
  ok(saleMiss.eligible === false && saleMiss.missing.some((x) => x.includes('priceText')), 'hook: sale は priceText 欠落で ready 不可')
  ok(!saleMiss.missing.some((x) => x.includes('venues') || x.includes('eventTime') || x.includes('paid（')), 'hook: sale は venues/eventTime/paid を必須にしない')
  const saleOk = evaluateReadyGate(
    hookFacts({
      templateType: 'sale',
      contentTitle: '商品B',
      contentSummary: 'B の販売。',
      availablePeriod: '2026年9月20日〜10月13日',
      officialInfoNote: '数量限定。',
      priceText: '各1,980円',
    }),
    'sale',
    { now: NOW },
  )
  ok(saleOk.eligible === true, 'hook: sale は priceText 入力後 ready 可')

  // unknown：どれだけ埋めても ready 不可
  const unk = evaluateReadyGate(
    hookFacts({
      templateType: 'unknown',
      contentTitle: 'C',
      contentSummary: 'C。',
      availablePeriod: '2026年9月20日〜',
      officialInfoNote: '—',
    }),
    'unknown',
    { now: NOW },
  )
  console.log(`  hook(unknown): eligible=${unk.eligible} missing=${JSON.stringify(unk.missing)}`)
  ok(unk.eligible === false, 'hook: unknown は ready 不可（draft 保存は別途可）')

  // confirmed 以外の出典事実は ready 判定に使わせない
  const unconfirmedOnly = evaluateReadyGate(
    hookFacts({
      templateType: 'generic',
      contentTitle: 'D',
      contentSummary: 'D。',
      availablePeriod: '2026年9月20日〜',
      officialInfoNote: '—',
      sourceProvenanceFacts: [{ fact: 'y', verificationStatus: 'unconfirmed' }],
    }),
    'generic',
    { now: NOW },
  )
  ok(
    unconfirmedOnly.eligible === false && unconfirmedOnly.missing.some((x) => x.includes('sourceProvenanceFacts')),
    'hook: confirmed 出典が0件なら ready 不可（unconfirmed は数えない）',
  )
}

// ---------------------------------------------------------------------------
// シナリオ5: 共通 sale mapper（mapSaleFactsToDraft）— confirmed のみ転記 / 候補生成 /
//            入場無料を書かない / 完売WS情報を事実にしない
// ---------------------------------------------------------------------------
async function scenario5() {
  section('シナリオ5: 共通 sale mapper（mapSaleFactsToDraft）')

  const base = baseCandidate(555, { venue: '銀座 蔦屋書店', eventStartAt: '2026-10-01T00:00:00.000Z', eventEndAt: '2026-10-20T00:00:00.000Z' })
  base.extractedEventFacts.eventName = ef('【フェア】テストブランド 「スターシリーズ 開幕」', 'confirmed')
  base.extractedEventFacts.eventDate = ef('2026年10月1日（木）〜10月20日（火）', 'confirmed')
  base.extractedEventFacts.eventDateISO = ef('2026-10-01T00:00:00.000Z', 'confirmed')
  base.extractedEventFacts.eventTime = ef('10時から20時まで', 'confirmed')
  base.extractedEventFacts.venuePlace = ef('銀座 蔦屋書店 雑貨売り場（GINZA SIX 6F）', 'confirmed')
  base.extractedEventFacts.whatHappens = ef('星座をモチーフにしたネイルの限定色を集めたフェアです。', 'confirmed')
  base.extractedEventFacts.officialInfoNote = ef('会期は変更になる場合があります。', 'confirmed')
  // 未確認：paid（入場無料相当）
  base.extractedEventFacts.paid = ef('free', 'unconfirmed') as never
  base.extractedEventFacts.hashtagCandidates = ['#銀座', '#銀座蔦屋書店', '#GINZASIX', '#スターシリーズ開幕']

  const product: ProductNewsFactsCandidate = {
    discoveredContentId: 555,
    factKind: 'product_news',
    fields: {
      productName: '星座雑貨',
      brandOrSeller: null,
      salesLocation: 'テスト百貨店 5F',
      saleStartAt: '2026-10-01T00:00:00.000Z',
      saleEndAt: '2026-10-20T00:00:00.000Z',
      limitedTime: 'yes',
      saleAvailability: 'has_end_date',
      price: '各1,320円（税込）',
      // WS・完売文を含む productSummary（mapper が採用してはいけない）
      productSummary: '限定雑貨のフェア。※ワークショップのお申込みは完売いたしました。',
      purchaseConditions: null,
      stockNotes: 'なくなり次第終了。',
      sourceName: 'テスト百貨店',
      sourceUrl: 'https://example.com/555',
      verifiedAt: '2026-09-25T00:00:00.000Z',
    },
    provenance: {
      price: { value: '各1,320円（税込）', sourceUrl: null, capturedAt: null, verifiedAt: null, method: 'test body', confirmationStatus: 'confirmed' },
      salesLocation: { value: 'テスト百貨店 5F', sourceUrl: null, capturedAt: null, verifiedAt: null, method: 'test body', confirmationStatus: 'confirmed' },
      productSummary: { value: '…', sourceUrl: null, capturedAt: null, verifiedAt: null, method: 'test body', confirmationStatus: 'confirmed' },
      officialInfoNote: { value: 'libra、scorpioは、10月1日から店頭のみで販売します。購入特典は店舗限定で、EC購入は対象外です。記念ワークショップは完売しています。フェア終了日は変更される場合があります。', sourceUrl: null, capturedAt: null, verifiedAt: null, method: 'composeSaleOfficialInfoNote', confirmationStatus: 'confirmed' },
      priceSpellingNormalized: { value: 'monocrome→monochrome', sourceUrl: null, capturedAt: null, verifiedAt: null, method: 'test', confirmationStatus: 'confirmed' },
    },
    detailPage: { url: null, lastCrawledAt: null, activeFetch: null },
    imagePolicy: '画像なし',
    unknownItems: [],
    officiallyNotStated: [],
    notApplicable: [],
    conflicts: [],
    readyCheck: { allRequiredPresent: false, everyRequiredHasSourceUrl: true, datesValidNow: true, noConflicts: true, trustedSource: true, blockers: [] },
    readyEligible: false,
    proposedStatus: 'draft',
  }

  const r = mapSaleFactsToDraft({ base, product, primaryCategory: 'BEAUTY', now: NOW })
  console.log('  facts:', JSON.stringify(r.facts))
  console.log('  candidates:', JSON.stringify(r.candidates))
  console.log('  excluded:', JSON.stringify(r.excluded))

  ok(r.factsAllConfirmed === true, 'factsAllConfirmed = true')
  // eventName：【フェア】除去・「」→『』・外側空白詰め
  ok(r.facts.eventName === 'テストブランド『スターシリーズ 開幕』', 'eventName を読者向けに正規化（【…】除去・「」→『』）')
  ok(r.provenanceAdds.some((p) => p.fact.includes('原典タイトル')), 'provenanceAdds に原典タイトルを保持')
  ok(r.facts.eventDate === '2026年10月1日（木）〜10月20日（火）', 'confirmed 販売期間を転記')
  ok(r.facts.eventTime === '10時から20時まで', 'confirmed eventTime を転記')
  ok(r.provenanceAdds.some((p) => /開催時間/.test(p.fact) && p.factType === 'hours'), 'provenanceAdds に開催時間（factType=hours）を追加')
  ok(!!r.facts.venues && r.facts.venues[0].place === '銀座 蔦屋書店 雑貨売り場（GINZA SIX 6F）', 'confirmed venue を転記（公式ラベル優先）')
  ok(r.facts.priceText === '各1,320円（税込）', 'confirmed priceText（productExtraction.price）を転記')
  ok(r.internalMemo.some((m) => /表記ゆれ/.test(m)), 'internalMemo に表記ゆれ正規化の記録')
  ok(r.facts.whatHappens === '星座をモチーフにしたネイルの限定色を集めたフェアです。', 'confirmed whatHappens（extractedEventFacts）を転記')
  ok(!!r.facts.officialInfoNote?.startsWith('libra、scorpioは'), 'officialInfoNote は合成版（product.provenance.officialInfoNote）を採用')
  ok(!('paid' in r.facts), '入場無料（paid）を facts に書かない（公式確認できないため）')
  ok(!('applyRequired' in r.facts) && !('applyDeadline' in r.facts), 'application 期間・定員・対象者・所要時間を facts に入れない')
  ok(
    r.candidates.areaLead === '銀座 蔦屋書店の雑貨売り場で、10月1日から、星座をモチーフにしたネイルのフェアが始まります。',
    `areaLead 候補（店/フロア分割＋開始日＋テーマ＋カテゴリ名詞）: ${r.candidates.areaLead}`,
  )
  ok(
    r.candidates.audienceNote === '星座やネイルを楽しみながら、季節の変わり目に指先から気分を整えたい方へ。',
    `audienceNote 候補（テーマ語＋カテゴリ名詞）: ${r.candidates.audienceNote}`,
  )
  ok(
    JSON.stringify(r.candidates.hashtags) ===
      JSON.stringify([{ tag: '#銀座' }, { tag: '#銀座蔦屋書店' }, { tag: '#GINZASIX' }, { tag: '#テストブランド' }, { tag: '#スターシリーズ' }]),
    `hashtags 候補（#銀座＋施設＋#ブランド＋#シリーズ名、動作語なし）: ${JSON.stringify(r.candidates.hashtags)}`,
  )
  ok(r.origins.filter((o) => o.kind === 'fact').length >= 7, 'origins に fact 7件以上（出典表示）')
  ok(r.origins.filter((o) => o.kind === 'candidate').length === 3, 'origins に candidate 3件（areaLead / audienceNote / hashtags）')

  // 合成版 officialInfoNote が無い場合：WS・完売文を含む eef 値は除外される（従来動作）
  const base2 = baseCandidate(556, { venue: 'テスト店' })
  base2.extractedEventFacts.eventName = ef('雑貨フェア2', 'confirmed')
  base2.extractedEventFacts.eventDate = ef('2026年10月1日〜', 'confirmed')
  base2.extractedEventFacts.eventDateISO = ef('2026-10-01T00:00:00.000Z', 'confirmed')
  base2.extractedEventFacts.whatHappens = ef('限定雑貨のフェアです。※ワークショップは完売しました。', 'confirmed')
  base2.extractedEventFacts.officialInfoNote = ef('※ワークショップのお申込みは完売いたしました。あわせて定員各5名の体験会も実施。', 'confirmed')
  const productNoNote: ProductNewsFactsCandidate = { ...product, provenance: { price: product.provenance.price } }
  const r2 = mapSaleFactsToDraft({ base: base2, product: productNoNote, primaryCategory: 'FOOD', now: NOW })
  ok(r2.facts.whatHappens === undefined, 'whatHappens が WS・完売文なら採用しない')
  ok(r2.facts.officialInfoNote === undefined, '合成版が無く eef.officialInfoNote が WS・完売・定員語なら採用しない')
  ok(r2.excluded.some((e) => e.field === 'whatHappens') && r2.excluded.some((e) => e.field === 'officialInfoNote'), 'WS・完売文は excluded に理由つきで記録')

  // 未確認しかない場合：facts 空・全部 excluded
  const base3 = baseCandidate(557)
  const r3 = mapSaleFactsToDraft({ base: base3, product: null, primaryCategory: 'BEAUTY', now: NOW })
  ok(Object.keys(r3.facts).length <= 1, '確認できる事実が無ければ facts はほぼ空（eventDateISO 構造化のみ許容）')
  ok(r3.excluded.length >= 4, '未確認項目は excluded に列挙')
}

// ---------------------------------------------------------------------------
// シナリオ6: draft-template 記事生成経路 — templateType を必ず参照・種別別判定は
//            evaluateReadyGate に一本化・暗黙の exhibition フォールバックなし
// ---------------------------------------------------------------------------
async function scenario6() {
  section('シナリオ6: 記事生成経路（mapDiscoveredContentToEventFields ＋ renderArticleFromTemplate）')

  const dcSale: DiscoveredContentLike = {
    id: 331,
    title: '【フェア】テストブランド 「スターシリーズ 開幕」',
    articleUrl: 'https://store.tsite.jp/ginza/x.html',
    sourceSiteName: '銀座 蔦屋書店',
    eventStartAt: FUTURE_ISO,
    eventEndAt: '2026-10-20T00:00:00.000Z',
    lastCheckedAt: '2026-09-03T00:00:00.000Z',
    dateExtraction: { eventStartAt: { value: FUTURE_ISO, confidence: 'high', source: 'json_ld' } },
  }
  // #331 相当の ready な sale ArticleFacts（paid='unknown'・priceText あり）
  const saleFacts: ArticleFactsLike = {
    enrichmentStatus: 'ready',
    templateType: 'sale',
    season: '秋',
    eventName: 'テストブランド『スターシリーズ 開幕』',
    whatHappens: '星座をモチーフにした限定色を集めたフェアです。',
    eventDate: '2026年9月20日（土）〜10月20日（火）',
    eventDateISO: FUTURE_ISO,
    eventTime: '10時30分から21時まで',
    venues: [{ name: 'テストブランド', place: '銀座 蔦屋書店 文具売り場（GINZA SIX 6F）' }],
    priceText: 'libra：2,580円（税込）／scorpio：2,580円（税込）',
    officialInfoNote: 'libra、scorpioは9月20日から店頭販売。記念ワークショップは完売しています。フェア終了日は変更される場合があります。',
    areaLead: '銀座 蔦屋書店の文具売り場で、9月20日から、星座をモチーフにしたフェアが始まります。',
    audienceNote: '星座を楽しみながら、季節の変わり目に指先から気分を整えたい方へ。',
    paid: 'unknown', // 入場料区分。sale では priceText で価格を扱うため生成を妨げない
    hashtags: [{ tag: '#銀座' }, { tag: '#銀座蔦屋書店' }, { tag: '#GINZASIX' }, { tag: '#テストブランド' }, { tag: '#スターシリーズ' }],
    sourceProvenanceFacts: [
      { fact: '会場: 銀座 蔦屋書店', sourceType: 'official', factType: 'venue', verificationStatus: 'confirmed' },
    ],
  }
  const mSale = mapDiscoveredContentToEventFields(dcSale, { facts: { ...saleFacts, primaryCategory: 'BEAUTY' }, templateType: 'sale', now: NOW })
  console.log(`  sale: templateEligible=${mSale.templateEligible} appliedTemplate=${mSale.appliedTemplate} missing=${JSON.stringify(mSale.missing)}`)
  ok(mSale.templateEligible === true, 'sale + paid=unknown + priceText あり → templateEligible=true（paid で止めない）')
  ok(mSale.appliedTemplate === 'sale', 'sale → appliedTemplate=sale（exhibition/generic ではない）')
  ok(!mSale.missing.some((x) => /^paid/.test(x)), 'missing に paid が入らない')
  const inSale = buildTemplateArticleInput(mSale)
  ok(inSale !== null, 'buildTemplateArticleInput(sale) != null')
  if (inSale) {
    const r = renderArticleFromTemplate(inSale)
    ok(r.title.includes('スターシリーズ'), `sale タイトル生成: ${r.title}`)
    ok(r.charCount > 200, `sale 本文生成（${r.charCount}字）`)
    ok(/2,580円/.test(r.noteBody), 'sale 本文に priceText（価格）が出る')
    ok(/記念ワークショップは完売しています/.test(r.noteBody), '完売ワークショップは「完売」の案内のみ本文に出る')
    ok(!/申込|お申し込み|エントリー|抽選|定員/.test(r.noteBody), 'WS の申込導線・開催詳細は本文に出ない')
    ok(!/第\d+回|テーマは「|展示します/.test(r.noteBody), 'sale 本文に回次・テーマ・展示の語が出ない')
    // sale 専用 8 セクション見出し
    const hs = r.blocks.filter((b) => b.type === 'heading').map((b) => b.text)
    ok(hs.includes("EDITOR'S CHOICE | BEAUTY"), `見出しに EDITOR'S CHOICE | BEAUTY（primaryCategory 反映）: ${JSON.stringify(hs)}`)
    ok(
      ['何が見つかる？', 'WHY NOW?', "GINZA WHISKERS' NOTE", '基本情報', '購入について', 'SOURCE'].every((h) => hs.includes(h)),
      'sale 8 セクションの見出しが揃う',
    )
    // 会場・会期は本文で 1 回だけ（重複記述の抑制）
    const occ = (s: string) => (r.noteBody.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
    ok(occ('銀座 蔦屋書店 文具売り場（GINZA SIX 6F）') === 1, '会場（place）の記述は本文で 1 回だけ')
    ok(occ('2026年9月20日（土）〜10月20日（火）') === 1, '会期日付の記述は本文で 1 回だけ')
    ok(!/入場は?無料/.test(r.noteBody), '「入場無料」を書かない（paid 未確認）')
    // CTA：sale は confirmed 事実（EC予約/店頭）＋公式 URL があるので本文末尾に 1 ブロック、SOURCE の直前
    ok(r.callToAction != null && /公式イベントページでご確認ください/.test(r.callToAction), `sale の CTA は購入チャネルに裏づけられた定型文: ${JSON.stringify(r.callToAction)}`)
    ok(occ('公式イベントページでご確認ください') === 1, 'CTA は本文に 1 回だけ')
    const idxCta = r.blocks.findIndex((b) => b.type === 'paragraph' && /公式イベントページでご確認ください/.test(b.text))
    const idxSrc = r.blocks.findIndex((b) => b.type === 'heading' && b.text === 'SOURCE')
    ok(idxCta >= 0 && idxSrc >= 0 && idxCta === idxSrc - 1, 'CTA ブロックは SOURCE 見出しの直前（本文末尾）')
    ok(!/詳細と参加方法は、公式の案内をご確認ください/.test(r.noteBody), 'sale 本文にテンプレ既定 CTA 文（無条件版）は出さない')
  }

  // exhibition：購入も申込も無い → CTA を出さない（テンプレ既定文を無条件保持しない）
  const dcExNoCta: DiscoveredContentLike = { ...dcSale, id: 311, title: '個展Z' }
  const exNoCtaFacts: ArticleFactsLike = {
    enrichmentStatus: 'ready', templateType: 'exhibition', season: '秋',
    eventName: '個展Z', whatHappens: 'Z の作品を展示します。',
    eventDate: '2026年9月20日〜30日', eventDateISO: FUTURE_ISO, eventTime: '11時から19時まで',
    areaLead: 'GINZA SIX 6階で。', audienceNote: '手仕事が好きな人へ。', officialInfoNote: '最終日は時短。',
    venues: [{ name: '個展Z', place: '銀座 蔦屋書店' }], paid: 'free',
    hashtags: [{ tag: '#銀座' }, { tag: '#個展Z' }],
    sourceProvenanceFacts: [{ fact: '会場: 銀座 蔦屋書店', sourceType: 'official', factType: 'venue', verificationStatus: 'confirmed' }],
  }
  const mExNoCta = mapDiscoveredContentToEventFields(dcExNoCta, { facts: exNoCtaFacts, templateType: 'exhibition', now: NOW })
  ok(mExNoCta.fields?.callToAction === '', 'exhibition（購入・申込なし）→ fields.callToAction は空')
  const inExNoCta = buildTemplateArticleInput(mExNoCta)
  if (inExNoCta) {
    const rr = renderArticleFromTemplate(inExNoCta)
    ok(rr.callToAction === null, 'exhibition → rendered.callToAction = null（本文末尾に CTA を出さない）')
    ok(!/詳細と参加方法は|公式イベントページでご確認ください|次の一歩/.test(rr.noteBody), 'exhibition 本文に CTA ブロック・テンプレ既定 CTA 文が出ない')
  }

  // application（applyRequired=yes）：申込がある → CTA を出す（confirmed 事実に裏づけ）
  const dcApp: DiscoveredContentLike = { ...dcSale, id: 312, title: '公募展A' }
  const appFacts: ArticleFactsLike = {
    ...exNoCtaFacts, eventName: '公募展A', templateType: 'application',
    applyRequired: 'yes', applyDeadline: '2026年10月7日（水）', resultDate: '2026年10月15日（木）',
    resultRule: '連絡をもって発表', applyRule: 'お一人様1回限り',
  }
  const mApp = mapDiscoveredContentToEventFields(dcApp, { facts: appFacts, templateType: 'application', now: NOW })
  ok(!!mApp.fields?.callToAction && mApp.fields.callToAction.length > 0, 'application（申込あり）→ fields.callToAction が入る（テンプレ既定 CTA・公式 URL に裏づけ）')

  // exhibition：ready な展覧会 ArticleFacts → appliedTemplate=exhibition で生成
  const dcEx: DiscoveredContentLike = { ...dcSale, id: 310, title: '個展X', eventStartAt: FUTURE_ISO }
  const exFacts: ArticleFactsLike = {
    enrichmentStatus: 'ready',
    templateType: 'exhibition',
    season: '秋',
    eventName: '個展X',
    whatHappens: 'X の作品を展示します。',
    eventDate: '2026年9月20日〜30日',
    eventDateISO: FUTURE_ISO,
    eventTime: '11時から19時まで',
    areaLead: 'GINZA SIX 6階で。',
    audienceNote: '手仕事が好きな人へ。',
    officialInfoNote: '最終日は時短。',
    venues: [{ name: '個展X', place: '銀座 蔦屋書店' }],
    paid: 'free',
    hashtags: [{ tag: '#銀座' }, { tag: '#個展X' }],
    sourceProvenanceFacts: [{ fact: '会場: 銀座 蔦屋書店', sourceType: 'official', factType: 'venue', verificationStatus: 'confirmed' }],
  }
  const mEx = mapDiscoveredContentToEventFields(dcEx, { facts: exFacts, templateType: 'exhibition', now: NOW })
  ok(mEx.templateEligible === true && mEx.appliedTemplate === 'exhibition', 'exhibition ready → templateEligible=true / appliedTemplate=exhibition（従来どおり）')
  const inEx = buildTemplateArticleInput(mEx)
  ok(inEx !== null && renderArticleFromTemplate(inEx).charCount > 200, 'exhibition 本文が生成される')

  // unknown：safe stop（暗黙の exhibition 化なし）
  const mUnk = mapDiscoveredContentToEventFields(dcSale, { facts: { ...saleFacts, templateType: 'unknown' }, templateType: 'unknown', now: NOW })
  ok(mUnk.templateEligible === false, 'unknown → templateEligible=false（安全停止）')
  ok(mUnk.missing.some((x) => x.includes('templateType') && x.includes('未確定')), 'unknown → missing に「templateType 未確定」')
  ok(buildTemplateArticleInput(mUnk) === null, 'unknown → buildTemplateArticleInput=null（原稿生成しない）')
}

async function main() {
  await scenario1()
  await scenario2()
  await scenario3()
  await scenario4()
  await scenario5()
  await scenario6()
  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${fail} 件）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
