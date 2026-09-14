// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// createDraftFromArticleFacts の読み取り専用 preview（DB 書き込みなし）を、
// 本文検査の入力 ArticleUnderAudit へ変換する純粋関数。
// CTA ブロックは saleTemplate が SOURCE 見出しの直前に置く「見出しなし段落」なので、
// callToAction と一致する末尾段落を検出して sections から外し ctaInBody=true にする。

import type { CreateDraftFromArticleFactsResult } from '../template/createDraftFromArticleFacts'
import type { ArticleUnderAudit, AuditSection } from './articleBodyChecks'

type Preview = NonNullable<CreateDraftFromArticleFactsResult['preview']>
type Block = Preview['blocks'][number]

/** blocks（heading/paragraph）→ セクション列。最初の heading より前は "導入"。 */
export function blocksToSections(blocks: Block[]): AuditSection[] {
  const sections: AuditSection[] = []
  let current: AuditSection = { name: '導入', text: '' }
  const push = () => {
    if (current.text.trim() || current.name !== '導入') sections.push({ ...current, text: current.text.trim() })
  }
  for (const b of blocks) {
    if (b.type === 'heading') {
      push()
      current = { name: b.text.trim(), text: '' }
    } else {
      current.text += (current.text ? '\n' : '') + b.text
    }
  }
  push()
  return sections
}

export function articleUnderAuditFromPreview(
  preview: Preview,
  meta: { articleId?: number | string | null; discoveredContentId?: number | string | null },
): ArticleUnderAudit {
  let sections = blocksToSections(preview.blocks)

  // CTA ブロックの検出：SOURCE 見出しの直前セクション、または callToAction と一致する末尾段落
  const cta = String(preview.callToAction ?? '').trim()
  let ctaInBody = false
  if (cta) {
    for (let i = 0; i < sections.length; i++) {
      const lines = sections[i].text.split('\n').map((l) => l.trim())
      const idx = lines.findIndex((l) => l === cta)
      if (idx >= 0) {
        ctaInBody = true
        lines.splice(idx, 1)
        sections[i] = { ...sections[i], text: lines.join('\n').trim() }
      }
    }
    sections = sections.filter((s) => s.text.trim() || /SOURCE|基本情報|購入について/.test(s.name))
  }

  const hasOfficialUrl = !!String(preview.sourceUrl ?? '').trim() && /^https?:\/\//.test(String(preview.sourceUrl))

  return {
    articleId: meta.articleId ?? undefined,
    discoveredContentId: meta.discoveredContentId ?? undefined,
    title: preview.title,
    sections,
    appliedTemplate: preview.appliedTemplate,
    templateType: String(preview.templateType ?? preview.appliedTemplate),
    primaryCategory: preview.primaryCategory ?? null,
    callToAction: preview.callToAction ?? null,
    ctaInBody,
    hashtags: preview.hashtags ?? [],
    provenance: (preview.provenance ?? []).map((p) => ({
      fact: p.fact,
      factType: p.factType,
      verificationStatus: p.verificationStatus,
      sourceUrl: p.sourceUrl ?? null,
      verifiedAt: p.verifiedAt ?? null,
    })),
    facts: {
      eventName: preview.facts.eventName ?? null,
      whatHappens: preview.facts.whatHappens ?? null,
      eventDate: preview.facts.eventDate ?? null,
      eventDateISO: preview.facts.eventDateISO ?? null,
      eventTime: preview.facts.eventTime ?? null,
      venues: preview.facts.venues ?? null,
      priceText: preview.facts.priceText ?? null,
      officialInfoNote: preview.facts.officialInfoNote ?? null,
      applyRequired: preview.facts.applyRequired ?? null,
      applyDeadline: preview.facts.applyDeadline ?? null,
      paid: preview.facts.paid ?? null,
      areaLead: preview.facts.areaLead ?? null,
      audienceNote: preview.facts.audienceNote ?? null,
    },
    hasOfficialUrl,
    verifiedAt: preview.verifiedAt ?? null,
  }
}
