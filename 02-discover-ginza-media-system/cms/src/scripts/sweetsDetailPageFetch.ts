// GINZA WHISKERS / Project 02（2026-09-11）— スウィーツ情報源の詳細ページ追跡（Stage 2 補完）。
//
// 【背景】`./p2 crawl` の Stage 2（個別ページ実取得）は全サイト共有の予算
// （既定20件/回、runCrawl.ts）を DB 登録順に消費する。新しく追加したスウィーツ
// 情報源は既存Core Sourceより後に処理されるため、共有予算が尽きた状態で
// 順番が回ってきて Stage 2 が一度も実行されず、`articleFetchStatus='not_fetched'`
// のまま excerpt（内容）・venue（場所）・日付が空欄になっていた。
//
// 【このスクリプトの役割】`./p2 crawl` を再実行するのではなく、対象ソース発の
// `discovered-content` のうち `articleFetchStatus != 'fetched'` の行だけを対象に、
// 既存の汎用抽出器（fetchArticleMetadata＝JSON-LD/meta description/見出し/日付/
// 会場を Tier1〜3 で決定的に抽出、robots.txt 準拠・4MB上限・15秒タイムアウト）を
// そのまま呼び出し、1回だけ追加のStage 2実行を行う。リンク抽出・同一ドメイン
// 制限・一覧/企業情報/採用情報の除外は Stage 1（discoverListingPages/extractLinks/
// urlGranularity）が既に適用済みの結果を対象にするため、このスクリプトでは
// 新たな抽出ロジックは実装しない（情報源別adapterの追加も今回は不要だった）。
//
// DB書き込みは対象行の title/excerpt/contentType/日付/venue/imageUrl/
// dateExtraction/articleFetchStatus のみ（discoveryStatus・curationStatus・
// linkFingerprint には触れない＝Stage 1 の差分判定を壊さない）。

import { getPayload } from 'payload'
import config from '../payload.config'
import { fetchArticleMetadata } from '../lib/crawler/fetchArticlePage'
import { normalizeFloorTokens } from '../lib/crawler/normalizeVenueText'
import { classifyUxType } from '../lib/curation/uxType'

const TARGET_SOURCE_NAMES = [
  '銀座千疋屋',
  'HIGASHIYA GINZA',
  'とらや（TORAYA GINZA）',
  '銀座ウエスト（GINZA WEST）',
  '帝国ホテル 東京 ホテルショップ「ガルガンチュワ」',
  '銀座木村家（木村屋總本店）',
  '銀座あけぼの',
  'CAFE PAULISTA（銀座カフェーパウリスタ）',
  '銀座菊廼舎',
  '空也（ぎんざ空也／空いろ）',
]
const PER_SOURCE_BUDGET = 8
const REQUEST_INTERVAL_MS = 350

const DRY = process.argv.includes('--dry-run')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const payload = await getPayload({ config })

  const { docs: sources } = await payload.find({
    collection: 'source-ledger',
    where: { name: { in: TARGET_SOURCE_NAMES } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  console.log(`対象情報源: ${sources.length} 件`)

  let totalAttempted = 0
  let totalSucceeded = 0
  const failureReasons = new Map<string, number>()

  for (const source of sources) {
    const { docs: pending } = await payload.find({
      collection: 'discovered-content',
      where: {
        and: [
          { sourceSite: { equals: source.id } },
          { articleFetchStatus: { not_equals: 'fetched' } },
          { curationStatus: { in: ['inbox', 'approved'] } },
        ],
      },
      limit: PER_SOURCE_BUDGET,
      depth: 0,
      overrideAccess: true,
      sort: '-detectedAt',
    })
    if (pending.length === 0) {
      console.log(`  [${source.name}] 対象0件（すべて取得済み、または候補なし）`)
      continue
    }
    console.log(`  [${source.name}] 対象 ${pending.length} 件（予算 ${PER_SOURCE_BUDGET} 件まで）`)

    for (const dc of pending) {
      totalAttempted++
      const url = String(dc.articleUrl ?? '')
      if (!url) continue
      if (DRY) {
        console.log(`    [dry-run] would fetch: ${url}`)
        continue
      }
      const fetched = await fetchArticleMetadata(url, source.sourceId as string)
      await sleep(REQUEST_INTERVAL_MS)
      if (!fetched.ok) {
        const reason = fetched.blockedByRobots ? 'robots.txtで禁止' : (fetched.errorMessage ?? '不明なエラー')
        failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1)
        await payload.update({
          collection: 'discovered-content',
          id: dc.id,
          overrideAccess: true,
          data: { articleFetchStatus: 'fetch_error', lastCheckedAt: new Date().toISOString() },
        })
        console.log(`    ✗ ${url} → ${reason}`)
        continue
      }
      totalSucceeded++
      const title = fetched.title ?? String(dc.title ?? '')
      const excerpt = fetched.excerpt
      const venue = fetched.venue.value ? normalizeFloorTokens(fetched.venue.value) : fetched.venue.value
      const uxType = classifyUxType(title, excerpt, fetched.contentType)
      await payload.update({
        collection: 'discovered-content',
        id: dc.id,
        overrideAccess: true,
        data: {
          title,
          excerpt: excerpt ?? undefined,
          contentType: fetched.contentType,
          uxType,
          publishedAt: fetched.publishedAt.value ?? undefined,
          contentUpdatedAt: fetched.updatedAt.value ?? undefined,
          eventStartAt: fetched.eventStartAt.value ?? undefined,
          eventEndAt: fetched.eventEndAt.value ?? undefined,
          venue: venue ?? undefined,
          imageUrl: fetched.imageUrl.value ?? undefined,
          imageUrlSource: fetched.imageUrl.source ?? undefined,
          dateExtraction: {
            publishedAt: fetched.publishedAt,
            contentUpdatedAt: fetched.updatedAt,
            eventStartAt: fetched.eventStartAt,
            eventEndAt: fetched.eventEndAt,
          },
          articleFetchStatus: 'fetched',
          lastCheckedAt: new Date().toISOString(),
        },
      })
      console.log(`    ✓ ${url}（excerpt ${excerpt?.length ?? 0}字／venue=${venue ?? 'なし'}／期間=${fetched.eventStartAt.value ?? '-'}〜${fetched.eventEndAt.value ?? '-'}）`)
    }
  }

  console.log(
    JSON.stringify({
      attempted: totalAttempted,
      succeeded: totalSucceeded,
      failed: totalAttempted - totalSucceeded,
      failureReasons: Object.fromEntries(failureReasons),
    }),
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
