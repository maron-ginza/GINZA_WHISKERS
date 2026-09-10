// GINZA WHISKERS / Project 02（2026-10 初期トライアル運用）— 候補選定サポート（純粋・AI/DB なし）。
//
// 2026-10 初期トライアル：通常記事 1日3本（ビューティー／グルメ・スイーツ／文化・アート 各1）＋
// 100円記事 1日2〜3本、合計 5〜6本から段階的に 10本へ拡大。
//
// `./p2 themes recommend` の候補選定画面に次を表示するための決定的関数群：
//   ・本日の3カテゴリー充足状況
//   ・過去7日間の 18カテゴリー別件数 / 施設別採用件数（データは assessInboxPool が供給）
//   ・同一施設の連続採用警告
//   ・コアターゲット適合理由（targetFitScore.ts の reason を利用）
//   ・季節性（AUTUMN GINZA のような季節横断型を重視）
//   ・100円記事への展開可能性（AI活用・具体的手順・時間別プラン・予算別調整の How-to 価値）

// ─────────────── 1. 通常記事3本の基本構成（コア3カテゴリー） ───────────────

export interface CoreDailyBucket {
  key: string
  label: string
  /** deriveProvisionalCategory の 18カテゴリーキー（＋派生の別名）をこのバケットへ寄せる */
  cats: string[]
}

/** 通常記事3本の基本構成（2026-10 初期トライアル。マロン指示）。 */
export const CORE_DAILY_BUCKETS: CoreDailyBucket[] = [
  { key: 'BEAUTY', label: 'ビューティー', cats: ['BEAUTY', 'WELLNESS'] },
  { key: 'FOOD_SWEETS', label: 'グルメ・スイーツ', cats: ['FOOD', 'CAFE', 'SWEETS', 'GIFT'] },
  { key: 'CULTURE_ART', label: '文化・アート', cats: ['ART', 'CULTURE', 'EVENT', 'MUSIC', 'PHOTO', 'ARCHITECTURE', 'WORKSHOP'] },
]

export function bucketForCategory(categoryKey: string | null | undefined): CoreDailyBucket | null {
  const c = (categoryKey ?? '').trim().toUpperCase()
  if (!c || c === '未確定') return null
  for (const b of CORE_DAILY_BUCKETS) if (b.cats.includes(c)) return b
  return null
}

export interface CoreDailyItem {
  dcId: number
  title: string
  categoryKey: string | null
}
export interface CoreDailyFulfillment {
  key: string
  label: string
  need: number
  have: number
  filled: boolean
  matched: CoreDailyItem[]
}

/**
 * 推奨候補の集合から、通常記事3本の3カテゴリー（各1本）がどれだけ埋まっているかを返す。
 * どのバケットにも寄らない候補（雑貨・ショッピング・ホテル等）は uncategorized に集める。
 */
export function assessCoreDailyFulfillment(items: CoreDailyItem[]): {
  buckets: CoreDailyFulfillment[]
  uncategorized: CoreDailyItem[]
  allFilled: boolean
} {
  const buckets: CoreDailyFulfillment[] = CORE_DAILY_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    need: 1,
    have: 0,
    filled: false,
    matched: [],
  }))
  const uncategorized: CoreDailyItem[] = []
  for (const it of items) {
    const b = bucketForCategory(it.categoryKey)
    if (!b) {
      uncategorized.push(it)
      continue
    }
    const row = buckets.find((x) => x.key === b.key)!
    row.matched.push(it)
    row.have += 1
    row.filled = row.have >= row.need
  }
  return { buckets, uncategorized, allFilled: buckets.every((b) => b.filled) }
}

// ─────────────── 2. 同一施設の連続採用警告 ───────────────

export interface ConsecutiveFacilityWarning {
  code: 'history_streak' | 'adjacent_repeat' | 'recommended_repeat'
  facility: string
  message: string
}

/**
 * 直近の採用履歴（most-recent-first の施設キー列）と、今回の推奨候補の施設から
 * 「同一施設の連続採用」警告を出す。
 *  ・history_streak … 直近採用が同一施設で2件以上連続している
 *  ・adjacent_repeat … 推奨候補の施設が「直前の採用」と同一
 *  ・recommended_repeat … 推奨候補内で同一施設が2件以上
 */
