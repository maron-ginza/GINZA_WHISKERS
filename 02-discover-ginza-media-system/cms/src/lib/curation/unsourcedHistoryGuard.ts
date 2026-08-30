// Project 02-2 収益化② Tier 1（2026-08-30）：裏付けのない歴史・一般論の検出。
//
// ginza_whiskers 主稿は「銀座の昔・今・未来を紡ぐ編集視点」を担うため、核情報に
// 無い年代・時代・出来事や、出典のない一般化（「日本人は昔から〜」等）を混ぜる
// リスクが最も高い。ここでは決定的（AI呼び出しなし）にマーカーを検出し、その語が
// sourceProvenance の fact / DiscoveredContent の excerpt・title に現れなければ
// 「裏付けなし」として報告する。Editorial Trust Layer「推測で補完しない」の適用。
//
// 9月Trial では hard drop せず WARNING 記録のみ（呼び出し側で扱いを決める）。

const ERA_MARKERS = [
  '明治',
  '大正',
  '昭和',
  '平成',
  '江戸',
  '戦前',
  '戦後',
  '往時',
  '古くから',
  '古来',
  '昔から',
  'かつて',
  '創業以来',
] as const

const GENERALIZATION_MARKERS = [
  '日本人は',
  '日本では昔から',
  '銀座はいつの時代も',
  '誰もが知る',
  '言うまでもなく',
  '周知のとおり',
  '古今東西',
  '老若男女',
] as const

// 「1923年」「昭和40年代」等。3〜4桁 + 「年」または「年代」。
const YEAR_RE = /(\d{3,4})\s*年代?/g
// 「創業125年」「創業 30 年」等。
const FOUNDED_YEARS_RE = /創業\s*(\d{1,4})\s*年/g

export type UnsourcedHistoryKind = 'era' | 'year' | 'founded' | 'generalization'

export interface UnsourcedHistoryHit {
  phrase: string
  kind: UnsourcedHistoryKind
}

export interface UnsourcedHistoryResult {
  hits: UnsourcedHistoryHit[]
}

/**
 * @param bodyTexts  記事本文側（content・editorsNote など）
 * @param backingTexts  裏付けになりうるテキスト（sourceProvenance の fact、DC の excerpt・title）
 */
export function checkUnsourcedHistory(
  bodyTexts: (string | null | undefined)[],
  backingTexts: (string | null | undefined)[],
): UnsourcedHistoryResult {
  const body = bodyTexts.filter(Boolean).join('\n')
  const backing = backingTexts.filter(Boolean).join('\n')
  const hits: UnsourcedHistoryHit[] = []

  for (const marker of ERA_MARKERS) {
    if (body.includes(marker) && !backing.includes(marker)) {
      hits.push({ phrase: marker, kind: 'era' })
    }
  }

  for (const match of body.matchAll(YEAR_RE)) {
    const year = match[1]
    if (!backing.includes(year)) {
      hits.push({ phrase: match[0].trim(), kind: 'year' })
    }
  }

  for (const match of body.matchAll(FOUNDED_YEARS_RE)) {
    if (!backing.includes(match[1])) {
      hits.push({ phrase: match[0].trim(), kind: 'founded' })
    }
  }

  for (const marker of GENERALIZATION_MARKERS) {
    if (body.includes(marker)) {
      hits.push({ phrase: marker, kind: 'generalization' })
    }
  }

  // フレーズ重複を除去（同じ語が content と editorsNote 両方に出た場合など）
  const seen = new Set<string>()
  const deduped = hits.filter((h) => {
    if (seen.has(h.phrase)) return false
    seen.add(h.phrase)
    return true
  })

  return { hits: deduped }
}
