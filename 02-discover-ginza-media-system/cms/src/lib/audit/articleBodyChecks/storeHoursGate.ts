// 店舗営業時間ゲート。マロン承認基準：
//   ・店舗営業時間を催事固有の開催時間として記載 → red storeHoursMislabeled
//
// sale（物販フェア）の「時間」は会場の営業時間であることがほとんどで、
// フェア固有の開催時刻ではない。本文で `開催時間` / `催事時間` / `イベント時間`
// 等のラベルに時刻が続いていて、かつ
//   ・templateType=sale、または
//   ・confirmed な eventTime provenance に「店舗営業時間」「会場の店舗営業時間に一致」注記がある
// なら red。sale で `店舗営業時間：` でなく単に `時間：` の場合は yellow（表現）。
// 純粋・AI なし。

import type { AuditFinding } from '../riskModel'
import { clipExcerpt } from '../riskModel'
import type { ArticleUnderAudit } from './types'

const EVENT_TIME_LABEL_RE =
  /(開催時間|催事時間|イベント時間|フェア時間|開催時刻)\s*[:：]?\s*([0-9０-９]{1,2}\s*[:：時])/
const PLAIN_TIME_LABEL_RE = /(?:^|\n)\s*時間\s*[:：]/m
const STORE_HOURS_LABEL_RE = /店舗営業時間\s*[:：]/

function provenanceSaysStoreHours(a: ArticleUnderAudit): boolean {
  return (a.provenance ?? []).some(
    (p) =>
      p.verificationStatus === 'confirmed' &&
      /時間|hours/i.test(p.factType + ' ' + p.fact) &&
      /店舗営業時間|会場の店舗営業時間|営業時間に一致/.test(p.fact),
  )
}

export function checkStoreHours(a: ArticleUnderAudit): AuditFinding[] {
  const out: AuditFinding[] = []
  const isSale = a.templateType === 'sale' || a.appliedTemplate === 'sale'
  const provStore = provenanceSaysStoreHours(a)
  const body = a.sections.map((s) => s.text).join('\n')

  const mislabel = body.match(EVENT_TIME_LABEL_RE)
  if (mislabel && (isSale || provStore)) {
    out.push({
      checkId: 'storeHoursMislabeled',
      severity: 'red',
      section: a.sections.find((s) => EVENT_TIME_LABEL_RE.test(s.text))?.name,
      excerpt: clipExcerpt(mislabel[0]),
      message:
        '会場の営業時間を「開催時間 / 催事時間 / イベント時間」として記載している（店舗営業時間と催事固有の開催時間を混同）',
    })
    return out
  }

  // sale で時刻に触れているのにラベルが「時間：」のまま（「店舗営業時間：」でない）
  if (isSale && a.facts.eventTime && !STORE_HOURS_LABEL_RE.test(body) && PLAIN_TIME_LABEL_RE.test(body)) {
    out.push({
      checkId: 'saleTimeLabelWeak',
      severity: 'yellow',
      section: a.sections.find((s) => PLAIN_TIME_LABEL_RE.test(s.text))?.name ?? '基本情報',
      excerpt: '時間：…',
      message: 'sale の時刻を「時間：」で表示（会場の営業時間であることが分かる「店舗営業時間：」を推奨）',
    })
  }

  return out
}
