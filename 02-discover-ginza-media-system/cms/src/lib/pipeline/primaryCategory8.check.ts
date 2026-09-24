// GINZA WHISKERS / Project 02（2026-09-24新設）— 主カテゴリー8分類（表示集約レイヤー）の回帰テスト。
//
//   node --import=tsx/esm src/lib/pipeline/primaryCategory8.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { ARTICLE_18_CATEGORIES } from './articleCategories'
import { PRIMARY_CATEGORY_8, PRIMARY_CATEGORY_8_LABELS, mapToPrimaryCategory8, primaryCategory8Label } from './primaryCategory8'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '8分類ちょうど（過不足なし）',
    fn: () => {
      assert(PRIMARY_CATEGORY_8.length === 8, `8件（実際 ${PRIMARY_CATEGORY_8.length}）`)
    },
  },
  {
    name: '8分類に重複がない',
    fn: () => {
      assert(new Set(PRIMARY_CATEGORY_8).size === PRIMARY_CATEGORY_8.length, '重複なし')
    },
  },
  {
    name: '8分類すべてにラベルが定義されている',
    fn: () => {
      for (const c of PRIMARY_CATEGORY_8) {
        assert(typeof PRIMARY_CATEGORY_8_LABELS[c] === 'string' && PRIMARY_CATEGORY_8_LABELS[c].length > 0, `${c}にラベルがある`)
      }
    },
  },
  {
    name: '既存18カテゴリーの全値が、必ずいずれか1つの8分類へ写像される（取りこぼしなし）',
    fn: () => {
      for (const c of ARTICLE_18_CATEGORIES) {
        const mapped = mapToPrimaryCategory8(c)
        assert(mapped !== null, `${c}が8分類のいずれかへ写像される`)
        assert((PRIMARY_CATEGORY_8 as readonly string[]).includes(mapped as string), `${c}→${mapped}は8分類の値`)
      }
    },
  },
  {
    name: 'SWEETSはSWEETSへ、FOOD/CAFE/NIGHTはGOURMETへ写像される',
    fn: () => {
      assert(mapToPrimaryCategory8('SWEETS') === 'SWEETS', 'SWEETS→SWEETS')
      assert(mapToPrimaryCategory8('FOOD') === 'GOURMET', 'FOOD→GOURMET')
      assert(mapToPrimaryCategory8('CAFE') === 'GOURMET', 'CAFE→GOURMET')
      assert(mapToPrimaryCategory8('NIGHT') === 'GOURMET', 'NIGHT→GOURMET')
    },
  },
  {
    name: 'null・未対応値は null を返す（推測で埋めない）',
    fn: () => {
      assert(mapToPrimaryCategory8(null) === null, 'null→null')
      assert(mapToPrimaryCategory8(undefined) === null, 'undefined→null')
      assert(mapToPrimaryCategory8('UNKNOWN_FUTURE_CATEGORY') === null, '未対応値→null')
    },
  },
  {
    name: 'primaryCategory8Labelは8分類の日本語ラベルを返し、未知の値はnull',
    fn: () => {
      assert(primaryCategory8Label('SWEETS') === 'スイーツ', 'SWEETSのラベル')
      assert(primaryCategory8Label(null) === null, 'null→null')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('primaryCategory8', cases)
