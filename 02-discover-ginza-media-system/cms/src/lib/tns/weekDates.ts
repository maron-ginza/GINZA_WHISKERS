import { WEEKDAYS, type SeasonType, type Weekday } from './types'

// 週次日付・季節の決定的計算（TNS_SPEC.md §2 STEP1「曜日」「季節」＝自動）。
// AI呼び出しは行わない。

export interface WeekDates {
  weekStart: Date
  weekEnd: Date
  days: { date: Date; weekday: Weekday }[]
}

function toDateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

// JSのgetDay()は日曜=0〜土曜=6。TNSは月曜始まり（_media_pipeline/
// projects.jsonのweek_pattern・TNSSettings.weekdayCodeMappingと同じ前提）。
function mondayOfWeekContaining(date: Date): Date {
  const d = toDateOnlyUTC(date)
  const jsDay = d.getUTCDay() // 0=Sun..6=Sat
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diffToMonday)
  return monday
}

// マロン指示「翌週7日分の天気データを取得・保持」に基づき、実行日が属する
// 週の“次の”月曜始まり週を対象とする（実行日が月曜であっても当該週ではなく
// 次週を返す——「翌週」という指示の文字どおりの解釈）。
export function computeNextTnsWeek(baseDate: Date = new Date()): WeekDates {
  const currentMonday = mondayOfWeekContaining(baseDate)
  const nextMonday = new Date(currentMonday)
  nextMonday.setUTCDate(currentMonday.getUTCDate() + 7)

  const days: { date: Date; weekday: Weekday }[] = WEEKDAYS.map((weekday, i) => {
    const date = new Date(nextMonday)
    date.setUTCDate(nextMonday.getUTCDate() + i)
    return { date, weekday }
  })

  const weekEnd = days[days.length - 1].date

  return { weekStart: nextMonday, weekEnd, days }
}

export function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// VISUAL_ASSET_LIBRARY.md §2.3「基本目安の時期」表をそのまま再現する
// （SPRING 3〜5月／SUMMER 6〜8月／AUTUMN 9〜11月／CHRISTMAS 11月末〜12/25／
// NEW YEAR 12/26頃〜1月上旬／WINTER 正月後〜2月）。新しい季節区分は作らない。
export function deriveSeasonType(date: Date): SeasonType {
  const month = date.getUTCMonth() + 1 // 1-12
  const day = date.getUTCDate()

  if (month >= 3 && month <= 5) return 'SPRING'
  if (month >= 6 && month <= 8) return 'SUMMER'
  if (month >= 9 && month <= 11 && !(month === 11 && day >= 25)) return 'AUTUMN'
  if ((month === 11 && day >= 25) || (month === 12 && day <= 25)) return 'CHRISTMAS'
  if ((month === 12 && day >= 26) || (month === 1 && day <= 10)) return 'NEW_YEAR'
  // WINTER：正月後（1/11以降）〜2月
  return 'WINTER'
}
