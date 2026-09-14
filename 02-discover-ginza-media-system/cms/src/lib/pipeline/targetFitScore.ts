// GINZA WHISKERS / Project 02 — コアターゲット適合度スコア（2026-09-04）
//
// 「20代後半〜30代女性が『今日知りたい・行ってみたい・保存したい』と思うか」を
// 決定的に採点する純粋関数。AI 呼び出しなし・ネットワークなし・DB 非依存。
//
// Editorial Compass（GINZA_JOHOKYOKU_SPEC）の配分を思想として参考にする:
//   かわいい 20 ／ 上質 30 ／ 自分を整える 25 ／ 新しい発見 15 ／ 少し背伸び 10
// （合計 100。数値の機械的合否には使わず、ランキングの一要素として使う）
//
// 判定は **タイトル＋会場＋暫定カテゴリー＋contentType/uxType** の明記語のみ。
// excerpt は使わない（サイトナビ由来のノイズが多い——既存 provisionalCategory.ts
// / ginzaRelevance.ts / crossCulture と同じ判断）。

export interface TargetFitInput {
  title?: string | null
  venue?: string | null
  /** 暫定カテゴリー（deriveProvisionalCategory 由来。18カテゴリーのいずれか or 未確定） */
  categoryKey?: string | null
  contentType?: string | null
  uxType?: string | null
  templateType?: string | null
}

export interface TargetFitCompass {
  kawaii: number // 0-1
  joshitsu: number // 0-1（上質）
  totonoeru: number // 0-1（自分を整える）
  hakken: number // 0-1（新しい発見）
  senobi: number // 0-1（少し背伸び）
}

export interface TargetFitResult {
  /** 0-100。コアターゲット適合度 */
  score: number
  compass: TargetFitCompass
  /** 反応した語（監査用） */
  matchedSignals: string[]
  reason: string
}

// --- Editorial Compass の各面の重み（合計 100） ---
const FACET_WEIGHT = { kawaii: 20, joshitsu: 30, totonoeru: 25, hakken: 15, senobi: 10 } as const

// --- 各面に反応する語（部分一致・大文字小文字無視） ---
const LEX: Record<keyof TargetFitCompass, string[]> = {
  kawaii: [
    'かわいい', '可愛い', 'キュート', 'パステル', '花', 'フラワー', 'ブーケ', 'リボン', 'ハート',
    'スイーツ', 'パフェ', 'ケーキ', 'マカロン', 'クッキー', '焼き菓子', 'チョコ', 'あんみつ',
    'どら焼き', '最中', 'あんぱん', 'ソフトクリーム', 'かき氷', 'いちご', '苺', 'ベリー', '桃',
    'ぬいぐるみ', 'キャラクター', 'コラボ', 'ピーナッツ', 'スヌーピー', 'くま', 'うさぎ', 'ねこ',
  ],
  joshitsu: [
    '上質', '上品', '洗練', '本物', '正統', '銘品', '逸品', '名品', '名店', '老舗', '名家', '名匠',
    'しつらえ', '設え', '誂え', 'あつらえ', '一点', '職人', '工芸', '手仕事', '手作業', '仕立て',
    '銀器', '漆', '磁器', '陶', '硝子', 'シルク', '絹', 'カシミヤ', 'カシミア', 'レザー', '真鍮',
    '百年', '創業', '伝統', '継承', '由緒', '丁寧', 'クラフツマンシップ', '別誂',
  ],
  totonoeru: [
    'ウェルネス', 'ウエルネス', '整える', '整う', 'セルフケア', 'スキンケア', '美容', 'コスメ',
    'エステ', 'スパ', 'サロン', 'トリートメント', 'アフタヌーンティー', 'ティーサロン', 'ハーブ',
    'ハーバル', 'アロマ', '香り', 'フレグランス', '深呼吸', '静けさ', 'ひとり時間', '自分時間',
    'ご自愛', 'リセット', '癒し', 'いやし', '温活', '腸活', '漢方', '薬膳', 'ヨガ', '瞑想',
    '養生', 'デトックス', 'リラックス', '心地',
  ],
  hakken: [
    '新店', 'オープン', 'open', '新作', '新登場', '新発売', '初', '日本初', '国内初', '世界初',
    '限定', '期間限定', '数量限定', 'リニューアル', '話題', '注目', '新感覚', '初出店', '初上陸',
    'はじめて', '体験', 'ワークショップ', 'つくる', '発見', 'ポップアップ', 'pop', '新装',
  ],
  senobi: [
    '特別', 'スペシャル', 'プレミアム', 'ハイジュエリー', 'オートクチュール', 'フルコース',
    'コース料理', 'シャンパン', 'シャンパーニュ', '贅沢', 'ご褒美', 'ごほうび', '記念日',
    '特別な日', 'アニバーサリー', 'フルオーダー', 'セミオーダー', '一流', '名門', '会員制',
    '完全予約', 'ラグジュアリー', 'キャビア', 'フォアグラ', 'トリュフ',
  ],
}

// --- カテゴリー別の基礎点（キーワードが薄い候補でも、カテゴリーで下支え） ---
// 20代後半〜30代女性の「今日知りたい・行きたい・保存したい」に構造的に近いカテゴリーを +。
const CATEGORY_PRIOR: Record<string, number> = {
  SWEETS: 20,
  CAFE: 18,
  FOOD: 14,
  BEAUTY: 20,
  WELLNESS: 20,
  FASHION: 15,
  SHOPPING: 8,
  LIFESTYLE: 14,
  GIFT: 14,
  WORKSHOP: 8,
  EVENT: 4,
  PHOTO: 4,
  ART: -2,
  CULTURE: -2,
  HISTORY: -4,
  ARCHITECTURE: -2,
  MUSIC: 2,
  TECH: -4,
}

