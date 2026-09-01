// 再発防止 #1〜#4（2026-09-01 Trial）の回帰テスト用・最小ハーネス。
//
// このプロジェクトには vitest / jest が導入されておらず、package.json は現在
// 未コミット差分があり触れない方針のため、`node --import=tsx/esm` で直接実行できる
// 素の check スクリプトとして用意する（従来の「使い捨てユニット検証」を
// コミット可能な形にしたもの）。
//
//   実行例:
//     node --import=tsx/esm src/lib/__checks__/run-all.ts
//     node --import=tsx/esm src/lib/__checks__/htmlEntities.check.ts

export interface CheckCase {
  name: string
  fn: () => void
}

export interface SuiteResult {
  suite: string
  pass: number
  fail: number
  failures: string[]
}

export function runSuite(suite: string, cases: CheckCase[]): SuiteResult {
  let pass = 0
  let fail = 0
  const failures: string[] = []
  for (const c of cases) {
    try {
      c.fn()
      pass++
    } catch (err) {
      fail++
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${suite} › ${c.name}\n    ${msg.replace(/\n/g, '\n    ')}`)
    }
  }
  return { suite, pass, fail, failures }
}

export function reportAndExit(results: SuiteResult[]): void {
  let totalPass = 0
  let totalFail = 0
  for (const r of results) {
    totalPass += r.pass
    totalFail += r.fail
    const mark = r.fail === 0 ? 'PASS' : 'FAIL'
    console.log(`[${mark}] ${r.suite}  (${r.pass} passed, ${r.fail} failed)`)
  }
  if (totalFail > 0) {
    console.log('\n--- Failures ---')
    for (const r of results) for (const f of r.failures) console.log(`  ✗ ${f}`)
  }
  console.log(`\nTOTAL: ${totalPass} passed, ${totalFail} failed`)
  process.exit(totalFail > 0 ? 1 : 0)
}
