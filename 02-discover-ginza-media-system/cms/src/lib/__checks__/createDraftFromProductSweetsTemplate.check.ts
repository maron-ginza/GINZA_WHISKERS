// GINZA WHISKERS / Project 02 — createDraftFromProductSweetsTemplate の回帰テスト
// （2026-09-14、マロン指示：無課金のCMS保存処理・idempotency）
//
//   ・既定 dryRun:true（payload.create を一度も呼ばない）
//   ・templateEligible/承認済みでないと skipped になる
//   ・二重生成防止（idempotency）：既に同じDCから作られたArticleがあれば
//     dry-run/liveを問わずalready_draftedを返し、payload.createを呼ばない
//   ・liveかつ条件を満たす場合のみ payload.create を1回だけ呼ぶ
//   ・AI・ネットワークに一切触れない（ソース検査）
//
// 【実装メモ】既存の _harness.ts は同期 `fn: () => void` のみ対応（変更しない
// 方針）。本体は async のため、モジュール読み込み時（top-level await）に
// フェイク Payload でのシナリオをすべて先に実行し、結果を変数へ確定させた
// うえで、各 `fn` は確定済みの結果を検査するだけの同期関数にしている。

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { createDraftFromProductSweetsTemplate } from '../template/createDraftFromProductSweetsTemplate'
import type { Payload } from 'payload'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const ROOT = resolve(process.cwd(), '..')

const DC_1152: Record<string, unknown> = {
  id: 1152,
  title: '松屋銀座 GINZAスイート｜ジッカ 神紅と多伎いちじくのタルト',
  curationStatus: 'approved',
  articleUrl:
    'https://www.matsuyaginza.com/jp/ginza/events/food/sweets/20260909#vendor=ジッカ&product=神紅と多伎いちじくのタルト',
  sourceSite: { id: 4, name: '松屋銀座' },
  venue: '松屋銀座 地下1F GINZAスイート',
  contentType: 'event',
  excerpt: '島根県の秋の味覚【神紅】と【多伎いちじく】の二つをトンカ豆の香りとカシスと共に贅沢に組み合わせたタルト。 831円',
  eventStartAt: '2026-09-09T00:00:00.000Z',
  eventEndAt: '2026-09-15T00:00:00.000Z',
  lastCheckedAt: '2026-09-13T21:05:10.496Z',
  detectedAt: '2026-09-13T21:05:10.496Z',
}

/** 呼び出し回数を記録するフェイク Payload（実DB・実AIには一切触れない） */
function makeFakePayload(opts: {
  dc: Record<string, unknown> | null
  /** editorialProvenance が同じ DC を参照する既存 Article 群（find の戻り値そのもの） */
  existingArticles?: { id: number; aiGeneratedBy?: string | null }[]
  pillarTag?: { id: number } | null
}) {
  const calls = { findByID: 0, find: 0, create: 0 }
  const fake = {
    findByID: async (_args: unknown) => {
      calls.findByID++
      if (!opts.dc) throw new Error('not found')
      return opts.dc
    },
    find: async (args: { collection: string }) => {
      calls.find++
      if (args.collection === 'articles') {
        return { docs: opts.existingArticles ?? [] }
      }
      if (args.collection === 'tags') {
        return { docs: opts.pillarTag !== undefined ? (opts.pillarTag ? [opts.pillarTag] : []) : [{ id: 99 }] }
      }
      return { docs: [] }
    },
    create: async (_args: unknown) => {
      calls.create++
      return { id: 777 }
    },
  }
  return { fake: fake as unknown as Payload, calls }
}

// --- top-level await：全シナリオを先に実行し、結果を確定させる ---
const fx1 = makeFakePayload({ dc: DC_1152 })
const rDefaultDryRun = await createDraftFromProductSweetsTemplate(fx1.fake, 1152)

const fx2 = makeFakePayload({ dc: null })
const rDcNotFound = await createDraftFromProductSweetsTemplate(fx2.fake, 9999, { dryRun: false })

const fx3 = makeFakePayload({ dc: { ...DC_1152, curationStatus: 'inbox' } })
const rNotApproved = await createDraftFromProductSweetsTemplate(fx3.fake, 1152, { dryRun: false })

