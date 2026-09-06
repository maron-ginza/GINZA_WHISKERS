// GINZA WHISKERS / Project 02（2026-09-06）— 候補レビュー資料（読み取り専用・1コマンド完結）
//
// `./p2 candidate-review <dcId...> [--no-fetch] [--json]`
//
// 指定した DiscoveredContent ID（複数可）について、人間レビューに必要な情報を **1回の実行**で
// まとめて確認する：
//   ・候補詳細（discovered-content）
//   ・ArticleFacts（draft/ready 問わず）・hashtags
//   ・既存 Articles の editorialProvenance との重複判定（dedupCheck.ts を再利用）
//   ・.devlogs/night/queue（note-draft.json / note-body.txt）との重複判定（同上）
//   ・直近記事の施設・情報源の偏り（loadArticleRecords 由来の集計）
//   ・当日の公式ページ再取得（既定 ON。--no-fetch で無効化。SSRF ガード付き fetchOfficialSignals を再利用）
//     → HTTP 403 等で取得できない場合は「未確認」と明記する（推測補完しない）
//   ・20代後半〜30代女性への適合理由・GINZA WHISKERS独自の切り口（buildEditorialBrief を再利用）
//
// 【安全】DB 書き込みなし・AI 呼び出しなし・ready 化なし・記事作成なし・公開なし・
//   note/Chrome/X 操作なし・push なし。外部通信は公式ページへの通常 HTTP GET のみ
//   （fetchOfficialSignals の許可ドメイン・SSRF ガードに従う）。

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPayload } from 'payload'

import config from '../payload.config'
import { assessCandidate } from '../lib/morning/assessCandidate'
import { buildEditorialBrief } from '../lib/morning/buildEditorialBrief'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { classifyTemplateType } from '../lib/morning/classifyTemplateType'
import { dedupCheck, type DedupArticleRecord, type DedupNoteRecord } from '../lib/morning/dedupCheck'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { extractProductNewsFactsCandidate } from '../lib/morning/extractProductNewsFacts'
import { extractPriceHint } from '../lib/morning/extractPriceHint'
import { fetchOfficialSignals, isAllowedHost } from '../lib/morning/fetchOfficialSignals'
import type { OfficialPageSignals } from '../lib/morning/types'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import { deriveProvisionalCategory } from '../lib/pipeline/provisionalCategory'
import type { ArticleFactsLike, DiscoveredContentLike } from '../lib/template/mapDiscoveredContentToEventFields'

interface Args {
  dcIds: number[]
  fetch: boolean
  json: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const dcIds = argv
    .filter((a) => /^\d+$/.test(a))
    .map((a) => Number(a))
    .filter((n) => Number.isInteger(n) && n > 0)
  return {
    dcIds: [...new Set(dcIds)],
    fetch: !argv.includes('--no-fetch'),
    json: argv.includes('--json'),
  }
}

