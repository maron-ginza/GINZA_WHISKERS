// GINZA WHISKERS / Project 02（2026-09-24、マロン指示：主カテゴリー整理）
//
// 【背景】既存の18カテゴリー（articleCategories.ts の ARTICLE_18_CATEGORIES、
// noteMasthead.ts の CATEGORY_ICONS）は、記事1本ごとのアイコン表示・SOURCE_LEDGER の
// 「対応カテゴリー」ヒントとして機能しており、これらは**一切変更しない**——既存データ・
// アイコン表示を壊さないため。本ファイルは、その18カテゴリーの**上**に立つ表示専用の
// 集約レイヤーで、Morning Board 等で人間が一覧しやすいよう8つの主カテゴリーへまとめる
// （スイーツ／グルメ／ショッピング／アート・文化／音楽・舞台／ビューティー・ウェルネス／
// 学び・体験／季節の催し）。
//
// 【移行方法（既存データ・アイコンを壊さない）】
//   - DiscoveredContent／ArticleFacts のカテゴリーフィールド自体は変更しない
//     （deriveProvisionalCategory・primaryCategory は無変更で18値を返し続ける）。
//   - CATEGORY_ICONS（noteMasthead.ts）も18値のまま無変更——note転記のアイコンは
//     従来どおり18カテゴリー単位で解決される。
//   - 本ファイルは18→8の**読み取り専用の写像**のみを提供する（副作用なし・DB非依存）。
//     Morning Board 等の表示側だけがこれを使って8グループの集計・表示を行う。
//   - 18カテゴリー側に将来新しい値が増えた場合、CATEGORY_TO_PRIMARY_8 に追記しないと
//     mapToPrimaryCategory8 は null を返す（無言で誤分類しない設計。未対応は
//     呼び出し側で「未分類（8分類）」として扱うこと）。
//
// 【8分類の内訳・判断根拠】
//   SWEETS            … SWEETS（そのまま）
//   GOURMET           … FOOD・CAFE・NIGHT（食事・喫茶・酒/バーはいずれも飲食体験）
//   SHOPPING          … SHOPPING・GIFT（手土産・ギフトは購買行動の一種）
//   ART_CULTURE       … ART・ARCHITECTURE・PHOTO・NIGHT_VIEW（鑑賞・散策・撮影スポットは
//                        いずれも文化的な体験として括る）
//   MUSIC_STAGE       … MUSIC（既存18カテゴリーに舞台・演劇専用の値が無いため、
//                        音楽・ライブがそのまま対応。舞台芸術専用の分岐が必要になった
//                        場合は18カテゴリー側の拡張が前提——本マッピングだけでは作らない）
//   BEAUTY_WELLNESS   … BEAUTY・WELLNESS（そのまま統合）
//   LEARNING_EXPERIENCE … WORKSHOP・EXPERIENCE・FAMILY（学び・体験・家族向け活動は
//                        いずれも「参加する体験」という性質で括る）
//   SEASONAL          … EVENT・HOTEL（汎用「イベント」と「ホテル」は特定ジャンルに
//                        紐づかない期間限定の催し・企画に該当する例が多いため、
//                        季節の催しへ集約する。HOTELは唯一ジャンル的に曖昧な項目——
//                        アフタヌーンティー等スイーツ性が強い場合は元々SWEETSへ分類
//                        されるため、HOTELとして残るのは季節企画・宿泊プランが中心）
//
// 通年案内（isYearRoundOffering）・利用場面タグは主カテゴリーとは別の軸として分離する
// （本ファイルでは扱わない。通年案内の判定は isYearRoundOffering.ts を参照。利用場面
// タグは語彙未確定のため未実装——推測でタグ語彙を作らず、マロン確認事項として
// CLAUDE.md へ申し送る）。

export const PRIMARY_CATEGORY_8 = [
  'SWEETS',
  'GOURMET',
  'SHOPPING',
  'ART_CULTURE',
  'MUSIC_STAGE',
  'BEAUTY_WELLNESS',
  'LEARNING_EXPERIENCE',
  'SEASONAL',
] as const

export type PrimaryCategory8 = (typeof PRIMARY_CATEGORY_8)[number]

export const PRIMARY_CATEGORY_8_LABELS: Record<PrimaryCategory8, string> = {
  SWEETS: 'スイーツ',
  GOURMET: 'グルメ',
  SHOPPING: 'ショッピング',
  ART_CULTURE: 'アート・文化',
  MUSIC_STAGE: '音楽・舞台',
  BEAUTY_WELLNESS: 'ビューティー・ウェルネス',
  LEARNING_EXPERIENCE: '学び・体験',
  SEASONAL: '季節の催し',
}

