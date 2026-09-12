// GINZA WHISKERS / Project 02（2026-09-04、銀座外記事の混入防止）
//
// 「情報源が銀座」でも、個別記事の対象店舗・開催地・住所が銀座外なら候補から外す。
// 例：山野楽器 銀座本店のサイトに載る「たまプラーザ テラス店 リニューアルフェア」／
//     銀座夏野のサイトに載る「〈銀座夏野 スカイツリー店〉POPUP」。
//
// 判断は **明記された語のみ**（推測しない）：
//   ・記事のタイトル・会場・areaLead・eventName・公式URL に「銀座 as 場所」の明記があれば銀座。
//   ・記事に「銀座外の特定支店（◯◯テラス店 等）」「銀座外の市区」の明記があり、
//     かつ同記事内に銀座の場所明記が無ければ 銀座外（＝候補から外す）。
//   ・非銀座支店の明記は、ブランド名に含まれる「銀座」（銀座夏野・銀座本店 等）より優先する。
//   ・どちらの明記も無く、情報源名だけが「銀座」の場合は「根拠不足」→ 銀座外扱い（候補から外す）。
//     （ただし後方互換のため、情報源が銀座単独施設と分かるものは許容。呼び出し元が sourceIsSingleGinzaVenue を渡す）

export interface GinzaRelevanceInput {
  title?: string | null
  venue?: string | null
  areaLead?: string | null
  eventName?: string | null
  /** DiscoveredContent.excerpt（サイトナビ文言が多いため補助的にのみ使用） */
  excerpt?: string | null
  sourceName?: string | null
  articleUrl?: string | null
  /** 情報源が「銀座の単独施設」と確定しているか（GINZA SIX / 銀座 蔦屋書店 / 銀座もとじ 等）。
   *  true のときは「場所明記なし」でも銀座扱いにする（従来動作の維持）。
   *  山野楽器 銀座本店 のような多店舗チェーン本店は false を渡すこと。 */
  sourceIsSingleGinzaVenue?: boolean
}

export interface GinzaRelevanceResult {
  ginzaRelevant: boolean
  /** 根拠（監査・再検証用） */
  basis: string
  /** 銀座外と判断した根拠語（あれば） */
  offGinzaMatch: string | null
}

const GINZA_PLACE_RE =
  /銀座(?:一丁目|[1-8１-８一二三四五六七八]丁目|本店|店|エリア|地区|中央通り|通り|三越|松屋|プレイス|シックス|コリドー|ファイブ|ナイン)?|GINZA\s?SIX|ギンザ\s?シックス|銀座シックス|GSIX|松屋銀座|銀座三越|有楽町(?:マリオン|イトシア)?|数寄屋橋|新橋演舞場|歌舞伎座/i

// 「銀座外の特定支店」— 支店名（◯◯店／◯◯テラス店 等）。ブランド名の「銀座」より優先。
const OFF_GINZA_BRANCH_RE = new RegExp(
  '(?:たまプラーザ|スカイツリー|ソラマチ|東京ソラマチ|横浜|川崎|武蔵小杉|たまプラ|港北|センター北|新宿|渋谷|池袋|吉祥寺|三鷹|立川|国分寺|八王子|町田|上野|浅草|北千住|錦糸町|亀戸|品川|大井町|大森|蒲田|自由が丘|二子玉川|田園調布|中野|荻窪|赤羽|王子|大宮|浦和|川口|所沢|千葉|船橋|柏|津田沼|松戸|市川|川越|名古屋|栄|金山|大阪|梅田|なんば|難波|心斎橋|天王寺|京都|四条|神戸|三宮|福岡|天神|博多|札幌|仙台|広島|那覇|金沢|静岡|浜松|宇都宮|高崎|水戸|長野|新潟)' +
    '\\s*(?:テラス|タウン|ヒルズ|スカイ|パーク|ステーション|セントラル|マーク|ポルタ|パルコ|PARCO|ルミネ|LUMINE|アトレ|マルイ|OIOI|タカシマヤ|髙島屋|そごう|東急|西武|大丸|三越|京王|小田急|近鉄|阪急|阪神)?\\s*店(?![舗長])',
)

