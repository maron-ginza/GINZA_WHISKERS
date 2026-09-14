// 公式↔編集の混在ゲート（step 6）。マロン承認基準：「表現重複 / 表記揺れ → yellow」相当で、
// 混在も yellow（必須事実の欠落・数値矛盾ではないため）。
//   ・編集セクション（EDITOR'S CHOICE / GINZA WHISKERS' NOTE / WHY NOW?）に
//     日付・価格・時刻・予約/入場料の literal が混入 → yellow factInEditorialSection
//   ・情報セクション（基本情報 / 購入について）に編集的な断定・推奨表現が混入 → yellow opinionInInfoSection
//   ・GINZA WHISKERS' NOTE が 何が見つかる？＋WHY NOW? の言い換え（類似度過大） → yellow editorsNoteRestatesContent
// 純粋・AI なし。factNoteSeparation.ts を再利用（二重実装しない）。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import { checkFactNoteSeparation } from '../../curation/factNoteSeparation'
import type { ArticleUnderAudit } from './types'

const EDITORIAL_SECTION_RE = /EDITOR'S CHOICE|GINZA WHISKERS' NOTE|WHY NOW/i
const INFO_SECTION_RE = /基本情報|購入について/
const NOTE_SECTION_RE = /GINZA WHISKERS' NOTE/i
const CONTENT_SECTION_RE = /何が見つかる|WHY NOW/i

const FACT_LEAK_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '年月日', re: /\d{3,4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?/ },
  { label: '月日', re: /(?<!\d)\d{1,2}\s*月\s*\d{1,2}\s*日/ },
  { label: '価格', re: /[¥￥]\s?\d|[\d,]+\s*円/ },
  { label: '時刻', re: /\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?から/ },
  { label: '予約・料金要否', re: /入場(?:料|無料|券)|前売(?:券)?|当日券|要予約|予約(?:制|不要|必要|受付)/ },
]

const OPINION_MARKERS = [
  '必見',
  '絶対',
  'おすすめ',
  'オススメ',
  'イチオシ',
  '一押し',
  '圧巻',
  '見逃せない',
  '見逃せません',
  '必ず',
  'マスト',
  'must',
  '間違いなし',
  '外せない',
]

export function checkFactEditorialMix(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []

  for (const s of a.sections) {
    if (EDITORIAL_SECTION_RE.test(s.name)) {
      for (const { label, re } of FACT_LEAK_PATTERNS) {
        const m = s.text.match(re)
        if (m) {
          out.push({
            checkId: 'factInEditorialSection',
            severity: 'yellow',
            section: s.name,
            excerpt: clipExcerpt(m[0]),
            message: `編集セクションに事実情報（${label}）が混入している（事実は基本情報 / 購入について / SOURCE へ）`,
          })
          break
        }
      }
    }
    if (INFO_SECTION_RE.test(s.name)) {
      const hit = OPINION_MARKERS.find((w) => s.text.includes(w))
      if (hit) {
        out.push({
          checkId: 'opinionInInfoSection',
          severity: 'yellow',
          section: s.name,
          excerpt: clipExcerpt(hit),
          message: `情報セクションに編集的な断定・推奨表現（「${hit}」）が混入している`,
        })
      }
    }
  }

  // NOTE が content+whyNow の言い換えになっていないか
  const noteText = a.sections.find((s) => NOTE_SECTION_RE.test(s.name))?.text ?? ''
  const contentText = a.sections
    .filter((s) => CONTENT_SECTION_RE.test(s.name))
    .map((s) => s.text)
    .join(' ')
  if (noteText && contentText) {
    const r = checkFactNoteSeparation(noteText, contentText, 0.62)
    if (r.factLeak) {
      out.push({
        checkId: 'factInEditorialSection',
        severity: 'yellow',
        section: "GINZA WHISKERS' NOTE",
        excerpt: clipExcerpt(r.leakedSamples.join(' / ')),
        message: 'GINZA WHISKERS\' NOTE に事実情報が混入している',
      })
    }
    if (r.restatesContent) {
      out.push({
        checkId: 'editorsNoteRestatesContent',
        severity: 'yellow',
        section: "GINZA WHISKERS' NOTE",
        message: `GINZA WHISKERS' NOTE が「何が見つかる？＋WHY NOW?」の言い換えに近い（類似度 ${r.similarity}）`,
      })
    }
  }

  return out
}
