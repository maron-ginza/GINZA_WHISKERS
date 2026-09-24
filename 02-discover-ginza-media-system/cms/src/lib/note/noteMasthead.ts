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
  | 'SWEETS'
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
  /** VISUAL_ASSET_LIBRARY §8.2 のスラッグ（2026-09-24以降は8分類ベースのスラッグ） */
  iconSlug: string
  /** media/discover-ginza-category-icons/ 配下の実ファイル名 */
  iconFile: string
}

// 【2026-09-24改訂・マロン指示】旧18カテゴリー専用アイコン画像（01_gourmet.jpg等）は
// そもそも一度も制作・配置されていなかった（media/discover-ginza-category-icons/ に
// 該当ファイルは存在せず、記事下書き生成はcategory_icon_missingで停止し続けていた——
// createDraftFromArticleFacts.ts参照）。マロンが完成版8アイコン（01_sweets.png〜
// 08_seasonal_events.png）を用意したため、18カテゴリー（CategoryCode）は維持したまま
// （分類ロジック・DBフィールド・記事データは無変更）、アイコンの実体だけをこの8分類へ
// 束ねて割り当てる。8分類への束ね方の根拠は primaryCategory8.ts を正本とする
// （重複させず、そこから書き写す）。
import { iconFileForCategory18, mapToPrimaryCategory8, PRIMARY_CATEGORY_8_LABELS } from '../pipeline/primaryCategory8'

const ICON_SLUG_BY_PRIMARY_8: Record<string, string> = {
  SWEETS: 'icon_sweets',
  GOURMET: 'icon_gourmet',
  SHOPPING: 'icon_shopping',
  ART_CULTURE: 'icon_art_culture',
  MUSIC_STAGE: 'icon_music_stage',
  BEAUTY_WELLNESS: 'icon_beauty_wellness',
  LEARNING_EXPERIENCE: 'icon_learning_experience',
  SEASONAL: 'icon_seasonal',
}

function iconFor(category: CategoryCode, labelJa: string): CategoryIcon {
  const primary8 = mapToPrimaryCategory8(category)
  const iconFile = iconFileForCategory18(category)
  if (!primary8 || !iconFile) {
    // primaryCategory8.ts 側に対応が無い場合（新カテゴリー追加時の取りこぼし等）は
    // 推測でアイコンを割り当てない——呼び出し側（resolveCategoryIcon）が
    // ファイル不在を検出しneeds_humanで停止する設計に委ねる。
    throw new Error(`カテゴリー「${category}」の8分類マッピングが primaryCategory8.ts に無い（要追記）`)
  }
  return { category, labelJa, iconSlug: ICON_SLUG_BY_PRIMARY_8[primary8], iconFile }
}

/** 18 カテゴリー＋RAINY_DAY → アイコン。実体は8分類アイコン（primaryCategory8.ts）に束ねる。 */
export const CATEGORY_ICONS: Record<CategoryCode, CategoryIcon> = {
  FOOD: iconFor('FOOD', 'グルメ'),
  CAFE: iconFor('CAFE', 'カフェ'),
  SWEETS: iconFor('SWEETS', 'スウィーツ'),
  SHOPPING: iconFor('SHOPPING', 'ショッピング'),
  ARCHITECTURE: iconFor('ARCHITECTURE', '名所・建築'),
  ART: iconFor('ART', 'アート・文化'),
  EVENT: iconFor('EVENT', 'イベント'),
  NIGHT: iconFor('NIGHT', 'バー・お酒'),
  MUSIC: iconFor('MUSIC', '音楽・ライブ'),
  BEAUTY: iconFor('BEAUTY', 'ビューティー'),
  HOTEL: iconFor('HOTEL', 'ホテル'),
  WELLNESS: iconFor('WELLNESS', '癒し・リラクゼーション'),
  EXPERIENCE: iconFor('EXPERIENCE', 'トラベル・体験'),
  GIFT: iconFor('GIFT', '手土産・ギフト'),
  WORKSHOP: iconFor('WORKSHOP', '学び・ワークショップ'),
  PHOTO: iconFor('PHOTO', 'フォトスポット'),
  FAMILY: iconFor('FAMILY', 'ファミリー'),
  NIGHT_VIEW: iconFor('NIGHT_VIEW', '夜景・ナイトスポット'),
  RAINY_DAY: iconFor('RAINY_DAY', '雨の日おすすめ'),
}

// 参照のみ（未使用インポート回避・将来の直接参照用）。
export { PRIMARY_CATEGORY_8_LABELS }

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
 * 本文ユニット配列を、マストヘッド固定文を冒頭に付けた note 転記用プレーンテキストへ
 * 合成する。既にマストヘッドを含む場合は二重付与しない。
 * ハッシュタグは本文に入れない（2026-09-10。hashtags.note にのみ保持し、転記時に
 * note のタグ欄へ設定する運用）。
 */
export function composeNoteBodyWithMasthead(bodyUnits: string[]): string {
  const joined = bodyUnits.filter((u) => u && u.trim()).join('\n\n')
  const parts = bodyHasMasthead(joined) ? [joined] : [NOTE_MASTHEAD_TEXT, joined]
  return parts.filter(Boolean).join('\n\n') + '\n'
}
