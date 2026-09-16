// GINZA WHISKERS / Project 02（2026-09-16続き8新設）— 松屋銀座「グルメ」一覧
// （ginza/events/gourmet）に掲載されている個別の催事・フェア・商品紹介ページを、
// 一覧ページ全体を1件にせず、個別ページ単位でDiscoveredContentへ保存する。
//
//   ./p2 matsuya-gourmet-fetch [--dry-run]
//
// 背景：既存の matsuya-sweets-fetch は「今週のGINZAスイート」1ページ専用だったが、
// マロン指示（グルメイベント／B1・B2食品売場／和洋菓子のショップニュース／
// 食品催場／期間限定商品・出店情報）はそれより広い。松屋銀座の「グルメ」一覧
// ページ自体が、これらの個別ページへのリンク集になっている（実データで確認、
// 2026-09-16：シルバーワインフェア・かき氷コレクション・松屋からの贈りもの・
// GINZAスイート・good nature market特別販売会等）。
//
// 取得経路は既存のStoryblok公開Content Delivery API（fetchMatsuyaStoryblok.ts、
// 2026-09-14確立済み）をそのまま再利用する——ブラウザ・JavaScript実行不要。
//
// **取得不能時の設計**：一覧ページ自体が取得できない場合は候補を一切生成せず、
// SOURCE_LEDGERのhealthStatusへ`unreachable`を記録して終了する（既存
// matsuya-sweets-fetchと同じ規律）。個別ページ単位の取得失敗は、その1件だけを
// スキップし全体は止めない（1件失敗で全体を止めない、既存の朝処理パイプラインと
// 同じ方針）。
//
// **DB書き込みはDiscoveredContentの通常の新規作成・更新、SOURCE_LEDGERの
// healthStatus更新のみ。AI呼び出し・課金・記事生成・note操作は一切しない。**

import { getPayload } from 'payload'
import { createHash } from 'node:crypto'
import config from '../payload.config'
import { fetchMatsuyaStoryblokStory } from '../lib/crawler/fetchMatsuyaStoryblok'
import { flattenMatsuyaStoryblokStory } from '../lib/crawler/flattenStoryblokRichText'
import { discoverMatsuyaGourmetEventLinks, pickMatsuyaEventTitle } from '../lib/crawler/extractMatsuyaGourmetEvents'
import { extractExplicitPeriod } from '../lib/pipeline/extractExplicitPeriod'
import { classifyContentType } from '../lib/crawler/classifyContentType'
import { classifyUxType } from '../lib/curation/uxType'
import { recordSourceHealth } from '../lib/sourceLedger/recordSourceHealth'

const DRY = process.argv.includes('--dry-run')
const GOURMET_SLUG = 'ginza/events/gourmet'
const SOURCE_ID = 'matsuya-ginza'

function fingerprint(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

async function main() {
  const now = new Date()
  const payload = await getPayload({ config })

  const listingResult = await fetchMatsuyaStoryblokStory(GOURMET_SLUG)
  if (!listingResult.ok || !listingResult.content) {
    const msg = listingResult.errorMessage ?? '不明なエラー'
    console.log(`グルメ一覧ページ取得失敗: ${msg}`)
    if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'unreachable', `グルメ一覧Storyblok API取得失敗: ${msg}`)
    process.exit(0)
  }

  const links = discoverMatsuyaGourmetEventLinks(listingResult.content)
  console.log(`グルメ一覧から個別ページを${links.length}件検出`)
  if (links.length === 0) {
    if (!DRY) await recordSourceHealth(payload, SOURCE_ID, 'unreachable', 'グルメ一覧に個別イベントページのリンクが見つからない')
    process.exit(0)
  }

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
  let failed = 0
  const failedSlugs: string[] = []

  for (const link of links) {
    const storyResult = await fetchMatsuyaStoryblokStory(link.slug)
    if (!storyResult.ok || !storyResult.content) {
      failed++
      failedSlugs.push(link.slug)
      continue
    }
    const flatText = flattenMatsuyaStoryblokStory(storyResult.content)
    const title = pickMatsuyaEventTitle(storyResult.storyName, flatText)
    if (!title) {
      failed++
      failedSlugs.push(link.slug)
      continue
    }
    const displayTitle = `松屋銀座｜${title}`
    const period = flatText ? extractExplicitPeriod(flatText, { now }) : null
    const excerpt = flatText.slice(0, 1300) // DiscoveredContent.excerpt の maxLength（1300）に合わせる
    const contentType = classifyContentType(link.url, displayTitle)
    const uxType = classifyUxType(displayTitle, excerpt, contentType)

    const data = {
      sourceSite: Number(sourceDoc.id),
      articleUrl: link.url,
      rawUrl: link.url,
      title: displayTitle,
      venue: '松屋銀座',
      excerpt,
      eventStartAt: period?.startIso ?? undefined,
      eventEndAt: period?.endIso ?? undefined,
      detectedAt: now.toISOString(),
      discoveryStatus: 'first_seen' as const,
      contentType,
      uxType,
      linkFingerprint: fingerprint(`${displayTitle}|${excerpt}`),
      articleFetchStatus: 'fetched' as const,
      lastCheckedAt: now.toISOString(),
      lastChangedAt: now.toISOString(),
    }

    if (DRY) {
      console.log(`  [dry-run] would upsert: ${displayTitle}（期間: ${period ? `${period.startIso.slice(0, 10)}〜${period.endIso.slice(0, 10)}` : '公式記載なし'}）`)
      continue
    }

    const existing = await payload.find({
      collection: 'discovered-content',
      where: { articleUrl: { equals: link.url } },
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

  if (!DRY) {
    const healthNote = `グルメ一覧経由でStoryblok API取得（${links.length}件検出・失敗${failed}件${failedSlugs.length ? `: ${failedSlugs.join(', ')}` : ''}）`
    await recordSourceHealth(payload, SOURCE_ID, failed === links.length && links.length > 0 ? 'unreachable' : 'ok', healthNote)
  }

  console.log(`結果: 新規 ${created} 件 / 更新 ${updated} 件 / 取得失敗（個別ページ・スキップ） ${failed} 件`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exit(1)
})
