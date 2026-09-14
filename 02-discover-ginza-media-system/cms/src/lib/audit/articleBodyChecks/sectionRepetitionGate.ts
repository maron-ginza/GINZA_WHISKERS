// 表現重複ゲート（step 7）。マロン承認基準：
//   ・正規化後10文字以上の同一表現が別セクションで2回以上 → yellow crossSectionRepeat
//   ・同一文の実質的重複                                   → yellow duplicateSentence
//   ・固有名詞 / 正式商品名 / 会場名 / 日付 / 価格 / 出典表示は対象外
// 純粋・AI なし。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import { findCrossSectionRepeats, findDuplicateSentences, type DedupMaskInput } from '../dedupTerms'
import type { ArticleUnderAudit } from './types'

function buildMask(a: ArticleUnderAudit): DedupMaskInput {
  const nouns = new Set<string>()
  const add = (v?: string | null) => {
    const s = (v ?? '').trim()
    if (s) nouns.add(s)
  }
  add(a.facts.eventName)
  add(a.title)
  for (const v of a.facts.venues ?? []) {
    add(v?.name)
    add(v?.place)
  }
  for (const t of a.hashtags ?? []) add(t.replace(/^#/, ''))
  for (const p of a.provenance ?? []) add(p.sourceUrl ?? undefined)
  // 出典表示に出る名称（"情報：<name>（確認日 …）"）
  for (const s of a.sections) {
    const m = s.text.match(/情報：([^（(／/]+)/)
    if (m) add(m[1])
  }
  return {
    properNouns: [...nouns],
    sourceUrls: (a.provenance ?? []).map((p) => String(p.sourceUrl ?? '')).filter(Boolean),
  }
}

export function checkSectionRepetition(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []
  const mask = buildMask(a)
  const sections = a.sections.map((s) => ({ name: s.name, text: s.text }))

  for (const hit of findCrossSectionRepeats(sections, mask, 10)) {
    out.push({
      checkId: 'crossSectionRepeat',
      severity: 'yellow',
      section: hit.sections.join(' / '),
      excerpt: clipExcerpt(hit.term),
      message: `正規化後10字以上の同一表現「${clipExcerpt(hit.term, 30)}」が ${hit.sections.length} セクションで反復（固有名詞・日付・価格は対象外）`,
    })
  }

  for (const hit of findDuplicateSentences(sections, mask, 0.8, 8)) {
    out.push({
      checkId: 'duplicateSentence',
      severity: 'yellow',
      section: `${hit.a.section} / ${hit.b.section}`,
      excerpt: clipExcerpt(`${hit.a.text} ↔ ${hit.b.text}`),
      message: `同一文の実質的重複（類似度 ${hit.similarity}）`,
    })
  }

  return out
}
