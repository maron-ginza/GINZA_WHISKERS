import type { DateFieldResult } from '../extractStructuredDates'

// サイト固有アダプタ（2026-08-17、日付取得率改善セッション）。
//
// 全サイト共通ロジック（extractStructuredDates.tsのTier 1〜3b）だけでは
// 精度が上がらないサイトについて、そのサイト固有の構造（例：URLパスに
// 日付が直接埋め込まれている）を利用して日付を補完する拡張ポイント。
//
// 【設計原則】
// - アダプタは「まだnullのフィールドだけを埋める」——共通ロジックが既に
//   見つけた値（JSON-LD等、より高いconfidence）を上書きすることは絶対にない。
//   呼び出し元（fetchArticlePage.ts）がこのマージを担当する。
// - アダプタ自身も「推測しない」原則に従う——確信が持てない場合は該当
//   フィールドを返さない（undefinedのまま）。
// - 実データで実際に確認できたパターンについてのみ追加する（憶測でアダプタを
//   増やさない）。
export interface SiteDateAdapterResult {
  publishedAt?: DateFieldResult
  updatedAt?: DateFieldResult
  eventStartAt?: DateFieldResult
  eventEndAt?: DateFieldResult
}

export type SiteDateAdapter = (html: string, url: string) => SiteDateAdapterResult
