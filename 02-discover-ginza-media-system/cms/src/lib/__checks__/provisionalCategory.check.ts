// GINZA WHISKERS / Project 02 — 暫定カテゴリー判定（provisionalCategory）回帰テスト。
// 2026-09-11：SWEETS を FOOD から分離した際の切り分けを中心に検証する。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { deriveProvisionalCategory, isCategoryResolved } from '../pipeline/provisionalCategory'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: 'SWEETS：菓子・デザート・アフタヌーンティーが主題ならSWEETS（FOOD/CAFEではない）',
    fn: () => {
      const cake = deriveProvisionalCategory({ title: '【秋季限定】栗とはちみつのパウンドケーキ', venue: null })
      assert(cake.category === 'SWEETS', `pound cake: ${cake.category}`)

      const tea = deriveProvisionalCategory({ title: '韓国ウェルネス アフタヌーンティー', venue: 'NAMIKI667' })
      assert(tea.category === 'SWEETS', `afternoon tea: ${tea.category}（CAFEではなくSWEETSであるべき）`)

      const wagashi = deriveProvisionalCategory({ title: '銀座もとじオリジナル 和菓子フェア', venue: null })
      assert(wagashi.category === 'SWEETS', `wagashi: ${wagashi.category}`)

      const monaka = deriveProvisionalCategory({ title: '季節限定 最中の詰め合わせ', venue: null })
      assert(monaka.category === 'SWEETS', `monaka: ${monaka.category}`)

      const macaron = deriveProvisionalCategory({ title: '新作マカロンコレクション', venue: null })
      assert(macaron.category === 'SWEETS', `macaron: ${macaron.category}`)
    },
  },
  {
    name: 'FOOD：単なる飲食店情報・食事メニューはFOODのまま（SWEETSに寄せない）',
    fn: () => {
      const restaurant = deriveProvisionalCategory({ title: '銀座グルメ フレンチビストロ新規オープン', venue: null })
      assert(restaurant.category === 'FOOD', `restaurant: ${restaurant.category}`)

      const bento = deriveProvisionalCategory({ title: '銀座三越 秋の惣菜・弁当フェア', venue: null })
      assert(bento.category === 'FOOD', `bento: ${bento.category}`)

      const bread = deriveProvisionalCategory({ title: '銀座木村家 新作食パン発売', venue: null })
      assert(bread.category === 'FOOD', `bread: ${bread.category}`)
    },
  },
  {
    name: 'CAFE：アフタヌーンティー以外の喫茶・カフェ情報はCAFEのまま',
    fn: () => {
      const cafe = deriveProvisionalCategory({ title: '銀座に新しい珈琲専門店がオープン', venue: null })
      assert(cafe.category === 'CAFE', `cafe: ${cafe.category}`)
    },
  },
  {
    name: 'basis=title・isCategoryResolvedがSWEETSでも機能する',
    fn: () => {
      const r = deriveProvisionalCategory({ title: '新作プリン特集', venue: null })
      assert(r.category === 'SWEETS' && r.basis === 'title', JSON.stringify(r))
      assert(isCategoryResolved(r.basis), 'SWEETS も isCategoryResolved=true')
    },
  },
  {
    name: 'primaryCategory=SWEETS（ArticleFacts確定済み）はそのまま採用される',
    fn: () => {
      const r = deriveProvisionalCategory({ primaryCategory: 'SWEETS', title: '何かのタイトル', venue: null })
      assert(r.category === 'SWEETS' && r.basis === 'primaryCategory', JSON.stringify(r))
    },
  },
]

export const suite = () => runSuite('provisionalCategory', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
