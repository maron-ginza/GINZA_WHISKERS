/*
 * GINZA WHISKERS / Project 02 改善 Stage 4 — 検証スクリプト（2026-09-02）
 *
 * 実行:  cd cms && node --import=tsx/esm src/lib/template/verifyStage4.check.ts
 *
 * createDraftFromArticleFacts の保存経路を **モック payload** で検証する。
 * 実 DB・実 Payload・Claude API には一切触れない。実データも変更しない。
 *   ・dry-run のとき payload.create を呼ばないこと
 *   ・templateEligible:false / factsSource!=='ready' / 未承認 / 重複 のとき作成しないこと
 *   ・ready+eligible+承認済み+非重複+ --yes 相当（dryRun:false）のときだけ create を1回、
 *     data.reviewStatus === 'draft' で呼ぶこと
 *   ・二重生成防止（editorialProvenance 逆引き）
 *   ・決定性
 */
import type { Payload } from 'payload'

import {
  createDraftFromArticleFacts,
  type CreateDraftFromArticleFactsResult,
} from './createDraftFromArticleFacts'

let failures = 0
function ok(cond: boolean, label: string): void {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`)
  if (!cond) failures += 1
}

const FIXED_NOW = new Date('2026-09-15T00:00:00.000Z')

const dc386Approved: Record<string, unknown> = {
  id: 386,
  title: '銀茶会イベント申し込み | 公式イベント情報 | GINZA OFFICIAL – 銀座公式ウェブサイト',
  articleUrl: 'https://www.ginza.jp/event/35565',
  sourceSite: { id: 1, name: 'GINZA OFFICIAL' },
  contentType: 'event',
  uxType: 'participate_workshop',
  eventStartAt: null,
  eventEndAt: null,
  venue: null,
  lastCheckedAt: '2026-09-01T21:33:15.201Z',
  detectedAt: '2026-09-01T21:33:15.201Z',
  dateExtraction: null,
  curationStatus: 'approved',
}

const readyFacts: Record<string, unknown> = {
  id: 7001,
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
  ],
  areaLead: '全銀座エリアに対応した3つの企画',
  audienceNote: 'この恒例行事に関心のある方に向いています。',
  paid: 'paid',
  applyRequired: 'yes',
  applyDeadline: '2026年10月7日（水）',
  resultDate: '2026年10月15日（木）',
  resultRule: '当選された方へのご連絡をもって発表に代えられます',
  applyRule: 'お申し込みは2名様分まで、お一人様1回限り',
  officialInfoNote: '当日のより詳しい内容は公式ウェブサイトで案内されます。',
  editorsNoteSeed: '銀座の秋は、受け継がれてきた文化に触れることで少し違って見えてきます。',
  hashtags: [{ tag: '#銀茶会' }, { tag: '#銀座' }, { tag: '#お茶会' }],
  sourceProvenanceFacts: [
    { fact: '開催日は2026年10月25日（日）', sourceType: 'official', factType: 'date', verificationStatus: 'confirmed' },
  ],
}

interface MockOpts {
  dc: Record<string, unknown> | null
  facts?: Record<string, unknown>
  dupCount?: number // editorialProvenance 逆引きでヒットする既存 articles 件数
  /** 逆引きでヒットする既存 Article の詳細（regenerate 判定用）。指定時は dupCount より優先 */
  existingArticle?: { id: number; reviewStatus?: string; aiGeneratedBy?: string }
  pillarTagId?: number
}

function makeMockPayload(o: MockOpts): {
  payload: Payload
  createCalls: { collection: string; data: Record<string, unknown> }[]
  updateCalls: { collection: string; id: number | string; data: Record<string, unknown> }[]
} {
  const createCalls: { collection: string; data: Record<string, unknown> }[] = []
  const updateCalls: { collection: string; id: number | string; data: Record<string, unknown> }[] = []
  const mock = {
    findByID: async ({ collection }: { collection: string }) =>
      collection === 'discovered-content' ? o.dc : null,
    find: async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection === 'article-facts') return { docs: o.facts ? [o.facts] : [] }
      if (collection === 'tags') {
        return { docs: o.pillarTagId ? [{ id: o.pillarTagId, name: 'イベント', type: 'pillar' }] : [] }
      }
      if (collection === 'articles') {
        const w = JSON.stringify(where ?? {})
        if (w.includes('editorialProvenance')) {
          if (o.existingArticle) return { docs: [o.existingArticle] }
          return { docs: Array.from({ length: o.dupCount ?? 0 }, (_, i) => ({ id: 900 + i })) }
        }
        return { docs: [] } // findRelatedArticles: なし
      }
      return { docs: [] }
    },
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      createCalls.push({ collection, data })
      return { id: 99999, ...data }
    },
    update: async ({ collection, id, data }: { collection: string; id: number | string; data: Record<string, unknown> }) => {
      updateCalls.push({ collection, id, data })
      return { id, ...data }
    },
  }
  return { payload: mock as unknown as Payload, createCalls, updateCalls }
}

async function run(o: MockOpts, opts: Parameters<typeof createDraftFromArticleFacts>[2]) {
  const { payload, createCalls, updateCalls } = makeMockPayload(o)
  const result = await createDraftFromArticleFacts(payload, (o.dc?.id as number) ?? 386, opts)
  return { result, createCalls, updateCalls }
}

// -------------------------------------------------------------------------
console.log('■ 1. dry-run（既定）では payload.create を呼ばない')
{
  const { result, createCalls } = await run(
    { dc: dc386Approved, facts: readyFacts, pillarTagId: 6 },
    { now: FIXED_NOW }, // dryRun 未指定 → 既定 true
  )
  ok(result.dryRun === true, '既定 dryRun=true')
  ok(result.status === 'would_create', 'status=would_create')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
  ok(result.plan?.reviewStatus === 'draft', 'plan.reviewStatus === draft')
  ok((result.plan?.aiGeneratedBy ?? '').startsWith('template:'), 'aiGeneratedBy が template: 接頭辞')
}

// -------------------------------------------------------------------------
console.log('\n■ 2. --yes 相当（dryRun:false）＋ ready+eligible+承認済み+非重複 → create 1回・reviewStatus:draft')
{
  const { result, createCalls } = await run(
    { dc: dc386Approved, facts: readyFacts, pillarTagId: 6 },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(result.status === 'created', 'status=created')
  ok(result.dryRun === false, 'dryRun=false')
  ok(createCalls.length === 1, 'create 呼び出し 1 回')
  ok(createCalls[0]?.collection === 'articles', 'create collection=articles')
  ok(createCalls[0]?.data.reviewStatus === 'draft', 'create data.reviewStatus === "draft"')
  ok(
    typeof createCalls[0]?.data.aiGeneratedBy === 'string' &&
      /^template:(exhibition|recurring_event|sale|generic):af#/.test(createCalls[0].data.aiGeneratedBy as string),
    'create data.aiGeneratedBy が template:<種別>:af#…',
  )
  const prov = createCalls[0]?.data.editorialProvenance as { discoveredContentSource?: number }[]
  ok(Array.isArray(prov) && prov.length >= 1 && prov[0].discoveredContentSource === 386, 'editorialProvenance に discoveredContentSource=386')
  ok(!('published' === createCalls[0]?.data.reviewStatus), 'reviewStatus は published ではない')
}

// -------------------------------------------------------------------------
console.log('\n■ 3. ready でない ArticleFacts（draft）→ 作成しない / human_review')
{
  const { result, createCalls } = await run(
    { dc: dc386Approved, facts: { ...readyFacts, enrichmentStatus: 'draft' }, pillarTagId: 6 },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(result.status === 'skipped' && result.reason === 'human_review', 'skipped / human_review')
  ok(result.factsSource === 'draft', 'factsSource=draft')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
}

// -------------------------------------------------------------------------
console.log('\n■ 4. ready だが不足あり → 作成しない / human_review + missing')
{
  const { result, createCalls } = await run(
    { dc: dc386Approved, facts: { ...readyFacts, officialInfoNote: '', venues: [] }, pillarTagId: 6 },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(result.status === 'skipped' && result.reason === 'human_review', 'skipped / human_review')
  ok(result.factsSource === 'ready', 'factsSource=ready')
  ok((result.missing ?? []).some((m) => m.startsWith('officialInfoNote')), 'missing に officialInfoNote')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
}

// -------------------------------------------------------------------------
console.log('\n■ 5. ArticleFacts 不在 → 作成しない / human_review / factsSource=none')
{
  const { result, createCalls } = await run({ dc: dc386Approved, pillarTagId: 6 }, { now: FIXED_NOW, dryRun: false })
  ok(result.status === 'skipped' && result.reason === 'human_review', 'skipped / human_review')
  ok(result.factsSource === 'none', 'factsSource=none')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
}

// -------------------------------------------------------------------------
console.log('\n■ 6. 二重生成防止：editorialProvenance 逆引きヒット → already_drafted、作成しない')
{
  const { result, createCalls } = await run(
    { dc: dc386Approved, facts: readyFacts, pillarTagId: 6, dupCount: 1 },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(result.status === 'skipped' && result.reason === 'already_drafted', 'skipped / already_drafted')
  ok(result.existingArticleId === 900, 'existingArticleId を返す')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')

  // --force なら作成する
  const forced = await run(
    { dc: dc386Approved, facts: readyFacts, pillarTagId: 6, dupCount: 1 },
    { now: FIXED_NOW, dryRun: false, force: true },
  )
  ok(forced.result.status === 'created' && forced.createCalls.length === 1, '--force で重複を無視して作成（create 1回）')
}

// -------------------------------------------------------------------------
console.log('\n■ 7. 未承認 DC（curationStatus!=approved）→ not_approved、作成しない')
{
  const { result, createCalls } = await run(
    { dc: { ...dc386Approved, curationStatus: 'inbox' }, facts: readyFacts, pillarTagId: 6 },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(result.status === 'skipped' && result.reason === 'not_approved', 'skipped / not_approved')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
}

// -------------------------------------------------------------------------
console.log('\n■ 8. DC 不在 → dc_not_found、作成しない')
{
  const { result, createCalls } = await run({ dc: null, facts: readyFacts, pillarTagId: 6 }, { now: FIXED_NOW, dryRun: false })
  ok(result.status === 'skipped' && result.reason === 'dc_not_found', 'skipped / dc_not_found')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
}

// -------------------------------------------------------------------------
console.log('\n■ 9. 過去日は eligible にならない → 作成しない')
{
  const { result, createCalls } = await run(
    { dc: dc386Approved, facts: { ...readyFacts, eventDateISO: '2020-01-01T00:00:00.000Z' }, pillarTagId: 6 },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(result.status === 'skipped' && result.reason === 'human_review', 'skipped / human_review')
  ok((result.missing ?? []).some((m) => m.includes('過去')), 'missing に「過去」')
  ok(createCalls.length === 0, 'create 呼び出し 0 回')
}

// -------------------------------------------------------------------------
console.log('\n■ 11. --regenerate：既存の機械生成 draft を同じ Article へ上書き更新（重複を作らない）')
{
  // 11a. 機械生成 draft → payload.update を1回・create は呼ばない・status=updated・同じ id
  const { result, createCalls, updateCalls } = await run(
    {
      dc: dc386Approved,
      facts: readyFacts,
      pillarTagId: 6,
      existingArticle: { id: 55, reviewStatus: 'draft', aiGeneratedBy: 'template:generic:af#4' },
    },
    { now: FIXED_NOW, dryRun: false, regenerate: true },
  )
  ok(result.status === 'updated', '11a. status=updated')
  ok(createCalls.length === 0, '11a. create 呼び出し 0 回（新規作成しない）')
  ok(updateCalls.length === 1 && updateCalls[0].collection === 'articles', '11a. update 呼び出し 1 回（articles）')
  ok(updateCalls[0]?.id === 55, '11a. 更新先は既存 Article #55（同じ id）')
  ok(updateCalls[0]?.data.reviewStatus === 'draft', '11a. reviewStatus は draft のまま')
  ok(result.articleId === 55 && result.existingArticleId === 55, '11a. articleId/existingArticleId = 55')

  // 11b. dry-run は update を呼ばず would_create（existingArticleId 付き）
  const dry = await run(
    {
      dc: dc386Approved,
      facts: readyFacts,
      pillarTagId: 6,
      existingArticle: { id: 55, reviewStatus: 'draft', aiGeneratedBy: 'template:generic:af#4' },
    },
    { now: FIXED_NOW, regenerate: true },
  )
  ok(dry.result.status === 'would_create' && dry.result.existingArticleId === 55, '11b. dry-run は would_create（existingArticleId=55）')
  ok(dry.updateCalls.length === 0 && dry.createCalls.length === 0, '11b. dry-run は update/create を呼ばない')

  // 11c. published / 人間編集済みは regenerate 対象外（上書きしない・安全停止）
  const pub = await run(
    {
      dc: dc386Approved,
      facts: readyFacts,
      pillarTagId: 6,
      existingArticle: { id: 40, reviewStatus: 'published', aiGeneratedBy: 'template:generic:af#4' },
    },
    { now: FIXED_NOW, dryRun: false, regenerate: true },
  )
  ok(
    pub.result.status === 'skipped' && pub.result.reason === 'existing_not_regenerable',
    '11c. published は skipped / existing_not_regenerable',
  )
  ok(pub.updateCalls.length === 0 && pub.createCalls.length === 0, '11c. published は update/create を呼ばない')

  const human = await run(
    {
      dc: dc386Approved,
      facts: readyFacts,
      pillarTagId: 6,
      existingArticle: { id: 41, reviewStatus: 'draft', aiGeneratedBy: 'claude-sonnet-5 (multi-angle)' },
    },
    { now: FIXED_NOW, dryRun: false, regenerate: true },
  )
  ok(
    human.result.status === 'skipped' && human.result.reason === 'existing_not_regenerable',
    '11c. 非 template: 生成物（AI 経路 draft）も regenerate 対象外',
  )

  // 11d. regenerate 指定なし＋既存あり → 従来どおり already_drafted（update しない）
  const noFlag = await run(
    {
      dc: dc386Approved,
      facts: readyFacts,
      pillarTagId: 6,
      existingArticle: { id: 55, reviewStatus: 'draft', aiGeneratedBy: 'template:generic:af#4' },
    },
    { now: FIXED_NOW, dryRun: false },
  )
  ok(noFlag.result.status === 'skipped' && noFlag.result.reason === 'already_drafted', '11d. --regenerate 無しは already_drafted のまま')
  ok(noFlag.updateCalls.length === 0, '11d. update を呼ばない')
}

// -------------------------------------------------------------------------
console.log('\n■ 12. 決定性')
{
  const a = await run({ dc: dc386Approved, facts: readyFacts, pillarTagId: 6 }, { now: FIXED_NOW })
  const b = await run({ dc: dc386Approved, facts: readyFacts, pillarTagId: 6 }, { now: FIXED_NOW })
  ok(JSON.stringify(a.result) === JSON.stringify(b.result), '同一入力で would_create の結果が完全一致')
}

console.log(`\n=== 結果: ${failures === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${failures} 件の不合格）`} ===`)
process.exit(failures === 0 ? 0 : 1)
