import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { flattenStoryblokRichText, flattenMatsuyaStoryblokStory } from '../crawler/flattenStoryblokRichText'
import { extractMatsuyaSweetsWeekly } from '../crawler/extractMatsuyaSweetsWeekly'
import { runSuite, type CheckCase } from './_harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 2026-09-14、松屋銀座公式サイトのStoryblok公開Content Delivery APIから実際に
// 取得したストーリー（https://www.matsuyaginza.com/jp/ginza/events/food/sweets/20260909）
// のrichTextブロックのみを抜き出したフィクスチャ（画像・banner等のノイズは除去済み）。
const FIXTURE_PATH = resolve(__dirname, '../crawler/__fixtures__/matsuyaStoryblokStory.fixture.json')
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))

const cases: CheckCase[] = [
  {
    name: '同一段落内のtextノードは区切りを入れずに連結する（スタイル分割された1文の復元）',
    fn: () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '地下1' },
              { type: 'text', text: 'F GINZAスイート' },
              { type: 'hard_break' },
              { type: 'text', text: '2026年' },
              { type: 'text', text: '9月9日(水)－15日(火)' },
            ],
          },
        ],
      }
      const flat = flattenStoryblokRichText(doc)
      assert.ok(flat.includes('地下1F GINZAスイート'), flat)
      assert.ok(flat.includes('2026年9月9日(水)－15日(火)'), flat)
    },
  },
  {
    name: '段落・見出しの間には空行を入れる',
    fn: () => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'heading', content: [{ type: 'text', text: '見出し' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '本文' }] },
        ],
      }
      assert.equal(flattenStoryblokRichText(doc), '見出し\n\n本文')
    },
  },
  {
    name: '実データフィクスチャ：flattenMatsuyaStoryblokStory → extractMatsuyaSweetsWeeklyで店舗・商品・価格・期間を正しく抽出できる',
    fn: () => {
      const flat = flattenMatsuyaStoryblokStory(FIXTURE)
      const parsed = extractMatsuyaSweetsWeekly(flat)
      assert.equal(parsed.periodText, '2026年9月9日(水)－15日(火)', flat.slice(0, 300))
      assert.ok(parsed.location?.includes('地下1F'), parsed.location ?? 'null')
      const shirotae = parsed.items.find((i) => i.vendorName === '西洋菓子 しろたえ')
      assert.ok(shirotae, JSON.stringify(parsed.items.map((i) => i.vendorName)))
      assert.ok(shirotae!.products.some((p) => p.name === 'レアチーズケーキ' && p.priceYen === 341), JSON.stringify(shirotae!.products))
      assert.ok(shirotae!.products.some((p) => p.name === 'シュークリーム' && p.priceYen === 281), JSON.stringify(shirotae!.products))
      const jikka = parsed.items.find((i) => i.vendorName === 'ジッカ')
      assert.ok(jikka?.products.some((p) => p.name === '神紅と多伎いちじくのタルト' && p.priceYen === 831), JSON.stringify(jikka?.products))
    },
  },
  {
    name: 'body配列が無い・richTextが無いストーリーは空文字を返す（推測しない）',
    fn: () => {
      assert.equal(flattenMatsuyaStoryblokStory({}), '')
      assert.equal(flattenMatsuyaStoryblokStory({ body: [{ component: 'image' }] }), '')
      assert.equal(flattenMatsuyaStoryblokStory(null), '')
    },
  },
]

export const suite = () => runSuite('flattenStoryblokRichText', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} flattenStoryblokRichText (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
