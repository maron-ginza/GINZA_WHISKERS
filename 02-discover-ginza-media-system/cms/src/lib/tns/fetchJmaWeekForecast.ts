import { formatDateISO, type WeekDates } from './weekDates'

// TNS週間天気 主ソース：気象庁「週間天気予報」（TNS_SPEC.md §5、2026-08-28）。
//
// 【選定理由】新規API契約・課金を発生させない（TNS_SPEC.md §5）という条件を
// Open-Meteo と同様に満たす公開データ。気象庁 bosai forecast JSON は
// 気象庁防災情報XMLと同じ一次情報で、日本の予報として最も権威がある。
//
// 対象：東京都 府県予報区（130000）
//   - 天気コード / 降水確率 / 信頼度 … 東京地方（130010）
//   - 最高 / 最低気温 … 東京（アメダス 44132）
// 週間予報の対象は「発表日+1 〜 発表日+7」程度。金曜発表だと対象週の
// 土日が範囲外になり得る（呼び出し元が補助ソースへフォールバックする）。

const JMA_FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json'
const TOKYO_AREA_CODE = '130010' // 東京地方
const TOKYO_TEMP_AREA_CODE = '44132' // 東京（アメダス）

// 気象庁 週間天気予報で実際に使われる天気コード → 日本語ラベル。
// （公式 telops.json と同じひらがな表記。週間予報は 100/200/300/400 系の
// 代表コードに正規化されており、短期予報のような細分コードは出ない。）
// 未知コードは百の位でカテゴリにフォールバックする。
const JMA_WEEK_CODE_LABELS: Record<string, string> = {
  '100': '晴れ',
  '101': '晴れ時々くもり',
  '102': '晴れ一時雨',
  '104': '晴れ一時雪',
  '110': '晴れのちくもり',
  '111': '晴れのちくもり',
  '112': '晴れのち一時雨',
  '113': '晴れのち時々雨',
  '114': '晴れのち雨',
  '200': 'くもり',
  '201': 'くもり時々晴れ',
  '202': 'くもり一時雨',
  '203': 'くもり時々雨',
  '204': 'くもり一時雪',
  '206': 'くもり一時雨か雪',
  '208': 'くもり一時雨で雷を伴う',
  '210': 'くもりのち時々晴れ',
  '211': 'くもりのち晴れ',
  '212': 'くもりのち一時雨',
  '213': 'くもりのち時々雨',
  '214': 'くもりのち雨',
  '215': 'くもりのち一時雪',
  '218': 'くもりのち雨か雪',
  '300': '雨',
  '301': '雨時々晴れ',
  '302': '雨時々止む',
  '303': '雨時々雪',
  '306': '大雨',
  '308': '雨で暴風を伴う',
  '311': '雨のち晴れ',
  '313': '雨のちくもり',
  '314': '雨のち時々雪',
  '315': '雨のち雪',
  '400': '雪',
  '401': '雪時々晴れ',
  '402': '雪時々止む',
  '403': '雪時々雨',
  '406': '風雪強い',
  '411': '雪のち晴れ',
  '413': '雪のちくもり',
  '414': '雪のち雨',
}

function labelForJmaCode(code: string): string {
  if (JMA_WEEK_CODE_LABELS[code]) return JMA_WEEK_CODE_LABELS[code]
  const head = code.charAt(0)
  if (head === '1') return `晴れ（気象庁コード${code}）`
  if (head === '2') return `くもり（気象庁コード${code}）`
  if (head === '3') return `雨（気象庁コード${code}）`
  if (head === '4') return `雪（気象庁コード${code}）`
  return `不明（気象庁コード${code}）`
}

export interface JmaDailyForecast {
  date: string // YYYY-MM-DD
  weatherCode: string
  conditionLabel: string // 気象庁テロップの日本語ラベル
  pop: number | null // 降水確率(%)
  reliability: 'A' | 'B' | 'C' | null
  tempMaxC: number | null
  tempMinC: number | null
}