// 「銀座外の市区・住所」— 店名を伴わない開催地の明記。
const OFF_GINZA_ADDR_RE =
  /(?:横浜|川崎|相模原|さいたま|千葉|名古屋|大阪|京都|神戸|福岡|札幌|仙台|広島|北九州|さいたま|堺)市|(?:品川|目黒|大田|世田谷|渋谷|中野|杉並|豊島|北|荒川|板橋|練馬|足立|葛飾|江戸川|新宿|文京|台東|墨田|江東|港区(?!.{0,6}(?:銀座|新橋)))区|しながわ(?:区|駅)|天王洲(?:アイル)?|お台場|豊洲|有明|幕張|舞浜/

function joinFields(...vals: (string | null | undefined)[]): string {
  return vals.map((v) => (typeof v === 'string' ? v : '')).join(' ｜ ')
}

// 2026-09-13：「銀座コージーコーナー」のように、社名・ブランド名そのものに「銀座」が
// 含まれる情報源の場合、タイトルへ社名がそのまま埋め込まれる（サイトが毎ページ
// 「<商品名> | 銀座コージーコーナー」のように自社名を繰り返すテンプレートを使うため）
// だけで「銀座の場所明記」と誤判定してしまうバグが実データで見つかった（全国約400店舗
// チェーンの通常商品ページが銀座限定として候補に上がりうる状態だった）。
// 社名・ブランド名の反復は「新しい場所の根拠」ではないため、銀座の場所判定の対象
// テキストからは社名の埋め込みを取り除いたうえで判定する。取り除いた結果、他に
// 銀座の明記が無ければ、既存のルール5（情報源名にのみ「銀座」がある＝根拠不足）が
// そのまま適用され除外される。
export function stripSourceNameEcho(text: string, sourceName: string | null | undefined): string {
  const name = (sourceName ?? '').trim()
  if (!name) return text
  let result = text
  if (name.length >= 2) result = result.split(name).join(' ')
  // 括弧内の補足（例：「銀座コージーコーナー（銀座一丁目本店）」の「（銀座一丁目本店）」）を
  // 除いた「素のブランド名」も別途取り除く——タイトルには括弧なしの素の社名だけが
  // 埋め込まれるケースが多いため。
  const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim()
  if (bare && bare !== name && bare.length >= 2) result = result.split(bare).join(' ')
  return result
}

// タイトルの各セグメントが「意味を持たない」＝プレースホルダ／サイト名／一覧語 か
const NOISE_SEGMENT_RE =
  /^(?:タイトル|title|無題|untitled|no\s*title|詳細|詳細ページ|ニュース(?:\s*詳細|リリース)?|news|お知らせ|新着情報|新着|最新情報|一覧|記事|ページ|page|press\s*release|プレスリリース|topics?|information|blog|—|-|\.\.\.|…|test|sample|dummy)$/i
// サイト名・定型サフィックスに一致するセグメント（「◯◯公式ウェブサイト」「◯◯オンラインショップ」等）
const SITE_SUFFIX_RE =
  /(?:公式(?:ウェブ)?サイト|オンラインショップ|GINZA\s?OFFICIAL[^｜]*|GSIX|ギンザ\s?シックス|銀座シックス|蔦屋書店を中核とした.*|一般社団法人.*|CD・楽器の店舗販売.*|日本最大級.*|GEKKOSO\s?GALLERY.*)$/i

// CMS のプレースホルダ丸出しセグメント（正当な記事タイトルには単独で現れない）
const CMS_PLACEHOLDER_SEG_RE = /^(?:タイトル|title|無題|untitled|no\s*title|dummy(?:\s*title)?|sample(?:\s*title)?|テストタイトル|仮タイトル)$/i

