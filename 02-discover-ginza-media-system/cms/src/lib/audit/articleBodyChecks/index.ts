// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// 本文検査レジストリ。記事1本（ArticleUnderAudit）に対して steps 5〜9 ＋
// 6つの sale 共通検査を一括で回し、AuditFinding[] を返す純粋関数。
// AI 呼び出しなし・DB 非依存。テンプレ経路・AI 経路の両方から呼べる。

import type { AuditFinding } from '../riskModel'
import type { ArticleUnderAudit } from './types'
import { checkProvenance } from './provenanceGate'
import { checkRequiredFacts } from './requiredFactsGate'
import { checkUnbackedClaims } from './unbackedClaimGate'
import { checkSoldOut } from './soldOutGate'
import { checkStoreHours } from './storeHoursGate'
import { checkCtaWarrant } from './ctaWarrantGate'
import { checkFactEditorialMix } from './factEditorialMixGate'
import { checkSectionRepetition } from './sectionRepetitionGate'

export * from './types'
export { ctaShouldEmit, ctaReason } from './ctaWarrantGate'

export interface RunArticleBodyChecksOptions {
  now?: Date
}

export function runArticleBodyChecks(
  a: ArticleUnderAudit,
  opts: RunArticleBodyChecksOptions = {},
): AuditFinding[] {
  const now = opts.now ?? new Date()
  return [
    ...checkProvenance(a), // step 9：出典
    ...checkRequiredFacts(a, now), // step 5：必須事実
    ...checkUnbackedClaims(a), // steps 5・7：推測補完 / 数値矛盾
    ...checkFactEditorialMix(a), // step 6：公式↔編集の分離
    ...checkSectionRepetition(a), // step 7：表現重複
    ...checkSoldOut(a), // sale 共通：完売
    ...checkStoreHours(a), // sale 共通：店舗営業時間
    ...checkCtaWarrant(a), // step 8：CTA 要否
  ]
}
