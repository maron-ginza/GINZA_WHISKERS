// GINZA WHISKERS / Project 02 — eventEndBoundary の回帰テスト（2026-09-06）
//
// event_end_at が日付のみ（時刻情報なし）の場合、日本時間の当日23:59:59まで
// 開催中として扱い、翌日（日本時間）から終了済みとする。終了時刻が明示されて
// いる場合はその時刻を優先する。UTC/JSTの境界を重点的に検証する。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { isPastEventEnd, resolveEventEndBoundaryMs } from '../curation/eventEndBoundary'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: '日付のみ（2026-09-06T00:00:00.000Z）→ 境界は UTC 2026-09-06T14:59:59.999Z（JST 23:59:59.999）',
    fn: () => {
      const ms = resolveEventEndBoundaryMs('2026-09-06T00:00:00.000Z')
      assert(ms === new Date('2026-09-06T14:59:59.999Z').getTime(), `実際: ${new Date(ms).toISOString()}`)
    },
  },
  {
    name: '最終日の日本時間 朝9時（UTC同日0時）はまだ開催中（expiredにしない）',
    fn: () => {
      const now = new Date('2026-09-06T00:00:00.000Z') // JST 2026-09-06 09:00
      assert(!isPastEventEnd('2026-09-06T00:00:00.000Z', now), '朝9時JSTはまだ終了していない')
    },
  },
  {
    name: '最終日の日本時間 23:59:00（UTC同日14:59:00）はまだ開催中',
    fn: () => {
      const now = new Date('2026-09-06T14:59:00.000Z') // JST 2026-09-06 23:59:00
      assert(!isPastEventEnd('2026-09-06T00:00:00.000Z', now), 'JST 23:59はまだ終了していない')
    },
  },
  {
    name: '最終日の日本時間 23:59:59（UTC同日14:59:59）はまだ開催中（境界ちょうど）',
    fn: () => {
      const now = new Date('2026-09-06T14:59:59.000Z') // JST 2026-09-06 23:59:59
      assert(!isPastEventEnd('2026-09-06T00:00:00.000Z', now), 'JST 23:59:59は境界内でまだ終了していない')
    },
  },
  {
    name: '翌日の日本時間 0:00:01（UTC同日15:00:01）から終了済み',
    fn: () => {
      const now = new Date('2026-09-06T15:00:01.000Z') // JST 2026-09-07 00:00:01
      assert(isPastEventEnd('2026-09-06T00:00:00.000Z', now), 'JST翌日0時を過ぎたら終了済み')
    },
  },
  {
    name: '終了時刻が明示されている場合（例: 19:00 JST=UTC10:00）はその時刻をそのまま優先する',
    fn: () => {
      const explicit = '2026-09-06T10:00:00.000Z' // JST 19:00（明示的な終了時刻）
      const before = new Date('2026-09-06T09:59:59.000Z') // JST 18:59:59
      const after = new Date('2026-09-06T10:00:01.000Z') // JST 19:00:01
      assert(!isPastEventEnd(explicit, before), '明示時刻の直前はまだ終了していない')
      assert(isPastEventEnd(explicit, after), '明示時刻を過ぎたら終了済み（日付のみ扱いにして23:59まで延長しない）')
    },
  },
  {
    name: '終了時刻が明示され、かつ翌日日中まで開催中の場合も明示時刻をそのまま優先する',
    fn: () => {
      // 深夜営業などで明示終了時刻が "00:30" のようなケース（date-only ではない）
      const explicit = '2026-09-07T00:30:00.000Z' // JST 09:30（date-onlyパターンに一致しない）
      const before = new Date('2026-09-07T00:29:00.000Z')
      const after = new Date('2026-09-07T00:31:00.000Z')
      assert(!isPastEventEnd(explicit, before), '明示時刻の直前はまだ終了していない')
      assert(isPastEventEnd(explicit, after), '明示時刻を過ぎたら終了済み')
    },
  },
  {
    name: '値が無い／解釈できない場合は false（判定不能・未終了扱い、推測しない）',
    fn: () => {
      const now = new Date('2026-09-06T00:00:00.000Z')
      assert(!isPastEventEnd(null, now), 'null は false')
      assert(!isPastEventEnd(undefined, now), 'undefined は false')
      assert(!isPastEventEnd('not-a-date', now), '不正な文字列は false')
      assert(Number.isNaN(resolveEventEndBoundaryMs('not-a-date')), 'resolveEventEndBoundaryMs は NaN')
    },
  },
]

export const suite = () => runSuite('eventEndBoundary', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
