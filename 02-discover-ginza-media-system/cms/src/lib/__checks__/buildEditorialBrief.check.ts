// GINZA WHISKERS / Project 02 — buildEditorialBrief の回帰テスト（2026-09-05）

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { buildEditorialBrief } from '../morning/buildEditorialBrief'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const cases: CheckCase[] = [
  {
    name: 'タイトル案は2〜3案でタイトル本文を含む',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '百世個展『めぐり はじまる』',
        venue: '銀座 蔦屋書店',
        eventPeriod: '2026-08-28 〜 2026-09-06',
        templateType: 'exhibition',
        category: 'ART',
      })
      assert(b.titleCandidates.length >= 2 && b.titleCandidates.length <= 3, `件数: ${b.titleCandidates.length}`)
      for (const t of b.titleCandidates) assert(t.includes('百世個展'), `タイトル本文を含む: ${t}`)
    },
  },
  {
    name: '開催日不明のときは導入案に「要確認」の趣旨を含む',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: 'テスト企画',
        venue: 'テスト会場',
        eventPeriod: '不明',
        templateType: 'exhibition',
        category: 'ART',
      })
      assert(b.introDraft.includes('要確認'), `導入案: ${b.introDraft}`)
    },
  },
  {
    name: 'sale テンプレートの構成案は購入条件・販売期間を含む',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '秋季限定パウンドケーキ',
        venue: 'GINZA SIX',
        eventPeriod: '2026-09-01 〜 2026-09-15',
        templateType: 'sale',
        category: 'FOOD',
      })
      assert(b.structureOutline.some((s) => s.includes('購入条件')), `構成案: ${b.structureOutline.join(' / ')}`)
      assert(b.recommendedLength.tier === 'short', `推奨記事量tier: ${b.recommendedLength.tier}`)
    },
  },
  {
    name: 'workshop テンプレートは記事量 long・体験内容を含む構成案',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '手づくり体験教室',
        venue: '銀座 蔦屋書店',
        eventPeriod: '2026-09-10',
        templateType: 'workshop',
        category: 'WORKSHOP',
      })
      assert(b.recommendedLength.tier === 'long', `tier: ${b.recommendedLength.tier}`)
      assert(b.structureOutline.some((s) => s.includes('体験内容')), `構成案: ${b.structureOutline.join(' / ')}`)
    },
  },
  {
    name: 'WELLNESS カテゴリーは有料候補（paid_candidate）と判定',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '韓国ウェルネス アフタヌーンティー',
        venue: 'ハイアット セントリック 銀座',
        eventPeriod: '2026-09-01 〜 2026-10-31',
        templateType: 'sale',
        category: 'WELLNESS',
        contentType: 'news',
        uxType: 'taste_dine',
      })
      assert(b.payFreeCandidate.type === 'paid_candidate', `判定: ${b.payFreeCandidate.type}`)
    },
  },
  {
    name: '純粋なART展（コンパス語なし）は無料候補（free）と判定',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: 'UNO YOSHIHIKO個展',
        venue: '銀座 蔦屋書店',
        eventPeriod: '2026-09-10 〜 2026-09-20',
        templateType: 'exhibition',
        category: 'ART',
      })
      assert(b.payFreeCandidate.type === 'free', `判定: ${b.payFreeCandidate.type}`)
    },
  },
  {
    name: 'targetFitScore は 0-100 の範囲で決定的（同じ入力→同じ出力）',
    fn: () => {
      const input = {
        displayTitle: '第16回 中央区・銀座シャンソン＆ミュージックフェスティバル',
        venue: '東京ブロッサム 中央会館',
        eventPeriod: '2026-09-27',
        templateType: 'recurring_event',
        category: 'MUSIC',
      }
      const a = buildEditorialBrief(input)
      const b = buildEditorialBrief(input)
      assert(a.targetFitScore >= 0 && a.targetFitScore <= 100, `score: ${a.targetFitScore}`)
      assert(a.targetFitScore === b.targetFitScore && a.targetFitReason === b.targetFitReason, '決定的')
    },
  },
  {
    name: '未知のカテゴリー・テンプレートでも既定値にフォールバックする',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '不明カテゴリーの候補',
        venue: null,
        eventPeriod: '不明',
        templateType: null,
        category: null,
      })
      assert(b.structureOutline.length > 0, '構成案が空でない')
      assert(b.ginzaWhiskersAngle.length > 0, '切り口が空でない')
    },
  },
]

export const suite = () => runSuite('buildEditorialBrief', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
