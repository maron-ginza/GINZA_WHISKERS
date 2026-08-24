import type { ContentType } from '../crawler/discoveredContentTypes'

// 「参加／体験型」UXタイプ分類（2026-08-18）。
//
// 【目的（マロン指示）】「旬の銀座」の候補を、見る・買う情報だけでなく
// 「参加する・体験する・味わう・作る・聴く」等の行動につながる情報かどうか
// という観点で分類し、Editor's Choiceを支援する補助指標として提供する。
//
// 【重要な設計原則（マロン指示）】
// ・「体験型だから自動的に高得点」にはしない——この分類はEditorial Score
//   （5軸・合計）には一切影響しない。展示鑑賞・買い物・グルメ・ライブ鑑賞も
//   銀座の重要な体験であり、優劣をつける軸ではなく「どんな種類の体験か」を
//   示すだけのラベルとして設計する（Audience Tagsと同じ「除外用フィルタでは
//   なく付加情報」という位置づけ）。
// ・新規AI呼び出しは行わない——タイトル・excerpt・既存のcontentType
//   （classifyContentType.tsが既に付与済み）から決定的に判定するルール
//   ベース分類。contentRichness.ts/facilityDiversity.tsと同じ「AIを介さない
//   決定的な後処理」という設計方針を踏襲する。
// ・特定施設名はハードコードしない——キーワードは一般的な語彙のみ。
// ・将来の英語コンテンツ拡張を考慮し、主要キーワードは日本語・英語の両方を
//   用意した（GO TOKYO・SEIKO HOUSE等、実データに既に英語ページが存在する
//   ため、v1から最小限のカバレッジを持たせる）。
//
// 【判定方式】タイトルを最優先で確認し、マッチしなければexcerptも確認する
// （2段階、優先順位付きキーワードマッチ・先勝ち方式、classifyContentType.tsと
// 同じ設計）。タイトルを優先する理由：excerptにはサイト共通のナビゲーション
// メニュー文言（「ニュース」「アート」「ショップガイド」等）が大量に含まれ、
// これらを迂闊にキーワードにすると全ページが同じ分類に誤判定される
// リスクが高いため（実データで確認済み、GINZA SIX等の全ページに共通の
// ナビゲーション文言が含まれる）。このリスクを踏まえ、ナビゲーションに
// 頻出する一般的すぎる語（「ニュース」「アート」「ショップ」単体等）は
// キーワードから意図的に除外している。
// キーワードでマッチしない場合は、既存のcontentType（classifyContentType.ts）
// からの緩やかなフォールバックマッピングを試みる。それでも判定できない
// 場合は'other'とする（推測で埋めない、本プロジェクト全体の原則）。

export const UX_TYPES = [
  'participate_workshop',
  'food_drink',
  'live_performance',
  'exhibition_viewing',
  'shopping_discovery',
  'other',
] as const
export type UxType = (typeof UX_TYPES)[number]

export const UX_TYPE_LABELS: Record<UxType, string> = {
  participate_workshop: '参加・体験・ワークショップ',
  food_drink: 'グルメ・飲食',
  live_performance: 'ライブ・公演・観覧',
  exhibition_viewing: '展覧会・鑑賞',
  shopping_discovery: 'ショッピング・新商品発見',
  other: 'その他（未分類）',
}

interface UxTypeRule {
  type: UxType
  keywords: string[]
}

