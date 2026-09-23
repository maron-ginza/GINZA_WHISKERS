// GINZA WHISKERS / Project 02（2026-09-24）— discoverFeedCandidates
// （extractUrlsFromFeedBody）の回帰テスト。ネットワーク・DB・AIは一切使わない
// 純粋関数のみを対象にする。
//
// 【背景】9/24 6:00の sweets_detail_fetch 全36件不成功の原因調査で、
// bareRe（プレーンなhttps URLフォールバック抽出）の除外文字集合に `]` が
// 無かったため、CDATA終端直前のURL（`<![CDATA[https://.../foo.xml]]>`）で
// 閉じ括弧 `]]` までを1つのURLとして誤って取り込んでいたことが判明した
// （実例：銀座菊廼舎の `post-archive-sitemap.xml]]`）。
//
//   node --import=tsx/esm src/lib/crawler/discoverFeedCandidates.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { extractUrlsFromFeedBody } from './discoverFeedCandidates'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '<loc>タグのURLを抽出する（通常のsitemap.xml）',
    fn: () => {
      const xml = '<urlset><url><loc>https://example.com/news/foo</loc></url></urlset>'
      const urls = extractUrlsFromFeedBody(xml)
      assert(urls.includes('https://example.com/news/foo'), 'locタグのURLを抽出できるはず')
    },
  },
  {
    name: '【2026-09-24追加・実障害の再発防止】CDATA終端直前のURLに `]]` を巻き込まない（実例：銀座菊廼舎）',
    fn: () => {
      const xml = '<urlset><url><loc><![CDATA[https://www.ginza-kikunoya.co.jp/post-archive-sitemap.xml]]></loc></url></urlset>'
      const urls = extractUrlsFromFeedBody(xml)
      assert(
        urls.includes('https://www.ginza-kikunoya.co.jp/post-archive-sitemap.xml'),
        `正しいURL（末尾に]]を含まない）が抽出されるはず（実際 ${JSON.stringify(urls)}）`,
      )
      assert(
        !urls.some((u) => u.endsWith(']]') || u.includes(']')),
        `末尾に ]] が付いたURLを抽出してはいけない（実際 ${JSON.stringify(urls)}）`,
      )
    },
  },
  {
    name: 'bareRe フォールバックでも角括弧に囲まれたURLは角括弧を含まずに抽出される',
    fn: () => {
      const text = '本文中の参考リンク [https://example.com/a/b] です'
      const urls = extractUrlsFromFeedBody(text)
      assert(urls.includes('https://example.com/a/b'), `角括弧を含まないURLが抽出されるはず（実際 ${JSON.stringify(urls)}）`)
    },
  },
  {
    name: 'RSS <link>タグのURLを抽出する',
    fn: () => {
      const rss = '<item><link>https://example.com/news/bar</link></item>'
      const urls = extractUrlsFromFeedBody(rss)
      assert(urls.includes('https://example.com/news/bar'), 'RSS linkタグのURLを抽出できるはず')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('discoverFeedCandidates', cases)
