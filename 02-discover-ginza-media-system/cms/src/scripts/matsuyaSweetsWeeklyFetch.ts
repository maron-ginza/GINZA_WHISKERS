// GINZA WHISKERS / Project 02（2026-09-14新設）— 松屋銀座「今週のGINZAスイート」
// 週替わり催事の収集（JSレンダリングが必要なサイト専用の代替経路）。
//
//   ./p2 matsuya-sweets-fetch [--dry-run]
//
// 背景：matsuyaginza.com はReact SPAで、通常のHTTP+HTML取得では実際の催事情報を
// 取得できない（2026-09-14確認）。sitemap.xmlから週替わりの
// `/ginza/events/food/sweets/YYYYMMDD` ページ一覧を取得し、直近（本日以前で最新）の
// 1件をfetchJsRenderedPage（playwright-core経由の実ブラウザ）で取得、
// extractMatsuyaSweetsWeeklyで店舗・商品・価格・共通開催期間を抽出し、
// 既存のDiscoveredContentコレクションへ1商品=1レコードで冪等に反映する
// （通常のcrawlパイプラインと同じcurationStatus=inbox・重複更新の設計）。
//
// Chromeが無い環境（本番Railway等）では自動的にスキップし、通常のHTTP取得
// パイプライン（変化なしのまま）へフォールバックする——クラッシュしない。
//
// **DB書き込みはDiscoveredContentの通常の新規作成・更新のみ。AI呼び出し・
// 課金・記事生成・note操作は一切しない。**

import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import config from '../payload.config'
import { fetchJsRenderedPage, findChromeExecutable } from '../lib/crawler/fetchJsRenderedPage'
import { extractMatsuyaSweetsWeekly } from '../lib/crawler/extractMatsuyaSweetsWeekly'
import { extractExplicitPeriod } from '../lib/pipeline/extractExplicitPeriod'
import { classifyContentType } from '../lib/crawler/classifyContentType'
import { classifyUxType } from '../lib/curation/uxType'

const DRY = process.argv.includes('--dry-run')
const SITEMAP_URL = 'https://www.matsuyaginza.com/sitemap.xml'
const SOURCE_ID = 'matsuya-ginza'
const USER_AGENT = 'Mozilla/5.0 (compatible; GinzaWhiskersDiscoverGinzaBot/1.0; +https://discover.ginzawhiskers.com)'

function fingerprint(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[（）()［］\[\]【】「」『』・,、。／/\\|｜\s]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** sitemap.xmlから /ginza/events/food/sweets/YYYYMMDD 形式のURLを列挙する。 */
async function findWeeklyUrls(): Promise<{ url: string; date: string }[]> {
  const res = await fetch(SITEMAP_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`sitemap.xml 取得失敗: HTTP ${res.status}`)
  const xml = await res.text()
  const matches = [...xml.matchAll(/https:\/\/www\.matsuyaginza\.com\/jp\/ginza\/events\/food\/sweets\/(\d{8})/g)]
  return matches.map((m) => ({ url: m[0], date: m[1] })).sort((a, b) => a.date.localeCompare(b.date))
}

/** 本日以前で最新（＝「今週」に最も近い）の1件を選ぶ。無ければ最新の1件（未来含む）。 */
function pickCurrentWeek(urls: { url: string; date: string }[], todayYmd: string): { url: string; date: string } | null {
  if (urls.length === 0) return null
  const pastOrToday = urls.filter((u) => u.date <= todayYmd)
  if (pastOrToday.length > 0) return pastOrToday[pastOrToday.length - 1]
  return urls[0]
}

async function main() {
  const now = new Date()
  const todayYmd = now.toISOString().slice(0, 10).replace(/-/g, '')

  if (!findChromeExecutable()) {
    console.log('Chrome実行ファイルが見つからないため、この環境では松屋銀座のJSレンダリング取得をスキップします（通常のHTTP取得のみ継続）。')
    process.exit(0)
  }

  const weeklyUrls = await findWeeklyUrls()
  const current = pickCurrentWeek(weeklyUrls, todayYmd)
  if (!current) {
    console.log('sitemap.xmlに /ginza/events/food/sweets/ 形式のURLが見つかりませんでした。')
    process.exit(0)
  }
  console.log(`対象ページ: ${current.url}（sitemap掲載日 ${current.date}）`)

  const fetched = await fetchJsRenderedPage(current.url)
  if (!fetched.ok || !fetched.text) {
    console.log(`取得失敗: ${fetched.errorMessage ?? '不明なエラー'}`)
    process.exit(fetched.featureUnavailable ? 0 : 1)
  }

  const parsed = extractMatsuyaSweetsWeekly(fetched.text)
  console.log(`開催期間: ${parsed.periodText ?? '公式記載なし'} ／ 場所: ${parsed.location ?? '公式記載なし'} ／ 店舗数: ${parsed.items.length}`)

  const period = parsed.periodText ? extractExplicitPeriod(parsed.periodText, { now }) : null
  const venue = parsed.location ? `松屋銀座 ${parsed.location}` : '松屋銀座'

  const payload = await getPayload({ config })
  const sourceDocs = await payload.find({
    collection: 'source-ledger',
    where: { sourceId: { equals: SOURCE_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const sourceDoc = sourceDocs.docs[0]
  if (!sourceDoc) throw new Error(`SOURCE_LEDGERに ${SOURCE_ID} が見つかりません`)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const item of parsed.items) {
    if (item.products.length === 0) {
      skipped++
      continue
    }
    for (const product of item.products) {
      const title = `松屋銀座 GINZAスイート｜${item.vendorName} ${product.name}`
      const articleUrl = `${current.url}#vendor=${slugify(item.vendorName)}&product=${slugify(product.name)}`
      const excerptParts = [item.description, product.priceYen != null ? `${product.priceYen}円` : null].filter(Boolean)
      const excerpt = excerptParts.join(' ').slice(0, 2000)
      const contentType = classifyContentType(articleUrl, title)
      const uxType = classifyUxType(title, excerpt, contentType)

      const data = {
        sourceSite: Number(sourceDoc.id),
        articleUrl,
        rawUrl: current.url,
        title,
        venue,
        excerpt,
        eventStartAt: period?.startIso ?? undefined,
        eventEndAt: period?.endIso ?? undefined,
        detectedAt: now.toISOString(),
        discoveryStatus: 'first_seen' as const,
        contentType,
        uxType,
        linkFingerprint: fingerprint(`${title}|${excerpt}`),
        articleFetchStatus: 'fetched' as const,
        lastCheckedAt: now.toISOString(),
        lastChangedAt: now.toISOString(),
      }

      if (DRY) {
        console.log(`  [dry-run] would upsert: ${title}（${product.priceYen ?? '公式記載なし'}円）`)
        continue
      }

      const existing = await payload.find({
        collection: 'discovered-content',
        where: { articleUrl: { equals: articleUrl } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (existing.docs[0]) {
        await payload.update({
          collection: 'discovered-content',
          id: existing.docs[0].id,
          overrideAccess: true,
          data: { ...data, discoveryStatus: 'unchanged' as const },
        })
        updated++
      } else {
        await payload.create({
          collection: 'discovered-content',
          overrideAccess: true,
          data: { ...data, curationStatus: 'inbox' },
        })
        created++
      }
    }
  }

  console.log(`結果: 新規 ${created} 件 / 更新 ${updated} 件 / スキップ（商品情報なし） ${skipped} 件`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
