// 完売情報ゲート。マロン承認基準：
//   ・公式確認済みの「完売」は本文1回まで   → green
//   ・「完売」が本文2回以上                 → yellow soldOutRepeated
//   ・未確認の「完売」表現                   → red soldOutUnverified
//   ・完売を記事タイトル / 中心に置く        → yellow（"完売情報を記事の中心にしない"）
//     - タイトルに完売語 → yellow soldOutInTitle
//     - 「購入について」以外のセクションに完売語 → yellow soldOutOutsideSection
// 純粋・AI なし。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import type { ArticleUnderAudit } from './types'

const SOLD_OUT_RE = /完売|売り切れ|売切れ|ソールドアウト|sold\s?out/gi
const PURCHASE_SECTION_RE = /購入について/

/** 完売語を含む文（前後を少し含める） */
function pickSentence(text: string, idx: number): string {
  const start = Math.max(0, text.lastIndexOf('。', idx) + 1)
  let end = text.indexOf('。', idx)
  if (end === -1) end = text.length
  return text.slice(start, end + 1).trim()
}

export function checkSoldOut(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []

  // タイトルの完売語
  if (SOLD_OUT_RE.test(a.title)) {
    out.push({
      checkId: 'soldOutInTitle',
      severity: 'yellow',
      excerpt: clipExcerpt(a.title),
      message: 'タイトルに「完売」が含まれる（完売情報を記事の中心にしない）',
    })
  }
  SOLD_OUT_RE.lastIndex = 0

  // 本文の完売語を全セクション集計
  const hits: { section: string; sentence: string }[] = []
  for (const s of a.sections) {
    const rx = new RegExp(SOLD_OUT_RE.source, SOLD_OUT_RE.flags)
    let m: RegExpExecArray | null
    while ((m = rx.exec(s.text)) !== null) {
      hits.push({ section: s.name, sentence: pickSentence(s.text, m.index) })
    }
  }
  if (hits.length === 0) return out

  // 公式で「完売」が確認できるか（confirmed provenance / officialInfoNote）
  const verified =
    (a.provenance ?? []).some(
      (p) => p.verificationStatus === 'confirmed' && /完売|売り切れ|売切れ|sold\s?out/i.test(p.fact),
    ) || /完売|売り切れ|売切れ|sold\s?out/i.test(String(a.facts.officialInfoNote ?? ''))

  if (!verified) {
    out.push({
      checkId: 'soldOutUnverified',
      severity: 'red',
      section: [...new Set(hits.map((h) => h.section))].join(' / '),
      excerpt: clipExcerpt(hits[0].sentence),
      message: '本文に「完売」があるが、confirmed 事実 / officialInfoNote で確認できない（未確認の完売）',
    })
    return out
  }

  if (hits.length >= 2) {
    out.push({
      checkId: 'soldOutRepeated',
      severity: 'yellow',
      section: [...new Set(hits.map((h) => h.section))].join(' / '),
      excerpt: clipExcerpt(hits.map((h) => h.sentence).join(' / ')),
      message: `「完売」が本文に ${hits.length} 回（1回まで。完売情報を記事の中心にしない）`,
    })
  }

  const outside = hits.filter((h) => !PURCHASE_SECTION_RE.test(h.section))
  if (outside.length > 0) {
    out.push({
      checkId: 'soldOutOutsideSection',
      severity: 'yellow',
      section: [...new Set(outside.map((h) => h.section))].join(' / '),
      excerpt: clipExcerpt(outside[0].sentence),
      message: '「完売」が「購入について」以外のセクションに出ている（完売情報を記事の中心にしない）',
    })
  }

  return out
}