// 優先順位付き（配列の先頭ほど優先）。「体験・参加」を示す語が最も強い
// シグナルのため最優先——例えば「能面体験＆ワークショップ」は「能」という
// 語だけ見ればlive_performanceと誤認しかねないが、「体験」「ワークショップ」を
// 最優先で確認することで正しくparticipate_workshopと判定できる（実データで
// 確認済み、当該ページ自身に「本イベントでは、能の上演はございません」と
// 明記されており、参加体験型であって公演鑑賞ではないことを裏付けている）。
const KEYWORD_RULES: UxTypeRule[] = [
  {
    type: 'participate_workshop',
    keywords: [
      'ワークショップ',
      '体験',
      'オーダー会',
      '教室',
      'レッスン',
      '手作り',
      '手づくり',
      'あそび',
      '参加者募集',
      '実演',
      'workshop',
      'hands-on',
      'hands on',
      'make your own',
      'diy',
    ],
  },
  {
    type: 'food_drink',
    keywords: [
      'グルメ',
      'レストラン',
      'カフェ',
      'ダイニング',
      'テイスティング',
      '試食',
      '飲み比べ',
      'ワイン',
      'バー', // 「バー」は「バーゲン」等への誤爆リスクがあるが実データでは未確認、既知の限界として記録
      'restaurant',
      'cafe',
      'café',
      'dining',
      'tasting',
    ],
  },
  {
    type: 'live_performance',
    keywords: [
      'ライブ',
      '公演',
      '上演',
      'コンサート',
      'トークイベント',
      '舞台',
      'ショー',
      '盆踊り',
      '例大祭',
      '例祭',
      '祭り',
      'live',
      'concert',
      'performance',
      'talk event',
      'festival',
    ],
  },
  {
    type: 'exhibition_viewing',
    keywords: ['展覧会', '展示', '個展', 'ギャラリー展', 'exhibition', 'gallery exhibition'],
  },
  {
    type: 'shopping_discovery',
    keywords: [
      '新作',
      'コレクション',
      'ポップアップ',
      'pop up',
      'pop-up',
      '限定発売',
      '先行発売',
      '特別販売',
      'フェア',
      '市', // 「〜市」（せともの市等の物産市）。単一文字のため誤検知リスクがやや高い、既知の限界
      'collection',
      'popup',
      'new arrival',
      'limited edition',
    ],
  },
]

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()))
}

function matchByKeywords(text: string): UxType | null {
  const haystack = text.toLowerCase()
  for (const rule of KEYWORD_RULES) {
    if (matchesAny(haystack, rule.keywords)) return rule.type
  }
  return null
}

// contentType（classifyContentType.ts）からの緩やかなフォールバック。
// contentTypeは「ページの種類」という粗い粒度のため確度は高くないが、
// キーワードで判定できなかった場合の次善策として使う。
function fallbackFromContentType(contentType: ContentType | null | undefined): UxType | null {
  switch (contentType) {
    case 'food':
      return 'food_drink'
    case 'exhibition':
      return 'exhibition_viewing'
    case 'shopping':
      return 'shopping_discovery'
    case 'culture':
      // 文化・歴史系は展示・資料的な内容であることが多いという緩やかな
      // 仮定に基づくフォールバック（確度は低い、既知の限界として明記）。
      return 'exhibition_viewing'
    default:
      return null
  }
}

// 【実データで発見した誤分類パターンと対策（2026-08-18）】シミュレーション中、
// 歌舞伎座の「株主優待」「最新情報」等、本文とは無関係な管理的ページが
// 軒並みlive_performance（ライブ・公演・観覧）に誤分類される事象を発見した。
// 原因を実データで追跡したところ、これらのexcerptには歌舞伎座公演の
// 過去のお知らせ一覧（サイドバー的な関連リンク集）が大量に含まれており、
// 「公演」という語がページ自身の主題とは無関係に繰り返し出現していた
// （歌舞伎座は劇場サイトのため「公演」がサイト全体で頻出する構造的な
// ノイズ語になっている——GINZA SIX等の「ニュース」「アート」と同種の
// リスクだが、事前のキーワード選定だけでは防げなかった実例）。
// 該当ページのcontentRichnessTier（contentRichness.ts、2026-08-18に
// 本文情報量ペナルティのため導入済み）を確認したところ、いずれも
// 'boilerplate'または'thin'（実質的な本文が乏しいと判定済み）だった
// ため、この既存シグナルを再利用してexcerptベースの判定を制限する
// ことで解決した——boilerplate/thin判定のページはexcerptに実質的な
// 本文がないと既に分かっているため、excerptキーワードマッチを行わず
// contentTypeフォールバックまたは'other'へ進む。
export function classifyUxType(
  title: string | null | undefined,
  excerpt: string | null | undefined,
  contentType: ContentType | null | undefined,
  contentRichnessTier?: string | null,
): UxType {
  const titleMatch = matchByKeywords(title ?? '')
  if (titleMatch) return titleMatch

  const excerptIsTrustworthy = contentRichnessTier !== 'boilerplate' && contentRichnessTier !== 'thin'
  if (excerptIsTrustworthy) {
    const excerptMatch = matchByKeywords(excerpt ?? '')
    if (excerptMatch) return excerptMatch
  }

  const fallback = fallbackFromContentType(contentType)
  if (fallback) return fallback

  return 'other'
}
