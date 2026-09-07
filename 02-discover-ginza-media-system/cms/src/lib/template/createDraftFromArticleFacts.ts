import type { Payload } from 'payload'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { findRelatedArticles } from '../ai/relatedArticles'
import { slugify } from '../ai/slugify'
import { blocksToLexicalState } from '../ai/lexical'
import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import { buildTemplateArticleMeta } from './buildTemplateArticleMeta'
import {
  buildTemplateArticleInput,
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
  type FactsSource,
  type TemplateRoute,
} from './mapDiscoveredContentToEventFields'
import type { AppliedTemplate } from './readyGate'
import { renderArticleFromTemplate } from './renderArticleFromTemplate'

// GINZA WHISKERS / Project 02 改善 Stage 4（2026-09-02）。
//
// ready かつ必須充足の ArticleFacts を持つ templateEligible:true の
// DiscoveredContent から、Article(reviewStatus:'draft') を **決定的に**（AI なし・
// ¥0）1本つくるオーケストレーター。
//
// 【安全設計（承認済み Stage 4 設計）】
//   1. 既定 dryRun=true。dryRun のときは payload.create を一度も呼ばない。
//   2. templateEligible:true かつ factsSource==='ready' の両方を必須（二重ゲート）。
//   3. dc.curationStatus==='approved' でなければ何もしない。
//   4. editorialProvenance.discoveredContentSource の逆引きで二重生成を防止。
//   5. reviewStatus は 'draft' をハードコード。自動公開・note 投稿はしない。
//   6. AI 経路（createDailyDraftsFromApproved / generateMultiAngleArticleDrafts 等）を
//      import しない。draft-today / draft-interest / night / trial には接続しない。
//   7. 昨日の Night 投稿層（cms/src/lib/night/*）には触れない——生成した Article は
//      既存の ./p2 night package <articleId> がそのまま処理する。

export interface CreateDraftFromArticleFactsOptions {
  /** 既定 true（安全側）。false のときのみ payload.create / payload.update を実行 */
  dryRun?: boolean
  /** 既存ドラフトがあっても **新規** に作り直す（既定 false）。※重複 Article ができる */
  force?: boolean
  /**
   * 既存の機械生成ドラフト（reviewStatus:'draft' かつ aiGeneratedBy が `template:` で始まる）が
   * あれば、**同じ Article を上書き更新**する（新規作成せず重複を作らない。既定 false）。
   * renderer 改善後に既存ドラフトを作り直す用途。human 編集済み／published は対象外（安全停止）。
   */
  regenerate?: boolean
  /** 過去/未来判定の基準時刻（決定的テスト用。既定 new Date()） */
  now?: Date
}

export type CreateDraftStatus = 'would_create' | 'created' | 'updated' | 'skipped'
export type CreateDraftSkipReason =
  | 'dc_not_found'
  | 'human_review'
  | 'not_approved'
  | 'already_drafted'
  | 'existing_not_regenerable'
  | 'template_type_unknown'
  | 'category_icon_missing'

// 18カテゴリー（primaryCategory）→ カテゴリーアイコンのファイル名／slug。
// VISUAL_ASSET_LIBRARY §3.3 / §8.2。ART へフォールバックしない（未定義は割当なし）。
const PRIMARY_CATEGORY_TO_ICON: Record<string, { file: string; slug: string }> = {
  FOOD: { file: '01_gourmet.jpg', slug: 'icon_food' },
  CAFE: { file: '02_cafe.jpg', slug: 'icon_cafe' },
  SHOPPING: { file: '03_shopping.jpg', slug: 'icon_shopping' },
  ARCHITECTURE: { file: '04_landmarks_and_architecture.jpg', slug: 'icon_architecture' },
  ART: { file: '05_art_and_culture.jpg', slug: 'icon_art' },
  EVENT: { file: '06_events.jpg', slug: 'icon_event' },
  NIGHT: { file: '07_bars_and_drinks.jpg', slug: 'icon_night' },
  MUSIC: { file: '08_music_and_live.jpg', slug: 'icon_music' },
  BEAUTY: { file: '09_beauty.jpg', slug: 'icon_beauty' },
  HOTEL: { file: '10_hotels.jpg', slug: 'icon_hotel' },
  WELLNESS: { file: '11_wellness_and_relaxation.jpg', slug: 'icon_wellness' },
  EXPERIENCE: { file: '12_travel_and_experiences.jpg', slug: 'icon_experience' },
  GIFT: { file: '13_gifts_and_souvenirs.jpg', slug: 'icon_gift' },
  WORKSHOP: { file: '14_learning_and_workshops.jpg', slug: 'icon_workshop' },
  PHOTO: { file: '15_photo_spots.jpg', slug: 'icon_photo' },
  FAMILY: { file: '16_family.jpg', slug: 'icon_family' },
  NIGHT_VIEW: { file: '17_night_views_and_night_spots.jpg', slug: 'icon_nightview' },
  RAINY_DAY: { file: '18_rainy_day_picks.jpg', slug: 'icon_rainyday' },
}

