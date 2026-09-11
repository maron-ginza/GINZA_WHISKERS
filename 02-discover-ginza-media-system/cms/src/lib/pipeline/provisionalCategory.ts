// GINZA WHISKERS / Project 02（2026-09-04、候補選定の偏り制御）
//
// 「暫定カテゴリー」を **明記された情報だけ** から決定的に導く（推測はしない）。
// 承諾前なので ArticleFacts.primaryCategory は未確定なことが多い。選定前に分散を
// 確認できるよう、タイトル・会場に明記された語だけで 18カテゴリーのいずれかへ寄せる。
// どの語も無ければ null（＝未確定。埋めない）。
//
// basis:
//   'primaryCategory' … ArticleFacts が ready でカテゴリー確定済み（最も確か）
//   'title'           … タイトル/会場に明記された語から確定（確か）
//   'templateType'    … 記事種別からの型推定（弱い・確定扱いにしない）
//   null              … 未確定

export type ProvisionalCategoryBasis = 'primaryCategory' | 'title' | 'templateType' | null

export interface ProvisionalCategory {
  category: string | null
  basis: ProvisionalCategoryBasis
}

export interface ProvisionalCategoryInput {
  primaryCategory?: string | null
  title?: string | null
  venue?: string | null
  templateType?: string | null
  contentType?: string | null
  /** 公式ページ本文の抜粋（明記語の探索対象を広げる。推測はしない・書かれている語のみ） */
  excerpt?: string | null
}

// タイトル/会場/本文の「明記語」→ 18カテゴリー（先に一致したものを採用）
//
// 【2026-09-11 追加】SWEETS（スウィーツ）を FOOD から分離。単なる飲食店情報・食事メニューは
// FOOD のまま、菓子・デザート・アフタヌーンティーが主題のものは SWEETS を優先する
// （マロン指示）。判定順は SWEETS を BEAUTY・WELLNESS・CAFE・FOOD より前に置く（先に
// 一致したものを採用するため）——「ウェルネス系アフタヌーンティー」のように複数語が
// 共存するタイトルでも、明記の指示どおりアフタヌーンティー＝SWEETSを優先する。
const TITLE_RULES: { re: RegExp; cat: string }[] = [
  { re: /写真展|フォトグラフ|photo\s?exhibition|ブックサイニング|サイン本|写真集/i, cat: 'PHOTO' },
  { re: /個展|作品展|作品展示|原画展|絵画展|版画展|陶芸展|工芸展|美術展|回顧展|遺作展|書展|イラスト展|立体展|[一-龥ぁ-んァ-ヶー]{2,10}展(?![示会])|【\s*フェア\s*】|【\s*展示\s*】|【\s*展覧会\s*】|刊行記念(?:展|フェア)?|アート|美術|ギャラリー|画廊|絵画|彫刻|現代美術|インスタレーション|アーティスト|工芸|手仕事|漆|陶(?:芸|器)|木工|硝子細工|提灯|きもの|着物/, cat: 'ART' },
  {
    re: /スイーツ|パフェ|ケーキ|クッキー|チョコ|パウンドケーキ|和菓子|洋菓子|お菓子|焼き菓子|アフタヌーンティー|ハイティー|ジェラート|アイスクリーム|プリン|タルト|マカロン|フィナンシェ|マドレーヌ|どら焼き|大福|団子|あんみつ|ロールケーキ|シュークリーム|栗スイーツ|モンブラン|羊羹|最中|あんぱん/,
    cat: 'SWEETS',
  },
  { re: /コスメ|化粧品|チーク|リップ|ファンデ|フレグランス|香水|コフレ|スキンケア|ビューティ|美容|ネイル|メイク|口紅/, cat: 'BEAUTY' },
  { re: /ウェルネス|スパ|温浴|サウナ|整体|リラクゼーション|ヨガ|瞑想|マインドフルネス|養生|薬膳|漢方/, cat: 'WELLNESS' },
  { re: /カフェ|喫茶|珈琲|コーヒー|ティールーム|ティーサロン|ラテ|紅茶/, cat: 'CAFE' },
  { re: /グルメ|レストラン|ビストロ|食品|フード|ベーカリー|弁当|惣菜|パン|ジャム|蜂蜜|はちみつ/, cat: 'FOOD' },
  { re: /フェスティバル|コンサート|ライブ|演奏会|リサイタル|シャンソン|ジャズ|クラシック|音楽|ミュージック/, cat: 'MUSIC' },
  { re: /ワークショップ|体験教室|づくり体験|制作体験|手づくり|レッスン|ハンズオン|実演/, cat: 'WORKSHOP' },
  { re: /建築|建物|意匠|リノベーション/, cat: 'ARCHITECTURE' },
  { re: /親子|こども向け|キッズ|ファミリー|絵本/, cat: 'FAMILY' },
  { re: /ギフト|贈り物|プレゼント|お中元|お歳暮|お年賀/, cat: 'GIFT' },
  { re: /ホテル|宿泊|ステイケーション/, cat: 'HOTEL' },
  { re: /ナイトミュージアム|夜間開館|バー営業|ナイトツアー/, cat: 'NIGHT' },
  { re: /POP[\s-]?UP|ポップアップ|新作|コレクション|デニム|DENIM|ジーンズ|JEANS|ニット|KNIT|ジャケット|スウェット|バッグ|シューズ|アパレル|ファッション|スタイリング|物販|セットアップ/i, cat: 'SHOPPING' },
]

