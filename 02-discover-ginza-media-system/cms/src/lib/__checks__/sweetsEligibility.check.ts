import assert from 'node:assert/strict'

import { evaluateSweetsEligibility } from '../curation/sweetsEligibility'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    name: '必須5項目クリア・終了済みでない・銀座関連性あり・重複なし → eligible',
    fn: () => {
      const r = evaluateSweetsEligibility(
        { expired: false, ginzaRelevant: true, duplicate: false },
        { requiredMissing: [] },
      )
      assert.equal(r.eligible, true)
      assert.deepEqual(r.reasons, [])
    },
  },
  {
    name: '終了済み → 除外（受入条件の4分類の一つ）',
    fn: () => {
      const r = evaluateSweetsEligibility(
        { expired: true, ginzaRelevant: true, duplicate: false },
        { requiredMissing: [] },
      )
      assert.equal(r.eligible, false)
      assert.ok(r.reasons.includes('expired'), JSON.stringify(r))
    },
  },
  {
    name: '銀座での販売未確認（ginzaRelevant:false） → 除外',
    fn: () => {
      const r = evaluateSweetsEligibility(
        { expired: false, ginzaRelevant: false, duplicate: false },
        { requiredMissing: [] },
      )
      assert.equal(r.eligible, false)
      assert.ok(r.reasons.includes('not_ginza'), JSON.stringify(r))
    },
  },
  {
    name: '重複（duplicate:true） → 除外',
    fn: () => {
      const r = evaluateSweetsEligibility(
        { expired: false, ginzaRelevant: true, duplicate: true },
        { requiredMissing: [] },
      )
      assert.equal(r.eligible, false)
      assert.ok(r.reasons.includes('duplicate'), JSON.stringify(r))
    },
  },
  {
    // 2026-09-14 再発防止の直接の契機：CAFE PAULISTA等のunknown_type/unknown_factkind
    // （記事生成テンプレート判別に使う一般ゲート）は SWEETS の除外理由にしない。
    name: 'unknown_type/unknown_factkind/verdict_c/no_titleはSWEETSの除外理由に含まれない',
    fn: () => {
      // このゲートはそもそも verdict_c 等の入力を受け取らない設計——
      // 型シグネチャ上、渡しようがないことを確認する（expired/ginzaRelevant/duplicateのみ）
      const r = evaluateSweetsEligibility(
        { expired: false, ginzaRelevant: true, duplicate: false },
        { requiredMissing: [] },
      )
      assert.equal(r.eligible, true)
      assert.ok(!r.reasons.some((x) => ['verdict_c', 'unknown_type', 'unknown_factkind', 'no_title'].includes(x)))
    },
  },
  {
    name: 'officialCompletenessのrequiredMissingがあれば除外し、そのまま理由に含める',
    fn: () => {
      const r = evaluateSweetsEligibility(
        { expired: false, ginzaRelevant: true, duplicate: false },
        { requiredMissing: ['商品名・企画名', '出典確認日'] },
      )
      assert.equal(r.eligible, false)
      assert.deepEqual(r.reasons, ['商品名・企画名', '出典確認日'])
    },
  },
  {
    name: '複数の除外理由が同時に成立する場合はすべて記録する',
    fn: () => {
      const r = evaluateSweetsEligibility(
        { expired: true, ginzaRelevant: false, duplicate: true },
        { requiredMissing: ['内容'] },
      )
      assert.equal(r.eligible, false)
      assert.deepEqual(r.reasons, ['expired', 'not_ginza', 'duplicate', '内容'])
    },
  },
]

export const suite = () => runSuite('sweetsEligibility', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} sweetsEligibility (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
