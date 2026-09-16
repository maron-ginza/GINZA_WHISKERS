// GINZA WHISKERS / Project 02（2026-09-16、マロン指示：朝の候補表示を3枠化）
//
// 朝の候補表示を「ビューティー・ファッション」「グルメ・スウィーツ」「文化・アート」の
// 3枠に絞り、原則として各枠から1件を提示する（純粋関数・DB非依存・AIなし）。
//
// 【A判定そのものとは分離する】A判定自体は引き続き18カテゴリー全体を対象とする
// （targetOrDiscoveryEligibility.ts は無変更）。この3枠化はA判定候補の中から
// 「朝、最初に見せる3件」を選ぶ表示専用のロジックであり、3枠に入らないA候補が
// 消える・Bへ降格する、ということは一切ない（buildMorningReport.topA/topPresentable
// と同様、表示選択にすぎない）。
//
// 【条件】
//   ・同一施設（digestMeta.facilityKey）は3枠を通じて1件まで
//   ・未分類（digestMeta.category が null）の候補は3枠に入れない（推測で分類しない）
//   ・開催中または今後開催される「確認済み」情報（eventPeriod が構造化されているもの）を優先
//   ・既投稿・近似重複はA判定の時点で除外済み（本モジュールでは判定し直さない）

import type { CandidateAssessment } from './types'

export interface ThreeSlotBucket {
  key: string
  label: string
  /** このバケットに属する18カテゴリーのキー */
  categories: string[]
}

// 文化・アートは既存の CORE_DAILY_BUCKETS（dailySelectionSupport.ts）の「文化・アート」と
// 同じカテゴリー集合を踏襲する（ART/PHOTO/MUSIC/ARCHITECTURE/WORKSHOP）。
// ビューティー・ファッションはBEAUTYに加え、アパレル系の明記語を持つSHOPPINGを含める。
// グルメ・スウィーツはFOOD/CAFE/SWEETSを束ねる。
export const MORNING_THREE_SLOT_BUCKETS: ThreeSlotBucket[] = [
  { key: 'BEAUTY_FASHION', label: 'ビューティー・ファッション', categories: ['BEAUTY', 'SHOPPING'] },
  { key: 'GOURMET_SWEETS', label: 'グルメ・スウィーツ', categories: ['FOOD', 'CAFE', 'SWEETS'] },
  { key: 'CULTURE_ART', label: '文化・アート', categories: ['ART', 'PHOTO', 'MUSIC', 'ARCHITECTURE', 'WORKSHOP'] },
]

export interface ThreeSlotPick {
  bucketKey: string
  bucketLabel: string
  candidate: CandidateAssessment | null
  /** candidate が null のときの理由（該当A候補なし、等） */
  emptyReason: string | null
}

export interface ThreeSlotsResult {
  slots: ThreeSlotPick[]
}

/** 開催・販売期間が構造化データで確認済みか（eventPeriod は assessCandidate が算出済みの値をそのまま見る） */
function hasConfirmedPeriod(a: CandidateAssessment): boolean {
  return a.eventPeriod !== '不明'
}

export function selectMorningThreeSlots(assessments: CandidateAssessment[]): ThreeSlotsResult {
  const aOnly = assessments.filter((a) => a.verdict === 'A' && !!a.digestMeta?.category)

  // 優先順位：確認済み期間があるものを先に、次点で開催が近い順（既存 eventPeriod 文字列の
  // 先頭日付）、最後に id 昇順（決定的タイブレーク）。
  const sorted = [...aOnly].sort((x, y) => {
    const px = hasConfirmedPeriod(x) ? 0 : 1
    const py = hasConfirmedPeriod(y) ? 0 : 1
    if (px !== py) return px - py
    const dx = x.eventPeriod.match(/(\d{4})-(\d{2})-(\d{2})/)
    const dy = y.eventPeriod.match(/(\d{4})-(\d{2})-(\d{2})/)
    const tx = dx ? Date.UTC(Number(dx[1]), Number(dx[2]) - 1, Number(dx[3])) : Number.MAX_SAFE_INTEGER
    const ty = dy ? Date.UTC(Number(dy[1]), Number(dy[2]) - 1, Number(dy[3])) : Number.MAX_SAFE_INTEGER
    if (tx !== ty) return tx - ty
    return x.discoveredContentId - y.discoveredContentId
  })

  const usedFacility = new Set<string>()
  const slots: ThreeSlotPick[] = []
  for (const bucket of MORNING_THREE_SLOT_BUCKETS) {
    const inBucket = sorted.filter((a) => bucket.categories.includes(a.digestMeta!.category as string))
    const candidate =
      inBucket.find((a) => {
        const fk = a.digestMeta?.facilityKey ?? null
        return !(fk && usedFacility.has(fk))
      }) ?? null

    let emptyReason: string | null = null
    if (!candidate) {
      emptyReason = inBucket.length === 0 ? 'このバケットに該当するA判定候補が無い' : '該当候補はあるが同一施設が既に他枠で選出済み'
    } else {
      const fk = candidate.digestMeta?.facilityKey ?? null
      if (fk) usedFacility.add(fk)
    }
    slots.push({ bucketKey: bucket.key, bucketLabel: bucket.label, candidate, emptyReason })
  }
  return { slots }
}
