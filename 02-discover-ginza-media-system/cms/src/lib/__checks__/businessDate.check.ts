// GINZA WHISKERS / Project 02 — 業務日付（Asia/Tokyo 暦日）共通関数の回帰テスト。
//
// 重点：日付境界（23:59 / 00:00）と、UTC では前日になる時間帯（JST 00:00〜08:59 = UTC 前日）。
// これらで UTC 切り出し（toISOString().slice(0,10)）が起こしていた「9月10日ずれ」を検証する。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  tokyoBusinessDate,
  resolveBusinessDate,
  isBusinessDateString,
  tokyoStartOfDay,
  toTokyoDateString,
  BUSINESS_TIMEZONE,
} from '../util/businessDate'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}
/** JST の壁時計時刻を UTC の Date に変換（JST は年間 UTC+9・DST なし） */
const jst = (s: string) => new Date(`${s}+09:00`)

const cases: CheckCase[] = [
  {
    name: 'timezone は Asia/Tokyo 固定',
    fn: () => assert(BUSINESS_TIMEZONE === 'Asia/Tokyo', BUSINESS_TIMEZONE),
  },
  {
    name: 'tokyoBusinessDate: JST 00:00 ちょうど（＝UTC 前日 15:00）→ その日',
    fn: () => {
      assert(tokyoBusinessDate(jst('2026-09-11T00:00:00')) === '2026-09-11', 'JST 09-11 00:00')
      // UTC で見ると 2026-09-10T15:00:00Z（前日）だが業務日付は 09-11
      assert(jst('2026-09-11T00:00:00').toISOString().slice(0, 10) === '2026-09-10', '前提: UTC 切り出しは前日になる')
    },
  },
  {
    name: 'tokyoBusinessDate: JST 08:59（＝UTC 前日 23:59）→ その日（今回のバグの再現域）',
    fn: () => {
      // 本セッションで review-today が 09-10 と誤判定していた時間帯
      assert(tokyoBusinessDate(jst('2026-09-11T08:59:59')) === '2026-09-11', 'JST 09-11 08:59:59')
      assert(jst('2026-09-11T08:59:59').toISOString().slice(0, 10) === '2026-09-10', '前提: UTC では 09-10')
      // 記事生成側（ローカル TZ 依存の getFullYear 系）も Asia/Tokyo に一本化されている前提
      assert(tokyoBusinessDate(jst('2026-09-11T09:00:00')) === '2026-09-11', 'JST 09:00 も同日')
    },
  },
  {
    name: 'tokyoBusinessDate: JST 23:59:59 → その日 / 翌 00:00:00 → 翌日',
    fn: () => {
      assert(tokyoBusinessDate(jst('2026-09-11T23:59:59')) === '2026-09-11', 'JST 23:59:59')
      assert(tokyoBusinessDate(jst('2026-09-12T00:00:00')) === '2026-09-12', 'JST 翌 00:00:00')
      // 同じ瞬間を UTC で見ると 09-11T14:59:59Z / 09-11T15:00:00Z（同じ 09-11）
      assert(jst('2026-09-11T23:59:59').toISOString().slice(0, 10) === '2026-09-11', '前提: UTC 一致の側')
    },
  },
  {
    name: 'tokyoBusinessDate: 月末・年末の境界',
    fn: () => {
      assert(tokyoBusinessDate(jst('2026-09-30T23:59:00')) === '2026-09-30', '月末 23:59')
      assert(tokyoBusinessDate(jst('2026-10-01T00:05:00')) === '2026-10-01', '翌月 00:05')
      // JST 2026-01-01 05:00 = UTC 2025-12-31 20:00（年跨ぎ）
      assert(tokyoBusinessDate(jst('2026-01-01T05:00:00')) === '2026-01-01', '年始 JST 05:00')
      assert(jst('2026-01-01T05:00:00').toISOString().slice(0, 10) === '2025-12-31', '前提: UTC では前年 12-31')
      assert(tokyoBusinessDate(jst('2025-12-31T23:59:59')) === '2025-12-31', '大晦日 23:59:59')
    },
  },
  {
    name: 'resolveBusinessDate: 明示指定を最優先。不正指定は Asia/Tokyo の当日へフォールバック',
    fn: () => {
      const now = jst('2026-09-11T08:00:00')
      assert(resolveBusinessDate('2026-09-15', now) === '2026-09-15', '妥当な明示指定を優先')
      assert(resolveBusinessDate('  2026-09-15  ', now) === '2026-09-15', '前後空白は許容')
      assert(resolveBusinessDate(undefined, now) === '2026-09-11', '未指定→Tokyo 当日')
      assert(resolveBusinessDate(null, now) === '2026-09-11', 'null→Tokyo 当日')
      assert(resolveBusinessDate('', now) === '2026-09-11', '空文字→Tokyo 当日')
      assert(resolveBusinessDate('2026/09/15', now) === '2026-09-11', 'スラッシュ区切りは不正→フォールバック')
      assert(resolveBusinessDate('2026-13-01', now) === '2026-09-11', '存在しない月→フォールバック')
      assert(resolveBusinessDate('2026-02-30', now) === '2026-09-11', '存在しない日→フォールバック')
      assert(resolveBusinessDate('20260915', now) === '2026-09-11', '区切りなし→フォールバック')
    },
  },
  {
    name: 'isBusinessDateString: YYYY-MM-DD かつ実在日のみ true',
    fn: () => {
      assert(isBusinessDateString('2026-09-11'), 'ok')
      assert(!isBusinessDateString('2026-9-1'), '桁不足')
      assert(!isBusinessDateString('2026-02-30'), '実在しない日')
      assert(!isBusinessDateString('2026-00-10'), '月0')
      assert(!isBusinessDateString(null) && !isBusinessDateString(20260911 as unknown), '型不正')
    },
  },
  {
    name: 'tokyoStartOfDay: 業務日付の JST 00:00 を表す（UTC 前日 15:00Z）',
    fn: () => {
      const d = tokyoStartOfDay('2026-09-11')
      assert(d.toISOString() === '2026-09-10T15:00:00.000Z', d.toISOString())
      // その Date を業務日付に戻すと元に戻る（往復一致）
      assert(tokyoBusinessDate(d) === '2026-09-11', '往復一致')
      // T00:00:00.000Z 方式との差（9時間ずれ）を確認
      assert(new Date('2026-09-11T00:00:00.000Z').toISOString() !== d.toISOString(), 'UTC 00:00 とは別物')
    },
  },
  {
    name: 'toTokyoDateString は tokyoBusinessDate と同一（イベント日・確認日の表示に使う別名）',
    fn: () => {
      const d = jst('2026-09-11T02:00:00')
      assert(toTokyoDateString(d) === tokyoBusinessDate(d) && toTokyoDateString(d) === '2026-09-11', '別名一致')
    },
  },
]

export const suite = () => runSuite('businessDate', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
