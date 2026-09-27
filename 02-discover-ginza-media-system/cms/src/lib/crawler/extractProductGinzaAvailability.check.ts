// GINZA WHISKERS / Project 02 — extractProductGinzaAvailability の回帰テスト（2026-09-27）

import { runSuite, reportAndExit, type CheckCase } from './../__checks__/_harness'
import { extractProductGinzaAvailability } from './extractProductGinzaAvailability'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

function page(bodyHtml: string): string {
  return `<!doctype html><html><body>${bodyHtml}</body></html>`
}

const cases: CheckCase[] = [
  {
    name: 'GIN NO MORI実データ再現：「販売店舗：恵那本店/銀座店/名古屋店/...」から銀座の取扱いを確認する',
    fn: () => {
      const html = page(
        `<p>販売日:2026年8月29日(土)～10月末頃予定 ※各店舗数量限定/完売次第終了<br />販売店舗：恵那本店/銀座店/名古屋店/麻布台ヒルズ店/グランスタ東京店/グランフロント大阪店価格：2,138円(税込)</p>`,
      )
      const r = extractProductGinzaAvailability(html)
      assert(r.available === true, `銀座店を検出できるはず（実際: ${r.available}）`)
      assert(r.label === '販売店舗', `ラベル"販売店舗"を採用（実際: ${r.label}）`)
    },
  },
  {
    name: 'Mr. CHEESECAKE実データ再現：「国内の常設ストア5店舗（東京駅、羽田空港、銀座、名古屋、新宿駅）」から銀座の取扱いを確認する',
    fn: () => {
      const html = page(
        `<p>2026年10月1日（木）より「Milk Tea」と「Original」の2種を楽しめるアソートを、国内の常設ストア5店舗（東京駅、羽田空港、銀座、名古屋、新宿駅）で販売開始します。</p>`,
      )
      const r = extractProductGinzaAvailability(html)
      assert(r.available === true, `銀座を検出できるはず（実際: ${r.available}）`)
      assert(r.label === '常設ストア', `ラベル"常設ストア"を採用（実際: ${r.label}）`)
    },
  },
  {
    name: '「銀座店は対象外です」のような否定表現が近傍にある場合は、明記があっても採用しない（推測しない）',
    fn: () => {
      const html = page(`<p>販売店舗：名古屋店/大阪店（銀座店は対象外です・オンラインストアのみ）</p>`)
      const r = extractProductGinzaAvailability(html)
      assert(r.available === null, `否定表現があれば採用しない（実際: ${r.available}）`)
    },
  },
  {
    name: 'ページ内の無関係な「銀座」（ナビゲーション等、店舗一覧ラベルの外）だけでは採用しない',
    fn: () => {
      const html = page(
        `<nav>ホーム 銀座 東京 ショップ一覧</nav><p>この商品は当店限定です。</p>`,
      )
      const r = extractProductGinzaAvailability(html)
      assert(r.available === null, `店舗一覧ラベルが無ければ採用しない（実際: ${r.available}）`)
    },
  },
  {
    name: '「銀座」が長い無関係な語の部分文字列として現れる場合は、区切りトークンとして一致しないため採用しない',
    fn: () => {
      const html = page(`<p>取扱店舗：新宿銀座線沿線店舗のみ、名古屋店</p>`)
      const r = extractProductGinzaAvailability(html)
      assert(r.available === null, `"銀座"が独立トークンでない場合は採用しない（実際: ${r.available}）`)
    },
  },
  {
    name: '店舗一覧ラベル自体が本文に無い場合は null（推測しない）',
    fn: () => {
      const html = page(`<p>この商品は銀座でも大変人気です。全国どこでもお楽しみいただけます。</p>`)
      const r = extractProductGinzaAvailability(html)
      assert(r.available === null, `店舗一覧ラベルが無ければ採用しない（実際: ${r.available}）`)
    },
  },
]

export const suite = () => runSuite('extractProductGinzaAvailability', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