const fx4 = makeFakePayload({ dc: { ...DC_1152, title: null } })
const rMissingRequired = await createDraftFromProductSweetsTemplate(fx4.fake, 1152, { dryRun: false })

const fx5dry = makeFakePayload({
  dc: DC_1152,
  existingArticles: [{ id: 68, aiGeneratedBy: 'template:product_sweets:dc#1152' }],
})
const rDupDryRun = await createDraftFromProductSweetsTemplate(fx5dry.fake, 1152, { dryRun: true })
const fx5live = makeFakePayload({
  dc: DC_1152,
  existingArticles: [{ id: 68, aiGeneratedBy: 'template:product_sweets:dc#1152' }],
})
const rDupLive = await createDraftFromProductSweetsTemplate(fx5live.fake, 1152, { dryRun: false })

const fx6 = makeFakePayload({ dc: DC_1152, pillarTag: null })
const rPillarMissing = await createDraftFromProductSweetsTemplate(fx6.fake, 1152, { dryRun: false })

const fx7 = makeFakePayload({ dc: DC_1152, pillarTag: { id: 12 } })
const rLiveSuccess = await createDraftFromProductSweetsTemplate(fx7.fake, 1152, { dryRun: false })

// 実際にArticle #68で起きた状況の再現：DC #1152から**別経路**（AI下書き生成
// draft-from-dc）で既に作られたArticleがある場合、本テンプレートでの新規
// 保存をブロックしてはいけない（マロン指示：「Article #68は使用・変更・
// 削除しない」——ブロック要因にもしない）。
const fx8 = makeFakePayload({
  dc: DC_1152,
  existingArticles: [{ id: 68, aiGeneratedBy: 'claude-sonnet-5 (multi-angle:core:medium|warnings=unsourcedPeriodClaim)' }],
  pillarTag: { id: 12 },
})
const rOtherRouteExisting = await createDraftFromProductSweetsTemplate(fx8.fake, 1152, { dryRun: true })

