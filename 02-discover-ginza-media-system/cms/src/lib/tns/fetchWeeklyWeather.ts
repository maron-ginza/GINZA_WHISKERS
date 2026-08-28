import { fetchJmaWeekForecast, type JmaWeekForecastResult } from './fetchJmaWeekForecast'
import type { WeatherSource } from './types'
import {
  classifyDayDivergence,
  DEFAULT_DIVERGENCE_THRESHOLDS,
  type DayDivergence,
  type DivergenceThresholds,
} from './weatherDivergence'
import { formatDateISO, type WeekDates } from './weekDates'

// TNS週間天気の取得（TNS_SPEC.md §5）。
//
// 【2026-08-28 気象庁主軸化】
//   - 主ソース：気象庁「週間天気予報」（東京都府県予報区 130000 ／
//     天気・降水確率・信頼度は東京地方 130010、気温は東京 44132）。
//   - 補助ソース：Open-Meteo（`models=jma_seamless`＝気象庁数値モデル）。
//   - 日別に主／補助を比較し、大きな乖離がある日だけ humanReviewRequired=true。
//   - 通常は気象庁を優先して自動確定。気象庁週間予報の範囲外の日
//     （金曜実行時の対象週 土日など）は補助ソースで確定する。
//   - 主・補助とも取得失敗した場合のみ weatherSource:'manual'（人手入力）。
//
// 呼び出し元（createWeeklySoundtrackEdition.ts / testWeeklySoundtrackSelection.ts）
// は従来どおり `weekSummary` と `daily[].{date,conditionLabel,tempHighC,tempLowC}`
// を使う。`daily[].{pop,reliability,weatherSource,divergence}` と `provenance` は
// 追加フィールド（SoundtrackEditions のスキーマ拡張で保存する）。

export interface DailyWeather {
  date: string // YYYY-MM-DD
  conditionLabel: string // 確定した日本語の天気ラベル
  tempHighC: number | null
  tempLowC: number | null
  // --- 2026-08-28 追加 ---
  pop: number | null // 降水確率(%)
  reliability: 'A' | 'B' | 'C' | null // 気象庁の信頼度（補助ソース確定日は null）
  weatherSource: 'jma' | 'open-meteo' | 'manual'
  divergence: DayDivergence
}

export interface WeatherProvenance {
  primaryWeatherSource: string
  secondaryWeatherSource: string
  fetchedAt: string // ISO
  jmaReportDatetime: string | null
  humanReviewRequired: boolean
  humanReviewReasons: string[]
}

export interface WeeklyWeatherResult {
  weatherSource: WeatherSource // 'api' | 'manual'（後方互換：どちらかのソースが取れれば 'api'）
  weekSummary: string
  daily: DailyWeather[]
  provenance: WeatherProvenance
}

// ---------------------------------------------------------------------------
// Open-Meteo（補助ソース）
// ---------------------------------------------------------------------------

// 銀座一丁目駅（東京都中央区）を基準地点とする（2026-08-28）。Open-Meteo は
// この座標に最も近いモデルグリッド点を返す——グリッド解像度より駅間の距離は
// 十分小さいため、旧座標（銀座四丁目付近）との数値差は生じない。
const GINZA_ITCHOME_LATITUDE = 35.6742
const GINZA_ITCHOME_LONGITUDE = 139.7668

const WMO_CODE_LABELS: Record<number, string> = {
  0: '快晴',
  1: '晴れ',
  2: '晴れ時々曇り',
  3: '曇り',
  45: '霧',
  48: '霧（着氷性）',
  51: '弱い霧雨',
  53: '霧雨',
  55: '強い霧雨',
  56: '弱い着氷性の霧雨',
  57: '着氷性の霧雨',
  61: '弱い雨',
  63: '雨',
  65: '強い雨',
  66: '弱い着氷性の雨',
  67: '着氷性の雨',
  71: '弱い雪',
  73: '雪',
  75: '強い雪',
  77: '霧雪',
  80: '弱いにわか雨',
  81: 'にわか雨',
  82: '激しいにわか雨',
  85: '弱いにわか雪',
  86: '激しいにわか雪',
  95: '雷雨',
  96: '雷雨（弱いひょう）',
  99: '雷雨（激しいひょう）',
}

function labelForWmoCode(code: number | undefined): string {
  if (code === undefined) return '不明'
  return WMO_CODE_LABELS[code] ?? `不明（WMOコード${code}）`
}