const KNOWN_TEMPLATE_TYPES = [
  'exhibition', 'sale', 'application', 'workshop', 'recurring_event', 'generic',
] as const

/** primaryCategory からアイコンを解決。ファイルの実在も検証。ART へはフォールバックしない。 */
function resolveCategoryIcon(
  primaryCategory: string | null | undefined,
): { category: string; slug: string; file: string; path: string; exists: boolean } | { error: string } | null {
  const cat = (primaryCategory ?? '').trim().toUpperCase()
  if (!cat) return null // 未分類 — アイコン割当なし（ART へは寄せない）
  const m = PRIMARY_CATEGORY_TO_ICON[cat]
  if (!m) return { error: `primaryCategory「${cat}」に対応するカテゴリーアイコン定義がない（18カテゴリー外）` }
  const iconPath = resolve(process.cwd(), '..', 'media', 'discover-ginza-category-icons', m.file)
  return { category: cat, slug: m.slug, file: m.file, path: iconPath, exists: existsSync(iconPath) }
}

export interface CreateDraftFromArticleFactsResult {
  discoveredContentId: number | string
  status: CreateDraftStatus
  dryRun: boolean
  templateEligible: boolean
  route: TemplateRoute
  factsSource: FactsSource
  reason?: CreateDraftSkipReason
  missing?: string[]
  ambiguous?: string[]
  existingArticleId?: number
  articleId?: number
  /** primaryCategory から解決したカテゴリーアイコン（ART へフォールバックしない） */
  categoryIcon?: { category: string; slug: string; file: string; exists: boolean }
  /** 記事生成側の注意（例：templateType 未設定で構造から推定した） */
  warnings?: string[]
  plan?: {
    title: string
    slug: string
    pillar: string
    appliedTemplate: AppliedTemplate
    charCount: number
    reviewStatus: 'draft'
    aiGeneratedBy: string
    editorialProvenanceCount: number
    relatedArticleCount: number
  }
  /**
   * 監査パイプライン用の読み取り専用プレビュー（dry-run・would_create・updated・created いずれでも付く）。
   * DB 書き込みなしで本文・出典・CTA を渡すため。TemplateArticleResult をそのまま流用。
   */
  preview?: {
    title: string
    titleCandidates: string[]
    blocks: { type: string; level?: number; text: string }[]
    charCount: number
    hashtags: string[]
    callToAction: string | null
    appliedTemplate: AppliedTemplate
    provenance: {
      fact: string
      factType: string
      verificationStatus: string
      sourceUrl?: string | null
      verifiedAt?: string | null
    }[]
    /** ArticleFacts の確定値（監査の照合用） */
    facts: {
      eventName?: string | null
      whatHappens?: string | null
      eventDate?: string | null
      eventDateISO?: string | null
      eventTime?: string | null
      venues?: ({ name?: string | null; place?: string | null } | null)[] | null
      priceText?: string | null
      officialInfoNote?: string | null
      applyRequired?: string | null
      applyDeadline?: string | null
      paid?: string | null
      areaLead?: string | null
      audienceNote?: string | null
    }
    primaryCategory?: string | null
    templateType?: string | null
    sourceUrl?: string | null
    verifiedAt?: string | null
  }
}

