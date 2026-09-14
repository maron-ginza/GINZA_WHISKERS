// URL 粒度判定（classifyUrlGranularity）の回帰テスト。
// 年度別アーカイブ・一覧ナビ・ページ送り・店舗案内を「個別記事ではない」と弾く。
import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { classifyUrlGranularity } from '../crawler/urlGranularity'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}
const g = (url: string, a?: string, t?: string) => classifyUrlGranularity(url, a ?? null, t ?? null)

const cases: CheckCase[] = [
  // --- 年度別アーカイブ（資生堂パーラーで実際に誤取得された形） ---
  { name: '/news/2025 → archive（個別でない）', fn: () => { const r = g('https://parlour.shiseido.co.jp/news/2025', '2025'); assert(r.granularity === 'archive' && !r.isIndividual, r.granularity) } },
  { name: '/news/2014 → archive', fn: () => assert(g('https://parlour.shiseido.co.jp/news/2014', '2014').granularity === 'archive', 'archive') },
  { name: '/news/2026/ 末尾スラッシュ → listing（news 一覧）', fn: () => assert(!g('https://parlour.shiseido.co.jp/news/2026/').isIndividual, 'not individual') },
  { name: 'アンカーが「2025」だけ → archive', fn: () => assert(g('https://example.com/x/y', '2025').granularity === 'archive', 'archive') },
  { name: '年月アーカイブ /blog/2026-09 → archive', fn: () => assert(g('https://example.com/blog/2026-09').granularity === 'archive', 'archive') },
  { name: 'パスに /archive/ → archive', fn: () => assert(g('https://example.com/news/archive/foo').granularity === 'archive', 'archive') },

  // --- 一覧・索引 ---
  { name: '/news → listing', fn: () => assert(g('https://parlour.shiseido.co.jp/news').granularity === 'listing', 'listing') },
  { name: '/news/ → listing', fn: () => assert(g('https://x.com/news/').granularity === 'listing', 'listing') },
  { name: '/exhibition/ → listing', fn: () => assert(g('https://x.com/exhibition/').granularity === 'listing', 'listing') },
  { name: 'ルート → listing', fn: () => assert(g('https://x.com/').granularity === 'listing', 'listing') },
  { name: 'アンカーが「一覧を見る」 → listing', fn: () => assert(g('https://x.com/foo/bar123', '一覧を見る').granularity === 'listing', 'listing') },

  // --- ページ送り ---
  { name: '?page=3 → pagination', fn: () => assert(g('https://x.com/news/list?page=3').granularity === 'pagination', 'pagination') },
  { name: '/page/2 → pagination', fn: () => assert(g('https://x.com/news/page/2').granularity === 'pagination', 'pagination') },
  { name: 'アンカー「次へ」 → pagination', fn: () => assert(g('https://x.com/foo/bar123', '次へ').granularity === 'pagination', 'pagination') },

  // --- 店舗・施設案内（資生堂パーラーで誤取得された /bar/s, /shoplist/... 形） ---
  { name: '/bar/s → section（日付明記なし）', fn: () => assert(g('https://parlour.shiseido.co.jp/bar/s', 'Bar').granularity === 'section', 'section') },
  { name: '/shoplist/salondecafeginza → section', fn: () => { const r = g('https://parlour.shiseido.co.jp/shoplist/salondecafeginza', '銀座本店サロン・ド・カフェ'); assert(r.granularity === 'section' && !r.isIndividual, r.granularity) } },
  { name: '/access → section', fn: () => assert(g('https://x.com/access').granularity === 'section', 'section') },
  { name: '店舗ディレクトリでも日付明記があれば section にしない', fn: () => assert(g('https://x.com/shop/spring-fair-2026', '春のフェア 2026年3月1日〜3月31日開催').granularity !== 'section', 'not section') },

  // --- 個別記事（弾かない） ---
  { name: '記事ID付き /news/detail/12345 → individual', fn: () => assert(g('https://x.com/news/detail/12345', 'テスト個展のお知らせ').isIndividual, 'individual') },
  { name: 'スラッグ /event/art/56496-1404070828.html → individual', fn: () => assert(g('https://store.tsite.jp/ginza/event/art/56496-1404070828.html', '【フェア】原画展').isIndividual, 'individual') },
  { name: 'ハイフン付きスラッグ /news/spring-tea-fair → individual', fn: () => assert(g('https://x.com/news/spring-tea-fair', '春の新茶フェア').isIndividual, 'individual') },
  { name: '開催日明記があれば individual（スラッグ弱くても）', fn: () => assert(g('https://x.com/topics/abc', '開催期間 2026年9月1日〜9月15日 九谷焼展').isIndividual, 'individual') },

  // --- 判定不能は unknown（推測しない・individual にしない） ---
  { name: '短い無味スラッグ /x/ab → unknown（individual にしない）', fn: () => { const r = g('https://example.com/x/ab'); assert(r.granularity === 'unknown' && !r.isIndividual, r.granularity) } },
]

export const suite = () => runSuite('urlGranularity', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
