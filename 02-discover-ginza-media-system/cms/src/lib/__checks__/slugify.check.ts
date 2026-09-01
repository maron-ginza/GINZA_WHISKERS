import assert from 'node:assert/strict'

import { slugify } from '../ai/slugify'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    name: '今日の実データ：HTML参照・角括弧タグ・施設ボイラープレートを除去',
    fn: () => {
      const raw =
        '【花西子 FLORASIS】新作 洛花飛霞 チークで自然な血色感を。 &#8211; GINZA SIX | GSIX | ギンザ シックス | 銀座シックス'
      const s = slugify(raw)
      assert.ok(!s.includes('&#8211;'), s)
      assert.ok(!s.includes('&'), s)
      assert.ok(!/GINZA SIX|GSIX|ギンザ シックス|銀座シックス/.test(s), s)
      assert.ok(!s.includes('【') && !s.includes('】'), s)
      assert.ok(s.includes('洛花飛霞'), s)
      assert.ok(!/\s/.test(s), `空白が残っている: ${s}`)
    },
  },
  {
    name: '「上端伸也 個展 | GINZA OFFICIALおすすめニュース | お知らせ・新着情報」→ 先頭のみ残す',
    fn: () => {
      const s = slugify('上端伸也 個展 | GINZA OFFICIALおすすめニュース | お知らせ・新着情報 | GINZA OFFICIAL – 銀座公式ウェブサイト')
      assert.equal(s, '上端伸也-個展', s)
    },
  },
  {
    name: 'AMBUSH® x New Era® &#8211; GINZA SIX → 記号・実体参照・施設名を除去',
    fn: () => {
      const s = slugify('AMBUSH® x New Era® &#8211; GINZA SIX | GSIX | ギンザ シックス | 銀座シックス')
      assert.ok(!s.includes('&#8211;'))
      assert.ok(!/GINZA SIX|GSIX/.test(s))
      assert.ok(s.startsWith('AMBUSH'), s)
    },
  },
  {
    name: 'ダッシュ類（–—―ー〜）はハイフンへ / 連続ハイフンは1つ',
    fn: () => {
      const s = slugify('銀座で辿る、ある画家の「過去と現在」——永井博フェア')
      assert.ok(!/[–—―〜]/.test(s), s)
      assert.ok(!/--/.test(s), s)
      assert.ok(!/^-|-$/.test(s), s)
    },
  },
  {
    name: '区切りが無い普通のタイトルはそのまま（空白のみハイフン化）',
    fn: () => {
      assert.equal(slugify('九谷焼の絵付けを、目の前で'), '九谷焼の絵付けを-目の前で')
    },
  },
  {
    name: 'maxLength でカット、末尾ハイフンは残さない',
    fn: () => {
      const s = slugify('あ'.repeat(200), { maxLength: 10 })
      assert.equal([...s].length, 10)
      assert.ok(!s.endsWith('-'))
    },
  },
  {
    name: '空文字 → 空文字',
    fn: () => {
      assert.equal(slugify(''), '')
    },
  },
]

export const suite = () => runSuite('slugify', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} slugify (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
