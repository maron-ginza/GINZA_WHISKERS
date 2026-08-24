import type { Payload } from 'payload'

import { determineDiffStatus, type DiffStatus } from './diff'
import { fetchListingPageLinks } from './fetchListingPage'
import { fetchSourceContent } from './fetchSource'
import { mergeDiscoveredLinks } from './mergeDiscoveredLinks'
import { normalizeArticleUrl } from './normalizeUrl'
import { processDiscoveredLinks, type ProcessLinksStats } from './processDiscoveredLinks'
import type { ListingPageCandidate } from './discoverListingPages'

// SOURCE LEDGER 自動巡回オーケストレーター（2026-08-16）。
//
// SourceLedger（cms/src/collections/SourceLedger.ts）で enabled:true の情報源を
// 「唯一の巡回元」として動的に読み込み（14件のCore Sourceをハードコードしない）、
// 1件ずつ順にHTTP取得→前回の成功Snapshotとの差分判定→Snapshot保存、を行う。
// 1件が失敗しても残りの処理は継続する（Promise.allSettled的に個別try/catch）。
//
// 【2026-08-17追加】トップページ取得が成功した場合、そのHTML上で見つかった
// 記事・イベントらしきリンク（fetchSourceContentが同一の取得結果として返す
// outcome.links）を processDiscoveredLinks に渡し、個別記事・イベント単位の
// DiscoveredContentへ反映する。既存のSnapshot保存・diff判定ロジックは一切
// 変更していない（追加のステップとして末尾に足しただけ）。Stage 2（個別ページの
// 実HTTP取得）は1巡回あたりの合計予算（articleStage2Budget）を全サイトで共有し、
// サイトの巡回順に消費していく——予算を使い切った後のサイトはStage 1（リンク一覧・
// アンカーテキストのみ）の反映に留まる。

export interface CrawlSourceResult {
  sourceId: string
  name: string
  url: string | null
  diffStatus: DiffStatus
  httpStatus: number | null
  contentLength: number | null
  title: string | null
  errorMessage: string | null
  blockedByRobots: boolean
  attemptCount: number
  snapshotId: string | number | null
}

export interface CrawlSkippedEntry {
  sourceId: string
  name: string
  reason: string
}

export interface CrawlSummary {
  unchanged: number
  changed: number
  first_seen: number
  fetch_error: number
}

export interface ListingPageDiscoveryStats {
  /** 巡回対象サイト数（enabled数、CrawlResult.scannedSourcesと同じ母数） */
  sitesScanned: number
  /** 1件以上の一覧ページ候補（自動発見＋手動override、予算適用前）を持てたサイト数 */
  sitesWithListingPages: number
  /** 全サイト合計の発見済み一覧ページ候補数（自動発見＋手動override、予算適用前） */
  totalDiscovered: number
  /** 一覧ページへの実HTTP取得試行数（1サイトあたりの予算内のみ） */
  totalFetchAttempted: number
  /** 一覧ページへの実HTTP取得成功数 */
  totalFetchSucceeded: number
}

export interface CrawlResult {
  persisted: boolean
  scannedSources: number
  results: CrawlSourceResult[]
  skipped: CrawlSkippedEntry[]
  summary: CrawlSummary
  articleExtraction: ProcessLinksStats
  listingPageDiscovery: ListingPageDiscoveryStats
}

interface RunCrawlOptions {
  /** falseの場合、実際のHTTP取得は行うがDBへの書き込み（Snapshot作成・SourceLedger更新）は一切行わない */
  persist?: boolean
  /** falseの場合、個別記事・イベント抽出（Stage 1/2）自体を行わない（既定true） */
  extractArticles?: boolean
  /** 1巡回あたりのStage 2（個別ページ実取得）の合計予算。既定20（コスト制御） */
  articleStage2Budget?: number
  /**
   * 1サイトあたりの一覧ページ（NEWS/EVENT/EXHIBITION等）実取得の上限
   * （Source Coverage拡張、2026-08-17）。自動発見＋手動overrideの合算候補から
   * この件数までのみ実際にHTTP取得する（外部サイトへの負荷・巡回時間を
   * 抑えるコスト制御、既定3）。
   */
  listingPagesPerSiteBudget?: number
}

const DEFAULT_ARTICLE_STAGE2_BUDGET = 20
const DEFAULT_LISTING_PAGES_PER_SITE_BUDGET = 3

function emptyLinkStats(): ProcessLinksStats {
  return {
    scanned: 0,
    firstSeen: 0,
    changed: 0,
    unchanged: 0,
    stage2Attempted: 0,
    stage2Succeeded: 0,
    publishedDatesFound: 0,
    eventDatesFound: 0,
    duplicatesRemoved: 0,
    errors: 0,
  }
}

