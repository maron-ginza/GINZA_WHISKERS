// GINZA WHISKERS / Project 02（2026-09-25）— buildMorningReport の回帰テスト。
// 「選定可能（8カテゴリー分類済み）」と「未分類・要確認」を合算表示していた
// バグ（マロン指摘）の再発防止に焦点を当てる。
//
//   node --import=tsx/esm src/lib/morning/buildMorningReport.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { buildMorningReport, renderMorningReport } from './buildMorningReport'
import type { CandidateAssessment } from './types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function mkA(id: number, category: string | null): CandidateAssessment {
  return {
    discoveredContentId: id,
    title: `候補#${id}`,
    displayTitle: `候補#${id}`,
    sourceName: '出典',
    sourceUrl: `https://example.com/${id}`,
    verdict: 'A',
    reasons: ['目的型：テスト理由（カテゴリー：' + (category ?? '不明') + '）'],
    verifiedItems: [],
    missing: [],
    unconfirmed: [],
    dedup: { duplicate: false },
    expired: false,
    ginzaRelevant: true,
    hasTraceableSource: true,
    factKind: 'unknown',
    factsSource: 'ready',
    templateEligible: false,
    image: { available: false, policy: 'テスト', externalImageProhibited: true },
    eventPeriod: '不明',
    applyDeadline: '不明／なし',
    estimateMinutes: 25,
    digestMeta: {
      venue: null,
      officialFetch: null,
      priceHint: null,
      facilityKey: null,
      facilityLabel: '',
      parentFacilityKey: null,
      parentFacilityLabel: null,
      category,
      categoryBasis: category ? 'title' : null,
      publishedAt: null,
      origin: 'approved',
    },
  } as CandidateAssessment
}

const cases: CheckCase[] = [
  {
    // 【2026-09-25追加・実障害の再発防止】マロン指摘：分類済み候補（選定可能）と
    // 未分類候補（Stage 4選定の対象外）を合算した「20件」を選定可能候補として
    // 提示していた。selectableCount/unclassifiedCountを分離して持つことを確認する。
    name: 'selectableCount は分類済み（sweets+byCategory）のみを数え、unclassifiedCount とは合算しない',
    fn: () => {
      const assessments = [
        mkA(1, 'SWEETS'),
        mkA(2, 'ART'),
        mkA(3, 'ART'),
        mkA(4, null), // 未分類
        mkA(5, null), // 未分類
      ]
      const report = buildMorningReport(assessments, { now: new Date('2026-09-25T00:00:00Z') })
      assert(report.counts.A === 5, `A判定合計は5件のはず（実際 ${report.counts.A}）`)
      assert(report.selectableCount === 3, `選定可能は3件（SWEETS1+ART2）のはず（実際 ${report.selectableCount}）`)
      assert(report.unclassifiedCount === 2, `未分類は2件のはず（実際 ${report.unclassifiedCount}）`)
      assert(
        report.selectableCount + report.unclassifiedCount === report.counts.A,
        '選定可能＋未分類＝A判定合計と一致するはず',
      )
    },
  },
  {
    name: 'テキストレポートに「選定可能」と「未分類・要確認」の件数が分けて表示される',
    fn: () => {
      const assessments = [mkA(1, 'SWEETS'), mkA(2, null)]
      const report = buildMorningReport(assessments, { now: new Date('2026-09-25T00:00:00Z') })
      const text = renderMorningReport(report)
      assert(text.includes('選定可能'), '「選定可能」の文言が出力に含まれるはず')
      assert(text.includes('未分類・要確認'), '「未分類・要確認」の文言が出力に含まれるはず')
      assert(/選定可能[^\n]*1件/.test(text), `選定可能1件と表示されるはず（実際の出力: ${text.split('\n').find((l) => l.includes('選定可能'))}）`)
      assert(/未分類・要確認[^\n]*1件/.test(text), '未分類・要確認1件と表示されるはず')
    },
  },
  {
    name: '全件分類済み（未分類0件）のときは unclassifiedCount=0・selectableCount=counts.A',
    fn: () => {
      const assessments = [mkA(1, 'SWEETS'), mkA(2, 'ART')]
      const report = buildMorningReport(assessments, { now: new Date('2026-09-25T00:00:00Z') })
      assert(report.unclassifiedCount === 0, '未分類0件のはず')
      assert(report.selectableCount === report.counts.A, '全件分類済みなら選定可能＝A判定合計のはず')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('buildMorningReport', cases)
