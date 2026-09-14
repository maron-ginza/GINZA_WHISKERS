// GINZA WHISKERS / Project 02（2026-09-14、マロン指示）。
//
// DiscoveredContent → Article(reviewStatus:'draft') を、
// buildProductSweetsArticle（決定的・AIなし・追加課金0円）だけで組み立てて
// 保存する。既存の createDraftFromArticleFacts.ts（イベント専用・ArticleFacts
// 依存）とは完全に独立した新規モジュール——既存ファイルは一切変更しない。
//
//   ・既定 dryRun=true（DB 書き込みなし）。dryRun:false のときのみ
//     payload.create を呼ぶ。
//   ・templateEligible かつ curationStatus=approved の DiscoveredContent
//     だけが対象。それ以外は skipped（理由つき）。
//   ・二重生成防止：editorialProvenance.discoveredContentSource の逆引きで
//     既に同じ DC から生成済みの Article があれば作成せず already_drafted
//     を返す（idempotent。同じ dcId を何度呼んでも Article は1件だけ）。
//   ・Claude API・他の生成AI は一切呼ばない（このファイルは fetch も
//     anthropic 系 import も持たない）。note 投稿・自動公開はしない。
//   ・価格は buildProductSweetsArticle の判定（extractPriceHint のラベル
//     近傍基準）をそのまま使う——ここで上書き・推測補完はしない。

import type { Payload } from 'payload'

import { blocksToLexicalState } from '../ai/lexical'
import { slugify } from '../ai/slugify'
import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import { checkProductSweetsEligibility } from './productSweetsEligibility'
import { buildProductSweetsArticle, type ProductSweetsTemplateResult } from './productSweetsTemplate'

export interface CreateDraftFromProductSweetsTemplateOptions {
  /** 既定 true（安全側）。false のときのみ payload.create を実行する */
  dryRun?: boolean
  /** 呼び出し元が把握している収集実行の識別情報（provenanceのfactへ含める） */
  collectionRunNote?: string | null
  /** ハッシュタグを明示指定する場合（未指定ならテンプレート既定ルール） */
  hashtags?: string[]
}

export interface CreateDraftFromProductSweetsTemplateResult {
  discoveredContentId: number
  status: 'created' | 'would_create' | 'already_drafted' | 'skipped'
  dryRun: boolean
  reason?: string
  missing?: string[]
  existingArticleId?: number
  articleId?: number
  plan?: {
    title: string
    slug: string
    pillar: string
    charCount: number
    reviewStatus: 'draft'
    aiGeneratedBy: string
    editorialProvenanceCount: number
    hashtags: string[]
    priceConfirmed: boolean
    salesPeriodConfirmed: boolean
  }
  preview?: {
    title: string
    titleCandidates: string[]
    blocks: { type: string; level?: number; text: string }[]
    noteBody: string
    hashtags: string[]
    provenance: ProductSweetsTemplateResult['provenance']
  }
}

function clip(s: string, max: number): string {
  const arr = [...s]
  return arr.length <= max ? s : arr.slice(0, max - 1).join('') + '…'
}

