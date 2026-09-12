// GINZA WHISKERS / Project 02（2026-09-12）— スウィーツ公式情報Discovery層の
// キーワード設定ファイル。
//
// 「今紹介する理由」（新規性・季節性・限定性）を判定するための語彙を、コードから
// 分離した1ファイルに集約する。季節語は月ごとに定義し、`getSeasonalKeywords()`が
// 現在の月（または指定した日付）に応じて自動的に該当分を返す——新しい月・新しい語を
// `SEASONAL_KEYWORDS_BY_MONTH`に追記するだけで、コードの他の部分を変更せず反映される。
//
// この設定は「Discovery層」（候補URLを広く発見する段階）でのキーワード一致に使う。
// 「銀座との関係」「期間限定か通常商品か」の最終判定は評価層
// （ginzaRelevance.ts／candidateCoverageScore.ts）が別途厳格に行う——ここでの
// キーワード一致は「crawl対象を広げる／優先する」ためだけに用い、単独では
// 採用・除外の根拠にしない（推測しない原則はDiscovery層でも維持する）。

/** 銀座・店舗系の語（Discovery層でのURL/アンカー優先度づけに使う） */
export const GINZA_LOCATION_KEYWORDS = [
  '銀座',
  '銀座店',
  '銀座本店',
  '銀座メゾン',
  '松屋銀座',
  '銀座三越',
  'デパ地下',
  'Ginza',
]

/** 新規性・限定性のシグナル語（日本語）。「今紹介する理由」判定の中核。 */
export const NOVELTY_SIGNAL_KEYWORDS_JA = [
  '新商品',
  '新発売',
  '新登場',
  '新作',
  '限定',
  '季節限定',
  '期間限定',
  '数量限定',
  '銀座限定',
  '先行販売',
  '先行発売',
  '予約開始',
  '予約受付',
  '催事',
  'フェア',
  'ポップアップ',
  'アフタヌーンティー',
]

/** 新規性・限定性のシグナル語（英語） */
export const NOVELTY_SIGNAL_KEYWORDS_EN = [
  'limited',
  'seasonal',
  'launch',
  'new arrival',
  'reservation',
  'pop-up',
  'popup',
  'afternoon tea',
]

/** 季節語（月ごと、1〜12）。新しい季節・商材が出てきたらここへ追記するだけでよい。 */
const SEASONAL_KEYWORDS_BY_MONTH: Record<number, string[]> = {
  1: ['新春', '福袋', 'いちご', '苺'],
  2: ['バレンタイン', 'チョコレート', 'いちご', '苺'],
  3: ['ホワイトデー', '桜', 'さくら', 'いちご'],
  4: ['桜', 'さくら', '春'],
  5: ['母の日', '柑橘'],
  6: ['父の日', '梅', 'あじさい'],
  7: ['夏', '氷', 'かき氷', 'マンゴー'],
  8: ['夏', '桃', 'もも', 'すいか'],
  9: ['栗', 'かぼちゃ', '無花果', 'いちじく', '葡萄', 'ぶどう', '秋'],
  10: ['栗', '芋', 'さつまいも', 'かぼちゃ', 'ハロウィン'],
  11: ['栗', '芋', '紅葉', '秋'],
  12: ['クリスマス', 'ケーキ', '冬', '年末'],
}

/** 現在（または指定日）の月に対応する季節語を返す。定義の無い月は空配列。 */
export function getSeasonalKeywords(date: Date = new Date()): string[] {
  const month = date.getMonth() + 1
  return SEASONAL_KEYWORDS_BY_MONTH[month] ?? []
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRe(words: string[]): RegExp {
  return new RegExp(words.map(escapeRegex).join('|'), 'i')
}

/** Discovery層でURL/アンカーの優先度づけに使う全キーワード（季節語込み） */
export function buildDiscoveryKeywordSet(date: Date = new Date()): string[] {
  return [...GINZA_LOCATION_KEYWORDS, ...NOVELTY_SIGNAL_KEYWORDS_JA, ...NOVELTY_SIGNAL_KEYWORDS_EN, ...getSeasonalKeywords(date)]
}

/** テキストが新規性・限定性シグナルを含むか（評価層の「終了日なしでも評価対象にする」判定に使用） */
export function hasNoveltySignal(text: string | null | undefined, date: Date = new Date()): boolean {
  if (!text) return false
  const words = [...NOVELTY_SIGNAL_KEYWORDS_JA, ...NOVELTY_SIGNAL_KEYWORDS_EN, ...getSeasonalKeywords(date)]
  return buildRe(words).test(text)
}

/** テキストが銀座の場所を明記しているか（Discovery層の優先度づけ専用。評価層の最終判定はginzaRelevance.tsを使うこと） */
export function hasGinzaLocationHint(text: string | null | undefined): boolean {
  if (!text) return false
  return buildRe(GINZA_LOCATION_KEYWORDS).test(text)
}
