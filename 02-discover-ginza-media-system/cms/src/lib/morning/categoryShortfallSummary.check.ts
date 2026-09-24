// GINZA WHISKERS / Project 02（2026-09-24続き2）— categoryShortfallSummary の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/categoryShortfallSummary.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { filterByCategory, filterNonSweetsClassified, summarizeShortfallReasons } from './categoryShortfallSummary'
import type { CandidateAssessment } from './types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function mk(over: Partial<CandidateAssessment> & { discoveredContentId: number }): CandidateAssessment {
  return {
    discoveredContentId: over.discoveredContentId,
    title: `候補#${over.discoveredContentId}`,
    displayTitle: `候補#${over.discoveredContentId}`,
    sourceName: '出典',
    sourceUrl: 'https://example.com',
    verdict: over.verdict ?? 'B',
    reasons: over.reasons ?? [],
    verifiedItems: [],
    missing: [],
    unconfirmed: [],
    dedup: over.dedup ?? { duplicate: false },
    expired: over.expired ?? false,
    ginzaRelevant: over.ginzaRelevant ?? true,
    hasTraceableSource: over.hasTraceableSource ?? true,
    factKind: 'unknown',
    factsSource: 'none',
    templateEligible: false,
    image: { available: false, policy: 'テスト', externalImageProhibited: true },
    eventPeriod: '不明',
    applyDeadline: '不明／なし',
    estimateMinutes: 25,
    facilityNotice: over.facilityNotice,
    digestMeta: over.digestMeta,
  } as CandidateAssessment
}

const cases: CheckCase[] = [
  {
    name: '既投稿重複・施設14日間隔・出典URLなしをそれぞれ正しく集計する',
    fn: () => {
      const items: CandidateAssessment[] = [
        mk({ discoveredContentId: 1, dedup: { duplicate: true } }),
        mk({
          discoveredContentId: 2,
          facilityNotice: { recentlyUsed: true, parentFacilityLabel: null, lastUsedDate: null, lastArticleId: null, daysSince: null, message: 'x' },
        }),
        mk({ discoveredContentId: 3, hasTraceableSource: false }),
      ]
      const r = summarizeShortfallReasons(items)
      assert(r.totalNonA === 3, `対象3件のはず（実際 ${r.totalNonA}）`)
      const byLabel = Object.fromEntries(r.reasons.map((x) => [x.label, x.count]))
      assert(byLabel['既投稿と重複'] === 1, `既投稿と重複=1のはず（実際 ${byLabel['既投稿と重複']}）`)
      assert(byLabel['施設14日間隔（直近使用）'] === 1, '施設14日間隔=1のはず')
      assert(byLabel['追跡可能な公式出典URLが無い'] === 1, '出典URLなし=1のはず')
    },
  },
  {
    name: 'articleFactsNotReadyを含むreasonsは「期間・必須事実が公式情報で未確認」に計上される',
    fn: () => {
      const items: CandidateAssessment[] = [
        mk({ discoveredContentId: 1, reasons: ['articleFactsNotReady（ArticleFactsがready化されていません）'] }),
      ]
      const r = summarizeShortfallReasons(items)
      const byLabel = Object.fromEntries(r.reasons.map((x) => [x.label, x.count]))
      assert(byLabel['期間・必須事実が公式情報で未確認'] === 1, 'articleFactsNotReadyが正しく分類されるはず')
    },
  },
  {
    name: '1件が複数理由に該当する場合は両方のカウントへ加算する（主因1つに絞らない）',
    fn: () => {
      const items: CandidateAssessment[] = [
        mk({ discoveredContentId: 1, dedup: { duplicate: true }, hasTraceableSource: false }),
      ]
      const r = summarizeShortfallReasons(items)
      const byLabel = Object.fromEntries(r.reasons.map((x) => [x.label, x.count]))
      assert(byLabel['既投稿と重複'] === 1 && byLabel['追跡可能な公式出典URLが無い'] === 1, '両方に加算されるはず')
    },
  },
  {
    name: 'verdict===Aの候補は対象から除外する（shortfallはB/Cのみを対象にする）',
    fn: () => {
      const items: CandidateAssessment[] = [mk({ discoveredContentId: 1, verdict: 'A', dedup: { duplicate: true } })]
      const r = summarizeShortfallReasons(items)
      assert(r.totalNonA === 0, 'A判定は対象外のはず')
      assert(r.reasons.length === 0, '理由も空のはず')
    },
  },
  {
    name: 'どの理由にも該当しない場合は「その他」に計上する（推測で細分化しない）',
    fn: () => {
      const items: CandidateAssessment[] = [mk({ discoveredContentId: 1, reasons: ['未知の理由'] })]
      const r = summarizeShortfallReasons(items)
      const byLabel = Object.fromEntries(r.reasons.map((x) => [x.label, x.count]))
      assert(byLabel['その他'] === 1, '未分類の理由は「その他」に計上されるはず')
    },
  },
  {
    name: 'filterByCategory: digestMeta.category が一致する候補だけを絞り込む',
    fn: () => {
      const items: CandidateAssessment[] = [
        mk({ discoveredContentId: 1, digestMeta: { category: 'SWEETS' } as CandidateAssessment['digestMeta'] }),
        mk({ discoveredContentId: 2, digestMeta: { category: 'ART' } as CandidateAssessment['digestMeta'] }),
      ]
      const r = filterByCategory(items, 'SWEETS')
      assert(r.length === 1 && r[0].discoveredContentId === 1, 'SWEETSのみ絞り込まれるはず')
    },
  },
  {
    name: 'filterNonSweetsClassified: SWEETS以外の分類済み候補のみを対象にする（未分類・SWEETSは除外）',
    fn: () => {
      const items: CandidateAssessment[] = [
        mk({ discoveredContentId: 1, digestMeta: { category: 'SWEETS' } as CandidateAssessment['digestMeta'] }),
        mk({ discoveredContentId: 2, digestMeta: { category: 'ART' } as CandidateAssessment['digestMeta'] }),
        mk({ discoveredContentId: 3, digestMeta: { category: null } as CandidateAssessment['digestMeta'] }),
      ]
      const r = filterNonSweetsClassified(items)
      assert(r.length === 1 && r[0].discoveredContentId === 2, 'ARTのみ残るはず（実際 ' + JSON.stringify(r.map((x) => x.discoveredContentId)) + '）')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('categoryShortfallSummary', cases)