export function detectConsecutiveFacilityWarnings(input: {
  recentFacilitySequence: string[]
  recommended: { dcId: number; facilityKey: string | null; facilityLabel: string }[]
}): ConsecutiveFacilityWarning[] {
  const out: ConsecutiveFacilityWarning[] = []
  const seq = (input.recentFacilitySequence ?? []).filter((x) => x && x !== '(会場不明)')
  const UNKNOWN = new Set(['', '(会場不明)', null as unknown as string])

  // history_streak
  if (seq.length >= 2 && seq[0] === seq[1]) {
    let n = 1
    while (n < seq.length && seq[n] === seq[0]) n += 1
    out.push({
      code: 'history_streak',
      facility: seq[0],
      message: `直近の採用が「${seq[0]}」で ${n} 件連続。同一施設の連続採用を避ける。`,
    })
  }

  const mostRecent = seq[0] ?? null
  const recFacilities = new Map<string, { dcId: number; label: string }[]>()
  for (const r of input.recommended) {
    const key = r.facilityKey ?? '(会場不明)'
    if (UNKNOWN.has(key)) continue
    if (!recFacilities.has(key)) recFacilities.set(key, [])
    recFacilities.get(key)!.push({ dcId: r.dcId, label: r.facilityLabel })
    if (mostRecent && key === mostRecent) {
      out.push({
        code: 'adjacent_repeat',
        facility: key,
        message: `推奨 DC #${r.dcId}「${r.facilityLabel}」は直前の採用と同一施設。連続採用になるため差し替えを検討。`,
      })
    }
  }
  for (const [key, list] of recFacilities) {
    if (list.length >= 2) {
      out.push({
        code: 'recommended_repeat',
        facility: key,
        message: `推奨内で同一施設「${list[0].label}」が ${list.length} 件（DC ${list.map((x) => `#${x.dcId}`).join(', ')}）。1施設に偏らせない。`,
      })
    }
  }
  return out
}

// ─────────────── 3. 季節性（季節横断型を重視） ───────────────

const SEASON_LEX: Record<'spring' | 'summer' | 'autumn' | 'winter', string[]> = {
  spring: ['春', '桜', 'さくら', 'サクラ', '花見', '新生活', 'イースター', 'spring', '菜の花', '苺', 'いちご'],
  summer: ['夏', '涼', '納涼', '花火', '七夕', '海', 'かき氷', '祭り', 'summer', 'ひまわり', '浴衣'],
  autumn: ['秋', '紅葉', 'こうよう', '実り', 'ハロウィン', 'halloween', 'autumn', '栗', 'マロン', 'さつまいも', '芋', 'ぶどう', '月見', '読書の秋', '芸術の秋', '食欲の秋'],
  winter: ['冬', 'クリスマス', 'christmas', 'イルミネーション', '雪', '年末', '正月', '初詣', '新春', 'winter', 'バレンタイン', 'ホリデー', 'holiday'],
}

/** AUTUMN GINZA 2026 のような「街全体・季節横断型」の告知パターン */
const CITY_WIDE_SEASON_RE =
  /(SPRING|SUMMER|AUTUMN|WINTER|HOLIDAY)\s*GINZA|GINZA\s*(SPRING|SUMMER|AUTUMN|WINTER)|(春|夏|秋|冬)の銀座|銀座の(春|夏|秋|冬)|(オータム|サマー|スプリング|ウィンター|ホリデー)\s*(ギンザ|銀座)|クリスマス\s*(イン|in)?\s*銀座|銀座\s*(20\d\d)\s*(秋|冬|春|夏|オータム|ホリデー)/i

export interface SeasonalSignal {
  season: 'spring' | 'summer' | 'autumn' | 'winter' | null
  /** タイトルの現在季節との一致（今が秋なら autumn 語がある＝旬） */
  inSeason: boolean
  keywords: string[]
  /** AUTUMN GINZA のような季節横断・街全体型 */
  cityWide: boolean
  note: string
}

