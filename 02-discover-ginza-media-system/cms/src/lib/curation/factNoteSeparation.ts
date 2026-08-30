// Project 02-2 収益化② Tier 1（2026-08-30）：Fact と EDITOR'S NOTE の混同検出。
//
// editorsNote は「なぜ GINZA WHISKERS がこれを選んだか / 読者に提示したい新しい
// 銀座の見方」だけを書く場所であり、日付・料金・時刻・会期などの事実情報は
// content / whyNow / sourceProvenance にのみ置く（CLAUDE.md 第8章 Editorial Style
// Engine 項目9、Editorial Trust Layer 項目4）。ここでは決定的（AI呼び出しなし）に
// (1) editorsNote への事実情報の混入、(2) editorsNote が content の言い換えに
// なっていないか、を判定する。9月Trial では WARNING 記録のみ。

import { computeCharBigramJaccardSimilarity } from './textSimilarity'

// editorsNote に現れてはいけない「事実情報」パターン。
const FACT_LEAK_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '年月日', re: /\d{3,4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?/ },
  { label: '月日', re: /\d{1,2}\s*月\s*\d{1,2}\s*日/ },
  { label: '価格(¥)', re: /[¥￥]\s?\d/ },
  { label: '価格(円)', re: /\d+\s*円/ },
  { label: '時刻', re: /\d{1,2}\s*[:：]\s*\d{2}/ },
  { label: '時刻(時分)', re: /\d{1,2}\s*時(?:\s*\d{1,2}\s*分)?/ },
  { label: '予約・料金要否', re: /入場(?:料|無料|券)|前売(?:券)?|当日券|予約(?:制|不要|必要|受付)/ },
]

export interface FactNoteSeparationResult {
  /** editorsNote に事実情報が混入している */
  factLeak: boolean
  /** 混入していた具体パターン（最大3件） */
  leakedSamples: string[]
  /** editorsNote が content+whyNow の言い換えとみなせる（類似度がしきい値以上） */
  restatesContent: boolean
  /** editorsNote と content+whyNow の char-bigram 類似度 */
  similarity: number
}

export function checkFactNoteSeparation(
  editorsNote: string | null | undefined,
  contentPlusWhyNow: string,
  restateSimThreshold: number,
): FactNoteSeparationResult {
  const note = (editorsNote ?? '').trim()

  const leaked: string[] = []
  for (const { label, re } of FACT_LEAK_PATTERNS) {
    const m = note.match(re)
    if (m) leaked.push(`${label}: "${m[0].trim()}"`)
  }

  const similarity = note
    ? Number(computeCharBigramJaccardSimilarity(note, contentPlusWhyNow).toFixed(3))
    : 0

  return {
    factLeak: leaked.length > 0,
    leakedSamples: leaked.slice(0, 3),
    restatesContent: similarity >= restateSimThreshold,
    similarity,
  }
}
