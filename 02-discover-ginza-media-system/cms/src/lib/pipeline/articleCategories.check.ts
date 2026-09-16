// GINZA WHISKERS / Project 02（2026-09-17新設）— 18カテゴリー正本一覧の回帰テスト。
//
//   node --import=tsx/esm src/lib/pipeline/articleCategories.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { ARTICLE_18_CATEGORIES, ARTICLE_18_CATEGORY_LABELS } from './articleCategories'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '18カテゴリーちょうど（過不足なし）',
    fn: () => {
      assert(ARTICLE_18_CATEGORIES.length === 18, `18件（実際 ${ARTICLE_18_CATEGORIES.length}）`)
    },
  },
  {
    name: '重複がない',
    fn: () => {
      assert(new Set(ARTICLE_18_CATEGORIES).size === ARTICLE_18_CATEGORIES.length, '重複なし')
    },
  },
  {
    name: '全カテゴリーにラベルが定義されている',
    fn: () => {
      for (const c of ARTICLE_18_CATEGORIES) {
        assert(typeof ARTICLE_18_CATEGORY_LABELS[c] === 'string' && ARTICLE_18_CATEGORY_LABELS[c].length > 0, `${c}にラベルがある`)
      }
    },
  },
  {
    name: 'SWEETSが18カテゴリーの中の1つとして含まれる（別経路の特別カテゴリーではない）',
    fn: () => {
      assert(ARTICLE_18_CATEGORIES.includes('SWEETS'), 'SWEETSを含む')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('articleCategories', cases)
