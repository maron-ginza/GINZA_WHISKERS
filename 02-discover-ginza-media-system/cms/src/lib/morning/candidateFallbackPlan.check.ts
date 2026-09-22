// GINZA WHISKERS / Project 02（2026-09-22）— candidateFallbackPlan の回帰テスト。
// 2026-09-22の手動運用（新規9件不足→既存台帳確認→なお不足→SWEETS限定補完取得→
// それでも0件で「候補不足」停止）を恒久ロジック化したものの検証。
//
//   node --import=tsx/esm src/lib/morning/candidateFallbackPlan.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { planCandidateFallback } from './candidateFallbackPlan'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '本日新規でSWEETS1件・その他2件（計3件）なら sufficient_today',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 1,
        newOtherCount: 2,
        boardSweetsCount: 1,
        boardOtherCount: 2,
        supplementaryFetchAttempted: false,
      })
      assert(plan.stage === 'sufficient_today', `sufficient_todayのはず（実際 ${plan.stage}）`)
    },
  },
  {
    name: '本日新規でSWEETS0件（他が何件でも）は不足→次段階へ進む',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 0,
        newOtherCount: 10,
        boardSweetsCount: 0,
        boardOtherCount: 10,
        supplementaryFetchAttempted: false,
      })
      assert(plan.stage !== 'sufficient_today', 'SWEETS0件はsufficient_todayにならないはず')
    },
  },
  {
    name: '本日新規は不足だが、既存ボード（持ち越し含む）で充足していれば sufficient_via_existing_board',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 0,
        newOtherCount: 1,
        boardSweetsCount: 1,
        boardOtherCount: 5,
        supplementaryFetchAttempted: false,
      })
      assert(plan.stage === 'sufficient_via_existing_board', `sufficient_via_existing_boardのはず（実際 ${plan.stage}）`)
    },
  },
  {
    name: '本日新規も既存ボードも不足し、補完取得が未実施なら needs_supplementary_fetch を返し、実行すべきコマンドを提示する',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 0,
        newOtherCount: 0,
        boardSweetsCount: 0,
        boardOtherCount: 5,
        supplementaryFetchAttempted: false,
      })
      assert(plan.stage === 'needs_supplementary_fetch', `needs_supplementary_fetchのはず（実際 ${plan.stage}）`)
      assert(Array.isArray(plan.recommendedCommands) && plan.recommendedCommands.length > 0, '実行コマンドが提示されるはず')
      assert(plan.recommendedCommands!.every((c) => c.startsWith('./p2 ')), '全て既存の./p2コマンドのはず（新規fetchロジックを作らない）')
    },
  },
  {
    name: '2026-09-22実例：補完取得後もSWEETS0件のままなら insufficient_stop（記事を捏造しない）',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 0,
        newOtherCount: 0,
        boardSweetsCount: 0,
        boardOtherCount: 25,
        supplementaryFetchAttempted: true,
        boardSweetsCountAfterSupplementary: 0,
        boardOtherCountAfterSupplementary: 25,
      })
      assert(plan.stage === 'insufficient_stop', `insufficient_stopのはず（実際 ${plan.stage}）`)
      assert(plan.recommendedCommands === undefined, 'insufficient_stopでは実行コマンドを提示しないはず')
    },
  },
  {
    name: '補完取得後にSWEETSが確保できれば sufficient_via_existing_board へ回復する',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 0,
        newOtherCount: 0,
        boardSweetsCount: 0,
        boardOtherCount: 5,
        supplementaryFetchAttempted: true,
        boardSweetsCountAfterSupplementary: 2,
        boardOtherCountAfterSupplementary: 5,
      })
      assert(plan.stage === 'sufficient_via_existing_board', `補完取得が奏功すればsufficientのはず（実際 ${plan.stage}）`)
    },
  },
  {
    name: '境界値：合計ちょうど3件（SWEETS1+その他2）は充足',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 1,
        newOtherCount: 2,
        boardSweetsCount: 1,
        boardOtherCount: 2,
        supplementaryFetchAttempted: false,
      })
      assert(plan.stage === 'sufficient_today', '境界値ちょうど3件は充足のはず')
    },
  },
  {
    name: '境界値：合計2件（SWEETS1+その他1）は不足',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 1,
        newOtherCount: 1,
        boardSweetsCount: 1,
        boardOtherCount: 1,
        supplementaryFetchAttempted: false,
      })
      assert(plan.stage !== 'sufficient_today', '合計2件は不足のはず')
    },
  },
  {
    name: 'reasonsは常に空でない（マロンへの透明性）',
    fn: () => {
      const plan = planCandidateFallback({
        newSweetsCount: 1, newOtherCount: 2, boardSweetsCount: 1, boardOtherCount: 2, supplementaryFetchAttempted: false,
      })
      assert(plan.reasons.length > 0, 'reasonsは必ず1件以上あるはず')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('candidateFallbackPlan', cases)
