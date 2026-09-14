// GINZA WHISKERS / Project 02 — CROSS CULTURE FILTER 回帰テスト（2026-09-04）
//
//   ・決定的スコアリング（同じ入力 → 同じ出力）
//   ・しきい値のバケット分け（>=70 派生 / 50-69 編集 / <50 除外）
//   ・5市場すべて < 50 なら mode='normal_only'
//   ・有料候補は「文化差の解説 / 比較 / 具体的な歩き方 / 現地検証」のいずれか成立時のみ
//   ・env で市場を無効化できる／FILTER 全体を停止できる
//   ・例外時は skipped=true・mode='normal_only'（本体を止めない）
//   ・実データ 3 ケース（A 工芸・素材 / B 静かな体験 / C 一般的な新店情報）の形

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  runCrossCultureFilter,
  themeCacheKey,
} from '../crossCulture'
import type { CrossCultureThresholds } from '../crossCulture/marketAxes'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const T: CrossCultureThresholds = {
  enabled: true,
  minDerivative: 70,
  minEditorial: 50,
  disabledMarkets: [],
}

const cases: CheckCase[] = [
  {
    name: '決定的：同じ入力を2回評価すると market スコアが完全一致',
    fn: () => {
      const input = { title: '更紗展 ～インドから世界へ 染めの美～', venue: '銀座もとじ', contentType: 'event' }
      const a = runCrossCultureFilter(input, { thresholds: T })
      const b = runCrossCultureFilter(input, { thresholds: T })
      assert(JSON.stringify(a.markets) === JSON.stringify(b.markets), '2回の結果が一致すること')
    },
  },
  {
    name: 'A 工芸・素材：更紗＝染め＋文化交流 → Italy が派生 or 編集候補、一般市場は除外',
    fn: () => {
      const r = runCrossCultureFilter(
        { title: '更紗展 ～インドから世界へ世界を魅了した染めの美～', venue: '銀座もとじ', contentType: 'event', factKind: 'event' },
        { thresholds: T },
      )
      const italy = r.markets.find((m) => m.market === 'Italy')!
      assert(italy.score >= T.minEditorial, `Italy score >= 50（実際 ${italy.score}）`)
      assert(italy.matchedAxes.includes('Craft') || italy.matchedAxes.includes('Material'), `Italy に Craft/Material 軸（実際 ${italy.matchedAxes}）`)
      assert(italy.matchedAxes.includes('Cultural Exchange'), `Italy に Cultural Exchange 軸（実際 ${italy.matchedAxes}）`)
      // US（Experience/Story/...）は工芸展の語に反応しない → 除外
      const us = r.markets.find((m) => m.market === 'United States')!
      assert(us.score < T.minEditorial, `US は除外（実際 ${us.score}）`)
      assert(r.markets.every((m) => (m.score >= T.minEditorial ? m.suggestedAngle.length > 0 : m.suggestedAngle === '')), 'editorial+ の市場だけ suggestedAngle を持つ')
    },
  },
  {
    name: 'B 静かな体験：完全予約制＋個室＋上質＋設え → UAE が派生候補（Quiet Luxury / Privacy / Space）',
    fn: () => {
      const r = runCrossCultureFilter(
        {
          title: '完全予約制の個室で味わう上質な設えのアフタヌーンティー ― 静けさと余白のためのプライベート空間',
          contentType: 'event',
          factKind: 'event',
          venue: '銀座エリア',
        },
        { thresholds: T },
      )
      const uae = r.markets.find((m) => m.market === 'UAE')!
      assert(uae.score >= T.minDerivative, `UAE score >= 70（実際 ${uae.score} / 軸 ${uae.matchedAxes}）`)
      assert(r.derivativeMarkets.includes('UAE'), 'UAE が derivativeMarkets に入る')
      assert(r.mode === 'has_derivative', `mode=has_derivative（実際 ${r.mode}）`)
    },
  },
  {
    name: 'C 一般的な新店情報：アプリ入会キャンペーン → 5市場すべて < 50 → normal_only',
    fn: () => {
      const r = runCrossCultureFilter(
        { title: 'GINZA SIX アプリ 新規ご入会キャンペーン', contentType: 'news', venue: '' },
        { thresholds: T },
      )
      assert(r.mode === 'normal_only', `mode=normal_only（実際 ${r.mode}）`)
      assert(r.derivativeMarkets.length === 0, `派生市場ゼロ（実際 ${r.derivativeMarkets}）`)
      assert(r.markets.every((m) => m.score < T.minEditorial), `全市場 < 50（実際 ${r.markets.map((m) => `${m.market}:${m.score}`).join(',')}`)
      assert(r.markets.every((m) => m.articlePotential === 'none' || m.articlePotential === 'free'), '有料候補なし')
    },
  },
  {
    name: 'バケット分け：1軸1ヒットのみ → score 26 → 除外（< 50）',
    fn: () => {
      const r = runCrossCultureFilter({ title: 'デザインの話', contentType: 'news' }, { thresholds: T })
      const italy = r.markets.find((m) => m.market === 'Italy')!
      assert(italy.score === 26, `1軸1ヒット=26（実際 ${italy.score}）`)
      assert(!r.derivativeMarkets.includes('Italy') && !r.editorialMarkets.includes('Italy'), 'Italy は除外バケット')
      assert(r.excludedMarkets.includes('Italy'), 'excludedMarkets に Italy')
    },
  },
  {
    name: 'バケット分け：2軸ヒット → score 72 → 派生候補（>= 70）',
    fn: () => {
      const r = runCrossCultureFilter(
        { title: '職人の手仕事による意匠と造形のデザイン展', contentType: 'exhibition' },
        { thresholds: T },
      )
      const italy = r.markets.find((m) => m.market === 'Italy')!
      assert(italy.matchedAxes.length >= 2, `Italy 2軸以上（実際 ${italy.matchedAxes}）`)
      assert(italy.score >= T.minDerivative, `score >= 70（実際 ${italy.score}）`)
      assert(r.derivativeMarkets.includes('Italy'), 'derivativeMarkets に Italy')
    },
  },
  {
    name: '有料候補：event＋銀座会場＋Heritage/Cultural Exchange 2軸 → paid（成立根拠つき）',
    fn: () => {
      const r = runCrossCultureFilter(
        {
          title: '明治から続く老舗が語る銀座の歴史と、東西の文化交流が生んだ意匠',
          venue: '銀座',
          contentType: 'event',
          factKind: 'event',
        },
        { thresholds: T },
      )
      const paidMarkets = r.markets.filter((m) => m.articlePotential === 'paid')
      assert(paidMarkets.length >= 1, `paid 市場が1つ以上（実際 ${r.markets.map((m) => `${m.market}:${m.articlePotential}`).join(',')}）`)
      assert(paidMarkets.every((m) => m.paidBasis.length > 0), 'paid 市場は paidBasis を必ず持つ')
    },
  },
  {
    name: '有料にしない：商品ニュース（news・factKind なし）で軸1本のみ → free 止まり',
    fn: () => {
      const r = runCrossCultureFilter(
        { title: '新作カシミヤニットのデザインをリリース', contentType: 'news' },
        { thresholds: T },
      )
      assert(r.markets.every((m) => m.articlePotential !== 'paid'), `paid にならない（実際 ${r.markets.map((m) => `${m.market}:${m.articlePotential}`).join(',')}）`)
    },
  },
  {
    name: 'negative 減点：UAE quiet-luxury 文言＋「日本酒」で score が下がる',
    fn: () => {
      const clean = runCrossCultureFilter({ title: '完全予約制の個室で味わう上質な設え' }, { thresholds: T })
      const withNeg = runCrossCultureFilter({ title: '完全予約制の個室で味わう上質な設え（日本酒ペアリング付き）' }, { thresholds: T })
      const a = clean.markets.find((m) => m.market === 'UAE')!.score
      const b = withNeg.markets.find((m) => m.market === 'UAE')!.score
      assert(b < a, `negative で減点される（clean ${a} → withNeg ${b}）`)
    },
  },
  {
    name: 'env 無効化：disabledMarkets=[UAE,Italy] → markets から消え excludedMarkets に入る',
    fn: () => {
      const r = runCrossCultureFilter(
        { title: '職人の手仕事による意匠と造形のデザイン展' },
        { thresholds: { ...T, disabledMarkets: ['UAE', 'Italy'] } },
      )
      assert(!r.markets.some((m) => m.market === 'UAE' || m.market === 'Italy'), 'UAE / Italy は評価されない')
      assert(r.excludedMarkets.includes('UAE') && r.excludedMarkets.includes('Italy'), 'excludedMarkets に含まれる')
      assert(r.markets.length === 3, `残り3市場（実際 ${r.markets.length}）`)
    },
  },
  {
    name: 'FILTER 全体停止：enabled=false → skipped=true・mode=normal_only（本体は止めない）',
    fn: () => {
      const r = runCrossCultureFilter({ title: '職人の手仕事の意匠' }, { thresholds: { ...T, enabled: false } })
      assert(r.skipped === true, 'skipped=true')
      assert(r.mode === 'normal_only', 'mode=normal_only')
      assert(r.markets.length === 0, 'markets は空')
    },
  },
  {
    name: '例外安全：入力が全部 null/undefined でも throw せず normal_only',
    fn: () => {
      const r = runCrossCultureFilter({ title: null, excerpt: null, venue: null, contentType: null }, { thresholds: T })
      assert(r.mode === 'normal_only', 'mode=normal_only')
      assert(Array.isArray(r.markets), 'markets は配列')
      assert(r.markets.length === 5, '5市場すべて評価される（スコア0）')
    },
  },
  {
    name: 'キャッシュキー：同一入力で一致、title が変われば変わる',
    fn: () => {
      const k1 = themeCacheKey({ title: 'A 展', venue: '銀座' })
      const k2 = themeCacheKey({ title: 'A 展', venue: '銀座' })
      const k3 = themeCacheKey({ title: 'B 展', venue: '銀座' })
      assert(k1 === k2, '同一入力 → 同一キー')
      assert(k1 !== k3, 'title 変更 → 別キー')
    },
  },
]

export const suite = () => runSuite('crossCultureFilter', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