// --- Payload doc → mapper 入力（templateCheck.ts と同型の軽い詰め替え） ---
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
    resultDate: g<string | null>('resultDate') ?? null,
    resultRule: g<string | null>('resultRule') ?? null,
    applyRule: g<string | null>('applyRule') ?? null,
    priceText: g<string | null>('priceText') ?? null,
    saleAvailability: g<string | null>('saleAvailability') ?? null,
    officialInfoNote: g<string | null>('officialInfoNote') ?? null,
    editorsNoteSeed: g<string | null>('editorsNoteSeed') ?? null,
    closing: g<string | null>('closing') ?? null,
    callToAction: g<string | null>('callToAction') ?? null,
    hashtags: g<ArticleFactsLike['hashtags']>('hashtags') ?? null,
    sourceProvenanceFacts: g<ArticleFactsLike['sourceProvenanceFacts']>('sourceProvenanceFacts') ?? null,
  }
}

export async function createDraftFromArticleFacts(
  payload: Payload,
  dcId: number | string,
  options: CreateDraftFromArticleFactsOptions = {},
): Promise<CreateDraftFromArticleFactsResult> {
  const dryRun = options.dryRun ?? true // 安全側の既定
  const now = options.now ?? new Date()

  const dc = (await payload.findByID({
    collection: 'discovered-content',
    id: dcId,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!dc) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: false,
      route: 'human_review',
      factsSource: 'none',
      reason: 'dc_not_found',
    }
  }

  const factsRes = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: dcId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown> | undefined

  // 記事テンプレート種別を必ず読み取る。'unknown' は安全停止（暗黙の exhibition 化はしない）。
  const rawTemplateType = String((factsDoc?.templateType as string | null | undefined) ?? '').trim()
  if (factsDoc && rawTemplateType === 'unknown') {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: false,
      route: 'human_review',
      factsSource: 'ready',
      reason: 'template_type_unknown',
      missing: [
        'templateType が unknown。admin で exhibition / sale / application / workshop / recurring_event / generic のいずれかに確定してください（記事生成側で暗黙に exhibition と判定しません）',
      ],
    }
  }
  const templateTypeForMap =
    (KNOWN_TEMPLATE_TYPES as readonly string[]).includes(rawTemplateType)
      ? (rawTemplateType as (typeof KNOWN_TEMPLATE_TYPES)[number])
      : undefined // 未設定（レガシー行）→ mapper が構造から推定し ambiguous に警告

  const mapResult = mapDiscoveredContentToEventFields(toDcLike(dc), {
    facts: toFactsLike(factsDoc),
    templateType: templateTypeForMap,
    now,
  })

  // ゲート#2：templateEligible かつ factsSource==='ready' の両方
  //   種別別の必須判定は mapper 内で evaluateReadyGate(facts, templateType) に一本化済み。
  //   ready 済みでも confirmed 事実が欠ける場合は missing に理由が入る。
  if (!mapResult.templateEligible || mapResult.factsSource !== 'ready') {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: mapResult.templateEligible,
      route: mapResult.route,
      factsSource: mapResult.factsSource,
      reason: 'human_review',
      missing: mapResult.missing,
      ambiguous: mapResult.ambiguous,
    }
  }

  // カテゴリーアイコン（primaryCategory から。ART へフォールバックしない・ファイル実在も検証）
  const iconRes = resolveCategoryIcon(factsDoc?.primaryCategory as string | null | undefined)
  if (iconRes && 'error' in iconRes) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: true,
      route: 'template',
      factsSource: 'ready',
      reason: 'category_icon_missing',
      missing: [iconRes.error],
    }
  }
  if (iconRes && !iconRes.exists) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: true,
      route: 'template',
      factsSource: 'ready',
      reason: 'category_icon_missing',
      missing: [
        `カテゴリーアイコンのファイルが見つからない: media/discover-ginza-category-icons/${iconRes.file}（primaryCategory=${iconRes.category}）。ART アイコンへはフォールバックしません`,
      ],
      categoryIcon: { category: iconRes.category, slug: iconRes.slug, file: iconRes.file, exists: false },
    }
  }
  const categoryIcon = iconRes
    ? { category: iconRes.category, slug: iconRes.slug, file: iconRes.file, exists: iconRes.exists }
    : undefined
  const warnings = (mapResult.ambiguous ?? []).filter((a) => a.includes('templateType が ArticleFacts に未設定'))

  // ゲート#1：承認済み DC のみ
  if (dc.curationStatus !== 'approved') {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: true,
      route: mapResult.route,
      factsSource: 'ready',
      reason: 'not_approved',
    }
  }

  // 二重生成防止：editorialProvenance.discoveredContentSource の逆引き
  const dupRes = await payload.find({
    collection: 'articles',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { 'editorialProvenance.discoveredContentSource': { equals: Number(dcId) } },
  })
  const existingDoc = dupRes.docs[0] as
    | { id: number | string; reviewStatus?: string | null; aiGeneratedBy?: string | null }
    | undefined
  // regenerate: 既存の機械生成ドラフトを同じ Article に上書き更新（重複を作らない）
  let regenerateTargetId: number | null = null
  if (existingDoc && options.regenerate) {
    const isMachineDraft =
      existingDoc.reviewStatus === 'draft' &&
      String(existingDoc.aiGeneratedBy ?? '').startsWith('template:')
    if (!isMachineDraft) {
      return {
        discoveredContentId: dcId,
        status: 'skipped',
        dryRun,
        templateEligible: true,
        route: 'template',
        factsSource: 'ready',
        reason: 'existing_not_regenerable',
        existingArticleId: Number(existingDoc.id),
        missing: [
          `既存 Article #${existingDoc.id} は reviewStatus=${existingDoc.reviewStatus ?? '?'} / aiGeneratedBy=${existingDoc.aiGeneratedBy ?? '?'}。` +
            `機械生成の draft（aiGeneratedBy が template: で始まる）のみ regenerate 対象です（人間編集・公開済みは上書きしません）`,
        ],
      }
    }
    regenerateTargetId = Number(existingDoc.id)
  } else if (existingDoc && !options.force) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: true,
      route: 'template',
      factsSource: 'ready',
      reason: 'already_drafted',
      existingArticleId: Number(existingDoc.id),
    }
  }

  // --- 記事データを決定的に組み立て（AI なし） ---
  const input = buildTemplateArticleInput(mapResult)
  if (!input || !mapResult.fields) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: mapResult.templateEligible,
      route: mapResult.route,
      factsSource: mapResult.factsSource,
      reason: 'human_review',
      missing: ['buildTemplateArticleInput が null（fields/sourceMeta 欠落）'],
    }
  }

  const rendered = renderArticleFromTemplate(input)
  const meta = buildTemplateArticleMeta(mapResult.fields, rendered, mapResult.appliedTemplate)

  const pillarName = CONTENT_TYPE_TO_PILLAR_NAME[String(dc.contentType ?? '')] ?? 'イベント'
  const pillarRes = await payload.find({
    collection: 'tags',
    limit: 1,
    overrideAccess: true,
    where: { and: [{ type: { equals: 'pillar' } }, { name: { equals: pillarName } }] },
  })
  const pillarDoc = pillarRes.docs[0] as { id: number | string } | undefined
  if (!pillarDoc) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      templateEligible: true,
      route: 'template',
      factsSource: 'ready',
      reason: 'human_review',
      missing: [`pillar Tag「${pillarName}」が存在しない（既存の pillar Tag を作成してください）`],
    }
  }
  const pillarIds = [Number(pillarDoc.id)]
  const related = await findRelatedArticles(payload, pillarIds, 3)

  const slug = slugify(rendered.title) || rendered.title
  const appliedTemplate = mapResult.appliedTemplate ?? 'exhibition'
  const aiGeneratedBy = `template:${appliedTemplate}:af#${factsDoc?.id ?? 'unknown'}`

  const editorialProvenance =
    rendered.provenance.length > 0
      ? rendered.provenance.map((e) => ({
          discoveredContentSource: Number(e.discoveredContentId),
          sourceName: e.sourceName,
          sourceUrl: e.sourceUrl,
          verifiedAt: e.verifiedAt ?? null,
          fact: e.fact,
          sourceType: e.sourceType,
          factType: e.factType,
          verificationStatus: e.verificationStatus,
        }))
      : [
          {
            discoveredContentSource: Number(dcId),
            sourceName: input.sourceName,
            sourceUrl: input.sourceUrl,
            verifiedAt: input.verifiedAt ?? null,
            fact: '（ArticleFacts エンリッチによる下書き。fact 単位の出典は未記録）',
            sourceType: 'official' as const,
            factType: 'other' as const,
            verificationStatus: 'confirmed' as const,
          },
        ]

  const plan = {
    title: rendered.title,
    slug,
    pillar: pillarName,
    appliedTemplate,
    charCount: rendered.charCount,
    reviewStatus: 'draft' as const,
    aiGeneratedBy,
    editorialProvenanceCount: editorialProvenance.length,
    relatedArticleCount: related.length,
  }

  // 監査パイプライン用の読み取り専用プレビュー（DB 書き込みなしで本文・出典・CTA を渡す）
  const f = mapResult.fields
  const preview: CreateDraftFromArticleFactsResult['preview'] = {
    title: rendered.title,
    titleCandidates: rendered.titleCandidates,
    blocks: rendered.blocks.map((b) => ({ type: b.type, level: b.level, text: b.text })),
    charCount: rendered.charCount,
    hashtags: rendered.hashtags,
    callToAction: rendered.callToAction ?? null,
    appliedTemplate,
    provenance: rendered.provenance.map((e) => ({
      fact: e.fact,
      factType: e.factType,
      verificationStatus: e.verificationStatus,
      sourceUrl: e.sourceUrl ?? null,
      verifiedAt: e.verifiedAt ?? null,
    })),
    facts: {
      eventName: f.eventName ?? null,
      whatHappens: f.whatHappens ?? null,
      eventDate: f.eventDate ?? null,
      // eventDateISO は ArticleFacts の生値（fields には表示用しか無いため）
      eventDateISO: (factsDoc?.eventDateISO as string | null) ?? null,
      eventTime: f.eventTime ?? null,
      venues: f.venues ?? null,
      priceText: f.priceText ?? null,
      officialInfoNote: f.officialInfoNote ?? null,
      applyRequired: (factsDoc?.applyRequired as string | null) ?? null,
      applyDeadline: f.applyDeadline ?? null,
      paid: (factsDoc?.paid as string | null) ?? null,
      areaLead: f.areaLead ?? null,
      audienceNote: f.audienceNote ?? null,
    },
    primaryCategory: (factsDoc?.primaryCategory as string | null) ?? null,
    templateType: (factsDoc?.templateType as string | null) ?? null,
    sourceUrl: mapResult.sourceMeta?.sourceUrl ?? null,
    verifiedAt: mapResult.sourceMeta?.verifiedAt ?? null,
  }

  if (dryRun) {
    return {
      discoveredContentId: dcId,
      status: 'would_create',
      dryRun: true,
      templateEligible: true,
      route: 'template',
      factsSource: 'ready',
      categoryIcon,
      warnings: warnings.length ? warnings : undefined,
      existingArticleId: regenerateTargetId ?? undefined,
      plan,
      preview,
    }
  }

  // regenerate 対象があれば **同じ Article を上書き更新**（重複作成しない）。無ければ新規作成。
  const writeData = {
    reviewStatus: 'draft' as const, // ハードコード。自動公開しない
    title: rendered.title,
    slug,
    body: blocksToLexicalState(rendered.blocks),
    pillars: pillarIds,
    seo: meta.seo,
    socialCopy: meta.socialCopy,
    // CTA は renderer の判定に従う（テンプレ既定文を無条件には保持しない。
    // 購入 / 申込がある記事で confirmed 事実に裏づく場合のみ文字列、それ以外は null）。
    callToAction: rendered.callToAction ?? null,
    relatedArticles: related.map((r) => r.id),
    editorialProvenance,
    aiGeneratedBy,
  }

  if (regenerateTargetId != null) {
    const updated = await payload.update({
      collection: 'articles',
      id: regenerateTargetId,
      locale: 'ja',
      overrideAccess: true,
      data: writeData,
    })
    return {
      discoveredContentId: dcId,
      categoryIcon,
      warnings: warnings.length ? warnings : undefined,
      status: 'updated',
      dryRun: false,
      templateEligible: true,
      route: 'template',
      factsSource: 'ready',
      existingArticleId: regenerateTargetId,
      articleId: Number((updated as { id: number | string }).id),
      plan,
      preview,
    }
  }

  const article = await payload.create({
    collection: 'articles',
    locale: 'ja',
    overrideAccess: true,
    data: writeData,
  })

  return {
    discoveredContentId: dcId,
    categoryIcon,
    warnings: warnings.length ? warnings : undefined,
    status: 'created',
    dryRun: false,
    templateEligible: true,
    route: 'template',
    factsSource: 'ready',
    articleId: Number((article as { id: number | string }).id),
    plan,
    preview,
  }
}
