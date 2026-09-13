// GINZA WHISKERS / Project 02（2026-09-14新設）— 固有名詞根拠ゲート（純粋・決定的・
// AIなし）。人物名・店舗名・商品名・施設名・作品名・ブランド名が、ArticleFactsまたは
// 保存済み公式ソース本文（sourceProvenance・DiscoveredContentの title/excerpt/venue）
// に一致しない場合、下書き生成を**block**する（警告ではない・公開前ブロッカー）。
//
// 【抽出方針】日本語の編集文体では、固有名詞（店舗名・商品名・作品名・ブランド名）は
// ほぼ必ず「」『』＜＞のいずれかの括弧で囲んで示される——本プロジェクトのEditorial
// Style Engine自身がこの書式を一貫して使っている（実データ：「アイガトー」『HAMLET』
// ＜西洋菓子 しろたえ＞等）。したがって、あらゆるカタカナ列を固有名詞候補として
// 抽出する方式（一般名詞との誤検知が極めて多い）ではなく、**括弧で囲まれた語句**と
// **英字ブランド名らしき大文字始まりの連続**の2種類に絞って抽出する——過検知に
// よる正当な記事の量産ブロックを避けるための、意図的に保守的な設計。
//
// 【判定】抽出した候補それぞれについて、バッキングテキスト（sourceProvenanceの
// fact文字列・ArticleFactsの該当フィールド・DiscoveredContentのtitle/excerpt/venue）
// のいずれかに**部分文字列として**含まれるかを確認する。1件でも見つからなければ
// 「根拠のない固有名詞」としてblockedになる。

const BRACKET_RE = /[「『＜]([^」』＞]{2,40})[」』＞]/g
// 英字ブランド名候補：大文字で始まり英数字・記号が続く2文字以上のトークン
// （例：GODIVA, CAFE PAULISTA）。一般的な英単語1文字・単純な略語との誤検知を
// 減らすため、全て大文字の1〜2文字だけの語（例："AI"）は対象外とする。
const LATIN_BRAND_RE = /\b[A-Z][A-Za-z0-9&.'-]{2,30}(?:\s[A-Z][A-Za-z0-9&.'-]{1,30}){0,3}\b/g

// 明らかに固有名詞ではない、括弧内によく現れる一般的な語句（誤検知抑制）。
// 新しい定型句が見つかった場合はここへ追加する（コード1箇所で完結）。
const GENERIC_BRACKETED_PHRASES = new Set([
  'ケーキとコーヒーセット',
  '数量限定',
  '期間限定',
  '税込',
])

export interface ProperNounCandidate {
  text: string
  /** 抽出元（audit用） */
  kind: 'bracketed' | 'latin-brand'
}

export function extractProperNounCandidates(texts: (string | null | undefined)[]): ProperNounCandidate[] {
  const seen = new Map<string, ProperNounCandidate>()
  for (const raw of texts) {
    const text = raw ?? ''
    if (!text) continue
    BRACKET_RE.lastIndex = 0
    for (const m of text.matchAll(BRACKET_RE)) {
      const candidate = m[1].trim()
      if (candidate.length < 2) continue
      if (GENERIC_BRACKETED_PHRASES.has(candidate)) continue
      if (!seen.has(candidate)) seen.set(candidate, { text: candidate, kind: 'bracketed' })
    }
    LATIN_BRAND_RE.lastIndex = 0
    for (const m of text.matchAll(LATIN_BRAND_RE)) {
      const candidate = m[0].trim()
      if (!seen.has(candidate)) seen.set(candidate, { text: candidate, kind: 'latin-brand' })
    }
  }
  return [...seen.values()]
}

export interface ProperNounGroundingResult {
  blocked: boolean
  checkedCandidates: ProperNounCandidate[]
  ungroundedCandidates: ProperNounCandidate[]
}

/**
 * bodyTexts（タイトル・本文・見出し・SNS文等、生成された文章）に含まれる
 * 固有名詞候補を抽出し、backingTexts（ArticleFacts・sourceProvenance・
 * DiscoveredContentの確認済みテキスト）のいずれかに実在するかを検証する。
 * 1件でも根拠が無ければ blocked:true を返す（呼び出し側は下書き生成を中止する）。
 */
export function evaluateProperNounGrounding(
  bodyTexts: (string | null | undefined)[],
  backingTexts: (string | null | undefined)[],
): ProperNounGroundingResult {
  const backing = backingTexts.filter(Boolean).join('\n')
  const checkedCandidates = extractProperNounCandidates(bodyTexts)
  const ungroundedCandidates = checkedCandidates.filter((c) => !backing.includes(c.text))
  return {
    blocked: ungroundedCandidates.length > 0,
    checkedCandidates,
    ungroundedCandidates,
  }
}
