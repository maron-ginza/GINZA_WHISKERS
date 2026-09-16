// GINZA WHISKERS / Project 02（2026-09-17新設・マロン指示：朝処理の統合）
//
// SOURCE_LEDGER.extractionMethod に基づき、「通常のHTML取得（generic_html、
// runSourceLedgerCrawl）」と「専用アダプター（storyblok_api＝松屋銀座、
// html_listing_blocks＝銀座三越、morningAutoRun.sh内の個別フェーズとして実行）」の
// どちらが担当するかを決定する純粋関数（DB/ネットワークなし）。店舗を追加するたびに
// 朝処理へ専用コードを継ぎ足す構造を避け、ページ構造が異なる情報源だけアダプターを
// 分ける——この関数はその「分岐点」を一箇所に集約し、runSourceLedgerCrawl側の
// 二重取得防止ロジックとして使う。

export type ExtractionMethod = 'generic_html' | 'storyblok_api' | 'html_listing_blocks' | string

export interface ExtractionDispatchResult {
  /** true＝通常のHTML取得（runSourceLedgerCrawl）で処理してよい */
  handleAsGenericHtml: boolean
  /** false時のスキップ理由（表示・監査用） */
  skipReason: string | null
}

const GENERIC_HTML: ExtractionMethod = 'generic_html'

/**
 * extractionMethod未設定（既存データ・スキーマ追加前のレコード等）は generic_html
 * として扱う（後方互換・既定値と同じ挙動。推測で他のアダプターへ割り当てない）。
 */
export function decideExtractionDispatch(extractionMethod: ExtractionMethod | null | undefined): ExtractionDispatchResult {
  const method = extractionMethod && extractionMethod.trim() ? extractionMethod : GENERIC_HTML
  if (method === GENERIC_HTML) {
    return { handleAsGenericHtml: true, skipReason: null }
  }
  return {
    handleAsGenericHtml: false,
    skipReason: `extractionMethod=${method}のため専用アダプターで取得（二重取得防止・morningAutoRun.sh参照）`,
  }
}
