// contentType -> 収蔵室（6本柱）の対応表。
//
// 2026-08-25、週次「旬の銀座」記事生成（createWeeklyDraftFromDiscoveredContent.ts、
// Human Editor Review P2-6）で最初に導入した表を、2026-08-27のProject 02-1
// 「核情報→最大5記事」拡張（createMultiAngleDraftsFromDiscoveredContent.ts）でも
// 同じ対応関係が必要になったため、共有モジュールとして抽出した（重複実装を避ける）。
// 6本柱の固定タクソノミー（歴史/文化/アート/建築/人物/イベント、CLAUDE.md第2章）
// 自体は変更しない——ART/DISCOVER/EXPERIENCE等の新規カテゴリーは追加しない。
export const CONTENT_TYPE_TO_PILLAR_NAME: Record<string, string> = {
  event: 'イベント',
  exhibition: 'アート',
  food: '文化',
  shopping: '文化',
  culture: '文化',
  news: '文化',
  other: '文化',
}
