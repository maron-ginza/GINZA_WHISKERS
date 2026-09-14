// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：候補抽出の根本原因対応）
// excludeNonArticleCandidate の回帰テスト。
//
// 受入条件（マロン指示）を直接検証する：
//   ・管理文言をイベントとして扱わない（My account 等）
//   ・一覧ページを個別記事として扱わない
//   ・未承認情報も候補評価される（この関数自体はcurationStatusを見ない＝対象外）
//   ・本文を確認できないページ（一覧・索引ではないがexcerptがナビのみ）を除外する
//   ・URL構造で個別記事と確定しているページは、excerptが汚れていても除外しない
//     （タイトル・URLという信頼できる情報だけで候補として残す）

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { excludeNonArticleCandidate } from '../morning/excludeNonArticleCandidate'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: '一覧ページ（GINZA OFFICIAL /shopevent）→ excluded=true',
    fn: () => {
      const r = excludeNonArticleCandidate({
        sourceName: 'GINZA OFFICIAL',
        url: 'https://www.ginza.jp/shopevent',
        title: 'おすすめイベント・新着情報',
      })
      assert(r.excluded === true, 'excluded=true 期待')
      assert(r.pageKind === 'index', `pageKind=index 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: 'My account（管理文言）→ excluded=true（イベントとして扱わない）',
    fn: () => {
      const r = excludeNonArticleCandidate({
        sourceName: '木挽町よしや',
        url: 'https://kobikichoyoshiya.com/my-account',
        title: 'My account | 木挽町よしや',
      })
      assert(r.excluded === true, 'excluded=true 期待')
    },
  },
  {
    name: '本文を確認できないページ（URL構造は未確定・excerptがナビのみ）→ excluded=true',
    fn: () => {
      const r = excludeNonArticleCandidate({
        sourceName: 'SHISEIDO GALLERY',
        url: 'https://gallery.shiseido.com/jp/artegg/prize',
        title: 'shiseido art egg賞 | SHISEIDO GALLERY',
        excerpt:
          'オンラインで楽しむ オンラインで楽しむ 360°VR 展示風景 アーティスト・トーク 来館のご案内 当館について 営業時間／アクセス フロアガイド 開催中の展覧会 次回の展覧会 過去の展覧会 カタログなど出版物 PRESS RELEASE ENGLISH',
      })
      assert(r.excluded === true, 'excluded=true 期待')
      assert(r.bodyUsable === false, 'bodyUsable=false 期待')
    },
  },
  {
    name: 'URL構造で個別記事と確定 → excerptが汚れていても除外しない（タイトル・URLは信頼できる情報として残す）',
    fn: () => {
      const r = excludeNonArticleCandidate({
        sourceName: 'GINZA OFFICIAL',
        url: 'https://www.ginza.jp/shopnews/shopnews-joliesse/35814',
        title: '【ジョリエス】華雅展',
        excerpt:
          '銀座公式ウェブサイト jp en ch トップ トップ 銀座を探訪する 食べる 買う 美と健康 体験 不動産・人材・金融 大型専門店 百貨店・モール',
      })
      assert(r.excluded === false, `excluded=false 期待（URL構造で個別記事確定のため） / 実際 excluded=${r.excluded} reasons=${r.reasons.join(',')}`)
      assert(r.pageKind === 'article', `pageKind=article 期待 / 実際 ${r.pageKind}`)
    },
  },
  {
    name: '正常な個別記事（本文もURLも問題なし）→ excluded=false',
    fn: () => {
      const r = excludeNonArticleCandidate({
        sourceName: '相田みつを美術館',
        url: 'https://www.mitsuo.co.jp/news/detail_20260901.html',
        title: '作品紹介「松も時なり竹も時なり―いのちと時間」',
        excerpt: '2026.09.01 【作品紹介】道元禅師のことばに、松も時なり、竹も時なりというのがあります。人間がね、毎日を夢中で生きているわけですが、道元禅師の言われる時間はそういうものではないんです。',
      })
      assert(r.excluded === false, `excluded=false 期待 / 実際 excluded=${r.excluded} reasons=${r.reasons.join(',')}`)
    },
  },
  {
    name: '判定材料が乏しい候補は過剰除外しない（URL不明・title不明・excerptもnull）→ excluded=false',
    fn: () => {
      const r = excludeNonArticleCandidate({ sourceName: null, url: null, title: null, excerpt: null })
      assert(r.excluded === false, `根拠不足では除外しない（推測で除外しない） / 実際 excluded=${r.excluded}`)
    },
  },
]

export const suite = () => runSuite('excludeNonArticleCandidate', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
