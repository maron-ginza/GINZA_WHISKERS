import assert from 'node:assert/strict'

import {
  normalizeFloorTokens,
  hasBasementFloor,
  detectBasementFloorDrop,
} from '../crawler/normalizeVenueText'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    name: 'B1F / B2F / B3F は先頭Bを保持（冪等）',
    fn: () => {
      for (const f of ['B1F', 'B2F', 'B3F']) {
        assert.equal(normalizeFloorTokens(`GINZA SIX ${f} 益や`), `GINZA SIX ${f} 益や`)
        assert.equal(normalizeFloorTokens(normalizeFloorTokens(f)), f)
      }
    },
  },
  {
    name: '全角 Ｂ２Ｆ / 空白ゆれ「B 2 F」→ B2F へ正規化',
    fn: () => {
      assert.equal(normalizeFloorTokens('Ｂ２Ｆ「益や」'), 'B2F「益や」')
      assert.equal(normalizeFloorTokens('地下 B 2 F'), '地下 B2F')
      assert.equal(normalizeFloorTokens('Ｂ１Ｆ／Ｂ３Ｆ'), 'B1F／B3F')
    },
  },
  {
    name: '地上階「2F」は変更しない / 「地下2階」は変換しない',
    fn: () => {
      assert.equal(normalizeFloorTokens('3F SOMÈS'), '3F SOMÈS')
      assert.equal(normalizeFloorTokens('地下2階「益や」'), '地下2階「益や」')
    },
  },
  {
    name: 'hasBasementFloor：B2F / 地下2階 → true、2F → false',
    fn: () => {
      assert.equal(hasBasementFloor('益や B2F'), true)
      assert.equal(hasBasementFloor('益や 地下2階'), true)
      assert.equal(hasBasementFloor('SOMÈS 5F'), false)
      assert.equal(hasBasementFloor(''), false)
    },
  },
  {
    name: 'detectBasementFloorDrop：出典 B2F・本文 2F → dropped',
    fn: () => {
      const r = detectBasementFloorDrop(
        'GINZA SIX の 2F「益や」で販売されています。',
        ['益や フロア: B2F', '京丹後・白杉酒造'],
      )
      assert.equal(r.dropped, true, JSON.stringify(r))
      assert.deepEqual(r.floors, [{ source: 'B2F', body: '2F' }])
    },
  },
  {
    name: 'detectBasementFloorDrop：出典も本文も B2F → dropped=false',
    fn: () => {
      const r = detectBasementFloorDrop('GINZA SIX の B2F「益や」で。', ['益や フロア: B2F'])
      assert.equal(r.dropped, false, JSON.stringify(r))
    },
  },
  {
    name: 'detectBasementFloorDrop：本文「地下2階」表記なら誤検知しない',
    fn: () => {
      const r = detectBasementFloorDrop('GINZA SIX の地下2階「益や」。', ['益や フロア: B2F'])
      assert.equal(r.dropped, false, JSON.stringify(r))
    },
  },
  {
    name: 'detectBasementFloorDrop：出典に地下階が無ければ何も出さない',
    fn: () => {
      const r = detectBasementFloorDrop('2F で開催', ['5F の SOMÈS'])
      assert.equal(r.dropped, false)
      assert.equal(r.floors.length, 0)
    },
  },
]

export const suite = () => runSuite('normalizeVenueText', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} normalizeVenueText (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
