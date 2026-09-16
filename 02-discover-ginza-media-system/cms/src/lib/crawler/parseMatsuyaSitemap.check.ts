// GINZA WHISKERS / Project 02（2026-09-16続き8）— 松屋銀座sitemap.xmlパースの回帰テスト。
//
//   node --import=tsx/esm src/lib/crawler/parseMatsuyaSitemap.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { parseMatsuyaSweetsWeeklyUrlsFromSitemap } from './parseMatsuyaSitemap'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

// 実際のsitemap.xml（2026-09-16取得）から抜粋した3パターンのスラッグを含むfixture。
// 無接頭辞／"sweet"接頭辞／"ginza"接頭辞のいずれも実データで確認済み。
const SITEMAP_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.matsuyaginza.com/jp/ginza/events/food/sweets/20260215</loc></url>
  <url><loc>https://www.matsuyaginza.com/jp/ginza/events/food/sweets/sweet20260527</loc></url>
  <url><loc>https://www.matsuyaginza.com/jp/ginza/events/food/sweets/ginza20260916</loc></url>
  <url><loc>https://www.matsuyaginza.com/jp/ginza/events/gourmet</loc></url>
  <url><loc>https://www.matsuyaginza.com/jp/ginza/floor</loc></url>
</urlset>`

const cases: CheckCase[] = [
  {
    name: '無接頭辞（YYYYMMDDのみ）のスラッグを拾う',
    fn: () => {
      const urls = parseMatsuyaSweetsWeeklyUrlsFromSitemap(SITEMAP_FIXTURE)
      assert(urls.some((u) => u.slug === 'ginza/events/food/sweets/20260215' && u.date === '20260215'), '無接頭辞スラッグを検出')
    },
  },
  {
    name: '【回帰・不具合修正】"sweet"接頭辞つきスラッグ（2026-05-27〜07-08に実在）も拾う',
    fn: () => {
      const urls = parseMatsuyaSweetsWeeklyUrlsFromSitemap(SITEMAP_FIXTURE)
      const hit = urls.find((u) => u.slug === 'ginza/events/food/sweets/sweet20260527')
      assert(!!hit, '"sweet"接頭辞スラッグを検出（旧実装は\\d{8}のみで取りこぼしていた）')
      assert(hit?.date === '20260527', '日付部分だけを正しく抽出（接頭辞を含めない）')
    },
  },
  {
    name: '【回帰・不具合修正】"ginza"接頭辞つきスラッグ（2026-09-16週に実在）も拾う——SWEETS 0件の直接原因',
    fn: () => {
      const urls = parseMatsuyaSweetsWeeklyUrlsFromSitemap(SITEMAP_FIXTURE)
      const hit = urls.find((u) => u.slug === 'ginza/events/food/sweets/ginza20260916')
      assert(!!hit, '"ginza"接頭辞スラッグを検出')
      assert(hit?.date === '20260916', '日付部分だけを正しく抽出')
      assert(hit?.url === 'https://www.matsuyaginza.com/jp/ginza/events/food/sweets/ginza20260916', 'urlはjp/を含むフルパス')
    },
  },
  {
    name: 'sweets/以外のイベントページ（gourmet, floor等）は対象に含めない',
    fn: () => {
      const urls = parseMatsuyaSweetsWeeklyUrlsFromSitemap(SITEMAP_FIXTURE)
      assert(!urls.some((u) => u.slug.includes('gourmet') || u.slug.includes('floor')), 'sweets/以外は拾わない')
    },
  },
  {
    name: '日付昇順にソートされる',
    fn: () => {
      const urls = parseMatsuyaSweetsWeeklyUrlsFromSitemap(SITEMAP_FIXTURE)
      const dates = urls.map((u) => u.date)
      const sorted = [...dates].sort((a, b) => a.localeCompare(b))
      assert(JSON.stringify(dates) === JSON.stringify(sorted), '昇順ソート済み')
    },
  },
  {
    name: '空のXMLは空配列を返す（推測しない）',
    fn: () => {
      const urls = parseMatsuyaSweetsWeeklyUrlsFromSitemap('<urlset></urlset>')
      assert(urls.length === 0, '空配列')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('parseMatsuyaSitemap', cases)
