// GINZA WHISKERS / Project 02（2026-09-10）— note 記事冒頭マストヘッド（恒久ルール）。
//
// すべての note 記事の冒頭に、次の順で必ず挿入する：
//   1. 記事分類に対応する 18 カテゴリーアイコンを 1 点
//   2. 固定文章「GINZA TIME EDIT / by GINZA WHISKERS …」（一字一句変更しない）
//   3. その後に各記事の本文
//
// マストヘッドは **note 転記レイヤーの要素** であり、CMS の記事本文（Articles.body）には
// 生成・保存しない（重複防止）。この定数を唯一の正とし、転記パッケージ
// （buildNoteDraftPackage）が冒頭へ前置する。記事本文側の後処理（polishArticleDraft）は
// stripMasthead で万一混入した場合に除去する。

import { deriveProvisionalCategory } from '../pipeline/provisionalCategory'

/** 固定マストヘッド本文（一字一句不変。改行位置も含む）。 */
export const NOTE_MASTHEAD_TEXT = `GINZA TIME EDIT
by GINZA WHISKERS

400年の銀座を、今日の私へ。

新しい店、季節の味、アート、舞台、街に残る小さな物語。銀座の過去、現在、未来を紡ぎながら、「今、この銀座に出会う理由」をGINZA WHISKERSの編集視点で届けます。

次の銀ブラに、私だけの銀座時間を。`

export type CategoryCode =
  | 'FOOD'
  | 'CAFE'
  | 'SHOPPING'
  | 'ARCHITECTURE'
  | 'ART'
  | 'EVENT'
  | 'NIGHT'
  | 'MUSIC'
  | 'BEAUTY'
  | 'HOTEL'
  | 'WELLNESS'
  | 'EXPERIENCE'
  | 'GIFT'
  | 'WORKSHOP'
  | 'PHOTO'
  | 'FAMILY'
  | 'NIGHT_VIEW'
  | 'RAINY_DAY'

export interface CategoryIcon {
  category: CategoryCode
  labelJa: string
  /** VISUAL_ASSET_LIBRARY §8.2 のスラッグ */
  iconSlug: string
  /** media/discover-ginza-category-icons/ 配下の実ファイル名 */
  iconFile: string
}

/** 18 カテゴリー → アイコン（VISUAL_ASSET_LIBRARY §3.3 / §8.2 と 1:1）。 */
export const CATEGORY_ICONS: Record<CategoryCode, CategoryIcon> = {
  FOOD: { category: 'FOOD', labelJa: 'グルメ', iconSlug: 'icon_food', iconFile: '01_gourmet.jpg' },
  CAFE: { category: 'CAFE', labelJa: 'カフェ', iconSlug: 'icon_cafe', iconFile: '02_cafe.jpg' },
  SHOPPING: { category: 'SHOPPING', labelJa: 'ショッピング', iconSlug: 'icon_shopping', iconFile: '03_shopping.jpg' },
  ARCHITECTURE: {
    category: 'ARCHITECTURE',
    labelJa: '名所・建築',
    iconSlug: 'icon_architecture',
    iconFile: '04_landmarks_and_architecture.jpg',
  },
  ART: { category: 'ART', labelJa: 'アート・文化', iconSlug: 'icon_art', iconFile: '05_art_and_culture.jpg' },
  EVENT: { category: 'EVENT', labelJa: 'イベント', iconSlug: 'icon_event', iconFile: '06_events.jpg' },
  NIGHT: { category: 'NIGHT', labelJa: 'バー・お酒', iconSlug: 'icon_night', iconFile: '07_bars_and_drinks.jpg' },
  MUSIC: { category: 'MUSIC', labelJa: '音楽・ライブ', iconSlug: 'icon_music', iconFile: '08_music_and_live.jpg' },
  BEAUTY: { category: 'BEAUTY', labelJa: 'ビューティー', iconSlug: 'icon_beauty', iconFile: '09_beauty.jpg' },
  HOTEL: { category: 'HOTEL', labelJa: 'ホテル', iconSlug: 'icon_hotel', iconFile: '10_hotels.jpg' },
  WELLNESS: {
    category: 'WELLNESS',
    labelJa: '癒し・リラクゼーション',
    iconSlug: 'icon_wellness',
    iconFile: '11_wellness_and_relaxation.jpg',
  },
  EXPERIENCE: {
    category: 'EXPERIENCE',
    labelJa: 'トラベル・体験',
    iconSlug: 'icon_experience',
    iconFile: '12_travel_and_experiences.jpg',
  },
  GIFT: { category: 'GIFT', labelJa: '手土産・ギフト', iconSlug: 'icon_gift', iconFile: '13_gifts_and_souvenirs.jpg' },
  WORKSHOP: {
    category: 'WORKSHOP',
    labelJa: '学び・ワークショップ',
    iconSlug: 'icon_workshop',
    iconFile: '14_learning_and_workshops.jpg',
  },
  PHOTO: { category: 'PHOTO', labelJa: 'フォトスポット', iconSlug: 'icon_photo', iconFile: '15_photo_spots.jpg' },
  FAMILY: { category: 'FAMILY', labelJa: 'ファミリー', iconSlug: 'icon_family', iconFile: '16_family.jpg' },
  NIGHT_VIEW: {
    category: 'NIGHT_VIEW',
    labelJa: '夜景・ナイトスポット',
    iconSlug: 'icon_nightview',
    iconFile: '17_night_views_and_night_spots.jpg',
  },
  RAINY_DAY: {
    category: 'RAINY_DAY',
    labelJa: '雨の日おすすめ',
    iconSlug: 'icon_rainyday',
    iconFile: '18_rainy_day_picks.jpg',
  },
}

