// GINZA WHISKERS / Project 02（2026-09-16続き8）— 銀座三越 食料品催事抽出の回帰テスト。
//
// 【fixtureについての重要な注記】銀座三越（mistore.jp）はネットワーク層で接続
// タイムアウトが継続しており（2026-09-16実測確認・既存調査と同一原因）、実際の
// HTMLを取得・確認できていない。以下のfixtureテキストは、マロンが確認した
// 2026-09-16時点の実在情報（ブランド名・商品名・開催/販売期間）をそのまま使い、
// テキスト構造（1催事＝空行区切りのブロック）は一般的な催事カレンダー形式からの
// 想定である——実際のmistore.jpページの構造と一致するかは確認できていない。
//
//   node --import=tsx/esm src/lib/crawler/extractMitsukoshiGinzaFoodEvents.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { extractMitsukoshiGinzaFoodEvents } from './extractMitsukoshiGinzaFoodEvents'
import { extractExplicitPeriod } from '../pipeline/extractExplicitPeriod'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

// マロン確認済みの実在情報（2026-09-16）をそのまま使ったfixture。
const FIXTURE_TEXT = `アンリ・シャルパンティエ　期間限定出店
2026年9月14日(月)〜9月29日(火)
シャインマスカットのタルト
栗のモンブラン

恵那寿や
2026年9月16日(水)〜9月23日(水)
栗きんとん

京都北山マールブランシュ
2026年9月16日(水)〜9月22日(火)
お濃茶ラングドシャ

BELTZ
2026年9月16日(水)〜9月22日(火)
バスクチーズケーキ`

const periodExtractor = (line: string) => extractExplicitPeriod(line)

const cases: CheckCase[] = [
  {
    name: 'マロン確認済み実データfixture: 4催事すべてを個別候補として抽出する',
    fn: () => {
      const result = extractMitsukoshiGinzaFoodEvents(FIXTURE_TEXT, periodExtractor)
      assert(result.length === 4, `4件抽出（実際 ${result.length}）`)
      const brands = result.map((r) => r.brand)
      assert(brands.includes('アンリ・シャルパンティエ　期間限定出店'), 'アンリ・シャルパンティエを含む')
      assert(brands.includes('恵那寿や'), '恵那寿やを含む')
      assert(brands.includes('京都北山マールブランシュ'), '京都北山マールブランシュを含む')
      assert(brands.includes('BELTZ'), 'BELTZを含む')
    },
  },
  {
    name: 'アンリ・シャルパンティエ: 商品2件（シャインマスカット・栗のモンブラン）と期間9/14〜9/29を抽出する',
    fn: () => {
      const result = extractMitsukoshiGinzaFoodEvents(FIXTURE_TEXT, periodExtractor)
      const henri = result.find((r) => r.brand.includes('アンリ・シャルパンティエ'))!
      assert(henri.products.length === 2, `商品2件（実際 ${henri.products.length}）`)
      assert(henri.products.some((p) => p.includes('シャインマスカット')), 'シャインマスカット商品を含む')
      assert(henri.products.some((p) => p.includes('栗のモンブラン')), '栗のモンブラン商品を含む')
      assert(henri.startIso?.startsWith('2026-09-14'), `開始日2026-09-14（実際 ${henri.startIso}）`)
      assert(henri.endIso?.startsWith('2026-09-29'), `終了日2026-09-29（実際 ${henri.endIso}）`)
    },
  },
  {
    name: '恵那寿や: 商品「栗きんとん」と期間9/16〜9/23を抽出する',
    fn: () => {
      const result = extractMitsukoshiGinzaFoodEvents(FIXTURE_TEXT, periodExtractor)
      const enazuya = result.find((r) => r.brand === '恵那寿や')!
      assert(enazuya.products.some((p) => p.includes('栗きんとん')), '栗きんとんを含む')
      assert(enazuya.startIso?.startsWith('2026-09-16') && enazuya.endIso?.startsWith('2026-09-23'), '期間9/16〜9/23')
    },
  },
  {
    name: '京都北山マールブランシュ・BELTZ: 期間9/16〜9/22を抽出する',
    fn: () => {
      const result = extractMitsukoshiGinzaFoodEvents(FIXTURE_TEXT, periodExtractor)
      const maru = result.find((r) => r.brand === '京都北山マールブランシュ')!
      const beltz = result.find((r) => r.brand === 'BELTZ')!
      assert(maru.startIso?.startsWith('2026-09-16') && maru.endIso?.startsWith('2026-09-22'), 'マールブランシュ期間')
      assert(beltz.products.some((p) => p.includes('バスクチーズケーキ')), 'BELTZのバスクチーズケーキを含む')
      assert(beltz.startIso?.startsWith('2026-09-16') && beltz.endIso?.startsWith('2026-09-22'), 'BELTZ期間')
    },
  },
  {
    name: '期間が本文中に見つからない催事は startIso/endIso が null（推測で埋めない）',
    fn: () => {
      const result = extractMitsukoshiGinzaFoodEvents('謎の催事\n詳細不明の商品', periodExtractor)
      assert(result.length === 1 && result[0].startIso === null && result[0].endIso === null, '期間なしはnullのまま')
    },
  },
  {
    name: '空テキストは空配列を返す',
    fn: () => {
      assert(extractMitsukoshiGinzaFoodEvents('', periodExtractor).length === 0, '空配列')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('extractMitsukoshiGinzaFoodEvents', cases)
