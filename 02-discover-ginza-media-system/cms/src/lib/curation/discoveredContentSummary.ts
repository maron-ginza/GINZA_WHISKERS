import type { Payload } from 'payload'

import { deriveEventStatus, isUpcomingSoon, UPCOMING_WINDOW_DAYS } from './eventStatus'
import { computeStoryClusters, type ClusterableItem } from './storyClustering'

// DiscoveredContent（個別記事・イベント）の現在状態サマリー（2026-08-17、
// Event Date Extraction/Story Clustering拡張で更新）。読み取り専用——
// 「今回のローカル検証」で求められる集計（DiscoveredContent総数・日付取得
// 成功件数/率・ongoing件数・upcoming件数・Story Cluster数・統合された
// 重複コンテンツ数等）をDB全体の現在値として算出する。
// 「抽出総数」「重複除外件数」は1回の巡回実行の結果（runCrawl.tsの
// articleExtraction）が正本のため、ここでは計算しない。

export interface DiscoveredContentSummary {
  totalUnique: number
  publishedAtCount: number
  eventDateCount: number
  /** publishedAt/contentUpdatedAt/eventStartAt/eventEndAtのいずれか1つでも取得できた件数 */
  anyDateCount: number
  anyDateRate: number
  ongoingCount: number
  /** deriveEventStatusが'upcoming'を返した件数（開始日が未来と確定できるもの全体） */
  upcomingCount: number
  /** upcomingCountの部分集合：UPCOMING_WINDOW_DAYS（既定14日）以内に開始するもの（Daily候補Dの母集団と一致） */
  upcomingSoonCount: number
  upcomingWindowDays: number
  endedCount: number
  unknownEventStatusCount: number
  todayNewOrChangedCount: number
  byContentType: Record<string, number>
  byDiscoveryStatus: Record<string, number>
  clusterCount: number
  singletonClusterCount: number
  multiMemberClusterCount: number
  /** 複数メンバークラスタに属する候補の総数（＝重複として統合された件数の母数） */
  consolidatedDuplicateCount: number
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export async function getDiscoveredContentSummary(
  payload: Payload,
  options: { now?: Date } = {},
): Promise<DiscoveredContentSummary> {
  const now = options.now ?? new Date()

  const { docs, totalDocs } = await payload.find({
    collection: 'discovered-content',
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })

  const byContentType: Record<string, number> = {}
  const byDiscoveryStatus: Record<string, number> = {}
  let publishedAtCount = 0
  let eventDateCount = 0
  let anyDateCount = 0
  let ongoingCount = 0
  let upcomingCount = 0
  let upcomingSoonCount = 0
  let endedCount = 0
  let unknownEventStatusCount = 0
  let todayNewOrChangedCount = 0

  for (const doc of docs) {
    byContentType[doc.contentType] = (byContentType[doc.contentType] ?? 0) + 1
    byDiscoveryStatus[doc.discoveryStatus] = (byDiscoveryStatus[doc.discoveryStatus] ?? 0) + 1

    if (doc.publishedAt) publishedAtCount += 1
    if (doc.eventStartAt || doc.eventEndAt) eventDateCount += 1
    if (doc.publishedAt || doc.contentUpdatedAt || doc.eventStartAt || doc.eventEndAt) anyDateCount += 1

    // 2026-08-17、日付取得率改善セッションで修正：deriveEventStatusが
    // 'upcoming'を返すケース（開始日が未来と確定できるが14日超先の場合を
    // 含む）が、修正前はif/else-ifの分岐から漏れてunknownEventStatusCountに
    // 誤って計上されていた（ongoing/ended以外を全てunknown扱いする実装
    // ミス）。4分類（ongoing/upcoming/ended/unknown）が総数と一致する
    // 相互排他的な分類になるよう修正し、「14日以内の近日開催」
    // （Daily候補Dの母集団と一致）はupcomingCountとは別にupcomingSoonCount
    // として集計するようにした。
    const status = deriveEventStatus(doc.eventStartAt, doc.eventEndAt, now)
    if (status === 'ongoing') ongoingCount += 1
    else if (status === 'upcoming') upcomingCount += 1
    else if (status === 'ended') endedCount += 1
    else unknownEventStatusCount += 1
    if (isUpcomingSoon(doc.eventStartAt, now)) upcomingSoonCount += 1

    // lastChangedAtで判定する理由はdailyRanking.tsのコメント参照
    // （detectedAtは毎回更新されるため、同日複数回巡回すると当日発見分が
    // 漏れる。2026-08-17、実地テストで発見・修正）。
    // discoveryStatusのfirst_seen/changed判定もdailyRanking.tsのisNewToday/
    // isUpdatedTodayと必ず一致させる（2026-08-17、実地検証で発覚した不整合を
    // 修正：lastChangedAtのみで判定すると、discoveryStatusが'unchanged'の
    // ままlastChangedAtだけ過去に一度セットされた候補まで「本日新規/更新」
    // と誤カウントしていた）。
    const lastChangedAt = typeof doc.lastChangedAt === 'string' ? new Date(doc.lastChangedAt) : null
    const isToday =
      Boolean(lastChangedAt) && !Number.isNaN(lastChangedAt!.getTime()) && isSameCalendarDay(lastChangedAt!, now)
    const isNewOrChangedStatus = doc.discoveryStatus === 'first_seen' || doc.discoveryStatus === 'changed'
    if (isToday && isNewOrChangedStatus) {
      todayNewOrChangedCount += 1
    }
  }

  const clusterableItems: ClusterableItem[] = docs.map((d) => ({
    id: Number(d.id),
    sourceSiteId:
      typeof d.sourceSite === 'object' && d.sourceSite !== null
        ? Number((d.sourceSite as { id: number }).id)
        : Number(d.sourceSite),
    title: typeof d.title === 'string' ? d.title : '',
    articleUrl: typeof d.articleUrl === 'string' ? d.articleUrl : undefined,
    editorialScoreTotal: typeof d.editorialScore?.total === 'number' ? d.editorialScore.total : null,
    eventStartAt: d.eventStartAt ?? null,
    eventEndAt: d.eventEndAt ?? null,
  }))
  const clusters = computeStoryClusters(clusterableItems)
  const multiMemberClusters = clusters.filter((c) => c.memberIds.length > 1)

  return {
    totalUnique: totalDocs,
    publishedAtCount,
    eventDateCount,
    anyDateCount,
    anyDateRate: totalDocs > 0 ? anyDateCount / totalDocs : 0,
    ongoingCount,
    upcomingCount,
    upcomingSoonCount,
    upcomingWindowDays: UPCOMING_WINDOW_DAYS,
    endedCount,
    unknownEventStatusCount,
    todayNewOrChangedCount,
    byContentType,
    byDiscoveryStatus,
    clusterCount: clusters.length,
    singletonClusterCount: clusters.length - multiMemberClusters.length,
    multiMemberClusterCount: multiMemberClusters.length,
    consolidatedDuplicateCount: multiMemberClusters.reduce((sum, c) => sum + c.memberIds.length, 0),
  }
}
