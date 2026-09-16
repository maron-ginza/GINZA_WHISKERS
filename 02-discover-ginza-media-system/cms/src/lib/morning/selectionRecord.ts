// GINZA WHISKERS / Project 02（2026-09-16続き5、マロン指示：V1 5段階責任分離）
// — Stage 4「マロンによる3本選定」の記録の組み立て・検証（純粋関数）。
//
// 【責務】候補ボード（Stage 3）から、マロンが選んだ DC 番号の並びを受け取り、
// 1) 候補ボードに実在する（使用済みでない・A判定の）候補だけを picks とする
// 2) SWEETS 1本・合計3本の条件を検証し、満たさない場合は**警告を出すのみで
//    自動代替はしない**（マロン指示）
// 3) A/B/C・カテゴリー・DiscoveredContent 等のDBデータは一切変更しない
//    （このファイルは選定「記録」の組み立てのみ。ファイル保存は呼び出し元が行う）
//
// 選定記録はA/B/Cとは別の記録として保存する——CandidateAssessment・DBを書き換える
// フィールドは持たない。

import type { CandidateBoard, BoardEntry } from './candidateBoard'
import { REQUIRED_CATEGORY } from './selectMorningThreeSlots'

export interface SelectionPick {
  discoveredContentId: number
  title: string
  category: string | null
  facilityLabel: string | null
  sourceUrl: string
  rank: number
}

export interface MorningSelectionRecord {
  /** 対象日（YYYY-MM-DD） */
  date: string
  /** 記録作成時刻（ISO） */
  selectedAt: string
  /** 選定者名（既定 'マロン'） */
  selectedBy: string
  picks: SelectionPick[]
  /** picks の中に SWEETS が1件以上含まれるか */
  sweetsSatisfied: boolean
  /** 3本・SWEETS1本の条件を満たさない場合の警告（自動代替はしない・記録はそのまま保存） */
  warnings: string[]
  /** 候補ボードに見つからず picks に含められなかった DC 番号（推測で補完しない） */
  rejected: { discoveredContentId: number; reason: string }[]
}

function findInBoard(board: CandidateBoard, dcId: number): BoardEntry | null {
  for (const e of board.sweets) if (e.discoveredContentId === dcId) return e
  for (const cat of Object.keys(board.byCategory)) {
    for (const e of board.byCategory[cat]) if (e.discoveredContentId === dcId) return e
  }
  // 未分類は選定対象にしない（Stage 4 は「SWEETS＋その他17カテゴリー」からの選定のため）
  return null
}

/**
 * Stage 4：マロンの選定を検証し、選定記録を組み立てる（純粋関数・DB非依存）。
 * @param board Stage 3 の候補ボード（当日分。呼び出し元が buildCandidateBoard で用意）
 * @param discoveredContentIds マロンが選んだ DC 番号（入力順＝優先順位）
 */
export function buildSelectionRecord(params: {
  date: string
  selectedBy?: string
  now?: Date
  board: CandidateBoard
  discoveredContentIds: number[]
}): MorningSelectionRecord {
  const now = params.now ?? new Date()
  const selectedBy = params.selectedBy ?? 'マロン'
  const picks: SelectionPick[] = []
  const rejected: MorningSelectionRecord['rejected'] = []
  const seen = new Set<number>()

  params.discoveredContentIds.forEach((dcId, i) => {
    if (seen.has(dcId)) {
      rejected.push({ discoveredContentId: dcId, reason: '重複指定（同一DCを2回以上選定できない）' })
      return
    }
    const entry = findInBoard(params.board, dcId)
    if (!entry) {
      rejected.push({
        discoveredContentId: dcId,
        reason: '候補ボードに見つからない（A判定でない・使用済み・未分類のいずれか。推測で補完しない）',
      })
      return
    }
    seen.add(dcId)
    picks.push({
      discoveredContentId: entry.discoveredContentId,
      title: entry.title,
      category: entry.category,
      facilityLabel: entry.facilityLabel,
      sourceUrl: entry.sourceUrl,
      rank: i + 1,
    })
  })

  const sweetsSatisfied = picks.some((p) => p.category === REQUIRED_CATEGORY)
  const warnings: string[] = []
  if (picks.length !== 3) {
    warnings.push(`選定件数が3件ではありません（実際 ${picks.length} 件）。自動代替はしていません。`)
  }
  if (!sweetsSatisfied) {
    warnings.push('SWEETSカテゴリーの候補が選定に含まれていません。自動代替はしていません。')
  }
  if (rejected.length > 0) {
    warnings.push(`候補ボードに見つからず選定から除外した指定が ${rejected.length} 件あります（詳細は rejected 参照）。`)
  }

  return { date: params.date, selectedAt: now.toISOString(), selectedBy, picks, sweetsSatisfied, warnings, rejected }
}

/**
 * 過去の選定記録群から「使用済み（＝実際にマロンが選定した）DC番号」の集合を作る
 * （純粋関数）。時間窓なし——一度選定された DC は恒久的に候補ボードから除外する
 * （施設単位の14日間クールダウンとは別の概念）。
 */
export function collectUsedDcIds(records: MorningSelectionRecord[]): Set<number> {
  const ids = new Set<number>()
  for (const r of records) for (const p of r.picks) ids.add(p.discoveredContentId)
  return ids
}
