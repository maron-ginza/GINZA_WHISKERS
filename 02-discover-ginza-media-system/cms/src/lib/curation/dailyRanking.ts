import type { Payload } from 'payload'

import { applyFacilityDiversity, type DiversityOptions } from './facilityDiversity'
import { deriveEventStatus, isUpcomingSoon, UPCOMING_WINDOW_DAYS, type EventStatus } from './eventStatus'
import { computeStoryClusters, type ClusterableItem } from './storyClustering'
import { deriveTemporalRelevance, type TemporalRelevanceTier } from './temporalRelevance'

// Daily Editorial Desk：毎朝の候補母集団の考え方（2026-08-17、マロン指示。
// 2026-08-17のStory Clustering/Event Date Extraction拡張で更新）。
//
// 毎朝の候補母集団は
//   A. 当日の巡回で新規または更新検知した個別記事（lastChangedAtが本日）
//   B. 現在開催中のイベント（eventStartAt <= 現在 <= eventEndAt、
//      Event Date Extraction・deriveEventStatusで判定）
//   C. 近日開催で今日知る価値があるイベント（eventStartAtが未来かつ
//      UPCOMING_WINDOW_DAYS以内、eventStatus.tsのisUpcomingSoon）
// のみを中心とする。過去Inboxに残っているだけの古い候補は自動的にTop候補へ
// 混入しない（判定はA/B/Cいずれもクラスタ内の「いずれかのメンバー」が
// 満たせばそのStory全体が対象になる）。
//
// 【Story Clustering統合】ランキングの単位は個別DiscoveredContentではなく
// Story Cluster（storyClustering.ts、同一イベント・企画の複数URLをまとめた
// もの）——「同一イベントの複数URLがDaily Top10を占有しない」ため。
// クラスタは都度computeStoryClustersで再計算する（永続化済みStoryClusters
// コレクションには依存しない——鮮度を保つため。永続化は
// persistStoryClusters.ts/`./p2 clusters`が別途担当する）。
//
// 【なぜdetectedAtではなくlastChangedAtで判定するか（2026-08-17、実地テストで
// 発見・修正）】`detectedAt`は巡回のたび（unchangedでも）更新される。
// `lastChangedAt`はfirst_seen/changedの回のみ更新されるため、同日複数回の
// 巡回があっても「今日はじめて動きがあった」ことを正確に表せる。

export type InclusionReasonCode = 'today_new' | 'today_updated' | 'ongoing' | 'upcoming_soon'
export type DisplayStatus = 'new' | 'updated' | 'ongoing' | 'upcoming' | 'unchanged'

export interface DailyRankingEntry {
  clusterKey: string
  representativeId: number
  storyTitle: string
  sourceSiteName: string | null
  /** 施設多様性判定に使う内部キー（sourceSiteのid文字列。名前衝突を避けるためnameではなくidを正とする） */
  sourceSiteId: string | null
  eventStartAt: string | null
  eventEndAt: string | null
  eventStatus: EventStatus
  displayStatus: DisplayStatus
  total: number
  /** 本文情報量ペナルティ適用前の合計（2026-08-18）。totalとの差があればペナルティが働いたことを意味する */
  rawTotal: number | null
  contentRichnessTier: string | null
  /** 参加／体験型UXタイプ（2026-08-18）。Editorial Scoreには影響しない付加情報 */
  uxType: string | null
  /**
   * Temporal Relevance（今日との時間的関連性、2026-08-18）。DBには保存しない
   * ——`now`に対する相対値のため毎回その場で計算する（eventStatus/
   * isUpcomingSoonと同じ「都度計算」方式）。Editorial Score・ランキング
   * 順位には一切影響しない参考情報。
   */
  temporalRelevanceTier: TemporalRelevanceTier
  daysUntilStart: number | null
  daysUntilEnd: number | null
  breakdown: {
    now: number | null
    ginza: number | null
    ux: number | null
    story: number | null
    discovery: number | null
  }
  audienceTags: {
    genderAffinity: string[]
    generation: string[]
    visitStyle: string[]
  }
  memberCount: number
  memberIds: number[]
  representativeUrl: string
  inclusionReasons: InclusionReasonCode[]
  /** Editorial Score降順のみで並べた場合の順位（1始まり。施設多様性調整前の参考値） */
  pureScoreRank: number
  /** 施設多様性の制約により、スコア順位から並び順が繰り下げられたか */
  diversityAdjusted: boolean
}

interface GetDailyRankingOptions {
  /** 基準時刻（テスト用に注入可能。既定は現在時刻） */
  now?: Date
  limit?: number
  /**
   * 施設多様性を考慮した並べ替えを適用するか（既定true）。
   * false指定時はEditorial Scoreの純粋な降順のみ（施設偏り抑制なし）。
   * 主に前後比較・検証用。
   */
  diversify?: boolean
  /** 施設多様性調整のパラメータ上書き（既定はfacilityDiversity.tsのDEFAULT_DIVERSITY_OPTIONS） */
  diversityOptions?: DiversityOptions
}

// サーバープロセスのローカルタイムゾーン基準で「同じ日」を判定する
// （UTC基準ではない）。この判定はJobs Queueのcronスケジュール
// （sourceLedgerCrawlTask.ts、毎朝6:00＝サーバーローカルタイム基準）と
// 同じ前提——ローカル開発機はAsia/Tokyo、Railway本番はTZ=Asia/Tokyoの
// 設定が必要（CLAUDE.md未決事項に記録済み、本番未設定の場合はUTC基準に
// なり「本日」の判定が最大9時間ずれる）。
function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

interface MemberFacts {
  id: number
  isNewToday: boolean
  isUpdatedToday: boolean
}

