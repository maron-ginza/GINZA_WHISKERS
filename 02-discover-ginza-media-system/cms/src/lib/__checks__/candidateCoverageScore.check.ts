// GINZA WHISKERS / Project 02 — 候補収集カバレッジのスコアリング（candidateCoverageScore）回帰テスト。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  facilityConcentrationPenalty,
  categoryDeficiencyBonus,
  officialCompleteness,
  targetWomenFitScore,
  daysUntilEndScore,
  computeCandidateCoverage,
  aggregateCoverage,
  OVEREXPOSED_FACILITY_KEYS,
} from '../pipeline/candidateCoverageScore'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const NOW = new Date('2026-09-11T00:00:00+09:00')

const cases: CheckCase[] = [
  {
    name: '施設集中：大手4施設は同じ件数でも小規模店より強く減点、1件でも減点',
    fn: () => {
      const big = facilityConcentrationPenalty('ginza-six', 2)
      const small = facilityConcentrationPenalty('gekkoso-ginza', 2)
      assert(big < small, `big ${big} < small ${small}`)
      assert(facilityConcentrationPenalty('ginza-six', 1) < 0, '大手は1件で減点')
      assert(facilityConcentrationPenalty('gekkoso-ginza', 1) === 0, '小規模は1件では減点しない')
      assert(facilityConcentrationPenalty(null, 5) === 0, '施設不明は0')
      assert(facilityConcentrationPenalty('ginza-six', 10) >= -0.4, '下限 -0.4')
      // OVEREXPOSED_FACILITY_KEYS に4施設が入っている
      assert(OVEREXPOSED_FACILITY_KEYS.length === 4 && OVEREXPOSED_FACILITY_KEYS.includes('ginza-tsutaya'), 'big4 list')
    },
  },
  {
    name: 'カテゴリー不足度：週0件のコアカテゴリーは高ボーナス、目標超過は0',
    fn: () => {
      const beautyZero = categoryDeficiencyBonus('BEAUTY', {})
      const beautyFull = categoryDeficiencyBonus('BEAUTY', { BEAUTY: 3 })
      const beautyOver = categoryDeficiencyBonus('BEAUTY', { BEAUTY: 9 })
      assert(beautyZero > beautyFull, `zero ${beautyZero} > full ${beautyFull}`)
      assert(beautyFull === 0 && beautyOver === 0, '目標到達以上は0')
      assert(categoryDeficiencyBonus('NIGHT', {}) === 0, '目標0のカテゴリーはボーナス無し')
      assert(categoryDeficiencyBonus(null, {}) === 0, 'null は0')
      // 部分的に埋まっている場合は中間値
      const half = categoryDeficiencyBonus('ART', { ART: 1 }) // target 3
      assert(half > 0 && half < beautyZero, `half ${half}`)
    },
  },
  {
    // 2026-09-13改訂：固定運用原則との矛盾を解消——必須は商品名・企画名／公式URL／
    // 銀座での場所／内容／出典確認日の5項目。開催・販売期間は任意（無くても除外しない）。
    name: '公式完全度（2026-09-13改訂）：必須5項目が揃えば期間が無くても finalEligible',
    fn: () => {
      const full = officialCompleteness({
        productOrCampaignName: 'アイガトー',
        sourceUrl: 'https://example.com/x',
        eventPeriod: '2026年9月9日〜9月14日',
        venue: 'KOGEI Art Gallery 銀座の金沢',
        whatHappens: '九谷焼の個展。上絵付けの実演あり。',
        verifiedAt: '2026-09-11T00:00:00+09:00',
      })
      assert(full.finalEligible && full.score === 1, JSON.stringify(full))

      // 期間が無くても、他の必須5項目が揃っていれば finalEligible（今回の主眼）
      const noPeriod = officialCompleteness({
        productOrCampaignName: '新作フレグランス',
        sourceUrl: 'https://example.com/x',
        venue: '銀座三越',
        whatHappens: '新作フレグランスの先行販売。',
        verifiedAt: '2026-09-11T00:00:00+09:00',
      })
      assert(noPeriod.finalEligible, JSON.stringify(noPeriod))
      assert(noPeriod.missing.includes('開催・販売期間'), '期間はmissingに記録されるが除外理由にはならない')
      assert(noPeriod.requiredMissing.length === 0, JSON.stringify(noPeriod))

      // 会場テキストが空でも facilityResolved:true なら場所ありとみなす
      const bySource = officialCompleteness({
        productOrCampaignName: '新商品',
        sourceUrl: 'https://ginza6.tokyo/news/1',
        eventStartAt: '2026-09-20',
        facilityResolved: true,
        excerpt: 'これは40文字以上ある本文抜粋のダミーテキストで、内容の確認シグナルの代わりとして十分な長さを持たせてある。',
        verifiedAt: '2026-09-11T00:00:00+09:00',
      })
      assert(bySource.finalEligible, JSON.stringify(bySource))

      // 商品名・企画名が無ければ除外（必須）
      const noName = officialCompleteness({
        sourceUrl: 'https://example.com/x',
        venue: '銀座三越',
        whatHappens: '新作の先行販売。',
        verifiedAt: '2026-09-11T00:00:00+09:00',
      })
      assert(!noName.finalEligible && noName.requiredMissing.includes('商品名・企画名'), JSON.stringify(noName))

      // 出典確認日が無ければ除外（必須）
      const noVerifiedAt = officialCompleteness({
        productOrCampaignName: '新作フレグランス',
        sourceUrl: 'https://example.com/x',
        venue: '銀座三越',
        whatHappens: '新作フレグランスの先行販売。',
      })
      assert(!noVerifiedAt.finalEligible && noVerifiedAt.requiredMissing.includes('出典確認日'), JSON.stringify(noVerifiedAt))

      const empty = officialCompleteness({})
      assert(empty.score === 0 && empty.requiredMissing.length === 5, JSON.stringify(empty))
      assert(empty.missing.length === 6, '期間も含め6項目すべて未確認のはず')
    },
  },
  {
    name: '女性適合度：0-100 を 0-1 に正規化、未評価は中立0.4',
    fn: () => {
      assert(targetWomenFitScore(null) === 0.4, 'null 中立')
      assert(targetWomenFitScore(10) === 0, '下限')
      assert(targetWomenFitScore(70) === 1, '上限')
      assert(Math.abs(targetWomenFitScore(40) - 0.5) < 1e-9, '中間')
    },
  },
  {
    name: '終了までの日数：終了済み=0、間近=1、余裕=中間、期日なし=中立',
    fn: () => {
      assert(daysUntilEndScore('2026-09-05', NOW).expired, '過去は expired')
      assert(daysUntilEndScore('2026-09-05', NOW).score === 0, 'expired は 0')
      assert(daysUntilEndScore('2026-09-13', NOW).tier === 'ending_soon', 'あと2日')
      assert(daysUntilEndScore('2026-09-18', NOW).tier === 'this_week', 'あと7日')
      assert(daysUntilEndScore('2026-10-05', NOW).tier === 'comfortable', 'あと24日')
      assert(daysUntilEndScore('2026-12-01', NOW).tier === 'far', 'あと80日')
      assert(daysUntilEndScore(null, NOW).tier === 'no_end', '期日なし')
    },
  },
  {
    name: 'computeCandidateCoverage：不足カテゴリー＋終了間近は加点、大手施設集中は減点',
    fn: () => {
      const strong = computeCandidateCoverage({
        category: 'BEAUTY',
        facilityKey: 'gekkoso-ginza',
        categoryCounts7d: {},
        facilityCounts7d: {},
        official: {
          sourceUrl: 'https://x.com/a',
          eventPeriod: '9月10日〜20日',
          venue: '月光荘',
          whatHappens: '月光荘での小さな展示です。',
          productOrCampaignName: '小さな展示',
          verifiedAt: '2026-09-10T00:00:00+09:00',
        },
        targetFit: 60,
        eventEndAt: '2026-09-13',
        now: NOW,
      })
      assert(strong.adjust > 0.15, `strong.adjust ${strong.adjust}`)
      assert(strong.official.finalEligible, 'strong は finalEligible')

      const weak = computeCandidateCoverage({
        category: 'ART',
        facilityKey: 'ginza-six',
        categoryCounts7d: { ART: 5 },
        facilityCounts7d: { 'ginza-six': 4 },
        official: { sourceUrl: 'https://x.com/a', venue: 'GINZA SIX' }, // 期間・内容なし
        targetFit: 15,
        eventEndAt: '2026-12-20',
        now: NOW,
      })
      assert(weak.adjust < 0, `weak.adjust ${weak.adjust}`)
      assert(!weak.official.finalEligible, 'weak は公式未確認')

      // 2026-09-13：期間だけが無い候補は除外しない（固定運用原則との矛盾解消）
      const periodMissingOnly = computeCandidateCoverage({
        category: 'SWEETS',
        facilityKey: 'kitchoan',
        categoryCounts7d: {},
        facilityCounts7d: {},
        official: {
          sourceUrl: 'https://x.com/kitchoan',
          venue: '宗家源吉兆庵 銀座本店',
          whatHappens: '季節限定の生菓子コラボレーション。',
          productOrCampaignName: '季節限定コラボ生菓子',
          verifiedAt: '2026-09-10T00:00:00+09:00',
          // eventPeriod/eventStartAt/eventEndAt 未指定＝期間のみ無い状態
        },
        targetFit: 40,
        eventEndAt: null,
        now: NOW,
      })
      assert(periodMissingOnly.official.finalEligible, JSON.stringify(periodMissingOnly.official))
      assert(periodMissingOnly.official.missing.includes('開催・販売期間'), JSON.stringify(periodMissingOnly.official))
    },
  },
  {
    name: 'aggregateCoverage：カテゴリー・施設・エリア別集計と不足/過集中の抽出',
    fn: () => {
      const rows = [
        { category: 'ART', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', areaKey: 'ginza-six', sourceName: 'GINZA SIX' },
        { category: 'ART', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', areaKey: 'ginza-six', sourceName: 'GINZA SIX' },
        { category: 'ART', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', areaKey: 'ginza-six', sourceName: 'GINZA SIX' },
        { category: 'FOOD', facilityKey: 'gekkoso-ginza', facilityLabel: '月光荘', areaKey: 'gekkoso-ginza', sourceName: '月光荘画材店' },
      ]
      const agg = aggregateCoverage(rows)
      assert(agg.total === 4 && agg.byCategory.ART === 3, JSON.stringify(agg.byCategory))
      assert(agg.missingCategories.includes('BEAUTY'), `missing: ${agg.missingCategories}`)
      assert(agg.overweightFacilities[0]?.facility === 'GINZA SIX', JSON.stringify(agg.overweightFacilities))
    },
  },
]

export const suite = () => runSuite('candidateCoverageScore', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
