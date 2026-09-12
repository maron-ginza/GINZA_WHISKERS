// GINZA WHISKERS / Project 02（2026-09-04、候補選定の自動化）
//
// 会場テキスト（DiscoveredContent.venue / ArticleFacts.venues[].place）を、
// 「施設キー（facilityKey）」と「エリアキー（areaKey）」へ決定的に正規化する。
//
// 【設計方針】facilityDiversity.ts と同じく **特定施設名で分岐して除外・減点しない**。
// ここは単なる正規化——同一施設・同一エリアを識別するためのキーを作るだけ。
// 「蔦屋書店など特定施設への偏り」は selectRecommendedThemes / selectionBalance が
// このキーの出現数を数えて検出・表示する（このファイルは判定しない）。

export interface FacilityKeyResult {
  /** 施設キー（同一店舗・同一ギャラリー等の識別。判定不能なら null） */
  key: string | null
  /** 施設の表示名（正規化前の店舗名相当） */
  store: string
  /** エリア／建物キー（GINZA SIX 等の共有ビル。無ければ store と同じ） */
  areaKey: string
  /** エリアの表示名 */
  area: string
}

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[（）()［］\[\]【】「」『』・,、。／/\\|｜]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// 共有ビル／エリア（複数テナントが入る）。テナント名より優先してエリアキーにする。
const AREA_PATTERNS: { re: RegExp; key: string; label: string }[] = [
  { re: /GINZA\s?SIX|ギンザ\s?シックス|銀座シックス|GSIX/i, key: 'ginza-six', label: 'GINZA SIX' },
  { re: /東急プラザ銀座|東急プラザ\s?銀座|TOKYU PLAZA GINZA/i, key: 'tokyu-plaza-ginza', label: '東急プラザ銀座' },
  { re: /銀座マロニエゲート|マロニエゲート銀座/i, key: 'marronnier-gate-ginza', label: 'マロニエゲート銀座' },
  { re: /有楽町マルイ|マルイ有楽町/i, key: 'marui-yurakucho', label: '有楽町マルイ' },
  { re: /日比谷[ 　]?ミッドタウン|東京ミッドタウン日比谷/i, key: 'midtown-hibiya', label: '東京ミッドタウン日比谷' },
]

// 単独施設（1店舗＝1建物相当）。store の正規化に使う。
const STORE_PATTERNS: { re: RegExp; key: string; label: string }[] = [
  { re: /蔦屋書店|TSUTAYA/i, key: 'ginza-tsutaya', label: '銀座 蔦屋書店' },
  { re: /松屋銀座|松屋\s?銀座/i, key: 'matsuya-ginza', label: '松屋銀座' },
  { re: /銀座三越|三越銀座/i, key: 'mitsukoshi-ginza', label: '銀座三越' },
  { re: /銀座和光|和光本館|セイコーハウス|SEIKO HOUSE|(?<![A-Za-z])WAKO(?![A-Za-z])/i, key: 'wako-ginza', label: '和光／セイコーハウス銀座' },
  { re: /GINZA PLACE|銀座プレイス/i, key: 'ginza-place', label: 'GINZA PLACE' },
  { re: /資生堂パーラー/i, key: 'shiseido-parlour-ginza', label: '資生堂パーラー' },
  { re: /資生堂ギャラリー|SHISEIDO/i, key: 'shiseido-ginza', label: '資生堂（銀座）' },
  { re: /ポーラ\s?ミュージアム|POLA MUSEUM ANNEX|ポーラミュージアムアネックス/i, key: 'pola-annex-ginza', label: 'POLA MUSEUM ANNEX' },
  { re: /エルメス|Le Forum|フォーラム/i, key: 'hermes-ginza', label: '銀座メゾンエルメス' },
  { re: /シャネル\s?ネクサス|CHANEL NEXUS/i, key: 'chanel-nexus-ginza', label: 'シャネル・ネクサス・ホール' },
  { re: /ライカ\s?ギャラリー|Leica Gallery/i, key: 'leica-ginza', label: 'ライカギャラリー銀座' },
  { re: /クリエイションギャラリー|ガーディアン・ガーデン/i, key: 'recruit-gallery-ginza', label: 'リクルートギャラリー（銀座）' },
  { re: /ggg|ギンザ・グラフィック/i, key: 'ggg-ginza', label: 'ギンザ・グラフィック・ギャラリー' },
]