// contentType / uxType → 補助語（既存分類を語彙の土俵に載せる）
const HINT: Record<string, Partial<Record<keyof TargetFitCompass, number>>> = {
  food: { kawaii: 0.4, totonoeru: 0.2 },
  taste_dine: { totonoeru: 0.4, senobi: 0.2 },
  participate_workshop: { hakken: 0.5, totonoeru: 0.2 },
  hands_on: { hakken: 0.4 },
  view_exhibit: { hakken: 0.2 },
}

function level(hits: number): number {
  if (hits >= 3) return 1
  if (hits === 2) return 0.72
  if (hits === 1) return 0.45
  return 0
}

export function computeTargetFitScore(input: TargetFitInput): TargetFitResult {
  const hay = [input.title ?? '', input.venue ?? '', input.categoryKey ?? '']
    .join(' │ ')
    .toLowerCase()
  const matchedSignals: string[] = []
  const compass: TargetFitCompass = { kawaii: 0, joshitsu: 0, totonoeru: 0, hakken: 0, senobi: 0 }

  for (const facet of Object.keys(LEX) as (keyof TargetFitCompass)[]) {
    const hit = LEX[facet].filter((t) => hay.includes(t.toLowerCase()))
    if (hit.length) matchedSignals.push(`${facet}:${hit.slice(0, 4).join('・')}`)
    compass[facet] = level(hit.length)
  }

  // contentType / uxType / templateType の補助
  for (const k of [input.contentType, input.uxType, input.templateType]) {
    const h = k ? HINT[k.toLowerCase()] : undefined
    if (!h) continue
    for (const [facet, add] of Object.entries(h) as [keyof TargetFitCompass, number][]) {
      compass[facet] = Math.min(1, compass[facet] + add)
    }
  }

  const compassScore = (Object.keys(FACET_WEIGHT) as (keyof TargetFitCompass)[]).reduce(
    (s, f) => s + compass[f] * FACET_WEIGHT[f],
    0,
  )
  const catPrior = input.categoryKey ? (CATEGORY_PRIOR[input.categoryKey.toUpperCase()] ?? 0) : 0
  const score = Math.max(0, Math.min(100, Math.round(compassScore + catPrior)))

  const top = (Object.keys(FACET_WEIGHT) as (keyof TargetFitCompass)[])
    .filter((f) => compass[f] > 0)
    .sort((a, b) => compass[b] * FACET_WEIGHT[b] - compass[a] * FACET_WEIGHT[a])
  const reason =
    top.length > 0
      ? `コアターゲット（20代後半〜30代女性）適合＝${top.map((f) => FACET_LABEL[f]).join('・')}` +
        `${catPrior !== 0 ? ` ／ カテゴリー基礎点 ${catPrior > 0 ? '+' : ''}${catPrior}` : ''} → score ${score}`
      : `コンパス上の反応語なし${catPrior !== 0 ? `（カテゴリー基礎点 ${catPrior > 0 ? '+' : ''}${catPrior}）` : ''} → score ${score}`

  return { score, compass, matchedSignals, reason }
}

const FACET_LABEL: Record<keyof TargetFitCompass, string> = {
  kawaii: 'かわいい',
  joshitsu: '上質',
  totonoeru: '自分を整える',
  hakken: '新しい発見',
  senobi: '少し背伸び',
}

/** 情報源名 → ソース種別（source_balance 用）。未知は '一般' */
export function sourceTypeOf(sourceName?: string | null): string {
  const n = (sourceName ?? '').trim()
  if (!n) return '一般'
  const map: [RegExp, string][] = [
    [/三越|松屋|大丸|髙島屋|高島屋|そごう|阪急|阪神|伊勢丹/, '百貨店'],
    [/GINZA SIX|東急プラザ|マロニエゲート|キラリト|EXITMELSA|GINZA PLACE|Ginza Six/i, '商業施設'],
    [/資生堂パーラー|パーラー|レストラン|カフェ|菓子|ベーカリー|フルーツ|不二家|木村家|コージーコーナー/, '飲食・菓子'],
    // アート・文化は「資生堂」を含む美容ルールより前に置く（資生堂ギャラリーの誤分類防止）
    [/蔦屋|ギャラリー|美術館|ミュージアム|画廊|SHISEIDO GALLERY|POLA MUSEUM|資生堂ギャラリー|歌舞伎座|相田みつを|月光荘|教文館/i, 'アート・文化'],
    [/資生堂|コスメ|ビューティ|美容|ロクシタン|SABON|アヴェダ|ウェルネス/i, '美容・ウェルネス'],
    [/ユニクロ|GU|ZARA|H&M|ビームス|ユナイテッド|シップス|トゥモローランド|BALMUDA|無印|ハイブランド|エルメス|シャネル|ディオール|ルイ・?ヴィトン|グッチ|プラダ/i, 'ファッション'],
    [/ホテル|hotel|ハイアット|マリオット|ペニンシュラ|帝国ホテル|三井ガーデン|ミレニアム/i, 'ホテル'],
    [/中央区|観光協会|銀座通連合|GINZA OFFICIAL|GO TOKYO|東京都|区役所/i, '街・行政イベント'],
    [/もとじ|夏野|鳩居堂|伊東屋|竹葉亭|煉瓦亭|老舗|創業|本店/, '老舗・専門店'],
  ]
  for (const [re, label] of map) if (re.test(n)) return label
  return '一般'
}
