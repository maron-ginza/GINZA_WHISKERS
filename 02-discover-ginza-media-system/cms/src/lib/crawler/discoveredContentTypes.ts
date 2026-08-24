// トップページ更新検知 → 個別記事・イベント抽出（2026-08-17）。
// Payloadに依存しない純粋な型定義。DiscoveredContentコレクション定義・
// 抽出パイプライン・CLI表示の複数箇所から共有する
// （lib/sourceLedger/types.ts・lib/curation/types.tsと同じ設計方針）。

export const CONTENT_TYPES = [
  'event',
  'news',
  'exhibition',
  'food',
  'shopping',
  'culture',
  'other',
] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  event: 'イベント',
  news: 'ニュース',
  exhibition: '展覧会',
  food: 'グルメ',
  shopping: 'ショッピング',
  culture: '文化・歴史',
  other: 'その他',
}

// SourceSnapshotsのdiffStatus（lib/crawler/diff.ts）と概念は同じだが、
// 個別記事・イベントは「取得失敗」という状態を持たない（Stage 1はトップページ
// 上のリンク抽出のみで独自にHTTP取得しないため）。Stage 2の個別ページ取得
// 成否は別フィールド`articleFetchStatus`で管理する。
export const DISCOVERY_STATUSES = ['first_seen', 'changed', 'unchanged'] as const
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number]

export const DISCOVERY_STATUS_LABELS: Record<DiscoveryStatus, string> = {
  first_seen: '初回検知',
  changed: '更新検知',
  unchanged: '変化なし',
}

export const ARTICLE_FETCH_STATUSES = ['not_fetched', 'fetched', 'fetch_error'] as const
export type ArticleFetchStatus = (typeof ARTICLE_FETCH_STATUSES)[number]

export const ARTICLE_FETCH_STATUS_LABELS: Record<ArticleFetchStatus, string> = {
  not_fetched: '個別ページ未取得',
  fetched: '個別ページ取得済み',
  fetch_error: '個別ページ取得失敗',
}

export const CURATION_STATUSES = ['inbox', 'approved', 'rejected'] as const
export type CurationStatus = (typeof CURATION_STATUSES)[number]

export const CURATION_STATUS_LABELS: Record<CurationStatus, string> = {
  inbox: '受信箱 (Inbox)',
  approved: '承認済み (Approved)',
  rejected: '却下 (Rejected)',
}
