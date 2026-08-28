import type { InterestMonetizationConfig } from './config'

// Project 02-2 Phase B（B2）：monetization 補正（2026-08-28）。
//
// 【重要原則（spec）】paidRatio 単独ではランキング・順位付けしない。
// monetization は topicInterestScore に掛ける「乗数」としてのみ作用する。
//
//   monetizationMultiplier = clamp(1 + W_PAID × paidRatio, 1.0, MAX_MON_MULT)
//   finalRankScore         = topicInterestScore × monetizationMultiplier
//
// 【初期段階の fallback（暴れ防止）】paidRatio がまだ十分に蓄積されていない、
// あるいはサンプルが小さいテーマでは乗数を 1.0 に固定する。これにより
// 「paidRatio が1件も保存されていない導入初期」は finalRankScore が
// topicInterestScore と完全一致し、Phase A 単独の挙動へなめらかに縮退する。

export interface MonetizationInput {
  /** interest-themes.monetization.paidRatio（0〜1）。未取得なら null */
  paidRatio: number | null
  /** interest-themes.monetization.totalArticleCount（＝ sampleSize）。未取得なら null */
  sampleSize: number | null
  /** note 側が「約N件」の概数表示だった場合 true（paidRatio は下限扱い） */
  isApproximate?: boolean
}

export interface MonetizationResult {
  multiplier: number
  /** 乗数を 1.0 に固定した場合、その理由（デバッグ・dry-run表示用） */
  fallbackReason: string | null
  paidRatioUsed: number | null
}

export function computeMonetizationMultiplier(
  input: MonetizationInput,
  config: InterestMonetizationConfig,
): MonetizationResult {
  const { paidRatio, sampleSize } = input

  if (paidRatio === null || !Number.isFinite(paidRatio)) {
    return { multiplier: 1.0, fallbackReason: 'paidRatio 未取得（monetization 補正なし）', paidRatioUsed: null }
  }
  if (paidRatio < 0) {
    return { multiplier: 1.0, fallbackReason: 'paidRatio が負値（不正、補正なし）', paidRatioUsed: null }
  }
  if (sampleSize === null || sampleSize < config.minPaidSampleSize) {
    return {
      multiplier: 1.0,
      fallbackReason: `サンプル過小（totalArticleCount ${sampleSize ?? '不明'} < ${config.minPaidSampleSize}、補正なし）`,
      paidRatioUsed: paidRatio,
    }
  }

  const raw = 1 + config.wPaid * paidRatio
  const clamped = Math.min(config.maxMonetizationMultiplier, Math.max(1.0, raw))
  return {
    multiplier: clamped,
    fallbackReason: clamped !== raw ? `乗数が上限 ${config.maxMonetizationMultiplier} で頭打ち` : null,
    paidRatioUsed: paidRatio,
  }
}
