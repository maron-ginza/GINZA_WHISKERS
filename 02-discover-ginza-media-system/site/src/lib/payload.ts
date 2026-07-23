// Payload CMS REST APIから公開済み記事を取得する薄いラッパー。
// 型はCONTENT_MODEL.md 2節に対応する最小限の形のみを定義する
// （cms側のpayload-types.tsとの共有は今後の課題。6節「未決事項」参照）。

import type { LexicalRoot } from './lexical'

const PAYLOAD_API_URL = import.meta.env.PAYLOAD_API_URL ?? 'http://localhost:3000'

export type Locale = 'ja' | 'en'

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
}

export interface ArticleDetail extends ArticleSummary {
  body: LexicalRoot | null
  seo: { metaTitle: string | null; metaDescription: string | null }
}

interface PayloadListResponse<T> {
  docs: T[]
  totalDocs: number
}

export async function fetchPublishedArticles(locale: Locale): Promise<ArticleSummary[]> {
  const params = new URLSearchParams({
    locale,
    'where[reviewStatus][equals]': 'published',
    depth: '1',
    limit: '100',
  })

  const res = await fetch(`${PAYLOAD_API_URL}/api/articles?${params.toString()}`)

  if (!res.ok) {
    throw new Error(`Payload API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as PayloadListResponse<ArticleSummary>
  return data.docs
}

export async function fetchArticleBySlug(
  locale: Locale,
  slug: string,
): Promise<ArticleDetail | null> {
  const params = new URLSearchParams({
    locale,
    'where[reviewStatus][equals]': 'published',
    'where[slug][equals]': slug,
    depth: '2',
    limit: '1',
  })

  const res = await fetch(`${PAYLOAD_API_URL}/api/articles?${params.toString()}`)

  if (!res.ok) {
    throw new Error(`Payload API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as PayloadListResponse<ArticleDetail>
  return data.docs[0] ?? null
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
