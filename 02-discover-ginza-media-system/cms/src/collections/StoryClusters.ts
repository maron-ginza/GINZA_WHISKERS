import type { CollectionConfig } from 'payload'

// Story Clustering（2026-08-17）。
//
// 同一イベント・同一企画を指す複数のDiscoveredContent（例：展覧会開始
// ページ・関連トークイベントページ・別URL）を1つの「Story」としてまとめる
// 永続エンティティ。クラスタリングのロジック自体は
// cms/src/lib/curation/storyClustering.ts（純粋関数）にあり、本コレクションは
// その計算結果を保持するだけ——判定ロジックとストレージを分離することで、
// Daily Rankingは（鮮度を保つため）都度クラスタを再計算しつつ、この
// コレクションは管理画面から見える「保存されたスナップショット」として
// 独立して運用できる（cms/src/lib/curation/persistStoryClusters.ts、
// `./p2 clusters`コマンドで明示的に再計算・保存する）。
//
// 【既存データへの影響】DiscoveredContent自体は削除・変更しない
// （relatedContentsはrelationshipのみで、参照先のレコードには一切書き込まない）。
export const StoryClusters: CollectionConfig = {
  slug: 'story-clusters',
  admin: {
    useAsTitle: 'clusterTitle',
    defaultColumns: ['clusterTitle', 'sourceSite', 'memberCount', 'eventStartAt', 'eventEndAt'],
    description:
      '同一イベント・同一企画を指す複数のDiscoveredContentをまとめたStory（2026-08-17）。' +
      '`./p2 clusters`で再計算・保存する。元のDiscoveredContentは削除・変更しない。',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'clusterKey',
      label: 'Cluster Key（重複判定キー）',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: '`${sourceSiteId}::${正規化タイトル}`から決定的に生成される再計算安定キー',
      },
    },
    {
      name: 'sourceSite',
      label: 'Venue / Source Site',
      type: 'relationship',
      relationTo: 'source-ledger',
      required: true,
      index: true,
    },
    {
      name: 'clusterTitle',
      label: 'Story Title',
      type: 'text',
      required: true,
    },
    {
      name: 'representativeContent',
      label: '代表コンテンツ',
      type: 'relationship',
      relationTo: 'discovered-content',
      required: true,
      admin: {
        description: 'クラスタ内でEditorial Score最高点のコンテンツ（Daily Rankingで表示される代表）',
      },
    },
    {
      name: 'relatedContents',
      label: '関連コンテンツ（代表含む全メンバー）',
      type: 'relationship',
      relationTo: 'discovered-content',
      hasMany: true,
      required: true,
    },
    {
      name: 'memberCount',
      label: 'メンバー数',
      type: 'number',
      required: true,
    },
    {
      name: 'eventStartAt',
      label: '開催開始日（メンバー間の最小値）',
      type: 'date',
    },
    {
      name: 'eventEndAt',
      label: '開催終了日（メンバー間の最大値）',
      type: 'date',
    },
    {
      name: 'lastComputedAt',
      label: '最終計算日時',
      type: 'date',
      required: true,
    },
  ],
  timestamps: true,
}
