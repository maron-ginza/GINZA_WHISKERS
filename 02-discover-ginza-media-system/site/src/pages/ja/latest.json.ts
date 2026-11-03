import type { APIRoute } from 'astro'

import { lexicalToPlainText } from '../../lib/lexical'
import { fetchPublishedArticleDetails, getHeroImageUrl, type ArticleDetail } from '../../lib/payload'
import { categoryLabelJa, categoryIconUrl } from '../../lib/categoryIcons'

// Project 01母艦（ginzawhiskers.com）の「最新のジャーナル」「旬の銀座」LPへ渡す
// 疎結合フィード（2026-11-03、旬の銀座LP向けに notePublishedUrl を追加・共用）。
//
// - 公開契約（DTO）は title / url / notePublishedUrl / excerpt / publishedAt /
//   pillar / image / category / categoryIconUrl に限定する。本文（Lexical）・
//   内部ID・reviewStatus 等の内部表現は一切出さない。
// - published のみ：fetchPublishedArticleDetails は
//   `where[reviewStatus][equals]=published` を必ず付けて取得する。さらに Payload の
//   Articles.access.read が匿名アクセスを published に制限しているため、
//   draft / review / approved は二重に除外される（このファイルに追加のフィルタは不要）。
// - 新しい順・最大20件（2026-11-03、10→20。note公開URL未登録の記事が混じって
//   いても、それを必要とする消費側〈旬の銀座LP〉がクライアント側でフィルタ後に
//   目標10件へ近づけられるよう、取得母数に余裕を持たせた。「最新のジャーナル」
//   〈母艦TOP、先頭3件のみ使用〉はnotePublishedUrlを要求しないため挙動は
//   変わらない。このフィード自体はnotePublishedUrlの有無で絞り込まない
//   ——「公開済みの最新記事」という既存の意味を変えないため）。
// - output: 'static' のためビルド時に /ja/latest.json として書き出される。
//   Payload未起動・取得失敗時はビルドを止めず空フィード（items: []）を返す。

export const prerender = true

const FEED_MAX_ITEMS = 20
const EXCERPT_MAX_LENGTH = 120

interface LatestFeedItem {
  title: string
  url: string
  // 2026-11-03追加。note.com記事URL（手動投稿・手動登録のため未登録はnull）。
  // 「旬の銀座」LPは、これがnullの記事をリンクしない設計（表示ルール）。
  notePublishedUrl: string | null
  excerpt: string
  publishedAt: string
  pillar: string | null
  image: string | null
  // 2026-09-24追加。主カテゴリー8分類（日本語ラベル）とそのアイコンの絶対URL。
  // 記事にprimaryCategory8が未設定（未分類）の場合はどちらもnull——母艦側は
  // nullのときアイコンを描画しない設計とする（無関係アイコンで埋めない）。
  category: string | null
  categoryIconUrl: string | null
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
    notePublishedUrl: article.notePublishedUrl,
    excerpt,
    publishedAt: article.publishedAt,
    // 母艦のカードは1つだけ表示するため先頭の収蔵室（pillar）のみ渡す
    pillar: article.pillars[0]?.name ?? null,
    // hero画像が無ければ null（母艦側はテキストのみで描画する）
    image: getHeroImageUrl(article),
    category: categoryLabelJa(article.primaryCategory8),
    categoryIconUrl: categoryIconUrl(article.primaryCategory8, base),
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