export interface OpenMeteoDailyForecast {
  date: string
  weatherCode: number | null
  conditionLabel: string
  precipProb: number | null // precipitation_probability_max (%)
  tempMaxC: number | null
  tempMinC: number | null
}

export interface OpenMeteoWeekForecastResult {
  source: string // 'open-meteo/jma_seamless'
  byDate: Map<string, OpenMeteoDailyForecast>
}

interface OpenMeteoDailyResponse {
  daily?: {
    time: string[]
    weathercode: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max?: number[]
  }
}

export async function fetchOpenMeteoWeekForecast(
  week: WeekDates,
  opts: { model?: string } = {},
): Promise<OpenMeteoWeekForecastResult> {
  const startDate = formatDateISO(week.weekStart)
  const endDate = formatDateISO(week.weekEnd)
  const model = opts.model ?? 'jma_seamless'

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${GINZA_ITCHOME_LATITUDE}&longitude=${GINZA_ITCHOME_LONGITUDE}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FTokyo&models=${encodeURIComponent(model)}` +
    `&start_date=${startDate}&end_date=${endDate}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo API HTTP ${response.status}`)
  const body = (await response.json()) as OpenMeteoDailyResponse
  const daily = body.daily
  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    throw new Error('Open-Meteo の応答が想定形状と異なります')
  }

  const byDate = new Map<string, OpenMeteoDailyForecast>()
  daily.time.forEach((date, i) => {
    byDate.set(date, {
      date,
      weatherCode: daily.weathercode[i] ?? null,
      conditionLabel: labelForWmoCode(daily.weathercode[i]),
      precipProb: daily.precipitation_probability_max?.[i] ?? null,
      tempMaxC: daily.temperature_2m_max[i] ?? null,
      tempMinC: daily.temperature_2m_min[i] ?? null,
    })
  })
  return { source: `open-meteo/${model}`, byDate }
}

// ---------------------------------------------------------------------------
// 決定的な週間サマリー（AI不使用、既存ロジックを踏襲）
// ---------------------------------------------------------------------------
function summarizeWeek(daily: Pick<DailyWeather, 'conditionLabel' | 'tempHighC' | 'tempLowC'>[]): string {
  const labelCounts = new Map<string, number>()
  for (const d of daily) labelCounts.set(d.conditionLabel, (labelCounts.get(d.conditionLabel) ?? 0) + 1)
  const mostCommon = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '不明'

  const highs = daily.map((d) => d.tempHighC).filter((v): v is number => v !== null)
  const lows = daily.map((d) => d.tempLowC).filter((v): v is number => v !== null)
  const maxHigh = highs.length ? Math.max(...highs) : null
  const minLow = lows.length ? Math.min(...lows) : null
  const tempRange = maxHigh !== null && minLow !== null ? `${minLow}〜${maxHigh}℃` : '気温データ不明'
  return `週の傾向：${mostCommon}が中心、気温は${tempRange}`
}

// ---------------------------------------------------------------------------
// 主／補助の突き合わせ（reconcile）
// ---------------------------------------------------------------------------
export interface ReconcileOptions {
  thresholds?: DivergenceThresholds
  /** 補助ソースで確定した日（気象庁範囲外）を humanReview 対象に含めるか（既定 true） */
  flagFallbackDays?: boolean
}

export async function reconcileWeeklyWeather(
  week: WeekDates,
  options: ReconcileOptions = {},
): Promise<WeeklyWeatherResult> {
  const thresholds = options.thresholds ?? DEFAULT_DIVERGENCE_THRESHOLDS
  const flagFallbackDays = options.flagFallbackDays ?? true
  const fetchedAt = new Date().toISOString()

  let jma: JmaWeekForecastResult | null = null
  let om: OpenMeteoWeekForecastResult | null = null
  try {
    jma = await fetchJmaWeekForecast(week)
  } catch (err) {
    console.error('[reconcileWeeklyWeather] 気象庁 週間予報の取得失敗:', err)
  }
  try {
    om = await fetchOpenMeteoWeekForecast(week, { model: 'jma_seamless' })
  } catch (err) {
    console.error('[reconcileWeeklyWeather] Open-Meteo の取得失敗:', err)
  }

  const primaryWeatherSource = '気象庁 週間天気予報 / 東京地方(130010) ・ 気温:東京(44132)'
  const secondaryWeatherSource = om?.source
    ? `Open-Meteo(${om.source}) / 35.6742,139.7668`
    : 'Open-Meteo / 取得失敗'

  // 主・補助とも失敗 → 従来どおり manual フォールバック
  if (!jma && !om) {
    return {
      weatherSource: 'manual',
      weekSummary: '（自動取得に失敗しました。マロンによる手入力が必要です）',
      daily: week.days.map(({ date }) => ({
        date: formatDateISO(date),
        conditionLabel: '未入力',
        tempHighC: null,
        tempLowC: null,
        pop: null,
        reliability: null,
        weatherSource: 'manual' as const,
        divergence: { level: 'none' as const, reasons: [] },
      })),
      provenance: {
        primaryWeatherSource,
        secondaryWeatherSource,
        fetchedAt,
        jmaReportDatetime: null,
        humanReviewRequired: true,
        humanReviewReasons: ['気象庁・Open-Meteo とも取得に失敗（要手入力）'],
      },
    }
  }

  const humanReviewReasons: string[] = []
  let humanReviewRequired = false

  const daily: DailyWeather[] = week.days.map(({ date }) => {
    const d = formatDateISO(date)
    const j = jma?.byDate.get(d) ?? null
    const o = om?.byDate.get(d) ?? null

    const divergence = classifyDayDivergence(
      {
        date: d,
        jma: j
          ? { label: j.conditionLabel, pop: j.pop, tempMax: j.tempMaxC, tempMin: j.tempMinC, reliability: j.reliability }
          : null,
        openMeteo: o
          ? { label: o.conditionLabel, pop: o.precipProb, tempMax: o.tempMaxC, tempMin: o.tempMinC, reliability: null }
          : null,
      },
      thresholds,
    )

    // 確定値：気象庁優先。気象庁が無い日は Open-Meteo。
    let conditionLabel: string
    let tempHighC: number | null
    let tempLowC: number | null
    let pop: number | null
    let reliability: 'A' | 'B' | 'C' | null
    let weatherSource: 'jma' | 'open-meteo' | 'manual'

    if (j) {
      conditionLabel = j.conditionLabel
      // 気象庁の週間気温は近い日ほど空欄になりがち → その場合は補助ソースで補完
      tempHighC = j.tempMaxC ?? o?.tempMaxC ?? null
      tempLowC = j.tempMinC ?? o?.tempMinC ?? null
      pop = j.pop
      reliability = j.reliability
      weatherSource = 'jma'
    } else if (o) {
      conditionLabel = o.conditionLabel
      tempHighC = o.tempMaxC
      tempLowC = o.tempMinC
      pop = o.precipProb
      reliability = null
      weatherSource = 'open-meteo'
    } else {
      conditionLabel = '未入力'
      tempHighC = null
      tempLowC = null
      pop = null
      reliability = null
      weatherSource = 'manual'
    }

    if (divergence.level === 'major') {
      humanReviewRequired = true
      humanReviewReasons.push(`${d}: [major] ${divergence.reasons.join(' / ')}`)
    } else if (divergence.reasons.length) {
      // minor・信頼度C 等は参考として残す（フラグは立てない）
      humanReviewReasons.push(`${d}: [${divergence.level}] ${divergence.reasons.join(' / ')}`)
    }

    if (weatherSource === 'open-meteo' && jma) {
      // 気象庁は取れたが、この日は週間予報の範囲外だった
      humanReviewReasons.push(`${d}: 気象庁 週間予報の範囲外——補助ソース(Open-Meteo)で確定`)
      if (flagFallbackDays) humanReviewRequired = true
    }

    return { date: d, conditionLabel, tempHighC, tempLowC, pop, reliability, weatherSource, divergence }
  })

  return {
    weatherSource: 'api',
    weekSummary: summarizeWeek(daily),
    daily,
    provenance: {
      primaryWeatherSource: jma ? primaryWeatherSource : `${primaryWeatherSource}（今回取得失敗・補助ソースで代替）`,
      secondaryWeatherSource,
      fetchedAt,
      jmaReportDatetime: jma?.reportDatetime ?? null,
      humanReviewRequired,
      humanReviewReasons,
    },
  }
}

// 既存呼び出し元の互換エントリーポイント。中身は reconcileWeeklyWeather。
export async function fetchWeeklyWeather(week: WeekDates): Promise<WeeklyWeatherResult> {
  return reconcileWeeklyWeather(week)
}
