import type { OfficialCategory } from './types'

// note公式（note.com/info）お題・コンテスト告知タイトルの分類ロジック（2026-08-27）。
//
// 【重要原則（マロン指示）】noteは各告知記事に「募集中／終了」等の構造化ステータスを
// 公開していない。ここで行っているのは、note公式自身がタイトル文言で明示的に述べている
// 言い回し（「〜を募集します」「〜を開催します」＝告知、「審査結果を発表します」＝終了）
// を機械的に読み取ることだけであり、note内部の運営基準を推測・再現するものではない。
//
// 【判定根拠（2026-08-27、note.com/info/rss実データ25件で検証済み）】
// OPENシグナルに一致した実例：
//   「#仕事での気づき」で投稿を募集します。 → 「投稿を募集」
//   お題企画「#Netflix感想文」で募集します → 「で募集します」
//   投稿コンテスト「#これからのキャリア」を開催します！ → 「を開催します」
//   「#読書感想文」コンテストを開催！ → 「開催！」
//   「#このレシピが好き」で投稿しよう！ → 「投稿しよう」
// CLOSEDシグナルに一致した実例：
//   「#ワークライクバランス」投稿コンテストの審査結果を発表します！ → 「審査結果を発表」
//   「#AIと始めてみた」投稿コンテストの審査結果を発表します！ → 「審査結果を発表」
// 「受賞者には賞金」のような、OPEN告知内に現れる将来形の言及は意図的にCLOSED
// シグナルへ含めていない（開催中の告知に含まれるため誤判定の原因になる、実データで確認済み）。
//
// 【限界（正直に明記する）】タイトル文言だけでは「今日まさに募集中か」は断定できない
// ——noteが結果発表記事を出さないまま静かに募集を終える可能性を否定できない。
// この判定は「取得できたRSSウィンドウ内で終了告知が見つからない」という消極的推定に
// すぎないため、呼び出し側は必ずconfidence: 'low'として保存し、最終判断は人間
// （status: approved遷移時）に委ねる。

const HASHTAG_REGEX = /#([^\s」!！?？。、]+)/

const OPEN_SIGNAL_PATTERNS = [/投稿を募集/, /で募集します/, /を募集します/, /を開催します/, /開催！/, /投稿しよう/]

const CLOSED_SIGNAL_PATTERNS = [/審査結果を発表/, /結果を発表/]

export interface ClassifiedNoteOfficialTitle {
  hashtag: string | null
  isOpenSignal: boolean
  isClosedSignal: boolean
  officialCategory: OfficialCategory | null
}

export function classifyNoteOfficialTitle(title: string): ClassifiedNoteOfficialTitle {
  const hashtagMatch = HASHTAG_REGEX.exec(title)
  const hashtag = hashtagMatch ? hashtagMatch[1] : null

  const isOpenSignal = OPEN_SIGNAL_PATTERNS.some((p) => p.test(title))
  const isClosedSignal = CLOSED_SIGNAL_PATTERNS.some((p) => p.test(title))

  let officialCategory: OfficialCategory | null = null
  if (title.includes('コンテスト')) officialCategory = 'contest'
  else if (title.includes('お題')) officialCategory = 'topic'

  return { hashtag, isOpenSignal, isClosedSignal, officialCategory }
}