const cases: CheckCase[] = [
  {
    name: '【既定dryRun】オプション未指定は dryRun:true・payload.createを一度も呼ばない',
    fn: () => {
      assert(rDefaultDryRun.dryRun === true, `既定でdryRun:trueにならない: ${rDefaultDryRun.dryRun}`)
      assert(rDefaultDryRun.status === 'would_create', `status=${rDefaultDryRun.status}`)
      assert(fx1.calls.create === 0, 'dry-runなのにpayload.createが呼ばれている')
    },
  },
  {
    name: '【DC未発見】skipped・reason:dc_not_found、createを呼ばない',
    fn: () => {
      assert(rDcNotFound.status === 'skipped' && rDcNotFound.reason === 'dc_not_found', `想定外: ${rDcNotFound.status}/${rDcNotFound.reason}`)
      assert(fx2.calls.create === 0, 'DC未発見なのにcreateが呼ばれている')
    },
  },
  {
    name: '【未承認DC】curationStatus!=approvedはskipped・reason:not_approved',
    fn: () => {
      assert(rNotApproved.status === 'skipped' && rNotApproved.reason === 'not_approved', `想定外: ${rNotApproved.status}/${rNotApproved.reason}`)
      assert(fx3.calls.create === 0, '未承認なのにcreateが呼ばれている')
    },
  },
  {
    name: '【必須項目欠落】title/sourceName/sourceUrlのいずれか欠落はskipped・reason:human_review',
    fn: () => {
      assert(rMissingRequired.status === 'skipped' && rMissingRequired.reason === 'human_review', `想定外: ${rMissingRequired.status}/${rMissingRequired.reason}`)
      assert(fx4.calls.create === 0, '必須項目欠落なのにcreateが呼ばれている')
    },
  },
  {
    name: '【idempotency】既に同じDCから作られたArticleがあれば、dry-run/live問わずalready_draftedでcreateを呼ばない',
    fn: () => {
      assert(rDupDryRun.status === 'already_drafted' && rDupDryRun.existingArticleId === 68, `dry-run側が想定外: ${JSON.stringify(rDupDryRun)}`)
      assert(fx5dry.calls.create === 0, 'dry-runでexisting扱いなのにcreateが呼ばれている')
      assert(rDupLive.status === 'already_drafted' && rDupLive.existingArticleId === 68, `live側が想定外: ${JSON.stringify(rDupLive)}`)
      assert(fx5live.calls.create === 0, 'live実行でも既存Articleがあればcreateを呼んではいけない（二重作成防止）')
    },
  },
  {
    name: '【他経路の既存Articleはブロックしない】Article #68実例の再現：aiGeneratedByがtemplate:product_sweets:で始まらない既存Article（AI下書き生成由来）があっても、本テンプレートでの新規作成はブロックされない',
    fn: () => {
      assert(
        rOtherRouteExisting.status === 'would_create',
        `他経路の既存Articleに巻き込まれてブロックされている: status=${rOtherRouteExisting.status}, existingArticleId=${rOtherRouteExisting.existingArticleId}`,
      )
    },
  },
  {
    name: '【pillar Tag未発見】skipped・reason:pillar_tag_missing',
    fn: () => {
      assert(rPillarMissing.status === 'skipped' && rPillarMissing.reason === 'pillar_tag_missing', `想定外: ${rPillarMissing.status}/${rPillarMissing.reason}`)
      assert(fx6.calls.create === 0, 'pillar Tag未発見なのにcreateが呼ばれている')
    },
  },
  {
    name: '【live成功】条件を満たしdryRun:falseならpayload.createが1回だけ呼ばれ、articleIdが返る',
    fn: () => {
      assert(rLiveSuccess.status === 'created', `status=${rLiveSuccess.status}（reason=${rLiveSuccess.reason}, missing=${JSON.stringify(rLiveSuccess.missing)}）`)
      assert(rLiveSuccess.articleId === 777, `articleIdが想定と異なる: ${rLiveSuccess.articleId}`)
      assert(fx7.calls.create === 1, `payload.createの呼び出し回数が1でない: ${fx7.calls.create}`)
    },
  },
  {
    name: '【plan/previewの内容】DC #1152相当ならhashtags4個・aiGeneratedByがtemplate:product_sweets:で始まる',
    fn: () => {
      assert(!!rDefaultDryRun.plan, 'planが無い')
      assert(rDefaultDryRun.plan!.hashtags.length === 4, `hashtagsが4個でない: ${rDefaultDryRun.plan!.hashtags.length}`)
      assert(
        rDefaultDryRun.plan!.aiGeneratedBy.startsWith('template:product_sweets:'),
        `aiGeneratedByが想定外: ${rDefaultDryRun.plan!.aiGeneratedBy}`,
      )
      assert(rDefaultDryRun.plan!.reviewStatus === 'draft', 'reviewStatusがdraftでない')
    },
  },
  {
    name: '【AI/ネットワーク非依存】createDraftFromProductSweetsTemplate.tsはfetch/anthropic/claudeを参照しない',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/lib/template/createDraftFromProductSweetsTemplate.ts'), 'utf8')
      assert(!/\bfetch\s*\(/.test(src), 'fetch呼び出しが含まれている')
      // 「Claude API を呼ばない」等の安全宣言コメントは許容し、実際の import・
      // API呼び出しだけを禁止する（productSweetsTemplate.check.tsの同種テストと違い
      // こちらのファイルは設計コメント上「Claude API」という語を含むため）。
      assert(!/from\s+['"]@anthropic-ai/.test(src), '@anthropic-ai のimportが含まれている')
      assert(!/new\s+Anthropic\s*\(/.test(src), 'Anthropicクライアントの生成が含まれている')
    },
  },
  {
    name: '【既存スクリプトを変更していない】draftTemplate.ts / createDraftFromArticleFacts.ts はこのタスクで無変更（新規ファイルのみ追加）',
    fn: () => {
      for (const f of ['cms/src/scripts/draftTemplate.ts', 'cms/src/lib/template/createDraftFromArticleFacts.ts']) {
        assert(!/productSweets/i.test(readFileSync(resolve(ROOT, f), 'utf8')), `${f} が新モジュールを参照/変更している`)
      }
    },
  },
]

export const suite = () => runSuite('createDraftFromProductSweetsTemplate', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
