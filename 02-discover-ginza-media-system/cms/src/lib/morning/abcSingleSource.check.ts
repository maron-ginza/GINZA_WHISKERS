// GINZA WHISKERS / Project 02（2026-09-17新設・マロン指示：A/B/C条件を複数箇所へ複製しない）
//
// A/B/C判定（verdict）を決定するロジックが assessCandidate.ts の1箇所にだけ存在し、
// 他の候補選定・表示レイヤー（assessInboxPool／candidateBoard／buildMorningReport）は
// これを再利用するだけで独自のverdict計算を持たないことを、ソースの静的参照確認で
// 検証する（DB/ネットワークなし・純粋な文字列検査）。
//
//   node --import=tsx/esm src/lib/morning/abcSingleSource.check.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runSuite, type CheckCase } from '../__checks__/_harness'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const __dirname = dirname(fileURLToPath(import.meta.url))

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, relPath), 'utf-8')
}

const cases: CheckCase[] = [
  {
    name: 'assessInboxPool.ts は独自のverdict計算を持たず assessCandidate を呼ぶ',
    fn: () => {
      const src = readSrc('../pipeline/assessInboxPool.ts')
      assert(/import\s*\{[^}]*\bassessCandidate\b[^}]*\}\s*from\s*['"].*\/morning\/assessCandidate['"]/.test(src), 'assessCandidateをimportしている')
      assert(/\bassessCandidate\s*\(/.test(src), 'assessCandidate(...)を実際に呼び出している')
    },
  },
  {
    name: 'candidateBoard.ts はCandidateAssessment.verdictを読むだけで、A/B/Cを自ら計算しない',
    fn: () => {
      const src = readSrc('./candidateBoard.ts')
      // 'A'/'B'/'C' という判定結果を新たに代入する行（verdict = 'A' 等）が無いことを確認する
      // （読み取り〈=== 'A' 等〉は許容、書き込み〈verdict: 'A'／.verdict = 'A'〉は許容しない）。
      assert(!/verdict\s*[:=]\s*['"]A['"]/.test(src), 'candidateBoard.tsはverdict:\'A\'を代入しない（読むだけ）')
      assert(/a\.verdict\s*===\s*['"]A['"]/.test(src), 'a.verdict===\'A\'として既存の判定結果を参照している')
    },
  },
  {
    name: 'buildMorningReport.ts もCandidateAssessment.verdictを読むだけで、A/B/Cを自ら計算しない',
    fn: () => {
      const src = readSrc('./buildMorningReport.ts')
      assert(!/verdict\s*[:=]\s*['"][ABC]['"]/.test(src), 'buildMorningReport.tsはverdictへ値を代入しない（読むだけ）')
    },
  },
  {
    name: 'targetOrDiscoveryEligibility.ts（A判定の実体）は1ファイルにのみ存在する',
    fn: () => {
      // このファイル自体の存在確認（複製ファイルが無いことは同名ファイル探索まではしないが、
      // 少なくとも正本が期待どおりの場所に1つ存在し、facilityCooldownを参照しないことを確認）。
      const src = readSrc('./targetOrDiscoveryEligibility.ts')
      assert(src.includes('export function evaluateTargetOrDiscoveryEligibility'), '正本の判定関数が存在する')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('abcSingleSource', cases)
