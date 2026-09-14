import { getPayload } from 'payload'

import config from '../payload.config'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { extractProductNewsFactsCandidate } from '../lib/morning/extractProductNewsFacts'
import { fetchOfficialSignals, isAllowedHost } from '../lib/morning/fetchOfficialSignals'
import {
  createOrUpdateArticleFactsFromCandidate,
  type ArticleFactsRow,
  type ArticleFactsStore,
  type ArticleFactsWrite,
  type RegisterGateInput,
} from '../lib/morning/registerArticleFacts'
import type { ImagePreflightResult, OfficialPageSignals } from '../lib/morning/types'
import type { DiscoveredContentLike } from '../lib/template/mapDiscoveredContentToEventFields'
import { evaluateReadyGate } from '../lib/template/readyGate'

// GINZA WHISKERS / Project 02（2026-09-03）— DC #331 のみを対象に、通常の
// registerArticleFacts 経路で ArticleFacts を enrichmentStatus=draft として1件作成する。
//
//   node --env-file=.env --import=tsx/esm src/scripts/registerFacts331.ts --dry-run
//   node --env-file=.env --import=tsx/esm src/scripts/registerFacts331.ts --write
//
// マロン確認値：Primary Category=BEAUTY / templateType=sale / 経路=product_news
// 厳守：#331 のみ・draft のまま停止・ready 化しない・記事本文生成しない・
//       note/X/commit/push/deploy/本番DBなし・bypass-draft 不使用。

const DRY = !process.argv.includes('--write')
const DC_ID = 331
const HUMAN_PRIMARY_CATEGORY = 'BEAUTY'
const HUMAN_TEMPLATE_TYPE = 'sale' as const

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}

