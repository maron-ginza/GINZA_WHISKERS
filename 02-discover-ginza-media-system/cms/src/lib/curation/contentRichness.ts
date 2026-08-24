// 本文情報量のEditorial Scoreへの反映（2026-08-18）。
//
// 【背景】2026-08-17の「旬の銀座」記事化Trialで、#6（赤地陶房のうつわ、
// GINZA OFFICIAL経由）がEditorial Score 51点（#4のREGAL×SOMÈSと同点）
// だったにもかかわらず、実際にexcerptを確認したところ大半がサイト共通の
// ナビゲーションメニュー文言で、記事化に足る実質的な本文情報がほぼ
// 無いことが判明した。AIはタイトル・URL・断片的な情報からでも
// もっともらしいEditorial Scoreを付けてしまうため、「編集的に魅力的か」
// （Editorial Scoreが答える問い）と「今すぐ記事を書けるだけの材料が
// あるか」（本モジュールが答える問い）は別の軸として扱う必要がある。
//
// 【設計方針】
// ・AIを再度呼び出さない——既に保存済みのexcerpt/contentRefのテキストから
//   決定的（同一入力に対し常に同じ結果）に判定する純粋関数。既存の
//   採点済み候補（Sources・DiscoveredContent）にも追加コストなしで
//   即座に適用できる。
// ・フルNLPは使わない（v1スコープ、本プロジェクトの他の抽出ロジック
//   ——extractLinks.ts等——と同じ「素朴なヒューリスティックで十分」という
//   方針を踏襲）。
// ・「同一施設だから低品質」と同じ考え方で、「文字数が少ないから機械的に
//   除外」はしない——ペナルティは0〜1の乗数として作用し、どれだけ本文が
//   薄くても合計スコアが0になることはない（facilityDiversity.tsと同じ
//   「過度なハード除外を避ける」原則）。
// ・Editorial Score自体（5軸のAI判定値・reason文）は一切書き換えない。
//   ペナルティ適用前の合計は`rawTotal`として別途保持し、`total`
//   （ランキングが実際に使う値）だけがペナルティ適用後の値になる——
//   何が調整されたかを常に遡って確認できる透明性を優先する
//   （facilityDiversity.tsのpureScoreRank/diversityAdjustedと同じ設計思想）。
//
// 【指標の選定根拠（実データで検証済み、2026-08-18）】
// 「。！？」（日本語の文末句点）の出現数を主指標とした。実データで
// 赤地陶房のうつわ（id=150、ナビ文言だらけ）の出現数が0だったのに対し、
// 同じTrialで実際に記事化できた5件（能面体験・REGAL×SOMÈS・雲の物語・
// no side by side・南方書局のハッピーサマー）はいずれも12〜18回と、
// 明確な差があることを実データで確認した。加えて、GINZA SIXの
// カテゴリー一覧ページ（Lifestyle/Fashion/Events等、個別記事ではなく
// 複数記事のティザーを集めたインデックスページ）も出現数0〜2件に
// 集中していることを確認し、「文末句点がほぼ無い」ことは「実質的に
// 書き出せる本文がない」ことの妥当な代理指標であると判断した。
// 【既知の制約】日本語の句点のみを対象とし、英語の"."等は数えない
// （日付表記・URL・略語との混同を避けるため今回は対象外とした）。
// GO TOKYO等の英語ページも実データでは同じ理由（本文ではなくナビ
// シェルしか取得できていない）でthin/boilerplateに分類されており、
// 現時点で誤検知は確認されていないが、将来英語の実質的な記事本文が
// 増えた場合は再検証が必要な既知の制約として記録する。

export const CONTENT_RICHNESS_TIERS = ['rich', 'thin', 'boilerplate'] as const
export type ContentRichnessTier = (typeof CONTENT_RICHNESS_TIERS)[number]

export interface ContentRichnessAssessment {
  tier: ContentRichnessTier
  sentenceEndingCount: number
  contentLength: number
  penaltyFactor: number
}

const SENTENCE_ENDING_RE = /[。！？]/g

// 実データ観察に基づく初期値（UPCOMING_WINDOW_DAYS等、本プロジェクトの
// 他の定数と同じ位置づけ——固定の正解ではなく運用しながら調整する）。
// タイトル＋出典URL表記だけの短い文字列（実質excerptが空）を確実に
// boilerplate側へ倒すための下限。
const MIN_MEANINGFUL_LENGTH = 120
const RICH_MIN_SENTENCE_ENDINGS = 3
const THIN_MIN_SENTENCE_ENDINGS = 1

export const CONTENT_RICHNESS_PENALTY: Record<ContentRichnessTier, number> = {
  rich: 1.0,
  thin: 0.85,
  boilerplate: 0.65,
}

export const CONTENT_RICHNESS_TIER_LABELS: Record<ContentRichnessTier, string> = {
  rich: 'rich（実質的な本文あり）',
  thin: 'thin（本文情報が乏しい）',
  boilerplate: 'boilerplate（ナビ文言等が大半、実質本文なし）',
}

export function assessContentRichness(contentRef: string | null | undefined): ContentRichnessAssessment {
  const text = (contentRef ?? '').trim()
  const sentenceEndingCount = (text.match(SENTENCE_ENDING_RE) ?? []).length
  const contentLength = text.length

  let tier: ContentRichnessTier
  if (contentLength < MIN_MEANINGFUL_LENGTH || sentenceEndingCount === 0) {
    tier = 'boilerplate'
  } else if (sentenceEndingCount < RICH_MIN_SENTENCE_ENDINGS && sentenceEndingCount >= THIN_MIN_SENTENCE_ENDINGS) {
    tier = 'thin'
  } else {
    tier = 'rich'
  }

  return { tier, sentenceEndingCount, contentLength, penaltyFactor: CONTENT_RICHNESS_PENALTY[tier] }
}

// Editorial Scoreのtotal（サーバー側で5軸から再計算した値、AIの自己申告は
// 信用しない既存原則——computeEditorialScoreTotal）に、本文情報量の
// ペナルティを乗算する。0〜100の範囲にクランプする（マイナスにはしない）。
export function applyContentRichnessPenalty(rawTotal: number, penaltyFactor: number): number {
  return Math.max(0, Math.min(100, Math.round(rawTotal * penaltyFactor)))
}
