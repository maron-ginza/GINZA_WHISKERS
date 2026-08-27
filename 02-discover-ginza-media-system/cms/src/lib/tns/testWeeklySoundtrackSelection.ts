import type { Payload } from 'payload'

import { fetchWeeklyWeather } from './fetchWeeklyWeather'
import { fetchEligibleMusicCandidates, type MusicCandidate } from './musicCandidates'
import { generateTnsWeeklyEditionDraft, type DailyPlanInput } from './generateTnsWeeklyEditionDraft'
import { formatScoreBreakdownAsInternalReason, scoreTrackForDay, SCORE_WEIGHTS } from './musicScoring'
import { selectWeeklyTracks, type DaySlot } from './selectWeeklyTracks'
import { computeNextTnsWeek, deriveSeasonType, formatDateISO } from './weekDates'
import type { TnsEditorialCode, Weekday } from './types'

// 🌈Tokyo Nostalgic Soundtrack 本番相当「7曲自動選曲テスト」（2026-08-27）。
//
// 【位置づけ】createWeeklySoundtrackEdition.tsと同じ既存機能（天気取得・
// 曜日ごとのdynamic mood・TNS Editorial Code・MusicTracks/MusicUsageLedger・
// 邦楽/洋楽比率・重複防止・7曲選定ロジック）をすべて再利用しつつ、
// **payload.createを一切呼ばない**——note記事・SoundtrackEditions・
// MusicUsageLedgerへの本番書き込みは行わず、選曲結果の確認のみを行う
// テスト専用エントリーポイント。既存のcreateWeeklySoundtrackEdition.tsの
// 挙動・契約は一切変更していない（独立した並行モジュールとして追加）。
//
// 選曲7曲の確定自体（selectWeeklyTracks.ts）はAI呼び出しなしで完結する。
// 曜日ごとのdynamic mood（TNS Editorial Codeにfixed labelがないCode2/3/4/6等）
// を実際にAI生成する場合のみ、generateTnsWeeklyEditionDraft経由でClaude
// APIを1回呼び出す（呼び出し前にユーザー承認済み）。

interface TNSSettingsDoc {
  weekdayCodeMapping: { weekday: Weekday; code: TnsEditorialCode }[]
  codeFixedMoodLabels: { code: TnsEditorialCode; fixedMoodLabel: string }[]
  historicalReferenceJapaneseRatio: number
}

export interface ScoreBreakdownPoints {
  mood: number
  weather: number
  season: number
  ginzaCode: number
}

export interface RunnerUpCandidate {
  title: string
  artist: string
  score: number
}

export interface WeeklySelectionTestDayResult {
  date: string
  weekday: Weekday
  conditionLabel: string
  tempHighC: number | null
  tempLowC: number | null
  code: TnsEditorialCode
  fixedMoodLabel: string
  dynamicEmotion: string
  selectedTrack: { title: string; artist: string; releaseYear: number; origin: 'japanese' | 'international' } | null
  totalScore: number
  scoreBreakdown: ScoreBreakdownPoints
  runnerUps: RunnerUpCandidate[]
  selectionReason: string
  prioritizationReason: string
  pendingHumanSelection: boolean
}

export interface WeeklySelectionTestResult {
  weekStart: string
  weekEnd: string
  season: string
  weatherSource: string
  days: WeeklySelectionTestDayResult[]
  japaneseCount: number
  internationalCount: number
  usedTrackContamination: number
  duplicateWithinWeek: number
  pendingCount: number
  zeroScoreCount: number
  averageScore: number
  anthropicUsage: { inputTokens: number; outputTokens: number } | null
}

// 「他候補より優先した理由」の説明材料。実際の割当（selectWeeklyTracks.ts）は
// 週全体の比率最適化を行うため単純な日次貪欲選択ではないが、報告用に
// 「その日の全候補中でのスコア順位・次点候補（上位2件）」を独立に再計算して
// 示す（選定ロジック自体には手を加えない、あくまで説明のための事後計算）。
function rankCandidatesForDay(
  allCandidates: MusicCandidate[],
  context: Parameters<typeof scoreTrackForDay>[1],
): { candidate: MusicCandidate; score: number }[] {
  return allCandidates
    .map((c) => ({ candidate: c, score: scoreTrackForDay(c, context).total }))
    .sort((a, b) => b.score - a.score)
}

