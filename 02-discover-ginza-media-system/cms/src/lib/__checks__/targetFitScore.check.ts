// GINZA WHISKERS / Project 02 — コアターゲット適合度スコアの回帰テスト（2026-09-04）
//
//   ・20代後半〜30代女性の「今日知りたい・行きたい・保存したい」に近い候補ほど高スコア
//   ・ART / CULTURE 一辺倒は下がる（カテゴリー基礎点マイナス）
//   ・季節スイーツ／美容・ウェルネス／老舗の上質／新しい発見 は上がる
//   ・決定的（同じ入力 → 同じ出力）／0-100 に収まる
//   ・sourceTypeOf のマッピング

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { computeTargetFitScore, sourceTypeOf } from '../pipeline/targetFitScore'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: '決定的：同じ入力を2回で score 完全一致',
    fn: () => {
      const i = { title: '【秋季限定】栗とはちみつのパウンドケーキ', categoryKey: 'SWEETS', contentType: 'food' }
      assert(computeTargetFitScore(i).score === computeTargetFitScore(i).score, '一致')
    },
  },
  {
    name: '季節限定スイーツ → 高スコア（かわいい＋新しい発見）',
    fn: () => {
      const r = computeTargetFitScore({ title: '【秋季限定】栗とはちみつのパウンドケーキ – GINZA SIX', categoryKey: 'SWEETS', contentType: 'food' })
      assert(r.score >= 46, `score>=46（実際 ${r.score} / ${r.reason}）`)
      assert(r.compass.kawaii > 0 && r.compass.hakken > 0, `かわいい・発見が立つ（${JSON.stringify(r.compass)}）`)
    },
  },
  {
    name: '美容・ウェルネス（アフタヌーンティー） → 高スコア（自分を整える）',
    fn: () => {
      const r = computeTargetFitScore({ title: '韓国ウェルネス アフタヌーンティー', categoryKey: 'WELLNESS', contentType: 'news', uxType: 'taste_dine' })
      assert(r.score >= 44, `score>=44（実際 ${r.score}）`)
      assert(r.compass.totonoeru >= 0.7, `整える面が強い（${r.compass.totonoeru}）`)
    },
  },
  {
    name: '老舗の上質（きもの・工芸） → 上質面が立つ',
    fn: () => {
      const r = computeTargetFitScore({ title: '老舗の職人による、絹と漆の一点物 誂え展', categoryKey: 'SHOPPING', contentType: 'event' })
      assert(r.compass.joshitsu >= 0.7, `上質が強い（${r.compass.joshitsu}）`)
      assert(r.score >= 36, `score>=36（実際 ${r.score}）`)
    },
  },
  {
    name: '純粋なアート展（コンパス語なし・ART） → 低スコア',
    fn: () => {
      const r = computeTargetFitScore({ title: 'UNO YOSHIHIKO個展「The Ghosts Party」', categoryKey: 'ART', contentType: 'exhibition' })
      assert(r.score <= 20, `score<=20（実際 ${r.score} / ${r.reason}）`)
    },
  },
  {
    name: '一般的なコーポレート告知 → ほぼ 0',
    fn: () => {
      const r = computeTargetFitScore({ title: 'コーポレートサイトをリニューアルいたしました', categoryKey: null, contentType: 'news' })
      assert(r.score <= 20, `score<=20（実際 ${r.score}）`)
    },
  },
  {
    name: '少し背伸び（プレミアム・記念日） → senobi 面',
    fn: () => {
      const r = computeTargetFitScore({ title: '記念日に。シャンパンとフルコースの特別プラン', categoryKey: 'FOOD', contentType: 'taste_dine' })
      assert(r.compass.senobi > 0, `背伸び面（${r.compass.senobi}）`)
    },
  },
  {
    name: 'score は常に 0-100、compass は 0-1',
    fn: () => {
      for (const t of ['', 'x', '限定 かわいい 上質 ウェルネス 新作 特別 プレミアム 職人 花 スイーツ 美容 体験 ご褒美']) {
        const r = computeTargetFitScore({ title: t, categoryKey: 'SWEETS' })
        assert(r.score >= 0 && r.score <= 100, `score 範囲（${r.score}）`)
        for (const v of Object.values(r.compass)) assert(v >= 0 && v <= 1, `compass 範囲（${v}）`)
      }
    },
  },
  {
    name: 'ART と SWEETS で同じ無味タイトルなら SWEETS の方が高い（カテゴリー基礎点）',
    fn: () => {
      const art = computeTargetFitScore({ title: '展示のお知らせ', categoryKey: 'ART' }).score
      const sweets = computeTargetFitScore({ title: '展示のお知らせ', categoryKey: 'SWEETS' }).score
      assert(sweets > art, `SWEETS(${sweets}) > ART(${art})`)
    },
  },
  {
    name: 'sourceTypeOf：百貨店 / 商業施設 / 飲食・菓子 / 美容 / アート・文化 / 街イベント / 老舗',
    fn: () => {
      assert(sourceTypeOf('銀座三越') === '百貨店', '三越')
      assert(sourceTypeOf('松屋銀座') === '百貨店', '松屋')
      assert(sourceTypeOf('GINZA SIX') === '商業施設', 'GINZA SIX')
      assert(sourceTypeOf('資生堂パーラー') === '飲食・菓子', 'パーラー')
      assert(sourceTypeOf('資生堂ギャラリー') === 'アート・文化', 'ギャラリー')
      assert(sourceTypeOf('銀座 蔦屋書店') === 'アート・文化', '蔦屋')
      assert(sourceTypeOf('中央区観光関連') === '街・行政イベント', '中央区')
      assert(sourceTypeOf('銀座もとじ') === '老舗・専門店', 'もとじ')
      assert(sourceTypeOf('') === '一般', '空')
    },
  },
]

export const suite = () => runSuite('targetFitScore', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
