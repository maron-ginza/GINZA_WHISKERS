// GINZA WHISKERS / Project 02（2026-09-16続き8新設）— 銀座三越 食料品催事・
// ショップニュースのテキストから、催事・出店単位の候補を決定的に抽出する
// 純粋関数（HTMLタグ構造ではなく、抽出済みのプレーンテキストを受け取る。
// extractMatsuyaSweetsWeekly.tsと同じ「取得経路（fetch）と抽出ロジックを分離する」
// 設計方針を踏襲する）。
//
// 【重要な限界（正直に明記する）】銀座三越（mistore.jp）は2026-09-16時点でも
// 単純HTTP取得に対し接続タイムアウト（実測確認・ドメイン全体、パスを変えても
// 解消しない）——2026-08-16・2026-09-11・2026-09-13の既存調査と同じAkamai経由と
// 推定されるネットワーク層のブロックが継続している。実ブラウザへのなりすまし
// をしない方針（既存決定）の範囲では、このプロジェクトからは解決できない
// 外部要因である。
//
// そのため、この抽出関数は「もし本文テキストが取得できた場合にどう構造化候補へ
// 変換するか」を決定論的に実装し、単体テストで検証するに留める——実際のmistore.jp
// のHTML構造を確認できていないため、想定するテキスト形式（1催事＝1ブロック、
// 空行区切り、1行目＝ブランド・催事名、期間の明記行、残りの行＝商品名）は
// 一般的な催事カレンダー形式からの合理的な推測であり、実際のページ構造との
// 一致を確認できていない。マロンから提供された実際の催事情報（ブランド名・
// 商品名・期間）はそのままテスト用fixtureの中身として使うが、HTML/テキスト構造
// そのものは検証できていないことをコード・テスト双方に明記する。

export interface MitsukoshiFoodEventCandidate {
  /** ブランド・催事名（例："アンリ・シャルパンティエ"） */
  brand: string
  /** 商品名（複数可） */
  products: string[]
  /** 販売・開催開始日（ISO） */
  startIso: string | null
  /** 販売・開催終了日（ISO） */
  endIso: string | null
  /** 期間の明記テキスト（抽出根拠） */
  periodText: string | null
}

// 「◯月◯日(◯)〜◯月◯日(◯)」等の日付レンジを含む行を「期間行」とみなす
// （extractExplicitPeriod.tsと同じ表記規則。ここでは行の判別にのみ使う）。
const PERIOD_LINE_RE = /\d{1,4}[年.\-/]?\s*\d{1,2}\s*[月.\-/]\s*\d{1,2}\s*日?/

function splitBlocks(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
}

/**
 * 銀座三越の食料品催事テキスト（1催事＝空行区切りのブロック、1行目がブランド・
 * 催事名、期間を含む行、残りが商品名）から候補を抽出する。期間を確認できない
 * 候補もbrand/productsは返す（呼び出し元が「期間未確認」として扱う）。
 * 推測で日付を補わない——extractExplicitPeriodが見つけた範囲のみ使う。
 */
export function extractMitsukoshiGinzaFoodEvents(
  text: string,
  extractPeriod: (line: string) => { startIso: string; endIso: string; matched: string } | null,
): MitsukoshiFoodEventCandidate[] {
  const blocks = splitBlocks(text)
  const out: MitsukoshiFoodEventCandidate[] = []

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const brand = lines[0]
    if (!brand) continue

    let period: { startIso: string; endIso: string; matched: string } | null = null
    const products: string[] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!period && PERIOD_LINE_RE.test(line)) {
        period = extractPeriod(line)
        if (period) continue // 期間行は商品名として扱わない
      }
      products.push(line)
    }

    out.push({
      brand,
      products,
      startIso: period?.startIso ?? null,
      endIso: period?.endIso ?? null,
      periodText: period?.matched ?? null,
    })
  }

  return out
}
