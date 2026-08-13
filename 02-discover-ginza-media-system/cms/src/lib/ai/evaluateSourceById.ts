import type { Payload } from 'payload'

import type { Tag } from '../../payload-types'
import { evaluateSource, type EvaluateSourceInput, type SourceEvaluation } from './evaluateSource'

// Phase 14：Source(情報収集) -> AI評価 -> editorialStatus更新のオーケストレーション。
// 到達しうる状態は 'review' と 'editors-choice' のみ。承認(approved)・公開
// (published)・却下確定(rejected)はSources.tsの人間ゲートにより本関数からは
// 到達不能（データとしてもここでは書き込まない）。

const EVALUATABLE_STATES = ['inbox', 'review'] as const

export class SourceNotEvaluatableError extends Error {}

interface EvaluateSourceByIdOptions {
  // テスト・バッチ処理での差し替え用（既定は実際のAnthropic API呼び出し）
  evaluate?: (input: EvaluateSourceInput) => Promise<SourceEvaluation>
}

export async function evaluateSourceById(
  payload: Payload,
  sourceId: number | string,
  options: EvaluateSourceByIdOptions = {},
) {
  const evaluate = options.evaluate ?? evaluateSource

  const source = await payload.findByID({
    collection: 'sources',
    id: sourceId,
    depth: 1,
    overrideAccess: true,
  })

  const currentStatus = source.editorial?.editorialStatus
  if (!EVALUATABLE_STATES.includes(currentStatus as (typeof EVALUATABLE_STATES)[number])) {
    throw new SourceNotEvaluatableError(
      `このソースは編集パイプライン上「${currentStatus}」のためAI評価の対象外です` +
        `（評価可能なのはinbox／reviewのみ。承認・公開・却下済みの項目は上書きしません）`,
    )
  }

  const pillarNames = Array.isArray(source.pillars)
    ? source.pillars
        .filter((p): p is Tag => typeof p === 'object' && p !== null)
        .map((p) => p.name)
        .filter((name): name is string => Boolean(name))
    : []

  const evaluation = await evaluate({
    contentRef: source.contentRef,
    sourceType: source.type,
    pillarNames,
  })

  const isEditorsChoice = evaluation.recommendation === 'proceed' && evaluation.isEditorsChoice
  const nextStatus = isEditorsChoice ? 'editors-choice' : 'review'

  const updated = await payload.update({
    collection: 'sources',
    id: sourceId,
    overrideAccess: true,
    data: {
      editorial: {
        editorialStatus: nextStatus,
        aiSummary: evaluation.summary,
        aiEvaluationReason: evaluation.evaluationReason,
        ...(isEditorsChoice
          ? { editorsChoiceReason: evaluation.editorsChoiceReason || evaluation.evaluationReason }
          : {}),
      },
    },
  })

  return { source: updated, evaluation }
}
