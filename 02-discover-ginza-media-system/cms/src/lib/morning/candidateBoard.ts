// GINZA WHISKERS / Project 02（2026-09-16続き5、マロン指示：V1 5段階責任分離）
// — Stage 3「A候補ボード」の組み立て（純粋関数）。
//
// 【責務】Stage 1（A/B/C判定）・Stage 2（18カテゴリー分類）が確定させた
// CandidateAssessment 配列から、Stage 4（マロンによる選定）のための一覧を作るだけ。
// 最終3本をこのファイルが確定することはない（selectMorningThreeSlots の自動確定は
// 通常経路から外した——このファイルはその代わりに置かれる）。
//
// 【board作成処理はA/B/C・カテゴリー・DBデータを一切書き換えない】読むだけの
// 純粋関数（CandidateAssessment[] と使用済みDC集合を受け取り、表示用の構造体を
// 返すのみ）。
//
// 【使用済みの扱い】usedDcIds は「過去にマロンが実際に選定した（＝
// selectionRecord.ts の MorningSelectionRecord に picks として記録された）DC」の
// 集合——単に過去のボードに表示されただけの候補は使用済みにしない（マロン指示：
// 「本日選ばれなかったAは、翌日も有効条件を満たす限りAのまま保持する」
// 「未選定Aは候補ストックとして翌日以降も保持する」）。呼び出し元
// （morningRun.ts）がこの集合をどう構築するかはこのファイルの関知するところではない。
//
// 【優先順位】各グループ内の並び順は selectMorningThreeSlots.rankCandidatesByPriority
// を再利用する（二重実装しない）。並び順はあくまで参考表示であり、最終選定はマロンが行う。

import type { CandidateAssessment } from './types'
import { REQUIRED_CATEGORY, rankCandidatesByPriority } from './selectMorningThreeSlots'

export interface BoardEntry {
  discoveredContentId: number
  title: string
  facilityLabel: string | null
  category: string | null
  eventPeriod: string
  sourceUrl: string
  /** A判定理由（CandidateAssessment.reasons をそのまま） */
  reasons: string[]
  /**
   * 【2026-09-17追加・マロン指示：A判定と施設クールダウンの責務分離】施設クールダウン
   * の注意情報（CandidateAssessment.facilityNotice をそのまま）。A/B/C判定には
   * 影響しない——該当候補にだけ設定される表示専用データ（無ければ undefined）。
   * 最終3本への採否はマロンが判断する（このボードは注意表示のみで自動除外しない）。
   */
  facilityNotice?: CandidateAssessment['facilityNotice']
}

export interface CandidateBoard {
  /** SWEETS候補（先頭の独立枠。マロン指示：「SWEETS候補を先頭の独立枠で表示」） */
  sweets: BoardEntry[]
  /** SWEETS以外の17カテゴリー別（キーは deriveProvisionalCategory の category 値） */
  byCategory: Record<string, BoardEntry[]>
  /** A判定だがカテゴリー未確定（推測で割り当てない。件数・DC番号のみ表示） */
  unclassified: BoardEntry[]
  /** 対象から除外した使用済み（過去にマロンが選定済み）A候補の件数 */
  usedExcludedCount: number
}

function toBoardEntry(a: CandidateAssessment): BoardEntry {
  return {
    discoveredContentId: a.discoveredContentId,
    title: a.displayTitle,
    facilityLabel: a.digestMeta?.facilityLabel || a.digestMeta?.facilityKey || null,
    category: a.digestMeta?.category ?? null,
    eventPeriod: a.eventPeriod,
    sourceUrl: a.sourceUrl,
    reasons: a.reasons,
    facilityNotice: a.facilityNotice,
  }
}

/**
 * Stage 3：A候補ボードを組み立てる（純粋関数・読み取り専用）。
 * @param assessments Stage 1/2 済みの全候補（A/B/C・category は既に確定済みとして扱う）
 * @param usedDcIds 過去にマロンが実際に選定した DC の集合（selectionRecord.collectUsedDcIds の結果）
 */
export function buildCandidateBoard(
  assessments: CandidateAssessment[],
  usedDcIds: ReadonlySet<number> = new Set(),
): CandidateBoard {
  const aOnly = assessments.filter((a) => a.verdict === 'A')
  const used = aOnly.filter((a) => usedDcIds.has(a.discoveredContentId))
  const available = aOnly.filter((a) => !usedDcIds.has(a.discoveredContentId))

  const sweets = rankCandidatesByPriority(available.filter((a) => a.digestMeta?.category === REQUIRED_CATEGORY)).map(
    toBoardEntry,
  )

  const unclassified = rankCandidatesByPriority(available.filter((a) => !a.digestMeta?.category)).map(toBoardEntry)

  const byCategory: Record<string, BoardEntry[]> = {}
  const others = available.filter((a) => a.digestMeta?.category && a.digestMeta.category !== REQUIRED_CATEGORY)
  for (const a of rankCandidatesByPriority(others)) {
    const cat = a.digestMeta!.category as string
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(toBoardEntry(a))
  }

  return { sweets, byCategory, unclassified, usedExcludedCount: used.length }
}
