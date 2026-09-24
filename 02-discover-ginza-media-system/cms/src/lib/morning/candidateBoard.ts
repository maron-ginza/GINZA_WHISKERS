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
import { applyFacilityDiversityFilter } from './facilityDiversityFilter'

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
  /**
   * 【2026-09-24再改訂・マロン指示】「同一施設を直近14日以内に掲載」を
   * 一律除外条件にしない方針へ戻した。2026-09-23改訂は
   * PARENT_GINZA_SIX（facilityKey.ts）のような複合施設グルーピングの下で、
   * 「GINZA SIXのどれか1件が投稿済み」というだけで、同じ館内の別ブランド・
   * 別企画（銀座 蔦屋書店の別フェア等）までボードから一律に消えてしまう
   * 副作用があった——同一商品・同一企画・既投稿の重複は dedupCheck.ts が
   * 別途担保しており、施設単位の一律除外は同一商品/企画の重複防止としては
   * 過剰だった。以後、facilityNotice.recentlyUsed は**除外条件にはせず**、
   * 表示専用の注意情報のまま維持し、施設への偏りは
   * applyFacilityDiversityFilter（既存、2026-09-22実装）による**選定時の
   * 優先順位の調整（後方へ弱く押し下げるのみ・除外しない）**で扱う。
   * このフィールドは「除外した件数」ではなく、「直近同一施設投稿の注意表示が
   * 付いている（＝除外はされていない）A候補の件数」を表す（マロンへの
   * 透明性のため件数自体は維持）。
   */
  facilityRecentlyUsedNoticeCount: number
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
  // 【2026-09-24再改訂】施設クールダウン（facilityNotice.recentlyUsed）では
  // もう対象を絞らない——available は「使用済みでない」だけで絞った母集団。
  const available = aOnly.filter((a) => !usedDcIds.has(a.discoveredContentId))
  const facilityRecentlyUsedNoticeCount = available.filter((a) => a.facilityNotice?.recentlyUsed === true).length

  // 施設への偏り調整は除外ではなく「選定時の優先順位」で行う（マロン指示）。
  // applyFacilityDiversityFilter は元々「1施設グループにつきmaxPerFacilityGroup件まで」
  // という上限も持つが、ここでは maxPerFacilityGroup を実質無制限にして呼び出す——
  // 同一施設・同一系列（PARENT_GINZA_SIXグルーピング等）の候補を消さず、
  // 直近使用済みの候補だけを同点内で後方へ弱く押し下げる整列効果のみを使う
  // （新規ロジックの二重実装を避け、2026-09-22実装済みの既存関数をそのまま再利用）。
  const softenFacilityOrder = (entries: BoardEntry[]): BoardEntry[] =>
    applyFacilityDiversityFilter(entries, { maxPerFacilityGroup: Number.POSITIVE_INFINITY }).selected

  const sweets = softenFacilityOrder(
    rankCandidatesByPriority(available.filter((a) => a.digestMeta?.category === REQUIRED_CATEGORY)).map(toBoardEntry),
  )

  const unclassified = softenFacilityOrder(
    rankCandidatesByPriority(available.filter((a) => !a.digestMeta?.category)).map(toBoardEntry),
  )

  const byCategory: Record<string, BoardEntry[]> = {}
  const others = available.filter((a) => a.digestMeta?.category && a.digestMeta.category !== REQUIRED_CATEGORY)
  for (const a of rankCandidatesByPriority(others)) {
    const cat = a.digestMeta!.category as string
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(toBoardEntry(a))
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat] = softenFacilityOrder(byCategory[cat])
  }

  return {
    sweets,
    byCategory,
    unclassified,
    usedExcludedCount: used.length,
    facilityRecentlyUsedNoticeCount,
  }
}
