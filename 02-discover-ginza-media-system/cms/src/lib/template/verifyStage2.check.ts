/*
 * GINZA WHISKERS / Project 02 改善 第2段階C Stage 2 — 検証スクリプト（2026-09-02）
 *
 * 実行:  cd cms && node --import=tsx/esm src/lib/template/verifyStage2.check.ts
 *
 * mapDiscoveredContentToEventFields(dc, { facts }) の判定を検証する。
 * DB / Payload / Claude API に一切触れない（すべて固定オブジェクト）。
 * #386 相当の値は「第2段階B で読み取り専用に取得した実データ」を固定で埋め込む
 * （このスクリプトからは DB を読まない・#386 を変更しない）。
 */
import { blocksToLexicalState } from '../ai/lexical'
import {
  buildTemplateArticleInput,
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from './mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from './renderArticleFromTemplate'

let failures = 0
function ok(cond: boolean, label: string): void {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) failures += 1
}

const FIXED_NOW = new Date('2026-09-15T00:00:00.000Z')

// --- #386 相当（第2段階B の読み取り結果を固定化。DB は読まない） ---
const dc386: DiscoveredContentLike = {
  id: 386,
  title:
    '銀茶会イベント申し込み | 公式イベント情報 | 銀座のイベント情報 | お知らせ・新着情報 | GINZA OFFICIAL – 銀座公式ウェブサイト',
  excerpt: '（サイトナビ + 本文の混在した長い excerpt。mapper は本文から事実を推測しない）',
  articleUrl: 'https://www.ginza.jp/event/35565',
  sourceSiteName: 'GINZA OFFICIAL',
  eventStartAt: null,
  eventEndAt: null,
  venue: null,
  contentType: 'event',
  uxType: 'participate_workshop',
  lastCheckedAt: '2026-09-01T21:33:15.201Z',
  detectedAt: '2026-09-01T21:33:15.201Z',
  dateExtraction: null,
}

// --- ready・完全な ArticleFacts（銀茶会の事実を人間が入力した想定） ---
const readyComplete: ArticleFactsLike = {
  enrichmentStatus: 'ready',
  season: '秋',
  eventName: '銀茶会',
  editionLabel: '第24回',
  theme: '和（わ）',
  whatHappens: 'オリジナルのお菓子と一服のお茶を楽しむ催しです。',
  eventDate: '2026年10月25日（日）',
  eventDateISO: '2026-10-25T00:00:00.000Z',
  eventTime: '13時から16時まで',
  venues: [
    { name: '濃茶体験会', place: '植松ビル地下1階の茶室「銀座慶庵」' },
    { name: '聞香体験会', place: '日本香堂ビル3階の香間「暁」' },
    { name: '銀座の金沢茶会', place: '銀座МＳビル1階の「KOGEI Art Gallery 銀座の金沢」' },
  ],
  areaLead: '全銀座エリアに対応した3つの企画',
  audienceNote:
    '銀座で茶の湯や香に触れる時間を探している方、この恒例行事に関心のある方に向いています。',
  paid: 'paid',
  applyRequired: 'yes',
  applyDeadline: '2026年10月7日（水）',
  resultDate: '2026年10月15日（木）',
  resultRule: '当選された方へのご連絡をもって発表に代えられます',
  applyRule:
    'お申し込みは2名様分まで、お一人様1回限り。同じ方から複数のお申し込みがあった場合は、いちばん最後のお申し込みを正として抽選されます',
  officialInfoNote:
    '当日のより詳しい内容は、2026年10月1日に公開が予定されている公式ウェブサイトで案内されます。全体の概要はPDFでも確認できます。',
  editorsNoteSeed:
    '銀座の秋は、街を歩くだけでなく、受け継がれてきた文化に触れることで、少し違って見えてきます。お茶を入口に、いつもよりゆっくり銀座と向き合う一日になりそうです。',
  hashtags: [{ tag: '#銀茶会' }, { tag: '#銀座' }, { tag: '#お茶会' }],
  sourceProvenanceFacts: [
    { fact: '開催日は2026年10月25日（日）13時から16時まで', sourceType: 'official', factType: 'date', verificationStatus: 'confirmed' },
    { fact: '当日券の配布があるか', sourceType: 'secondary', factType: 'reservation', verificationStatus: 'unconfirmed' },
  ],
}

