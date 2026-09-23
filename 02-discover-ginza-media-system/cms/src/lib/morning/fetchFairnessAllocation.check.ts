// GINZA WHISKERS / Project 02（2026-09-24続き）— fetchFairnessAllocation の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/fetchFairnessAllocation.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { allocateFetchFairness, type FetchFairnessCandidate } from './fetchFairnessAllocation'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    // 【実障害の再現】9/24 6:00実行の実データで、木挽町よしや（kobikichoyoshiya.com）の
    // SWEETS候補（DC#1132「ミッフィーどら焼き」）が「同一ホストの取得本数上限」で
    // スキップされていた。1ホストに大量の非SWEETS候補と少数のSWEETS候補が混在する
    // 状況を再現し、上限に達してもSWEETSが必ず取得許可されることを確認する。
    name: '1ホストに大量の他カテゴリーと少数のSWEETSが混在しても、上限内でSWEETSが必ず含まれる',
    fn: () => {
      const host = 'example-shop.com'
      const candidates: FetchFairnessCandidate[] = [
        ...Array.from({ length: 40 }, (_, i) => ({ id: i + 1, host, category: 'SHOPPING' })),
        { id: 1000, host, category: 'SWEETS' },
      ]
      const result = allocateFetchFairness(candidates, 30)
      assert(result.allowedIds.has(1000), 'SWEETS候補（少数派）が30件の枠に含まれるはず')
      assert(result.allowedIds.size === 30, `許可件数はmaxPerHost=30のはず（実際 ${result.allowedIds.size}）`)
    },
  },
  {
    name: '複数カテゴリーが混在する場合、ラウンドロビンで各カテゴリーへ公平に割り当てる',
    fn: () => {
      const host = 'multi-category.com'
      const candidates: FetchFairnessCandidate[] = [
        ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, host, category: 'ART' })),
        ...Array.from({ length: 10 }, (_, i) => ({ id: i + 100, host, category: 'FOOD' })),
        ...Array.from({ length: 10 }, (_, i) => ({ id: i + 200, host, category: 'SWEETS' })),
      ]
      const result = allocateFetchFairness(candidates, 9)
      const summary = result.hostSummary[host]
      assert(summary.categoryCounts.ART === 3, `ARTは3件のはず（実際 ${summary.categoryCounts.ART}）`)
      assert(summary.categoryCounts.FOOD === 3, `FOODは3件のはず（実際 ${summary.categoryCounts.FOOD}）`)
      assert(summary.categoryCounts.SWEETS === 3, `SWEETSは3件のはず（実際 ${summary.categoryCounts.SWEETS}）`)
    },
  },
  {
    name: 'ホストの総候補数がmaxPerHost以下なら全件許可する（従来どおり制限なし）',
    fn: () => {
      const host = 'small-shop.com'
      const candidates: FetchFairnessCandidate[] = [
        { id: 1, host, category: 'SWEETS' },
        { id: 2, host, category: 'ART' },
      ]
      const result = allocateFetchFairness(candidates, 30)
      assert(result.allowedIds.size === 2, '2件とも許可されるはず')
    },
  },
  {
    name: 'host===nullの候補は集計対象に含まれない（呼び出し側が別途無条件許可として扱う前提）',
    fn: () => {
      const candidates: FetchFairnessCandidate[] = [{ id: 1, host: null, category: 'SWEETS' }]
      const result = allocateFetchFairness(candidates, 30)
      assert(result.allowedIds.size === 0, 'host===nullは本関数の対象外のはず')
      assert(Object.keys(result.hostSummary).length === 0, 'hostSummaryも空のはず')
    },
  },
  {
    name: '未分類（category:null）カテゴリーも1つのグループとしてラウンドロビンに参加する',
    fn: () => {
      const host = 'mixed.com'
      const candidates: FetchFairnessCandidate[] = [
        ...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, host, category: null })),
        { id: 100, host, category: 'SWEETS' },
      ]
      const result = allocateFetchFairness(candidates, 2)
      assert(result.allowedIds.has(100), '未分類が先に埋めてもSWEETSは1巡目で選ばれるはず')
    },
  },
  {
    name: '各カテゴリーグループ内の選定順は入力順（呼び出し側の-updatedAt順）を維持する',
    fn: () => {
      const host = 'order-check.com'
      const candidates: FetchFairnessCandidate[] = [
        { id: 1, host, category: 'SWEETS' }, // 最も新しい（呼び出し側で-updatedAt順に渡す前提）
        { id: 2, host, category: 'SWEETS' },
        { id: 3, host, category: 'SWEETS' },
      ]
      const result = allocateFetchFairness(candidates, 2)
      assert(result.allowedIds.has(1) && result.allowedIds.has(2), '先頭2件（新しい順）が選ばれるはず')
      assert(!result.allowedIds.has(3), '3件目（最も古い）は選ばれないはず')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('fetchFairnessAllocation', cases)
