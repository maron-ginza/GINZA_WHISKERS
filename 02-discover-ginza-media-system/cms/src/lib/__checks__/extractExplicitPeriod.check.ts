// 明記された会期の決定的抽出（extractExplicitPeriod）の回帰テスト。推測はしない。
import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { extractExplicitPeriod } from '../pipeline/extractExplicitPeriod'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}
const NOW = new Date('2026-09-04T00:00:00.000Z')
const d = (iso: string) => iso.slice(0, 10)

const cases: CheckCase[] = [
  {
    name: 'YYYY.MM.DD(曜) - MM.DD(曜)（蔦屋タイトル型）',
    fn: () => {
      const p = extractExplicitPeriod('NEW 写真 2026.09.03(木) - 09.20(日) 【フェア】服部恭平の写真展', { now: NOW })
      assert(p && d(p.startIso) === '2026-09-03' && d(p.endIso) === '2026-09-20', JSON.stringify(p))
    },
  },
  {
    name: 'YYYY年M月D日〜M月D日',
    fn: () => {
      const p = extractExplicitPeriod('第16回 銀座◯◯展 2026年9月27日〜10月5日', { now: NOW })
      assert(p && d(p.startIso) === '2026-09-27' && d(p.endIso) === '2026-10-05', JSON.stringify(p))
    },
  },
  {
    // 2026-09-14追加：松屋銀座「今週のGINZAスイート」実データで発見した、終端の月を
    // 省略する表記（開始と同じ月であることが文脈上明らかな慣用表記）への対応。
    name: 'YYYY年M月D日(曜)－D日(曜)（終端の月省略・松屋銀座型）',
    fn: () => {
      const p = extractExplicitPeriod('2026年9月9日(水)－15日(火)', { now: NOW })
      assert(p && d(p.startIso) === '2026-09-09' && d(p.endIso) === '2026-09-15', JSON.stringify(p))
    },
  },
  {
    name: '終端の月省略パターンは全角ダッシュ・波ダッシュ双方で機能する',
    fn: () => {
      const p1 = extractExplicitPeriod('2026年12月20日（土）〜25日（金）', { now: NOW })
      assert(p1 && d(p1.startIso) === '2026-12-20' && d(p1.endIso) === '2026-12-25', JSON.stringify(p1))
    },
  },
  {
    name: '終端の月省略パターンは通常の月+日フル表記（従来ケース）を妨げない',
    fn: () => {
      const p = extractExplicitPeriod('会期：2026年10月2日（金）から10月25日（日）まで', { now: NOW })
      assert(p && d(p.startIso) === '2026-10-02' && d(p.endIso) === '2026-10-25', JSON.stringify(p))
    },
  },
  {
    name: '会期：ラベル付き',
    fn: () => {
      const p = extractExplicitPeriod('更紗展｜会期：2026年10月1日(水)〜10月14日(火)', { now: NOW })
      assert(p && d(p.startIso) === '2026-10-01' && d(p.endIso) === '2026-10-14', JSON.stringify(p))
    },
  },
  {
    name: '年跨ぎレンジ（12/28〜1/5）は終端を翌年に',
    fn: () => {
      const p = extractExplicitPeriod('開催期間：12/28(日)〜1/5(月)', { now: NOW })
      assert(p && d(p.startIso) === '2026-12-28' && d(p.endIso) === '2027-01-05', JSON.stringify(p))
    },
  },
  {
    name: '単日（会期 YYYY年M月D日）',
    fn: () => {
      const p = extractExplicitPeriod('シャンソンの夕べ 会期 2026年9月27日', { now: NOW })
      assert(p && d(p.startIso) === '2026-09-27' && d(p.endIso) === '2026-09-27', JSON.stringify(p))
    },
  },
  {
    name: '日付が無ければ null（推測しない）',
    fn: () => assert(extractExplicitPeriod('【フェア】きものと妖怪', { now: NOW }) === null, 'null'),
  },
  {
    name: '不正な日付（13月）は採らない',
    fn: () => assert(extractExplicitPeriod('2026.13.01 - 13.05 展', { now: NOW }) === null, 'null'),
  },
  {
    name: '全角数字も拾う',
    fn: () => {
      const p = extractExplicitPeriod('２０２６年９月１日(火)〜９月１５日(月)', { now: NOW })
      assert(p && d(p.startIso) === '2026-09-01' && d(p.endIso) === '2026-09-15', JSON.stringify(p))
    },
  },
]

export const suite = () => runSuite('extractExplicitPeriod', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