export interface JmaWeekForecastResult {
  source: 'jma'
  reportDatetime: string
  areaCode: string
  tempAreaCode: string
  /** 対象週7日のうち、気象庁週間予報でカバーできた日 */
  byDate: Map<string, JmaDailyForecast>
  coverage: { from: string | null; to: string | null }
}

// 気象庁 bosai forecast JSON の最小型（週間セクションのみ使用）
interface JmaTimeSeriesArea {
  area: { name: string; code: string }
  weatherCodes?: string[]
  pops?: string[]
  reliabilities?: string[]
  tempsMin?: string[]
  tempsMax?: string[]
}
interface JmaTimeSeries {
  timeDefines: string[]
  areas: JmaTimeSeriesArea[]
}
interface JmaForecastGroup {
  reportDatetime: string
  timeSeries: JmaTimeSeries[]
}
type JmaForecastResponse = JmaForecastGroup[]

function normDate(iso: string): string {
  // "2026-08-31T00:00:00+09:00" -> "2026-08-31"
  return iso.slice(0, 10)
}

function toNumOrNull(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toReliability(v: string | undefined): 'A' | 'B' | 'C' | null {
  return v === 'A' || v === 'B' || v === 'C' ? v : null
}

export async function fetchJmaWeekForecast(week: WeekDates): Promise<JmaWeekForecastResult> {
  const res = await fetch(JMA_FORECAST_URL)
  if (!res.ok) throw new Error(`気象庁 forecast JSON HTTP ${res.status}`)
  const data = (await res.json()) as JmaForecastResponse

  // data[0] = 3日予報、data[1] = 週間予報
  const weekGroup = data[1]
  if (!weekGroup) throw new Error('気象庁 forecast JSON に週間セクション([1])がありません')

  const weatherTs = weekGroup.timeSeries[0]
  const tempTs = weekGroup.timeSeries[1]
  if (!weatherTs || !tempTs) throw new Error('気象庁 週間セクションの timeSeries が想定形状と異なります')

  const weatherArea = weatherTs.areas.find((a) => a.area.code === TOKYO_AREA_CODE)
  const tempArea = tempTs.areas.find((a) => a.area.code === TOKYO_TEMP_AREA_CODE)
  if (!weatherArea) throw new Error(`気象庁 週間予報に東京地方(${TOKYO_AREA_CODE})が見つかりません`)

  // 日付 -> index
  const weatherIdxByDate = new Map<string, number>()
  weatherTs.timeDefines.forEach((iso, i) => weatherIdxByDate.set(normDate(iso), i))
  const tempIdxByDate = new Map<string, number>()
  tempTs.timeDefines.forEach((iso, i) => tempIdxByDate.set(normDate(iso), i))

  const byDate = new Map<string, JmaDailyForecast>()
  for (const { date } of week.days) {
    const d = formatDateISO(date)
    const wi = weatherIdxByDate.get(d)
    if (wi === undefined) continue // 週間予報の範囲外
    const code = weatherArea.weatherCodes?.[wi] ?? ''
    const label = labelForJmaCode(code)
    const ti = tempIdxByDate.get(d)
    byDate.set(d, {
      date: d,
      weatherCode: code,
      conditionLabel: label,
      pop: toNumOrNull(weatherArea.pops?.[wi]),
      reliability: toReliability(weatherArea.reliabilities?.[wi]),
      tempMaxC: ti === undefined ? null : toNumOrNull(tempArea?.tempsMax?.[ti]),
      tempMinC: ti === undefined ? null : toNumOrNull(tempArea?.tempsMin?.[ti]),
    })
  }

  const coveredDates = [...byDate.keys()].sort()
  return {
    source: 'jma',
    reportDatetime: weekGroup.reportDatetime,
    areaCode: TOKYO_AREA_CODE,
    tempAreaCode: TOKYO_TEMP_AREA_CODE,
    byDate,
    coverage: { from: coveredDates[0] ?? null, to: coveredDates[coveredDates.length - 1] ?? null },
  }
}
