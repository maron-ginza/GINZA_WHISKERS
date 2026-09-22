// GINZA WHISKERS / Project 02（2026-09-22）— getPayloadWithRetry の回帰テスト。
// 2026-09-22 6:00の自動巡回で発生した「dev-pushの一過性DROP CONSTRAINT競合が
// 原因でcrawlSources.tsが失敗したにもかかわらずsummary.jsonがstatus:okになった」
// 事象の再発防止策の一部。
//
// getPayloadWithRetry は非同期のため、このプロジェクトの素の同期ハーネス
// （_harness.ts の runSuite/CheckCase は `fn: () => void` 同期専用）では
// 直接テストできない。factVerification.check.ts の runFetchOutcomeTests と
// 同じ「run-all.ts 側でawaitして個別に集計する非同期テスト関数」の
// 既存パターンに倣う（run-all.ts の1箇所だけを最小追記）。
//
//   node --import=tsx/esm src/lib/util/getPayloadWithRetry.check.ts

import { getPayloadWithRetry } from './getPayloadWithRetry'

function dropConstraintRaceError(): Error {
  return new Error(
    'DrizzleQueryError: Failed query: ALTER TABLE "_article_editorial_provenance_v" DROP CONSTRAINT ' +
      '"_article_editorial_provenance_v_discovered_content_source_id_di"; ' +
      'cause: constraint "..." of relation "_article_editorial_provenance_v" does not exist',
  )
}

export async function runGetPayloadWithRetryTests(): Promise<{ pass: number; fail: number; failures: string[] }> {
  const failures: string[] = []
  let pass = 0
  const check = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
      pass++
    } catch (e) {
      failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await check('初回で成功する場合はそのまま結果を返す（再試行しない）', async () => {
    let calls = 0
    const result = await getPayloadWithRetry(async () => {
      calls++
      return { ok: true }
    })
    if (calls !== 1) throw new Error(`loadFnは1回だけ呼ばれるはず（実際 ${calls}回）`)
    if (result.ok !== true) throw new Error('結果がそのまま返るはず')
  })

  await check('DROP CONSTRAINT競合エラーは既定retries内で1回リトライし成功する', async () => {
    let calls = 0
    let slept = 0
    const result = await getPayloadWithRetry(
      async () => {
        calls++
        if (calls === 1) throw dropConstraintRaceError()
        return { ok: true, attempt: calls }
      },
      { sleep: async () => { slept++ } },
    )
    if (calls !== 2) throw new Error(`1回失敗→2回目で成功のはず（実際 ${calls}回）`)
    if (slept !== 1) throw new Error(`リトライ前に1回だけ待機するはず（実際 ${slept}回）`)
    if (result.ok !== true || result.attempt !== 2) throw new Error('2回目の結果が返るはず')
  })

  await check('DROP CONSTRAINT競合エラーがretries回数を超えて続く場合は最後のエラーをthrowする', async () => {
    let calls = 0
    let threw: unknown = null
    try {
      await getPayloadWithRetry(
        async () => {
          calls++
          throw dropConstraintRaceError()
        },
        { retries: 2, sleep: async () => {} },
      )
    } catch (err) {
      threw = err
    }
    if (calls !== 3) throw new Error(`retries:2 なら計3回試行するはず（実際 ${calls}回）`)
    if (!(threw instanceof Error) || !threw.message.includes('DROP CONSTRAINT')) {
      throw new Error('最後の試行のエラーがそのままthrowされるはず')
    }
  })

  await check('DROP CONSTRAINT競合以外のエラーは即座にthrowし、再試行しない', async () => {
    let calls = 0
    let slept = 0
    let threw: unknown = null
    try {
      await getPayloadWithRetry(
        async () => {
          calls++
          throw new Error('ECONNREFUSED: connection refused')
        },
        { sleep: async () => { slept++ } },
      )
    } catch (err) {
      threw = err
    }
    if (calls !== 1) throw new Error(`対象外エラーは即throw・1回しか呼ばれないはず（実際 ${calls}回）`)
    if (slept !== 0) throw new Error('対象外エラーでは待機しないはず')
    if (!(threw instanceof Error) || !threw.message.includes('ECONNREFUSED')) {
      throw new Error('元のエラーがそのままthrowされるはず')
    }
  })

  await check('「DROP CONSTRAINT」を含むが「does not exist」を含まないエラーは対象外として即throwする', async () => {
    let calls = 0
    try {
      await getPayloadWithRetry(
        async () => {
          calls++
          throw new Error('ALTER TABLE ... DROP CONSTRAINT ...: permission denied')
        },
        { sleep: async () => {} },
      )
      throw new Error('ここに到達しないはず')
    } catch (e) {
      if (e instanceof Error && e.message === 'ここに到達しないはず') throw e
      // 期待どおりthrowされた
    }
    if (calls !== 1) throw new Error(`両方の条件を満たさないエラーは対象外のはず（実際 ${calls}回）`)
  })

  return { pass, fail: failures.length, failures }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void (async () => {
    const r = await runGetPayloadWithRetryTests()
    console.log(`[${r.fail === 0 ? 'PASS' : 'FAIL'}] getPayloadWithRetry  (${r.pass} passed, ${r.fail} failed)`)
    for (const f of r.failures) console.log('  ✗ ' + f)
    process.exit(r.fail === 0 ? 0 : 1)
  })()
}
