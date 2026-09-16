// GINZA WHISKERS / Project 02（2026-09-16、マロン指示：朝候補選定の正式ルール改訂）
//
// 【A/B/C判定そのものとは分離する】A/B/C判定自体（targetOrDiscoveryEligibility.ts・
// assessCandidate.ts）は今回一切変更しない。ここは「A判定済みの候補の中から、朝、
// 最初に見せる最大3件をどう選ぶか」という表示専用の選定ロジックであり、選ばれなかった
// A候補が消える・Bへ降格する、ということは一切ない（buildMorningReport.topA/
// topPresentable と同様、表示選択にすぎない）。
//
// 【正式ルール（2026-09-16続き2改訂・マロン指示）】
//   1. 18カテゴリー全体から、最も価値のある最大3件を選ぶ
//      （ビューティー・ファッション／グルメ・スウィーツ／文化・アートの固定枠は廃止）
//   2. ただし3件中最低1件は、BEAUTY／SHOPPING（美容・ファッション商品）／FOOD／CAFE／
//      SWEETS のいずれかを含める（REQUIRED_CATEGORY_SET）
//   3. 残りは18カテゴリーから自由に選ぶ（文化・アートを必須にはしない）
//
// 【選定前の必須除外（A判定候補の中からさらに絞る、選定専用の安全フィルター）】
//   ・開催日・販売期間・現在の提供状況が不明（＝現在性の根拠が構造化データでも
//     タイトル中の具体的な年月日でもない——「開催中」「販売中」「受付中」等の
//     明記語のみで現在性を認めたケースを含む。理由テキストに「構造化データ」または
//     「具体的な開催日」の根拠が無い候補は除外する。DC#294クラス）
//   ・未分類（category null）
//   ・過去14日以内に同一施設／親施設でArticle作成・承認・note下書き生成・朝刊選定の
//     いずれかがあれば除外（facilityCooldownSkip・理由つきで残し、削除しない）
//   ・同一施設／同一親施設は3件を通じて1件まで
//   ・既処理・既投稿・近似重複・終了済みは、A判定の時点で除外済み（ここでは判定し直さない）

import type { CandidateAssessment } from './types'
import { checkFacilityCooldown, type FacilityActivityRecord } from './facilityActivityHistory'

/** 3件中最低1件を保証するカテゴリー集合（ビューティー・ファッション・グルメ・スウィーツ相当） */
export const REQUIRED_CATEGORY_SET = new Set(['BEAUTY', 'SHOPPING', 'FOOD', 'CAFE', 'SWEETS'])

export interface MorningCandidatePick {
  rank: number
  candidate: CandidateAssessment
  /** REQUIRED_CATEGORY_SET を満たす候補か */
  satisfiesRequiredCategory: boolean
}

export interface UnsafeSkip {
  discoveredContentId: number
  reason: string
}

export interface ThreeSlotFacilityCooldownSkip {
  discoveredContentId: number
  groupKey: string
  reason: string
}

export interface ThreeSlotsResult {
  /** 選出された候補（最大3件・価値順）。安全な候補が3件未満なら無理に埋めない */
  picks: MorningCandidatePick[]
  /** 3件中にBEAUTY/SHOPPING/FOOD/CAFE/SWEETSが最低1件含まれているか */
  requiredCategorySatisfied: boolean
  /** 現在性の根拠が構造化データ・具体的な開催日のいずれでもない（明記語のみ等）ため
   *  選定対象から除外したA判定候補（削除はしない・理由つき） */
  unsafeSkips: UnsafeSkip[]
  /** 施設14日間クールダウンにより除外されたA判定候補（削除はしない） */
  facilityCooldownSkips: ThreeSlotFacilityCooldownSkip[]
}

/** 開催・販売期間が構造化データで確認済みか（eventPeriod は assessCandidate が算出済みの値をそのまま見る） */
function hasConfirmedPeriod(a: CandidateAssessment): boolean {
  return a.eventPeriod !== '不明'
}

/**
 * 現在性の根拠が「構造化データ」または「タイトル中の具体的な開催日」か
 * （明記語のみ〈開催中／販売中／受付中等〉での現在性確認は対象外）。
 * targetOrDiscoveryEligibility.evaluateCurrencyConfirmation の reason 文言を見て判定する
 * （A/B/C判定ロジック自体は呼び出さない・変更しない）。
 */
