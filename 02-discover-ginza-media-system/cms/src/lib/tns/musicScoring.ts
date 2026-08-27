import type { MusicCandidate } from './musicCandidates'
import type { SeasonType, TnsEditorialCode, Weekday } from './types'

// 7曲選定ロジックのスコアリング（2026-08-27、マロン指示4／タグ体系正規化
// 設計セッションで全面改訂）。
//
// 【アーキテクチャ（2026-08-27改訂）】
//   weather data + weekday + TNS Editorial Code + dynamic mood
//     ↓ 正規化
//   mood/weather/season/code tags（英語の正規化語彙）
//     ↓ 照合
//   MusicTracks tags
//
// 旧実装は「AIが生成した日本語のdynamic mood文章そのもの」や「天気の
// 日本語ラベル」とMusicTracksのタグを文字列部分一致させていたが、これは
// ①AIの自由文と厳密なタグの一致判定という不安定な組み合わせ、②TNS楽曲側の
// タグを英語の正規化語彙に統一するというマロン指示、の両方と整合しない
// ため撤廃した。**日本語のAI生成文とMusicTracksのタグを直接文字列一致
// させる処理はどこにも残していない**——天気・曜日・TNS Editorial Code
// という構造化された入力信号だけから、決定的に（AI呼び出しなしで）英語の
// 正規化タグ集合を導出し、その集合とMusicTracksのタグ集合を集合演算で
// 照合する。

export const SCORE_WEIGHTS = {
  weather: 3,
  season: 3,
  ginzaCode: 3,
  mood: 2,
} as const

// マロン指示の正規化語彙をそのまま型として固定する。新しいタグを無制限に
// 増やさないための型レベルの歯止め（MusicTracks.weatherTags/moodTagsは
// スキーマ上は自由テキストのままだが、本モジュールが認識・スコアリングに
// 使うのはこの語彙のみ）。
export const WEATHER_TAG_VOCABULARY = [
  'sunny',
  'cloudy',
  'rain',
  'drizzle',
  'thunder',
  'humid',
  'cool',
  'after-rain',
] as const
export type WeatherTag = (typeof WEATHER_TAG_VOCABULARY)[number]

export const MOOD_TAG_VOCABULARY = [
  'quiet',
  'reflective',
  'hopeful',
  'romantic',
  'sophisticated',
  'refreshing',
  'nostalgic',
  'energetic',
  'mellow',
  'night',
] as const
export type MoodTag = (typeof MOOD_TAG_VOCABULARY)[number]

export interface DayScoringContext {
  conditionLabel: string
  season: SeasonType
  code: TnsEditorialCode
  fixedMoodLabel: string
  weekday: Weekday
}

export interface TrackScoreBreakdown {
  weatherMatch: boolean
  seasonMatch: boolean
  ginzaCodeMatch: boolean
  moodMatch: boolean
  total: number
}

// --- STEP 1: 天気の正規化（日本語ラベル → 英語weatherTag語彙） ---
//
// Open-Meteoの天気ラベル（WMO weather code由来、日本語、fetchWeeklyWeather.ts
// 参照）から、マロン指示の語彙のうち自動導出可能なものだけを機械的に導く。
// 'humid'（湿度）・'after-rain'（雨上がり）はOpen-Meteoの天気コードからは
// 導出できない情報のため、日次コンテキストの自動導出対象には含めない——
// MusicTracks側でこれらのタグを人間が手動付与すること自体は妨げないが、
// その場合はその項目のスコアには（自動導出されないため）寄与しない。
const WEATHER_LABEL_TO_TAGS: [string, WeatherTag[]][] = [
  ['雷', ['thunder', 'rain']],
  ['霧雨', ['drizzle', 'rain']],
  ['雨', ['rain']],
  ['曇', ['cloudy']],
  ['晴', ['sunny']],
]

export function deriveWeatherTagsFromConditionLabel(conditionLabel: string): WeatherTag[] {
  const tags = new Set<WeatherTag>()
  for (const [keyword, mapped] of WEATHER_LABEL_TO_TAGS) {
    if (conditionLabel.includes(keyword)) {
      mapped.forEach((t) => tags.add(t))
    }
  }
  return [...tags]
}

