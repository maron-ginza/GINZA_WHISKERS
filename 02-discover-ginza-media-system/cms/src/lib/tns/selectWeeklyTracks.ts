import type { MusicCandidate } from './musicCandidates'
import { formatScoreBreakdownAsInternalReason, scoreTrackForDay } from './musicScoring'
import type { SeasonType, TnsEditorialCode, Weekday } from './types'

// 週間7曲選定の割当アルゴリズム（2026-08-27、マロン指示4）。
//
// 【設計】選曲は「AIが候補から自由に選ぶ」のではなく、本モジュールが
// スコアリング結果に基づき決定的に確定する——AIの役割は、確定済みの曲に
// 対する詩的な編集コメント（readerFacingComment）を書くことに限定する
// （generateTnsWeeklyEditionDraft.ts参照）。これにより「実在しない曲を
// 生成しない」の担保が、候補プールの制限（musicCandidates.ts）だけでなく
// 選定プロセス自体にも及ぶ。
//
// 【邦楽/洋楽比率】マロン指示「原則として邦楽4曲＋洋楽3曲、または邦楽5曲＋
// 洋楽2曲のどちらかを採用し、テーマ適合度を優先する」への対応。7枠に対し
// 60/40（4.2:2.8）は割り切れないため、TNSSettings.historicalReferenceJapanese
// Ratio（既存フィールド、2026-08-27にマロン指示で0.6へ更新済み）から
// 2つの整数パターンを算出し、この優先順で試す。両方とも実現できる場合は
// スコア合計が高い方を採用する。候補不足でどちらも実現できない場合は、
// 比率を無視した貪欲割当（テーマ適合度のみ優先）にフォールバックし、
// それでも埋まらない曜日はpendingとする（マロン指示5「候補不足の場合は
// pendingHumanSelection=trueで人間確認へ回す」、AIに新しい曲を創作させない）。
//
// 比率をハードコードせず既存TNSSettingsの値から動的に算出することで、
// 将来マロンが比率を変更した場合も本モジュールを変更せずに追随できる
// （TNS_SPEC.md §3.2 Adaptive Music Balanceの「参考値、管理画面から随時
// 上書き可能」という設計方針をそのまま踏襲）。
function computeRatioTargets(
  japaneseRatio: number,
  totalSlots: number,
): { japanese: number; international: number }[] {
  const primaryJapanese = Math.round(japaneseRatio * totalSlots)
  const leansJapanese = japaneseRatio >= 0.5
  const secondaryJapaneseRaw = leansJapanese ? primaryJapanese + 1 : primaryJapanese - 1
  const secondaryJapanese = Math.min(totalSlots, Math.max(0, secondaryJapaneseRaw))

  const japaneseCounts = [primaryJapanese, secondaryJapanese].filter(
    (value, index, arr) => arr.indexOf(value) === index && value >= 0 && value <= totalSlots,
  )

  return japaneseCounts.map((japanese) => ({ japanese, international: totalSlots - japanese }))
}

export interface DaySlot {
  weekday: Weekday
  date: string
  code: TnsEditorialCode
  fixedMoodLabel: string
  conditionLabel: string
  // 2026-08-27追加：季節は週単位ではなく日単位で持たせる。週が季節の境目
  // （例：8月末〜9月頭でSUMMER→AUTUMN）をまたぐ場合、日ごとに正しい季節を
  // 判定できるようにするため（マロン指示「summer + autumn」で季節の境目を
  // 表現する、という運用を実際に機能させるための前提）。
  season: SeasonType
}

export interface WeeklyTrackAssignment {
  weekday: Weekday
  trackId: number | null
  internalReason: string
}

interface Triple {
  dayIndex: number
  candidate: MusicCandidate
  score: number
}

