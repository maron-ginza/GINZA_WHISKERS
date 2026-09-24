// GINZA WHISKERS / Project 02（2026-09-24追加）— 主カテゴリー8分類のラベル・
// アイコンファイル名。cms側の正本は cms/src/lib/pipeline/primaryCategory8.ts。
//
// site（Astro）と cms（Payload）は別プロジェクト（別 package.json・別
// tsconfig）として運用されており、site/src/lib/payload.ts が既に採用している
// 方針（「cms側のpayload-types.tsとの共有は今後の課題」、CONTENT_MODEL.md
// 準拠の最小限の型を site 側で独自定義する）にならい、8分類の値もここで
// 最小限だけ独自に持つ（cms側のファイルを直接 import しない）。
// 値そのものは primaryCategory8.ts と一字一句一致させること
// （どちらかを変更したらもう片方も更新する）。
//
// アイコン実体：site/public/category-icons/ 配下（cms/src/scripts/../../media/
// discover-ginza-category-icons/ からサイト公開用に複製したもの）。

export const PRIMARY_CATEGORY_8_LABELS_JA: Record<string, string> = {
  SWEETS: 'スイーツ',
  GOURMET: 'グルメ',
  SHOPPING: 'ショッピング',
  ART_CULTURE: 'アート・文化',
  MUSIC_STAGE: '音楽・舞台',
  BEAUTY_WELLNESS: 'ビューティー・ウェルネス',
  LEARNING_EXPERIENCE: '学び・体験',
  SEASONAL: '季節の催し',
}

export const PRIMARY_CATEGORY_8_ICON_FILES: Record<string, string> = {
  SWEETS: '01_sweets.png',
  GOURMET: '02_gourmet.png',
  SHOPPING: '03_shopping.png',
  ART_CULTURE: '04_art_culture.png',
  MUSIC_STAGE: '05_music_stage.png',
  BEAUTY_WELLNESS: '06_beauty_wellness.png',
  LEARNING_EXPERIENCE: '07_learning_experience.png',
  SEASONAL: '08_seasonal_events.png',
}

/** 8分類の値（Articles.primaryCategory8、未知の値やnullはnull）→ 日本語ラベル。 */
export function categoryLabelJa(category: string | null | undefined): string | null {
  if (!category) return null
  return PRIMARY_CATEGORY_8_LABELS_JA[category] ?? null
}

/** 8分類の値 → アイコンの絶対URL（base = サイトのオリジン）。未知の値やnullはnull。 */
export function categoryIconUrl(category: string | null | undefined, base: string): string | null {
  if (!category) return null
  const file = PRIMARY_CATEGORY_8_ICON_FILES[category]
  if (!file) return null
  return `${base}/category-icons/${file}`
}