const FORBIDDEN = [
  '核記事', '事実ベース', 'WHY NOW', "EDITOR'S NOTE", 'SOURCE:', 'SOURCE',
  '【CORE', '【', '→ 次に：', '[IMAGE', 'IMAGE:', 'アイキャッチ',
  'なぜ、いまお伝えするのか', '席をめぐる催し', '当日券',
]

// -------------------------------------------------------------------------
console.log('■ 1. 安全経路の維持（ready でなければ templateEligible:false / human_review）')
{
  const noFacts = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW })
  ok(noFacts.templateEligible === false && noFacts.route === 'human_review', 'facts なし → false / human_review')
  ok(noFacts.factsSource === 'none', 'facts なし → factsSource=none')
  ok(noFacts.fields === undefined, 'facts なし → fields は付かない')

  const draft = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW, facts: { ...readyComplete, enrichmentStatus: 'draft' } })
  ok(draft.templateEligible === false && draft.route === 'human_review', 'draft の ArticleFacts → false / human_review')
  ok(draft.factsSource === 'draft', 'draft → factsSource=draft')
  ok(draft.ambiguous.some((s) => s.includes('enrichmentStatus=draft')), 'draft → ambiguous に「ready ではない」旨')

  const withdrawn = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW, facts: { ...readyComplete, enrichmentStatus: 'withdrawn' } })
  ok(withdrawn.templateEligible === false && withdrawn.factsSource === 'withdrawn', 'withdrawn → false / factsSource=withdrawn')

  // ready だが不足あり（officialInfoNote 空 + venues 空）
  const incomplete = mapDiscoveredContentToEventFields(dc386, {
    now: FIXED_NOW,
    facts: { ...readyComplete, officialInfoNote: '', venues: [] },
  })
  ok(incomplete.templateEligible === false && incomplete.route === 'human_review', 'ready+不足 → false / human_review')
  ok(incomplete.factsSource === 'ready', 'ready+不足 → factsSource=ready')
  ok(incomplete.missing.some((s) => s.startsWith('officialInfoNote')), 'ready+不足 → missing に officialInfoNote')
  ok(incomplete.missing.some((s) => s.startsWith('venues')), 'ready+不足 → missing に venues')
  ok(incomplete.fields === undefined, 'ready+不足 → fields は付かない')
}

// -------------------------------------------------------------------------
console.log('\n■ 2. ready かつ必須充足 → templateEligible:true')
const eligible = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW, facts: readyComplete })
ok(eligible.templateEligible === true, 'templateEligible === true')
ok(eligible.route === 'template', "route === 'template'")
ok(eligible.factsSource === 'ready', 'factsSource === ready')
ok(eligible.missing.length === 0, 'missing は空')
ok(!!eligible.fields, 'fields が付く')
ok(!!eligible.sourceMeta && eligible.sourceMeta.sourceName === 'GINZA OFFICIAL', 'sourceMeta.sourceName は DC 由来（GINZA OFFICIAL）')
ok(eligible.sourceMeta?.sourceUrl === 'https://www.ginza.jp/event/35565', 'sourceMeta.sourceUrl は DC.articleUrl 由来')
ok(eligible.sourceMeta?.verifiedAt === '2026-09-01T21:33:15.201Z', 'sourceMeta.verifiedAt は DC.lastCheckedAt 由来')
ok(JSON.stringify(eligible.hashtags) === JSON.stringify(['#銀茶会', '#銀座', '#お茶会']), 'hashtags は ArticleFacts 由来')
ok(eligible.fields?.paid === 'paid', "paid=paid → fields.paid === 'paid'")
ok(eligible.fields?.venues.length === 3, 'venues 3件が渡る')
ok((eligible.provenance ?? []).length === 2, 'provenance は 2件（confirmed + unconfirmed をそのまま保持）')

