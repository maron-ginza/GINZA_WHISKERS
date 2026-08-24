import type { SiteDateAdapter } from './types'

// SEIKO HOUSE GINZA（sourceId: seiko-house-ginza）専用アダプタ（2026-08-17）。
//
// 実データで確認：イベントページのURLパスに日付が直接埋め込まれている
// （例: https://www.seiko.co.jp/en/seiko_house_ginza/event/20260512.html
// → 2026-05-12。DiscoveredContent id=236「Full-Scale Replica of the Clock
// Tower...」で実際に確認、日付取得率改善セッションの原因分析より）。
//
// URLパスの8桁数字が本当に日付を表しているのか、それとも単なる記事IDが
// 偶然日付らしい形をしているのかは構造的に保証されない——このサイトの
// 観測パターンに基づく経験則であるため、confidenceは'low'に設定し、
// JSON-LD/meta/本文ラベル（Tier 1〜3b）で取得できなかった場合のみの
// フォールバックとして扱う（呼び出し元でnullフィールドのみ埋める設計）。
export const seikoHouseGinzaAdapter: SiteDateAdapter = (_html, url) => {
  const m = /\/event\/(\d{4})(\d{2})(\d{2})\.html/.exec(url)
  if (!m) return {}

  const [, yStr, moStr, dStr] = m
  const y = Number(yStr)
  const mo = Number(moStr)
  const d = Number(dStr)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return {}

  const date = new Date(Date.UTC(y, mo - 1, d))
  if (Number.isNaN(date.getTime())) return {}

  const iso = date.toISOString()
  return {
    eventStartAt: { value: iso, source: 'url_path', confidence: 'low', rawMatch: url },
  }
}
