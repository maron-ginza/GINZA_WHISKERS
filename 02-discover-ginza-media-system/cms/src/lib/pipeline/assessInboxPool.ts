// GINZA WHISKERS / Project 02（2026-09-04、候補選定の上流接続修正）
//
// `./p2 themes recommend` の入力を「承諾済み（approved）」から「承諾前（inbox）」へ
// 直す。morning のオーケストレーター（morningRun.ts）は approved 専用のため触らず、
// ここで **read-only** の候補評価を inbox プールに対して行う。
//
//   ・DB 書き込みなし・公式ページ fetch なし（officialSignals=null で決定的抽出のみ）
//   ・morning と同じ純粋ヘルパーを再利用（classifyFactKind / assessCandidate /
//     classifyTemplateType / extractArticleFactsCandidate / buildTemplatePrecheck）
//   ・重複判定は「既に Article(editorialProvenance) 化済みの DC」を強シグナルとして扱う
//     （dedupCheck の全機構は使わず、選定に十分な最小版）
//   ・出力は selectRecommendedThemes が食える ThemeCandidate[]

import type { Payload } from 'payload'

import { assessCandidate } from '../morning/assessCandidate'
import { classifyFactKind } from '../morning/classifyFactKind'
import { classifyTemplateType } from '../morning/classifyTemplateType'
import { extractArticleFactsCandidate } from '../morning/extractArticleFactsCandidate'
import { extractProductNewsFactsCandidate } from '../morning/extractProductNewsFacts'
import { buildTemplatePrecheck } from '../morning/templatePrecheck'
import { extractExplicitPeriod, periodFromUrlSlug } from './extractExplicitPeriod'
import { getOrComputeCrossCulture } from '../crossCulture'
import { computeTargetFitScore, sourceTypeOf } from './targetFitScore'
import { deriveProvisionalCategory } from './provisionalCategory'
import { resolveFacilityKey } from '../curation/facilityKey'
import type {
  ArticleFactsLike,
  DiscoveredContentLike,
} from '../template/mapDiscoveredContentToEventFields'
import type { ThemeCandidate } from './selectRecommendedThemes'

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

/**
 * 開催・販売期間の抽出信頼度（2026-09-06追加・根本改善）。
 * DiscoveredContent.dateExtraction（クローラー時点の抽出根拠）の
 * eventStartAt/eventEndAt のうち、値がある方の confidence を見て、
 * どちらかが 'medium'/'low' なら低い方を採用する（body_label等・要確認）。
 * dateExtraction が無い（＝ assessInboxPool 側のフォールバック——タイトル/URL
 * スラッグ/公開日から補完した日付）場合は、候補自身の情報から直接得た値のため
 * 'high' とみなす（別記事混入のリスクがある body_label 経由ではないため）。
 * 日付そのものが無ければ null（temporalUnknown 側で扱う・対象外）。
 */
function deriveEventDateConfidence(
  hasDates: boolean,
  dateExtraction: DiscoveredContentLike['dateExtraction'],
): 'high' | 'medium' | 'low' | null {
  if (!hasDates) return null
  const rank = { high: 3, medium: 2, low: 1 } as const
  const vals = [dateExtraction?.eventStartAt?.confidence, dateExtraction?.eventEndAt?.confidence].filter(
    (v): v is 'high' | 'medium' | 'low' => v === 'high' || v === 'medium' || v === 'low',
  )
  if (vals.length === 0) return 'high'
  return vals.reduce((worst, v) => (rank[v] < rank[worst] ? v : worst))
}

function toFactsLike(f: Record<string, unknown> | undefined): ArticleFactsLike | undefined {
  if (!f) return undefined
  const g = <T = unknown>(k: string): T => f[k] as T
  return {
    enrichmentStatus: g<string | null>('enrichmentStatus') ?? null,
    templateType: g<string | null>('templateType') ?? null,
    primaryCategory: g<string | null>('primaryCategory') ?? null,
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
    officialInfoNote: g<string | null>('officialInfoNote') ?? null,
    priceText: g<string | null>('priceText') ?? null,
    hashtags: g<ArticleFactsLike['hashtags']>('hashtags') ?? null,
    sourceProvenanceFacts: g<ArticleFactsLike['sourceProvenanceFacts']>('sourceProvenanceFacts') ?? null,
  }
}

