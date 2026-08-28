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

// 文字バイグラム集合の内部関数を共有するための小ヘルパー
// （computeCharBigramJaccardSimilarity と同じ「空白除去 → 2文字連続集合」）。
function charBigramSet(text: string): Set<string> {
  const normalized = text.replace(/\s+/g, '')
  const set = new Set<string>()
  for (let i = 0; i < normalized.length - 1; i++) {
    set.add(normalized.slice(i, i + 2))
  }
  return set
}

// 「短いテーマ語が、長い記事テキストの中の一トピックとして現れているか」を
// 測る非対称メトリクス（2026-08-28、Project 02-2 収益化②のプレマッチ用に追加）。
//
// 対称 Jaccard（computeCharBigramJaccardSimilarity）は分母に記事側の
// バイグラム数が丸ごと入るため、短いテーマ vs 長い本文では完全一致でも
// 値がほぼ 0 に潰れる。ここでは「テーマ側バイグラムのうち何割が
// テキストに含まれるか」＝ |themeBigrams ∩ textBigrams| / |themeBigrams|
// を返す。テキスト長に依存しない。1文字テーマはバイグラムが作れず 0。
//
// これは意味的類似度ではなく「文字列の重なり具合」の素朴な近似。最終的な
// 銀座接続の可否判定は AI（multi-angle の interest/ginza_whiskers 角度の
// include）が行い、この値は「どの承認済み DiscoveredContent を AI へ渡すか」
// の候補選抜にのみ使う。
export function computeThemeBigramContainment(theme: string, text: string): number {
  const themeBigrams = charBigramSet(theme)
  if (themeBigrams.size === 0) return 0
  const textBigrams = charBigramSet(text)
  if (textBigrams.size === 0) return 0

  let hit = 0
  for (const bigram of themeBigrams) {
    if (textBigrams.has(bigram)) hit++
  }
  return hit / themeBigrams.size
}