export async function createDraftFromProductSweetsTemplate(
  payload: Payload,
  dcId: number,
  options: CreateDraftFromProductSweetsTemplateOptions = {},
): Promise<CreateDraftFromProductSweetsTemplateResult> {
  const dryRun = options.dryRun !== false

  const dc = (await payload.findByID({
    collection: 'discovered-content',
    id: dcId,
    depth: 1,
    overrideAccess: true,
  }).catch(() => null)) as unknown as Record<string, unknown> | null

  if (!dc) {
    return { discoveredContentId: dcId, status: 'skipped', dryRun, reason: 'dc_not_found' }
  }

  // ゲート#1：承認済み DC のみ（既存 createDraftFromArticleFacts.ts と同じ規律）
  if (dc.curationStatus !== 'approved') {
    return { discoveredContentId: dcId, status: 'skipped', dryRun, reason: 'not_approved' }
  }

  const ss = dc.sourceSite
  const sourceSiteName =
    ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : ((ss as string | null) ?? null)
  const verifiedAt = (dc.lastCheckedAt as string | null) ?? (dc.detectedAt as string | null) ?? null

  // ゲート#2：商品・スウィーツ専用テンプレートの適格性
  const eligibility = checkProductSweetsEligibility({
    discoveredContentId: dcId,
    title: (dc.title as string | null) ?? null,
    sourceName: sourceSiteName,
    sourceUrl: (dc.articleUrl as string | null) ?? null,
    verifiedAt,
    venue: (dc.venue as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    eventStartAtISO: (dc.eventStartAt as string | null) ?? null,
    eventEndAtISO: (dc.eventEndAt as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
  })
  if (!eligibility.templateEligible) {
    return {
      discoveredContentId: dcId,
      status: 'skipped',
      dryRun,
      reason: 'human_review',
      missing: eligibility.missing,
    }
  }

  // ゲート#3：二重生成防止（idempotency）。editorialProvenance の逆引きで、
  // **このテンプレート自身が過去に作った** Article（aiGeneratedBy が
  // `template:product_sweets:` で始まるもの）があれば、dryRun/live を問わず
  // 再作成しない——同じ dcId で本関数を何度呼んでも Article は1件だけになる。
  // 他経路（AI下書き生成 draft-from-dc 等）で同じ DC から既に作られた
  // Article（例：Article #68）は対象が異なる別成果物のため重複とはみなさない
  // （マロン指示：「Article #68は使用・変更・削除しない」——ブロック要因にも
  // しない）。
  const dupRes = await payload.find({
    collection: 'articles',
    depth: 0,
    limit: 10,
    overrideAccess: true,
    where: { 'editorialProvenance.discoveredContentSource': { equals: Number(dcId) } },
  })
  const existingDoc = (dupRes.docs as { id: number | string; aiGeneratedBy?: string | null }[]).find((d) =>
    String(d.aiGeneratedBy ?? '').startsWith('template:product_sweets:'),
  )
  if (existingDoc) {
    return {
      discoveredContentId: dcId,
      status: 'already_drafted',
      dryRun,
      existingArticleId: Number(existingDoc.id),
    }
  }

  const rendered = buildProductSweetsArticle({
    discoveredContentId: dcId,
    sourceName: sourceSiteName ?? '(出典名なし)',
    sourceUrl: (dc.articleUrl as string | null) ?? '',
    verifiedAt,
    title: (dc.title as string | null) ?? '',
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    eventStartAtISO: (dc.eventStartAt as string | null) ?? null,
    eventEndAtISO: (dc.eventEndAt as string | null) ?? null,
    hashtags: options.hashtags,
    collectionRunNote: options.collectionRunNote,
  })

  // pillars は必須（Articles.ts minRows:1）。既存の共有マッピング表を再利用する
  // （新規タクソノミーを作らない・6本柱の固定表現を変更しない）。
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
      reason: 'pillar_tag_missing',
      missing: [`pillar Tag「${pillarName}」が存在しない`],
    }
  }

  const slug = slugify(rendered.title) || rendered.title
  const aiGeneratedBy = `template:product_sweets:dc#${dcId}`

  const editorialProvenance = rendered.provenance.map((e) => ({
    discoveredContentSource: Number(e.discoveredContentId),
    sourceName: e.sourceName,
    sourceUrl: e.sourceUrl,
    verifiedAt: e.verifiedAt ?? null,
    fact: e.fact,
    sourceType: e.sourceType,
    factType: e.factType,
    verificationStatus: e.verificationStatus,
  }))

  const tagLine = rendered.hashtags.join(' ')
  const leadLine = rendered.blocks.find((b) => b.type === 'paragraph')?.text ?? ''
  const seo = { metaTitle: clip(rendered.title, 60), metaDescription: clip(leadLine, 120) }
  const socialCopy = {
    note: clip(leadLine, 140) + (tagLine ? `\n${tagLine}` : ''),
    x: clip(`${rendered.title}`, 120) + (rendered.hashtags.length ? ` ${rendered.hashtags.slice(0, 2).join(' ')}` : ''),
    instagram: clip(leadLine, 120),
  }

  const plan = {
    title: rendered.title,
    slug,
    pillar: pillarName,
    charCount: rendered.charCount,
    reviewStatus: 'draft' as const,
    aiGeneratedBy,
    editorialProvenanceCount: editorialProvenance.length,
    hashtags: rendered.hashtags,
    priceConfirmed: rendered.priceConfirmed,
    salesPeriodConfirmed: rendered.salesPeriodConfirmed,
  }

  const preview = {
    title: rendered.title,
    titleCandidates: rendered.titleCandidates,
    blocks: rendered.blocks.map((b) => ({ type: b.type, level: b.level, text: b.text })),
    noteBody: rendered.noteBody,
    hashtags: rendered.hashtags,
    provenance: rendered.provenance,
  }

  if (dryRun) {
    return { discoveredContentId: dcId, status: 'would_create', dryRun: true, plan, preview }
  }

  const article = await payload.create({
    collection: 'articles',
    locale: 'ja',
    overrideAccess: true,
    data: {
      reviewStatus: 'draft', // ハードコード。自動公開しない
      title: rendered.title,
      slug,
      body: blocksToLexicalState(rendered.blocks),
      pillars: [Number(pillarDoc.id)],
      seo,
      socialCopy,
      callToAction: rendered.callToAction ?? null,
      editorialProvenance,
      aiGeneratedBy,
    },
  })

  return {
    discoveredContentId: dcId,
    status: 'created',
    dryRun: false,
    articleId: Number((article as { id: number | string }).id),
    plan,
    preview,
  }
}
