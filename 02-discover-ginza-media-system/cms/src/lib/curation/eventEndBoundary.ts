// GINZA WHISKERS / Project 02（2026-09-06、根本改善）
//
// 【問題】event_end_at が「日付のみ」（例: "2026-09-06T00:00:00.000Z"、時刻情報を
// 持たない日付境界の代用表現）の場合、これまでは UTC 0時＝日本時間の朝9時を
// もって「終了済み」と判定していた。最終日の日本時間9時以降、実際にはまだ
// 開催中であっても即座に expired/ended 扱いになる誤判定があった（DC#310で確認）。
//
// 【方針】event_end_at が日付のみ（時刻情報なし）の場合は、日本時間の
// その日 23:59:59.999 まで開催中として扱い、翌日（日本時間）になってから
// 終了済みとする。終了時刻が明示されている場合（時刻情報あり）はその時刻を
// そのまま優先する——推測で時刻を補わない。
//
// 「時刻情報なし」の判定は、このコードベース既存の判定パターン
// （mapDiscoveredContentToEventFields.ts の hasEndTime 等）と同じ、
// ISO 文字列が "T00:00:00" (+ ".000" 任意 + "Z" 任意) で終わるかどうかで行う
// （日付境界の代用として書き込まれる形式と一致）。

const DATE_ONLY_RE = /T00:00:00(\.000)?Z?$/
const DATE_PART_RE = /^(\d{4}-\d{2}-\d{2})/

/**
 * event_end_at（ISO文字列）から「終了済みと判定してよい境界時刻」を epoch ms で返す。
 *   ・時刻情報あり（T00:00:00 以外）→ そのままの時刻を境界にする。
 *   ・時刻情報なし（日付のみ）→ 日本時間で同日 23:59:59.999 を境界にする
 *     （JST 23:59:59.999 は UTC では同じ暦日の 14:59:59.999 になる。
 *     JST = UTC+9 のため、日付が変わって UTC 側に繰り上がることはない）。
 * 解釈できない値は NaN を返す（呼び出し側は「判定不能」として扱う）。
 */
export function resolveEventEndBoundaryMs(iso: string | null | undefined): number {
  if (!iso) return NaN
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return NaN
  if (!DATE_ONLY_RE.test(iso)) return d.getTime()
  const m = DATE_PART_RE.exec(iso)
  if (!m) return d.getTime() // 想定外の形式は素直な解釈にフォールバック（推測で補正しない）
  const boundary = new Date(`${m[1]}T14:59:59.999Z`)
  return boundary.getTime()
}

/** event_end_at の境界を過ぎているか（＝終了済みとみなしてよいか）。解釈できない値は false（未確定扱い）。 */
export function isPastEventEnd(eventEndIso: string | null | undefined, now: Date): boolean {
  const boundary = resolveEventEndBoundaryMs(eventEndIso)
  if (Number.isNaN(boundary)) return false
  return now.getTime() > boundary
}
