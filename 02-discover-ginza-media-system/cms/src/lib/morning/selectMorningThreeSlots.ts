// GINZA WHISKERS / Project 02（2026-09-16続き4、マロン指示：A/B/C判定と最終選定の分離）
//
// 【A/B/C判定そのものとは分離する】A/B/C判定自体（targetOrDiscoveryEligibility.ts・
// assessCandidate.ts）はこのファイルでは変更しない。ここは「A判定済みの候補の中から、
// 朝、最初に見せる最大3件をどう選ぶか」という表示専用の選定ロジックである。
// 最終選定処理はA/B/Cの値を一切更新しない（このファイルはCandidateAssessment.verdict
// を書き換えない・読むだけ）。
//
// 現在性・既処理・近似重複・施設/親施設14日間クールダウンは、assessCandidate.ts/
// targetOrDiscoveryEligibility.ts のA/B/C判定本体で既に判定済み——通過した候補だけが
// verdict='A'になる。そのため「朝の選定処理には原則としてAだけを渡す」が自動的に
// 成り立ち、このファイルはA判定済みの候補だけを対象に以下の2点だけを行えばよい
// （二重実装をしない）：
//   ・同一施設／同一親施設は3件を通じて1件まで（当日内の施設分散。14日間クール
//     ダウンとは別の、同じ朝の3件同士での重複防止）
//   ・18カテゴリー全体から価値順に最大3件、うちSWEETSを必ず1件確保する
//
// 【正式ルール（2026-09-16続き4改訂）】
//   1. A判定候補だけを入力とする
//   2. 18カテゴリー全体から、最も価値のある最大3件を選ぶ
//      （ビューティー・ファッション／グルメ・スウィーツ／文化・アートの固定枠は廃止）
//   3. ただし3件のうちSWEETSを必ず1件選ぶ（旧・BEAUTY/SHOPPING/FOOD/CAFE/SWEETS
//      いずれか1件、から変更——マロン指示によりSWEETS単独を必須カテゴリーとする）
//   4. 残り2件はSHOPPING固定枠にせず、18カテゴリー全体から自由に選ぶ
//      （SHOPPINGを恒久的な第2枠としてハードコードしない）
//   5. 安全な候補（＝A判定済み）が3件未満なら無理に埋めない
//   6. 未分類（category null）の候補は選定対象外——ただしこれはA/B/C判定を変更する
//      ものではなく、表示上「どのカテゴリーの3件か」を示せない候補を選ばないだけの
//      選定層の方針。未分類の件数・DC番号はレポート側で別途報告する
//      （buildMorningReport.ts の unclassifiedA）。

import type { CandidateAssessment } from './types'

/** 3件中1件を必ず確保するカテゴリー（マロン指示：2026-09-16続き4でSWEETS単独へ変更） */
export const REQUIRED_CATEGORY = 'SWEETS'

export interface MorningCandidatePick {
  rank: number
  candidate: CandidateAssessment
  /** REQUIRED_CATEGORY（SWEETS）を満たす候補か */
  satisfiesRequiredCategory: boolean
}

export interface ThreeSlotsResult {
  /** 選出された候補（最大3件・価値順）。安全な候補が3件未満なら無理に埋めない */
  picks: MorningCandidatePick[]
  /** 3件中にSWEETSが含まれているか */
  requiredCategorySatisfied: boolean
}

/** 開催・販売期間が構造化データで確認済みか（eventPeriod は assessCandidate が算出済みの値をそのまま見る） */
function hasConfirmedPeriod(a: CandidateAssessment): boolean {
  return a.eventPeriod !== '不明'
}

function satisfiesRequiredCategory(a: CandidateAssessment): boolean {
  return a.digestMeta?.category === REQUIRED_CATEGORY
}

export function selectMorningThreeSlots(assessments: CandidateAssessment[]): ThreeSlotsResult {
  // A判定のみが対象（B/Cはここへ渡さない。verdict='A' は既に現在性・既処理・近似重複・
  // 施設/親施設クールダウンをすべて通過済み——このファイルでは判定し直さない）。
  // 未分類（category null）も対象外（推測で分類しない。未分類件数はレポート側で別報告）。
  const safe = assessments.filter((a) => a.verdict === 'A' && !!a.digestMeta?.category)

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

  /** pool の先頭から、同一（親）施設・使用済みDCを除いた最初の1件を選ぶ（当日内の施設分散） */
  function pickFrom(pool: CandidateAssessment[]): CandidateAssessment | null {
    for (const a of pool) {
      if (usedDcIds.has(a.discoveredContentId)) continue
      const fk = a.digestMeta?.facilityKey ?? null
      const pfk = a.digestMeta?.parentFacilityKey ?? null
      const groupKey = pfk ?? fk

      if (groupKey && usedGroupKeys.has(groupKey)) continue // 同一施設／親施設は3件を通じて1件まで

      if (groupKey) usedGroupKeys.add(groupKey)
      usedDcIds.add(a.discoveredContentId)
      return a
    }
    return null
  }

  // ルール3：3件のうちSWEETSを必ず1件確保する。安全プール中で最も価値の高い
  // （＝sorted の先頭に近い）SWEETS候補を先に1件確保してから、残り最大2件を
  // 18カテゴリー全体（自由）から選ぶ。
  //   ・sorted の自然な上位3件に既にSWEETSが含まれる場合は結果は変わらない。
  //   ・含まれない場合のみ、この2段階選定によってSWEETSを1件確保する。
  const requiredPool = sorted.filter(satisfiesRequiredCategory)
  const requiredPick = pickFrom(requiredPool)

  const picks: CandidateAssessment[] = []
  if (requiredPick) picks.push(requiredPick)
  while (picks.length < 3) {
    const next = pickFrom(sorted) // pickFrom は usedDcIds/usedGroupKeys で自動的に重複を除外する
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
  }
}
