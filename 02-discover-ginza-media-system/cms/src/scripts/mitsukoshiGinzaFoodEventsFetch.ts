// GINZA WHISKERS / Project 02（2026-09-16続き8新設）— 銀座三越 食料品催事・
// ショップニュースの収集（食料品イベントスケジュール／本館地下2階ショップ
// ニュース／期間限定出店情報）。
//
//   ./p2 mitsukoshi-food-events-fetch [--dry-run]
//
// 【現状（2026-09-16実測）】mistore.jp は sitemap・RSS・埋め込みJSON・内部API の
// 全経路でネットワーク層の接続不能（TCP接続タイムアウト／WAFによる403）が
// 継続している——2026-08-16・2026-09-11・2026-09-13・本日と繰り返し確認済み
// （./p2 mitsukoshi-health-check、SOURCE_LEDGERのhealthStatusを正とする）。
// 実ブラウザへのなりすましをしない方針（既存決定）の範囲では解決できない
// 外部要因のため、このスクリプトはSOURCE_LEDGERのhealthStatusが`unreachable`の
// 間は**候補を一切生成せず**、その旨を明示して終了する（非公式情報・推測データ
// による補完はしない）。
//
// healthStatusが`ok`（将来ブロックが解消した場合）になれば、対象URL（食料品
// イベントスケジュール・地下2階フロア・ショップニュース）を実際に取得し、
// extractMitsukoshiGinzaFoodEvents.ts（純粋関数）で催事・出店単位に分割する。
// **このHTML取得・テキスト化の実装は、実際のmistore.jpページ構造を確認できて
// いないため未検証**——healthStatusがok化した最初の実行で、抽出結果を必ず
// 目視確認すること。
//
// **DB書き込みはDiscoveredContentの通常の新規作成・更新のみ。AI呼び出し・
// 課金・記事生成・note操作は一切しない。**

import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import config from '../payload.config'
import { extractMitsukoshiGinzaFoodEvents } from '../lib/crawler/extractMitsukoshiGinzaFoodEvents'
import { extractExplicitPeriod } from '../lib/pipeline/extractExplicitPeriod'
import { classifyContentType } from '../lib/crawler/classifyContentType'
import { classifyUxType } from '../lib/curation/uxType'
import { decideMitsukoshiFetchGate } from '../lib/crawler/mitsukoshiFetchGate'

const DRY = process.argv.includes('--dry-run')
const SOURCE_ID = 'mitsukoshi-ginza'
const USER_AGENT = 'Mozilla/5.0 (compatible; GinzaWhiskersDiscoverGinzaBot/1.0; +https://discover.ginzawhiskers.com)'
const TIMEOUT_MS = 10_000

// マロン指示で確認済みの対象URL（食料品イベントスケジュール／地下2階フロア／
// 食品催場ショップニュース）。
const TARGET_URLS = [
  'https://www.mistore.jp/store/ginza/shops/foods/event_calendar.html',
  'https://www.mistore.jp/store/ginza/shops/floorB2.html',
  'https://www.mistore.jp/store/ginza/shops/foods/foodgarden/shopnews_list/shopnews_074.html',
]

function fingerprint(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** 簡易HTML→テキスト変換（タグ除去のみ・未検証——実際のページ構造が確認でき次第見直す）。 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fetchText(url: string): Promise<{ ok: boolean; text: string; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
    if (!res.ok) return { ok: false, text: '', error: `HTTP ${res.status}` }
    const html = await res.text()
    return { ok: true, text: htmlToPlainText(html) }
  } catch (e) {
    return { ok: false, text: '', error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const now = new Date()
  const payload = await getPayload({ config })

  const sourceDocs = await payload.find({
    collection: 'source-ledger',
    where: { sourceId: { equals: SOURCE_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const sourceDoc = sourceDocs.docs[0] as unknown as { id: number | string; healthStatus?: string; healthNote?: string } | undefined
  if (!sourceDoc) throw new Error(`SOURCE_LEDGERに ${SOURCE_ID} が見つかりません`)

  // 【2026-09-17改訂・マロン指示：取得障害時の安全動作】決定的ゲート（純粋関数・
  // mitsukoshiFetchGate.ts、単体テスト済み）で判定する。「該当情報0件」と
  // 「sourceUnavailable（取得不能で確認できていない）」を明確に区別するため、
  // ゲートで止めた場合は非0件的な「0件検出」を装わず、その旨を明示して終了する。
  const gate = decideMitsukoshiFetchGate(sourceDoc)
  if (!gate.proceed) {
    console.log(
      `銀座三越（mistore.jp）は sourceUnavailable のため候補を生成しません（${gate.reason}）。` +
        `先に ./p2 mitsukoshi-health-check で最新の到達可否を確認してください。` +
        `非公式情報・推測データによる補完はしません（fixtureデータも本番候補には使用しません）。`,
    )
    process.exit(0)
  }

  let created = 0
  let updated = 0
  let candidatesTotal = 0
  const fetchFailures: string[] = []

  for (const url of TARGET_URLS) {
    const fetched = await fetchText(url)
    if (!fetched.ok) {
      fetchFailures.push(`${url}（${fetched.error}）`)
      continue
    }
    const events = extractMitsukoshiGinzaFoodEvents(fetched.text, (line) => extractExplicitPeriod(line, { now }))
    candidatesTotal += events.length

    for (const ev of events) {
      const productLabel = ev.products[0] ?? ev.brand
      const title = `銀座三越｜${ev.brand} ${productLabel}`.trim()
      const articleUrl = `${url}#brand=${encodeURIComponent(ev.brand)}`
      const excerpt = [ev.periodText, ...ev.products].filter(Boolean).join(' / ').slice(0, 1300)
      const contentType = classifyContentType(articleUrl, title)
      const uxType = classifyUxType(title, excerpt, contentType)

      const data = {
        sourceSite: Number(sourceDoc.id),
        articleUrl,
        rawUrl: url,
        title,
        venue: '銀座三越',
        excerpt,
        eventStartAt: ev.startIso ?? undefined,
        eventEndAt: ev.endIso ?? undefined,
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
        console.log(`  [dry-run] would upsert: ${title}（期間: ${ev.periodText ?? '公式記載なし'}）`)
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

  if (fetchFailures.length > 0) console.log(`取得失敗: ${fetchFailures.join(' / ')}`)
  console.log(`結果: 候補${candidatesTotal}件検出 / 新規 ${created} 件 / 更新 ${updated} 件`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