// ── Payload doc → プレーン値（morningRun.ts の toDcLike/toFactsLike と同型。
//    候補レビューは読み取り専用の別経路のため、依存を増やさずここに複製する） ──
function toDcLike(dc: Record<string, unknown>): DiscoveredContentLike {
  const ss = dc.sourceSite
  const sourceSiteName =
    ss && typeof ss === 'object'
      ? ((ss as { name?: string | null }).name ?? null)
      : ((ss as string | null) ?? null)
  return {
    id: dc.id as number,
    title: (dc.title as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    articleUrl: (dc.articleUrl as string | null) ?? null,
    sourceSiteName,
    publishedAt: (dc.publishedAt as string | null) ?? null,
    contentUpdatedAt: (dc.contentUpdatedAt as string | null) ?? null,
    eventStartAt: (dc.eventStartAt as string | null) ?? null,
    eventEndAt: (dc.eventEndAt as string | null) ?? null,
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    uxType: (dc.uxType as string | null) ?? null,
    lastCheckedAt: (dc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dc.detectedAt as string | null) ?? null,
    dateExtraction: (dc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }
}

function toFactsLike(f: Record<string, unknown> | undefined): ArticleFactsLike | undefined {
  if (!f) return undefined
  const g = <T = unknown>(k: string): T => f[k] as T
  return {
    enrichmentStatus: g<string | null>('enrichmentStatus') ?? null,
    season: g<string | null>('season') ?? null,
    eventName: g<string | null>('eventName') ?? null,
    editionLabel: g<string | null>('editionLabel') ?? null,
    theme: g<string | null>('theme') ?? null,
    whatHappens: g<string | null>('whatHappens') ?? null,
    eventDate: g<string | null>('eventDate') ?? null,
    eventDateISO: g<string | null>('eventDateISO') ?? null,
    eventTime: g<string | null>('eventTime') ?? null,
    venues: g<ArticleFactsLike['venues']>('venues') ?? null,
    areaLead: g<string | null>('areaLead') ?? null,
    audienceNote: g<string | null>('audienceNote') ?? null,
    paid: g<string | null>('paid') ?? null,
    applyRequired: g<string | null>('applyRequired') ?? null,
    applyDeadline: g<string | null>('applyDeadline') ?? null,
    resultDate: g<string | null>('resultDate') ?? null,
    resultRule: g<string | null>('resultRule') ?? null,
    applyRule: g<string | null>('applyRule') ?? null,
    officialInfoNote: g<string | null>('officialInfoNote') ?? null,
    editorsNoteSeed: g<string | null>('editorsNoteSeed') ?? null,
    closing: g<string | null>('closing') ?? null,
    callToAction: g<string | null>('callToAction') ?? null,
    hashtags: g<ArticleFactsLike['hashtags']>('hashtags') ?? null,
    sourceProvenanceFacts: g<ArticleFactsLike['sourceProvenanceFacts']>('sourceProvenanceFacts') ?? null,
  }
}

async function buildSourceLedgerMaps(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<{ allowedHosts: string[]; typeById: Map<number, string> }> {
  const hosts = new Set<string>()
  const typeById = new Map<number, string>()
  try {
    const res = await payload.find({ collection: 'source-ledger', limit: 200, depth: 0, overrideAccess: true })
    for (const d of res.docs as unknown as Array<Record<string, unknown>>) {
      const u = d.url
      if (typeof u === 'string') {
        try {
          hosts.add(new URL(u).hostname.toLowerCase())
        } catch {
          /* skip */
        }
      }
      const st = d.sourceType ?? d.source_type
      if (typeof d.id === 'number' && typeof st === 'string') typeById.set(d.id, st)
    }
  } catch {
    /* コレクション未定義でも継続（＝許可リスト空＝全 URL 拒否） */
  }
  return { allowedHosts: [...hosts], typeById }
}

/** 全 Article を dedup／偏り集計用の軽量レコードへ（title + editorialProvenance の dcId/sourceUrl） */
async function loadArticleRecords(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<DedupArticleRecord[]> {
  const out: DedupArticleRecord[] = []
  const res = await payload.find({
    collection: 'articles',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    locale: 'ja',
    sort: '-id',
  })
  for (const a of res.docs as unknown as Array<Record<string, unknown>>) {
    const prov = Array.isArray(a.editorialProvenance) ? (a.editorialProvenance as Array<Record<string, unknown>>) : []
    const dcIds: number[] = []
    const urls: string[] = []
    for (const p of prov) {
      const dcId = Number(p.discoveredContentSource)
      if (Number.isInteger(dcId) && dcId > 0) dcIds.push(dcId)
      if (typeof p.sourceUrl === 'string') urls.push(p.sourceUrl)
    }
    out.push({
      id: Number(a.id),
      title: (a.title as string | null) ?? null,
      provenanceDcIds: [...new Set(dcIds)],
      provenanceSourceUrls: [...new Set(urls)],
      eventDates: [],
      venueHints: [],
    })
  }
  return out
}

/** .devlogs/night/queue 配下の note-draft.json / note-body.txt を dedup 用レコードへ（ローカル記録のみ） */
function buildNoteRecords(): DedupNoteRecord[] {
  const recs: DedupNoteRecord[] = []
  const root = resolve(process.cwd(), '..', '.devlogs', 'night', 'queue')
  if (!existsSync(root)) return recs
  try {
    for (const d of readdirSync(root)) {
      let entries: string[]
      try {
        entries = readdirSync(resolve(root, d))
      } catch {
        continue
      }
      for (const e of entries) {
        const dir = resolve(root, d, e)
        const draftPath = resolve(dir, 'note-draft.json')
        const bodyPath = resolve(dir, 'note-body.txt')
        let draftTitle: string | null = null
        let draftDcId: number | null = null
        let sourceUrls: string[] = []
        let published = false
        if (existsSync(draftPath)) {
          try {
            const j = JSON.parse(readFileSync(draftPath, 'utf8')) as Record<string, unknown>
            draftTitle = (j.title as string | null) ?? null
            const id = Number(j.discoveredContentId)
            draftDcId = Number.isInteger(id) && id > 0 ? id : null
            published = j.status === 'published' || j.publishRecord != null
            const links = j.links as Record<string, unknown> | undefined
            const su = links?.sourceUrls
            if (Array.isArray(su)) sourceUrls = su.filter((x): x is string => typeof x === 'string')
            else if (typeof j.sourceUrl === 'string') sourceUrls = [j.sourceUrl]
          } catch {
            /* skip */
          }
          recs.push({
            path: `.devlogs/night/queue/${d}/${e}/note-draft.json`,
            kind: 'note-draft',
            discoveredContentId: draftDcId,
            title: draftTitle,
            sourceUrls,
            eventDate: null,
            venue: null,
            published,
          })
        }
        if (existsSync(bodyPath)) {
          let firstLine: string | null = null
          try {
            firstLine = readFileSync(bodyPath, 'utf8').split('\n').map((s) => s.trim()).find(Boolean) ?? null
          } catch {
            /* skip */
          }
          recs.push({
            path: `.devlogs/night/queue/${d}/${e}/note-body.txt`,
            kind: 'note-body',
            discoveredContentId: draftDcId,
            title: firstLine ?? draftTitle,
            sourceUrls,
            eventDate: null,
            venue: null,
            published,
          })
        }
      }
    }
  } catch {
    /* ディレクトリ走査失敗でも継続（0件扱い） */
  }
  return recs
}

interface FacilityTally {
  label: string
  count: number
}

function tallyRecentFacilities(articleRecords: DedupArticleRecord[], limit: number): FacilityTally[] {
  const tally = new Map<string, number>()
  for (const rec of articleRecords.slice(0, limit)) {
    const fk = resolveFacilityKey({ sourceUrl: rec.provenanceSourceUrls[0] ?? null, title: rec.title })
    const label = fk.store || fk.area || '(施設不明)'
    tally.set(label, (tally.get(label) ?? 0) + 1)
  }
  return [...tally.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

interface ReviewDossier {
  discoveredContentId: number
  found: boolean
  title: string
  displayTitle: string
  sourceName: string
  sourceUrl: string
  venue: string | null
  excerpt: string | null
  publishedAt: string | null
  eventPeriod: string
  verifiedAt: string | null
  factKind: string
  templateType: string
  officialFetchAttempted: boolean
  officialFetchOk: boolean
  officialFetchDetail: string
  price: string
  productOrEventName: string
  purchaseConditions: string
  missingItems: string[]
  conflicts: string[]
  dedupDuplicate: boolean
  dedupPossible: boolean
  dedupSignals: string[]
  facilityLabel: string
  facilityRecentCount: number
  category: string | null
  targetFitReason: string
  ginzaWhiskersAngle: string
  recommendation: string
  recommendationReason: string
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (args.dcIds.length === 0) {
    console.error('Usage: ./p2 candidate-review <dcId...> [--no-fetch] [--json]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const now = new Date()

  const { allowedHosts, typeById: sourceLedgerTypeById } = await buildSourceLedgerMaps(payload)
  const articleRecords = await loadArticleRecords(payload)
  const noteRecords = buildNoteRecords()
  const recentFacilityTally = tallyRecentFacilities(articleRecords, 15)

  const dossiers: ReviewDossier[] = []

  for (const dcId of args.dcIds) {
    try {
      const dcRes = await payload.find({
        collection: 'discovered-content',
        where: { id: { equals: dcId } },
        limit: 1,
        depth: 1,
        overrideAccess: true,
      })
      const raw = dcRes.docs[0] as unknown as Record<string, unknown> | undefined
      if (!raw) {
        dossiers.push({
          discoveredContentId: dcId,
          found: false,
          title: '',
          displayTitle: `DC #${dcId}（見つかりません）`,
          sourceName: '',
          sourceUrl: '',
          venue: null,
          excerpt: null,
          publishedAt: null,
          eventPeriod: '不明',
          verifiedAt: null,
          factKind: 'unknown',
          templateType: 'unknown',
          officialFetchAttempted: false,
          officialFetchOk: false,
          officialFetchDetail: '対象 DiscoveredContent が見つからないため取得していません',
          price: '確認できません',
          productOrEventName: '確認できません',
          purchaseConditions: '確認できません',
          missingItems: [],
          conflicts: [],
          dedupDuplicate: false,
          dedupPossible: false,
          dedupSignals: [],
          facilityLabel: '(不明)',
          facilityRecentCount: 0,
          category: null,
          targetFitReason: '',
          ginzaWhiskersAngle: '',
          recommendation: '確認不能',
          recommendationReason: `DC #${dcId} は discovered-content に存在しません`,
        })
        continue
      }

      const factsRes = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: dcId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown> | undefined
      const dcLike = toDcLike(raw)
      const facts = toFactsLike(factsDoc)

      const dr = dedupCheck(
        {
          id: dcId,
          articleUrl: dcLike.articleUrl ?? null,
          title: dcLike.title ?? null,
          eventStartAt: dcLike.eventStartAt ?? null,
          venue: dcLike.venue ?? null,
        },
        articleRecords,
        noteRecords,
      )
      const dedup = {
        duplicate: dr.duplicate,
        possibleDuplicate: dr.possibleDuplicate,
        existingArticleId: dr.existingArticleId,
        notePublished: dr.signals.some((s) => s.type.startsWith('note-record') && s.strong) || undefined,
        signalSummary: dr.signals.map((s) => s.detail),
        externalUnverified: true,
      }

      let dcHost = ''
      try {
        if (dcLike.articleUrl) dcHost = new URL(dcLike.articleUrl).hostname.toLowerCase()
      } catch {
        /* skip */
      }
      const trustedSource = dcHost !== '' && isAllowedHost(dcHost, allowedHosts)

      let signals: OfficialPageSignals | null = null
      let fetchDetail = '未試行（--no-fetch）'
      if (args.fetch && dcLike.articleUrl) {
        try {
          signals = await fetchOfficialSignals(dcLike.articleUrl, { allowedHosts })
        } catch (e) {
          signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }
        }
        if (signals.ok) fetchDetail = `成功（HTTP ${signals.httpStatus ?? 200}・${signals.fetchedAt}）`
        else if (signals.rejectedReason) fetchDetail = `未確認（取得せず: ${signals.rejectedReason}）`
        else if (signals.httpStatus) fetchDetail = `未確認（HTTP ${signals.httpStatus}）`
        else fetchDetail = `未確認（${signals.error ?? '取得エラー'}）`
      } else if (!dcLike.articleUrl) {
        fetchDetail = '未試行（公式URLなし）'
      }

      const classification = classifyFactKind({
        contentType: (raw.contentType as string | null) ?? dcLike.contentType ?? null,
        uxType: (raw.uxType as string | null) ?? dcLike.uxType ?? null,
        title: dcLike.title ?? null,
        excerpt: dcLike.excerpt ?? null,
        sourceType: sourceLedgerTypeById.get(Number(raw.sourceSite ?? (raw as Record<string, unknown>).source_site_id)) ?? null,
        officialSignals: signals,
      })
      const factKind = classification.factKind

      const a = assessCandidate({ dc: dcLike, facts, dedup, imageInventory: [], now, factKind })

      const templateTypeCls = classifyTemplateType({
        factKind,
        contentType: (raw.contentType as string | null) ?? dcLike.contentType ?? null,
        uxType: (raw.uxType as string | null) ?? dcLike.uxType ?? null,
        title: dcLike.title ?? null,
        excerpt: dcLike.excerpt ?? null,
      })

      let productOrEventName = '確認できません'
      let purchaseConditions = '確認できません'
      const missingItems: string[] = [...a.missing]
      const conflicts: string[] = []

      if (factKind === 'event') {
        const ext = extractArticleFactsCandidate({ dc: dcLike, image: a.image, officialSignals: signals, trustedSource })
        productOrEventName = ext.extractedEventFacts.eventName.value ?? '確認できません'
        purchaseConditions = ext.fields.applyDeadline ?? '確認できません（申込条件は公式で要確認）'
        missingItems.push(...ext.missingRequired)
        conflicts.push(...ext.conflicts)
      } else if (factKind === 'product_news') {
        const ext = extractProductNewsFactsCandidate({ dc: dcLike, image: a.image, officialSignals: signals, trustedSource })
        productOrEventName = ext.fields.productName ?? '確認できません（excerptに記載がある場合も推測抽出しない）'
        purchaseConditions = ext.fields.purchaseConditions ?? '確認できません（公式で要確認）'
        missingItems.push(...ext.unknownItems)
        conflicts.push(...ext.conflicts)
      }

      // ── 会期の抽出根拠を直接点検（extract*Candidate の conflicts 判定に依らない・
      //    2026-09-06追加：複数記事が並ぶ集約ページで body_label 抽出が別記事の会期を
      //    拾っている可能性を、DiscoveredContent.dateExtraction の confidence/source から
      //    直接検出する。excerpt のノイズで extract*Candidate 側の判定が働かない場合の保険） ──
      const startExtraction = dcLike.dateExtraction?.eventStartAt
      const endExtraction = dcLike.dateExtraction?.eventEndAt
      if (
        (startExtraction?.source === 'body_label' && startExtraction.confidence !== 'high') ||
        (endExtraction?.source === 'body_label' && endExtraction.confidence !== 'high')
      ) {
        conflicts.push(
          `開催・販売期間の抽出根拠が「body_label」由来・信頼度${startExtraction?.confidence ?? endExtraction?.confidence ?? '不明'}——` +
            '複数の記事・催事が並ぶ集約ページ（GINZA SIX等）では、別記事の会期を誤って拾っている可能性があり、この期間は未確認として扱う',
        )
      }

      const price = signals?.ok
        ? (extractPriceHint(signals.bodyText).price ?? '確認できません（本文取得済みだが料金表記を検出できず）')
        : `確認できません（${fetchDetail}）`

      const facility = resolveFacilityKey({
        venue: dcLike.venue,
        sourceName: dcLike.sourceSiteName,
        sourceUrl: dcLike.articleUrl,
        title: dcLike.title,
      })
      const category = deriveProvisionalCategory({
        primaryCategory: (factsDoc?.primaryCategory as string | null) ?? null,
        title: dcLike.title,
        venue: dcLike.venue,
        templateType: templateTypeCls.templateType,
        contentType: dcLike.contentType,
      })

      const facilityLabel = facility.store || facility.area || '(不明)'
      const facilityRecentCount = recentFacilityTally.find((t) => t.label === facilityLabel)?.count ?? 0

      const brief = buildEditorialBrief({
        displayTitle: a.displayTitle,
        venue: dcLike.venue ?? null,
        eventPeriod: a.eventPeriod,
        templateType: templateTypeCls.templateType,
        category: category.category,
        contentType: dcLike.contentType,
        uxType: dcLike.uxType,
      })

      // ── 採用・見送りの推奨（決定的ヒューリスティック。マロンの最終判断を代替しない） ──
      let recommendation: string
      let recommendationReason: string
      if (dedup.duplicate) {
        recommendation = '見送り推奨（既出重複）'
        recommendationReason = '既存Articleまたはnote queueとの重複シグナルが強く検出されたため'
      } else if (conflicts.length > 0) {
        recommendation = '見送り推奨（要再確認）'
        recommendationReason = `日付・会場等に矛盾の疑いあり: ${conflicts.slice(0, 2).join(' / ')}`
      } else if (!a.hasTraceableSource || !a.ginzaRelevant) {
        recommendation = '見送り推奨'
        recommendationReason = a.reasons.join(' / ')
      } else if (missingItems.length > 0) {
        recommendation = '要確認（人間が不足項目を確定すればA化検討）'
        recommendationReason = `不足項目: ${missingItems.slice(0, 4).join(' / ')}`
      } else {
        recommendation = '採用検討可'
        recommendationReason = '必須項目・重複・銀座関連性のいずれも問題を検出せず'
      }

      dossiers.push({
        discoveredContentId: dcId,
        found: true,
        title: a.title,
        displayTitle: a.displayTitle,
        sourceName: a.sourceName,
        sourceUrl: a.sourceUrl,
        venue: dcLike.venue ?? null,
        excerpt: dcLike.excerpt ?? null,
        publishedAt: dcLike.publishedAt ?? null,
        eventPeriod: a.eventPeriod,
        verifiedAt: a.verifiedAt ?? null,
        factKind,
        templateType: templateTypeCls.templateType,
        officialFetchAttempted: args.fetch && !!dcLike.articleUrl,
        officialFetchOk: !!signals?.ok,
        officialFetchDetail: fetchDetail,
        price,
        productOrEventName,
        purchaseConditions,
        missingItems: [...new Set(missingItems)],
        conflicts,
        dedupDuplicate: dr.duplicate,
        dedupPossible: dr.possibleDuplicate,
        dedupSignals: dr.signals.map((s) => s.detail),
        facilityLabel,
        facilityRecentCount,
        category: category.category,
        targetFitReason: brief.targetFitReason,
        ginzaWhiskersAngle: brief.ginzaWhiskersAngle,
        recommendation,
        recommendationReason,
      })
    } catch (e) {
      dossiers.push({
        discoveredContentId: dcId,
        found: false,
        title: '',
        displayTitle: `DC #${dcId}（処理エラー）`,
        sourceName: '',
        sourceUrl: '',
        venue: null,
        excerpt: null,
        publishedAt: null,
        eventPeriod: '不明',
        verifiedAt: null,
        factKind: 'unknown',
        templateType: 'unknown',
        officialFetchAttempted: false,
        officialFetchOk: false,
        officialFetchDetail: '処理エラーのため未試行',
        price: '確認できません',
        productOrEventName: '確認できません',
        purchaseConditions: '確認できません',
        missingItems: [],
        conflicts: [],
        dedupDuplicate: false,
        dedupPossible: false,
        dedupSignals: [],
        facilityLabel: '(不明)',
        facilityRecentCount: 0,
        category: null,
        targetFitReason: '',
        ginzaWhiskersAngle: '',
        recommendation: '確認不能',
        recommendationReason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const text = renderDossiers(dossiers, recentFacilityTally)

  const outDir = resolve(process.cwd(), '..', '.devlogs', 'morning', 'candidate-review')
  try {
    mkdirSync(outDir, { recursive: true })
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    const base = `${stamp}_${args.dcIds.join('-')}`
    writeFileSync(resolve(outDir, `${base}.txt`), text)
    writeFileSync(resolve(outDir, `${base}.json`), JSON.stringify({ generatedAt: now.toISOString(), dossiers, recentFacilityTally }, null, 2))
  } catch {
    /* 保存に失敗してもコンソール出力は継続 */
  }

  if (args.json) {
    console.log(JSON.stringify({ generatedAt: now.toISOString(), dossiers, recentFacilityTally }))
  } else {
    console.log(text)
  }
  process.exit(0)
}

function line(s = ''): string {
  return s + '\n'
}

function renderDossiers(dossiers: ReviewDossier[], recentFacilityTally: FacilityTally[]): string {
  let s = ''
  s += line('════════════════════════════════════════════════')
  s += line('  Project 02 — 候補レビュー資料（読み取り専用・1コマンド完結）')
  s += line(`  生成: ${new Date().toISOString()}`)
  s += line('════════════════════════════════════════════════')
  s += line()
  s += line('■ 直近記事の施設・情報源の偏り（直近15件、代表ソースの集計）')
  if (recentFacilityTally.length === 0) s += line('  データなし')
  else recentFacilityTally.forEach((t) => (s += line(`  ${t.label}: ${t.count}件`)))

  dossiers.forEach((d, i) => {
    s += line()
    s += line('────────────────────────────────────────────────')
    s += line(`【候補 ${i + 1}】 DC #${d.discoveredContentId}`)
    if (!d.found) {
      s += line(`  ${d.displayTitle}`)
      s += line(`  推奨: ${d.recommendation}（${d.recommendationReason}）`)
      return
    }
    s += line(`  タイトル      : ${d.displayTitle}`)
    s += line(`  概要          : ${d.excerpt ? d.excerpt.slice(0, 200) : '確認できません'}${d.excerpt && d.excerpt.length > 200 ? '…' : ''}`)
    s += line(`  会場          : ${d.venue ?? '確認できません'}`)
    s += line(`  開催・販売期間: ${d.eventPeriod}`)
    if (d.conflicts.length) s += line(`  ⚠ 期間等の矛盾疑い: ${d.conflicts.join(' / ')}`)
    s += line(`  商品名／イベント名: ${d.productOrEventName}`)
    s += line(`  価格          : ${d.price}`)
    s += line(`  販売条件      : ${d.purchaseConditions}`)
    s += line(`  一次情報URL   : ${d.sourceUrl || '確認できません'}（情報源: ${d.sourceName}）`)
    s += line(`  情報確認日時  : ${d.verifiedAt ?? '確認できません'}`)
    s += line(`  公開日        : ${d.publishedAt ?? '確認できません'}`)
    s += line(`  本日の一次情報再取得: ${d.officialFetchAttempted ? (d.officialFetchOk ? '成功' : `失敗・未確認（${d.officialFetchDetail}）`) : '未試行'}`)
    s += line(`  記事タイプ／テンプレ: ${d.factKind} / ${d.templateType}`)
    s += line(`  カテゴリー／施設: ${d.category ?? '未確定'} ／ ${d.facilityLabel}（直近15件中 ${d.facilityRecentCount} 件が同一施設）`)
    s += line(`  未確認項目    : ${d.missingItems.length ? d.missingItems.slice(0, 8).join(' / ') : 'なし'}`)
    s += line('  ── 重複・偏り ──')
    s += line(`    既存Articles/note queueとの重複: ${d.dedupDuplicate ? '重複あり' : d.dedupPossible ? '疑いあり（弱シグナル）' : '重複なし'}`)
    if (d.dedupSignals.length) d.dedupSignals.forEach((sig) => (s += line(`      ・${sig}`)))
    s += line('  ── 20代後半〜30代女性への適合理由 ──')
    s += line(`    ${d.targetFitReason}`)
    s += line('  ── GINZA WHISKERS独自の切り口 ──')
    s += line(`    ${d.ginzaWhiskersAngle}`)
    s += line(`  採用・見送りの推奨: ${d.recommendation}`)
    s += line(`    理由: ${d.recommendationReason}`)
  })

  s += line()
  s += line('（このレビュー資料は読み取り専用です。DB書き込み・AI呼び出し・ready化・記事作成・')
  s += line(' 公開・note/Chrome/X操作は一切行っていません。当日の一次情報再取得が失敗した項目は')
  s += line(' 「確認できません」と明記し、推測では補完していません。最終判断はマロンが行ってください。）')
  return s
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
