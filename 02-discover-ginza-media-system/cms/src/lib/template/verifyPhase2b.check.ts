/*
 * GINZA WHISKERS / Project 02 改善 第2段階B — 検証スクリプト（2026-09-02）
 *
 * 実行:  cd cms && node --env-file=.env --import=tsx/esm src/lib/template/verifyPhase2b.check.ts
 *
 * ・実レコード DiscoveredContent #386 を **findByID による読み取りのみ** で取得し、
 *   mapDiscoveredContentToEventFields で変換 → templateEligible / 取得項目 / 不足項目 を表示。
 * ・マッパーの決定性、eligible パス（fixture）の本文品質、Lexical 変換の保存可能性、
 *   seed 有無、内部マーカーの二重管理解消を検証。
 * ・Anthropic API / 外部生成AI は呼ばない。DB / Payload への書き込みはしない。
 */
import { getPayload } from 'payload'

import config from '../../payload.config'
import {
  ARTICLE_BLOCK_MARKERS as MARKERS_FROM_ARTICLEBLOCKS,
  buildAngleArticleBlocks,
} from '../ai/articleBlocks'
import { blocksToLexicalState, type TextBlock } from '../ai/lexical'
import { ginchakaiFixture } from './__fixtures__/ginchakai'
import { ginchakaiNoSeedFixture } from './__fixtures__/ginchakaiNoSeed'
import { mapDiscoveredContentToEventFields, type DiscoveredContentLike } from './mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from './renderArticleFromTemplate'
import { ARTICLE_BLOCK_MARKERS as MARKERS_FROM_TEMPLATES } from './templates'

let failures = 0
function ok(cond: boolean, label: string): void {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) failures += 1
}

const FORBIDDEN = [
  '核記事', '事実ベース', 'WHY NOW', "EDITOR'S NOTE", 'SOURCE:', 'SOURCE',
  '【CORE', '【', '→ 次に：', '[IMAGE', 'IMAGE:', 'アイキャッチ',
  'なぜ、いまお伝えするのか', '席をめぐる催し', '席をめぐる',
]
const NOT_IN_INPUT = ['無料', '予約不要', '先着', '雨天', 'キャンセル待ち', '同時開催', 'コラボ', '割引', '当日券']

