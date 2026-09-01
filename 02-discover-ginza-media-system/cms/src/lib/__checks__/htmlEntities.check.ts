import assert from 'node:assert/strict'

import { decodeHtmlEntities, decodeAndNormalizeDisplayText } from '../crawler/htmlEntities'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    // ユーザー必須：&#8211; &amp; &quot;
    name: '&#8211; → – / &amp; → & / &quot; → "',
    fn: () => {
      assert.equal(decodeHtmlEntities('&#8211;'), '–')
      assert.equal(decodeHtmlEntities('&amp;'), '&')
      assert.equal(decodeHtmlEntities('&quot;'), '"')
    },
  },
  {
    name: '今日の実データ「… &#8211; GINZA SIX」を含む混在文字列',
    fn: () => {
      const raw = '【花西子 FLORASIS】新作 洛花飛霞 &#8211; GINZA SIX &amp; GSIX &quot;限定&quot;'
      assert.equal(
        decodeHtmlEntities(raw),
        '【花西子 FLORASIS】新作 洛花飛霞 – GINZA SIX & GSIX "限定"',
      )
    },
  },
  {
    name: '16進数値参照 &#x2013; / &#X2019;',
    fn: () => {
      assert.equal(decodeHtmlEntities('a&#x2013;b'), 'a–b')
      assert.equal(decodeHtmlEntities('It&#X2019;s'), 'It’s')
    },
  },
  {
    name: '名前付き拡張 &ndash; &mdash; &hellip; &rsquo;',
    fn: () => {
      assert.equal(decodeHtmlEntities('a &ndash; b &mdash; c &hellip; d&rsquo;e'), 'a – b — c … d’e')
    },
  },
  {
    name: '未知の名前付き参照はそのまま残す',
    fn: () => {
      assert.equal(decodeHtmlEntities('&nonsense; &foo123;'), '&nonsense; &foo123;')
    },
  },
  {
    name: '二重エスケープ &amp;#8211; はリテラル &#8211; になる（HTML準拠・多重デコードしない）',
    fn: () => {
      assert.equal(decodeHtmlEntities('&amp;#8211;'), '&#8211;')
    },
  },
  {
    name: 'サロゲート／範囲外コードポイントは空へ（クラッシュしない）',
    fn: () => {
      assert.equal(decodeHtmlEntities('x&#xD800;y'), 'xy')
      assert.equal(decodeHtmlEntities('x&#99999999;y'), 'xy')
    },
  },
  {
    name: 'decodeAndNormalizeDisplayText：&nbsp; と連続空白を1つに',
    fn: () => {
      assert.equal(decodeAndNormalizeDisplayText('銀座&nbsp;&nbsp; 蔦屋   書店'), '銀座 蔦屋 書店')
    },
  },
  {
    name: '空文字・非該当はそのまま',
    fn: () => {
      assert.equal(decodeHtmlEntities(''), '')
      assert.equal(decodeHtmlEntities('普通のタイトル'), '普通のタイトル')
    },
  },
]

export const suite = () => runSuite('htmlEntities', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} htmlEntities (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
