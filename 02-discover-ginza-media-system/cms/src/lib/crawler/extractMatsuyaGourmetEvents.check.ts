// GINZA WHISKERS / Project 02（2026-09-16続き8）— 松屋銀座「グルメ」一覧ページの
// 個別イベント分割の回帰テスト。fixtureは2026-09-16に実際に取得した
// ginza/events/gourmet ストーリーのcontent（実データ・DBには保存しない）。
//
//   node --import=tsx/esm src/lib/crawler/extractMatsuyaGourmetEvents.check.ts

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { discoverMatsuyaGourmetEventLinks, pickMatsuyaEventTitle } from './extractMatsuyaGourmetEvents'

const __dirname = dirname(fileURLToPath(import.meta.url))

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const gourmetFixture = JSON.parse(
  readFileSync(resolve(__dirname, '__fixtures__/matsuyaGourmetListing.fixture.json'), 'utf8'),
)

const cases: CheckCase[] = [
  {
    name: '実データfixture: 一覧ページから個別イベントページのURLを複数抽出する（一覧全体を1件にしない）',
    fn: () => {
      const links = discoverMatsuyaGourmetEventLinks(gourmetFixture)
      assert(links.length >= 5, `複数の個別ページを検出（実際 ${links.length}件）`)
      const slugs = links.map((l) => l.slug)
      assert(slugs.includes('ginza/events/food/sweets/ginza20260916'), '今週のGINZAスイートページを含む')
      assert(slugs.includes('ginza/events/food/silver-week-wine-fair-20260911'), 'ワインフェアページを含む')
      assert(slugs.includes('ginza/events/fairs/kakigouri-20260721'), 'かき氷コレクションページを含む')
    },
  },
  {
    name: 'コラム記事・レストランガイド・宅配サービスへのリンクは催事ページとして扱わない',
    fn: () => {
      const links = discoverMatsuyaGourmetEventLinks(gourmetFixture)
      const slugs = links.map((l) => l.slug)
      assert(!slugs.some((s) => s.includes('column')), 'columnは対象外')
      assert(!slugs.some((s) => s.includes('restaurant')), 'restaurantは対象外')
      assert(!slugs.some((s) => s.includes('services')), 'servicesは対象外')
    },
  },
  {
    name: '重複するcached_urlは1件にまとめる',
    fn: () => {
      const links = discoverMatsuyaGourmetEventLinks(gourmetFixture)
      const slugs = links.map((l) => l.slug)
      assert(new Set(slugs).size === slugs.length, '重複なし')
    },
  },
  {
    name: 'URLは https://www.matsuyaginza.com/jp/ 形式で組み立てる',
    fn: () => {
      const links = discoverMatsuyaGourmetEventLinks(gourmetFixture)
      assert(
        links.every((l) => l.url === `https://www.matsuyaginza.com/jp/${l.slug}`),
        'urlがslugから正しく組み立てられる',
      )
    },
  },
  {
    name: '空のcontentは空配列を返す（推測しない）',
    fn: () => {
      const links = discoverMatsuyaGourmetEventLinks({})
      assert(links.length === 0, '空配列')
    },
  },
  {
    name: 'pickMatsuyaEventTitle: story.nameが日本語の実タイトルならそのまま使う',
    fn: () => {
      const t = pickMatsuyaEventTitle('シルバーワインフェア20260911', '本文...')
      assert(t === 'シルバーワインフェア20260911', 'story.nameをそのまま使う')
    },
  },
  {
    name: 'pickMatsuyaEventTitle: story.nameが数字のみ（低品質）なら本文の最初の行で補う',
    fn: () => {
      const t = pickMatsuyaEventTitle('20260722', '松屋銀座からの贈りもの\n本文続き...')
      assert(t === '松屋銀座からの贈りもの', '本文の最初の行を使う')
    },
  },
  {
    name: 'pickMatsuyaEventTitle: 本文も空ならnullを返す（推測で作らない）',
    fn: () => {
      const t = pickMatsuyaEventTitle('20260722', '')
      assert(t === '20260722', 'story.name自体は返す（完全に情報が無いわけではない）')
      const t2 = pickMatsuyaEventTitle('', '')
      assert(t2 === null, '両方空ならnull')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('extractMatsuyaGourmetEvents', cases)
