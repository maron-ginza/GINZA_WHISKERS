// TNS週間天気：主ソース（気象庁 週間天気予報）と補助ソース（Open-Meteo）の
// 日別乖離判定（TNS_SPEC.md §5、2026-08-28 気象庁主軸化）。
//
// 通常は気象庁を優先して自動確定する。ここで判定する「乖離」は
// 「人間が念のため見た方がよい日」を機械的に洗い出すためのものであり、
// 生成をブロックしない（呼び出し元が humanReviewRequired フラグとして
// SoundtrackEdition に記録する）。しきい値はすべて定数化してあり、
// 運用実績に応じて調整する。

export interface DivergenceThresholds {
  /** 最高/最低気温差がこの値以上で major */
  tempDiffMajorC: number
  /** 最高/最低気温差がこの値以上 major 未満で minor */
  tempDiffMinorC: number
  /** 降水確率差(pt)がこの値以上で major */
  popDiffMajorPts: number
  /** 降水確率差(pt)がこの値以上 major 未満で minor */
  popDiffMinorPts: number
}

export const DEFAULT_DIVERGENCE_THRESHOLDS: DivergenceThresholds = {
  tempDiffMajorC: 4,
  tempDiffMinorC: 2,
  popDiffMajorPts: 40,
  popDiffMinorPts: 20,
}

// 「降水なし側」／「降水あり側」判定用のキーワード。気象庁・Open-Meteo 双方の
// 日本語ラベル語彙をカバーする（気象庁は「くもり時々晴れ」等の複合ラベル）。
const WET_KEYWORDS = ['雨', '雷', '霧雨', 'にわか雨', 'ひょう', '雪', 'みぞれ']
const DRY_KEYWORDS = ['快晴', '晴']

export function isWetLabel(label: string): boolean {
  return WET_KEYWORDS.some((k) => label.includes(k))
}

/** 明確に「降水なし」と読めるラベルか（晴れ系で、かつ雨系語を含まない）。 */
export function isClearlyDryLabel(label: string): boolean {
  return DRY_KEYWORDS.some((k) => label.includes(k)) && !isWetLabel(label)
}

export interface DivergenceDaySource {
  label: string
  /** 降水確率(%)。気象庁 pops / Open-Meteo precipitation_probability_max。無ければ null */
  pop: number | null
  tempMax: number | null
  tempMin: number | null
  /** 気象庁の信頼度。Open-Meteo 側は null */
  reliability: 'A' | 'B' | 'C' | null
}

export interface DayDivergenceInput {
  date: string
  jma: DivergenceDaySource | null
  openMeteo: DivergenceDaySource | null
}

export type DivergenceLevel = 'none' | 'minor' | 'major'

export interface DayDivergence {
  level: DivergenceLevel
  reasons: string[]
}

function tempDiffReason(kind: '最高' | '最低', a: number | null, b: number | null, th: DivergenceThresholds): { level: DivergenceLevel; reason: string } | null {
  if (a == null || b == null) return null
  const diff = Math.abs(a - b)
  if (diff >= th.tempDiffMajorC) return { level: 'major', reason: `${kind}気温差 ${diff.toFixed(1)}℃（気象庁${a}℃／Open-Meteo${b}℃）` }
  if (diff >= th.tempDiffMinorC) return { level: 'minor', reason: `${kind}気温差 ${diff.toFixed(1)}℃` }
  return null
}

const RANK: Record<DivergenceLevel, number> = { none: 0, minor: 1, major: 2 }

export function classifyDayDivergence(
  input: DayDivergenceInput,
  thresholds: DivergenceThresholds = DEFAULT_DIVERGENCE_THRESHOLDS,
): DayDivergence {
  const { jma, openMeteo } = input
  const reasons: string[] = []
  let level: DivergenceLevel = 'none'
  const bump = (l: DivergenceLevel) => {
    if (RANK[l] > RANK[level]) level = l
  }

  // 気象庁の信頼度は乖離とは別に、常に情報として残す
  if (jma?.reliability === 'C') reasons.push('気象庁 信頼度C（予報確度が低い日）')

  if (!jma || !openMeteo) {
    // 片側が無い日は「乖離」判定の対象外（呼び出し元がフォールバックとして扱う）
    return { level, reasons }
  }

  // 1. 天候カテゴリ反転（晴れ vs 雨・雷）
  const jmaWet = isWetLabel(jma.label) || (jma.pop != null && jma.pop >= 50)
  const omWet = isWetLabel(openMeteo.label)
  const jmaDry = isClearlyDryLabel(jma.label) && (jma.pop == null || jma.pop < 50)
  const omDry = isClearlyDryLabel(openMeteo.label)
  if ((jmaDry && omWet) || (omDry && jmaWet)) {
    bump('major')
    reasons.push(`天候カテゴリ反転：${jma.label}（気象庁）vs ${openMeteo.label}（Open-Meteo）`)
  } else if (jmaWet !== omWet) {
    // 降水有無が食い違う（カテゴリ反転ほど極端でない）
    bump('minor')
    reasons.push(`降水有無の食い違い：${jma.label}（気象庁）vs ${openMeteo.label}（Open-Meteo）`)
  }

  // 2. 降水確率差
  if (jma.pop != null && openMeteo.pop != null) {
    const popDiff = Math.abs(jma.pop - openMeteo.pop)
    if (popDiff >= thresholds.popDiffMajorPts) {
      bump('major')
      reasons.push(`降水確率差 ${popDiff}pt（気象庁${jma.pop}%／Open-Meteo${openMeteo.pop}%）`)
    } else if (popDiff >= thresholds.popDiffMinorPts) {
      bump('minor')
      reasons.push(`降水確率差 ${popDiff}pt`)
    }
  }

  // 3. 気温差
  for (const r of [
    tempDiffReason('最高', jma.tempMax, openMeteo.tempMax, thresholds),
    tempDiffReason('最低', jma.tempMin, openMeteo.tempMin, thresholds),
  ]) {
    if (r) {
      bump(r.level)
      reasons.push(r.reason)
    }
  }

  return { level, reasons }
}