function buildTriples(days: DaySlot[], candidates: MusicCandidate[]): Triple[] {
  const triples: Triple[] = []
  days.forEach((day, dayIndex) => {
    candidates.forEach((candidate) => {
      const breakdown = scoreTrackForDay(candidate, {
        conditionLabel: day.conditionLabel,
        season: day.season,
        code: day.code,
        fixedMoodLabel: day.fixedMoodLabel,
        weekday: day.weekday,
      })
      triples.push({ dayIndex, candidate, score: breakdown.total })
    })
  })
  return triples
}

function sumScore(assignment: Map<number, Triple>): number {
  let sum = 0
  for (const t of assignment.values()) sum += t.score
  return sum
}

// スコア降順の貪欲割当。origin別の上限（japaneseTarget/internationalTarget）
// が指定された場合はそれを超えない範囲でのみ割り当てる（undefinedなら無制限＝
// フォールバック用）。
function greedyAssign(
  triples: Triple[],
  dayCount: number,
  originCaps?: { japanese: number; international: number },
): Map<number, Triple> {
  const sorted = [...triples].sort((a, b) => b.score - a.score)
  const assignment = new Map<number, Triple>()
  const usedTrackIds = new Set<number>()
  let japaneseCount = 0
  let internationalCount = 0

  for (const t of sorted) {
    if (assignment.size >= dayCount) break
    if (assignment.has(t.dayIndex)) continue
    if (usedTrackIds.has(t.candidate.id)) continue

    if (originCaps) {
      const isJapanese = t.candidate.origin === 'japanese'
      if (isJapanese && japaneseCount >= originCaps.japanese) continue
      if (!isJapanese && internationalCount >= originCaps.international) continue
    }

    assignment.set(t.dayIndex, t)
    usedTrackIds.add(t.candidate.id)
    if (t.candidate.origin === 'japanese') japaneseCount++
    else internationalCount++
  }

  return assignment
}

export function selectWeeklyTracks(
  days: DaySlot[],
  candidates: MusicCandidate[],
  historicalReferenceJapaneseRatio: number,
): WeeklyTrackAssignment[] {
  const dayCount = days.length
  const triples = buildTriples(days, candidates)
  const ratioTargets = computeRatioTargets(historicalReferenceJapaneseRatio, dayCount)

  // 比率パターンを優先順（primary→secondary）に試し、7日すべて埋まり、かつ
  // origin内訳が目標どおりに達成できたものだけを候補とする。両方成立すれば
  // スコア合計が高い方を採用する（テーマ適合度優先、マロン指示4）。
  let bestAssignment: Map<number, Triple> | null = null
  for (const target of ratioTargets) {
    const assignment = greedyAssign(triples, dayCount, target)
    const japaneseCount = [...assignment.values()].filter((t) => t.candidate.origin === 'japanese').length
    const internationalCount = assignment.size - japaneseCount
    const achievedTarget =
      assignment.size === dayCount && japaneseCount === target.japanese && internationalCount === target.international
    if (achievedTarget && (!bestAssignment || sumScore(assignment) > sumScore(bestAssignment))) {
      bestAssignment = assignment
    }
  }

  // どちらの比率パターンも実現できない場合（候補不足等）は、比率を無視した
  // 貪欲割当にフォールバックする——テーマ適合度のみを優先し、それでも
  // 埋まらない曜日はpendingとして人間確認へ回す（新しい曲は創作しない）。
  const finalAssignment = bestAssignment ?? greedyAssign(triples, dayCount)

  return days.map((day, dayIndex) => {
    const t = finalAssignment.get(dayIndex)
    if (!t) {
      return { weekday: day.weekday, trackId: null, internalReason: '' }
    }
    const breakdown = scoreTrackForDay(t.candidate, {
      conditionLabel: day.conditionLabel,
      season: day.season,
      code: day.code,
      fixedMoodLabel: day.fixedMoodLabel,
      weekday: day.weekday,
    })
    return {
      weekday: day.weekday,
      trackId: t.candidate.id,
      internalReason: formatScoreBreakdownAsInternalReason(breakdown),
    }
  })
}
