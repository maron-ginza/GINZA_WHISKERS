// テキスト類似度判定（2026-08-27、Project 02-1「核情報→最大5記事」拡張）。
//
// 【用途】1つのCORE情報から複数角度（CORE/NEED/EXPERIENCE/INTEREST/
// GINZA_WHISKERS）の記事候補を生成する際、内容が実質的に重複する候補を
// 機械的に検出するための決定的（同一入力に対し常に同じ結果）な純粋関数。
// AI呼び出しは行わない——contentRichness.ts・uxType.ts等、本プロジェクトの
// 他の判定ロジックと同じ「素朴なヒューリスティックで十分」という方針を踏襲する。
//
// 【手法】文字バイグラム（2文字連続）集合のJaccard類似度。日本語は英語と
// 異なり単語間にスペースがなく形態素解析なしでは単語分割が難しいため、
// 文字N-gramベースの比較は日本語テキストの類似度判定として広く使われる
// 素朴な近似——本プロジェクトの他モジュール同様、フルNLPは使わない（v1スコープ）。
export function computeCharBigramJaccardSimilarity(a: string, b: string): number {
  const bigramsOf = (text: string): Set<string> => {
    const normalized = text.replace(/\s+/g, '')
    const set = new Set<string>()
    for (let i = 0; i < normalized.length - 1; i++) {
      set.add(normalized.slice(i, i + 2))
    }
    return set
  }

  const setA = bigramsOf(a)
  const setB = bigramsOf(b)

  if (setA.size === 0 || setB.size === 0) return 0

  let intersectionCount = 0
  for (const bigram of setA) {
    if (setB.has(bigram)) intersectionCount++
  }

  const unionCount = setA.size + setB.size - intersectionCount
  return unionCount === 0 ? 0 : intersectionCount / unionCount
}
