import assert from 'node:assert/strict'

import { checkRecurringEventYearClaim } from '../curation/recurringEventYearGuard'
import { runSuite, type CheckCase } from './_harness'

const NOW = new Date('2026-09-13T00:00:00+09:00')

const cases: CheckCase[] = [
  {
    // 再発防止の直接の契機：銀茶会2026が未公開のまま2025年情報が残っているケース。
    name: '銀茶会：本文に2025年しか明記が無ければ ok:false（2026年候補として扱わない）',
    fn: () => {
      const r = checkRecurringEventYearClaim(
        {
          sourceName: '銀座通連合会（銀茶会）',
          sourceUrl: 'https://ginchakai.ginza.jp/',
          title: '銀茶会2025 第23回',
          eventPeriod: '2025年10月4日〜10月5日',
        },
        { now: NOW },
      )
      assert.equal(r.ok, false, JSON.stringify(r))
      assert.ok(r.reason?.includes('2026'), r.reason ?? 'null')
    },
  },
  {
    name: '銀茶会：本文に2026年の明記があれば ok:true',
    fn: () => {
      const r = checkRecurringEventYearClaim(
        {
          sourceName: '銀座通連合会（銀茶会）',
          sourceUrl: 'https://ginchakai.ginza.jp/',
          title: '銀茶会2026 第24回',
          eventPeriod: '2026年10月3日〜10月4日',
        },
        { now: NOW },
      )
      assert.equal(r.ok, true, JSON.stringify(r))
      assert.equal(r.reason, null)
    },
  },
  {
    name: '銀茶会：年の明記が本文に一切無ければ ok:false（推測で今年と判断しない）',
    fn: () => {
      const r = checkRecurringEventYearClaim(
        { sourceName: '銀茶会', sourceUrl: 'https://ginchakai.ginza.jp/', title: '銀茶会のご案内', eventPeriod: '10月上旬開催' },
        { now: NOW },
      )
      assert.equal(r.ok, false, JSON.stringify(r))
    },
  },
  {
    name: '対象パターン外の通常候補は常に ok:true（無関係な情報源に影響しない）',
    fn: () => {
      const r = checkRecurringEventYearClaim(
        { sourceName: 'GINZA SIX', sourceUrl: 'https://ginza6.tokyo/', title: 'アイガトー案内', eventPeriod: '公式記載なし' },
        { now: NOW },
      )
      assert.equal(r.ok, true, JSON.stringify(r))
    },
  },
  {
    name: '英語表記 ginchakai を含むURLでも検出する',
    fn: () => {
      const r = checkRecurringEventYearClaim(
        { sourceName: 'Ginza Street Association', sourceUrl: 'https://www.ginchakai.ginza.jp/en/', title: 'Ginchakai 2025', eventPeriod: null },
        { now: NOW },
      )
      assert.equal(r.ok, false, JSON.stringify(r))
    },
  },
]

export const suite = () => runSuite('recurringEventYearGuard', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} recurringEventYearGuard (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