/** タイトルに記事の主題が含まれているか（「タイトル」等のプレースホルダのみ／サイト名のみは false） */
export function hasMeaningfulTitle(title?: string | null, venue?: string | null, sourceName?: string | null): boolean {
  const raw = (title ?? '').trim()
  if (!raw) return false
  const norm = (s: string) => s.replace(/\s|　/g, '').toLowerCase()
  const vn = norm(venue ?? '')
  const sn = norm(sourceName ?? '')
  const segs = raw
    .split(/[|｜/／>›»–—]|\s[-–—]\s/)
    .map((s) => s.trim())
    .filter(Boolean)
  // CMS のプレースホルダ（「◯◯｜タイトル」等）が1つでもあれば、そのページは本文未取得＝主題なし
  if (segs.some((s) => CMS_PLACEHOLDER_SEG_RE.test(s))) return false
  const meaningful = segs.filter((s) => {
    if (NOISE_SEGMENT_RE.test(s)) return false
    if (SITE_SUFFIX_RE.test(s)) return false
    const ns = norm(s)
    if (ns.length < 4) return false
    if (vn && (ns === vn || (vn.length >= 4 && ns.includes(vn) && ns.length - vn.length < 3))) return false
    if (sn && (ns === sn || (sn.length >= 4 && ns.includes(sn) && ns.length - sn.length < 3))) return false
    return true
  })
  return meaningful.length > 0
}

// SOURCE LEDGER のうち「銀座の単独施設」（＝サイトに載る記事は基本その銀座の建物の話）。
// 山野楽器 銀座本店（多店舗チェーンの本店）・銀座夏野（スカイツリー店等がある）・
// 集約サイト（GINZA OFFICIAL / 中央区 / GO TOKYO）はここに **入れない**。
// 2026-09-12 追加（スウィーツ・ビューティー母数拡充に伴う判定）：単独立地と確認できた
// もののみ追加する。多店舗チェーン（HIGASHIYA＝南青山/丸の内にも展開、とらや＝全国、
// 銀座ウエスト＝青山/横浜/赤坂にも展開、空也/空いろ＝エキュート品川でも取扱あり、
// 帝国ホテルは千代田区で銀座の外＝地理的に該当外）は**入れない**（推測しない）。
//   ・銀座千疋屋：銀座地区内に複数店舗を持つが、いずれも銀座地区内（ginza-sembikiya.jp）
//   ・CAFE PAULISTA：1911年創業、銀座本店のみが確認できる主要拠点（paulista.co.jp）
//   ・銀座菊廼舎：銀座の老舗和菓子店、他拠点の明記なし（ginza-kikunoya.co.jp）
//   ・銀座木村家（ginzakimuraya.jp＝銀座の店舗専用ドメイン。木村屋總本店本体の
//     全国展開とは別――kimuraya-sohonten.co.jp はここに含めない）
//   ・SHISEIDO THE STORE：資生堂の銀座フラッグシップ（単独店舗、thestore.shiseido.co.jp）
// 【重要・命名規則】ここに載る文字列は、SOURCE_LEDGERの`name`フィールドに含まれるだけで
// 「銀座の単独施設」と自動判定される（sourceNameとsourceUrlを連結した文字列への部分一致）。
// そのため、全国複数店舗を持つブランド（デパ地下テナント等）の`name`に、別の単独施設
// （銀座三越・松屋銀座 等、ここに載っている語）を説明のためだけに含めると、意図せず
// 単独施設と誤判定される（2026-09-12、GODIVA/DALLOYAU/ピエール・エルメ・パリ/フレデリック・
// カッセル/ルノートル/銀座若菜の`name`に「（松屋銀座）」「（銀座三越）」等を付けていたために
// 発生した実バグを修正した経緯あり）。複数店舗ブランドの`name`には、ここに載る語を
// 含めないこと（出店先の説明は`notes`にのみ書く）。
// 【注意】ここに追加する前に「本当に銀座に1店舗しかないか」を再確認すること。
// facilityKey.ts の SOURCE_AS_FACILITY（施設分散カウント用）にある＝ここに含めてよい、
// ではない——「情報源＝1施設として集計してよい」ことと「記事に銀座の明記が無くても
// 銀座関連とみなしてよい」ことは別の問いであり、後者は個別に実在確認できたものだけを
// 載せる（2026-09-12、ブールミッシュ追加時にこの2つを混同しかけたため明文化）。
const SINGLE_GINZA_VENUE_RE =
  /GINZA\s?SIX|銀座\s?蔦屋書店|銀座三越|松屋銀座|(?:銀座)?和光|SEIKO\s?HOUSE\s?GINZA|Sony\s?Park|ginzasonypark|資生堂ギャラリー|gallery\.shiseido|POLA\s?MUSEUM\s?ANNEX|ポーラ\s?ミュージアム|歌舞伎座|相田みつを美術館|mitsuo\.co\.jp|教文館|kyobunkwan|月光荘|gekkoso|銀座もとじ|motoji\.co\.jp|資生堂パーラー|銀座千疋屋|ginza-sembikiya|CAFE\s?PAULISTA|paulista\.co\.jp|銀座菊廼舎|ginza-kikunoya|ginzakimuraya\.jp|SHISEIDO\s?THE\s?STORE|thestore\.shiseido\.co\.jp|ブールミッシュ|BOUL'?MICH|boulmich\.co\.jp/i

