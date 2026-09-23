// GINZA WHISKERS / Project 02（2026-09-24）— normalizeUrl（isNonHtmlResourcePath）の回帰テスト。
//
// 【背景】9/24 6:00の sweets_detail_fetch 全36件不成功の原因調査で、
// discoverFeedCandidates.ts が sitemap/feed 探索時に拾った JS/CSS/XML/XSL/
// gzip圧縮サイトマップ等が isNonHtmlResourcePath の対象拡張子リストに
// 含まれておらず候補として通過していたことが判明した。再発防止のテスト。
//
//   node --import=tsx/esm src/lib/crawler/normalizeUrl.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { isNonHtmlResourcePath } from './normalizeUrl'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '既存の非HTML拡張子（PDF/画像等）は引き続き除外される',
    fn: () => {
      assert(isNonHtmlResourcePath('https://example.com/a.pdf') === true, 'PDF')
      assert(isNonHtmlResourcePath('https://example.com/a.png') === true, 'PNG')
    },
  },
  {
    name: '【2026-09-24追加】JS/CSS/JSONアセットは非HTMLとして除外される（実例：松崎煎餅のwp-embed.min.js等）',
    fn: () => {
      assert(isNonHtmlResourcePath('https://matsuzaki-senbei.com/system/wp-includes/js/wp-embed.min.js') === true, 'JS')
      assert(isNonHtmlResourcePath('https://matsuzaki-senbei.com/system/wp-content/themes/x/style_new.css') === true, 'CSS')
      assert(isNonHtmlResourcePath('https://example.com/wp-json/index.json') === true, 'JSON')
    },
  },
  {
    name: '【2026-09-24追加】sitemap/XSLスタイルシートは非HTMLとして除外される（実例：源吉兆庵のwp-sitemap-index.xsl等）',
    fn: () => {
      assert(isNonHtmlResourcePath('https://www.kitchoan.co.jp/wp-sitemap-index.xsl') === true, 'XSL')
      assert(isNonHtmlResourcePath('https://kobikichoyoshiya.com/wp-sitemap.xsl') === true, 'XSL2')
      assert(isNonHtmlResourcePath('https://ginza-akebono.co.jp/wp-sitemap-index.xsl') === true, 'XSL3')
    },
  },
  {
    name: '【2026-09-24追加】gzip圧縮サイトマップ（.xml.gz）は非HTMLとして除外される（実例：GODIVAのSitemap_1.xml.gz等）',
    fn: () => {
      assert(isNonHtmlResourcePath('https://www.godiva.co.jp/Sitemap_1.xml.gz') === true, 'xml.gz')
    },
  },
  {
    name: '実際の記事・イベントページ（拡張子なし）は非HTML判定されない',
    fn: () => {
      assert(isNonHtmlResourcePath('https://example.com/news/2026-09-24-sweets-fair') === false, '実記事は非HTMLでない')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('normalizeUrl', cases)