// SOURCE LEDGER の情報源名／URL ホスト → 「その情報源＝1施設」とみなせるもの。
// 集約サイト（GINZA OFFICIAL / 中央区観光関連 / GO TOKYO）はここに入れない（施設ではない）。
const SOURCE_AS_FACILITY: { re: RegExp; key: string; label: string }[] = [
  { re: /GINZA\s?SIX|ginza6\.tokyo|ギンザ\s?シックス|銀座シックス|GSIX/i, key: 'ginza-six', label: 'GINZA SIX' },
  { re: /蔦屋書店|store\.tsite\.jp|TSUTAYA/i, key: 'ginza-tsutaya', label: '銀座 蔦屋書店' },
  { re: /資生堂パーラー|parlour\.shiseido\.co\.jp/i, key: 'shiseido-parlour-ginza', label: '資生堂パーラー' },
  { re: /資生堂ギャラリー|gallery\.shiseido\.com/i, key: 'shiseido-ginza', label: '資生堂ギャラリー' },
  { re: /POLA\s?MUSEUM\s?ANNEX|po-holdings\.co\.jp|ポーラ\s?ミュージアム/i, key: 'pola-annex-ginza', label: 'POLA MUSEUM ANNEX' },
  { re: /歌舞伎座|kabuki-za\.co\.jp/i, key: 'kabukiza', label: '歌舞伎座' },
  { re: /(?:銀座)?和光|wako\.co\.jp/i, key: 'wako-ginza', label: '和光' },
  { re: /SEIKO\s?HOUSE|seiko\.co\.jp/i, key: 'seiko-house-ginza', label: 'SEIKO HOUSE GINZA' },
  { re: /Sony\s?Park|ginzasonypark\.com/i, key: 'ginza-sony-park', label: 'Sony Park' },
  { re: /松屋銀座|matsuyaginza\.com/i, key: 'matsuya-ginza', label: '松屋銀座' },
  { re: /銀座三越|mistore\.jp/i, key: 'mitsukoshi-ginza', label: '銀座三越' },
  { re: /相田みつを美術館|mitsuo\.co\.jp/i, key: 'aida-mitsuo-museum', label: '相田みつを美術館' },
  { re: /教文館|kyobunkwan\.co\.jp/i, key: 'kyobunkwan-ginza', label: '教文館' },
  { re: /月光荘|gekkoso\.jp/i, key: 'gekkoso-ginza', label: '月光荘画材店' },
  { re: /銀座もとじ|motoji\.co\.jp/i, key: 'ginza-motoji', label: '銀座もとじ' },
  { re: /山野楽器|yamano-music/i, key: 'yamano-music-ginza', label: '山野楽器 銀座本店' },
  { re: /銀座夏野|e-ohashi\.com/i, key: 'ginza-natsuno', label: '銀座夏野' },
  // 2026-09-11 追加（スウィーツ候補の安定収集）：単独路面店・老舗菓子店は情報源＝施設と
  // みなせる（複数店舗を持つブランドでも銀座本店が情報源の中心のため）。
  { re: /銀座千疋屋|ginza-sembikiya\.jp/i, key: 'ginza-sembikiya', label: '銀座千疋屋' },
  { re: /HIGASHIYA|higashiya\.com/i, key: 'higashiya-ginza', label: 'HIGASHIYA GINZA' },
  { re: /とらや|TORAYA|toraya-group\.co\.jp/i, key: 'toraya-ginza', label: 'とらや（TORAYA GINZA）' },
  { re: /銀座ウエスト|GINZA\s?WEST|ginza-west\.com/i, key: 'ginza-west', label: '銀座ウエスト' },
  { re: /ガルガンチュワ|imperialhotel\.co\.jp/i, key: 'imperial-hotel-tokyo-gargantua', label: '帝国ホテル東京 ガルガンチュワ' },
  { re: /銀座木村家|木村屋總本店|ginzakimuraya\.jp/i, key: 'ginza-kimuraya-sohonten', label: '銀座木村家（木村屋總本店）' },
  { re: /銀座あけぼの|ginza-akebono\.co\.jp/i, key: 'ginza-akebono', label: '銀座あけぼの' },
  { re: /CAFE\s?PAULISTA|パウリスタ|paulista\.co\.jp/i, key: 'cafe-paulista-ginza', label: 'CAFE PAULISTA' },
  { re: /銀座菊廼舎|ginza-kikunoya\.co\.jp/i, key: 'ginza-kikunoya', label: '銀座菊廼舎' },
  { re: /空也|くうや|sorairo-kuya\.jp/i, key: 'ginza-kuya-sorairo', label: '空也' },
  // 2026-09-12 追加（BEAUTY 母数の補完）：SHISEIDO THE STORE は銀座単独立地の
  // 情報源＝施設として解決してよい。AYURA は全国に複数店舗があり ayura.co.jp は
  // ブランド共通サイトのため、ドメイン全体を「AYURA GINZA」に決め打ちしない
  // （個別ページの venue テキストに明記があれば facilityKeyFromVenue 側で解決される。
  // 全社共通ニュースを銀座店と誤認しない、という方針を優先）。
  { re: /SHISEIDO\s?THE\s?STORE|thestore\.shiseido\.co\.jp/i, key: 'shiseido-the-store-ginza', label: 'SHISEIDO THE STORE' },
  // 2026-09-12 続き2（グルメ・スウィーツ情報源の本格拡張）：ブールミッシュは1973年創業・
  // 2004年開業の「銀座本店」が情報発信の中心（デパ地下出店はあるが本店起点のブランド）
  // のため、情報源＝施設として解決してよい。他の新規デパ地下ブランド（ジャン＝ポール・
  // エヴァン／フレデリック・カッセル／ルノートル／銀座コージーコーナー）は全国複数店舗の
  // ためここに追加せず、ginzaRelevanceの明記チェックに委ねる（GODIVA等と同じ扱い）。
  { re: /ブールミッシュ|BOUL'?MICH|boulmich\.co\.jp/i, key: 'boulmich-ginza', label: 'ブールミッシュ（銀座本店）' },
]

// 集約サイト（施設単位が URL スラッグ or タイトルの【店名】でしか分からない）
const AGGREGATOR_RE = /GINZA\s?OFFICIAL|ginza\.jp|中央区観光|chuo-kanko|GO\s?TOKYO|gotokyo\.org/i

// GINZA OFFICIAL /shopnews/shopnews-<slug>/ の既知スラッグ → 正規キー
const GINZA_OFFICIAL_SLUG: Record<string, { key: string; label: string }> = {
  'matsuya-ginza': { key: 'matsuya-ginza', label: '松屋銀座' },
  'ginza-mitsukoshi': { key: 'mitsukoshi-ginza', label: '銀座三越' },
  'ginza-motoji': { key: 'ginza-motoji', label: '銀座もとじ' },
  hermanmiller: { key: 'hermanmiller-ginza', label: 'ハーマンミラーストア銀座' },
}

function hostOf(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url.trim()).host.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * 会場が空でも、SOURCE LEDGER の情報源名・公式 URL・タイトルの【店名】から
 * 施設キーを **決定的に** 解決する（推測はしない・明記された情報だけ）。
 *   ・情報源＝施設（GINZA SIX / 蔦屋 / 資生堂 等）→ その施設キー
 *   ・集約サイト（GINZA OFFICIAL 等）→ URL スラッグ or タイトル【店名】から個店キー
 *   ・どれからも決まらなければ null（＝会場不明。呼び出し元が「不明」として扱う）
 */
export function resolveFacilityKey(input: {
  venue?: string | null
  sourceName?: string | null
  sourceUrl?: string | null
  title?: string | null
}): FacilityKeyResult {
  const venue = (input.venue ?? '').trim()
  if (venue) {
    const fromVenue = facilityKeyFromVenue(venue)
    if (fromVenue.key) return fromVenue
  }

  const sn = (input.sourceName ?? '').trim()
  const host = hostOf(input.sourceUrl)
  const title = (input.title ?? '').trim()
  const hay = `${sn} ${host}`

  // 1) 情報源＝施設
  const sf = SOURCE_AS_FACILITY.find((p) => p.re.test(hay))
  if (sf) return { key: sf.key, store: sf.label, areaKey: sf.key, area: sf.label }

  // 2) 集約サイト → URL スラッグ or タイトル【店名】
  if (AGGREGATOR_RE.test(hay)) {
    const m = (input.sourceUrl ?? '').match(/\/shopnews\/shopnews-([a-z0-9-]+)\//i)
    if (m) {
      const slug = m[1].toLowerCase()
      const known = GINZA_OFFICIAL_SLUG[slug]
      if (known) return { key: known.key, store: known.label, areaKey: known.key, area: known.label }
      // 未知スラッグでも「個店」として区別する（推測ではなく URL に明記された識別子）
      return { key: `shop:${slug}`, store: slug, areaKey: `shop:${slug}`, area: slug }
    }
    const b = title.match(/^【([^】]{1,20})】/)
    if (b) {
      const name = b[1].trim()
      const byStore = STORE_PATTERNS.find((p) => p.re.test(name))
      if (byStore) return { key: byStore.key, store: byStore.label, areaKey: byStore.key, area: byStore.label }
      return { key: `shop:${slug(name)}`, store: name, areaKey: `shop:${slug(name)}`, area: name }
    }
  }

  // 3) venue から店名だけ拾えた場合（key は付かなかったが店名テキストはある）
  if (venue) {
    const fromVenue = facilityKeyFromVenue(venue)
    if (fromVenue.store) return fromVenue
  }

  return { key: null, store: '', areaKey: '', area: '' }
}

/**
 * 会場テキスト → 施設キー／エリアキー。
 * 例：「銀座 蔦屋書店 文具売り場（GINZA SIX 6F）」→
 *     { key: 'ginza-tsutaya', store: '銀座 蔦屋書店', areaKey: 'ginza-six', area: 'GINZA SIX' }
 */
export function facilityKeyFromVenue(venue: string | null | undefined): FacilityKeyResult {
  const raw = (venue ?? '').trim()
  if (!raw) return { key: null, store: '', areaKey: '', area: '' }

  // 「（GINZA SIX 6F）」「文具売り場」「2階」等を落とした店舗名部分
  const head = raw
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/(?:地下)?\s*\d+\s*(?:階|F|Ｆ)\b/gi, ' ')
    .replace(/(?:B|地下)\s*\d+\s*(?:階|F)?/gi, ' ')
    .replace(/(?:売り場|売場|フロア|会場|特設会場|イベントスペース|エントランス|ロビー)\S*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const store =
    STORE_PATTERNS.find((p) => p.re.test(raw))?.label ??
    head.split(/[ 　]/).filter(Boolean).slice(0, 3).join(' ') ??
    head

  const storeKey = STORE_PATTERNS.find((p) => p.re.test(raw))?.key ?? (store ? slug(store) : null)

  const areaHit = AREA_PATTERNS.find((p) => p.re.test(raw))
  const areaKey = areaHit?.key ?? storeKey ?? (store ? slug(store) : '')
  const area = areaHit?.label ?? store

  return { key: storeKey, store, areaKey, area }
}
