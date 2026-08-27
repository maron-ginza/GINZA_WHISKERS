import type { WeatherSource } from './types'
import { formatDateISO, type WeekDates } from './weekDates'

// 週間天気の自動取得（TNS_SPEC.md §5、2026-08-27実装セッションでの
// ユーザー確認済み方針：Open-Meteoを採用）。
//
// 【選定理由】TNS_SPEC.md §5は「新規API契約・課金を発生させない」ことを
// 明記しており、①AIによる無料・契約不要な情報源での自動取得を最優先
// 手段とする。Open-Meteo（open-meteo.com）は非商用利用でAPIキー登録・
// 契約・課金が一切不要な公開天気APIであり、この条件を満たす。実装前に
// ユーザーへ提案し、採用の承認を得ている（Project 02固有の「依存を増やす
// 判断は理由を一言で説明できることを条件とする」方針にも合致）。
//
// 【フォールバック】取得失敗（ネットワークエラー・予報範囲外・応答不正）
// 時はweatherSource:'manual'として扱い、呼び出し元がマロンの手入力を
// 促せるようにする——TNS_SPEC.md §5の取得優先順位（①自動取得→②手入力→
// ③将来の有料API）をそのまま実装したもの。

export interface DailyWeather {
  date: string // YYYY-MM-DD
  conditionLabel: string // 日本語の簡潔な天気ラベル（例：晴れ）
  tempHighC: number | null
  tempLowC: number | null
}

export interface WeeklyWeatherResult {
  weatherSource: WeatherSource
  weekSummary: string
  daily: DailyWeather[]
}

// 銀座（中央区）の緯度経度。Open-Meteoはこの座標に最も近いグリッド点の
// 予報を返す——銀座固有の観測地点があるわけではないため、都心の一般的な
// 予報として扱う（誤差は数km圏内、天気予報の一般的な精度の範囲内）。
const GINZA_LATITUDE = 35.6717
const GINZA_LONGITUDE = 139.7646

// WMO Weather interpretation codes（Open-Meteoが準拠）→日本語簡潔ラベル。
// 出典：Open-Meteo公式ドキュメントのWMO Weather Codeテーブル。
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

interface OpenMeteoDailyResponse {
  daily?: {
    time: string[]
    weathercode: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

export async function fetchWeeklyWeather(week: WeekDates): Promise<WeeklyWeatherResult> {
  const startDate = formatDateISO(week.weekStart)
  const endDate = formatDateISO(week.weekEnd)

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${GINZA_LATITUDE}&longitude=${GINZA_LONGITUDE}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo` +
    `&start_date=${startDate}&end_date=${endDate}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Open-Meteo API returned HTTP ${response.status}`)
    }

    const body = (await response.json()) as OpenMeteoDailyResponse
    const daily = body.daily
    if (!daily || daily.time.length !== 7) {
      throw new Error(
        `Open-Meteoの応答が想定形状と異なります（7日分の予報が取得できませんでした。` +
          '予報可能範囲外の可能性があります）',
      )
    }

    const dailyWeather: DailyWeather[] = daily.time.map((date, i) => ({
      date,
      conditionLabel: labelForWmoCode(daily.weathercode[i]),
      tempHighC: daily.temperature_2m_max[i] ?? null,
      tempLowC: daily.temperature_2m_min[i] ?? null,
    }))

    const weekSummary = summarizeWeek(dailyWeather)

    return { weatherSource: 'api', weekSummary, daily: dailyWeather }
  } catch (err) {
    console.error('[fetchWeeklyWeather] Open-Meteo取得失敗、manual入力へフォールバック:', err)
    return {
      weatherSource: 'manual',
      weekSummary: '（自動取得に失敗しました。マロンによる手入力が必要です）',
      daily: week.days.map((d) => ({
        date: formatDateISO(d.date),
        conditionLabel: '未入力',
        tempHighC: null,
        tempLowC: null,
      })),
    }
  }
}

// 決定的な週間サマリー生成（AI不使用）——最頻天気ラベルと気温レンジを機械的に要約する。
function summarizeWeek(daily: DailyWeather[]): string {
  const labelCounts = new Map<string, number>()
  for (const d of daily) {
    labelCounts.set(d.conditionLabel, (labelCounts.get(d.conditionLabel) ?? 0) + 1)
  }
  const mostCommon = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '不明'

  const highs = daily.map((d) => d.tempHighC).filter((v): v is number => v !== null)
  const lows = daily.map((d) => d.tempLowC).filter((v): v is number => v !== null)
  const maxHigh = highs.length > 0 ? Math.max(...highs) : null
  const minLow = lows.length > 0 ? Math.min(...lows) : null

  const tempRange = maxHigh !== null && minLow !== null ? `${minLow}〜${maxHigh}℃` : '気温データ不明'

  return `週の傾向：${mostCommon}が中心、気温は${tempRange}`
}
