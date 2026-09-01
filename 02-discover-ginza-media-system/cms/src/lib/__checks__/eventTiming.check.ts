import assert from 'node:assert/strict'

import { computeEventTiming, formatTimingForPrompt } from '../curation/eventTiming'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    // ユーザー必須ケース：2026-08-28 開始、2026-09-01 確認 ＝ 経過4日
    name: '2026-08-28開始 / 2026-09-01確認 → 経過4日',
    fn: () => {
      const t = computeEventTiming('2026-08-28T00:00:00+00:00', '2026-09-15T00:00:00+00:00', new Date('2026-09-01T09:00:00+09:00'))
      assert.equal(t.daysSinceStart, 4, `daysSinceStart=${t.daysSinceStart}`)
      assert.equal(t.daysUntilEnd, 14, `daysUntilEnd=${t.daysUntilEnd}`)
      assert.equal(t.totalDays, 18, `totalDays=${t.totalDays}`)
      assert.ok(t.elapsedFraction !== null && Math.abs(t.elapsedFraction - 4 / 18) < 1e-9)
      assert.equal(t.phase, 'early')
    },
  },
  {
    name: 'now == 開始日 → 経過0日 / early',
    fn: () => {
      const t = computeEventTiming('2026-09-01T00:00:00+00:00', '2026-09-10T00:00:00+00:00', new Date('2026-09-01T20:00:00+09:00'))
      assert.equal(t.daysSinceStart, 0)
      assert.equal(t.daysUntilEnd, 9)
      assert.equal(t.phase, 'early')
    },
  },
  {
    name: 'now == 終了日 → 残り0日 / late（未 ended）',
    fn: () => {
      const t = computeEventTiming('2026-09-01T00:00:00+00:00', '2026-09-10T00:00:00+00:00', new Date('2026-09-10T10:00:00+09:00'))
      assert.equal(t.daysUntilEnd, 0)
      assert.equal(t.phase, 'late')
    },
  },
  {
    name: '終了後 → phase=ended',
    fn: () => {
      const t = computeEventTiming('2026-08-01T00:00:00+00:00', '2026-08-20T00:00:00+00:00', new Date('2026-09-01T00:00:00+09:00'))
      assert.equal(t.phase, 'ended')
      assert.ok((t.daysUntilEnd ?? 0) < 0)
    },
  },
  {
    name: '開始前 → phase=not_started / daysSinceStart 負値',
    fn: () => {
      const t = computeEventTiming('2026-09-10T00:00:00+00:00', '2026-09-20T00:00:00+00:00', new Date('2026-09-01T00:00:00+09:00'))
      assert.equal(t.phase, 'not_started')
      assert.ok((t.daysSinceStart ?? 0) < 0)
    },
  },
  {
    name: '単日イベント（start == end）',
    fn: () => {
      const t = computeEventTiming('2026-09-05T00:00:00+00:00', '2026-09-05T00:00:00+00:00', new Date('2026-09-01T00:00:00+09:00'))
      assert.equal(t.totalDays, 0)
      assert.equal(t.elapsedFraction, null)
      assert.equal(t.phase, 'not_started')
    },
  },
  {
    name: '日付不明 → phase=unknown / 各数値 null',
    fn: () => {
      const t = computeEventTiming(null, undefined, new Date('2026-09-01T00:00:00+09:00'))
      assert.equal(t.daysSinceStart, null)
      assert.equal(t.daysUntilEnd, null)
      assert.equal(t.totalDays, null)
      assert.equal(t.phase, 'unknown')
    },
  },
  {
    name: 'formatTimingForPrompt：数値がある項目のみ / 自己計算禁止の注記付き',
    fn: () => {
      const t = computeEventTiming('2026-08-28T00:00:00+00:00', '2026-09-15T00:00:00+00:00', new Date('2026-09-01T09:00:00+09:00'))
      const s = formatTimingForPrompt(t)
      assert.ok(s.includes('経過: 4日'))
      assert.ok(s.includes('残り: 14日'))
      assert.ok(s.includes('自分で計算しない'))
    },
  },
  {
    name: 'formatTimingForPrompt：日付不明なら「書かないこと」を明示',
    fn: () => {
      const s = formatTimingForPrompt(computeEventTiming(null, null, new Date()))
      assert.ok(s.includes('不明'))
      assert.ok(s.includes('書かない'))
    },
  },
]

export const suite = () => runSuite('eventTiming', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} eventTiming (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
