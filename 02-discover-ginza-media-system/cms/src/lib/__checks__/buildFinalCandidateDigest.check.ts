// GINZA WHISKERS / Project 02 — buildFinalCandidateDigest の回帰テスト（2026-09-05）
//
//   ・当日の公式確認（officialFetch.ok）が無い／失敗した候補は除外
//   ・開催終了・開催日不明・場所不明・重複は除外
//   ・同一施設・同一ドメイン上限2件
//   ・5候補提示時は原則4カテゴリー以上に分散
//   ・品質条件を満たす候補が5件未満なら水増ししない

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { buildFinalCandidateDigest } from '../morning/buildFinalCandidateDigest'
import type { CandidateAssessment, DigestMeta } from '../morning/types'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

function makeDigestMeta(overrides: Partial<DigestMeta> = {}): DigestMeta {
  return {
    venue: 'テスト会場',
    officialFetch: { requested: true, ok: true, httpStatus: 200, fetchedAt: '2026-09-05T00:00:00.000Z' },
    priceHint: null,
    facilityKey: 'test-facility',
    facilityLabel: 'テスト施設',
    category: 'ART',
    categoryBasis: 'title',
    publishedAt: null,
    origin: 'approved',
    ...overrides,
  }
}

function makeAssessment(overrides: Partial<CandidateAssessment> & { discoveredContentId: number }): CandidateAssessment {
  const id = overrides.discoveredContentId
  const base: CandidateAssessment = {
    discoveredContentId: id,
    title: `候補#${id}`,
    displayTitle: `候補#${id}`,
    sourceName: 'テスト情報源',
    sourceUrl: `https://example.com/${id}`,
    verifiedAt: '2026-09-05T00:00:00.000Z',
    verdict: 'A',
    reasons: [],
    verifiedItems: [],
    missing: [],
    unconfirmed: [],
    dedup: { duplicate: false },
    expired: false,
    ginzaRelevant: true,
    hasTraceableSource: true,
    factsSource: 'ready',
    templateEligible: true,
    image: { available: false, policy: '画像なし（テスト）', externalImageProhibited: true },
    eventPeriod: '2026-09-10',
    applyDeadline: '不明／なし',
    estimateMinutes: 25,
    templateType: 'exhibition',
    digestMeta: makeDigestMeta(),
  }
  return { ...base, ...overrides }
}

