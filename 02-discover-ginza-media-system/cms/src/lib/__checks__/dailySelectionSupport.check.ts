// GINZA WHISKERS / Project 02 — 候補選定サポート（2026-10 初期トライアル）の回帰テスト。
//
//  ・通常記事3本の基本構成（ビューティー／グルメ・スイーツ／文化・アート 各1）の充足状況
//  ・同一施設の連続採用警告
//  ・季節性（AUTUMN GINZA のような季節横断型を重視）
//  ・100円記事への展開可能性（AI活用・具体的手順・時間別プラン・予算別調整）

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  CORE_DAILY_BUCKETS,
  bucketForCategory,
  assessCoreDailyFulfillment,
  detectConsecutiveFacilityWarnings,
  seasonalSignal,
  currentSeason,
  paidLanePotential,
} from '../pipeline/dailySelectionSupport'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}
const codes = (fs: { code: string }[]) => fs.map((f) => f.code)

const cases: CheckCase[] = [
  {
    name: 'コア3バケット定義：ビューティー／グルメ・スイーツ／文化・アート、カテゴリー→バケット',
    fn: () => {
      assert(CORE_DAILY_BUCKETS.length === 3, `バケット数: ${CORE_DAILY_BUCKETS.length}`)
      assert(CORE_DAILY_BUCKETS.map((b) => b.label).join(',') === 'ビューティー,グルメ・スイーツ,文化・アート', 'ラベル')
      assert(bucketForCategory('BEAUTY')?.key === 'BEAUTY', 'BEAUTY→ビューティー')
      assert(bucketForCategory('CAFE')?.key === 'FOOD_SWEETS', 'CAFE→グルメ・スイーツ')
      assert(bucketForCategory('ART')?.key === 'CULTURE_ART', 'ART→文化・アート')
      assert(bucketForCategory('EVENT')?.key === 'CULTURE_ART', 'EVENT→文化・アート')
      assert(bucketForCategory('SHOPPING') === null, 'SHOPPING はコア3外')
      assert(bucketForCategory('未確定') === null && bucketForCategory(null) === null, '未確定/null は null')
    },
  },
  {
    name: 'assessCoreDailyFulfillment：3カテゴリー各1で allFilled、欠けたら未充足＋uncategorized',
    fn: () => {
      const full = assessCoreDailyFulfillment([
        { dcId: 1, title: '新作リップ', categoryKey: 'BEAUTY' },
        { dcId: 2, title: '秋のパフェ', categoryKey: 'CAFE' },
        { dcId: 3, title: '更紗展', categoryKey: 'ART' },
        { dcId: 4, title: 'デニムPOPUP', categoryKey: 'SHOPPING' },
      ])
      assert(full.allFilled, '3カテゴリー充足で allFilled')
      assert(full.buckets.find((b) => b.key === 'FOOD_SWEETS')!.have === 1, 'CAFE が グルメ・スイーツ に入る')
      assert(full.uncategorized.length === 1 && full.uncategorized[0].dcId === 4, 'SHOPPING は uncategorized')

      const partial = assessCoreDailyFulfillment([
        { dcId: 1, title: 'a', categoryKey: 'BEAUTY' },
        { dcId: 2, title: 'b', categoryKey: 'BEAUTY' },
      ])
      assert(!partial.allFilled, 'ビューティー2件・他0なら未充足')
      assert(partial.buckets.find((b) => b.key === 'BEAUTY')!.have === 2, 'BEAUTY have=2')
      assert(partial.buckets.filter((b) => b.filled).length === 1, '充足は1バケットのみ')
    },
  },
  {
    name: 'detectConsecutiveFacilityWarnings：履歴連続・直前と同一・推奨内重複',
    fn: () => {
      // 直近2件が同一施設で連続
      const w1 = detectConsecutiveFacilityWarnings({
        recentFacilitySequence: ['GINZA SIX', 'GINZA SIX', '和光'],
        recommended: [{ dcId: 10, facilityKey: '松屋銀座', facilityLabel: '松屋銀座' }],
      })
      assert(codes(w1).includes('history_streak'), '直近連続を検知')
      assert(w1.find((w) => w.code === 'history_streak')!.message.includes('2 件連続'), '連続件数')

      // 推奨候補が直前の採用と同一施設
      const w2 = detectConsecutiveFacilityWarnings({
        recentFacilitySequence: ['和光', '銀座三越'],
        recommended: [{ dcId: 11, facilityKey: '和光', facilityLabel: '和光' }],
      })
      assert(codes(w2).includes('adjacent_repeat'), '直前と同一施設を検知')

      // 推奨内で同一施設2件
      const w3 = detectConsecutiveFacilityWarnings({
        recentFacilitySequence: [],
        recommended: [
          { dcId: 12, facilityKey: 'GINZA SIX', facilityLabel: 'GINZA SIX' },
          { dcId: 13, facilityKey: 'GINZA SIX', facilityLabel: 'GINZA SIX' },
        ],
      })
      assert(codes(w3).includes('recommended_repeat'), '推奨内重複を検知')

      // 会場不明は警告に使わない／連続なしなら空
      const w4 = detectConsecutiveFacilityWarnings({
        recentFacilitySequence: ['(会場不明)', '(会場不明)'],
        recommended: [{ dcId: 14, facilityKey: null, facilityLabel: '(会場不明)' }],
      })
      assert(w4.length === 0, '会場不明の連続は警告しない')
    },
  },
  {
    name: 'seasonalSignal：現在季節と一致で inSeason、AUTUMN GINZA は cityWide で重視',
    fn: () => {
      const oct = new Date('2026-10-15T00:00:00Z')
      assert(currentSeason(oct) === 'autumn', '10月は秋')
      const s1 = seasonalSignal('紅葉の季節、銀座で楽しむ秋のアフタヌーンティー', oct)
      assert(s1.season === 'autumn' && s1.inSeason, '秋の語＋現在秋で inSeason')
      assert(s1.keywords.includes('紅葉') || s1.keywords.includes('秋'), '季節語を拾う')

      const s2 = seasonalSignal('AUTUMN GINZA 2026 が銀座全域で開催', oct)
      assert(s2.cityWide && s2.inSeason, 'AUTUMN GINZA は cityWide＝重視')
      assert(/季節横断型/.test(s2.note), 'note に季節横断型')

      const s3 = seasonalSignal('秋の銀座、街全体で楽しむ催し', oct)
      assert(s3.cityWide, '「秋の銀座」も cityWide')

      const s4 = seasonalSignal('クリスマス限定スイーツが登場', oct)
      assert(s4.season === 'winter' && !s4.inSeason, '10月にクリスマス語は旬ズレ')
      assert(/旬のズレ/.test(s4.note), 'note に旬ズレの注意')

      const s5 = seasonalSignal('新作の万年筆フェア', oct)
      assert(s5.season === null && !s5.cityWide, '季節語なし')
      assert(/別軸で確認/.test(s5.note), 'note に別軸確認')
    },
  },
  {
    name: 'paidLanePotential：体験＋会場＋会期で high、販売ニュース単体は low、必須How-to価値は常に4項目',
    fn: () => {
      const high = paidLanePotential({
        title: '更紗展 ～インドから世界へ～ を巡る',
        venue: '銀座もとじ 和染',
        categoryKey: 'ART',
        uxType: 'participate_see',
        eventPeriod: '2026年10月1日〜31日',
      })
      assert(high.level === 'high', `high 期待: ${high.level} / ${high.reasons.join(',')}`)
      assert(high.requiredValue.length === 4, '必須How-to価値4項目')
      assert(high.requiredValue.some((v) => /時間別プラン/.test(v)) && high.requiredValue.some((v) => /予算別調整/.test(v)), '時間別・予算別を含む')

      const low = paidLanePotential({
        title: '新作チョコレートが数量限定で発売',
        venue: null,
        categoryKey: 'SHOPPING',
        contentType: 'news',
        templateType: 'sale',
        eventPeriod: null,
      })
      assert(low.level === 'low', `low 期待: ${low.level}`)
      assert(low.reasons.some((r) => /長文化に留まる|要素が薄い/.test(r)), '長文化リスクを明示')

      const mid = paidLanePotential({
        title: '秋の展示イベント',
        venue: '松屋銀座',
        categoryKey: 'EVENT',
        eventPeriod: '10月中旬',
      })
      assert(mid.level === 'medium', `medium 期待: ${mid.level}`)
    },
  },
]

export const suite = () => runSuite('dailySelectionSupport', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
