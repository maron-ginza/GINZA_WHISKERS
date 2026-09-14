// 必須事実の不足ゲート（step 5）。マロン承認基準：「必須事実の不足 → red」。
//
// evaluateReadyGate（種別ごとの ready 必須項目の正本）を再利用し、
//   ・必須テキスト項目・hashtags・eventDateISO・（イベント系の）venues/paid が欠落 → red
//   ・任意項目（sale の venues/eventTime/paid 等）の欠落                            → yellow
// 純粋・AI なし。二重実装しない（readyGate.ts に一本化）。

import type { AuditFinding } from '../riskModel'
import { evaluateReadyGate, type CommonArticleFacts, type TemplateType } from '../../template/readyGate'
import type { ArticleUnderAudit } from './types'

/** 任意項目とみなす missing ラベルの断片（これに一致する欠落は yellow） */
const OPTIONAL_HINTS = [
  'editionLabel',
  'theme',
]

export function checkRequiredFacts(a: ArticleUnderAudit, now: Date): AuditFinding[] {
  const f = a.facts
  const common: CommonArticleFacts = {
    primaryCategory: a.primaryCategory ?? null,
    templateType: (a.templateType as TemplateType) ?? 'unknown',
    contentTitle: f.eventName ?? undefined,
    contentSummary: f.whatHappens ?? undefined,
    availablePeriod: f.eventDate ?? undefined,
    eventDateISO: f.eventDateISO ?? undefined,
    eventTime: f.eventTime ?? undefined,
    venues: f.venues ?? undefined,
    priceText: f.priceText ?? undefined,
    paid: f.paid ?? undefined,
    applyRequired: f.applyRequired ?? undefined,
    applyDeadline: f.applyDeadline ?? undefined,
    officialInfoNote: f.officialInfoNote ?? undefined,
    areaLead: f.areaLead ?? undefined,
    audienceNote: f.audienceNote ?? undefined,
    hashtags: (a.hashtags ?? []).map((t) => ({ tag: t })),
    sourceProvenanceFacts: (a.provenance ?? []).map((p) => ({
      fact: p.fact,
      verificationStatus: p.verificationStatus,
    })),
    enrichmentStatus: 'ready',
  }

  const gate = evaluateReadyGate(common, common.templateType ?? 'unknown', { now })
  if (gate.eligible) return []

  const out: AuditFinding[] = []
  for (const m of gate.missing) {
    const optional = OPTIONAL_HINTS.some((h) => m.includes(h))
    out.push({
      checkId: optional ? 'optionalFactMissing' : 'requiredFactMissing',
      severity: optional ? 'yellow' : 'red',
      message: `${optional ? '任意項目' : '必須事実'}の不足: ${m}`,
    })
  }
  return out
}
