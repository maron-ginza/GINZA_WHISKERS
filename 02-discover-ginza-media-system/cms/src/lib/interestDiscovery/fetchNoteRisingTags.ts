import { BOT_TOKEN, USER_AGENT } from '../crawler/fetchSource'
import { checkRobotsAllowed } from '../crawler/robotsTxt'
import { NoteTrendHtmlStructureError, parseNoteTrendHtml, type ParsedNoteTrendItem } from './parseNoteTrendHtml'

// note.com/trend（サイト全体の急上昇タグ）取得（2026-08-27、Project 02-2 Phase A試験実装）。
//
// 既存クローラー（fetchSource.ts）と同じUser-Agent・robots.txt事前チェックの
// 作法を踏襲する（実ブラウザへのなりすましをしない方針、CLAUDE.md §8既存原則と
// 同じ考え方をnote.comにも適用）。robots.txtは2026-08-27時点で確認済み——
// /trendは全User-agent向けDisallowリストに含まれない（/search・/api/*等は
// 含まれるが対象外）。

export const NOTE_TREND_URL = 'https://note.com/trend'
const MAX_ITEMS = 5
const FETCH_TIMEOUT_MS = 15_000

export interface FetchNoteRisingTagsResult {
  ok: boolean
  items: ParsedNoteTrendItem[]
  httpStatus: number | null
  errorMessage: string | null
  blockedByRobots: boolean
}

export async function fetchNoteRisingTags(): Promise<FetchNoteRisingTagsResult> {
  const robotsCheck = await checkRobotsAllowed(NOTE_TREND_URL, BOT_TOKEN, USER_AGENT)
  if (!robotsCheck.allowed) {
    return {
      ok: false,
      items: [],
      httpStatus: null,
      errorMessage: `robots.txtにより${NOTE_TREND_URL}へのアクセスが許可されていません: ${robotsCheck.reason ?? ''}`,
      blockedByRobots: true,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  let httpStatus: number | null = null
  try {
    const res = await fetch(NOTE_TREND_URL, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    httpStatus = res.status

    if (!res.ok) {
      return {
        ok: false,
        items: [],
        httpStatus,
        errorMessage: `HTTPエラー: ${res.status} ${res.statusText}`,
        blockedByRobots: false,
      }
    }

    html = await res.text()
  } catch (err) {
    return {
      ok: false,
      items: [],
      httpStatus,
      errorMessage: err instanceof Error ? err.message : String(err),
      blockedByRobots: false,
    }
  } finally {
    clearTimeout(timeoutId)
  }

  let items: ParsedNoteTrendItem[]
  try {
    items = parseNoteTrendHtml(html)
  } catch (err) {
    if (err instanceof NoteTrendHtmlStructureError) {
      return { ok: false, items: [], httpStatus, errorMessage: err.message, blockedByRobots: false }
    }
    throw err
  }

  // 「5件を超えて勝手に取得しない」（マロン指示）。noteが将来6件以上表示する
  // ようになった場合でも、上位5件のみを採用する（超過分を静かに無視するのでは
  // なく、呼び出し元がログで分かるようにitemsの実件数をそのまま返す）。
  const limited = items.slice(0, MAX_ITEMS)

  return { ok: true, items: limited, httpStatus, errorMessage: null, blockedByRobots: false }
}