export interface AssessInboxPoolOptions {
  now?: Date
  /** 評価対象の curationStatus（既定 ['inbox']） */
  statuses?: string[]
  /** 上限件数（既定 200。detectedAt 降順） */
  limit?: number
}

export interface AssessInboxPoolResult {
  collectedTotal: number // 対象 status の DC 総数（DB）
  assessed: number // 実際に評価した件数（limit 内）
  candidates: ThemeCandidate[]
  abcCounts: { A: number; B: number; C: number }
}

export async function assessInboxPool(
  payload: Payload,
  opts: AssessInboxPoolOptions = {},
): Promise<AssessInboxPoolResult> {
  const now = opts.now ?? new Date()
  const statuses = opts.statuses ?? ['inbox']
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 200))

  const dcRes = await payload.find({
    collection: 'discovered-content',
    where: { curationStatus: { in: statuses } },
    limit,
    depth: 1,
    overrideAccess: true,
    sort: '-detectedAt',
  })
  const collectedTotalRes = await payload.count({
    collection: 'discovered-content',
    where: { curationStatus: { in: statuses } },
    overrideAccess: true,
  })

  const docs = dcRes.docs as unknown as Record<string, unknown>[]
  const ids = docs.map((d) => Number(d.id))

  // ArticleFacts（対象 DC 分）
  const afByDc = new Map<number, Record<string, unknown>>()
  if (ids.length) {
    const afRes = await payload.find({
      collection: 'article-facts',
      where: { discoveredContent: { in: ids } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    for (const f of afRes.docs as unknown as Record<string, unknown>[]) {
      const ref = f.discoveredContent
      const dcId = typeof ref === 'object' && ref !== null ? Number((ref as { id?: number }).id) : Number(ref)
      if (Number.isFinite(dcId)) afByDc.set(dcId, f)
    }
  }

  // 既に Article 化済みの DC（強い重複シグナル）
  const draftedDcIds = new Set<number>()
  {
    const artRes = await payload.find({
      collection: 'articles',
      where: { 'editorialProvenance.discoveredContentSource': { in: ids.length ? ids : [-1] } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    for (const a of artRes.docs as unknown as Record<string, unknown>[]) {
      const prov = Array.isArray(a.editorialProvenance) ? (a.editorialProvenance as Record<string, unknown>[]) : []
      for (const p of prov) {
        const src = Number(p.discoveredContentSource)
        if (Number.isFinite(src)) draftedDcIds.add(src)
      }
    }
  }

  // 画像在庫（assessCandidate の imagePreflight 用）
  const imageInventory: string[] = []
  try {
    const imgRes = await payload.find({ collection: 'image-assets', limit: 500, depth: 0, overrideAccess: true })
    for (const d of imgRes.docs as unknown as Record<string, unknown>[]) {
      if (typeof d.filename === 'string') imageInventory.push(d.filename.toLowerCase())
      if (typeof d.altText === 'string') imageInventory.push(d.altText.toLowerCase())
    }
  } catch {
    /* image-assets が無くても継続 */
  }

  // SOURCE LEDGER の sourceType（classifyFactKind の補助）
  const sourceTypeById = new Map<number, string>()
  try {
    const slRes = await payload.find({ collection: 'source-ledger', limit: 300, depth: 0, overrideAccess: true })
    for (const d of slRes.docs as unknown as Record<string, unknown>[]) {
      const st = d.sourceType ?? d.source_type
      if (typeof d.id === 'number' && typeof st === 'string') sourceTypeById.set(d.id, st)
    }
  } catch {
    /* skip */
  }

  // 直近の採用状況（category_diversity / venue_diversity の履歴ペナルティ用）。
  // 直近 approved の DiscoveredContent＋その ArticleFacts の primaryCategory・施設キーを集計。
  const catHist = new Map<string, number>()
  const facHist = new Map<string, number>()
  try {
    const recentApproved = await payload.find({
      collection: 'discovered-content',
      where: { curationStatus: { equals: 'approved' } },
      sort: '-updatedAt',
      limit: 20,
      depth: 1,
      overrideAccess: true,
    })
    const rIds = (recentApproved.docs as unknown as Record<string, unknown>[]).map((d) => Number(d.id))
    const rafByDc = new Map<number, string>()
    if (rIds.length) {
      const raf = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { in: rIds } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const f of raf.docs as unknown as Record<string, unknown>[]) {
        const ref = f.discoveredContent
        const dcId = typeof ref === 'object' && ref !== null ? Number((ref as { id?: number }).id) : Number(ref)
        if (Number.isFinite(dcId) && typeof f.primaryCategory === 'string') rafByDc.set(dcId, f.primaryCategory)
      }
    }
    for (const d of recentApproved.docs as unknown as Record<string, unknown>[]) {
      const dl = toDcLike(d)
      const cat = rafByDc.get(Number(d.id)) ?? deriveProvisionalCategory({
        primaryCategory: null,
        title: dl.title ?? '',
        venue: dl.venue ?? '',
        templateType: null,
        contentType: dl.contentType ?? undefined,
      }).category
      if (cat) catHist.set(cat, (catHist.get(cat) ?? 0) + 1)
      const fk = resolveFacilityKey({ venue: dl.venue, sourceName: dl.sourceSiteName, sourceUrl: dl.articleUrl, title: dl.title })
      const fkey = fk.key ?? '(会場不明)'
      facHist.set(fkey, (facHist.get(fkey) ?? 0) + 1)
    }
  } catch {
    /* 履歴が取れなくても継続（ペナルティ 0） */
  }
  const catHistPenalty = (cat: string | null | undefined): number =>
    cat ? Math.min(0.2, 0.07 * Math.max(0, (catHist.get(cat) ?? 0) - 1)) : 0
  const facHistPenalty = (fk: string | null | undefined): number =>
    fk ? Math.min(0.2, 0.08 * Math.max(0, (facHist.get(fk) ?? 0) - 1)) : 0

  const candidates: ThemeCandidate[] = []
  const abc = { A: 0, B: 0, C: 0 }

  for (const raw of docs) {
    const dcId = Number(raw.id)
    try {
      const dcLike = toDcLike(raw)
      // 日付正規化：DC に event 日付が無いとき、タイトル・本文抜粋に **明記された** 会期を拾う
      // （推測はしない・書かれている日付のみ）。expired 判定・時期分散に反映される。
      let periodBasis: string | null = null
      if (!dcLike.eventStartAt && !dcLike.eventEndAt) {
        // ① タイトルに明記された会期 → ② URL スラッグにサイトが明記した日付・開催月
        //   （本文抜粋はナビの年号ノイズを含むため使わない・推測はしない）
        const p = extractExplicitPeriod(dcLike.title ?? '', { now }) ?? periodFromUrlSlug(dcLike.articleUrl ?? '')
        if (p) {
          dcLike.eventStartAt = p.startIso
          dcLike.eventEndAt = p.endIso
          periodBasis = p.matched
        } else {
          // ③ ニュース系（会期を持たない告知・商品ニュース）は、サイトが明記した
          //    公開日を時期の基準にする（推測ではない）。古い公開日は expired で落ちる。
          const pub = (dcLike.publishedAt ?? (raw.contentUpdatedAt as string | null)) ?? null
          if (pub && !Number.isNaN(Date.parse(pub))) {
            dcLike.eventStartAt = pub
            dcLike.eventEndAt = pub
            periodBasis = `公開日を時期基準に採用（${String(pub).slice(0, 10)}）`
          }
        }
      }
      const factsDoc = afByDc.get(dcId)
      const dedup = {
        duplicate: draftedDcIds.has(dcId),
        possibleDuplicate: false,
        externalUnverified: true,
        signalSummary: draftedDcIds.has(dcId) ? ['既に Article(editorialProvenance) 化済み'] : [],
      }

      const classification = classifyFactKind({
        contentType: dcLike.contentType ?? null,
        uxType: dcLike.uxType ?? null,
        title: dcLike.title ?? null,
        excerpt: dcLike.excerpt ?? null,
        sourceType: sourceTypeById.get(Number(raw.sourceSite ?? raw.source_site_id)) ?? null,
        officialSignals: null,
        url: dcLike.articleUrl ?? null,
        sourceName: dcLike.sourceSiteName ?? null,
        venue: dcLike.venue ?? null,
      })
      const factKind = classification.factKind

      const a = assessCandidate({
        dc: dcLike,
        facts: toFactsLike(factsDoc),
        dedup,
        imageInventory,
        now,
        factKind,
      })
      a.factKind = factKind

      const ttCls = classifyTemplateType({
        factKind,
        contentType: dcLike.contentType ?? null,
        uxType: dcLike.uxType ?? null,
        title: dcLike.title ?? null,
        excerpt: dcLike.excerpt ?? null,
        url: dcLike.articleUrl ?? null,
        sourceName: dcLike.sourceSiteName ?? null,
        venue: dcLike.venue ?? null,
      })
      a.templateType = ttCls.templateType

      let missingForTemplate: string[] = []
      if (factKind === 'event') {
        a.extraction = extractArticleFactsCandidate({
          dc: dcLike,
          image: a.image,
          officialSignals: null,
          trustedSource: a.hasTraceableSource,
        })
        a.templatePrecheck = buildTemplatePrecheck({
          dc: dcLike,
          facts: toFactsLike(factsDoc),
          factsSource: a.factsSource,
          templateType: ttCls,
          extraction: a.extraction,
          verdict: a.verdict,
          now,
        })
        missingForTemplate = a.templatePrecheck.missingForTemplate ?? []
      } else if (factKind === 'product_news') {
        a.productExtraction = extractProductNewsFactsCandidate({
          dc: dcLike,
          image: a.image,
          officialSignals: null,
          trustedSource: a.hasTraceableSource,
        })
        // product_news は event 用 templatePrecheck を持たない。
        // sale の ready 必須（priceText / officialInfoNote / 販売期間）を「未確認」として明示。
        const pe = a.productExtraction
        const um = Array.isArray(pe?.unknownItems) ? pe!.unknownItems : []
        const need = ['price', 'salesLocation', 'purchaseConditions'].filter((k) => um.includes(k))
        missingForTemplate = [
          ...(need.includes('price') ? ['priceText（公式の価格記載）'] : []),
          ...(need.includes('salesLocation') ? ['販売場所（会場）'] : []),
          'officialInfoNote（購入条件・在庫注意）',
          '販売期間（表示 ＋ 機械日付）',
        ]
      }

      // 分類の決定的根拠（URL 構造・タイトル明記・本文明記）を監査記録用にまとめる
      const classificationBasis: string[] = []
      if (classification.sourcePage) {
        classificationBasis.push(`ページ種別=${classification.sourcePage.pageKind}: ${classification.sourcePage.evidence.join(' ／ ')}`)
      }
      classificationBasis.push(`記事タイプ=${factKind}（${classification.confidence}）: ${classification.reasons.join(' ／ ')}`)
      classificationBasis.push(`記事種別=${ttCls.templateType}（${ttCls.confidence}）: ${ttCls.reasons.join(' ／ ')}`)
      if (periodBasis) classificationBasis.push(`会期を本文明記から補完: 「${periodBasis}」`)
      if (a.ginzaRelevanceBasis) classificationBasis.push(`銀座関連性: ${a.ginzaRelevant ? '○' : '×'} ${a.ginzaRelevanceBasis}`)

      abc[a.verdict]++
      candidates.push({
        discoveredContentId: dcId,
        classificationBasis,
        excerpt: (dcLike.excerpt ?? '').slice(0, 400) || null,
        title: a.title,
        displayTitle: a.displayTitle,
        sourceName: a.sourceName,
        sourceUrl: a.sourceUrl,
        verifiedAt: a.verifiedAt ?? null,
        verdict: a.verdict,
        expired: a.expired,
        ginzaRelevant: a.ginzaRelevant,
        hasTraceableSource: a.hasTraceableSource,
        duplicate: a.dedup.duplicate,
        factKind: a.factKind ?? null,
        templateType: a.templateType ?? null,
        templateTypeConfidence: a.templatePrecheck?.templateTypeConfidence ?? ttCls.confidence ?? null,
        templateEligible: a.templateEligible,
        factsSource: a.factsSource,
        bAdditionalMinutes: a.bAdditionalMinutes ?? null,
        precheckDecision: a.templatePrecheck?.decision ?? null,
        missingForTemplate,
        primaryCategory: (factsDoc?.primaryCategory as string | null) ?? null,
        uxType: (raw.uxType as string | null) ?? null,
        eventStartAt: dcLike.eventStartAt ?? (raw.eventStartAt as string | null) ?? null,
        eventEndAt: dcLike.eventEndAt ?? (raw.eventEndAt as string | null) ?? null,
        eventDateConfidence: deriveEventDateConfidence(
          !!(dcLike.eventStartAt ?? (raw.eventStartAt as string | null)) ||
            !!(dcLike.eventEndAt ?? (raw.eventEndAt as string | null)),
          dcLike.dateExtraction,
        ),
        venue: (raw.venue as string | null) ?? null,
        contentType: (raw.contentType as string | null) ?? null,
        eventPeriod: a.eventPeriod,
        editorialScoreTotal:
          ((raw.editorialScore as { total?: number } | null)?.total as number | null | undefined) ??
          ((raw.editorialScore as { now?: number } | null)?.now as number | null | undefined) ??
          null,
      })
    } catch (e) {
      // 1件失敗で全体は止めない。C 相当で残す（gate で落ちる）。
      candidates.push({
        discoveredContentId: dcId,
        title: String(raw.title ?? `DC #${dcId}`),
        sourceName: String((raw.sourceSite as { name?: string })?.name ?? ''),
        sourceUrl: String(raw.articleUrl ?? ''),
        verdict: 'C',
        expired: false,
        ginzaRelevant: false,
        hasTraceableSource: false,
        duplicate: false,
        factKind: 'unknown',
        templateType: 'unknown',
        templateEligible: false,
        factsSource: 'none',
        missingForTemplate: [`評価中に例外: ${e instanceof Error ? e.message : String(e)}`],
      })
      abc.C++
    }
  }

  // --- コアターゲット適合 ＋ 偏り補正の素性付与（決定的・AI なし・課金なし。失敗しても選定は続行）---
  try {
    for (const c of candidates) {
      try {
        const prov = deriveProvisionalCategory({
          primaryCategory: c.primaryCategory ?? null,
          title: c.title ?? '',
          venue: c.venue ?? '',
          templateType: c.templateType ?? null,
          contentType: c.contentType ?? undefined,
          excerpt: c.excerpt ?? undefined,
        })
        const tf = computeTargetFitScore({
          title: c.title,
          venue: c.venue ?? null,
          categoryKey: prov.category ?? c.primaryCategory ?? null,
          contentType: c.contentType ?? null,
          uxType: c.uxType ?? null,
          templateType: c.templateType ?? null,
        })
        c.targetFit = tf.score
        c.targetFitCompass = tf.compass
        c.targetFitSignals = tf.matchedSignals
        c.sourceTypeKey = sourceTypeOf(c.sourceName)
        const fk = resolveFacilityKey({
          venue: c.venue,
          sourceName: c.sourceName,
          sourceUrl: c.sourceUrl,
          title: c.title,
        })
        c.categoryHistoryPenalty = catHistPenalty(prov.category ?? c.primaryCategory ?? null)
        c.venueHistoryPenalty = facHistPenalty(fk.key ?? '(会場不明)')
      } catch {
        /* この候補だけスキップ */
      }
    }
  } catch {
    /* target_fit / 偏り補正の全体スキップ（既存フロー継続） */
  }

  // --- CROSS CULTURE FILTER（GINZA WHISKERS 適合判定の後段。読み取り専用・決定的・課金なし）---
  // ここで失敗しても候補選定は続行する（crossCulture が undefined になるだけ）。
  try {
    for (const c of candidates) {
      try {
        c.crossCulture = getOrComputeCrossCulture(
          {
            discoveredContentId: c.discoveredContentId,
            title: c.title,
            excerpt: c.excerpt ?? null,
            venue: c.venue ?? null,
            contentType: c.contentType ?? null,
            uxType: c.uxType ?? null,
            factKind: c.factKind ?? null,
            templateType: c.templateType ?? null,
            primaryCategory: c.primaryCategory ?? null,
            sourceName: c.sourceName ?? null,
            sourceUrl: c.sourceUrl ?? null,
          },
          { now },
        )
      } catch {
        /* この候補だけスキップ（次の候補へ） */
      }
    }
  } catch {
    /* CROSS CULTURE FILTER 全体をスキップ（既存フロー継続） */
  }

  return {
    collectedTotal: collectedTotalRes.totalDocs,
    assessed: candidates.length,
    candidates,
    abcCounts: abc,
  }
}