/** 情報源名（＋任意で公式URL）から「銀座の単独施設か」を判定する */
export function isSingleGinzaVenueSource(sourceName?: string | null, sourceUrl?: string | null): boolean {
  const hay = `${sourceName ?? ''} ${sourceUrl ?? ''}`
  return SINGLE_GINZA_VENUE_RE.test(hay)
}

export function assessGinzaRelevance(input: GinzaRelevanceInput): GinzaRelevanceResult {
  // タイトル・会場・areaLead・eventName のみ（excerpt はサイトナビ文言が多く誤判定源。
  // URL のホスト〔ginza.jp 等〕は集約サイトを含み「銀座 as 場所」の根拠にならないため使わない）
  const core = joinFields(input.title, input.venue, input.areaLead, input.eventName)
  const src = (input.sourceName ?? '').trim()

  const offBranch = core.match(OFF_GINZA_BRANCH_RE)
  const offAddr = core.match(OFF_GINZA_ADDR_RE)
  // 銀座の場所明記チェックだけは、情報源自身の社名・ブランド名の埋め込みを除いたテキストで
  // 判定する（社名・ブランド名・パンくずの反復だけを「場所の根拠」にしない。上のコメント参照）。
  const ginzaInCore = GINZA_PLACE_RE.test(stripSourceNameEcho(core, input.sourceName))

  // 0) タイトルに記事の主題が無い（「タイトル」等のプレースホルダのみ／サイト名のみ）
  //    → 対象地も内容も確認できない＝根拠不足で除外（推測しない）
  if (!hasMeaningfulTitle(input.title, input.venue, input.sourceName)) {
    return {
      ginzaRelevant: false,
      basis: '記事タイトルが取得できていない（プレースホルダ／サイト名のみ）ため対象地・内容を確認できない',
      offGinzaMatch: null,
    }
  }

  // 1) 銀座外の特定支店の明記 → ブランド名の「銀座」より優先して 銀座外
  if (offBranch) {
    return {
      ginzaRelevant: false,
      basis: `記事が銀座外の支店「${offBranch[0].trim()}」を明記（ブランド名の「銀座」より優先）`,
      offGinzaMatch: offBranch[0].trim(),
    }
  }
  // 2) 銀座の場所明記あり → 銀座
  if (ginzaInCore) {
    return { ginzaRelevant: true, basis: 'タイトル/会場/URL に銀座の場所を明記', offGinzaMatch: null }
  }
  // 3) 銀座外の市区・住所の明記のみ → 銀座外
  if (offAddr) {
    return {
      ginzaRelevant: false,
      basis: `記事が銀座外の市区「${offAddr[0].trim()}」を明記し、銀座の記載がない`,
      offGinzaMatch: offAddr[0].trim(),
    }
  }
  // 4) 情報源が銀座の単独施設 → 場所明記が無くても銀座（従来動作の維持）
  if (input.sourceIsSingleGinzaVenue) {
    return { ginzaRelevant: true, basis: '情報源が銀座の単独施設（記事に他所の明記なし）', offGinzaMatch: null }
  }
  // 5) 情報源名だけが「銀座」（多店舗チェーン本店等）で場所明記なし → 根拠不足で除外
  if (GINZA_PLACE_RE.test(src) || /銀座/.test(src)) {
    return {
      ginzaRelevant: false,
      basis: '情報源名にのみ「銀座」があり、記事の対象地の明記がない（推測しない＝根拠不足で除外）',
      offGinzaMatch: null,
    }
  }
  return { ginzaRelevant: false, basis: '記事にもタイトルにも銀座の根拠がない', offGinzaMatch: null }
}
