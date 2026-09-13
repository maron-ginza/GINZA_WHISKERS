// GINZA WHISKERS / Project 02（2026-09-14）— SWEETS候補専用の除外判定（純粋・決定的・AIなし）。
//
// 背景：マロン確定の受入条件（2026-09-14）で、SWEETS候補の除外理由は
// 「終了済み・既投稿・既下書き・銀座での販売未確認」の4種類のみと明示された。
// しかし従来はGENERAL多カテゴリー向けの`evaluateSafetyGate`（verdict_c／
// unknown_type／unknown_factkind／no_title等、記事生成用テンプレート判別を
// 前提にした基準）をSWEETSにもそのまま適用していたため、銀座カフェーパウリスタ
// 等の実在する単独施設・商品ページが「テンプレート種別不明」という、受入条件に
// 無い理由で除外されていた（記事生成向けの分類ゲートと、候補として提示できるか
// どうかのゲートを混同していた）。
//
// このモジュールはSWEETS候補にのみ適用する専用ゲートで、`officialCompleteness`
// の必須5項目（商品名・企画名／銀座での場所／内容を確認できる公式URL／
// 出典確認日）に加えて、終了済み・銀座関連性・重複のみを見る
// （verdict_c／unknown_type／unknown_factkind／no_titleは見ない——
// 商品名・企画名の確認はofficialCompletenessが別途必須項目として担う）。

import type { OfficialCompletenessResult } from '../pipeline/candidateCoverageScore'

export interface SweetsEligibilityCandidateInput {
  expired?: boolean
  ginzaRelevant?: boolean
  duplicate?: boolean
}

export type SweetsExclusionCode = 'expired' | 'not_ginza' | 'duplicate' | string

export interface SweetsEligibilityResult {
  eligible: boolean
  /** 除外理由（受入条件の4分類 + officialCompletenessの必須未確認項目） */
  reasons: SweetsExclusionCode[]
}

export function evaluateSweetsEligibility(
  c: SweetsEligibilityCandidateInput,
  official: Pick<OfficialCompletenessResult, 'requiredMissing'>,
): SweetsEligibilityResult {
  const reasons: SweetsExclusionCode[] = []
  if (c.expired) reasons.push('expired')
  if (c.ginzaRelevant === false) reasons.push('not_ginza')
  if (c.duplicate) reasons.push('duplicate')
  reasons.push(...official.requiredMissing)
  return { eligible: reasons.length === 0, reasons }
}
