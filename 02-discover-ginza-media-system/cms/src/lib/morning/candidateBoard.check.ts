// GINZA WHISKERS / Project 02（2026-09-16続き5）— Stage 3 候補ボードの回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/candidateBoard.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { buildCandidateBoard } from './candidateBoard'
import type { CandidateAssessment } from './types'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function mkAssessment(over: Partial<CandidateAssessment> & { discoveredContentId: number }): CandidateAssessment {
  return {
    discoveredContentId: over.discoveredContentId,
    title: over.title ?? `候補 #${over.discoveredContentId}`,
    displayTitle: over.displayTitle ?? over.title ?? `候補 #${over.discoveredContentId}`,
    sourceName: over.sourceName ?? '出典',
    sourceUrl: over.sourceUrl ?? `https://example.com/${over.discoveredContentId}`,
    verifiedAt: over.verifiedAt,
    verdict: over.verdict ?? 'A',
    reasons: over.reasons ?? ['目的型：テスト理由（カテゴリー：SWEETS）'],
    verifiedItems: over.verifiedItems ?? [],
    missing: over.missing ?? [],
    unconfirmed: over.unconfirmed ?? [],
    dedup: over.dedup ?? { duplicate: false },
    expired: over.expired ?? false,
    ginzaRelevant: over.ginzaRelevant ?? true,
    ginzaRelevanceBasis: over.ginzaRelevanceBasis ?? 'テスト',
    hasTraceableSource: over.hasTraceableSource ?? true,
    factKind: over.factKind ?? 'event',
    factsSource: over.factsSource ?? 'none',
    templateEligible: over.templateEligible ?? false,
    image: over.image ?? { available: false, policy: 'テスト' },
    eventPeriod: over.eventPeriod ?? '不明',
    applyDeadline: over.applyDeadline ?? '不明／なし',
    estimateMinutes: over.estimateMinutes ?? 25,
    bAdditionalMinutes: over.bAdditionalMinutes,
    digestMeta: over.digestMeta,
    facilityNotice: over.facilityNotice,
  } as CandidateAssessment
}

function withCategory(id: number, category: string | null, facilityKey: string | null = null): CandidateAssessment {
  return mkAssessment({
    discoveredContentId: id,
    verdict: 'A',
    digestMeta: {
      venue: null,
      officialFetch: null,
      priceHint: null,
      facilityKey,
      facilityLabel: facilityKey ?? '',
      parentFacilityKey: null,
      parentFacilityLabel: null,
      category,
      categoryBasis: category ? 'title' : null,
      publishedAt: null,
      origin: 'approved',
    },
  })
}