function mergeLinkStats(a: ProcessLinksStats, b: ProcessLinksStats): ProcessLinksStats {
  return {
    scanned: a.scanned + b.scanned,
    firstSeen: a.firstSeen + b.firstSeen,
    changed: a.changed + b.changed,
    unchanged: a.unchanged + b.unchanged,
    stage2Attempted: a.stage2Attempted + b.stage2Attempted,
    stage2Succeeded: a.stage2Succeeded + b.stage2Succeeded,
    publishedDatesFound: a.publishedDatesFound + b.publishedDatesFound,
    eventDatesFound: a.eventDatesFound + b.eventDatesFound,
    duplicatesRemoved: a.duplicatesRemoved + b.duplicatesRemoved,
    errors: a.errors + b.errors,
  }
}

export async function runSourceLedgerCrawl(
  payload: Payload,
  options: RunCrawlOptions = {},
): Promise<CrawlResult> {
  const persist = options.persist ?? true
  const extractArticles = options.extractArticles ?? true
  let remainingArticleStage2Budget = options.articleStage2Budget ?? DEFAULT_ARTICLE_STAGE2_BUDGET
  const listingPagesPerSiteBudget = options.listingPagesPerSiteBudget ?? DEFAULT_LISTING_PAGES_PER_SITE_BUDGET

  const { docs: enabledSources } = await payload.find({
    collection: 'source-ledger',
    where: { enabled: { equals: true } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const results: CrawlSourceResult[] = []
  const skipped: CrawlSkippedEntry[] = []
  const summary: CrawlSummary = { unchanged: 0, changed: 0, first_seen: 0, fetch_error: 0 }
  let articleExtraction: ProcessLinksStats = emptyLinkStats()
  const listingPageDiscovery: ListingPageDiscoveryStats = {
    sitesScanned: enabledSources.length,
    sitesWithListingPages: 0,
    totalDiscovered: 0,
    totalFetchAttempted: 0,
    totalFetchSucceeded: 0,
  }

  for (const source of enabledSources) {
    const sourceId = String(source.sourceId)
    const name = String(source.name)
    const url = typeof source.url === 'string' ? source.url : ''

    if (!/^https?:\/\//.test(url)) {
      // enabled:trueにはbeforeValidateでurl必須が強制されているため通常到達しないが、
      // データ不整合に対する防御として明示的にスキップし、全体処理は止めない。
      skipped.push({ sourceId, name, reason: 'urlが未設定または不正のためスキップ' })
      continue
    }

    try {
      const outcome = await fetchSourceContent(url)
      const fetchedAt = new Date().toISOString()

      // 差分の比較対象は「直近で取得に成功し、かつnormalizedContentHashを持つSnapshot」。
      // 取得失敗を挟んでも意味のある比較ができるよう成功回のみを対象にし、さらに
      // 2026-08-16のnormalizedContentHash導入より前に作成された旧形式Snapshot（この
      // フィールドを持たない）は比較対象から除外する——古い生バイト列ハッシュと新しい
      // 正規化ハッシュを比較すると常に不一致になり誤って`changed`になってしまうため、
      // 旧形式しか存在しない場合は`first_seen`（＝新アルゴリズムでの再基準化）として扱う。
      const { docs: previousSuccessDocs } = await payload.find({
        collection: 'source-snapshots',
        where: {
          and: [
            { sourceLedger: { equals: source.id } },
            { success: { equals: true } },
            { normalizedContentHash: { exists: true } },
          ],
        },
        sort: '-fetchedAt',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const previousSuccess = previousSuccessDocs[0] ?? null
      const previousHash =
        previousSuccess && typeof previousSuccess.normalizedContentHash === 'string'
          ? previousSuccess.normalizedContentHash
          : null

      const diffStatus = determineDiffStatus(outcome.ok, outcome.normalizedContentHash, previousHash)
      summary[diffStatus] += 1

      let snapshotId: string | number | null = null

      if (persist) {
        const snapshotDoc = await payload.create({
          collection: 'source-snapshots',
          overrideAccess: true,
          data: {
            sourceLedger: source.id,
            sourceId,
            sourceName: name,
            url,
            fetchedAt,
            httpStatus: outcome.httpStatus,
            success: outcome.ok,
            contentHash: outcome.contentHash,
            normalizedContentHash: outcome.normalizedContentHash,
            contentLength: outcome.contentLength,
            contentType: outcome.contentType,
            title: outcome.title,
            excerpt: outcome.excerpt,
            errorMessage: outcome.errorMessage,
            blockedByRobots: outcome.blockedByRobots,
            attemptCount: outcome.attemptCount,
            diffStatus,
            previousSnapshot: previousSuccess ? previousSuccess.id : undefined,
          },
        })
        snapshotId = snapshotDoc.id

        const ledgerUpdate: Record<string, unknown> = { lastCheckedAt: fetchedAt }
        if (diffStatus === 'changed') {
          ledgerUpdate.lastChangedAt = fetchedAt
        }
        // 自動発見済み一覧ページ候補を、直近の巡回結果として監査用に保存する
        // （手動overrideは含めない——あちらは人間が入力した設定であり、
        // discoveredListingPagesは「今回自動発見できたもの」の記録のため）。
        ledgerUpdate.discoveredListingPages = outcome.listingPageCandidates

        await payload.update({
          collection: 'source-ledger',
          id: source.id,
          overrideAccess: true,
          data: ledgerUpdate,
        })
      }

      // 一覧ページ（NEWS/EVENT/EXHIBITION等）の発見・追加巡回（Source Coverage
      // 拡張、2026-08-17）。トップページ取得が成功した場合のみ、自動発見済み
      // 候補（outcome.listingPageCandidates）と手動override
      // （source.listingPageOverrides）を合算し、正規化URLで重複除去したうえで
      // 1サイトあたりの予算（listingPagesPerSiteBudget）まで実際にHTTP取得する。
      // 各一覧ページからも記事・イベントリンクを抽出し（extractGinzaRelevantLinksを
      // 再利用、トップページと同じロジック）、トップページ由来のリンクと統合する。
      let mergedLinks = outcome.links
      let mergedDuplicatesRemoved = outcome.linksDuplicatesRemoved

      if (extractArticles && outcome.ok) {
        const overrideCandidates: ListingPageCandidate[] = Array.isArray(source.listingPageOverrides)
          ? (source.listingPageOverrides as Array<{ url?: string }>)
              .map((entry) => {
                const normalized = typeof entry.url === 'string' ? normalizeArticleUrl(entry.url, url) : null
                return normalized ? { url: normalized, anchorText: '(手動override)', matchedKeyword: 'OVERRIDE' } : null
              })
              .filter((c): c is ListingPageCandidate => c !== null)
          : []

        const candidateMap = new Map<string, ListingPageCandidate>()
        for (const c of [...outcome.listingPageCandidates, ...overrideCandidates]) {
          if (!candidateMap.has(c.url)) candidateMap.set(c.url, c)
        }
        const allCandidates = Array.from(candidateMap.values())

        listingPageDiscovery.totalDiscovered += allCandidates.length
        if (allCandidates.length > 0) listingPageDiscovery.sitesWithListingPages += 1

        const toFetch = allCandidates.slice(0, listingPagesPerSiteBudget)
        const listingPageLinkGroups: (typeof outcome.links)[] = []

        for (const candidate of toFetch) {
          listingPageDiscovery.totalFetchAttempted += 1
          const listingOutcome = await fetchListingPageLinks(candidate.url)
          if (listingOutcome.ok) {
            listingPageDiscovery.totalFetchSucceeded += 1
            listingPageLinkGroups.push(listingOutcome.links)
          }
        }

        const merged = mergeDiscoveredLinks(outcome.links, ...listingPageLinkGroups)
        mergedLinks = merged.links
        mergedDuplicatesRemoved = outcome.linksDuplicatesRemoved + merged.duplicatesRemoved
      }

      // 記事・イベントらしきリンクが1件以上見つかった場合のみ個別記事・イベント
      // 抽出（Stage 1/2）を行う。取得失敗時はmergedLinksが常に空配列のため、
      // この分岐は自然にスキップされる。
      if (extractArticles && outcome.ok && mergedLinks.length > 0) {
        const linkStats = await processDiscoveredLinks({
          payload,
          sourceLedgerId: source.id,
          sourceStableId: sourceId,
          links: mergedLinks,
          now: new Date(fetchedAt),
          persist,
          stage2Budget: remainingArticleStage2Budget,
        })
        linkStats.duplicatesRemoved = mergedDuplicatesRemoved
        remainingArticleStage2Budget -= linkStats.stage2Attempted
        articleExtraction = mergeLinkStats(articleExtraction, linkStats)
      }

      results.push({
        sourceId,
        name,
        url,
        diffStatus,
        httpStatus: outcome.httpStatus,
        contentLength: outcome.contentLength,
        title: outcome.title,
        errorMessage: outcome.errorMessage,
        blockedByRobots: outcome.blockedByRobots,
        attemptCount: outcome.attemptCount,
        snapshotId,
      })
    } catch (err) {
      // fetchSourceContent自体は内部でtry/catchしエラーを返す設計だが、
      // Payload呼び出し（find/create/update）側の例外もここで吸収し、
      // 1件の異常で巡回全体を止めない。
      summary.fetch_error += 1
      results.push({
        sourceId,
        name,
        url,
        diffStatus: 'fetch_error',
        httpStatus: null,
        contentLength: null,
        title: null,
        errorMessage: err instanceof Error ? err.message : String(err),
        blockedByRobots: false,
        attemptCount: 0,
        snapshotId: null,
      })
    }
  }

  return {
    persisted: persist,
    scannedSources: enabledSources.length,
    results,
    skipped,
    summary,
    articleExtraction,
    listingPageDiscovery,
  }
}