// -------------------------------------------------------------------------
console.log('\n■ 3. 過去日・機械日付なし は eligible にしない')
{
  const past = mapDiscoveredContentToEventFields(dc386, {
    now: FIXED_NOW,
    facts: { ...readyComplete, eventDateISO: '2020-01-01T00:00:00.000Z' },
  })
  ok(past.templateEligible === false, '過去の eventDateISO → false')
  ok(past.missing.some((s) => s.includes('過去')), '過去 → missing に「過去」')

  const noIso = mapDiscoveredContentToEventFields(dc386, {
    now: FIXED_NOW,
    // eventDateISO を空に。dc386.eventStartAt も null なので機械日付が全く無い
    facts: { ...readyComplete, eventDateISO: '' },
  })
  ok(noIso.templateEligible === false, '機械日付なし（eventDateISO 空 + eventStartAt null） → false')
  ok(noIso.missing.some((s) => s.startsWith('eventDateISO')), '機械日付なし → missing に eventDateISO')
}

// -------------------------------------------------------------------------
console.log('\n■ 4. 決定性')
{
  const a = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW, facts: readyComplete })
  const b = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW, facts: readyComplete })
  ok(JSON.stringify(a) === JSON.stringify(b), 'ready+eligible: 2回の結果が完全一致')
  const c = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW })
  const d = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW })
  ok(JSON.stringify(c) === JSON.stringify(d), 'facts なし: 2回の結果が完全一致')
}

// -------------------------------------------------------------------------
console.log('\n■ 5. buildTemplateArticleInput → renderArticleFromTemplate（DB・AI なし）')
ok(buildTemplateArticleInput(mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW })) === null, 'not eligible → buildTemplateArticleInput は null')
const input = buildTemplateArticleInput(eligible)
ok(input !== null, 'eligible → TemplateArticleInput が得られる')
const rendered = renderArticleFromTemplate(input!)
const body = rendered.noteBody
for (const s of FORBIDDEN) ok(!body.includes(s), `本文に含まない: 「${s}」`)
ok(!/\[image/i.test(body), '本文に画像マーカーを含まない')
for (const s of ['2026年10月25日（日）', '2026年10月7日（水）', '2026年10月15日（木）', 'https://www.ginza.jp/event/35565', '第24回', '和（わ）']) {
  ok(body.includes(s), `本文に含む（入力どおり）: 「${s}」`)
}
ok(body.includes(readyComplete.editorsNoteSeed as string), '編集後記（seed）がそのまま本文に含まれる')
const r2 = renderArticleFromTemplate(input!)
ok(JSON.stringify(rendered) === JSON.stringify(r2), 'render 出力も決定的（2回一致）')
ok(rendered.charCount >= 700 && rendered.charCount <= 1000, `文字数 ${rendered.charCount} が 700〜1,000`)

// Lexical 変換（既存 AI 記事と同じ保存可能形）
{
  const lex = blocksToLexicalState(rendered.blocks)
  ok(
    lex.root.type === 'root' && lex.root.version === 1 && lex.root.direction === 'ltr',
    'Lexical root が正しい',
  )
  ok(lex.root.children.length === rendered.blocks.length, 'Lexical children 数がブロック数と一致')
  ok(
    JSON.stringify(lex) === JSON.stringify(blocksToLexicalState(rendered.blocks)),
    'blocksToLexicalState は決定的',
  )
}

// -------------------------------------------------------------------------
console.log('\n──────── ready+eligible: タイトル候補3案 ────────')
rendered.titleCandidates.forEach((t, i) => console.log(`  ${i + 1}. ${t}  （${[...t].length}文字）`))
console.log(`\n文字数: ${rendered.charCount}`)
console.log('\n──────── ready+eligible: noteBody 全文 ────────')
console.log(body)
console.log('──────── ここまで ────────')
console.log('\n──────── #386（facts なし）判定 ────────')
{
  const r = mapDiscoveredContentToEventFields(dc386, { now: FIXED_NOW })
  console.log(`templateEligible: ${r.templateEligible} / route: ${r.route} / factsSource: ${r.factsSource} / missing ${r.missing.length}件`)
}

console.log(`\n=== 結果: ${failures === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${failures} 件の不合格）`} ===`)
process.exit(failures === 0 ? 0 : 1)
