// GINZA WHISKERS / Project 02（2026-09-07根本改善）
//
// 1ページに複数記事が並ぶリスティング型サイト（GINZA SIX 等）では、body_label 由来かつ
// confidence が high でない DiscoveredContent.eventStartAt/eventEndAt は「同じページに並ぶ
// 別記事の開催期間を拾った」疑いがある（#369/#370 で実際に確認：花西子 FLORASIS・AMBUSH x New Era
// の各ページの event_start_at/event_end_at が、同ページ下部に並ぶ全く無関係な別記事
// 〈UNO YOSHIHIKO個展・KOH SANVER〉の「開催期間」ラベルを拾っていた）。
//
// この判定は `extractArticleFactsCandidate.ts`（issue 4・2026-09-03）で最初に実装されたが、
// `extractProductNewsFacts.ts` の product_news 専用抽出（fields.saleStartAt/saleEndAt）には
// 適用されておらず、同じ汚染が再発していた（2026-09-07 に #369/#370 の実データ回帰テストで発見）。
// 両抽出器で同じ判定を確実に共有するため、ここへ1本化する。

export interface SuspectListingDateInput {
  articleUrl?: string | null
  dateExtraction?: {
    eventStartAt?: { source?: string | null; confidence?: string | null } | null
  } | null
}

/** 1ページに複数記事が並ぶことが分かっているホスト（今後増やす場合はここへ追加） */
export const MULTI_ARTICLE_HOSTS = ['ginza6.tokyo']

export function suspectListingDate(input: SuspectListingDateInput): boolean {
  const host = (() => {
    try {
      return new URL(input.articleUrl ?? '').hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()
  const source = input.dateExtraction?.eventStartAt?.source ?? null
  const confidence = input.dateExtraction?.eventStartAt?.confidence ?? null
  return MULTI_ARTICLE_HOSTS.includes(host) && source === 'body_label' && confidence !== 'high'
}
