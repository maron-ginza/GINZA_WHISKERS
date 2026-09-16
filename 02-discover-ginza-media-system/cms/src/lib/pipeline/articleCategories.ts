// GINZA WHISKERS / Project 02（2026-09-17新設・マロン指示：朝処理の統合）
//
// 18カテゴリーの正本一覧（値のみ・ランタイム配列）。既存の分類ロジック本体
// （provisionalCategory.ts の TITLE_RULES／noteMasthead.ts の CATEGORY_ICONS）は
// 変更しない——それぞれ独自の理由（判定順序・アイコン割当）でこの18値を個別に
// 保持しており、ここではそれらと矛盾しない値の一覧を、SOURCE_LEDGERの「対応
// カテゴリー」フィールド（情報源がどのカテゴリーを典型的に生む情報源かのヒント。
// A/B/C判定・分類そのものには使わない）で使うために追加しただけ。
//
// 値は noteMasthead.ts の CATEGORY_ICONS のキー集合と完全一致させている
// （18種、2026-08-19 Visual Asset Library確定分）。

export const ARTICLE_18_CATEGORIES = [
  'FOOD',
  'CAFE',
  'SWEETS',
  'SHOPPING',
  'ARCHITECTURE',
  'ART',
  'EVENT',
  'NIGHT',
  'MUSIC',
  'BEAUTY',
  'HOTEL',
  'WELLNESS',
  'EXPERIENCE',
  'GIFT',
  'WORKSHOP',
  'PHOTO',
  'FAMILY',
  'NIGHT_VIEW',
] as const

export type Article18Category = (typeof ARTICLE_18_CATEGORIES)[number]

// noteMasthead.ts の CATEGORY_ICONS.labelJa と一字一句一致させている（正本を複製
// せず値だけ書き写す。ラベル変更時はnoteMasthead.ts側の変更に追従が必要）。
export const ARTICLE_18_CATEGORY_LABELS: Record<Article18Category, string> = {
  FOOD: 'グルメ',
  CAFE: 'カフェ',
  SWEETS: 'スウィーツ',
  SHOPPING: 'ショッピング',
  ARCHITECTURE: '名所・建築',
  ART: 'アート・文化',
  EVENT: 'イベント',
  NIGHT: 'バー・お酒',
  MUSIC: '音楽・ライブ',
  BEAUTY: 'ビューティー',
  HOTEL: 'ホテル',
  WELLNESS: '癒し・リラクゼーション',
  EXPERIENCE: 'トラベル・体験',
  GIFT: '手土産・ギフト',
  WORKSHOP: '学び・ワークショップ',
  PHOTO: 'フォトスポット',
  FAMILY: 'ファミリー',
  NIGHT_VIEW: '夜景・ナイトスポット',
}