async function main() {
  console.log(`\n=== registerFacts331  mode=${DRY ? 'DRY-RUN（DB 書き込みなし）' : 'WRITE（draft 1件作成）'} ===\n`)
  const payload = await getPayload({ config })

  // --- 接続先が ローカル discover_ginza であることを再確認（DATABASE_URI から） ---
  const uri = process.env.DATABASE_URI ?? ''
  const m = uri.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+)(?::\d+)?\/([^?]+)/)
  const host = m?.[1] ?? '(不明)'
  const db = m?.[2] ?? '(不明)'
  console.log(`接続先: host=${host === 'localhost' || host === '127.0.0.1' ? 'ループバック(ローカル)' : host}  db=${db}`)
  if (db !== 'discover_ginza' || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`想定外の接続先（host=${host} db=${db}）。中止。`)
  }

  // --- DC #331 読み取り ---
  const dcDoc = (await payload.findByID({
    collection: 'discovered-content',
    id: DC_ID,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  if (!dcDoc) throw new Error('DC #331 が見つからない')
  if (dcDoc.curationStatus !== 'approved') throw new Error(`DC #331 は approved でない（${String(dcDoc.curationStatus)}）`)

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
  console.log(`DC #${DC_ID}: ${dcLike.title}`)
  console.log(`  url=${dcLike.articleUrl}`)
  console.log(`  event=${dcLike.eventStartAt} 〜 ${dcLike.eventEndAt}  curation=approved`)

  // --- 許可ホスト（SOURCE LEDGER enabled）を DB から導出 ---
  const ledger = await payload.find({
    collection: 'source-ledger',
    where: { enabled: { equals: true } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const allowedHosts: string[] = []
  for (const l of ledger.docs as unknown as Array<Record<string, unknown>>) {
    for (const key of ['url', 'siteUrl', 'homepageUrl', 'listingPageUrl']) {
      const u = l[key]
      if (typeof u === 'string' && u) {
        try {
          allowedHosts.push(new URL(u).hostname)
        } catch {
          /* skip */
        }
      }
    }
  }
  const uniqHosts = [...new Set(allowedHosts)]
  const dcHost = (() => {
    try {
      return new URL(dcLike.articleUrl ?? '').hostname
    } catch {
      return ''
    }
  })()
  const trustedSource = dcHost !== '' && isAllowedHost(dcHost, uniqHosts)
  console.log(`  host=${dcHost}  trustedSource=${trustedSource}  (SOURCE LEDGER host 数=${uniqHosts.length})`)
  if (!trustedSource) throw new Error(`出典ホスト ${dcHost} が SOURCE LEDGER の許可ドメインにない。中止。`)

  // --- 公式ページ取得（許可ホストのみ・読み取り専用・課金なし） ---
  let signals: OfficialPageSignals | null = null
  try {
    signals = await fetchOfficialSignals(dcLike.articleUrl ?? '', { allowedHosts: uniqHosts })
  } catch (e) {
    signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: String(e) }
  }
  console.log(
    `公式ページ取得: ok=${signals?.ok} status=${signals?.httpStatus} bodyText=${signals?.bodyText ? signals.bodyText.length + '字' : 'なし'} jsonLd=${Array.isArray(signals?.jsonLd) ? signals?.jsonLd.length : 0}`,
  )

  const now = new Date()
  const image: ImagePreflightResult = {
    available: false,
    policy: '画像なし（外部転載禁止・独自生成はマロン判断後）',
    externalImageProhibited: true,
  }

  // --- 分類（記録用。マロン確認値で上書きする） ---
  const cls = classifyFactKind({
    contentType: dcLike.contentType,
    uxType: dcLike.uxType,
    title: dcLike.title,
    excerpt: dcLike.excerpt,
    officialSignals: signals,
  })
  console.log(`classifyFactKind（自動）: ${cls.factKind} (信頼度 ${cls.confidence})  → マロン確認値で product_news / sale / BEAUTY に確定`)

  // --- 抽出（通常経路と同じ関数） ---
  const base = extractArticleFactsCandidate({ dc: dcLike, image, officialSignals: signals, trustedSource })
  const productExtraction = extractProductNewsFactsCandidate({ dc: dcLike, image, officialSignals: signals, trustedSource })

  // extractedEventFacts の confirmed / unconfirmed 内訳
  console.log('\n── extractArticleFactsCandidate.extractedEventFacts（base）──')
  const eef = base.extractedEventFacts
  const efKeys = ['eventName', 'eventDate', 'eventDateISO', 'eventTime', 'venuePlace', 'paid', 'applyRequired', 'whatHappens', 'officialInfoNote'] as const
  for (const k of efKeys) {
    console.log(`  ${k.padEnd(16)}: value=${JSON.stringify(eef[k].value)}  status=${eef[k].confirmationStatus}  (${eef[k].method})`)
  }
  console.log(`  hashtagCandidates: ${JSON.stringify(eef.hashtagCandidates)}  targetNameFoundInBody=${eef.targetNameFoundInBody}`)
  console.log(`  base.conflicts: ${JSON.stringify(base.conflicts)}`)
  console.log(`  base.readyCheck.trustedSource: ${base.readyCheck.trustedSource}`)
  console.log(`  base.fields.sourceName=${base.fields.sourceName} sourceUrl=${base.fields.sourceUrl} verifiedAt=${base.fields.verifiedAt}`)

  console.log('\n── extractProductNewsFactsCandidate（productExtraction）──')
  const pf = productExtraction.fields
  for (const k of Object.keys(pf) as (keyof typeof pf)[]) {
    console.log(`  ${String(k).padEnd(18)}: ${JSON.stringify(pf[k])}`)
  }
  console.log(`  unknownItems: ${JSON.stringify(productExtraction.unknownItems)}`)
  console.log(`  officiallyNotStated: ${JSON.stringify(productExtraction.officiallyNotStated)}`)
  console.log(`  notApplicable: ${JSON.stringify(productExtraction.notApplicable)}`)
  console.log(`  conflicts: ${JSON.stringify(productExtraction.conflicts)}`)

  // --- gate（morningRun と同じ組み立て。#331 は product_news・非C・非expired・非duplicate） ---
  const nowMs = now.getTime()
  const endMs = dcLike.eventEndAt ? new Date(dcLike.eventEndAt).getTime() : NaN
  const expired = Number.isFinite(endMs) && endMs < nowMs
  const gate: RegisterGateInput = {
    verdict: 'B', // product_news は event 必須項目で A 判定しない。approved・非expired・追跡可能出典 → 非C
    verdictReasons: [
      'マロン確認値: Primary Category=BEAUTY / templateType=sale / 経路=product_news',
      'product_news は event 必須項目で A 判定しない（常に B）',
    ],
    expired,
    duplicate: false, // 事前確認済み：DC331 を参照する Article なし・同名 Article なし・note-draft queue なし
    factKind: 'product_news',
    templateType: HUMAN_TEMPLATE_TYPE,
    primaryCategory: HUMAN_PRIMARY_CATEGORY,
    productExtraction,
  }
  console.log(`\ngate: verdict=${gate.verdict} expired=${gate.expired} duplicate=${gate.duplicate} factKind=${gate.factKind} templateType=${gate.templateType} primaryCategory=${gate.primaryCategory}`)

  // --- Store（本番 payload adapter。ただし create/update は WRITE 時のみ許可） ---
  const madeWrites: string[] = []
  const store: ArticleFactsStore = {
    async findByDc(dcId) {
      const res = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: dcId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const d = res.docs[0] as unknown as Record<string, unknown> | undefined
      if (!d) return null
      return {
        id: Number(d.id),
        discoveredContent: DC_ID,
        enrichmentStatus: String(d.enrichmentStatus ?? 'draft'),
        eventDateISO: (d.eventDateISO as string | null) ?? null,
        sourceProvenanceFacts: (d.sourceProvenanceFacts as ArticleFactsRow['sourceProvenanceFacts']) ?? null,
        notes: (d.notes as string | null) ?? null,
        eventName: (d.eventName as string | null) ?? null,
        eventDate: (d.eventDate as string | null) ?? null,
        eventTime: (d.eventTime as string | null) ?? null,
        venues: (d.venues as ArticleFactsRow['venues']) ?? null,
        paid: (d.paid as string | null) ?? null,
        applyRequired: (d.applyRequired as string | null) ?? null,
      }
    },
    async create(data: ArticleFactsWrite) {
      if (DRY) throw new Error('DRY-RUN では create を呼ばない（ここに来たら設計ミス）')
      const created = await payload.create({
        collection: 'article-facts',
        overrideAccess: true,
        data: { ...data, enrichmentStatus: 'draft' } as never, // draft 固定
      })
      madeWrites.push(`create id=${(created as { id: number }).id}`)
      return { ...(created as unknown as ArticleFactsRow), discoveredContent: DC_ID }
    },
    async update(id, data) {
      if (DRY) throw new Error('DRY-RUN では update を呼ばない')
      const { enrichmentStatus: _drop, ...rest } = data
      void _drop
      const updated = await payload.update({ collection: 'article-facts', id, overrideAccess: true, data: rest as never })
      madeWrites.push(`update id=${id}`)
      return { ...(updated as unknown as ArticleFactsRow), discoveredContent: DC_ID }
    },
  }

  // --- 通常経路：createOrUpdateArticleFactsFromCandidate ---
  const rr = await createOrUpdateArticleFactsFromCandidate(store, base, gate, { dryRun: DRY, now })
  console.log(`\n── register 結果 ──`)
  console.log(`  action=${rr.action}  reason=${rr.reason ?? '-'}  articleFactsId=${rr.articleFactsId ?? '-'}  provenanceCount=${rr.provenanceCount}`)
  console.log(`  diff:`)
  for (const d of rr.diff) console.log(`    ${d.field}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`)

  // --- 検証 ---
  console.log(`\n── 検証 ──`)
  if (DRY) {
    ok(rr.action === 'would_create', 'DRY-RUN: action=would_create（新規1件を作る計画）')
    ok(madeWrites.length === 0, 'DRY-RUN: DB 書き込み 0 件')
    // confirmed のみが渡ることの確認：diff に現れる event フィールドは confirmed のものだけ
    const efDiffFields = rr.diff.map((d) => d.field)
    const paidWritten = efDiffFields.includes('paid')
    const venuesWritten = efDiffFields.includes('venues')
    const eventTimeWritten = efDiffFields.includes('eventTime')
    ok(!paidWritten || eef.paid.confirmationStatus === 'confirmed', 'confirmed でない paid は diff に出ない')
    ok(!venuesWritten || eef.venuePlace.confirmationStatus === 'confirmed', 'confirmed でない venues は diff に出ない')
    ok(!eventTimeWritten || eef.eventTime.confirmationStatus === 'confirmed', 'confirmed でない eventTime は diff に出ない')
    ok(efDiffFields.includes('primaryCategory') && efDiffFields.includes('templateType'), 'マロン確認値 primaryCategory / templateType が draft へ渡る')
    // sale の ready ゲート（この時点では priceText 等が無く不成立であること）
    const g = evaluateReadyGate(
      {
        templateType: 'sale',
        contentTitle: eef.eventName.confirmationStatus === 'confirmed' ? eef.eventName.value : null,
        contentSummary: eef.whatHappens.confirmationStatus === 'confirmed' ? eef.whatHappens.value : null,
        availablePeriod: eef.eventDate.confirmationStatus === 'confirmed' ? eef.eventDate.value : null,
        eventDateISO: base.fields.eventStartAt,
        officialInfoNote: eef.officialInfoNote.confirmationStatus === 'confirmed' ? eef.officialInfoNote.value : null,
        hashtags: [{ tag: '#銀座' }],
        sourceProvenanceFacts: [{ fact: 'x', verificationStatus: 'confirmed' }],
      },
      'sale',
      { now },
    )
    ok(g.eligible === false, 'sale ready ゲート：この時点では eligible=false（priceText 未入力 → 人間が admin で確定）')
    console.log(`    （参考）sale ready 未充足項目: ${JSON.stringify(g.missing)}`)
  } else {
    ok(rr.action === 'created', 'WRITE: action=created')
    ok(madeWrites.length === 1 && madeWrites[0].startsWith('create'), 'WRITE: create 1 回のみ')
    // 実 DB を読み直して検証
    const check = await payload.find({
      collection: 'article-facts',
      where: { discoveredContent: { equals: DC_ID } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const rowc = check.docs[0] as unknown as Record<string, unknown>
    console.log(`\n── 実 DB 行 ──`)
    console.log(
      `  id=${rowc.id} discoveredContent=${JSON.stringify(rowc.discoveredContent)} enrichmentStatus=${rowc.enrichmentStatus}`,
    )
    console.log(`  primaryCategory=${JSON.stringify(rowc.primaryCategory)} templateType=${JSON.stringify(rowc.templateType)} priceText=${JSON.stringify(rowc.priceText)}`)
    console.log(`  eventName=${JSON.stringify(rowc.eventName)} eventDate=${JSON.stringify(rowc.eventDate)} eventTime=${JSON.stringify(rowc.eventTime)}`)
    console.log(`  paid=${JSON.stringify(rowc.paid)} applyRequired=${JSON.stringify(rowc.applyRequired)} venues=${JSON.stringify(rowc.venues)}`)
    console.log(`  whatHappens=${JSON.stringify(rowc.whatHappens)}`)
    console.log(`  officialInfoNote=${JSON.stringify(rowc.officialInfoNote)}`)
    console.log(`  sourceProvenanceFacts(${Array.isArray(rowc.sourceProvenanceFacts) ? (rowc.sourceProvenanceFacts as unknown[]).length : 0}): ${JSON.stringify(rowc.sourceProvenanceFacts)}`)
    console.log(`  enteredBy=${JSON.stringify(rowc.enteredBy)} humanReviewedBy=${JSON.stringify(rowc.humanReviewedBy)} humanReviewedAt=${JSON.stringify(rowc.humanReviewedAt)}`)
    console.log(`  notes=${JSON.stringify(rowc.notes)}`)

    ok(String(rowc.enrichmentStatus) === 'draft', 'enrichmentStatus=draft（ready にしていない）')
    ok(rowc.humanReviewedAt == null && rowc.humanReviewedBy == null, 'humanReviewed* は未設定（ready 遷移していない）')
    ok(rowc.primaryCategory === HUMAN_PRIMARY_CATEGORY, `primaryCategory=${HUMAN_PRIMARY_CATEGORY}`)
    ok(rowc.templateType === HUMAN_TEMPLATE_TYPE, `templateType=${HUMAN_TEMPLATE_TYPE}`)
    ok(rowc.priceText == null, 'priceText は未書き込み（未確認 → 人間が admin で確定）')
    ok(rowc.paid == null || rowc.paid === 'unknown', 'paid は自動確定しない（sale では priceText で代替）')
    ok(rowc.eventTime == null, 'eventTime は sale では自動入力しない')
    ok(rowc.applyRequired == null || rowc.applyRequired === 'no', 'applyRequired は自動で yes にしない')
    ok(
      Number(String(check.docs[0] && (check.docs[0] as { discoveredContent?: unknown }).discoveredContent === 'object' ? (rowc.discoveredContent as { id: number }).id : rowc.discoveredContent)) === DC_ID,
      `discoveredContent が #${DC_ID} に紐づく`,
    )
  }

  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅' : `FAIL ❌（${fail}）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
