// GINZA WHISKERS / Project 02（2026-09-16、マロン指示：朝の候補表示を3枠化・安全補正）
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
// 【条件（2026-09-16続き改訂）】
//   ・同一施設（digestMeta.facilityKey）は3枠を通じて1件まで
//   ・同一親施設（digestMeta.parentFacilityKey。GINZA SIX・山野楽器等の表記揺れ統合）も1件まで
//   ・過去14日以内に同一施設／親施設でArticle作成・承認・note下書き生成・朝刊選定の
//     いずれかがあれば原則除外（facilityCooldownSkip・理由つきで残し、削除しない）
//   ・未分類（digestMeta.category が null）の候補は3枠に入れない（推測で分類しない）
//   ・開催中または今後開催される「確認済み」情報（eventPeriod が構造化されているもの）を優先
//   ・既投稿・近似重複はA判定の時点で除外済み（本モジュールでは判定し直さない）
//   ・【続き追加】基本枠（BEAUTY_FASHION/GOURMET_SWEETS/CULTURE_ART）の自カテゴリーに
//     安全な候補が無ければ、18カテゴリーの他カテゴリーから次点を繰り上げる（fallback）。
//     fallback候補も現在性確認済み・既処理でない・施設クールダウン対象外・近似重複なし・
//     同一親施設でない、を満たす必要がある（＝A判定候補である以上すべて既に満たしている）。
//     どの候補（自カテゴリー・他カテゴリーとも）も使えなければ、無理に埋めず「該当なし」。

import type { CandidateAssessment } from './types'
import { checkFacilityCooldown, type FacilityActivityRecord } from './facilityActivityHistory'

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
  /** 自カテゴリーではなく他カテゴリーから繰り上げた代替候補か */
  isFallback: boolean
}

export interface ThreeSlotFacilityCooldownSkip {
  discoveredContentId: number
  bucketKey: string
  groupKey: string
  reason: string
}

export interface ThreeSlotsResult {
  slots: ThreeSlotPick[]
  /** 施設14日間クールダウンにより繰り上げ対象となった（＝表示から外れた）A候補（削除はしない） */
  facilityCooldownSkips: ThreeSlotFacilityCooldownSkip[]
}

/** 開催・販売期間が構造化データで確認済みか（eventPeriod は assessCandidate が算出済みの値をそのまま見る） */
function hasConfirmedPeriod(a: CandidateAssessment): boolean {
  return a.eventPeriod !== '不明'
}

export function selectMorningThreeSlots(
  assessments: CandidateAssessment[],
  opts: { facilityHistory?: FacilityActivityRecord[]; now?: Date; cooldownDays?: number } = {},
): ThreeSlotsResult {
  const now = opts.now ?? new Date()
  const facilityHistory = opts.facilityHistory ?? []
  const cooldownDays = opts.cooldownDays ?? 14

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

  const usedGroupKeys = new Set<string>()
  const usedDcIds = new Set<number>()
  const facilityCooldownSkips: ThreeSlotFacilityCooldownSkip[] = []

  /** pool から、施設クールダウン・同一（親）施設・使用済みDCを除いた最初の1件を選ぶ */
  function pickFrom(pool: CandidateAssessment[], bucketKey: string): { candidate: CandidateAssessment | null; sawAnyOffCooldown: boolean } {
    let sawAnyOffCooldown = false
    for (const a of pool) {
      if (usedDcIds.has(a.discoveredContentId)) continue // 他枠で既に選出済み（自カテゴリー・fallback問わず）
      const fk = a.digestMeta?.facilityKey ?? null
      const pfk = a.digestMeta?.parentFacilityKey ?? null
      const groupKey = pfk ?? fk

      if (groupKey && usedGroupKeys.has(groupKey)) continue // 同一施設／親施設は3枠を通じて1件まで

      if (fk || pfk) {
        const cooldown = checkFacilityCooldown(fk, pfk, facilityHistory, now, cooldownDays)
        if (cooldown.onCooldown) {
          facilityCooldownSkips.push({
            discoveredContentId: a.discoveredContentId,
            bucketKey,
            groupKey: groupKey ?? '(不明)',
            reason: cooldown.reason,
          })
          continue
        }
      }
      sawAnyOffCooldown = true
      if (groupKey) usedGroupKeys.add(groupKey)
      usedDcIds.add(a.discoveredContentId)
      return { candidate: a, sawAnyOffCooldown }
    }
    return { candidate: null, sawAnyOffCooldown }
  }

  // 2パス方式：他カテゴリーからの繰り上げ（fallback）が、後続バケット本来の自カテゴリー
  // 候補を先取りしてしまわないよう、まず全バケットの自カテゴリー選定を終えてから
  // （pass 1）、それでも埋まらなかったバケットだけ他カテゴリーから繰り上げる（pass 2）。
  const pending: {
    bucket: ThreeSlotBucket
    inBucket: CandidateAssessment[]
    primary: ReturnType<typeof pickFrom>
  }[] = []

  for (const bucket of MORNING_THREE_SLOT_BUCKETS) {
    const inBucket = sorted.filter((a) => bucket.categories.includes(a.digestMeta!.category as string))
    const primary = pickFrom(inBucket, bucket.key)
    pending.push({ bucket, inBucket, primary })
  }

  const slots: ThreeSlotPick[] = []
  for (const { bucket, inBucket, primary } of pending) {
    if (primary.candidate) {
      slots.push({ bucketKey: bucket.key, bucketLabel: bucket.label, candidate: primary.candidate, emptyReason: null, isFallback: false })
      continue
    }

    // 自カテゴリーに安全な候補が無い → 18カテゴリーの他カテゴリーから次点を繰り上げる
    // （pass 2。他バケットの自カテゴリー選定〈pass 1〉が全て終わった後の残りから選ぶ）。
    // fallback候補もA判定候補（現在性確認済み・既処理でない・近似重複なし）であること自体は
    // 既に保証されている——ここでは施設クールダウン・同一（親）施設・使用済みDCのみ追加判定。
    const otherPool = sorted.filter((a) => !bucket.categories.includes(a.digestMeta!.category as string))
    const fallback = pickFrom(otherPool, bucket.key)

    if (fallback.candidate) {
      slots.push({ bucketKey: bucket.key, bucketLabel: bucket.label, candidate: fallback.candidate, emptyReason: null, isFallback: true })
      continue
    }

    let emptyReason: string
    if (inBucket.length === 0 && otherPool.length === 0) emptyReason = '該当するA判定候補が無い（他カテゴリーにも無い）'
    else if (!primary.sawAnyOffCooldown && !fallback.sawAnyOffCooldown)
      emptyReason = '該当候補はあるが自カテゴリー・他カテゴリーとも全て施設クールダウン中または使用済み'
    else emptyReason = '該当候補はあるが同一施設・同一親施設が既に他枠で選出済み（他カテゴリーにも代替なし）'
    slots.push({ bucketKey: bucket.key, bucketLabel: bucket.label, candidate: null, emptyReason, isFallback: false })
  }
  return { slots, facilityCooldownSkips }
}