const cases: CheckCase[] = [
  {
    name: 'verdict !== A の候補は除外される',
    fn: () => {
      const d = buildFinalCandidateDigest([makeAssessment({ discoveredContentId: 1, verdict: 'B', reasons: ['不足あり'] })])
      assert(d.candidates.length === 0, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 1 && /A判定でない/.test(e.reason)), '除外理由')
    },
  },
  {
    name: 'HTTP 403 等で当日の公式確認が失敗した候補は除外される',
    fn: () => {
      const d = buildFinalCandidateDigest([
        makeAssessment({
          discoveredContentId: 2,
          digestMeta: makeDigestMeta({ officialFetch: { requested: true, ok: false, httpStatus: 403 } }),
        }),
      ])
      assert(d.candidates.length === 0, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 2 && /当日取得できなかった/.test(e.reason) && /403/.test(e.reason)), `除外理由: ${JSON.stringify(d.excluded)}`)
    },
  },
  {
    name: '開催終了済みの候補は除外される',
    fn: () => {
      const d = buildFinalCandidateDigest([makeAssessment({ discoveredContentId: 3, expired: true })])
      assert(d.candidates.length === 0, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 3 && /開催終了済み/.test(e.reason)), '除外理由')
    },
  },
  {
    name: '開催日不明の候補は除外される',
    fn: () => {
      const d = buildFinalCandidateDigest([makeAssessment({ discoveredContentId: 4, eventPeriod: '不明' })])
      assert(d.candidates.length === 0, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 4 && /開催日が不明/.test(e.reason)), '除外理由')
    },
  },
  {
    name: '場所（会場）不明の候補は除外される',
    fn: () => {
      const d = buildFinalCandidateDigest([makeAssessment({ discoveredContentId: 5, digestMeta: makeDigestMeta({ venue: null }) })])
      assert(d.candidates.length === 0, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 5 && /場所（会場）が不明/.test(e.reason)), '除外理由')
    },
  },
  {
    name: '既出重複の候補は除外される',
    fn: () => {
      const d = buildFinalCandidateDigest([
        makeAssessment({ discoveredContentId: 6, dedup: { duplicate: true, existingArticleId: 99, signalSummary: ['同一sourceUrl'] } }),
      ])
      assert(d.candidates.length === 0, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 6 && /重複/.test(e.reason)), '除外理由')
    },
  },
  {
    name: '同一施設・同一ドメインは上限2件（3件目は除外理由つきで落ちる）',
    fn: () => {
      const list = [
        makeAssessment({ discoveredContentId: 11, eventPeriod: '2026-09-10', digestMeta: makeDigestMeta({ facilityKey: 'ginza-six', category: 'FOOD' }) }),
        makeAssessment({ discoveredContentId: 12, eventPeriod: '2026-09-11', digestMeta: makeDigestMeta({ facilityKey: 'ginza-six', category: 'SHOPPING' }) }),
        makeAssessment({ discoveredContentId: 13, eventPeriod: '2026-09-12', digestMeta: makeDigestMeta({ facilityKey: 'ginza-six', category: 'BEAUTY' }) }),
      ]
      const d = buildFinalCandidateDigest(list, { facilityCap: 2 })
      assert(d.candidates.length === 2, `件数: ${d.candidates.length}`)
      assert(d.excluded.some((e) => e.discoveredContentId === 13 && /上限/.test(e.reason)), `除外: ${JSON.stringify(d.excluded)}`)
    },
  },
  {
    name: '5候補すべて揃うとき原則4カテゴリー以上に分散する',
    fn: () => {
      const cats = ['ART', 'FOOD', 'WELLNESS', 'MUSIC', 'SHOPPING']
      const list = cats.map((cat, i) =>
        makeAssessment({
          discoveredContentId: 100 + i,
          eventPeriod: `2026-09-${10 + i}`,
          digestMeta: makeDigestMeta({ facilityKey: `facility-${i}`, category: cat }),
        }),
      )
      const d = buildFinalCandidateDigest(list)
      assert(d.candidates.length === 5, `件数: ${d.candidates.length}`)
      assert(d.diversitySummary.categoriesUsed >= 4, `カテゴリー数: ${d.diversitySummary.categoriesUsed}`)
      assert(d.diversitySummary.achievedDiversity === true, '分散達成')
    },
  },
  {
    name: '品質条件を満たす候補が5件未満なら水増ししない（shortfall=true）',
    fn: () => {
      const list = [
        makeAssessment({ discoveredContentId: 201, digestMeta: makeDigestMeta({ facilityKey: 'facility-a', category: 'ART' }) }),
        makeAssessment({ discoveredContentId: 202, digestMeta: makeDigestMeta({ facilityKey: 'facility-b', category: 'FOOD' }) }),
      ]
      const d = buildFinalCandidateDigest(list)
      assert(d.candidates.length === 2, `件数: ${d.candidates.length}（5に水増ししていないか）`)
      assert(d.shortfall === true, 'shortfall=true')
      assert(d.diversitySummary.achievedDiversity === true, '5件未満は分散未達を失敗扱いにしない')
    },
  },
  {
    name: '各確定候補には編集ブリーフ（タイトル案・構成案・記事量・無料/有料候補）が付与される',
    fn: () => {
      const d = buildFinalCandidateDigest([
        makeAssessment({ discoveredContentId: 301, digestMeta: makeDigestMeta({ facilityKey: 'facility-c', category: 'FOOD' }) }),
      ])
      assert(d.candidates.length === 1, '1件確定')
      const c = d.candidates[0]
      assert(c.brief.titleCandidates.length > 0, 'タイトル案あり')
      assert(c.brief.structureOutline.length > 0, '構成案あり')
      assert(!!c.brief.recommendedLength.charRange, '推奨記事量あり')
      assert(c.brief.payFreeCandidate.type === 'free' || c.brief.payFreeCandidate.type === 'paid_candidate', '無料/有料候補あり')
      assert(c.price === '確認できません（公式に価格表記なし／要確認）', `価格未取得時の表示: ${c.price}`)
    },
  },
  {
    name: '候補0件のときは0件を正常結果として返す（水増ししない）',
    fn: () => {
      const d = buildFinalCandidateDigest([])
      assert(d.candidates.length === 0, '0件')
      assert(d.shortfall === true, 'shortfall=true')
    },
  },
]

export const suite = () => runSuite('buildFinalCandidateDigest', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
