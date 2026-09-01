import assert from 'node:assert/strict'

import { computeEventTiming } from '../curation/eventTiming'
import { checkEventTimingClaims } from '../curation/eventTimingClaimGate'
import { runSuite, type CheckCase } from './_harness'

// 2026-08-28 開始 / 2026-09-15 終了 / 2026-09-01 確認（経過4日・残り14日・全18日）
const timing = computeEventTiming(
  '2026-08-28T00:00:00+00:00',
  '2026-09-15T00:00:00+00:00',
  new Date('2026-09-01T09:00:00+09:00'),
)

const cases: CheckCase[] = [
  {
    name: '今日の実誤り「開幕から2週間が過ぎ」→ mismatch（計算値は4日）',
    fn: () => {
      const r = checkEventTimingClaims('開幕から2週間が過ぎ、会期の折り返しが近い。', timing)
      const codes = r.hits.map((h) => h.code)
      assert.ok(codes.includes('timingClaimMismatch'), JSON.stringify(r.hits))
      assert.ok(r.hits.some((h) => h.phrase.includes('2週間')))
    },
  },
  {
    name: '今日の実誤り「会期はあと半分です」→ mismatch（経過22%）',
    fn: () => {
      const r = checkEventTimingClaims('会期はあと半分です。', timing)
      assert.ok(r.hits.some((h) => h.code === 'timingClaimMismatch' && h.phrase.includes('半分')), JSON.stringify(r.hits))
    },
  },
  {
    name: '正しい記述「開催から4日」→ ヒットなし',
    fn: () => {
      const r = checkEventTimingClaims('開催から4日、まだ会期序盤です。', timing)
      assert.equal(r.hits.length, 0, JSON.stringify(r.hits))
    },
  },
  {
    name: '「残り14日」→ ヒットなし / 「残り3日」→ mismatch',
    fn: () => {
      assert.equal(checkEventTimingClaims('会期は残り14日。', timing).hits.length, 0)
      const bad = checkEventTimingClaims('会期は残り3日。', timing)
      assert.ok(bad.hits.some((h) => h.code === 'timingClaimMismatch'))
    },
  },
  {
    name: '日付不明 + 相対表現 → timingClaimUnverifiable',
    fn: () => {
      const unknown = computeEventTiming(null, null, new Date('2026-09-01T00:00:00+09:00'))
      const r = checkEventTimingClaims('開幕から2週間が過ぎ、会期はあと半分です。', unknown)
      assert.ok(r.hits.length >= 2)
      assert.ok(r.hits.every((h) => h.code === 'timingClaimUnverifiable'))
    },
  },
  {
    name: '「あとわずか」だが残り14日 → mismatch',
    fn: () => {
      const r = checkEventTimingClaims('会期はあとわずか。', timing)
      assert.ok(r.hits.some((h) => h.code === 'timingClaimMismatch'))
    },
  },
  {
    name: '相対表現を含まない本文 → ヒットなし',
    fn: () => {
      const r = checkEventTimingClaims('会期は2026年9月15日まで。銀座 蔦屋書店で開催中。', timing)
      assert.equal(r.hits.length, 0, JSON.stringify(r.hits))
    },
  },
]

export const suite = () => runSuite('eventTimingClaimGate', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} eventTimingClaimGate (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
