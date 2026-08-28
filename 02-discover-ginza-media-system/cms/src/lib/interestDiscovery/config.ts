// Project 02-2 収益化②「興味関心 × 銀座 × GINZA WHISKERS視点 最大5本/日」の
// 調整可能パラメータ（2026-08-28、W_PAID/C_MATCH 初期値確定を受けて新設）。
//
// 【9月Trial方針】W_PAID・C_MATCH は「初期提案値」であり実データで調整する。
// コード再デプロイなしで振れるよう、すべて環境変数で上書き可能にする
// （未設定時は確定済みの初期値を使う）。
//
// - INTEREST_W_PAID           : monetization 補正の強さ（既定 8）
// - INTEREST_C_MATCH          : テーマ→承認済みDiscoveredContent プレマッチの
//                               「テーマ側 bigram 被覆率」しきい値（既定 0.6）
// - INTEREST_MAX_DAILY_DRAFTS : 1日あたり生成する記事ドラフトの上限（既定 5）
// - INTEREST_MIN_PAID_SAMPLE  : paidRatio を信頼する最小 totalArticleCount。
//                               これ未満なら monetization 補正を 1.0 に落とす
//                               （初期段階でスコアが暴れないための fallback、既定 500）
// - INTEREST_MAX_MON_MULT     : monetization 乗数の上限（既定 1.6 = overlap K=3 と同値。
//                               paidRatio 異常値でも興味シグナル最強値を超えさせない）

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    console.error(`[interestDiscovery/config] ${name}="${raw}" を数値として解釈できないため既定値 ${fallback} を使用します`)
    return fallback
  }
  return n
}

export interface InterestMonetizationConfig {
  wPaid: number
  cMatch: number
  maxDailyDrafts: number
  minPaidSampleSize: number
  maxMonetizationMultiplier: number
}

export function loadInterestMonetizationConfig(): InterestMonetizationConfig {
  return {
    wPaid: numFromEnv('INTEREST_W_PAID', 8),
    cMatch: numFromEnv('INTEREST_C_MATCH', 0.6),
    maxDailyDrafts: numFromEnv('INTEREST_MAX_DAILY_DRAFTS', 5),
    minPaidSampleSize: numFromEnv('INTEREST_MIN_PAID_SAMPLE', 500),
    maxMonetizationMultiplier: numFromEnv('INTEREST_MAX_MON_MULT', 1.6),
  }
}
