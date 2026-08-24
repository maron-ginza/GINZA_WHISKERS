import type { Payload } from 'payload'

import { computeStoryClusters, type ClusterableItem } from './storyClustering'

// Story Clusteringの計算結果をStoryClustersコレクションへ反映する
// オーケストレーター（2026-08-17）。`./p2 clusters`から呼ばれる。
//
// 【設計】DiscoveredContent（全curationStatus対象、削除・変更はしない）を
// 読み込み→純粋関数computeStoryClustersでグルーピング→clusterKeyで
// find-or-create（既存クラスタは全フィールドを最新の計算結果で上書き——
// 増分更新ではなく毎回の完全再計算にすることで、タイトル正規化ロジックの
// 変更等によるドリフトを避ける）。
//
// Daily Ranking（dailyRanking.ts）はこの永続化結果に依存しない——都度
// computeStoryClustersを直接呼んで鮮度を保つ設計にしている（本ファイルは
// 管理画面からの閲覧性・監査性のためだけに存在する）。
//
// 【既知の制約】タイトル変更等でクラスタの構成が変わり、ある回の再計算で
// 一部のclusterKeyが二度と出現しなくなった場合、そのStoryClustersレコードは
// 自動削除されない（残り続ける）。実データ削除は本セッションのスコープ外の
// ため、v1では孤立レコードのクリーンアップは行わない設計とした——将来的に
// 必要なら別途「N日以上再計算で出現しないクラスタを削除する」ような
// メンテナンス処理を検討する余地として記録するに留める。

export interface PersistClustersResult {
  persisted: boolean
  scannedContents: number
  clusterCount: number
  singletonCount: number
  multiMemberCount: number
  totalMembersInMultiClusters: number
  created: number
  updated: number
}

export async function persistStoryClusters(
  payload: Payload,
  options: { persist?: boolean } = {},
): Promise<PersistClustersResult> {
  const persist = options.persist ?? true
  const now = new Date()

  const { docs } = await payload.find({
    collection: 'discovered-content',
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })

  const items: ClusterableItem[] = docs.map((d) => ({
    id: Number(d.id),
    sourceSiteId: typeof d.sourceSite === 'object' && d.sourceSite !== null ? Number((d.sourceSite as { id: number }).id) : Number(d.sourceSite),
    title: typeof d.title === 'string' ? d.title : '',
    articleUrl: typeof d.articleUrl === 'string' ? d.articleUrl : undefined,
    editorialScoreTotal: typeof d.editorialScore?.total === 'number' ? d.editorialScore.total : null,
    eventStartAt: d.eventStartAt ?? null,
    eventEndAt: d.eventEndAt ?? null,
  }))

  const groups = computeStoryClusters(items)

  let created = 0
  let updated = 0

  if (persist) {
    for (const group of groups) {
      const { docs: existingDocs } = await payload.find({
        collection: 'story-clusters',
        where: { clusterKey: { equals: group.clusterKey } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const existing = existingDocs[0] ?? null

      const data = {
        clusterKey: group.clusterKey,
        sourceSite: group.sourceSiteId,
        clusterTitle: group.clusterTitle,
        representativeContent: group.representativeId,
        relatedContents: group.memberIds,
        memberCount: group.memberIds.length,
        eventStartAt: group.eventStartAt ?? undefined,
        eventEndAt: group.eventEndAt ?? undefined,
        lastComputedAt: now.toISOString(),
      }

      if (existing) {
        await payload.update({
          collection: 'story-clusters',
          id: existing.id,
          overrideAccess: true,
          data,
        })
        updated += 1
      } else {
        await payload.create({
          collection: 'story-clusters',
          overrideAccess: true,
          data,
        })
        created += 1
      }
    }
  }

  const multiMemberGroups = groups.filter((g) => g.memberIds.length > 1)

  return {
    persisted: persist,
    scannedContents: items.length,
    clusterCount: groups.length,
    singletonCount: groups.length - multiMemberGroups.length,
    multiMemberCount: multiMemberGroups.length,
    totalMembersInMultiClusters: multiMemberGroups.reduce((sum, g) => sum + g.memberIds.length, 0),
    created,
    updated,
  }
}
