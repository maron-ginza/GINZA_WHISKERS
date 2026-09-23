import assert from 'node:assert/strict'

import { extractMatsuyaSweetsWeekly } from '../crawler/extractMatsuyaSweetsWeekly'
import { runSuite, type CheckCase } from './_harness'

// 2026-09-14、fetchJsRenderedPage（playwright-core経由の実ブラウザ）で実際に
// https://www.matsuyaginza.com/jp/ginza/events/food/sweets/20260909 から
// 取得した document.body.innerText の実データ（該当部分を抜粋）。
const REAL_FIXTURE = `重要なお知らせ
今週の​GINZAスイート
＜清月堂本店＞
＜ジッカ＞
＜西洋菓子 しろたえ＞

地下1F GINZAスイート
2026年9月9日(水)－​15日(火)

＜銀座 清月堂本店＞
抹茶クラッシュゼリーラテ
990円

和菓子職人が作った新感覚スイーツを期間限定で販売。
当店自慢の滑らかなこしあんと飲みやすくクラッシュした抹茶ゼリーを重ね、ミルクを注ぎ、「芳翠園」の宇治抹茶を点てて仕上げました。

＜ジッカ＞
神紅と多伎いちじくのタルト
831円

島根県の秋の味覚【神紅】と【多伎いちじく】の二つをトンカ豆の香りとカシスと共に贅沢に組み合わせたタルト。

※11日(金)・12日(土)は＜西洋菓子 しろたえ＞出店のため休業となります。

＜西洋菓子 しろたえ＞
レアチーズケーキ　341円
シュークリーム　281円

レアチーズケーキ
サクサクのサブレとチーズがとてもバランスよく、おいしいチーズケーキです。

シュークリーム
なめらかなクリームと薄くふんわりとしたシュー生地が相性抜群です。

※9月11日(金)・12日(土)での出店

※表示価格は​すべて​税込です。
※画像は​イメージです。
※売り​切れの​際は​ご容赦ください。`

const cases: CheckCase[] = [
  {
    name: '実データ：開催期間・場所を明記どおりに抽出する',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly(REAL_FIXTURE)
      assert.equal(r.periodText, '2026年9月9日(水)－15日(火)')
      assert.ok(r.location?.includes('地下1F'), r.location ?? 'null')
    },
  },
  {
    name: '実データ：ヘッダー部の＜店舗名＞見出し一覧と本文の＜店舗名＞ブロックが混在しても、本文側の3店舗を正しく抽出する',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly(REAL_FIXTURE)
      const names = r.items.map((i) => i.vendorName)
      // ヘッダーの短い「＜清月堂本店＞」も1ブロックとして拾われるが、
      // 本文側の正式名「＜銀座 清月堂本店＞」ブロックに商品・価格が入っていることを確認する
      const kiyotsukido = r.items.find((i) => i.vendorName === '銀座 清月堂本店')
      assert.ok(kiyotsukido, `names=${JSON.stringify(names)}`)
      assert.equal(kiyotsukido!.products[0]?.name, '抹茶クラッシュゼリーラテ')
      assert.equal(kiyotsukido!.products[0]?.priceYen, 990)
    },
  },
  {
    name: '商品名+価格が別行（価格のみの行）のパターンを正しく紐づける',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly(REAL_FIXTURE)
      const jikka = r.items.find((i) => i.vendorName === 'ジッカ')
      assert.ok(jikka)
      assert.equal(jikka!.products[0]?.name, '神紅と多伎いちじくのタルト')
      assert.equal(jikka!.products[0]?.priceYen, 831)
    },
  },
  {
    name: '商品名+価格が同一行（複数商品）のパターンを正しく分割する',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly(REAL_FIXTURE)
      const shirotae = r.items.find((i) => i.vendorName === '西洋菓子 しろたえ')
      assert.ok(shirotae)
      assert.equal(shirotae!.products.length, 2, JSON.stringify(shirotae!.products))
      assert.ok(shirotae!.products.some((p) => p.name === 'レアチーズケーキ' && p.priceYen === 341))
      assert.ok(shirotae!.products.some((p) => p.name === 'シュークリーム' && p.priceYen === 281))
    },
  },
  {
    name: '「※」で始まる注記はcaveatへ、説明文はdescriptionへ分離される',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly(REAL_FIXTURE)
      const jikka = r.items.find((i) => i.vendorName === 'ジッカ')!
      assert.ok(jikka.description.includes('島根県の秋の味覚'), jikka.description)
      const shirotae = r.items.find((i) => i.vendorName === '西洋菓子 しろたえ')!
      assert.ok(shirotae.caveat.includes('9月11日'), shirotae.caveat)
    },
  },
  {
    // 【2026-09-25追加・実障害の再発防止】2026-09-23（秋分の日）週の実データで
    // WebFetch再確認して判明。従来のPERIOD_REは[日月火水木金土]単独文字しか
    // 許容しておらず、祝日が絡む「(祝・水)」表記で期間抽出全体が失敗していた
    // （DC#1450/#1451でeventStartAt/eventEndAtがNULLのまま保存されていたことを
    // DBで確認済み）。
    name: '実データ：開始日が祝日「(祝・水)」表記の週でも開催期間を抽出できる（2026-09-23週）',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly('地下1F GINZAスイート\n2026年9月23日(祝・水)－​29日(火)\n\n＜某店＞\n商品A\n500円')
      assert.equal(r.periodText, '2026年9月23日(祝・水)－29日(火)')
    },
  },
  {
    name: '期間・店舗ブロックが無いテキストでは null／空配列を返す（推測しない）',
    fn: () => {
      const r = extractMatsuyaSweetsWeekly('特にイベント情報のないページです。')
      assert.equal(r.periodText, null)
      assert.equal(r.items.length, 0)
    },
  },
]

export const suite = () => runSuite('extractMatsuyaSweetsWeekly', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} extractMatsuyaSweetsWeekly (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
