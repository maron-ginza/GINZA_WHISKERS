// GINZA WHISKERS / Project 02（2026-09-14新設）— note下書き自動転記の状態遷移
// （noteTransferState.ts）の回帰テスト。実サーバー起動・DB接続なしで、
// 「重複防止」「3回リトライ上限」「成功記録後は再転記されない」を検証する。

import assert from 'node:assert/strict'

import {
  selectNextPendingArticleId,
  claimInProgress,
  recordSuccess,
  recordFailure,
  recordCompletionAttempt,
  MAX_TRANSFER_ATTEMPTS,
  type TransferState,
} from '../night/noteTransferState'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    name: '未転記の候補がstateに無ければ先頭候補を選ぶ',
    fn: () => {
      const state: TransferState = {}
      assert.equal(selectNextPendingArticleId(state, [67, 68]), 67)
    },
  },
  {
    name: '【重複防止】in_progress中の記事は候補から除外される',
    fn: () => {
      const state: TransferState = { '67': { articleId: 67, status: 'in_progress', attempts: 0 } }
      assert.equal(selectNextPendingArticleId(state, [67, 68]), 68)
    },
  },
  {
    name: '【重複防止】成功記録済みの記事は二度と候補にならない',
    fn: () => {
      const state: TransferState = {
        '67': { articleId: 67, status: 'success', attempts: 1, draftUrl: 'https://editor.note.com/notes/abc/edit/' },
      }
      assert.equal(selectNextPendingArticleId(state, [67]), null)
    },
  },
  {
    name: 'claimInProgressで in_progress 化した直後は同じarticleIdが選ばれない（多重取得防止）',
    fn: () => {
      let state: TransferState = {}
      const id = selectNextPendingArticleId(state, [67])
      assert.equal(id, 67)
      state = claimInProgress(state, 67)
      assert.equal(selectNextPendingArticleId(state, [67]), null)
    },
  },
  {
    name: '【下書き保存成功報告】recordSuccessでstatus=success・draftUrl・transferredAtが記録される',
    fn: () => {
      const state = recordSuccess({}, 67, 'https://editor.note.com/notes/xyz789/edit/', '2026-09-14T00:00:00.000Z')
      const entry = state['67']
      assert.equal(entry.status, 'success')
      assert.equal(entry.draftUrl, 'https://editor.note.com/notes/xyz789/edit/')
      assert.equal(entry.transferredAt, '2026-09-14T00:00:00.000Z')
    },
  },
  {
    name: '【3回リトライ上限】1・2回目の失敗はpendingに戻り再試行対象になる',
    fn: () => {
      let state: TransferState = {}
      let r = recordFailure(state, 67, '1回目失敗', '2026-09-14T00:00:00.000Z')
      assert.equal(r.exhausted, false)
      assert.equal(r.attempts, 1)
      state = r.state
      assert.equal(selectNextPendingArticleId(state, [67]), 67, '1回失敗しただけならまだ再試行対象')

      r = recordFailure(state, 67, '2回目失敗', '2026-09-14T00:01:00.000Z')
      assert.equal(r.exhausted, false)
      assert.equal(r.attempts, 2)
      state = r.state
      assert.equal(selectNextPendingArticleId(state, [67]), 67, '2回失敗してもまだ再試行対象')
    },
  },
  {
    name: '【3回リトライ上限】3回目の失敗でstatus=failedとなり以後候補から除外される（同じ操作を3回より多く繰り返さない）',
    fn: () => {
      let state: TransferState = {}
      for (let i = 1; i <= MAX_TRANSFER_ATTEMPTS; i++) {
        const r = recordFailure(state, 67, `${i}回目失敗`, `2026-09-14T00:0${i}:00.000Z`)
        state = r.state
        if (i < MAX_TRANSFER_ATTEMPTS) assert.equal(r.exhausted, false)
        else assert.equal(r.exhausted, true)
      }
      assert.equal(state['67'].status, 'failed')
      assert.equal(state['67'].attempts, MAX_TRANSFER_ATTEMPTS)
      assert.equal(selectNextPendingArticleId(state, [67]), null, '3回失敗後は候補から除外される')
    },
  },
  {
    name: '複数記事が並行してもそれぞれ独立に状態管理される',
    fn: () => {
      let state: TransferState = {}
      state = claimInProgress(state, 67)
      state = recordSuccess(state, 68, 'https://editor.note.com/notes/def/edit/', '2026-09-14T00:00:00.000Z')
      assert.equal(selectNextPendingArticleId(state, [67, 68, 69]), 69)
    },
  },
  {
    // 2026-09-14続き5：実機検証で実際に発生したケース——タイトル・本文・保存は
    // 成功したがハッシュタグ・アイコンが未完了。needsCompletion=trueで記録した
    // 場合、success状態のまま completion-only ジョブとして再選出できること。
    name: '【completion-only】needsCompletion=trueのsuccessはcompletion-onlyジョブとして再選出される',
    fn: () => {
      const state = recordSuccess({}, 67, 'https://editor.note.com/notes/n12d7568d8bd2/edit/', '2026-09-14T00:00:00.000Z', true)
      assert.equal(state['67'].status, 'success', 'タイトル・本文・保存の成功記録は維持される')
      assert.equal(selectNextPendingArticleId(state, [67]), 67, 'needsCompletion=trueなら再選出される')
    },
  },
  {
    name: '【completion-only】needsCompletion=falseのsuccessは通常どおり再選出されない',
    fn: () => {
      const state = recordSuccess({}, 67, 'https://editor.note.com/notes/abc/edit/', '2026-09-14T00:00:00.000Z', false)
      assert.equal(selectNextPendingArticleId(state, [67]), null)
    },
  },
  {
    name: '【completion-only】recordCompletionAttemptが成功すればneedsCompletion=falseになり以後再選出されない',
    fn: () => {
      let state = recordSuccess({}, 67, 'https://editor.note.com/notes/n1/edit/', '2026-09-14T00:00:00.000Z', true)
      assert.equal(selectNextPendingArticleId(state, [67]), 67)
      state = recordCompletionAttempt(state, 67, true)
      assert.equal(state['67'].needsCompletion, false)
      assert.equal(state['67'].status, 'success', 'success状態・draftUrlは維持される')
      assert.equal(state['67'].draftUrl, 'https://editor.note.com/notes/n1/edit/')
      assert.equal(selectNextPendingArticleId(state, [67]), null, '完了後は再選出されない')
    },
  },
  {
    // 2026-09-14続き5で実機テスト中に発見したバグの再発防止：claimInProgressで
    // status='in_progress'化された後、recordCompletionAttemptがstatusを
    // 'success'へ戻さないと、以後selectNextPendingArticleIdが恒久的に
    // in_progress判定で除外し続けてしまう（inFlight永久ブロックと同種のバグ）。
    name: '【重要バグ再発防止】claimInProgress後のrecordCompletionAttemptはstatusをsuccessへ戻し、in_progressのまま固着させない',
    fn: () => {
      let state = recordSuccess({}, 67, 'https://editor.note.com/notes/n1/edit/', '2026-09-14T00:00:00.000Z', true)
      state = claimInProgress(state, 67) // /pending取得時と同じ操作
      assert.equal(state['67'].status, 'in_progress')
      state = recordCompletionAttempt(state, 67, false) // 失敗を報告
      assert.equal(state['67'].status, 'success', 'in_progressのまま固着していないこと')
      assert.equal(selectNextPendingArticleId(state, [67]), 67, '再試行対象として選出できること（in_progressのまま固着していれば選出されない）')
    },
  },
  {
    name: '【completion-only・3回上限】completion試行が3回失敗すると以後再選出されない',
    fn: () => {
      let state = recordSuccess({}, 67, 'https://editor.note.com/notes/n1/edit/', '2026-09-14T00:00:00.000Z', true)
      for (let i = 1; i <= MAX_TRANSFER_ATTEMPTS; i++) {
        state = recordCompletionAttempt(state, 67, false)
      }
      assert.equal(state['67'].completionAttempts, MAX_TRANSFER_ATTEMPTS)
      assert.equal(selectNextPendingArticleId(state, [67]), null, '3回失敗後はcompletion-onlyとしても再選出されない')
      assert.equal(state['67'].status, 'success', '初回の成功記録（タイトル・本文・保存）はcompletion失敗によって覆らない')
    },
  },
]

export const suite = () => runSuite('noteTransferState', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} noteTransferState (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