export async function getDailyEditorialDeskRanking(payload: Payload, options: GetDailyRankingOptions = {}) {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 500

  const { docs } = await payload.find({
    collection: 'discovered-content',
    where: { 'editorialScore.scoredAt': { exists: true } },
    limit,
    depth: 1, // sourceSite名を解決するため
    overrideAccess: true,
  })

  const docById = new Map(docs.map((d) => [Number(d.id), d]))

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

  const memberFacts = (id: number): MemberFacts => {
    const doc = docById.get(id)
    const lastChangedAt = doc?.lastChangedAt ? new Date(doc.lastChangedAt) : null
    const isToday = Boolean(lastChangedAt) && !Number.isNaN(lastChangedAt!.getTime()) && isSameCalendarDay(lastChangedAt!, now)
    return {
      id,
      isNewToday: isToday && doc?.discoveryStatus === 'first_seen',
      isUpdatedToday: isToday && doc?.discoveryStatus === 'changed',
    }
  }

  const entries: DailyRankingEntry[] = []
  let staleExcludedCount = 0

  for (const cluster of clusters) {
    const facts = cluster.memberIds.map(memberFacts)
    const anyNewToday = facts.some((f) => f.isNewToday)
    const anyUpdatedToday = facts.some((f) => f.isUpdatedToday)

    const eventStatus = deriveEventStatus(cluster.eventStartAt, cluster.eventEndAt, now)
    const isOngoing = eventStatus === 'ongoing'
    const isUpcoming = isUpcomingSoon(cluster.eventStartAt, now)
    const temporalRelevance = deriveTemporalRelevance(cluster.eventStartAt, cluster.eventEndAt, now)

    const inclusionReasons: InclusionReasonCode[] = []
    if (anyNewToday) inclusionReasons.push('today_new')
    if (anyUpdatedToday) inclusionReasons.push('today_updated')
    if (isOngoing) inclusionReasons.push('ongoing')
    if (isUpcoming) inclusionReasons.push('upcoming_soon')

    if (inclusionReasons.length === 0) {
      staleExcludedCount += cluster.memberIds.length
      continue
    }

    const representative = docById.get(cluster.representativeId)
    if (!representative) continue

    // 表示用の状態は優先度 ongoing > upcoming > new > updated > unchanged
    let displayStatus: DisplayStatus = 'unchanged'
    if (isOngoing) displayStatus = 'ongoing'
    else if (isUpcoming) displayStatus = 'upcoming'
    else if (anyNewToday) displayStatus = 'new'
    else if (anyUpdatedToday) displayStatus = 'updated'

    const sourceSiteName =
      typeof representative.sourceSite === 'object' && representative.sourceSite !== null
        ? (representative.sourceSite as { name?: string }).name ?? null
        : null
    const sourceSiteId =
      typeof representative.sourceSite === 'object' && representative.sourceSite !== null
        ? String((representative.sourceSite as { id: string | number }).id)
        : representative.sourceSite != null
          ? String(representative.sourceSite)
          : null

    entries.push({
      clusterKey: cluster.clusterKey,
      representativeId: cluster.representativeId,
      storyTitle: cluster.clusterTitle,
      sourceSiteName,
      sourceSiteId,
      eventStartAt: cluster.eventStartAt,
      eventEndAt: cluster.eventEndAt,
      eventStatus,
      displayStatus,
      total: representative.editorialScore?.total ?? 0,
      rawTotal: typeof representative.editorialScore?.rawTotal === 'number' ? representative.editorialScore.rawTotal : null,
      contentRichnessTier: representative.editorialScore?.contentRichnessTier ?? null,
      uxType: representative.uxType ?? null,
      temporalRelevanceTier: temporalRelevance.tier,
      daysUntilStart: temporalRelevance.daysUntilStart,
      daysUntilEnd: temporalRelevance.daysUntilEnd,
      breakdown: {
        now: representative.editorialScore?.now ?? null,
        ginza: representative.editorialScore?.ginza ?? null,
        ux: representative.editorialScore?.ux ?? null,
        story: representative.editorialScore?.story ?? null,
        discovery: representative.editorialScore?.discovery ?? null,
      },
      audienceTags: {
        genderAffinity: representative.audienceTags?.genderAffinity ?? [],
        generation: representative.audienceTags?.generation ?? [],
        visitStyle: representative.audienceTags?.visitStyle ?? [],
      },
      memberCount: cluster.memberIds.length,
      memberIds: cluster.memberIds,
      representativeUrl: representative.articleUrl,
      inclusionReasons,
      // 施設多様性パス実行前のプレースホルダー。下記で必ず上書きする。
      pureScoreRank: 0,
      diversityAdjusted: false,
    })
  }

  // Editorial Score降順（施設多様性を考慮しない「素のスコア順」）——
  // 多様性パスの入力・pureScoreRankの基準になる。
  entries.sort((a, b) => b.total - a.total)

  const diversify = options.diversify ?? true
  const finalEntries: DailyRankingEntry[] = diversify
    ? applyFacilityDiversity(
        entries.map((entry) => ({ facilityKey: entry.sourceSiteId, entry })),
        options.diversityOptions,
      ).map((ranked) => ({
        ...ranked.item.entry,
        pureScoreRank: ranked.pureScoreRank,
        diversityAdjusted: ranked.diversityAdjusted,
      }))
    : entries.map((e, index) => ({ ...e, pureScoreRank: index + 1, diversityAdjusted: false }))

  return {
    totalScored: docs.length,
    clusterCount: clusters.length,
    dailyPoolSize: finalEntries.length,
    staleExcludedCount,
    upcomingWindowDays: UPCOMING_WINDOW_DAYS,
    diversified: diversify,
    entries: finalEntries,
  }
}
