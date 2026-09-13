// GINZA WHISKERS / Project 02（2026-09-04、既存データの日付正規化）
//
// 公式ページのタイトル・本文抜粋に **明記された** 会期／開催期間を決定的に抽出する。
// 推測・事実補完はしない——「YYYY.MM.DD〜MM.DD」等、実際に書かれている日付だけを拾う。
// DiscoveredContent.eventStartAt/eventEndAt が未取得のときの補助に使う（DB は書き換えない）。

export interface ExplicitPeriod {
  startIso: string
  endIso: string
  /** 抽出根拠（監査用） */
  matched: string
}

const FW = (s: string) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[　]/g, ' ')

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString()
}

// 明記された「会期／開催期間」を優先的に拾うためのラベル
const PERIOD_LABEL = /(?:会期|開催期間|開催日時|開催日|期間|日程|フェア期間|展示期間)\s*[:：]?\s*/

// 曜日表記（任意）
const DOW = /(?:\s*[（(][日月火水木金土](?:曜日?)?[）)])?/

// 区切り
const SEP = /\s*(?:〜|～|~|－|–|—|-|から|まで|ー)\s*/

/**
 * 日付レンジ／単日を1件だけ返す（複数見つかった場合は最初の「未来を含む・妥当な」もの）。
 * baseYear は年が省略された終端に補う（開始年を使う）。
 */
export function extractExplicitPeriod(text: string, opts: { now?: Date } = {}): ExplicitPeriod | null {
  const t = FW(text ?? '')
  if (!t) return null

  const results: ExplicitPeriod[] = []

  // 1) YYYY[.\-/年]M[.\-/月]D[日]?(曜) 〜 [YYYY年]?M[.\-/月]D[日]?(曜)
  const rangeRe = new RegExp(
    String.raw`(?:${PERIOD_LABEL.source})?` +
      String.raw`(20\d{2})\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})\s*日?` +
      DOW.source +
      SEP.source +
      String.raw`(?:(20\d{2})\s*[.\-/年]\s*)?(\d{1,2})\s*[.\-/月]\s*(\d{1,2})\s*日?` +
      DOW.source,
    'g',
  )
  let m: RegExpExecArray | null
  while ((m = rangeRe.exec(t)) !== null) {
    const y1 = Number(m[1])
    const s = iso(y1, Number(m[2]), Number(m[3]))
    const y2 = m[4] ? Number(m[4]) : y1
    const e = iso(y2, Number(m[5]), Number(m[6]))
    if (s && e && Date.parse(e) >= Date.parse(s)) results.push({ startIso: s, endIso: e, matched: m[0].trim().slice(0, 60) })
  }

  // 1b) YYYY年M月D日(曜) 〜 D日(曜)（終端が日のみ＝開始と同じ月・年を補う）
  // 2026-09-14追加：「2026年9月9日(水)－15日(火)」のように、終端で月を省略する
  // 日本語表記（開始月と同じことが文脈上明らかな場合の慣用表記）に対応する。
  if (results.length === 0) {
    const sameMonthRe = new RegExp(
      String.raw`(?:${PERIOD_LABEL.source})?` +
        String.raw`(20\d{2})\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})\s*日?` +
        DOW.source +
        SEP.source +
        String.raw`(\d{1,2})\s*日` +
        DOW.source,
      'g',
    )
    while ((m = sameMonthRe.exec(t)) !== null) {
      const y1 = Number(m[1])
      const mo1 = Number(m[2])
      const s = iso(y1, mo1, Number(m[3]))
      const e = iso(y1, mo1, Number(m[4]))
      if (s && e && Date.parse(e) >= Date.parse(s)) results.push({ startIso: s, endIso: e, matched: m[0].trim().slice(0, 60) })
    }
  }

  // 2) M/D(曜) 〜 M/D(曜)（年なし）— 年は now の年、跨ぎは翌年
  if (results.length === 0) {
    const mdRe = new RegExp(
      String.raw`(?:${PERIOD_LABEL.source})` +
        String.raw`(\d{1,2})\s*[./月]\s*(\d{1,2})\s*日?` +
        DOW.source +
        SEP.source +
        String.raw`(\d{1,2})\s*[./月]\s*(\d{1,2})\s*日?` +
        DOW.source,
      'g',
    )
    const baseY = (opts.now ?? new Date()).getUTCFullYear()
    while ((m = mdRe.exec(t)) !== null) {
      const sm = Number(m[1])
      const em = Number(m[3])
      const s = iso(baseY, sm, Number(m[2]))
      const e = iso(em < sm ? baseY + 1 : baseY, em, Number(m[4]))
      if (s && e && Date.parse(e) >= Date.parse(s)) results.push({ startIso: s, endIso: e, matched: m[0].trim().slice(0, 60) })
    }
  }

  // 3) 単日「YYYY年M月D日」（ラベル付き or 「開催」直前）
  if (results.length === 0) {
    const singleRe = /(?:会期|開催日|開催日時|開催|日時|期間)\s*[:：]?\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g
    while ((m = singleRe.exec(t)) !== null) {
      const s = iso(Number(m[1]), Number(m[2]), Number(m[3]))
      if (s) results.push({ startIso: s, endIso: s, matched: m[0].trim().slice(0, 60) })
    }
  }

  if (results.length === 0) return null
  // now 以降に終わるものを優先、なければ最初
  const now = (opts.now ?? new Date()).getTime()
  return results.find((r) => Date.parse(r.endIso) >= now) ?? results[0]
}

/**
 * URL の末尾スラッグに **サイト自身が明記した** 日付が入っている場合に拾う（推測ではない）。
 *   /news/detail_20260901.html      → 2026-09-01（単日）
 *   /blogs/events/sarasa202609      → 2026-09-01〜2026-09-30（サイトが月を明記）
 *   /event/art/56496-1404070828.html→ 末尾が記事ID連番なので採らない（20\d{6} でない）
 */
export function periodFromUrlSlug(url: string): ExplicitPeriod | null {
  let seg = ''
  try {
    const p = new URL(url.trim())
    const segs = p.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    seg = decodeURIComponent(segs[segs.length - 1] ?? '')
  } catch {
    return null
  }
  // YYYYMMDD（前後が数字でない＝連番IDの一部でない）
  const d8 = seg.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])([0-3]\d)(?!\d)/)
  if (d8) {
    const s = iso(Number(d8[1]), Number(d8[2]), Number(d8[3]))
    if (s) return { startIso: s, endIso: s, matched: `URL スラッグの日付 ${d8[0]}` }
  }
  // detail_YYYYMMDD 形式
  const dd = seg.match(/(?:detail_|_)(20\d{2})(0[1-9]|1[0-2])([0-3]\d)/)
  if (dd) {
    const s = iso(Number(dd[1]), Number(dd[2]), Number(dd[3]))
    if (s) return { startIso: s, endIso: s, matched: `URL スラッグの日付 ${dd[0]}` }
  }
  // 末尾 YYYYMM（サイトがイベントの開催月を明記）→ その月の1日〜末日
  const d6 = seg.match(/(?<![\d])(20\d{2})(0[1-9]|1[0-2])$/)
  if (d6) {
    const y = Number(d6[1])
    const m = Number(d6[2])
    const s = iso(y, m, 1)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const e = iso(y, m, last)
    if (s && e) return { startIso: s, endIso: e, matched: `URL スラッグの開催月 ${d6[0]}` }
  }
  return null
}