function assertCleanBody(body: string, unconfirmed: string[], tag: string): void {
  for (const s of FORBIDDEN) ok(!body.includes(s), `[${tag}] 禁止語を含まない: 「${s}」`)
  ok(!/\[image/i.test(body), `[${tag}] 画像マーカーを含まない`)
  for (const s of NOT_IN_INPUT) ok(!body.includes(s), `[${tag}] 入力にない事実を含まない: 「${s}」`)
  for (const s of unconfirmed) ok(!body.includes(s), `[${tag}] 未確認項目を含まない: 「${s}」`)
}

// -------------------------------------------------------------------------
// 1. 内部マーカーの二重管理が解消されている
// -------------------------------------------------------------------------
console.log('■ 1. 内部マーカーの単一定義元')
ok(
  MARKERS_FROM_TEMPLATES === MARKERS_FROM_ARTICLEBLOCKS,
  'templates.ts の ARTICLE_BLOCK_MARKERS は articleBlocks.ts の再エクスポート（同一オブジェクト）',
)
{
  const smoke = buildAngleArticleBlocks(
    'core',
    { hook: 'H', angleSummary: 'A', content: 'C', whyNow: 'W', editorsNote: 'E', closing: 'CL', callToAction: 'T', audience: '' },
    { sourceName: 'N', sourceUrl: 'https://u.test/x', verifiedAt: '2026-09-01T00:00:00Z' },
    [],
    1,
    [],
  ).blocks.map((b) => b.text)
  ok(smoke.some((t) => t.startsWith(MARKERS_FROM_ARTICLEBLOCKS.whyNowPrefix)), 'buildAngleArticleBlocks が whyNowPrefix をそのまま使う')
  ok(smoke.some((t) => t.startsWith(MARKERS_FROM_ARTICLEBLOCKS.editorsNotePrefix)), 'buildAngleArticleBlocks が editorsNotePrefix をそのまま使う')
  ok(smoke.some((t) => t.startsWith(MARKERS_FROM_ARTICLEBLOCKS.sourceQuotePrefix)), 'buildAngleArticleBlocks が sourceQuotePrefix をそのまま使う')
  ok(smoke.some((t) => t.startsWith(MARKERS_FROM_ARTICLEBLOCKS.nextActionPrefix)), 'buildAngleArticleBlocks が nextActionPrefix をそのまま使う')
}

// -------------------------------------------------------------------------
// 2. eligible パス（fixture）: 本文品質・決定性
// -------------------------------------------------------------------------
console.log('\n■ 2. eligible パス（fixture）本文品質・決定性')
const { unconfirmedNotes: unSeed, ...seedInput } = ginchakaiFixture
const { unconfirmedNotes: unNoSeed, ...noSeedInput } = ginchakaiNoSeedFixture
const seedA = renderArticleFromTemplate(seedInput)
const seedB = renderArticleFromTemplate(seedInput)
const noSeedA = renderArticleFromTemplate(noSeedInput)
const noSeedB = renderArticleFromTemplate(noSeedInput)
ok(JSON.stringify(seedA) === JSON.stringify(seedB), 'seed あり: 2回の出力が完全一致（決定的）')
ok(JSON.stringify(noSeedA) === JSON.stringify(noSeedB), 'seed なし: 2回の出力が完全一致（決定的）')
assertCleanBody(seedA.noteBody, unSeed, 'seedあり')
assertCleanBody(noSeedA.noteBody, unNoSeed, 'seedなし')
// 必須の日付・URL 保持（seed あり側で代表確認）
for (const s of [
  seedInput.fields.eventDate,
  seedInput.fields.applyDeadline,
  seedInput.fields.resultDate,
  seedInput.sourceUrl,
]) ok(seedA.noteBody.includes(s), `[seedあり] 必須要素を保持: 「${s}」`)

// -------------------------------------------------------------------------
// 3. seed あり／なしの反映
// -------------------------------------------------------------------------
console.log('\n■ 3. editorsNoteSeed の有無')
const seedText = ginchakaiFixture.fields.editorsNoteSeed as string
const FALLBACK = '公式の案内をもとに、日程と申し込みの要点を整理しました。はじめての方も、迷わず進められるはずです。'
ok(seedA.noteBody.includes(seedText), 'seed あり: seed 本文がそのまま含まれる')
ok(!seedA.noteBody.includes(FALLBACK), 'seed あり: 定型文フォールバックは使われない')
ok(noSeedA.noteBody.includes(FALLBACK), 'seed なし: 控えめな定型文フォールバックが使われる')
ok(!noSeedA.noteBody.includes(seedText), 'seed なし: seed 本文は含まれない（当然）')
// seed 以外のブロックは一致（差は「GINZA WHISKERS の視点」直後の1段落のみ）
{
  const gwIdx = seedA.blocks.findIndex((b) => b.type === 'heading' && b.text === 'GINZA WHISKERS の視点')
  const stripEditor = (blocks: TextBlock[]) =>
    JSON.stringify(blocks.filter((_, i) => i !== gwIdx + 1))
  ok(stripEditor(seedA.blocks) === stripEditor(noSeedA.blocks), 'seed 段落以外の本文ブロックは seed 有無で同一')
}

// -------------------------------------------------------------------------
// 4. Lexical 変換（既存 AI 記事と同じ保存可能な形）
// -------------------------------------------------------------------------
console.log('\n■ 4. Lexical 変換の保存可能性')
function checkLexical(blocks: TextBlock[], tag: string): void {
  const lex = blocksToLexicalState(blocks) as {
    root: { type: string; version: number; direction: string; children: any[] }
  }
  ok(lex.root.type === 'root' && lex.root.version === 1 && lex.root.direction === 'ltr', `[${tag}] root ノードが正しい`)
  ok(Array.isArray(lex.root.children) && lex.root.children.length === blocks.length, `[${tag}] children 数がブロック数と一致`)
  let structural = true
  lex.root.children.forEach((child: any, i: number) => {
    const b = blocks[i]
    const wantType = b.type === 'heading' ? 'heading' : b.type
    if (child.type !== wantType) structural = false
    if (b.type === 'heading' && child.tag !== `h${b.level ?? 2}`) structural = false
    if (child.version !== 1 || child.direction !== 'ltr') structural = false
    const textNode = child.children?.[0]
    if (!textNode || textNode.type !== 'text' || textNode.text !== b.text || textNode.version !== 1) structural = false
  })
  ok(structural, `[${tag}] 各ノードが heading/paragraph/quote + text ノード（version=1, ltr）で構成される`)
  // AI 経路（generateMultiAngleArticleDrafts.ts）と同一関数・同一 TextBlock 契約であることの確認
  ok(
    JSON.stringify(lex) === JSON.stringify(blocksToLexicalState(blocks)),
    `[${tag}] blocksToLexicalState は決定的（AI 経路と同じ関数）`,
  )
}
checkLexical(seedA.blocks, 'seedあり')
checkLexical(noSeedA.blocks, 'seedなし')
// 参照値との一致（小さなサンプルで shape を固定）
{
  const sample: TextBlock[] = [
    { type: 'paragraph', text: 'p' },
    { type: 'heading', level: 2, text: 'h' },
    { type: 'quote', text: 'q' },
  ]
  const expected = {
    root: {
      type: 'root', format: '', indent: 0, version: 1, direction: 'ltr',
      children: [
        { type: 'paragraph', format: '', indent: 0, version: 1, direction: 'ltr', children: [{ type: 'text', text: 'p', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }] },
        { type: 'heading', tag: 'h2', format: '', indent: 0, version: 1, direction: 'ltr', children: [{ type: 'text', text: 'h', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }] },
        { type: 'quote', format: '', indent: 0, version: 1, direction: 'ltr', children: [{ type: 'text', text: 'q', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }] },
      ],
    },
  }
  ok(JSON.stringify(blocksToLexicalState(sample)) === JSON.stringify(expected), '[参照] Lexical の形が既知の保存可能形と一致')
}

// -------------------------------------------------------------------------
// 5. マッパーの決定性（DB 非依存の固定入力）
// -------------------------------------------------------------------------
console.log('\n■ 5. mapDiscoveredContentToEventFields の決定性')
const FIXED_NOW = new Date('2026-09-15T00:00:00.000Z')
const dcSample: DiscoveredContentLike = {
  id: 999001,
  title: 'テスト展覧会のお知らせ',
  excerpt: 'これは検証用のダミー excerpt です。日付や会場はここから推測しません。',
  articleUrl: 'https://example.test/exhibitions/dummy-001',
  sourceSiteName: 'TEST SITE',
  eventStartAt: '2026-11-01T00:00:00.000Z',
  eventEndAt: '2026-11-30T00:00:00.000Z',
  venue: 'テストギャラリー',
  contentType: 'exhibition',
  uxType: 'view_exhibition',
  lastCheckedAt: '2026-09-10T00:00:00.000Z',
  detectedAt: '2026-09-10T00:00:00.000Z',
  dateExtraction: { eventStartAt: { value: '2026-11-01', confidence: 'high' }, eventEndAt: { value: '2026-11-30', confidence: 'high' } },
}
const m1 = mapDiscoveredContentToEventFields(dcSample, { now: FIXED_NOW })
const m2 = mapDiscoveredContentToEventFields(dcSample, { now: FIXED_NOW })
ok(JSON.stringify(m1) === JSON.stringify(m2), '同じ入力（+ 同じ now）で結果が完全一致')
ok(m1.templateEligible === false, 'サンプル DC は templateEligible=false（構造化フィールド不足）')
ok(m1.route === 'human_review', 'eligible=false のとき route は human_review（AI へ自動送信しない）')
ok(m1.captured.some((c) => c.field.startsWith('eventDate')), 'sample: 信頼度ありの eventStartAt は eventDate として取得できる')
ok(m1.missing.some((s) => s.startsWith('applyDeadline')), 'sample: applyDeadline は不足として報告される')
// 過去日は対象外
const mPast = mapDiscoveredContentToEventFields(
  { ...dcSample, eventStartAt: '2026-01-01T00:00:00.000Z', eventEndAt: '2026-01-10T00:00:00.000Z' },
  { now: FIXED_NOW },
)
ok(mPast.missing.some((s) => s.includes('過去')), '過去の開催日は missing（自動生成対象外）')
// 抽出信頼度なしは対象外
const mVague = mapDiscoveredContentToEventFields(
  { ...dcSample, dateExtraction: { eventStartAt: { value: '2026-11-01', confidence: null } } },
  { now: FIXED_NOW },
)
ok(mVague.ambiguous.some((s) => s.includes('曖昧')), '抽出信頼度が無い日付は ambiguous（自動生成対象外）')

// -------------------------------------------------------------------------
// 6. 実レコード #386 を読み取り専用で変換
// -------------------------------------------------------------------------
console.log('\n■ 6. 実レコード DiscoveredContent #386（読み取り専用）')
const payload = await getPayload({ config })
const dc386 = (await payload.findByID({
  collection: 'discovered-content',
  id: 386,
  depth: 1,
  overrideAccess: true,
})) as Record<string, any>

const ss = dc386.sourceSite
const like: DiscoveredContentLike = {
  id: dc386.id,
  title: dc386.title ?? null,
  excerpt: dc386.excerpt ?? null,
  articleUrl: dc386.articleUrl ?? null,
  sourceSiteName: (typeof ss === 'object' && ss !== null ? ss.name : ss) ?? null,
  publishedAt: dc386.publishedAt ?? null,
  contentUpdatedAt: dc386.contentUpdatedAt ?? null,
  eventStartAt: dc386.eventStartAt ?? null,
  eventEndAt: dc386.eventEndAt ?? null,
  venue: dc386.venue ?? null,
  contentType: dc386.contentType ?? null,
  uxType: dc386.uxType ?? null,
  lastCheckedAt: dc386.lastCheckedAt ?? null,
  detectedAt: dc386.detectedAt ?? null,
  dateExtraction: dc386.dateExtraction ?? null,
}
const r386a = mapDiscoveredContentToEventFields(like)
const r386b = mapDiscoveredContentToEventFields(like)
ok(JSON.stringify(r386a) === JSON.stringify(r386b), '#386: 同じ入力で結果が完全一致（決定的）')
ok(r386a.route === (r386a.templateEligible ? 'template' : 'human_review'), '#386: route と templateEligible が整合')
ok(r386a.templateEligible === false, '#386: templateEligible=false（構造化された申込期限・会場一覧・回次・テーマ 等が無い）')
ok(r386a.route === 'human_review', '#386: 人間確認へ差し戻し（AI へ自動送信しない）')

console.log('\n──────── #386 変換結果 ────────')
console.log(`templateEligible : ${r386a.templateEligible}`)
console.log(`route            : ${r386a.route}`)
console.log('取得できた項目 (captured):')
for (const c of r386a.captured) console.log(`  - ${c.field} = ${c.value}`)
console.log('不足項目 (missing):')
for (const s of r386a.missing) console.log(`  - ${s}`)
console.log('曖昧な項目 (ambiguous):')
for (const s of r386a.ambiguous) console.log(`  - ${s}`)

// -------------------------------------------------------------------------
// 出力（eligible パス fixture の本文）
// -------------------------------------------------------------------------
console.log('\n──────── seed あり: タイトル候補3案 ────────')
seedA.titleCandidates.forEach((t, i) => console.log(`  ${i + 1}. ${t}  （${[...t].length}文字）`))
console.log(`\n文字数(seed あり): ${seedA.charCount}  / 文字数(seed なし): ${noSeedA.charCount}`)
console.log('\n──────── seed あり: noteBody 全文 ────────')
console.log(seedA.noteBody)
console.log('──────── ここまで ────────')
console.log('\n──────── seed なし: 「GINZA WHISKERS の視点」段落のみ ────────')
{
  const gwIdx = noSeedA.blocks.findIndex((b) => b.type === 'heading' && b.text === 'GINZA WHISKERS の視点')
  console.log(noSeedA.blocks[gwIdx + 1]?.text)
}

console.log(`\n=== 結果: ${failures === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${failures} 件の不合格）`} ===`)
process.exit(failures === 0 ? 0 : 1)
