// GINZA WHISKERS / Project 02 — extractPriceHint の回帰テスト（2026-09-05）
//
//   ・「1500円」「1,500円」「１，５００円」の3形式を安全に抽出できる
//   ・数字以外を価格として推測しない
//   ・同一ラベル近傍の複数価格を出現順・重複除去で抽出できる
//   ・価格不明／本文なしは null を返す
//   ・「無料」は明示的な修飾語（入場/参加費/観覧 等＋無料）つきのときだけ採用する

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { extractPriceHint } from '../morning/extractPriceHint'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: '半角区切りなし「1500円」→ 1,500円',
    fn: () => {
      const r = extractPriceHint('料金：1500円（税込）')
      assert(r.price === '1,500円', `実際: ${r.price}`)
    },
  },
  {
    name: '半角カンマ区切り「1,500円」→ 1,500円',
    fn: () => {
      const r = extractPriceHint('参加費：1,500円です。')
      assert(r.price === '1,500円', `実際: ${r.price}`)
    },
  },
  {
    name: '全角数字・全角カンマ「１，５００円」→ 1,500円',
    fn: () => {
      const r = extractPriceHint('料金　１，５００円（当日）')
      assert(r.price === '1,500円', `実際: ${r.price}`)
    },
  },
  {
    name: '複数価格（同一ラベル近傍に3価格）を出現順・重複除去で抽出',
    fn: () => {
      const r = extractPriceHint(
        '料金：平日6,957円／土日祝7,590円／ナイト（全日）6,072円　※すべて税・サービス料込み',
      )
      assert(r.price === '6,957円／7,590円／6,072円', `実際: ${r.price}`)
    },
  },
  {
    name: '価格不明（ラベルはあるが金額が無い）→ null（推測しない）',
    fn: () => {
      const r = extractPriceHint('料金は店舗にてご確認ください。')
      assert(r.price === null, `実際: ${r.price}`)
      assert(/not-found/.test(r.method), `method: ${r.method}`)
    },
  },
  {
    name: '価格情報自体がない本文 → null',
    fn: () => {
      const r = extractPriceHint('本日は晴天なり。銀座で散策を楽しみました。')
      assert(r.price === null, `実際: ${r.price}`)
    },
  },
  {
    name: '本文 null → no-body',
    fn: () => {
      assert(extractPriceHint(null).method === 'no-body', 'null')
    },
  },
  {
    name: '本文が空白のみ → no-body',
    fn: () => {
      assert(extractPriceHint('   ').method === 'no-body', '空白')
    },
  },
  {
    name: '明示的な無料表記（入場無料／参加費無料／観覧無料）→ 無料',
    fn: () => {
      assert(extractPriceHint('本イベントは入場無料です。').price === '無料', '入場無料')
      assert(extractPriceHint('参加費無料でどなたでもご参加いただけます。').price === '無料', '参加費無料')
      assert(extractPriceHint('観覧無料の展示です。').price === '無料', '観覧無料')
    },
  },
  {
    name: '修飾語なしの単独「無料」は不採用（明示ではないため推測しない）',
    fn: () => {
      const r = extractPriceHint('詳しくは無料相談窓口へお問い合わせください。')
      assert(r.price === null, `実際: ${r.price}`)
    },
  },
]

export const suite = () => runSuite('extractPriceHint', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
