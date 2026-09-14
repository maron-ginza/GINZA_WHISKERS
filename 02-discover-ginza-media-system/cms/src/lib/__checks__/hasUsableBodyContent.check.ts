// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：候補抽出の根本原因対応）
// hasUsableBodyContent の回帰テスト。フィクスチャは実データ（GINZA OFFICIAL・
// SHISEIDO GALLERY の実 excerpt、2026-09-14 実データ調査で確認）に基づく。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { hasUsableBodyContent } from '../morning/hasUsableBodyContent'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: 'GINZA OFFICIAL の実excerpt（サイト共通ナビのみ・華雅展本文なし）→ usable=false',
    fn: () => {
      const excerpt =
        '【ジョリエス】華雅展 | おすすめイベント・新着情報 | 銀座のイベント情報 | お知らせ・新着情報 | GINZA OFFICIAL – 銀座公式ウェブサイト 銀座公式ウェブサイト jp en ch トップ トップ 銀座を探訪する 銀座を探訪する 食べる 買う 美と健康 体験 不動産・人材・金融 大型専門店 百貨店・モール ホテル お知らせ・新着情報 お知らせ・新着情報 GINZA OFFICIALおすすめニュース 街からのお知らせ 銀座のイベント情報 タウンガイド・観光案内 タウンガイド・観光案内 GINZA Q&A バリアフリートイレ 観光案内所 喫煙所マップ 街歩きマップ 歩行者天国'
      const r = hasUsableBodyContent(excerpt)
      assert(r.usable === false, `usable=false 期待 / 実際 ${r.usable}`)
      assert(r.matchedTokens.length >= 4, `ナビ語4件以上の一致を期待 / 実際 ${r.matchedTokens.length}`)
    },
  },
  {
    name: 'SHISEIDO GALLERY の実excerpt（賞制度ページの共通ナビのみ）→ usable=false',
    fn: () => {
      const excerpt =
        'shiseido art egg賞 | SHISEIDO GALLERY オンラインで楽しむ オンラインで楽しむ 360°VR --> 展示風景 アーティスト・トーク 来館のご案内 当館について 営業時間／アクセス フロアガイド 展覧会 開催中の展覧会 次回の展覧会 過去の展覧会 第八次椿会 イベント 年間スケジュール shiseido art egg shiseido art eggとは 応募要項／応募用紙／会場図面 Q&A 審査結果 shiseido art egg賞 カタログなど出版物 展覧会カタログ PRESS RELEASE ENGLISH'
      const r = hasUsableBodyContent(excerpt)
      assert(r.usable === false, `usable=false 期待 / 実際 ${r.usable}`)
    },
  },
  {
    name: '正常な本文プローズ（相田みつを美術館の実excerpt）→ usable=true',
    fn: () => {
      const excerpt =
        '作品紹介「松も時なり竹も時なり―いのちと時間」｜コラムとInstagramリール動画の紹介｜相田みつを美術館 - Mitsuo Aida Museum 2026.09.01 【作品紹介】 「松も時なり竹も時なり―いのちと時間」 コラムとInstagramリール動画 公開のお知らせ ＜ 松も時なり竹も時なり―いのちと時間 ＞ 相田みつを すこし理屈ッぽいこといいますが、ごめんなさいね、 道元禅師のことばに、 松も時なり、竹も時なり というのがあります。'
      const r = hasUsableBodyContent(excerpt)
      assert(r.usable === true, `usable=true 期待 / 実際 ${r.usable}（reason: ${r.reason}）`)
    },
  },
  {
    name: '空・極端に短いexcerpt → usable=true（判定材料が無いだけで、汚染の証拠ではないため過剰除外しない）',
    fn: () => {
      assert(hasUsableBodyContent('').usable === true, '空文字は判定材料なし＝除外しない')
      assert(hasUsableBodyContent(null).usable === true, 'nullは判定材料なし＝除外しない')
      assert(hasUsableBodyContent('短い').usable === true, '20文字未満は判定材料なし＝除外しない')
    },
  },
  {
    name: 'ナビ語が1〜3件だけ混じる正常本文は過剰除外しない（usable=true維持）',
    fn: () => {
      // 「イベント」等の一般語ではなく、NAV_MENU_TOKENSに含まれる固有ナビ語が
      // 1〜2件だけ本文中に自然に出現するケース（サイト名の言及等）を過剰除外しない。
      const excerpt =
        '当店は銀座の老舗和菓子店です。会社概要にもございますとおり、創業以来変わらぬ味を守り続けております。この度、季節限定の新商品を発売いたします。詳細は店頭でご確認ください。'
      const r = hasUsableBodyContent(excerpt)
      assert(r.usable === true, `usable=true 期待（過剰除外していないか） / 実際 ${r.usable}`)
    },
  },
  {
    name: '価格表断片（「円」多数・パイプ区切り多数）→ usable=false',
    fn: () => {
      const excerpt = '商品A 1,200円 | 商品B 2,400円 | 商品C 3,600円 | 商品D 4,800円 | 商品E 6,000円 | 商品F 7,200円 | 商品G 8,400円'
      const r = hasUsableBodyContent(excerpt)
      assert(r.usable === false, `usable=false 期待 / 実際 ${r.usable}`)
    },
  },
]

export const suite = () => runSuite('hasUsableBodyContent', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
