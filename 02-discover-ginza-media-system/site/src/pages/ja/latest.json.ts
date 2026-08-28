import type { APIRoute } from 'astro'

import { lexicalToPlainText } from '../../lib/lexical'
import { fetchPublishedArticleDetails, getHeroImageUrl, type ArticleDetail } from '../../lib/payload'

// Project 01母艦（ginzawhiskers.com）の「最新のジャーナル」へ渡す疎結合フィード。
//
// - 公開契約（DTO）は title / url / excerpt / publishedAt / pillar / image に限定する。
//   本文（Lexical）・内部ID・reviewStatus 等の内部表現は一切出さない。
// - published のみ：fetchPublishedArticleDetails は
//   `where[reviewStatus][equals]=published` を必ず付けて取得する。さらに Payload の
//   Articles.access.read が匿名アクセスを published に制限しているため、
//   draft / review / approved は二重に除外される（このファイルに追加のフィルタは不要）。
// - 新しい順・最大10件。
// - output: 'static' のためビルド時に /ja/latest.json として書き出される。
//   Payload未起動・取得失敗時はビルドを止めず空フィード（items: []）を返す。

export const prerender = true

const FEED_MAX_ITEMS = 10
const EXCERPT_MAX_LENGTH = 120

interface LatestFeedItem {
  title: string
  url: string
  excerpt: string
  publishedAt: string
  pillar: string | null
  image: string | null
}

interface LatestFeed {
  generatedAt: string
  count: number
  items: LatestFeedItem[]
}

// 記事URLの絶対化ベース。本番ドメインをこのファイルへ直書きしない：
//   1. ビルド環境変数 PUBLIC_FEED_BASE_URL があればそれ
//   2. 無ければ astro.config.mjs の `site`
//   3. どちらも無ければローカル開発の既定
// これにより 02 のドメインが変わってもこのコードは変更不要。
function resolveBaseUrl(site: URL | undefined): string {
  const envBase = import.meta.env.PUBLIC_FEED_BASE_URL as string | undefined
  const configured = envBase || site?.toString() || 'http://localhost:4321'
  return configured.replace(/\/+$/, '')
}

function toFeedItem(base: string, article: ArticleDetail): LatestFeedItem {
  const excerpt =
    article.seo.metaDescription?.trim() || lexicalToPlainText(article.body, EXCERPT_MAX_LENGTH) || ''

  return {
    title: article.title,
    url: `${base}/ja/articles/${article.slug}`,
    excerpt,
    publishedAt: article.publishedAt,
    // 母艦のカードは1つだけ表示するため先頭の収蔵室（pillar）のみ渡す
    pillar: article.pillars[0]?.name ?? null,
    // hero画像が無ければ null（母艦側はテキストのみで描画する）
    image: getHeroImageUrl(article),
  }
}

export const GET: APIRoute = async ({ site }) => {
  const base = resolveBaseUrl(site)

  let items: LatestFeedItem[] = []
  try {
    const articles = await fetchPublishedArticleDetails('ja')
    items = articles
      .map((article) => toFeedItem(base, article))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, FEED_MAX_ITEMS)
  } catch {
    // index.astro と同方針：CMS未起動でもビルドを止めず、空フィードを配信する。
    items = []
  }

  const body: LatestFeed = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  }

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // astro dev の応答にはこのヘッダが効く。静的ビルド（Cloudflare Pages）では
      // レスポンスヘッダはファイルに残らないため、public/_headers 側で
      // /ja/latest.json に CORS を付与する。
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