export function currentSeason(now: Date): 'spring' | 'summer' | 'autumn' | 'winter' {
  const m = now.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

export function seasonalSignal(title: string, now: Date): SeasonalSignal {
  const t = (title ?? '').toLowerCase()
  const cur = currentSeason(now)
  let season: SeasonalSignal['season'] = null
  const keywords: string[] = []
  for (const s of ['autumn', 'winter', 'spring', 'summer'] as const) {
    const hit = SEASON_LEX[s].filter((k) => t.includes(k.toLowerCase()))
    if (hit.length) {
      keywords.push(...hit)
      if (!season || s === cur) season = s
    }
  }
  const cityWide = CITY_WIDE_SEASON_RE.test(title ?? '')
  const inSeason = season === cur || cityWide
  const note = cityWide
    ? `季節横断型（街全体の季節企画。AUTUMN GINZA 型）— 期間中いつでも「今行く理由」になり重視`
    : season
      ? inSeason
        ? `${labelSeason(season)}の語あり＝現在（${labelSeason(cur)}）と一致し旬`
        : `${labelSeason(season)}の語あり（現在は${labelSeason(cur)}）— 旬のズレを確認`
      : '季節語なし — 「今行く理由」は会期・新規性など別軸で確認'
  return { season, inSeason, keywords: [...new Set(keywords)], cityWide, note }
}

function labelSeason(s: 'spring' | 'summer' | 'autumn' | 'winter'): string {
  return { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[s]
}

// ─────────────── 4. 100円記事への展開可能性 ───────────────

const HOWTO_TITLE_RE =
  /(体験|ワークショップ|つくる|作る|巡る|めぐる|巡り|回り方|歩き方|過ごし方|プラン|コース|ルート|散策|入門|楽しみ方|使い方|選び方|見どころ|特集|フェア|マルシェ|展覧会|個展|[^\s。、]展(?![示会]))/
const REUSABLE_EXPERIENCE_UX = new Set([
  'participate_workshop',
  'participate_see',
  'hands_on',
  'taste_dine',
  'view_exhibit',
])

export interface PaidLanePotential {
  level: 'high' | 'medium' | 'low'
  reasons: string[]
  /** 100円記事にするなら必須の How-to 価値（PAID_100_LANE_SPEC / マロン指示） */
  requiredValue: string[]
}

/**
 * 通常記事の候補が「100円記事（再利用できる How-to）」へ展開できるか。
 * 単なる長文化ではなく、AI活用・具体的手順・時間別プラン・予算別調整が成立するかで判定。
 */
export function paidLanePotential(input: {
  title: string
  venue?: string | null
  categoryKey?: string | null
  uxType?: string | null
  contentType?: string | null
  eventPeriod?: string | null
  templateType?: string | null
}): PaidLanePotential {
  const reasons: string[] = []
  const hasVenue = !!(input.venue && input.venue.trim() && !/不明|確認できません/.test(input.venue))
  const hasPeriod = !!(input.eventPeriod && !/確認できません|未確認/.test(input.eventPeriod))
  const uxOk = REUSABLE_EXPERIENCE_UX.has((input.uxType ?? '').toLowerCase())
  const titleOk = HOWTO_TITLE_RE.test(input.title ?? '')
  const isSaleOnly = (input.templateType ?? '') === 'sale' || (input.contentType ?? '') === 'news'
  const cat = (input.categoryKey ?? '').toUpperCase()
  const experienceCat = ['ART', 'CULTURE', 'EVENT', 'WORKSHOP', 'EXPERIENCE', 'CAFE', 'FOOD'].includes(cat)

  if (hasVenue) reasons.push('会場が特定でき、時間別プラン・立ち寄り順の起点にできる')
  if (hasPeriod) reasons.push('会期があり「今行く理由」と再訪設計を書ける')
  if (uxOk) reasons.push(`体験・参加型（uxType=${input.uxType}）で再現手順を書ける`)
  if (titleOk) reasons.push('テーマが体験・巡り方・過ごし方に展開しやすい')
  if (isSaleOnly && !uxOk && !titleOk) reasons.push('販売・ニュース中心で手順化しにくい（長文化に留まる恐れ）')

  let level: PaidLanePotential['level']
  const strong = [hasVenue, hasPeriod, uxOk || titleOk].filter(Boolean).length
  if (isSaleOnly && !uxOk && !titleOk) level = 'low'
  else if (strong >= 3 && (uxOk || titleOk) && experienceCat) level = 'high'
  else if (strong >= 2) level = 'medium'
  else level = 'low'

  return {
    level,
    reasons: reasons.length ? reasons : ['体験・手順・時間別プランに落とせる要素が薄い'],
    requiredValue: [
      'AI活用（そのまま渡せる指示文）',
      '具体的手順（読者が再現できる）',
      '時間別プラン（例：45／90／150分）',
      '予算別調整',
    ],
  }
}