const cases: CheckCase[] = [
  {
    name: 'SWEETSは先頭の独立枠（sweets配列）に入り、byCategoryには入らない',
    fn: () => {
      const sweets = withCategory(1, 'SWEETS')
      const art = withCategory(2, 'ART')
      const board = buildCandidateBoard([sweets, art])
      assert(board.sweets.length === 1 && board.sweets[0].discoveredContentId === 1, 'SWEETSがsweets枠に入る')
      assert(!('SWEETS' in board.byCategory), 'byCategoryにSWEETSキーは作らない')
      assert(board.byCategory.ART?.length === 1, 'ART候補はbyCategory.ARTに入る')
    },
  },
  {
    name: 'その他17カテゴリーのA候補がカテゴリー別に表示される',
    fn: () => {
      const art = withCategory(11, 'ART')
      const food = withCategory(12, 'FOOD')
      const board = buildCandidateBoard([art, food])
      assert(Object.keys(board.byCategory).sort().join(',') === 'ART,FOOD', 'ART/FOODが別キーで表示')
    },
  },
  {
    name: '未分類（category null）は unclassified に入り byCategory には入らない',
    fn: () => {
      const unclassified = withCategory(21, null)
      const board = buildCandidateBoard([unclassified])
      assert(board.unclassified.length === 1, '未分類が別枠に入る')
      assert(Object.keys(board.byCategory).length === 0, 'byCategoryは空')
    },
  },
  {
    name: 'B・C・終了済み等、verdict!==A の候補はボードに一切出ない',
    fn: () => {
      const a = withCategory(31, 'SWEETS')
      const b = mkAssessment({ discoveredContentId: 32, verdict: 'B' })
      const c = mkAssessment({ discoveredContentId: 33, verdict: 'C' })
      const board = buildCandidateBoard([a, b, c])
      const allIds = [...board.sweets, ...board.unclassified, ...Object.values(board.byCategory).flat()].map(
        (e) => e.discoveredContentId,
      )
      assert(allIds.length === 1 && allIds[0] === 31, `A以外は出ない（実際 ${JSON.stringify(allIds)}）`)
    },
  },
  {
    name: '使用済み（usedDcIds）のA候補はボードから除外され、usedExcludedCountに数えられる',
    fn: () => {
      const a1 = withCategory(41, 'SWEETS')
      const a2 = withCategory(42, 'ART')
      const board = buildCandidateBoard([a1, a2], new Set([41]))
      const allIds = [...board.sweets, ...Object.values(board.byCategory).flat()].map((e) => e.discoveredContentId)
      assert(!allIds.includes(41), '使用済みの41は出ない')
      assert(allIds.includes(42), '未使用の42は出る')
      assert(board.usedExcludedCount === 1, `usedExcludedCount=1（実際 ${board.usedExcludedCount}）`)
    },
  },
  {
    name: '本日選ばれなかった（＝usedDcIdsに含まれない）Aは、翌日以降もボードへ残る——単に過去に表示されただけでは除外しない',
    fn: () => {
      // usedDcIds は「実際に選定された」DCのみを表す。過去に一度ボードに出たが
      // 選ばれなかった候補（＝ここでは単純に usedDcIds が空の状態を再現）は、
      // 何度呼び出しても毎回ボードに出続けることを確認する（除外の記憶を持たない）。
      const a = withCategory(51, 'FOOD')
      const board1 = buildCandidateBoard([a], new Set())
      const board2 = buildCandidateBoard([a], new Set())
      const ids1 = Object.values(board1.byCategory).flat().map((e) => e.discoveredContentId)
      const ids2 = Object.values(board2.byCategory).flat().map((e) => e.discoveredContentId)
      assert(ids1.includes(51) && ids2.includes(51), '未選定のAは繰り返し呼んでもボードに残る')
    },
  },
  {
    name: 'ボード生成はA/B/C・カテゴリーを一切変更しない（入力のCandidateAssessmentを書き換えない）',
    fn: () => {
      const a = withCategory(61, 'SWEETS')
      const originalVerdict = a.verdict
      const originalCategory = a.digestMeta?.category
      buildCandidateBoard([a], new Set())
      assert(a.verdict === originalVerdict, 'verdictが変化していない')
      assert(a.digestMeta?.category === originalCategory, 'categoryが変化していない')
    },
  },
  {
    name: '各BoardEntryにDC番号・タイトル・施設・期間・カテゴリー・URL・A判定理由が含まれる',
    fn: () => {
      const a = withCategory(71, 'SWEETS', 'ginza-motoji')
      const board = buildCandidateBoard([a])
      const e = board.sweets[0]
      assert(e.discoveredContentId === 71, 'DC番号')
      assert(typeof e.title === 'string' && e.title.length > 0, 'タイトル')
      assert(e.facilityLabel === 'ginza-motoji', '施設')
      assert(e.category === 'SWEETS', 'カテゴリー')
      assert(typeof e.eventPeriod === 'string', '期間')
      assert(typeof e.sourceUrl === 'string', 'URL')
      assert(Array.isArray(e.reasons) && e.reasons.length > 0, 'A判定理由')
    },
  },
  {
    // 2026-09-17追加・マロン指示：A判定と施設クールダウンの責務分離。施設クールダウン中でも
    // A候補はボードに出続け（除外・降格しない）、facilityNoticeが注意情報として表示される。
    name: '施設クールダウン中のA候補はボードから除外されず、facilityNoticeが注意情報として表示される',
    fn: () => {
      const a = withCategory(81, 'SWEETS', 'matsuya-ginza')
      a.facilityNotice = {
        recentlyUsed: true,
        parentFacilityLabel: '松屋銀座',
        lastUsedDate: '2026-09-14T00:00:00Z',
        lastArticleId: 69,
        daysSince: 3,
        message: '同一施設が直近に使用されています（過去14日以内に同一施設（松屋銀座）でArticle #69 作成（2026-09-14））',
      }
      const board = buildCandidateBoard([a])
      assert(board.sweets.length === 1 && board.sweets[0].discoveredContentId === 81, '施設クールダウン中でもボードに出る（除外しない）')
      const e = board.sweets[0]
      assert(!!e.facilityNotice, 'facilityNoticeがBoardEntryに伝わる')
      assert(e.facilityNotice?.parentFacilityLabel === '松屋銀座', '親施設名が伝わる')
      assert(e.facilityNotice?.lastArticleId === 69, '前回の記事IDが伝わる')
      assert(e.facilityNotice?.daysSince === 3, '経過日数が伝わる')
    },
  },
  {
    name: '施設クールダウン対象外（facilityNotice未設定）のA候補は注意表示なしでボードに出る',
    fn: () => {
      const a = withCategory(82, 'ART', 'some-other-facility')
      const board = buildCandidateBoard([a])
      const e = board.byCategory.ART[0]
      assert(e.facilityNotice === undefined, 'facilityNoticeが無ければ表示しない')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('candidateBoard', cases)
