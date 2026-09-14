import { getPayload } from 'payload'

import config from '../payload.config'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { extractProductNewsFactsCandidate } from '../lib/morning/extractProductNewsFacts'
import { fetchOfficialSignals, isAllowedHost } from '../lib/morning/fetchOfficialSignals'
import { mapSaleFactsToDraft } from '../lib/morning/mapSaleFactsToDraft'
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

// GINZA WHISKERS / Project 02（2026-09-03）— 共通 sale mapper を DC #331 / ArticleFacts ID=4 に適用。
//
//   node --env-file=.env --import=tsx/esm src/scripts/mapSaleFacts331.ts --dry-run
//   node --env-file=.env --import=tsx/esm src/scripts/mapSaleFacts331.ts --write
//
// 厳守：#331 のみ・draft のまま・ready 化しない・記事本文生成しない・note/X/commit/push/deploy なし。

const DRY = !process.argv.includes('--write')
const DC_ID = 331
const AF_ID = 4
const HUMAN_PRIMARY_CATEGORY = 'BEAUTY'
const HUMAN_TEMPLATE_TYPE = 'sale' as const

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}

async function main() {
  console.log(`\n=== mapSaleFacts331  mode=${DRY ? 'DRY-RUN（DB 書き込みなし）' : 'WRITE（ID=4 draft を更新）'} ===\n`)

  const uri = process.env.DATABASE_URI ?? ''
  const m = uri.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/]+)(?::\d+)?\/([^?]+)/)
  const host = m?.[1] ?? '(不明)'
  const db = m?.[2] ?? '(不明)'
  console.log(`接続先: host=${['localhost', '127.0.0.1', '::1'].includes(host) ? 'ループバック(ローカル)' : host}  db=${db}`)
  if (db !== 'discover_ginza' || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`想定外の接続先（host=${host} db=${db}）。中止。`)
  }

  const payload = await getPayload({ config })

  // --- DC #331 ---
  const dcDoc = (await payload.findByID({ collection: 'discovered-content', id: DC_ID, depth: 1, overrideAccess: true })) as unknown as Record<string, unknown>
  if (dcDoc.curationStatus !== 'approved') throw new Error(`DC #331 は approved でない`)
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

  // --- 既存 ArticleFacts ID=4（入力前スナップショット） ---
  const beforeDoc = (await payload.findByID({ collection: 'article-facts', id: AF_ID, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
  if (!beforeDoc) throw new Error(`ArticleFacts ID=${AF_ID} が無い`)
  const beforeParentDc = typeof beforeDoc.discoveredContent === 'object' ? (beforeDoc.discoveredContent as { id: number }).id : beforeDoc.discoveredContent
  if (Number(beforeParentDc) !== DC_ID) throw new Error(`ID=${AF_ID} が DC #${DC_ID} に紐づいていない`)
  const FIELDS = ['eventName', 'eventDate', 'eventDateISO', 'eventTime', 'venues', 'priceText', 'whatHappens', 'officialInfoNote', 'areaLead', 'audienceNote', 'hashtags', 'paid'] as const
  const beforeSnap: Record<string, unknown> = {}
  for (const k of FIELDS) beforeSnap[k] = beforeDoc[k] ?? null
  console.log('── 入力前（ArticleFacts ID=4）──')
  for (const k of FIELDS) console.log(`  ${k.padEnd(18)}: ${JSON.stringify(beforeSnap[k])}`)
  console.log(`  enrichmentStatus=${beforeDoc.enrichmentStatus} primaryCategory=${JSON.stringify(beforeDoc.primaryCategory)} templateType=${JSON.stringify(beforeDoc.templateType)}`)

  // --- 許可ホスト & 公式ページ取得 ---
  const ledger = await payload.find({ collection: 'source-ledger', where: { enabled: { equals: true } }, limit: 500, depth: 0, overrideAccess: true })
  const hosts: string[] = []
  for (const l of ledger.docs as unknown as Array<Record<string, unknown>>) {
    for (const key of ['url', 'siteUrl', 'homepageUrl', 'listingPageUrl']) {
      const u = l[key]
      if (typeof u === 'string' && u) {
        try { hosts.push(new URL(u).hostname) } catch { /* skip */ }
      }
    }
  }
  const uniqHosts = [...new Set(hosts)]
  const dcHost = (() => { try { return new URL(dcLike.articleUrl ?? '').hostname } catch { return '' } })()
  const trustedSource = dcHost !== '' && isAllowedHost(dcHost, uniqHosts)
  if (!trustedSource) throw new Error(`出典ホスト ${dcHost} が SOURCE LEDGER にない`)

  let signals: OfficialPageSignals | null = null
  try {
    signals = await fetchOfficialSignals(dcLike.articleUrl ?? '', { allowedHosts: uniqHosts })
  } catch (e) {
    signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: String(e) }
  }
  console.log(`\n公式ページ取得: ok=${signals?.ok} status=${signals?.httpStatus} bodyText=${signals?.bodyText ? signals.bodyText.length + '字' : 'なし'}`)

  const now = new Date()
  const image: ImagePreflightResult = { available: false, policy: '画像なし', externalImageProhibited: true }
  const baseCand = extractArticleFactsCandidate({ dc: dcLike, image, officialSignals: signals, trustedSource })
  const productCand = extractProductNewsFactsCandidate({ dc: dcLike, image, officialSignals: signals, trustedSource })

  // --- 共通 sale mapper を直接実行して中身を見る ---
  const mapped = mapSaleFactsToDraft({ base: baseCand, product: productCand, primaryCategory: HUMAN_PRIMARY_CATEGORY, now })
  console.log('\n── mapSaleFactsToDraft: facts（confirmed 事実の転記）──')
  for (const [k, v] of Object.entries(mapped.facts)) console.log(`  ${k.padEnd(18)}: ${JSON.stringify(v)}`)
  console.log('── mapSaleFactsToDraft: candidates（事実ではない・決定的生成）──')
  for (const [k, v] of Object.entries(mapped.candidates)) console.log(`  ${k.padEnd(18)}: ${JSON.stringify(v)}`)
  console.log('── 各項目の出典（origins）──')
  for (const o of mapped.origins) console.log(`  [${o.kind}] ${o.field.padEnd(22)} = ${JSON.stringify(o.value)}   ← ${o.source}`)
  console.log('── facts から除外した未確認情報（excluded）──')
  for (const e of mapped.excluded) console.log(`  ${e.field.padEnd(22)}: ${e.reason}`)
  console.log(`\nfactsAllConfirmed = ${mapped.factsAllConfirmed}`)

  // --- 独立再検証：facts の各値が抽出側の confirmed 値と一致するか ---
  const eef = baseCand.extractedEventFacts
  const confirmedOf = (key: 'eventName' | 'eventDate' | 'eventDateISO' | 'eventTime' | 'whatHappens' | 'officialInfoNote'): string | null =>
    eef[key].confirmationStatus === 'confirmed' ? eef[key].value : null
  // eventName は「読者向け正規化（【…】除去・「」→『』・外側空白詰め）」を許容する
  const normEventName = (raw: string): string =>
    raw
      .replace(/^【[^】]*】\s*/, '')
      .replace(/\s*[｜|].*$/, '')
      .replace(/「/g, '『')
      .replace(/」/g, '』')
      .replace(/([^\s])\s+『/g, '$1『')
      .replace(/』\s+([^\s])/g, '』$1')
      .replace(/[ \t　]{2,}/g, ' ')
      .trim()
  const factChecks: Array<[string, boolean]> = []
  if (mapped.facts.eventName !== undefined) {
    const raw = confirmedOf('eventName')
    factChecks.push(['eventName は confirmed 原題を読者向けに正規化した値', !!raw && mapped.facts.eventName === normEventName(raw)])
  }
  if (mapped.facts.eventDate !== undefined) factChecks.push(['eventDate は extracted confirmed と一致', mapped.facts.eventDate === confirmedOf('eventDate')])
  if (mapped.facts.eventTime !== undefined) factChecks.push(['eventTime は extracted confirmed と一致', mapped.facts.eventTime === confirmedOf('eventTime')])
  if (mapped.facts.whatHappens !== undefined) factChecks.push(['whatHappens は extracted confirmed と一致', mapped.facts.whatHappens === confirmedOf('whatHappens')])
  if (mapped.facts.officialInfoNote !== undefined) {
    // 合成版（product.provenance.officialInfoNote が confirmed）か、抽出注意事項（eef）のどちらか
    const composedConfirmed = productCand.provenance.officialInfoNote?.confirmationStatus === 'confirmed' && productCand.provenance.officialInfoNote?.value === mapped.facts.officialInfoNote
    factChecks.push(['officialInfoNote は confirmed（合成版 or 抽出注意事項）', composedConfirmed || mapped.facts.officialInfoNote === confirmedOf('officialInfoNote')])
  }
  if (mapped.facts.venues !== undefined) {
    const eefVenueConfirmed = eef.venuePlace.confirmationStatus === 'confirmed' && !!eef.venuePlace.value
    const prodLocConfirmed = !!productCand.fields.salesLocation && productCand.provenance.salesLocation?.confirmationStatus === 'confirmed'
    const dcVenue = !!baseCand.fields.venue
    factChecks.push(['venues は confirmed 由来（公式ラベル / product.salesLocation / 情報源掲載会場）', eefVenueConfirmed || prodLocConfirmed || dcVenue])
  }
  if (mapped.facts.priceText !== undefined) {
    factChecks.push(['priceText は productExtraction の confirmed な price 由来', !!productCand.fields.price && productCand.provenance.price?.confirmationStatus === 'confirmed'])
  }
  console.log('\n── 独立再検証（confirmed 以外が混じっていないか）──')
  for (const [label, pass] of factChecks) ok(pass, label)
  const factsClean = mapped.factsAllConfirmed && factChecks.every(([, p]) => p)
  // paid（入場無料）を書いていないこと
  ok(!('paid' in mapped.facts), 'paid（入場無料）を facts に入れていない')
  // 完売WS必須項目が facts に無いこと
  ok(!('applyRequired' in mapped.facts) && !('applyDeadline' in mapped.facts), 'application 期間・定員・対象者・所要時間を facts に入れていない')

  // --- 通常経路（createOrUpdateArticleFactsFromCandidate）で差分を出す ---
  const nowMs = now.getTime()
  const endMs = dcLike.eventEndAt ? new Date(dcLike.eventEndAt).getTime() : NaN
  const gate: RegisterGateInput = {
    verdict: 'B',
    verdictReasons: ['マロン確認値: Primary Category=BEAUTY / templateType=sale / 経路=product_news', 'sale mapper で confirmed 事実を自動転記'],
    expired: Number.isFinite(endMs) && endMs < nowMs,
    duplicate: false,
    factKind: 'product_news',
    templateType: HUMAN_TEMPLATE_TYPE,
    primaryCategory: HUMAN_PRIMARY_CATEGORY,
    productExtraction: productCand,
    // 機械のみ draft（人間レビュー履歴なし）の sale mapper 管理下フィールドを最新出力で訂正する。
    // 人間編集の痕跡があれば register 側で自動的に上書きしない。
    refreshManagedFields: true,
  }

  const writes: string[] = []
  const store: ArticleFactsStore = {
    async findByDc(dcId) {
      const res = await payload.find({ collection: 'article-facts', where: { discoveredContent: { equals: dcId } }, limit: 1, depth: 0, overrideAccess: true })
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
        whatHappens: (d.whatHappens as string | null) ?? null,
        officialInfoNote: (d.officialInfoNote as string | null) ?? null,
        priceText: (d.priceText as string | null) ?? null,
        areaLead: (d.areaLead as string | null) ?? null,
        audienceNote: (d.audienceNote as string | null) ?? null,
        hashtags: (d.hashtags as ArticleFactsRow['hashtags']) ?? null,
        primaryCategory: (d.primaryCategory as string | null) ?? null,
        templateType: (d.templateType as ArticleFactsRow['templateType']) ?? null,
        humanReviewedAt: (d.humanReviewedAt as string | null) ?? null,
        humanReviewedBy: (d.humanReviewedBy as ArticleFactsRow['humanReviewedBy']) ?? null,
      }
    },
    async create() {
      throw new Error('ID=4 は既存。create は呼ばれないはず')
    },
    async update(id, data: Partial<ArticleFactsWrite>) {
      if (DRY) throw new Error('DRY-RUN では update を呼ばない')
      const { enrichmentStatus: _drop, ...rest } = data
      void _drop
      const updated = await payload.update({ collection: 'article-facts', id, overrideAccess: true, data: rest as never })
      writes.push(`update id=${id} keys=${Object.keys(rest).join(',')}`)
      return { ...(updated as unknown as ArticleFactsRow), discoveredContent: DC_ID }
    },
  }

  const rr = await createOrUpdateArticleFactsFromCandidate(store, baseCand, gate, { dryRun: DRY, now })
  console.log(`\n── register 結果（通常経路） ──`)
  console.log(`  action=${rr.action}  reason=${rr.reason ?? '-'}  articleFactsId=${rr.articleFactsId ?? '-'}`)
  console.log('  入力前 → 入力後（差分）:')
  for (const d of rr.diff) console.log(`    ${d.field}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`)

  console.log('\n── 検証 ──')
  ok(factsClean, 'facts は confirmed のみ（factsAllConfirmed かつ 独立再検証 PASS）')
  if (DRY) {
    // ID=4 が ready 化された後は register が ready 行に触れない（skipped）＝正しい安全挙動。
    ok(
      rr.action === 'would_update' || rr.action === 'unchanged' || (rr.action === 'skipped' && /ready/.test(rr.reason ?? '')),
      `DRY-RUN: action=${rr.action}（未適用=would_update／適用済み=unchanged／ready 化後=skipped(ready 行は不可触)）`,
    )
    ok(writes.length === 0, 'DRY-RUN: DB 書き込み 0 件')
    // 差分に現れた fact 系フィールドは、すべて mapper の facts（＝confirmed）に一致すること
    const factFieldsInDiff = rr.diff
      .map((d) => d.field.replace(/（.*$/, ''))
      .filter((f) => ['eventName', 'eventDate', 'eventTime', 'venues', 'priceText', 'whatHappens', 'officialInfoNote', 'eventDateISO'].includes(f))
    const allInMapperFacts = factFieldsInDiff.every((f) => (mapped.facts as Record<string, unknown>)[f] !== undefined)
    ok(allInMapperFacts, `差分の事実系フィールド（${factFieldsInDiff.join(', ') || 'なし'}）はすべて mapper.facts（confirmed）に対応`)
    // paid は差分に出ない（入場無料を書かない）
    ok(!rr.diff.some((d) => /^paid/.test(d.field)), 'paid は差分に出ない（入場無料を書かない）')
  } else {
    ok(rr.action === 'updated' || rr.action === 'unchanged', `WRITE: action=${rr.action}（初回 updated / 再実行は冪等に unchanged）`)
    ok(writes.length <= 1, 'WRITE: update は最大 1 回（冪等）')
    const afterDoc = (await payload.findByID({ collection: 'article-facts', id: AF_ID, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    console.log('\n── 入力後（ArticleFacts ID=4）──')
    for (const k of FIELDS) console.log(`  ${k.padEnd(18)}: ${JSON.stringify(afterDoc[k] ?? null)}`)
    console.log(`  enrichmentStatus=${afterDoc.enrichmentStatus}  humanReviewedAt=${JSON.stringify(afterDoc.humanReviewedAt)}  humanReviewedBy=${JSON.stringify(afterDoc.humanReviewedBy)}`)
    console.log(`  notes=${JSON.stringify(afterDoc.notes)}`)
    ok(String(afterDoc.enrichmentStatus) === 'draft', 'enrichmentStatus=draft のまま（ready 化していない）')
    ok(afterDoc.humanReviewedAt == null && afterDoc.humanReviewedBy == null, 'humanReviewed* 未設定（ready 遷移していない）')
    ok(afterDoc.primaryCategory === HUMAN_PRIMARY_CATEGORY && afterDoc.templateType === HUMAN_TEMPLATE_TYPE, 'primaryCategory=BEAUTY / templateType=sale 保持')
    // sale mapper 管理下フィールドは「機械のみ draft」なので最新 mapper 出力へ訂正される（人間編集なし）
    ok(afterDoc.eventName === mapped.facts.eventName && afterDoc.eventName === 'ネイルエス『ホロスコープシリーズ 開幕』', 'eventName が読者向け正規化値へ訂正された')
    ok(afterDoc.eventDate === mapped.facts.eventDate, 'eventDate は mapper 値のまま（変更なし）')
    ok(afterDoc.eventTime === mapped.facts.eventTime && !!afterDoc.eventTime, 'eventTime が confirmed 抽出値で補完された')
    ok(afterDoc.priceText === mapped.facts.priceText && /monochrome library/.test(String(afterDoc.priceText)) && !/monocrome/.test(String(afterDoc.priceText)), 'priceText が monochrome library へ正規化・per-name 形式へ訂正された')
    ok(afterDoc.whatHappens === mapped.facts.whatHappens && !!afterDoc.whatHappens, 'whatHappens が confirmed 抽出値')
    ok(Array.isArray(afterDoc.venues) && (afterDoc.venues as { place: string }[])[0]?.place === mapped.facts.venues?.[0].place, 'venues が confirmed 会場')
    ok(afterDoc.officialInfoNote === mapped.facts.officialInfoNote && /EC予約受付/.test(String(afterDoc.officialInfoNote)) && /記念ワークショップは完売しています/.test(String(afterDoc.officialInfoNote)), 'officialInfoNote が合成版（販売スケジュール＋購入特典＋WS完売＋会期注記）へ訂正された')
    ok(afterDoc.paid == null || afterDoc.paid === 'unknown', 'paid は自動確定しない（入場無料を書かない）')
    // 候補（事実ではない）が最新規則へ訂正されたこと
    ok(afterDoc.areaLead === mapped.candidates.areaLead && afterDoc.areaLead === '銀座 蔦屋書店の文具売り場で、9月4日から、星座をモチーフにしたネイルのフェアが始まります。', 'areaLead 候補が新規則（店/フロア＋開始日＋テーマ＋名詞）へ訂正された')
    ok(afterDoc.audienceNote === mapped.candidates.audienceNote && afterDoc.audienceNote === '星座やネイルを楽しみながら、季節の変わり目に指先から気分を整えたい方へ。', 'audienceNote 候補が新規則へ訂正された')
    ok(
      JSON.stringify((afterDoc.hashtags as { tag: string }[]).map((h) => h.tag)) === JSON.stringify(['#銀座', '#銀座蔦屋書店', '#GINZASIX', '#ネイルエス', '#ホロスコープシリーズ']),
      'hashtags 候補が新規則（#銀座＋施設＋#ネイルエス＋#ホロスコープシリーズ）へ訂正された',
    )
    ok(typeof afterDoc.notes === 'string' && (afterDoc.notes as string).includes('[auto:sale-mapper') && (afterDoc.notes as string).includes('表記ゆれを正規化: monocrome library→monochrome library'), 'notes に候補注記＋表記ゆれ正規化メモが付いた')

    // ready ゲート：mapper で confirmed 事実が揃ったため eligible になりうるが、
    // enrichmentStatus は draft のまま（ready 化は人間の判断。このスクリプトは行わない）。
    const g = evaluateReadyGate(
      {
        templateType: 'sale',
        contentTitle: afterDoc.eventName as string | null,
        contentSummary: afterDoc.whatHappens as string | null,
        availablePeriod: afterDoc.eventDate as string | null,
        priceText: afterDoc.priceText as string | null,
        officialInfoNote: afterDoc.officialInfoNote as string | null,
        eventDateISO: afterDoc.eventDateISO as string | null,
        hashtags: (afterDoc.hashtags as { tag: string }[]) ?? [],
        sourceProvenanceFacts: (afterDoc.sourceProvenanceFacts as { fact: string; verificationStatus: string }[]) ?? [],
      },
      'sale',
      { now },
    )
    console.log(`\n  sale ready ゲート: eligible=${g.eligible}  未充足=${JSON.stringify(g.missing)}`)
    ok(String(afterDoc.enrichmentStatus) === 'draft', 'ready ゲートが eligible でも enrichmentStatus は draft のまま（自動 ready 化しない）')
  }

  console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅' : `FAIL ❌（${fail}）`} ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
