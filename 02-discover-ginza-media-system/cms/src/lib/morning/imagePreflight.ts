// GINZA WHISKERS / Project 02 P0 改善（2026-09-02）— 画像 preflight（純粋関数）。
//
// 候補提示「前」に、使える画像があるかを決定的に判定する。
//   ・世界観挿絵：季節 → world_<season> スラッグを在庫（media/image-assets/ の
//     ファイル名 ＋ image-assets コレクションの name/title）から探す。
//   ・カテゴリー画像：categoryLabel → icon_<label> 相当を在庫から探す。
//   ・外部画像（ginza.jp OGP・イベント公式画像 等）は常に転載禁止（Editorial Trust Layer）。
//   ・在庫に無ければ available:false・policy「画像なし」。新規生成はマロン判断後。
//
// この関数は fs も payload も触らない。在庫リストは呼び出し元が渡す。

import type { ImagePreflightResult } from './types'

/** 季節（日本語）→ VISUAL_ASSET_LIBRARY の world スラッグ */
const SEASON_TO_SLUG: Record<string, string> = {
  春: 'spring',
  夏: 'summer',
  秋: 'autumn',
  冬: 'winter',
}

/** カテゴリー日本語ラベル → アイコンのスラッグ候補（VISUAL_ASSET_LIBRARY 18分類の一部） */
const CATEGORY_TO_SLUG: Record<string, string> = {
  'アート・文化': 'art',
  アート: 'art',
  文化: 'culture',
  イベント: 'event',
  グルメ: 'food',
  カフェ: 'cafe',
  ショッピング: 'shopping',
  建築: 'architecture',
  展覧会: 'exhibition',
}

export interface ImagePreflightInput {
  /** 季節（日本語「春/夏/秋/冬」）。DiscoveredContent / ArticleFacts から決定的に導出済みの値 */
  season?: string | null
  /** カテゴリー画像のラベル（例「アート・文化」）。pillar 名など */
  categoryLabel?: string | null
  /**
   * 画像在庫。media/image-assets/ のファイル名（拡張子込み）と
   * image-assets コレクションの name/title を小文字化して連結したもの。
   */
  inventory: string[]
}

function findInInventory(inventory: string[], needles: string[]): string | undefined {
  const lower = inventory.map((s) => s.toLowerCase())
  for (const n of needles) {
    const idx = lower.findIndex((s) => s.includes(n.toLowerCase()))
    if (idx >= 0) return inventory[idx]
  }
  return undefined
}

export function imagePreflight(input: ImagePreflightInput): ImagePreflightResult {
  const season = input.season ?? undefined
  const categoryLabel = input.categoryLabel ?? undefined
  const inv = Array.isArray(input.inventory) ? input.inventory : []

  const seasonSlug = season ? SEASON_TO_SLUG[season] : undefined
  const catSlug = categoryLabel ? CATEGORY_TO_SLUG[categoryLabel] : undefined

  // 1) 世界観挿絵（季節）
  const worldHit = seasonSlug
    ? findInInventory(inv, [`world_${seasonSlug}`, `world-${seasonSlug}`, `${seasonSlug}_world`])
    : undefined
  if (worldHit) {
    return {
      available: true,
      assetPath: worldHit,
      season,
      categoryLabel,
      policy: `世界観挿絵（world_${seasonSlug}）を使用可能：${worldHit}`,
      externalImageProhibited: true,
    }
  }

  // 2) カテゴリー画像
  const catHit = catSlug
    ? findInInventory(inv, [`icon_${catSlug}`, `icon-${catSlug}`, `category_${catSlug}`, catSlug])
    : undefined
  if (catHit) {
    return {
      available: true,
      assetPath: catHit,
      season,
      categoryLabel,
      policy: `カテゴリー画像（${categoryLabel} / ${catSlug}）を使用可能：${catHit}`,
      externalImageProhibited: true,
    }
  }

  // 3) どちらも無い → 画像なしで公開（BLOCKER にしない：Editorial Trust Layer）
  const want: string[] = []
  if (seasonSlug) want.push(`world_${seasonSlug}`)
  if (catSlug) want.push(`icon_${catSlug}（${categoryLabel}）`)
  const wantStr = want.length > 0 ? `（探した素材: ${want.join(' / ')}）` : ''
  return {
    available: false,
    season,
    categoryLabel,
    policy: `画像なし${wantStr}。外部画像の転載は不可。新規生成はマロン判断後（追加課金しない）。画像なしでの公開は許容。`,
    externalImageProhibited: true,
  }
}