const TEMPLATE_FALLBACK: Record<string, string> = {
  exhibition: 'ART',
  recurring_event: 'EVENT',
  application: 'EVENT',
  workshop: 'WORKSHOP',
  sale: 'SHOPPING',
}

// 【2026-09-11】SWEETS 追加により実質19値だが、定数名・「18カテゴリー」という呼称は
// VISUAL_ASSET_LIBRARY §3.3 等の既存資料を踏まえ歴史的名称として維持する（SOURCE LEDGER が
// 14→27件に増えても「v1」の呼称を維持しているのと同じ扱い）。
const VALID_18 = new Set([
  'FOOD', 'CAFE', 'SWEETS', 'SHOPPING', 'ARCHITECTURE', 'ART', 'EVENT', 'NIGHT', 'MUSIC', 'BEAUTY',
  'HOTEL', 'WELLNESS', 'EXPERIENCE', 'GIFT', 'WORKSHOP', 'PHOTO', 'FAMILY', 'NIGHT_VIEW', 'RAINY_DAY',
])

export function deriveProvisionalCategory(input: ProvisionalCategoryInput): ProvisionalCategory {
  const pc = (input.primaryCategory ?? '').trim().toUpperCase()
  if (pc && VALID_18.has(pc)) return { category: pc, basis: 'primaryCategory' }

  // タイトルと会場のみを見る（公式ページ抜粋はサイトナビ文言〔「アート」「ホテル」等〕を
  // 多く含み誤判定の原因になるため category 判定には使わない。excerpt は日付抽出専用）。
  const text = `${input.title ?? ''} ${input.venue ?? ''}`
  for (const r of TITLE_RULES) {
    if (r.re.test(text)) return { category: r.cat, basis: 'title' }
  }

  const tt = (input.templateType ?? '').trim().toLowerCase()
  if (TEMPLATE_FALLBACK[tt]) return { category: TEMPLATE_FALLBACK[tt], basis: 'templateType' }

  const ct = (input.contentType ?? '').trim().toLowerCase()
  if (ct === 'exhibition') return { category: 'ART', basis: 'templateType' }

  return { category: null, basis: null }
}

/** finalized 判定用：明記から確定できたか（templateType 推定は「確定」に数えない） */
export function isCategoryResolved(b: ProvisionalCategoryBasis): boolean {
  return b === 'primaryCategory' || b === 'title'
}
