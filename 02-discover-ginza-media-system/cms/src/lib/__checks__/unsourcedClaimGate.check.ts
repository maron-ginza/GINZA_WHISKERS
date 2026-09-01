import assert from 'node:assert/strict'

import { checkUnsourcedClaims } from '../curation/unsourcedClaimGate'
import { runSuite, type CheckCase } from './_harness'

const NO_BACKING: string[] = ['銀座 蔦屋書店 アートウォール。会期は2026年9月15日まで。']

const cases: CheckCase[] = [
  {
    // ユーザー必須：「9月の銀座は〜の季節」
    name: '「9月の銀座は〜の季節です」→ seasonalGeneralization',
    fn: () => {
      const r = checkUnsourcedClaims(['9月の銀座は、少しずつ秋めいてくる季節です。'], NO_BACKING)
      assert.ok(r.hits.some((h) => h.category === 'seasonalGeneralization'), JSON.stringify(r.hits))
    },
  },
  {
    // ユーザー必須：「平日は空いている」
    name: '「平日は空いている」→ crowdSpeculation',
    fn: () => {
      const r = checkUnsourcedClaims(['平日は空いているので、ゆっくり見られます。'], NO_BACKING)
      assert.ok(r.hits.some((h) => h.category === 'crowdSpeculation'), JSON.stringify(r.hits))
    },
  },
  {
    // ユーザー必須：「作家と話せる」
    name: '「作家と話せる時間でもあります」→ conversationPossibility',
    fn: () => {
      const r = checkUnsourcedClaims(['実演のときは、作家と話せる時間でもあります。'], NO_BACKING)
      assert.ok(r.hits.some((h) => h.category === 'conversationPossibility'), JSON.stringify(r.hits))
    },
  },
  {
    name: '今日の実データ「産地でもそう多くありません」→ regionalGeneralization',
    fn: () => {
      const r = checkUnsourcedClaims(['作り手を間近で見られる機会は、産地でもそう多くありません。'], NO_BACKING)
      assert.ok(r.hits.some((h) => h.category === 'regionalGeneralization'), JSON.stringify(r.hits))
    },
  },
  {
    name: '今日の実データ「秋の夜長に一本」→ seasonalGeneralization',
    fn: () => {
      const r = checkUnsourcedClaims(['秋の夜長に一本、少し変わった日本酒の話を。'], NO_BACKING)
      assert.ok(r.hits.some((h) => h.category === 'seasonalGeneralization'), JSON.stringify(r.hits))
    },
  },
  {
    name: '裏付けあり：出典に「在廊」→ conversationPossibility は取り下げ',
    fn: () => {
      const r = checkUnsourcedClaims(
        ['作家と話せる時間でもあります。'],
        ['九谷焼作家：上端 伸也 氏 全日在廊'],
      )
      assert.equal(r.hits.filter((h) => h.category === 'conversationPossibility').length, 0, JSON.stringify(r.hits))
    },
  },
  {
    name: '裏付けあり：出典に「混雑」→ crowdSpeculation は取り下げ',
    fn: () => {
      const r = checkUnsourcedClaims(
        ['土日は混雑が予想されます。'],
        ['初日は混雑のため入場制限あり'],
      )
      assert.equal(r.hits.filter((h) => h.category === 'crowdSpeculation').length, 0, JSON.stringify(r.hits))
    },
  },
  {
    name: '事実だけの本文（会期・会場・価格）→ ヒットなし',
    fn: () => {
      const r = checkUnsourcedClaims(
        ['銀座 蔦屋書店で2026年8月28日から9月15日まで開催。720ml 2,830円（税込）。'],
        NO_BACKING,
      )
      assert.equal(r.hits.length, 0, JSON.stringify(r.hits))
    },
  },
  {
    name: 'mode:block → blocked=true',
    fn: () => {
      const r = checkUnsourcedClaims(['9月の銀座は秋めく季節です。'], NO_BACKING, { mode: 'block' })
      assert.equal(r.blocked, true)
    },
  },
  {
    name: '既定（warn）→ blocked=false（hits はある）',
    fn: () => {
      const r = checkUnsourcedClaims(['9月の銀座は秋めく季節です。'], NO_BACKING)
      assert.equal(r.blocked, false)
      assert.ok(r.hits.length > 0)
    },
  },
]

export const suite = () => runSuite('unsourcedClaimGate', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} unsourcedClaimGate (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
