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
import {
  classifyFailureReason,
  loadUrlHealthRegistry,
  recordUrlHealth,
  saveUrlHealthRegistry,
  shouldSkipUrl,
} from '../lib/crawler/urlHealthRegistry'
import path from 'node:path'

// 2026-09-22: 403/404/非HTMLレスポンス等の恒久失敗URLへ毎日同じリクエストを
// 繰り返さないよう、ファイルベースのURL健全性レジストリ（DBスキーマ変更なし）で
// cooldown期間中はスキップする（urlHealthRegistry.ts参照）。アクセス制限の
// 回避は行わない——ここでは「いつ・何回試すか」だけを制御する。
// パス解決はqueueWriter.tsと同じ規約（cwd=cms/を前提にROOTを1つ上に解決）。
const ROOT = path.resolve(process.cwd(), '..')
const URL_HEALTH_REGISTRY_PATH = path.join(ROOT, '.devlogs', 'crawler', 'url-health-registry.json')

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
  // 2026-09-12 追加（BEAUTY 母数拡充）
  'SHISEIDO THE STORE（銀座）',
  'AYURA GINZA',
  // 2026-09-12 続き（デパ地下ブランド母数拡充）
  'ピエール・エルメ・パリ（PIERRE HERMÉ PARIS）',
  'DALLOYAU（ダロワイヨ）',
  'アンリ・シャルパンティエ（銀座メゾン）',
  'GODIVA（ゴディバ）',
  // 2026-09-12 続き2（デパ地下・路面店ブランドの本格拡張）
  'ブールミッシュ（銀座本店）',
  'ジャン＝ポール・エヴァン（JEAN-PAUL HÉVIN JAPON）',
  'フレデリック・カッセル（Frédéric Cassel）',
  'ルノートル（LENÔTRE）',
  '銀座コージーコーナー（銀座一丁目本店）',
  '銀座若菜（株式会社若菜）',
  // 2026-09-13 追加（銀茶会オリジナル和菓子13店の優先調査）
  '木挽町よしや',
  '清月堂本店',
  '東京凮月堂銀座',
  '宗家源吉兆庵',
  '銀座 松﨑煎餅',
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
  let totalSkippedCooldown = 0
  const failureReasons = new Map<string, number>()
  const nowISO = new Date().toISOString()
  let urlHealth = loadUrlHealthRegistry(URL_HEALTH_REGISTRY_PATH)

  for (const source of sources) {
    // cooldown中のURLをこの場で除外できるよう、予算の数倍を取得してから絞り込む
    // （既知の恒久失敗URLに予算を無駄遣いしない。DBクエリ自体は既存のまま）。
    const { docs: candidates } = await payload.find({
      collection: 'discovered-content',
      where: {
        and: [
          { sourceSite: { equals: source.id } },
          { articleFetchStatus: { not_equals: 'fetched' } },
          { curationStatus: { in: ['inbox', 'approved'] } },
        ],
      },
      limit: PER_SOURCE_BUDGET * 4,
      depth: 0,
      overrideAccess: true,
      sort: '-detectedAt',
    })
    const skippedForCooldown = candidates.filter((dc) =>
      shouldSkipUrl(urlHealth[String(dc.articleUrl ?? '')], nowISO),
    )
    totalSkippedCooldown += skippedForCooldown.length
    const pending = candidates
      .filter((dc) => !shouldSkipUrl(urlHealth[String(dc.articleUrl ?? '')], nowISO))
      .slice(0, PER_SOURCE_BUDGET)
    if (pending.length === 0) {
      const cooldownNote = skippedForCooldown.length > 0 ? `（既知の取得不能URL ${skippedForCooldown.length}件をcooldown中のためスキップ）` : ''
      console.log(`  [${source.name}] 対象0件（すべて取得済み、または候補なし）${cooldownNote}`)
      continue
    }
    const cooldownNote = skippedForCooldown.length > 0 ? `／既知の取得不能URL ${skippedForCooldown.length}件はcooldown中のためスキップ` : ''
    console.log(`  [${source.name}] 対象 ${pending.length} 件（予算 ${PER_SOURCE_BUDGET} 件まで）${cooldownNote}`)

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
        // robots.txt禁止は「アクセス制限の回避をしない」対象そのものなので、
        // cooldown対象（=このURLへの再アクセスを止める）には含めない——
        // 単に次回以降も同じ理由でスキップされ続けるだけで害はないが、
        // 意味上は「恒久失敗」ではなく「そもそも取得しない」ため区別しておく。
        if (!fetched.blockedByRobots) {
          const { category, detail } = classifyFailureReason({
            httpStatus: fetched.httpStatus,
            contentTypeMismatch: (fetched.errorMessage ?? '').includes('非HTMLレスポンス'),
            errorMessage: fetched.errorMessage,
          })
          urlHealth = recordUrlHealth(urlHealth, url, {
            status: 'unreachable',
            reasonCategory: category,
            reasonDetail: detail,
            lastCheckedAt: nowISO,
            sourceId: source.sourceId as string,
          })
        }
        console.log(`    ✗ ${url} → ${reason}`)
        continue
      }
      urlHealth = recordUrlHealth(urlHealth, url, {
        status: 'ok',
        lastCheckedAt: nowISO,
        sourceId: source.sourceId as string,
      })
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

  // 【2026-09-24追加】registry保存は「いつ・何回試すか」を最適化するための
  // 副次的な記録であり、本フェーズの主目的（DiscoveredContentの取得・更新、
  // 既にループ内でpayload.update()により個別に永続化済み）とは独立している。
  // 保存自体が失敗しても、既に成功したDC更新を無駄にして全体をクラッシュさせず
  // 警告として記録するだけに留める（直近の実障害＝ディレクトリ未作成はmkdirSyncで
  // 解消済みだが、権限エラー等の別要因での再発時にも同じ理由で本フェーズ全体を
  // 失敗扱いにしない防御）。
  let registrySaveError: string | null = null
  if (!DRY) {
    try {
      saveUrlHealthRegistry(URL_HEALTH_REGISTRY_PATH, urlHealth)
    } catch (err) {
      registrySaveError = err instanceof Error ? err.message : String(err)
      console.error(`  ⚠ URL健全性レジストリの保存に失敗しました（DC更新自体は成功済みのため処理は継続します）: ${registrySaveError}`)
    }
  }

  console.log(
    JSON.stringify({
      attempted: totalAttempted,
      succeeded: totalSucceeded,
      failed: totalAttempted - totalSucceeded,
      skippedCooldown: totalSkippedCooldown,
      failureReasons: Object.fromEntries(failureReasons),
      registrySaveError,
    }),
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
