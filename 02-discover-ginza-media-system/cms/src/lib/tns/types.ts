// 🌈Tokyo Nostalgic Soundtrack（TNS）自動化（2026-08-27、TNS_SPEC.md v1.1準拠）。
// Payloadに依存しない純粋な型定義。discoveredContentTypes.ts・
// lib/curation/types.tsと同じ設計方針（複数箇所から共有する定数・型はここに集約）。

// TNS_SPEC.md §4：曜日はMonday始まり（週次バッチ運用が_media_pipeline/
// projects.jsonのweek_patternと同じ月曜起点のため）。
export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABELS_JA: Record<Weekday, string> = {
  monday: '月曜日',
  tuesday: '火曜日',
  wednesday: '水曜日',
  thursday: '木曜日',
  friday: '金曜日',
  saturday: '土曜日',
  sunday: '日曜日',
}

// TNS_SPEC.md §4「表記ルール」：TNS仕様内では「GINZA CODE」という名称を
// 使用せず「TNS Editorial Code」に統一する、という既存確定事項に従う。
// マロンの指示文中の「GINZA CODE」は、この既存のTNS Editorial Code
// （Code1〜7）を指すものとして扱う（新しい定義を作らない）。
export const TNS_EDITORIAL_CODES = ['code1', 'code2', 'code3', 'code4', 'code5', 'code6', 'code7'] as const
export type TnsEditorialCode = (typeof TNS_EDITORIAL_CODES)[number]

// TNS_SPEC.md §6.1 weekdayCodeMapping初期値：Monday=Code1〜Sunday=Code7。
// この対応表自体は固定ロジックにハードコードせず、TNSSettings（Global）
// という設定値として保持する——本定数はそのGlobalの初期値（defaultValue）
// としてのみ使用する。
export const DEFAULT_WEEKDAY_CODE_MAPPING: Record<Weekday, TnsEditorialCode> = {
  monday: 'code1',
  tuesday: 'code2',
  wednesday: 'code3',
  thursday: 'code4',
  friday: 'code5',
  saturday: 'code6',
  sunday: 'code7',
}

// TNS Music Selection Logic（TNS_SPEC.md §3.1）Track候補属性。
export const ERA_ELIGIBILITIES = ['showa', 'exception', 'out_of_scope'] as const
export type EraEligibility = (typeof ERA_ELIGIBILITIES)[number]

export const MUSIC_ORIGINS = ['japanese', 'international'] as const
export type MusicOrigin = (typeof MUSIC_ORIGINS)[number]

export const MUSIC_GENRES = [
  '昭和歌謡',
  'City Pop',
  '日本映画音楽',
  'Jazz',
  'Standard',
  'Oldies',
  'Pops',
  '映画音楽',
  'その他',
] as const
export type MusicGenre = (typeof MUSIC_GENRES)[number]

export const GINZA_AFFINITY_EVIDENCES = ['verified', 'contextual', 'unknown'] as const
export type GinzaAffinityEvidence = (typeof GINZA_AFFINITY_EVIDENCES)[number]

// 週間天気の取得経路（TNS_SPEC.md §5）。
export const WEATHER_SOURCES = ['api', 'manual', 'ai_retrieved'] as const
export type WeatherSource = (typeof WEATHER_SOURCES)[number]

// VISUAL_ASSET_LIBRARY.md §2.3の季節区分（6タイプ）をそのまま再利用する
// （TNS_SPEC.md §2 STEP1が「季節、VISUAL_ASSET_LIBRARY.md§2.3の季節区分を
// 参考にできる」と明記している既存資産の再利用）。新しい季節区分は作らない。
export const SEASON_TYPES = ['SPRING', 'SUMMER', 'AUTUMN', 'CHRISTMAS', 'NEW_YEAR', 'WINTER'] as const
export type SeasonType = (typeof SEASON_TYPES)[number]