function isDateBackedCurrency(a: CandidateAssessment): boolean {
  return a.reasons.some((r) => r.includes('構造化データ') || r.includes('具体的な開催日'))
}

function satisfiesRequiredCategory(a: CandidateAssessment): boolean {
  const cat = a.digestMeta?.category
  return !!cat && REQUIRED_CATEGORY_SET.has(cat)
}

export function selectMorningThreeSlots(
  assessments: CandidateAssessment[],
  opts: { facilityHistory?: FacilityActivityRecord[]; now?: Date; cooldownDays?: number } = {},
): ThreeSlotsResult {
  const now = opts.now ?? new Date()
  const facilityHistory = opts.facilityHistory ?? []
  const cooldownDays = opts.cooldownDays ?? 14

  const unsafeSkips: UnsafeSkip[] = []
  const facilityCooldownSkips: ThreeSlotFacilityCooldownSkip[] = []

  // --- 選定前の必須除外（1. 未分類 2. 現在性の根拠が構造化データ/具体的な開催日でない） ---
  const safe = assessments.filter((a) => {
    if (a.verdict !== 'A') return false
    if (!a.digestMeta?.category) return false // 未分類は選定対象外（推測で分類しない）
    if (!isDateBackedCurrency(a)) {
      unsafeSkips.push({
        discoveredContentId: a.discoveredContentId,
        reason: '現在性の根拠が構造化データ・具体的な開催日のいずれでもない（明記語のみ等）ため選定対象から除外',
      })
      return false
    }
    return true
  })

  // 優先順位（価値の代理指標）：確認済み期間があるものを先に、次点で開催が近い順
  // （既存 eventPeriod 文字列の先頭日付）、最後に id 昇順（決定的タイブレーク）。
  const sorted = [...safe].sort((x, y) => {
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

  const usedGroupKeys = new Set<string>()
  const usedDcIds = new Set<number>()

  /** pool の先頭から、施設クールダウン・同一（親）施設・使用済みDCを除いた最初の1件を選ぶ */
  function pickFrom(pool: CandidateAssessment[]): CandidateAssessment | null {
    for (const a of pool) {
      if (usedDcIds.has(a.discoveredContentId)) continue
      const fk = a.digestMeta?.facilityKey ?? null
      const pfk = a.digestMeta?.parentFacilityKey ?? null
      const groupKey = pfk ?? fk

      if (groupKey && usedGroupKeys.has(groupKey)) continue // 同一施設／親施設は3件を通じて1件まで

      if (fk || pfk) {
        const cooldown = checkFacilityCooldown(fk, pfk, facilityHistory, now, cooldownDays)
        if (cooldown.onCooldown) {
          facilityCooldownSkips.push({
            discoveredContentId: a.discoveredContentId,
            groupKey: groupKey ?? '(不明)',
            reason: cooldown.reason,
          })
          continue
        }
      }
      if (groupKey) usedGroupKeys.add(groupKey)
      usedDcIds.add(a.discoveredContentId)
      return a
    }
    return null
  }

  // ルール2：3件中最低1件は REQUIRED_CATEGORY_SET を確保する。安全プール中で
  // 最も価値の高い（＝sorted の先頭に近い）該当候補を先に1件確保してから、
  // 残り最大2件を18カテゴリー全体（自由）から選ぶ。
  //   ・sorted の自然な上位3件が既に条件を満たす場合は結果は変わらない
  //     （先頭がたまたま該当カテゴリーならそれがそのまま requiredPick になるため）。
  //   ・満たさない場合のみ、この2段階選定によって最低1件を確保する。
  const requiredPool = sorted.filter(satisfiesRequiredCategory)
  const requiredPick = pickFrom(requiredPool)

  const remainingPool = sorted // pickFrom は usedDcIds/usedGroupKeys で自動的に重複を除外する
  const picks: CandidateAssessment[] = []
  if (requiredPick) picks.push(requiredPick)
  while (picks.length < 3) {
    const next = pickFrom(remainingPool)
    if (!next) break // 安全な候補が尽きた → 無理に埋めない
    picks.push(next)
  }

  const result: MorningCandidatePick[] = picks.map((c, i) => ({
    rank: i + 1,
    candidate: c,
    satisfiesRequiredCategory: satisfiesRequiredCategory(c),
  }))

  return {
    picks: result,
    requiredCategorySatisfied: result.some((p) => p.satisfiesRequiredCategory),
    unsafeSkips,
    facilityCooldownSkips,
  }
}
