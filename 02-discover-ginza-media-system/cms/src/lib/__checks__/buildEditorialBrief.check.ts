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
    name: 'sale は「開催」「イベント」「〜で行われている」「会期」「催し」を使わない（販売期間の記載あり）',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '秋季限定パウンドケーキ',
        venue: 'GINZA SIX',
        eventPeriod: '2026-09-01 〜 2026-09-15',
        templateType: 'sale',
        category: 'FOOD',
      })
      const text = [...b.titleCandidates, b.introDraft].join(' ')
      for (const ng of ['開催', 'イベント', '行われている', '会期', '催し', '〜まで']) {
        assert(!text.includes(ng), `禁止語「${ng}」を含まない: ${text}`)
      }
      assert(b.introDraft.includes('登場している'), `販売の表現になっている: ${b.introDraft}`)
      assert(b.introDraft.includes('販売期間は2026-09-01 〜 2026-09-15'), `販売期間を事実どおり記載: ${b.introDraft}`)
    },
  },
  {
    name: 'sale で販売期間の記載がない候補（DC #370 型）でも事実に沿う導入文・タイトルになる',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: 'AMBUSH® x New Era® – GINZA SIX',
        venue: 'AMBUSH® WORKSHOP GINZA フロア: 3F',
        eventPeriod: '販売期間の記載なし（店頭にて取扱）',
        templateType: 'sale',
        factKind: 'product_news',
        category: 'SHOPPING',
      })
      const text = [...b.titleCandidates, b.introDraft].join(' ')
      for (const ng of ['開催', 'イベント', '行われている', '会期', '催し']) {
        assert(!text.includes(ng), `禁止語「${ng}」を含まない: ${text}`)
      }
      assert(b.introDraft.includes('販売期間の記載なし（店頭にて取扱）'), `販売期間なしを事実どおり: ${b.introDraft}`)
      assert(!b.introDraft.includes('販売期間は販売期間'), `「販売期間」の二重化がない: ${b.introDraft}`)
      assert(!b.introDraft.includes('（不明）') && !b.introDraft.includes('（会期'), `会期表現がない: ${b.introDraft}`)
      assert(b.structureOutline.some((s) => s.includes('販売期間')), `構成案は sale（販売期間を含む）: ${b.structureOutline.join(' / ')}`)
      assert(b.recommendedLength.tier === 'short', `記事量 tier=short: ${b.recommendedLength.tier}`)
    },
  },
  {
    name: 'factKind=product_news なら templateType が空でも sale の文面・構成になる',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '新作フレグランス発売',
        venue: 'GINZA SIX',
        eventPeriod: '不明',
        templateType: null,
        factKind: 'product_news',
        category: 'BEAUTY',
      })
      assert(!b.introDraft.includes('行われている') && !b.introDraft.includes('会期'), `催事表現がない: ${b.introDraft}`)
      assert(b.introDraft.includes('登場している'), `販売の表現: ${b.introDraft}`)
      assert(b.introDraft.includes('販売期間は公式情報で要確認'), `販売期間の要確認: ${b.introDraft}`)
      assert(b.structureOutline.some((s) => s.includes('購入条件')), `構成案が sale: ${b.structureOutline.join(' / ')}`)
    },
  },
  {
    name: 'event 系（exhibition）の既存表現は維持される（回帰防止）',
    fn: () => {
      const b = buildEditorialBrief({
        displayTitle: '百世個展『めぐり はじまる』',
        venue: '銀座 蔦屋書店',
        eventPeriod: '2026-08-28 〜 2026-09-06',
        templateType: 'exhibition',
        factKind: 'event',
        category: 'ART',
      })
      assert(b.introDraft.includes('で行われている'), `event の既存表現を維持: ${b.introDraft}`)
      assert(b.titleCandidates.some((t) => t.includes('は2026-08-28 〜 2026-09-06まで')), `event のタイトル案を維持: ${b.titleCandidates.join(' / ')}`)
      assert(!b.introDraft.includes('登場している'), `sale の表現を混ぜない: ${b.introDraft}`)
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
