// GINZA WHISKERS / Project 02（2026-09-11）— 業務日付（Asia/Tokyo 暦日）の共通関数。
//
// 目的：日次処理（朝刊収集 / morning-brief / review-today / decision.json / night queue /
// ArticleFacts の出典確認日 / 運用記録 / note 下書きパッケージ / 重複判定の過去7日 /
// ファイル名・保存ディレクトリ）で使う「業務日付」を、**すべてこの共通関数から**取得する。
//
// 原則：
//   1. UTC 日時をそのまま日付へ切り出さない（`new Date().toISOString().slice(0,10)` 禁止）。
//   2. Asia/Tokyo の暦日を返す（サーバの TZ に依存しない。Railway=UTC でも正しい）。
//   3. 各処理が個別に日付計算しない（この 1 ファイルだけを使う）。
//   4. 日付を明示指定（--date=YYYY-MM-DD 等）した場合は、その指定値を優先する。

export const BUSINESS_TIMEZONE = 'Asia/Tokyo'
/** Asia/Tokyo は年間を通じて UTC+9（サマータイムなし）。start-of-day 生成に使う。 */
export const BUSINESS_UTC_OFFSET = '+09:00'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' 形式の妥当な日付文字列か（暦日の妥当性まで確認）。 */
export function isBusinessDateString(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  // 実在日か（2026-02-30 等を弾く）。UTC で構築して各成分が一致するか。
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

/**
 * 指定時刻の Asia/Tokyo における暦日を 'YYYY-MM-DD' で返す。
 * `Intl.DateTimeFormat(...).formatToParts` で TZ を Asia/Tokyo に固定して成分を取り出すため、
 * サーバのローカル TZ にも UTC 切り出しにも依存しない。
 */
export function tokyoBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

/** 任意の Date を Asia/Tokyo の暦日文字列へ（イベント日・確認日の表示／比較用）。 */
export const toTokyoDateString = tokyoBusinessDate

/**
 * 業務日付の解決：明示指定（--date 等）が妥当ならそれを優先、無ければ Asia/Tokyo の当日。
 * これを日次処理の唯一の入口にする（各処理で `new Date().toISOString()...` を書かない）。
 */
export function resolveBusinessDate(explicit?: string | null, now: Date = new Date()): string {
  const e = (explicit ?? '').trim()
  return isBusinessDateString(e) ? e : tokyoBusinessDate(now)
}

/**
 * 業務日付（'YYYY-MM-DD'）の Asia/Tokyo における 00:00 を表す Date を返す。
 * スコアリング・鮮度・時期判定の「基準時刻」を業務日の始まりに揃えるのに使う
 * （`new Date(\`${date}T00:00:00.000Z\`)` は UTC 基準で 9 時間ずれるため使わない）。
 */
export function tokyoStartOfDay(dateStr: string): Date {
  if (!isBusinessDateString(dateStr)) throw new Error(`tokyoStartOfDay: 不正な業務日付 "${dateStr}"`)
  return new Date(`${dateStr}T00:00:00${BUSINESS_UTC_OFFSET}`)
}
