// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：「商品・スウィーツ専用の
// 決定論的テンプレート」の適格性判定）
//
// 既存の template-check（templateCheck.ts / readyGate.ts）とは完全に独立した
// 判定ロジック。ArticleFacts（イベント専用スキーマ）の有無・readyを一切見ない
// ——DiscoveredContentの軽量フィールド（sourceName/sourceUrl/title/verifiedAt
// が最低限あるか）だけで判定する。venue/excerpt/販売期間/価格は「あれば使う・
// 無ければ公式記載なしのまま本文へ出す」設計のため必須にしない
// （イベント専用項目は一切要求しない）。
//
// 【安全条件】推測しない・DB書き込みなし・AI呼び出しなし・純粋関数。

export interface ProductSweetsEligibilityInput {
  discoveredContentId: number | string
  title?: string | null
  sourceName?: string | null
  sourceUrl?: string | null
  verifiedAt?: string | null
  venue?: string | null
  excerpt?: string | null
  eventStartAtISO?: string | null
  eventEndAtISO?: string | null
  contentType?: string | null
}

export interface ProductSweetsEligibilityResult {
  discoveredContentId: number | string
  templateEligible: boolean
  route: 'product_sweets_template' | 'human_review'
  /** 必須項目の欠落（これがあると templateEligible:false） */
  missing: string[]
  /** 任意項目のうち今回「公式記載なし」で埋まるもの（監査用・ブロックしない） */
  optionalNotStated: string[]
  captured: {
    sourceName: string | null
    sourceUrl: string | null
    verifiedAt: string | null
    title: string | null
    venue: string | null
    excerpt: string | null
    salesPeriod: string | null
    contentType: string | null
  }
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

export function checkProductSweetsEligibility(
  input: ProductSweetsEligibilityInput,
): ProductSweetsEligibilityResult {
  const missing: string[] = []
  const optionalNotStated: string[] = []

  // 必須：この3項目が無いと出典を明示した記事にならない（イベント専用項目は要求しない）。
  if (!nonEmpty(input.title)) missing.push('title（商品・企画名）')
  if (!nonEmpty(input.sourceName)) missing.push('sourceName（出典名）')
  if (!nonEmpty(input.sourceUrl)) missing.push('sourceUrl（公式URL）')

  // 任意：無ければ本文で「公式記載なし」として扱う（ブロックしない）。
  if (!nonEmpty(input.venue)) optionalNotStated.push('venue（会場）')
  if (!nonEmpty(input.excerpt)) optionalNotStated.push('excerpt（本文抜粋・見どころに使用）')
  if (!nonEmpty(input.eventStartAtISO) || !nonEmpty(input.eventEndAtISO)) {
    optionalNotStated.push('販売期間（eventStartAt/eventEndAtの一方または両方）')
  }
  if (!nonEmpty(input.verifiedAt)) optionalNotStated.push('verifiedAt（確認日時。無ければ「確認日不明」表記）')

  const templateEligible = missing.length === 0

  const salesPeriod =
    nonEmpty(input.eventStartAtISO) || nonEmpty(input.eventEndAtISO)
      ? `${input.eventStartAtISO ?? '(開始日不明)'} 〜 ${input.eventEndAtISO ?? '(終了日不明)'}`
      : null

  return {
    discoveredContentId: input.discoveredContentId,
    templateEligible,
    route: templateEligible ? 'product_sweets_template' : 'human_review',
    missing,
    optionalNotStated,
    captured: {
      sourceName: input.sourceName ?? null,
      sourceUrl: input.sourceUrl ?? null,
      verifiedAt: input.verifiedAt ?? null,
      title: input.title ?? null,
      venue: input.venue ?? null,
      excerpt: input.excerpt ?? null,
      salesPeriod,
      contentType: input.contentType ?? null,
    },
  }
}
