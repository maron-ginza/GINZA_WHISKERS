import assert from 'node:assert/strict'

import { evaluateSweetsNewsworthiness } from '../curation/sweetsNewsworthiness'
import { runSuite, type CheckCase } from './_harness'

const NOW = new Date('2026-09-13T00:00:00+09:00')

const cases: CheckCase[] = [
  {
    // 再発防止の直接の契機：DC#1132・#1134型の事務告知
    name: '消費期限シール変更・価格改定・休業案内は administrative（除外）',
    fn: () => {
      const a = evaluateSweetsNewsworthiness({ title: '2026.02.25 どら焼きの消費期限シール変更について' }, { now: NOW })
      assert.equal(a.category, 'administrative')
      assert.ok(a.matchedAdministrative.length > 0)

      const b = evaluateSweetsNewsworthiness({ title: '価格改定のお知らせ' }, { now: NOW })
      assert.equal(b.category, 'administrative')

      const c = evaluateSweetsNewsworthiness({ title: 'オンラインショップ 夏季休業日のお知らせ' }, { now: NOW })
      assert.equal(c.category, 'administrative')
    },
  },
  {
    name: '新商品・季節限定・フェア・銀座店限定・リニューアル等の新規性語は timely',
    fn: () => {
      for (const title of [
        '【秋季限定】栗とはちみつのパウンドケーキ',
        '今年も「修道院のお菓子フェア」がスタートいたします！！',
        '銀座本店限定 新作チョコレート',
        'リニューアルオープンのご案内',
        '≪銀座本店フルーツパーラー≫“ピーチパフェ”登場',
      ]) {
        const r = evaluateSweetsNewsworthiness({ title }, { now: NOW })
        assert.equal(r.category, 'timely', `title="${title}" → ${r.category}`)
        assert.ok(r.matchedNovelty.length > 0, `title="${title}" にnoveltyが無い`)
      }
    },
  },
  {
    name: 'タイトル先頭の日付表記（YYYY.MM.DD）から公開日を抽出し30日以内ならtimely・優先窓内',
    fn: () => {
      const r = evaluateSweetsNewsworthiness({ title: '2026.09.10 【手土産の定番】銀座ピエス・モンテの上質なマドレーヌ' }, { now: NOW })
      assert.equal(r.category, 'timely')
      assert.equal(r.daysSincePublished, 2)
      assert.equal(r.withinPreferredWindow, true)
    },
  },
  {
    name: '日付は確認できるが30日超なら timely のまま（優先度は下がる旨をreasonに記録）',
    fn: () => {
      const r = evaluateSweetsNewsworthiness({ title: '2026.04.22 松屋銀座にて「ミッフィーどら焼き」販売' }, { now: NOW })
      assert.equal(r.category, 'timely')
      assert.equal(r.withinPreferredWindow, false)
      assert.ok(r.reason.includes('30日超'))
    },
  },
  {
    name: '新規性語なし・公開日不明の常設商品は evergreen（定番候補、朝刊候補に混ぜない）',
    fn: () => {
      const r = evaluateSweetsNewsworthiness({ title: 'トリュフケーキ＆ガトー・オ・マロン', excerpt: '通年販売のケーキです。' }, { now: NOW })
      assert.equal(r.category, 'evergreen')
    },
  },
  {
    name: 'publishedOrUpdatedAtが明示指定されていればタイトル日付より優先して使う',
    fn: () => {
      const r = evaluateSweetsNewsworthiness(
        { title: '通常商品名', publishedOrUpdatedAt: '2026-09-01T00:00:00+09:00' },
        { now: NOW },
      )
      assert.equal(r.category, 'timely')
      assert.equal(r.daysSincePublished, 12)
    },
  },
  {
    name: 'administrativeはnoveltyや日付より優先して判定される（同時に該当しても除外）',
    fn: () => {
      const r = evaluateSweetsNewsworthiness(
        { title: '2026.09.01 【新商品】価格改定のお知らせ' },
        { now: NOW },
      )
      assert.equal(r.category, 'administrative')
    },
  },
]

export const suite = () => runSuite('sweetsNewsworthiness', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} sweetsNewsworthiness (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
