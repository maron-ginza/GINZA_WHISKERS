import { getPayload } from 'payload'

import config from '../payload.config'
import { assessCandidate } from '../lib/morning/assessCandidate'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { classifyTemplateType } from '../lib/morning/classifyTemplateType'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { fetchOfficialSignals } from '../lib/morning/fetchOfficialSignals'
import {
  createOrUpdateArticleFactsFromCandidate,
  type ArticleFactsRow,
  type ArticleFactsStore,
} from '../lib/morning/registerArticleFacts'
import { buildTemplatePrecheck } from '../lib/morning/templatePrecheck'
import type { OfficialPageSignals } from '../lib/morning/types'
import {
  buildTemplateArticleInput,
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../lib/template/mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from '../lib/template/renderArticleFromTemplate'

// 読み取り専用回帰テスト（2026-09-03）。DB 書き込み・ready 化・note/X 操作・commit なし。
//   node --env-file=.env --import=tsx/esm src/scripts/regress310TemplatePipeline.ts

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}

async function main() {
  const payload = await getPayload({ config })
  const DC_ID = 310

  const dcDoc = (await payload.findByID({
    collection: 'discovered-content',
    id: DC_ID,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  const af = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: DC_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const factsDoc = (af.docs[0] ?? null) as unknown as Record<string, unknown> | null

  const ss = dcDoc.sourceSite as { name?: string | null } | null
  const dcLike: DiscoveredContentLike = {
    id: DC_ID,
    title: (dcDoc.title as string | null) ?? null,
    excerpt: (dcDoc.excerpt as string | null) ?? null,
    articleUrl: (dcDoc.articleUrl as string | null) ?? null,
    sourceSiteName: ss?.name ?? null,
    publishedAt: (dcDoc.publishedAt as string | null) ?? null,
    eventStartAt: (dcDoc.eventStartAt as string | null) ?? null,
    eventEndAt: (dcDoc.eventEndAt as string | null) ?? null,
    venue: (dcDoc.venue as string | null) ?? null,
    contentType: (dcDoc.contentType as string | null) ?? null,
    uxType: (dcDoc.uxType as string | null) ?? null,
    lastCheckedAt: (dcDoc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dcDoc.detectedAt as string | null) ?? null,
    dateExtraction: (dcDoc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }

  // 公式ページ取得（読み取りのみ・課金なし）
  const allowedHosts = ['store.tsite.jp']
  let signals: OfficialPageSignals | null = null
  try {
    signals = await fetchOfficialSignals(dcLike.articleUrl ?? '', { allowedHosts })
  } catch (e) {
    signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: String(e) }
  }
  console.log(`\n公式ページ取得: ok=${signals?.ok} status=${signals?.httpStatus} bodyText=${signals?.bodyText ? signals.bodyText.length + '字' : 'なし'}`)

  const now = new Date()
  const factKind = classifyFactKind({
    contentType: dcLike.contentType,
    uxType: dcLike.uxType,
    title: dcLike.title,
    excerpt: dcLike.excerpt,
    officialSignals: signals,
  }).factKind
  console.log(`factKind: ${factKind}`)

  const extraction = extractArticleFactsCandidate({
    dc: dcLike,
    image: { available: false, assetPath: null, policy: '画像なし', season: null } as never,
    officialSignals: signals,
    trustedSource: true,
  })

  console.log('\n── extractedEventFacts ──')
  const eef = extraction.extractedEventFacts
  for (const k of ['eventName', 'eventDate', 'eventDateISO', 'eventTime', 'venuePlace', 'paid', 'applyRequired', 'whatHappens', 'officialInfoNote'] as const) {
    console.log(`  ${k}: value=${JSON.stringify(eef[k].value)}  status=${eef[k].confirmationStatus}  (${eef[k].method})`)
  }
  console.log(`  hashtagCandidates: ${JSON.stringify(eef.hashtagCandidates)}`)
  console.log(`  targetNameFoundInBody: ${eef.targetNameFoundInBody}  adapter: ${eef.adapter}`)
  console.log(`  conflicts: ${JSON.stringify(extraction.conflicts)}`)

  console.log('\n── 検証 ──')
  ok(!extraction.conflicts.some((c) => c.includes('別記事')), '別イベントの日付が混入しない（conflicts に「別記事」なし＝蔦屋は FIX4 対象外）')
  ok(eef.eventDateISO.value === '2026-08-28T00:00:00.000Z', `会期(機械) が 2026-08-28 開始（実際: ${eef.eventDateISO.value}）`)
  ok(
    !!eef.eventDate.value && eef.eventDate.value.includes('2026年8月28日') && eef.eventDate.value.includes('9月6日'),
    `会期(表示) が「2026年8月28日（金）〜9月6日（日）」相当（実際: ${eef.eventDate.value}）`,
  )
  ok(eef.eventDate.confirmationStatus === 'confirmed', '会期(表示) が confirmed（構造化日付 or 本文照合）')
  const venueOk = !!eef.venuePlace.value && /ART IN CABINET|銀座 蔦屋書店/.test(eef.venuePlace.value)
  ok(venueOk, `会場が「銀座 蔦屋書店 ART IN CABINET（GINZA SIX 6F）」相当（実際: ${eef.venuePlace.value}）`)
  ok(eef.paid.value === 'free', `入場無料を抽出（実際: ${eef.paid.value}）`)
  // eventTime：情報ブロックの「営業時間：11:00〜21:00」を採用、店舗共通「時間」の 10:30 は不採用
  ok(
    !!eef.eventTime.value && eef.eventTime.value.startsWith('11時から21時まで') && eef.eventTime.confirmationStatus === 'confirmed',
    `eventTime = 11時から21時まで（confirmed）（実際: ${eef.eventTime.value} / ${eef.eventTime.confirmationStatus}）`,
  )
  ok(!!eef.eventTime.value && !eef.eventTime.value.includes('10時'), 'eventTime に 10:30 を採用しない')
  ok(!!eef.eventTime.value && /最終日（9月6日）は19時終了予定/.test(eef.eventTime.value), `eventTime に「9月6日は19時終了予定」を付記（実際: ${eef.eventTime.value}）`)
  // 未確認は confirmed にならない：applyRequired は常に unconfirmed
  ok(eef.applyRequired.confirmationStatus === 'unconfirmed' && eef.applyRequired.value === null, '未確認事項（applyRequired）が confirmed にならない')
  // item3: whatHappens は公式本文の概要が取れる場合だけ confirmed
  ok(
    !!eef.whatHappens.value && eef.whatHappens.confirmationStatus === 'confirmed' && /消しゴムハンコ|開催/.test(eef.whatHappens.value),
    `whatHappens が公式概要から confirmed（実際: ${eef.whatHappens.value?.slice(0, 40)}…）`,
  )
  // item3: officialInfoNote は最終日変更等が明記されていれば confirmed
  ok(
    !!eef.officialInfoNote.value && eef.officialInfoNote.confirmationStatus === 'confirmed' && /最終日/.test(eef.officialInfoNote.value),
    `officialInfoNote に「最終日…終了予定」が confirmed（実際: ${eef.officialInfoNote.value}）`,
  )
  // item3: ハッシュタグは候補どまり（confirmed の概念を持たない・register が書かない）
  ok(Array.isArray(eef.hashtagCandidates) && eef.hashtagCandidates.length > 0 && eef.hashtagCandidates.includes('#銀座'), `ハッシュタグ候補が生成される（実際: ${eef.hashtagCandidates.join(' ')}）`)

  // テンプレート種別
  const tt = classifyTemplateType({ factKind, contentType: dcLike.contentType, uxType: dcLike.uxType, title: dcLike.title, excerpt: dcLike.excerpt })
  console.log(`\ntemplateType: ${tt.templateType} (信頼度 ${tt.confidence})  reasons: ${tt.reasons.join(' / ')}`)
  ok(tt.templateType === 'exhibition', 'templateType = exhibition')

  // ready な ArticleFacts（id=3）でテンプレ判定
  const factsLike = factsDoc ? (factsDoc as unknown as ArticleFactsLike) : undefined
  // 実 DB の ArticleFacts id=3 は template_type='unknown'（旧 ready 行）。
  // 実コマンド ./p2 draft-template 310 は admin で template_type を 'exhibition' に設定してから通す。
  // このハーネスは exhibition レンダリング経路の回帰を検証するため明示指定する。
  const mapped = mapDiscoveredContentToEventFields(dcLike, { facts: factsLike, templateType: 'exhibition', now })
  console.log(`\nmapper: templateEligible=${mapped.templateEligible} variant=${mapped.variant} missing=${JSON.stringify(mapped.missing)}`)
  ok(mapped.templateEligible === true, 'templateEligible = true（ready な ArticleFacts id=3）')
  ok(mapped.variant === 'exhibition', 'exhibition テンプレートが選択される')
  ok(!factsLike?.editionLabel && !factsLike?.theme, 'editionLabel と theme は空欄')
  const input = buildTemplateArticleInput(mapped)
  ok(input !== null, 'editionLabel/theme が空欄でも生成可能（buildTemplateArticleInput != null）')
  if (input) {
    const rendered = renderArticleFromTemplate(input)
    ok(!/第\d+回|テーマは「|抽選|当選/.test(rendered.noteBody), '本文に回次・テーマ・抽選・当選の語が入らない')
    ok(!rendered.noteBody.includes('ワークショップ') && !rendered.noteBody.includes('撮影'), '未確認事項（WS詳細・撮影可否）が本文に出ない')
    ok(rendered.noteBody.includes('入場は無料') || rendered.noteBody.includes('入場無料'), '入場無料が本文に反映')
  }

  // precheck
  const tp = buildTemplatePrecheck({ dc: dcLike, facts: factsLike, factsSource: mapped.factsSource, templateType: tt, extraction, verdict: 'A' as const, now })
  console.log(`\nprecheck: decision=${tp.decision} recommendation=${tp.recommendation} eligible=${tp.templateEligible}`)
  ok(tp.decision === '投稿可能' && tp.recommendation === '推奨', 'precheck: 投稿可能 / 推奨（ready + eligible）')

  // register 自動入力（in-memory・DB書き込みなし）
  console.log('\n── registerArticleFacts 自動入力（in-memory draft・DB 未接続）──')
  const memRow: ArticleFactsRow = { id: 1, discoveredContent: DC_ID, enrichmentStatus: 'draft' }
  const store: ArticleFactsStore = {
    async findByDc() { return memRow },
    async create(d) { Object.assign(memRow, d, { id: 1 }); return memRow },
    async update(id, d) { Object.assign(memRow, d); return memRow },
  }
  const rr = await createOrUpdateArticleFactsFromCandidate(
    store,
    extraction,
    { verdict: 'B', verdictReasons: [], expired: false, duplicate: false, factKind: 'event' },
    { dryRun: false, now },
  )
  console.log(`  action=${rr.action}  diff=${JSON.stringify(rr.diff.map((d) => d.field))}`)
  console.log(`  memRow: eventName=${JSON.stringify(memRow.eventName)} eventDate=${JSON.stringify(memRow.eventDate)} paid=${JSON.stringify(memRow.paid)} venues=${JSON.stringify(memRow.venues)}`)
  ok(memRow.enrichmentStatus === 'draft', 'register: draft のまま（ready 化しない）')
  ok(!!memRow.eventDate && memRow.eventDate.includes('2026年8月28日'), 'register: 会期(表示) が draft へ自動入力')
  ok(memRow.paid === 'free', 'register: 入場無料が draft へ自動入力')
  ok(memRow.applyRequired == null, 'register: 未確認の applyRequired は書かない')

  // ready 行は触らない
  const readyRow: ArticleFactsRow = { id: 2, discoveredContent: DC_ID, enrichmentStatus: 'ready', eventName: '人間が入れた名前' }
  const store2: ArticleFactsStore = {
    async findByDc() { return readyRow },
    async create(d) { Object.assign(readyRow, d); return readyRow },
    async update(id, d) { Object.assign(readyRow, d); return readyRow },
  }
  const rr2 = await createOrUpdateArticleFactsFromCandidate(
    store2, extraction,
    { verdict: 'B', verdictReasons: [], expired: false, duplicate: false, factKind: 'event' },
    { dryRun: false, now },
  )
  ok(rr2.action === 'skipped' && readyRow.eventName === '人間が入れた名前', 'register: ready 行は自動更新しない（人間入力を上書きしない）')

  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅' : `FAIL ❌（${fail} 件）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
