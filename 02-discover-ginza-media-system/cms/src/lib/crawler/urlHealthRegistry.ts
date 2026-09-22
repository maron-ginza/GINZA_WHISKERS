// GINZA WHISKERS / Project 02（2026-09-22）— URL単位の取得可否レジストリ。
//
// 【背景】`sweetsDetailPageFetch.ts` は毎回、対象DiscoveredContentのうち
// `articleFetchStatus != 'fetched'` を無条件に再取得対象にしていたため、
// 404・非HTMLレスポンス（sitemap.xml/CSS/JSON等）で恒久的に失敗するURLへも
// 日々同じリクエストを繰り返していた（2026-09-22の6:00復旧措置で36件中36件
// 失敗し、そのほぼ全てが過去にも同じ理由で失敗していたURLだったことを確認）。
//
// 【設計】DBスキーマは変更せず（migration不要）、ファイルベースのレジストリ
// （.devlogs/ 配下・atomicWrite.ts で読み書き）にURL単位の直近の取得結果を
// 記録する。既知の恒久失敗（404／非HTMLレスポンス）はcooldown期間中スキップし、
// cooldown経過後は再確認を許可する（恒久的な黒穴にしない＝将来ページが
// 復活した場合も再検出できる）。アクセス制限の回避（UA偽装・認証情報の
// 無断利用等）は一切行わない——本モジュールは「いつ・何回試すか」を
// 制御するだけで、取得方法そのものは変更しない。

import { existsSync, readFileSync } from 'node:fs'

import { atomicWriteFileSync } from '../util/atomicWrite'

export type UrlHealthReasonCategory = 'http_404' | 'http_403' | 'non_html' | 'timeout' | 'other'

export interface UrlHealthEntry {
  status: 'ok' | 'unreachable'
  reasonCategory?: UrlHealthReasonCategory
  reasonDetail?: string
  lastCheckedAt: string
  sourceId?: string
  /** 連続失敗回数（cooldown計算には使わないが監視用に記録） */
  consecutiveFailures?: number
}

export type UrlHealthRegistry = Record<string, UrlHealthEntry>

/** 恒久失敗とみなすカテゴリ（403/404/非HTML）。timeout/otherは一時的な可能性があるため短いcooldownとする。 */
const PERMANENT_REASON_CATEGORIES: readonly UrlHealthReasonCategory[] = ['http_404', 'http_403', 'non_html']

const DEFAULT_COOLDOWN_DAYS_PERMANENT = 14
const DEFAULT_COOLDOWN_DAYS_TRANSIENT = 1

export function loadUrlHealthRegistry(filePath: string): UrlHealthRegistry {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as UrlHealthRegistry
    }
    return {}
  } catch {
    // 壊れたレジストリファイルは「記録なし」として扱う（推測復元はしない）
    return {}
  }
}

export function saveUrlHealthRegistry(filePath: string, registry: UrlHealthRegistry): void {
  atomicWriteFileSync(filePath, JSON.stringify(registry, null, 2), { force: true })
}

/**
 * HTTPステータス・Content-Type・エラーメッセージから失敗理由カテゴリを決定的に分類する。
 * 推測はしない：判別できない場合は 'other'（cooldownは短め＝早めに再確認する）。
 */
export function classifyFailureReason(input: {
  httpStatus?: number | null
  contentTypeMismatch?: boolean
  errorMessage?: string | null
}): { category: UrlHealthReasonCategory; detail: string } {
  const { httpStatus, contentTypeMismatch, errorMessage } = input
  if (httpStatus === 404) return { category: 'http_404', detail: `HTTPエラー: 404 Not Found` }
  if (httpStatus === 403) return { category: 'http_403', detail: `HTTPエラー: 403 Forbidden` }
  if (contentTypeMismatch) return { category: 'non_html', detail: errorMessage ?? '非HTMLレスポンス' }
  const msg = (errorMessage ?? '').toLowerCase()
  if (msg.includes('timeout') || msg.includes('abort')) {
    return { category: 'timeout', detail: errorMessage ?? 'タイムアウト' }
  }
  return { category: 'other', detail: errorMessage ?? '不明なエラー' }
}

/**
 * このURLを今回スキップすべきか（=直近の恒久失敗記録がcooldown期間内か）を判定する。
 * status:'ok' の記録、または記録が存在しない場合は常にfalse（試行してよい）。
 */
export function shouldSkipUrl(
  entry: UrlHealthEntry | undefined,
  nowISO: string,
  opts: { cooldownDaysPermanent?: number; cooldownDaysTransient?: number } = {},
): boolean {
  if (!entry || entry.status !== 'unreachable') return false
  const cooldownDays = PERMANENT_REASON_CATEGORIES.includes(entry.reasonCategory as UrlHealthReasonCategory)
    ? (opts.cooldownDaysPermanent ?? DEFAULT_COOLDOWN_DAYS_PERMANENT)
    : (opts.cooldownDaysTransient ?? DEFAULT_COOLDOWN_DAYS_TRANSIENT)
  const now = Date.parse(nowISO)
  const last = Date.parse(entry.lastCheckedAt)
  if (!Number.isFinite(now) || !Number.isFinite(last)) return false
  const daysSince = (now - last) / 86_400_000
  return daysSince < cooldownDays
}

/** 純粋関数：レジストリへ1件分の結果を反映した新しいレジストリを返す（元オブジェクトは変更しない）。 */
export function recordUrlHealth(
  registry: UrlHealthRegistry,
  url: string,
  entry: UrlHealthEntry,
): UrlHealthRegistry {
  const prev = registry[url]
  const consecutiveFailures =
    entry.status === 'unreachable' ? (prev?.status === 'unreachable' ? (prev.consecutiveFailures ?? 1) + 1 : 1) : 0
  return {
    ...registry,
    [url]: { ...entry, consecutiveFailures },
  }
}