// 既存18カテゴリー（articleCategories.ts の ARTICLE_18_CATEGORIES）→ 8分類。
// 18カテゴリー側の値を複製せず、キーとして文字列のまま参照する（型はゆるくして
// おき、articleCategories.ts に依存させない——SOURCE_LEDGERの`article18Categories`や
// deriveProvisionalCategoryの出力等、呼び出し側の型がまちまちなため）。
const CATEGORY_TO_PRIMARY_8: Record<string, PrimaryCategory8> = {
  SWEETS: 'SWEETS',
  FOOD: 'GOURMET',
  CAFE: 'GOURMET',
  NIGHT: 'GOURMET',
  SHOPPING: 'SHOPPING',
  GIFT: 'SHOPPING',
  ART: 'ART_CULTURE',
  ARCHITECTURE: 'ART_CULTURE',
  PHOTO: 'ART_CULTURE',
  NIGHT_VIEW: 'ART_CULTURE',
  MUSIC: 'MUSIC_STAGE',
  BEAUTY: 'BEAUTY_WELLNESS',
  WELLNESS: 'BEAUTY_WELLNESS',
  WORKSHOP: 'LEARNING_EXPERIENCE',
  EXPERIENCE: 'LEARNING_EXPERIENCE',
  FAMILY: 'LEARNING_EXPERIENCE',
  EVENT: 'SEASONAL',
  HOTEL: 'SEASONAL',
  // RAINY_DAY は articleCategories.ts の18カテゴリー（deriveProvisionalCategoryの
  // 分類対象）には含まれない別枠の値（noteMasthead.ts の CategoryCode にのみ存在）。
  // 天候条件による横断的なおすすめ提示という性質上、特定の1カテゴリーには
  // 収まらないが、「時期・条件に応じた提案」という点で季節の催しに最も近いと
  // 判断し SEASONAL へ寄せる（編集判断・要確認事項として申し送る）。
  RAINY_DAY: 'SEASONAL',
}

/**
 * 18カテゴリー値（または null／未対応値）を8分類へ写像する。純粋関数・副作用なし。
 * 未対応の値（将来18カテゴリー側に追加されて本マップが追従していない場合を含む）は
 * 推測せず null を返す——呼び出し側は「未分類（8分類）」として扱うこと。
 */
export function mapToPrimaryCategory8(category18: string | null | undefined): PrimaryCategory8 | null {
  if (!category18) return null
  return CATEGORY_TO_PRIMARY_8[category18] ?? null
}

/** 8分類のラベル（日本語）を返す。未知の値は null。 */
export function primaryCategory8Label(cat: PrimaryCategory8 | null | undefined): string | null {
  if (!cat) return null
  return PRIMARY_CATEGORY_8_LABELS[cat] ?? null
}

// 【2026-09-24追加・マロン確認済み】完成版8アイコン
// （media/discover-ginza-category-icons/ 配下、マロン提供・実ファイル確認済み）。
// 通年案内・利用場面タグはこのアイコン割当の対象にしない（主カテゴリーのみ）。
export const PRIMARY_CATEGORY_8_ICON_FILES: Record<PrimaryCategory8, string> = {
  SWEETS: '01_sweets.png',
  GOURMET: '02_gourmet.png',
  SHOPPING: '03_shopping.png',
  ART_CULTURE: '04_art_culture.png',
  MUSIC_STAGE: '05_music_stage.png',
  BEAUTY_WELLNESS: '06_beauty_wellness.png',
  LEARNING_EXPERIENCE: '07_learning_experience.png',
  SEASONAL: '08_seasonal_events.png',
}

/** 8分類のアイコンファイル名（media/discover-ginza-category-icons/ 配下）を返す。未知の値は null。 */
export function primaryCategory8IconFile(cat: PrimaryCategory8 | null | undefined): string | null {
  if (!cat) return null
  return PRIMARY_CATEGORY_8_ICON_FILES[cat] ?? null
}

/** 18カテゴリー値から直接アイコンファイル名を返す便宜関数（mapToPrimaryCategory8 + primaryCategory8IconFile の合成）。 */
export function iconFileForCategory18(category18: string | null | undefined): string | null {
  return primaryCategory8IconFile(mapToPrimaryCategory8(category18))
}
