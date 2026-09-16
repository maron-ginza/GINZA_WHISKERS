// GINZA WHISKERS / Project 02（2026-09-16続き5）— Stage 4 選定記録の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/selectionRecord.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { buildSelectionRecord, collectUsedDcIds, type MorningSelectionRecord } from './selectionRecord'
import type { CandidateBoard } from './candidateBoard'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

function mkBoard(): CandidateBoard {
  return {
    sweets: [
      { discoveredContentId: 1, title: 'SWEETS候補', facilityLabel: '菓子店', category: 'SWEETS', eventPeriod: '不明', sourceUrl: 'https://example.com/1', reasons: ['理由'] },
    ],
    byCategory: {
      ART: [
        { discoveredContentId: 2, title: 'ART候補', facilityLabel: '美術館', category: 'ART', eventPeriod: '不明', sourceUrl: 'https://example.com/2', reasons: ['理由'] },
      ],
      FOOD: [
        { discoveredContentId: 3, title: 'FOOD候補', facilityLabel: '飲食店', category: 'FOOD', eventPeriod: '不明', sourceUrl: 'https://example.com/3', reasons: ['理由'] },
      ],
    },
    unclassified: [
      { discoveredContentId: 4, title: '未分類候補', facilityLabel: null, category: null, eventPeriod: '不明', sourceUrl: 'https://example.com/4', reasons: ['理由'] },
    ],
    usedExcludedCount: 0,
  }
}

const cases: CheckCase[] = [
  {
    name: '正常な3本選定（SWEETS1本含む）はwarnings 0・sweetsSatisfied:true',
    fn: () => {
      const board = mkBoard()
      const rec = buildSelectionRecord({ date: '2026-09-16', board, discoveredContentIds: [1, 2, 3] })
      assert(rec.picks.length === 3, `3件（実際 ${rec.picks.length}）`)
      assert(rec.sweetsSatisfied === true, 'SWEETS含む')
      assert(rec.warnings.length === 0, `警告0件（実際 ${JSON.stringify(rec.warnings)}）`)
    },
  },
  {
    name: 'SWEETSを含まない選定は警告のみ・自動代替はしない（picksはそのまま2件）',
    fn: () => {
      const board = mkBoard()
      const rec = buildSelectionRecord({ date: '2026-09-16', board, discoveredContentIds: [2, 3] })
      assert(rec.picks.length === 2, `指定どおり2件のまま（実際 ${rec.picks.length}）`)
      assert(rec.sweetsSatisfied === false, 'SWEETS不足')
      assert(rec.warnings.some((w) => w.includes('SWEETS')), 'SWEETS警告が出る')
    },
  },
  {
    name: '3本を満たさない選定（1件のみ）は警告のみで保存される（自動で埋めない）',
    fn: () => {
      const board = mkBoard()
      const rec = buildSelectionRecord({ date: '2026-09-16', board, discoveredContentIds: [1] })
      assert(rec.picks.length === 1, '1件のまま')
      assert(rec.warnings.some((w) => w.includes('3件')), '件数警告が出る')
    },
  },
  {
    name: '候補ボードに存在しないDC番号（未分類・B/C・存在しない等）はrejectedに入り、picksには含まれない',
    fn: () => {
      const board = mkBoard()
      const rec = buildSelectionRecord({ date: '2026-09-16', board, discoveredContentIds: [1, 4, 999] })
      assert(rec.picks.length === 1 && rec.picks[0].discoveredContentId === 1, 'SWEETSのみpicksに入る')
      assert(rec.rejected.length === 2, `未分類(4)と存在しない(999)がrejected（実際 ${JSON.stringify(rec.rejected)}）`)
    },
  },
  {
    name: '選定記録の組み立てはA/B/C・カテゴリー・DB値を一切変更しない（board/入力が変化しない）',
    fn: () => {
      const board = mkBoard()
      const snapshot = JSON.stringify(board)
      buildSelectionRecord({ date: '2026-09-16', board, discoveredContentIds: [1, 2, 3] })
      assert(JSON.stringify(board) === snapshot, 'boardが変化していない')
    },
  },
  {
    name: 'collectUsedDcIdsは複数日の選定記録からpicksのDC番号だけを集める',
    fn: () => {
      const r1: MorningSelectionRecord = {
        date: '2026-09-15',
        selectedAt: '2026-09-15T00:00:00.000Z',
        selectedBy: 'マロン',
        picks: [
          { discoveredContentId: 10, title: '', category: 'SWEETS', facilityLabel: null, sourceUrl: '', rank: 1 },
        ],
        sweetsSatisfied: true,
        warnings: [],
        rejected: [],
      }
      const r2: MorningSelectionRecord = {
        date: '2026-09-16',
        selectedAt: '2026-09-16T00:00:00.000Z',
        selectedBy: 'マロン',
        picks: [
          { discoveredContentId: 11, title: '', category: 'ART', facilityLabel: null, sourceUrl: '', rank: 1 },
        ],
        sweetsSatisfied: false,
        warnings: [],
        rejected: [],
      }
      const used = collectUsedDcIds([r1, r2])
      assert(used.has(10) && used.has(11) && used.size === 2, `10,11のみ（実際 ${[...used]}）`)
    },
  },
  {
    name: '過去にボードへ表示されただけ（選定記録に無い）DCはcollectUsedDcIdsに含まれない——本日選ばれなかったAが翌日Aのまま保持される前提',
    fn: () => {
      // ボードに表示されたが選ばれなかった候補（DC#4）は selection record に一切登場しない。
      const r: MorningSelectionRecord = {
        date: '2026-09-16',
        selectedAt: '2026-09-16T00:00:00.000Z',
        selectedBy: 'マロン',
        picks: [{ discoveredContentId: 1, title: '', category: 'SWEETS', facilityLabel: null, sourceUrl: '', rank: 1 }],
        sweetsSatisfied: true,
        warnings: [],
        rejected: [{ discoveredContentId: 4, reason: '候補ボードに見つからない' }],
      }
      const used = collectUsedDcIds([r])
      assert(!used.has(4), '選ばれなかった候補4は使用済みにならない')
    },
  },
  {
    name: '重複指定（同一DCを2回選定）は2回目をrejectedへ',
    fn: () => {
      const board = mkBoard()
      const rec = buildSelectionRecord({ date: '2026-09-16', board, discoveredContentIds: [1, 1, 2] })
      assert(rec.picks.length === 2, '重複は1回だけpicksに入る')
      assert(rec.rejected.some((r) => r.discoveredContentId === 1), '2回目の1がrejectedに入る')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('selectionRecord', cases)