// --- STEP 2: 気分の正規化（weekday + TNS Editorial Code + fixedMoodLabel + 天気 → moodTag集合） ---
//
// TNS Editorial Codeにfixed labelがある（code1/5/7）場合はその編集済み
// ラベルの意味をmoodTagへ対応づける固定表。fixed labelがない曜日
// （dynamic mood運用中のcode2/3/4/6）は、曜日そのものが持つ一般的な生活
// リズム（月曜の切り替え、金曜の高揚、土曜の解放感等）をmoodTagの土台とする
// ——AIが生成した自由文（dynamicEmotion）は一切参照しない。天気由来の
// 気分（雨の日は内省的、晴れの日は爽快、等）を土台に加算する。
const FIXED_LABEL_MOOD_TAGS: Partial<Record<TnsEditorialCode, MoodTag[]>> = {
  code1: ['quiet', 'hopeful'], // リスタート／静かな決意
  code5: ['night', 'energetic'], // 夜が始まる
  code7: ['quiet', 'mellow'], // Soft-Cloud Ginza
}

const WEEKDAY_ARCHETYPE_MOOD_TAGS: Record<Weekday, MoodTag[]> = {
  monday: ['quiet', 'hopeful'],
  tuesday: ['reflective'],
  wednesday: ['reflective', 'mellow'],
  thursday: ['energetic'],
  friday: ['night', 'energetic'],
  saturday: ['refreshing', 'mellow'],
  sunday: ['quiet', 'mellow'],
}

const WEATHER_MOOD_CONTRIBUTION: Partial<Record<WeatherTag, MoodTag[]>> = {
  rain: ['reflective'],
  drizzle: ['quiet', 'reflective'],
  thunder: ['energetic'],
  cloudy: ['mellow'],
  sunny: ['refreshing', 'energetic'],
}

export function deriveMoodTagsForDay(context: {
  code: TnsEditorialCode
  weekday: Weekday
  fixedMoodLabel: string
  weatherTags: WeatherTag[]
}): MoodTag[] {
  const base = context.fixedMoodLabel
    ? (FIXED_LABEL_MOOD_TAGS[context.code] ?? [])
    : WEEKDAY_ARCHETYPE_MOOD_TAGS[context.weekday]

  const weatherMood = context.weatherTags.flatMap((tag) => WEATHER_MOOD_CONTRIBUTION[tag] ?? [])

  return [...new Set([...base, ...weatherMood])]
}

// --- STEP 3: 照合（MusicTracksのタグ集合との一致判定） ---
//
// season/ginzaCodeは既存どおり厳密な値一致（enum一致）。weather/moodは
// 正規化タグ集合同士の共通要素の有無（1つでも一致すれば加点）で判定する。
// 文字列の部分一致・あいまい一致は行わない——タグ語彙そのものが正規化済み
// であることを前提とする。
export function scoreTrackForDay(track: MusicCandidate, context: DayScoringContext): TrackScoreBreakdown {
  const dayWeatherTags = deriveWeatherTagsFromConditionLabel(context.conditionLabel)
  const weatherMatch = (track.weatherTags ?? []).some((tag) => (dayWeatherTags as string[]).includes(tag))

  const seasonMatch = (track.seasonTags ?? []).includes(context.season)
  const ginzaCodeMatch = (track.ginzaCodeTags ?? []).includes(context.code)

  const dayMoodTags = deriveMoodTagsForDay({
    code: context.code,
    weekday: context.weekday,
    fixedMoodLabel: context.fixedMoodLabel,
    weatherTags: dayWeatherTags,
  })
  const moodMatch = (track.moodTags ?? []).some((tag) => (dayMoodTags as string[]).includes(tag))

  const total =
    (weatherMatch ? SCORE_WEIGHTS.weather : 0) +
    (seasonMatch ? SCORE_WEIGHTS.season : 0) +
    (ginzaCodeMatch ? SCORE_WEIGHTS.ginzaCode : 0) +
    (moodMatch ? SCORE_WEIGHTS.mood : 0)

  return { weatherMatch, seasonMatch, ginzaCodeMatch, moodMatch, total }
}

// Maron向けの内部根拠テキスト（AIには生成させない、スコア内訳をそのまま
// 機械的に文章化するだけ——Editorial Trust Layerの「AIに理由を作文させず
// システム側の実データから機械的に付与する」既存パターンと同じ考え方）。
export function formatScoreBreakdownAsInternalReason(breakdown: TrackScoreBreakdown): string {
  const matched: string[] = []
  if (breakdown.weatherMatch) matched.push('天気タグ一致')
  if (breakdown.seasonMatch) matched.push('季節タグ一致')
  if (breakdown.ginzaCodeMatch) matched.push('GINZA Codeタグ一致')
  if (breakdown.moodMatch) matched.push('気分タグ一致')

  return matched.length > 0
    ? `スコア${breakdown.total}点（${matched.join('・')}）`
    : `スコア0点（タグ一致なし、候補中で消去法的に選定）`
}
