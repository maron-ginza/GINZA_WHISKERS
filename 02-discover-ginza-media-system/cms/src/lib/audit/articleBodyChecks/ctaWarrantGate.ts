// CTA 要否ゲート（step 8）。マロン承認基準：「CTA を無条件に出さない」。
//   ・購入 / 参加・申込がある記事（sale または applyRequired=yes）＋公式 URL のときだけ CTA
//   ・不要な記事に CTA ブロックがある                 → yellow ctaNotWarranted
//   ・出すべきなのに本文に CTA が無い                 → yellow ctaMissing
//   ・sale なのにテンプレ既定 CTA 文がそのまま         → yellow ctaDefaultTextLeaked
// 純粋・AI なし。judge は mapDiscoveredContentToEventFields の shouldEmitCta と同基準。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import { TEMPLATE_DEFAULT_CTA } from '../../template/templates'
import type { ArticleUnderAudit } from './types'

export function ctaShouldEmit(a: ArticleUnderAudit): boolean {
  if (!a.hasOfficialUrl) return false
  return a.templateType === 'sale' || a.appliedTemplate === 'sale' || a.facts.applyRequired === 'yes'
}

export function ctaReason(a: ArticleUnderAudit): string {
  if (!a.hasOfficialUrl) return '公式 URL が無いため CTA を出さない'
  if (a.templateType === 'sale' || a.appliedTemplate === 'sale')
    return 'sale（購入という次の行動あり）＋公式 URL → 購入チャネルに裏づけた CTA'
  if (a.facts.applyRequired === 'yes') return '申込あり（applyRequired=yes）＋公式 URL → 参加案内の CTA'
  return '購入・申込が無いため CTA を出さない'
}

export function checkCtaWarrant(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []
  const should = ctaShouldEmit(a)
  const cta = String(a.callToAction ?? '').trim()
  const hasCta = a.ctaInBody || cta.length > 0

  if (hasCta && !should) {
    out.push({
      checkId: 'ctaNotWarranted',
      severity: 'yellow',
      excerpt: clipExcerpt(cta || '(本文の CTA ブロック)'),
      message: `購入も申込も無い記事に CTA がある（${ctaReason(a)}）`,
    })
  }

  if (!hasCta && should) {
    out.push({
      checkId: 'ctaMissing',
      severity: 'yellow',
      message: `${ctaReason(a)} — だが本文末尾に CTA が無い`,
    })
  }

  const isSale = a.templateType === 'sale' || a.appliedTemplate === 'sale'
  if (isSale && cta && cta === TEMPLATE_DEFAULT_CTA) {
    out.push({
      checkId: 'ctaDefaultTextLeaked',
      severity: 'yellow',
      excerpt: clipExcerpt(cta),
      message: 'sale の CTA がテンプレ既定文のまま（購入チャネルに接地した文言を推奨）',
    })
  }

  return out
}
