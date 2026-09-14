// 出典ゲート（step 9 の検証）。マロン承認基準：「出典なし → red」。
//   ・provenance が空                       → red noProvenance
//   ・sourceUrl の無い fact がある           → red provenanceMissingUrl
//   ・verificationStatus=conflicting がある  → red conflictingFacts
//   ・confirmed が 0 件                      → red noConfirmedFact
// 純粋・AI なし。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import type { ArticleUnderAudit } from './types'

export function checkProvenance(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []
  const prov = Array.isArray(a.provenance) ? a.provenance : []

  if (prov.length === 0) {
    out.push({
      checkId: 'noProvenance',
      severity: 'red',
      message: 'editorialProvenance が空（重要 Fact の出典が追跡できない）',
    })
    return out
  }

  const missingUrl = prov.filter((p) => !String(p.sourceUrl ?? '').trim())
  if (missingUrl.length > 0) {
    out.push({
      checkId: 'provenanceMissingUrl',
      severity: 'red',
      message: `sourceUrl の無い Fact が ${missingUrl.length} 件（出典 URL が追跡できない）`,
      excerpt: clipExcerpt(missingUrl.map((p) => p.fact).join(' / ')),
    })
  }

  const conflicting = prov.filter((p) => p.verificationStatus === 'conflicting')
  if (conflicting.length > 0) {
    out.push({
      checkId: 'conflictingFacts',
      severity: 'red',
      message: `verificationStatus=conflicting の Fact が ${conflicting.length} 件（一次・公式情報間の矛盾）`,
      excerpt: clipExcerpt(conflicting.map((p) => p.fact).join(' / ')),
    })
  }

  const confirmed = prov.filter((p) => p.verificationStatus === 'confirmed').length
  if (confirmed === 0) {
    out.push({
      checkId: 'noConfirmedFact',
      severity: 'red',
      message: 'confirmed な出典事実が 0 件（会期・会場・価格等の裏付けが無い）',
    })
  }

  return out
}
