// GINZA WHISKERS / Project 02（2026-09-14新設・同日改訂）— 松屋銀座「今週の
// GINZAスイート」週替わり催事の収集。
//
//   ./p2 matsuya-sweets-fetch [--dry-run]
//
// 背景：matsuyaginza.com はReact SPAで、通常のHTTP+HTML取得では実際の催事情報を
// 取得できない（2026-09-14確認）。当初はplaywright-core（この端末のGoogle Chrome）
// でレンダリングして読む方式を実装したが、**ローカルChrome依存を本番運用へ持ち込ま
// ない**という方針のため、次の優先順で本番Railway等でも動く経路へ切り替えた：
//   1. 公式埋め込みJSON（HTML内に状態を持つ形式）… matsuyaginza.comには無い（確認済み）
//   2. Storyblok公開Content Delivery API … ★採用。松屋銀座のフロントエンドが実際に
//      呼んでいる公開トークン（version=publishedのみ返す、秘密鍵ではない公開配信用）
//      を直接fetchする。ブラウザ・JavaScript実行不要——プレーンなHTTP fetchのみ。
//   3. sitemap.xml … ページ一覧（週替わりスラッグ）の発見に引き続き使用
//   4. 公式内部API（api.matsuyaginza.com） … 一般エンドポイントは403で不可、未使用
//
// **取得不能時の設計**：Storyblok APIが失敗した場合（トークン失効・スラッグ変更等）
// は候補を一切生成せず、SOURCE_LEDGERのhealthStatusへ`unreachable`を記録して
// 終了する（exit 0、致命的エラーとして扱わない——朝刊自動化チェーンの他フェーズを
// 止めない）。非公式情報・推測データによる補完はしない。
//
// **DB書き込みはDiscoveredContentの通常の新規作成・更新、SOURCE_LEDGERの
// healthStatus更新のみ。AI呼び出し・課金・記事生成・note操作は一切しない。**

import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import config from '../payload.config'
import { fetchMatsuyaStoryblokStory } from '../lib/crawler/fetchMatsuyaStoryblok'
import { flattenMatsuyaStoryblokStory } from '../lib/crawler/flattenStoryblokRichText'
import { extractMatsuyaSweetsWeekly } from '../lib/crawler/extractMatsuyaSweetsWeekly'
import { extractExplicitPeriod } from '../lib/pipeline/extractExplicitPeriod'
import { classifyContentType } from '../lib/crawler/classifyContentType'
import { classifyUxType } from '../lib/curation/uxType'
import { recordSourceHealth } from '../lib/sourceLedger/recordSourceHealth'

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
async function findWeeklyUrls(): Promise<{ url: string; slug: string; date: string }[]> {
  const res = await fetch(SITEMAP_URL, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`sitemap.xml 取得失敗: HTTP ${res.status}`)
  const xml = await res.text()
  const matches = [...xml.matchAll(/https:\/\/www\.matsuyaginza\.com\/(jp\/ginza\/events\/food\/sweets\/(\d{8}))/g)]
  // Storyblok Content Delivery APIは`language=jp`パラメータでロケールを指定する方式のため、
  // フルスラッグ先頭の`jp/`（ロケールフォルダ）は取り除いたものをAPI呼び出しに使う
  // （2026-09-14実データ確認：`jp/`を含めると404、除いた`ginza/events/...`で200）。
  return matches
    .map((m) => ({ url: `https://www.matsuyaginza.com/${m[1]}`, slug: m[1].replace(/^jp\//, ''), date: m[2] }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 本日以前で最新（＝「今週」に最も近い）の1件を選ぶ。無ければ最新の1件（未来含む）。 */
function pickCurrentWeek<T extends { date: string }>(urls: T[], todayYmd: string): T | null {
  if (urls.length === 0) return null
  const pastOrToday = urls.filter((u) => u.date <= todayYmd)
  if (pastOrToday.length > 0) return pastOrToday[pastOrToday.length - 1]
  return urls[0]
}

async function main() {
  const now = new Date()
  const todayYmd = now.toISOString().slice(0, 10).replace(/-/g, '')
  const payload = await getPayload({ config })

  let weeklyUrls: { url: string; slug: string; date: string }[]
  try {
    weeklyUrls = await findWeeklyUrls()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`sitemap.xml 取得失敗: ${msg}`)
    if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'unreachable', `sitemap.xml取得失敗: ${msg}`)
    process.exit(0)
  }
  const current = pickCurrentWeek(weeklyUrls, todayYmd)
  if (!current) {
    console.log('sitemap.xmlに /ginza/events/food/sweets/ 形式のURLが見つかりませんでした。')
    if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'unreachable', 'sitemap.xmlに週替わりGINZAスイートページが見つからない')
    process.exit(0)
  }
  console.log(`対象ページ: ${current.url}（sitemap掲載日 ${current.date}）`)

  const storyResult = await fetchMatsuyaStoryblokStory(current.slug)
  if (!storyResult.ok || !storyResult.content) {
    const msg = storyResult.errorMessage ?? '不明なエラー'
    console.log(`Storyblok API 取得失敗: ${msg}`)
    if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'unreachable', `Storyblok API取得失敗（${current.slug}）: ${msg}`)
    process.exit(0)
  }

  const flatText = flattenMatsuyaStoryblokStory(storyResult.content)
  if (!flatText) {
    console.log('Storyblokストーリーからテキストを抽出できませんでした（richTextブロックが無い）。')
    if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'unreachable', `Storyblokストーリーにテキストなし（${current.slug}）`)
    process.exit(0)
  }

  const parsed = extractMatsuyaSweetsWeekly(flatText)
  console.log(`開催期間: ${parsed.periodText ?? '公式記載なし'} ／ 場所: ${parsed.location ?? '公式記載なし'} ／ 店舗数: ${parsed.items.length}`)

  if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'ok', `Storyblok API経由で取得成功（${current.slug}、店舗${parsed.items.length}件）`)

  const period = parsed.periodText ? extractExplicitPeriod(parsed.periodText, { now }) : null
  const venue = parsed.location ? `松屋銀座 ${parsed.location}` : '松屋銀座'

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