export interface ResolvedCategoryIcon {
  /** 'resolved'＝アイコン確定。'needs_human'＝確定できず人間確認で停止する。 */
  status: 'resolved' | 'needs_human'
  category: CategoryCode | null
  labelJa: string | null
  iconSlug: string | null
  iconFile: string | null
  basis: 'primaryCategory' | 'title' | 'templateType' | 'pillar' | null
  reason: string
}

// 収蔵室（6 分類）→ 18 カテゴリーの弱いフォールバック。安全に対応づく 3 種のみ。
const PILLAR_FALLBACK: Record<string, CategoryCode> = {
  文化: 'ART',
  アート: 'ART',
  建築: 'ARCHITECTURE',
  イベント: 'EVENT',
}

/**
 * 記事分類 → 18 カテゴリーアイコンを決定的に解決する（推測はしない）。
 *  1. deriveProvisionalCategory（明記語のみ・primaryCategory / title / templateType）
 *  2. 収蔵室（pillarJa）からの安全なフォールバック（文化・アート→ART / 建築→ARCHITECTURE / イベント→EVENT）
 *  3. どれも当たらなければ needs_human（＝転記パッケージを止めて人間が指定する）
 */
export function resolveCategoryIcon(input: {
  primaryCategory?: string | null
  title?: string | null
  venue?: string | null
  templateType?: string | null
  contentType?: string | null
  pillarJa?: string | null
}): ResolvedCategoryIcon {
  const prov = deriveProvisionalCategory({
    primaryCategory: input.primaryCategory ?? null,
    title: input.title ?? null,
    venue: input.venue ?? null,
    templateType: input.templateType ?? null,
    contentType: input.contentType ?? null,
  })
  if (prov.category && (CATEGORY_ICONS as Record<string, CategoryIcon>)[prov.category]) {
    const ic = CATEGORY_ICONS[prov.category as CategoryCode]
    return {
      status: 'resolved',
      category: ic.category,
      labelJa: ic.labelJa,
      iconSlug: ic.iconSlug,
      iconFile: ic.iconFile,
      basis: prov.basis,
      reason: `deriveProvisionalCategory（basis=${prov.basis}）→ ${ic.category}`,
    }
  }

  const pillar = (input.pillarJa ?? '').trim()
  if (pillar && PILLAR_FALLBACK[pillar]) {
    const ic = CATEGORY_ICONS[PILLAR_FALLBACK[pillar]]
    return {
      status: 'resolved',
      category: ic.category,
      labelJa: ic.labelJa,
      iconSlug: ic.iconSlug,
      iconFile: ic.iconFile,
      basis: 'pillar',
      reason: `収蔵室「${pillar}」→ ${ic.category}（弱いフォールバック）`,
    }
  }

  return {
    status: 'needs_human',
    category: null,
    labelJa: null,
    iconSlug: null,
    iconFile: null,
    basis: null,
    reason:
      'タイトル・会場の明記語からも収蔵室からも 18 カテゴリーを確定できなかった。' +
      'マロンが記事分類に応じてアイコンを 1 点指定する必要がある（推測で埋めない）。',
  }
}

/** マストヘッドの固有行（重複検出に使う）。 */
const MASTHEAD_MARKERS = ['GINZA TIME EDIT', 'by GINZA WHISKERS', '次の銀ブラに、私だけの銀座時間を。']

/** 文字列にマストヘッド固定文が（少なくとも主要行が）既に含まれているか。 */
export function bodyHasMasthead(text: string | null | undefined): boolean {
  if (!text) return false
  return MASTHEAD_MARKERS.every((m) => text.includes(m))
}

/**
 * 記事本文からマストヘッド固定文を除去する（CMS 記事本文に混入させない）。
 * マストヘッド全文が連続しているケースと、行単位で散っているケースの両方を落とす。
 */
export function stripMasthead(input: string): string {
  if (typeof input !== 'string' || input === '') return input
  let s = input
  if (s.includes(NOTE_MASTHEAD_TEXT)) s = s.split(NOTE_MASTHEAD_TEXT).join('')
  const MASTHEAD_LINES = NOTE_MASTHEAD_TEXT.split('\n').map((l) => l.trim()).filter(Boolean)
  s = s
    .split('\n')
    .filter((line) => !MASTHEAD_LINES.includes(line.trim()))
    .join('\n')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 本文ユニット配列 + 末尾ハッシュタグ行を、マストヘッド固定文を冒頭に付けた
 * note 転記用プレーンテキストへ合成する。既にマストヘッドを含む場合は二重付与しない。
 */
export function composeNoteBodyWithMasthead(bodyUnits: string[], hashtagLine: string): string {
  const joined = bodyUnits.filter((u) => u && u.trim()).join('\n\n')
  const parts = bodyHasMasthead(joined) ? [joined] : [NOTE_MASTHEAD_TEXT, joined]
  if (hashtagLine && hashtagLine.trim()) parts.push(hashtagLine.trim())
  return parts.filter(Boolean).join('\n\n') + '\n'
}