function explainPrioritization(
  chosenTrackId: number,
  scored: { candidate: MusicCandidate; score: number }[],
): string {
  const chosenIndex = scored.findIndex((s) => s.candidate.id === chosenTrackId)
  const chosenScore = scored[chosenIndex]?.score ?? 0
  const runnerUp = scored.find((s) => s.candidate.id !== chosenTrackId)

  const rankText = `候補${scored.length}件中スコア${chosenScore}点で${chosenIndex + 1}位`
  if (!runnerUp) return `${rankText}（他に比較対象なし）`

  if (runnerUp.score <= chosenScore) {
    return `${rankText}。次点「${runnerUp.candidate.title}」／${runnerUp.candidate.artist}（スコア${runnerUp.score}点）を上回った`
  }
  return (
    `${rankText}。単独スコアでは「${runnerUp.candidate.title}」／${runnerUp.candidate.artist}` +
    `（スコア${runnerUp.score}点）の方が高かったが、週全体の邦楽/洋楽比率最適化の結果こちらが選ばれた`
  )
}

export async function testWeeklySoundtrackSelection(
  payload: Payload,
  input: { maronWeeklyObservation: string; baseDate?: Date; callAi: boolean },
): Promise<WeeklySelectionTestResult> {
  if (!input.maronWeeklyObservation || input.maronWeeklyObservation.trim() === '') {
    throw new Error('maronWeeklyObservationは必須です（テストでも既存の必須入力を再現する）。')
  }

  const settings = (await payload.findGlobal({ slug: 'tns-settings' })) as unknown as TNSSettingsDoc
  const week = computeNextTnsWeek(input.baseDate)
  const season = deriveSeasonType(week.weekStart)
  const weather = await fetchWeeklyWeather(week)

  const codeByWeekday = new Map(settings.weekdayCodeMapping.map((m) => [m.weekday, m.code]))
  const moodLabelByCode = new Map(settings.codeFixedMoodLabels.map((m) => [m.code, m.fixedMoodLabel]))

  const allCandidates = await fetchEligibleMusicCandidates(payload)

  const daySlots: (DaySlot & { weather: (typeof weather.daily)[number] })[] = week.days.map(({ date, weekday }) => {
    const code = codeByWeekday.get(weekday)
    if (!code) {
      throw new Error(`TNSSettings.weekdayCodeMapping に "${weekday}" のTNS Editorial Codeが設定されていません。`)
    }
    const fixedMoodLabel = moodLabelByCode.get(code) ?? ''
    const dailyWeather = weather.daily.find((d) => d.date === formatDateISO(date)) ?? {
      date: formatDateISO(date),
      conditionLabel: '不明',
      tempHighC: null,
      tempLowC: null,
    }
    return {
      weekday,
      date: formatDateISO(date),
      code,
      fixedMoodLabel,
      conditionLabel: dailyWeather.conditionLabel,
      season: deriveSeasonType(date),
      weather: dailyWeather,
    }
  })

  // 7曲選定（AI呼び出しなし、無料）
  const assignments = selectWeeklyTracks(daySlots, allCandidates, settings.historicalReferenceJapaneseRatio)
  const candidateById = new Map<number, MusicCandidate>(allCandidates.map((c) => [c.id, c]))

  let dynamicEmotionByWeekday = new Map<Weekday, string>()
  let anthropicUsage: { inputTokens: number; outputTokens: number } | null = null

  if (input.callAi) {
    const dailyPlans: DailyPlanInput[] = daySlots.map((day, i) => {
      const assignment = assignments[i]
      const track = assignment.trackId !== null ? candidateById.get(assignment.trackId) : undefined
      return {
        date: day.date,
        weekday: day.weekday,
        code: day.code,
        fixedMoodLabel: day.fixedMoodLabel,
        weather: day.weather,
        assignedTrack: track ? { title: track.title, artist: track.artist, releaseYear: track.releaseYear } : null,
      }
    })

    // generateTnsWeeklyEditionDraft内部でANTHROPIC_USAGEをconsole.errorへ出力する
    // 既存仕様をそのまま利用し、標準errorから使用量を捕捉する。
    const originalConsoleError = console.error
    let capturedUsageLine: string | null = null
    console.error = (...args: unknown[]) => {
      const line = args.map((a) => String(a)).join(' ')
      if (line.includes('ANTHROPIC_USAGE')) capturedUsageLine = line
      originalConsoleError(...args)
    }

    const draft = await generateTnsWeeklyEditionDraft({
      weekStart: formatDateISO(week.weekStart),
      weekEnd: formatDateISO(week.weekEnd),
      season,
      weekSummary: weather.weekSummary,
      maronWeeklyObservation: input.maronWeeklyObservation,
      dailyPlans,
    })

    console.error = originalConsoleError

    if (capturedUsageLine) {
      const match = (capturedUsageLine as string).match(/\{.*\}/)
      if (match) {
        try {
          const usage = JSON.parse(match[0])
          anthropicUsage = { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
        } catch {
          // usage行のパースに失敗しても致命的ではない（レポートにnullで出すのみ）
        }
      }
    }

    dynamicEmotionByWeekday = new Map(draft.dailyScenes.map((s) => [s.weekday, s.emotion]))
  }

  const usedTrackIdsThisWeek = new Set<number>()
  const days: WeeklySelectionTestDayResult[] = daySlots.map((day, i) => {
    const assignment = assignments[i]
    const track = assignment.trackId !== null ? candidateById.get(assignment.trackId) : undefined

    const context = {
      conditionLabel: day.conditionLabel,
      season: day.season,
      code: day.code,
      fixedMoodLabel: day.fixedMoodLabel,
      weekday: day.weekday,
    }

    let prioritizationReason = ''
    let scoreBreakdown: ScoreBreakdownPoints = { mood: 0, weather: 0, season: 0, ginzaCode: 0 }
    let totalScore = 0
    let runnerUps: RunnerUpCandidate[] = []

    if (track) {
      const breakdown = scoreTrackForDay(track, context)
      scoreBreakdown = {
        mood: breakdown.moodMatch ? SCORE_WEIGHTS.mood : 0,
        weather: breakdown.weatherMatch ? SCORE_WEIGHTS.weather : 0,
        season: breakdown.seasonMatch ? SCORE_WEIGHTS.season : 0,
        ginzaCode: breakdown.ginzaCodeMatch ? SCORE_WEIGHTS.ginzaCode : 0,
      }
      totalScore = breakdown.total

      const ranked = rankCandidatesForDay(allCandidates, context)
      prioritizationReason = explainPrioritization(track.id, ranked)
      runnerUps = ranked
        .filter((r) => r.candidate.id !== track.id)
        .slice(0, 2)
        .map((r) => ({ title: r.candidate.title, artist: r.candidate.artist, score: r.score }))

      usedTrackIdsThisWeek.add(track.id)
    }

    return {
      date: day.date,
      weekday: day.weekday,
      conditionLabel: day.weather.conditionLabel,
      tempHighC: day.weather.tempHighC,
      tempLowC: day.weather.tempLowC,
      code: day.code,
      fixedMoodLabel: day.fixedMoodLabel,
      dynamicEmotion: dynamicEmotionByWeekday.get(day.weekday) ?? (input.callAi ? '' : '（未生成：AI呼び出しなしモード）'),
      selectedTrack: track
        ? { title: track.title, artist: track.artist, releaseYear: track.releaseYear, origin: track.origin }
        : null,
      totalScore,
      scoreBreakdown,
      runnerUps,
      selectionReason: track ? assignment.internalReason || formatScoreBreakdownAsInternalReason(scoreTrackForDay(track, context)) : '',
      prioritizationReason,
      pendingHumanSelection: assignment.trackId === null,
    }
  })

  // 安全検証（レポート用の事後チェック、選定ロジック自体は変更しない）：
  // ①既使用21曲の混入がないか、②週内で同一曲を重複割当していないか。
  const { docs: ledgerEntries } = await payload.find({ collection: 'music-usage-ledger', limit: 200, depth: 0 })
  const usedTrackIdsInLedger = new Set(
    ledgerEntries.map((entry) => {
      const musicTrack = entry.musicTrack
      return typeof musicTrack === 'object' && musicTrack !== null ? Number(musicTrack.id) : Number(musicTrack)
    }),
  )
  const selectedIds = [...usedTrackIdsThisWeek]
  const usedTrackContamination = selectedIds.filter((id) => usedTrackIdsInLedger.has(id)).length
  const duplicateWithinWeek = assignments.filter((a) => a.trackId !== null).length - selectedIds.length

  return {
    weekStart: formatDateISO(week.weekStart),
    weekEnd: formatDateISO(week.weekEnd),
    season,
    weatherSource: weather.weatherSource,
    days,
    japaneseCount: days.filter((d) => d.selectedTrack?.origin === 'japanese').length,
    internationalCount: days.filter((d) => d.selectedTrack?.origin === 'international').length,
    usedTrackContamination,
    duplicateWithinWeek,
    pendingCount: days.filter((d) => d.pendingHumanSelection).length,
    zeroScoreCount: days.filter((d) => d.selectedTrack !== null && d.totalScore === 0).length,
    averageScore:
      days.filter((d) => d.selectedTrack !== null).length > 0
        ? days.reduce((sum, d) => sum + d.totalScore, 0) / days.filter((d) => d.selectedTrack !== null).length
        : 0,
    anthropicUsage,
  }
}
