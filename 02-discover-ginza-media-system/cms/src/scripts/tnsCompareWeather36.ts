import { getPayload } from 'payload'

import config from '../payload.config'
import { reconcileWeeklyWeather } from '../lib/tns/fetchWeeklyWeather'
import { testWeeklySoundtrackSelection } from '../lib/tns/testWeeklySoundtrackSelection'
import { computeNextTnsWeek, formatDateISO } from '../lib/tns/weekDates'

// #36（2026-08-31〜09-06）について、旧 Open-Meteo 版と新 気象庁主軸版を比較する
// 読み取り専用スクリプト（2026-08-28）。DB への書き込み・#36 の再生成は行わない。
// AI も呼ばない（callAi:false）。選曲は決定的スコアリングのみで比較する。

const BASE_DATE = new Date('2026-08-28T00:00:00Z') // 金曜。翌週 = 2026-08-31〜09-06
const EDITION_ID = 10

async function main() {
  const payload = await getPayload({ config })

  // ── 旧（#36 に保存済みの Open-Meteo 値）──────────────────────
  const ed = (await payload.findByID({ collection: 'soundtrack-editions', id: EDITION_ID, depth: 1 })) as {
    context?: { weather?: { weekSummary?: string; daily?: Array<{ date: string; conditionLabel: string; tempHighC: number | null; tempLowC: number | null }> } }
    dailyScenes?: Array<{ date: string; weekday: string; musicSelected?: { trackRef?: { id?: number; title?: string; artist?: string; origin?: string } } }>
  }
  const oldWeather = (ed.context?.weather?.daily ?? []).map((d) => ({
    date: String(d.date).slice(0, 10),
    conditionLabel: d.conditionLabel,
    tempHighC: d.tempHighC,
    tempLowC: d.tempLowC,
  }))
  const oldWeekSummary = ed.context?.weather?.weekSummary ?? null
  const oldTracks = (ed.dailyScenes ?? []).map((s) => {
    const t = s.musicSelected?.trackRef
    return { date: String(s.date).slice(0, 10), weekday: s.weekday, trackId: t?.id, title: t?.title, artist: t?.artist, origin: t?.origin }
  })
  const observation =
    (ed as { context?: { maronWeeklyObservation?: string } }).context?.maronWeeklyObservation ||
    '残暑がやわらぎ、銀座にも季節の境目が近づいている一週間でした'

  // ── 新（気象庁主軸 reconcile）─────────────────────────────
  const week = computeNextTnsWeek(BASE_DATE)
  const newWeather = await reconcileWeeklyWeather(week)

  // ── 新しい天気での選曲（AI なし、決定的スコアリング）────────
  const newSelection = await testWeeklySoundtrackSelection(payload, {
    maronWeeklyObservation: observation,
    baseDate: BASE_DATE,
    callAi: false,
  })

  // ── 日別 突き合わせ ───────────────────────────────────────
  const oldByDate = new Map(oldWeather.map((d) => [d.date, d]))
  const days = newWeather.daily.map((n) => {
    const o = oldByDate.get(n.date)
    return {
      date: n.date,
      old_openMeteo: o
        ? { label: o.conditionLabel, high: o.tempHighC, low: o.tempLowC }
        : null,
      new_jmaPrimary: {
        label: n.conditionLabel,
        high: n.tempHighC,
        low: n.tempLowC,
        pop: n.pop,
        reliability: n.reliability,
        source: n.weatherSource,
        divergence: n.divergence,
      },
    }
  })

  const oldTrackById = new Map(oldTracks.map((t) => [t.date, t]))
  const trackImpact = newSelection.days.map((d) => {
    const o = oldTrackById.get(d.date)
    const changed = (o?.trackId ?? null) !== (d.selectedTrack ? null : null) // placeholder, replaced below
    return {
      date: d.date,
      weekday: d.weekday,
      old: o ? { title: o.title, artist: o.artist, origin: o.origin } : null,
      new: d.selectedTrack
        ? { title: d.selectedTrack.title, artist: d.selectedTrack.artist, origin: d.selectedTrack.origin }
        : null,
      changed: (o?.title ?? null) !== (d.selectedTrack?.title ?? null),
      newScore: d.totalScore,
      newBreakdown: d.scoreBreakdown,
      newRunnerUps: d.runnerUps,
    }
  })

  console.log(
    JSON.stringify(
      {
        week: { weekStart: formatDateISO(week.weekStart), weekEnd: formatDateISO(week.weekEnd) },
        provenance: newWeather.provenance,
        weekSummary: { old: oldWeekSummary, new: newWeather.weekSummary },
        days,
        selection: {
          old_japaneseCount: oldTracks.filter((t) => t.origin === 'japanese').length,
          old_internationalCount: oldTracks.filter((t) => t.origin === 'international').length,
          new_japaneseCount: newSelection.japaneseCount,
          new_internationalCount: newSelection.internationalCount,
          new_usedTrackContamination: newSelection.usedTrackContamination,
          new_duplicateWithinWeek: newSelection.duplicateWithinWeek,
          trackImpact,
        },
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
