// GINZA WHISKERS / Project 02（2026-09-22）— Morning Board表示前の施設多様性フィルタ（純粋関数）。
//
// 【背景】candidateBoard.ts（Stage 3）は「同一施設が直近14日以内に使用済み」を
// BoardEntry.facilityNotice として付与するが、これは表示専用（advisory）であり
// A/B/C判定・ボードそのものへの掲載可否には一切影響しない設計（2026-09-17決定）。
// この設計自体は変更しない——A判定の意味を「公式情報の裏どり完了」から
// 「施設の使用頻度」で汚染しないため。本モジュールは、その上に立つ
// 「最終的にマロンへ提示する一覧を組む段階」でのみ多様性を適用する
// 追加レイヤー（buildCandidateBoard自体は無変更）。
//
// 【ルール】
//   1. 施設グループ（facilityNotice.parentFacilityLabel が無ければ facilityLabel
//      単体をグループキーとする＝GINZA SIXと銀座蔦屋書店はfacilityKey.tsの
//      既存の親施設グルーピングによりPARENT_GINZA_SIXとして自動的に1グループへ
//      束ねられる。個別に「GINZA SIX」「銀座蔦屋書店」「山野楽器」を名指しで
//      特別扱いする分岐はここでは作らない——過去のfacilityDiversity.tsと同じ方針
//      〈特定施設名で分岐しない〉を踏襲する。同一グループの連続採用回避は
//      「グループ単位で上限を掛ける」という一般ルールの帰結として自然に実現する）。
//   2. 1施設グループにつき既定 maxPerFacilityGroup=1件までしか選ばない。
//   3. facilityNotice.recentlyUsed（直近使用済み）の候補は、同点内で後方へ
//      弱く押し下げる（除外はしない——他に代替が無ければ最終的に選ばれうる。
//      2026-09-22の実運用で「直近使用済み以外の候補が1件しかない」実例を確認
//      済みのため、完全除外にすると候補が過度に不足する）。
//   4. 除外された候補も返す（マロンへの透明性のため。無言で消さない）。

import type { BoardEntry } from './candidateBoard'
import { facilityKeyFromVenue } from '../curation/facilityKey'

export interface FacilityDiversityExclusion {
  entry: BoardEntry
  reason: string
}

export interface FacilityDiversityFilterResult {
  selected: BoardEntry[]
  excluded: FacilityDiversityExclusion[]
}

/**
 * グループキーは facilityNotice.parentFacilityLabel（advisory・直近使用時のみ存在）
 * ではなく、facilityKey.ts の既存の親施設解決（facilityKeyFromVenue）を
 * entry.facilityLabel に対して直接適用して求める——facilityNotice は
 * 「直近使用済み」のときだけ付与される設計のため、未使用の候補同士では
 * GINZA SIX と銀座蔦屋書店が同一グループと判定できない欠落があった
 * （2026-09-22発見・是正）。facilityKeyFromVenue は決定的・推測なしの
 * 既存の正本ロジックをそのまま再利用する（二重実装しない）。
 */
function facilityGroupKey(entry: BoardEntry): string {
  if (!entry.facilityLabel) return `dc-${entry.discoveredContentId}`
  const resolved = facilityKeyFromVenue(entry.facilityLabel)
  return resolved.parentFacilityKey ?? resolved.key ?? entry.facilityLabel
}

/**
 * 施設グループ単位で上限を掛けた候補リストを返す（純粋関数）。
 * 呼び出し元の並び順（rankCandidatesByPriority適用済み想定）を尊重し、
 * 直近使用済みの候補だけを同点内で後方へ動かす安定ソートを行う。
 */
export function applyFacilityDiversityFilter(
  entries: readonly BoardEntry[],
  opts: { maxPerFacilityGroup?: number } = {},
): FacilityDiversityFilterResult {
  const maxPerGroup = opts.maxPerFacilityGroup ?? 1
  // Array.prototype.sort は安定ソート（ECMA2019+）——同点（recentlyUsed値が同じ）
  // 同士の相対順序は元の優先順位（呼び出し元のランキング）のまま保持される。
  const ordered = [...entries].sort((a, b) => {
    const aRecent = a.facilityNotice?.recentlyUsed ? 1 : 0
    const bRecent = b.facilityNotice?.recentlyUsed ? 1 : 0
    return aRecent - bRecent
  })

  const groupCounts = new Map<string, number>()
  const selected: BoardEntry[] = []
  const excluded: FacilityDiversityExclusion[] = []

  for (const entry of ordered) {
    const groupKey = facilityGroupKey(entry)
    const count = groupCounts.get(groupKey) ?? 0
    if (count >= maxPerGroup) {
      excluded.push({
        entry,
        reason: `施設グループ「${groupKey}」で既に${maxPerGroup}件選出済みのため除外（同一施設・系列への偏り回避）`,
      })
      continue
    }
    groupCounts.set(groupKey, count + 1)
    selected.push(entry)
  }

  return { selected, excluded }
}
