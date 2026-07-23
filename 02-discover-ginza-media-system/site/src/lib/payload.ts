// Payload CMS REST APIから公開済み記事を取得する薄いラッパー。
// 型はCONTENT_MODEL.md 2節に対応する最小限の形のみを定義する
// （cms側のpayload-types.tsとの共有は今後の課題。6節「未決事項」参照）。
//
// 翻訳ワークフロー（Phase 6, CLAUDE.md第7章）：Payloadの`locale`パラメータは
// 既定でロケール間フォールバックを行うため、英語未翻訳のフィールドが
// 日本語の値をそのまま返してしまう（サイレントフォールバック）。これを
// 避けるため、常に`locale=all`でロケールごとの生値を取得し、本ファイル内で
// 明示的にロケール解決を行う。フォールバックは一切利用しない。

import type { LexicalRoot } from './lexical'

const PAYLOAD_API_URL = import.meta.env.PAYLOAD_API_URL ?? 'http://localhost:3000'

export type Locale = 'ja' | 'en'
export type TranslationState = 'not_started' | 'in_progress' | 'complete'

// Payloadのlocalizedフィールドを`locale=all`で取得した際の形。
// 値が存在しないロケールのキーは省略されるか`null`になる（フィールドの
// 実装により両パターンがあり得るため、参照側は必ずfalsy判定で扱う）。
type Localized<T> = Partial<Record<Locale, T | null>>

export interface ImageAssetRef {
  id: string
  url: string
  altText?: { ja: string | null; en: string | null }
  sizes?: Record<string, { url: string | null }>
}

export interface ArticleImage {
  asset: ImageAssetRef | null
  role: 'hero' | 'inline' | 'gallery'
  variant: string | null
  caption: string | null
}

export interface ArticleSummary {
  id: string
  title: string
  slug: string
  accessionNumber: string | null
  representedYear: number | null
  historicalPeriod: string | null
  pillars: Array<{ id: string; name: string }>
  images: ArticleImage[]
  // false の場合、title/body/seo等は実際の翻訳ではなくプレースホルダー
  isTranslated: boolean
}

export interface ArticleDetail extends ArticleSummary {
  body: LexicalRoot | null
  seo: { metaTitle: string | null; metaDescription: string | null }
}

interface ArticleImageRaw {
  asset: ImageAssetRef | null
  role: 'hero' | 'inline' | 'gallery'
  variant: string | null
  caption: Localized<string>
}

// `locale=all`でPayloadから返る生の記事データ形
interface ArticleRaw {
  id: string
  title: Localized<string>
  slug: Localized<string>
  body: Localized<LexicalRoot>
  accessionNumber: string | null
  representedYear: number | null
  historicalPeriod: string | null
  pillars: Array<{ id: string; name: string }>
  images: ArticleImageRaw[]
  seo: {
    metaTitle: Localized<string>
    metaDescription: Localized<string>
  }
  // localizedフィールドではなくja/enを直接持つグループのため、
  // `locale=all`でもフラットな{ja, en}のまま返る
  translationStatus: { ja: TranslationState; en: TranslationState }
}

interface PayloadListResponse<T> {
  docs: T[]
  totalDocs: number
}

// 日本語は編集ワークフロー上つねに原文（reviewStatusがpublishedの時点でja本文は必須）。
// 英語は`translationStatus.en`が'complete'で、かつ実際にtitle/bodyが入力されている場合のみ
// 「翻訳済み」とみなす（ステータスの付け忘れ・空欄のまま完了指定される事故を防ぐ二重チェック）。
function isTranslationComplete(raw: ArticleRaw, locale: Locale): boolean {
  if (locale === 'ja') return true
  return raw.translationStatus.en === 'complete' && Boolean(raw.title.en) && Boolean(raw.body.en)
}

const PLACEHOLDER_TITLE: Record<Locale, string> = {
  ja: '（未翻訳）',
  en: 'Translation in progress',
}

function resolveSummary(raw: ArticleRaw, locale: Locale): ArticleSummary {
  const isTranslated = isTranslationComplete(raw, locale)

  return {
    id: raw.id,
    title: isTranslated ? (raw.title[locale] as string) : PLACEHOLDER_TITLE[locale],
    // URLの解決はコンテンツの翻訳状態と独立させる：英語スラッグが無くても
    // 日本語スラッグを流用してURLを成立させる（Phase 6設計承認事項）
    slug: (raw.slug[locale] || raw.slug.ja) as string,
    accessionNumber: raw.accessionNumber,
    representedYear: raw.representedYear,
    historicalPeriod: raw.historicalPeriod,
    pillars: raw.pillars,
    images: raw.images.map((img) => ({
      asset: img.asset,
      role: img.role,
      variant: img.variant,
      caption: img.caption[locale] ?? null,
    })),
    isTranslated,
  }
}

function resolveDetail(raw: ArticleRaw, locale: Locale): ArticleDetail {
  const summary = resolveSummary(raw, locale)

  return {
    ...summary,
    body: summary.isTranslated ? (raw.body[locale] as LexicalRoot) : null,
    seo: {
      metaTitle: summary.isTranslated ? (raw.seo.metaTitle[locale] ?? null) : null,
      metaDescription: summary.isTranslated ? (raw.seo.metaDescription[locale] ?? null) : null,
    },
  }
}

async function fetchRawPublishedArticles(depth: 1 | 2): Promise<ArticleRaw[]> {
  const params = new URLSearchParams({
    locale: 'all',
    'where[reviewStatus][equals]': 'published',
    depth: String(depth),
    limit: '100',
  })

  const res = await fetch(`${PAYLOAD_API_URL}/api/articles?${params.toString()}`)

  if (!res.ok) {
    throw new Error(`Payload API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as PayloadListResponse<ArticleRaw>
  return data.docs
}

export async function fetchPublishedArticles(locale: Locale): Promise<ArticleSummary[]> {
  const raw = await fetchRawPublishedArticles(1)
  return raw.map((article) => resolveSummary(article, locale))
}

// 記事詳細ページのgetStaticPaths用。`where[slug][equals]`はlocaleごとに
// 異なりうるスラッグを一意に絞り込めない（locale=all取得時はロケール
// スコープが定まらないため）ので、公開記事を一括取得してからJS側で
// 解決後のスラッグと突き合わせる
export async function fetchPublishedArticleDetails(locale: Locale): Promise<ArticleDetail[]> {
  const raw = await fetchRawPublishedArticles(2)
  return raw.map((article) => resolveDetail(article, locale))
}

// 画像URLはPayloadが相対パス（例: /api/image-assets/file/...）で返すため、
// ビルド時に参照したPAYLOAD_API_URLを基準に絶対URLへ変換する
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  return `${PAYLOAD_API_URL}${url}`
}

export function getHeroImageUrl(article: ArticleSummary): string | null {
  const hero = article.images.find((img) => img.role === 'hero')?.asset ?? null
  if (!hero) return null
  return resolveImageUrl(hero.sizes?.gallery?.url ?? hero.url)
}
