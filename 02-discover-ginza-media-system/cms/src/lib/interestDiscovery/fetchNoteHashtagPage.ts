import { BOT_TOKEN, USER_AGENT } from '../crawler/fetchSource'
import { checkRobotsAllowed } from '../crawler/robotsTxt'
import { NoteHashtagPageStructureError, parseNoteHashtagPage, type ParsedNoteHashtagPage } from './parseNoteHashtagPage'

// note.com/hashtag/<tag>（ハッシュタグページ、人気=既定ソート）取得
// （2026-08-27、Project 02-2 Phase A Priority 1補強）。
//
// 「?f=hot」（急上昇）は意図的に叩かない——調査の結果、総記事数・関連タグとも
// ソート条件に関わらず完全に同一であることを確認済みのため（parseNoteHashtagPage.ts
// のコメント参照）、区別可能な急上昇固有データが存在しない以上、無意味な追加
// HTTPリクエストを送らない。note.com/trend（fetchNoteRisingTags.ts）・
// note.com/info/rss（fetchNoteOfficialTopics.ts）の取得ロジックには一切手を
// 入れていない。

const FETCH_TIMEOUT_MS = 15_000

// paidOnly=true は Phase B 試験実装（2026-08-27、paidRatio trial）で追加。
// 既定はfalseのため、既存呼び出し元（captureNoteHashtagPopular.ts）の挙動は
// 一切変更していない。実地確認済み：`?paid_only=true`は`/hashtag/<tag>`
// ページでのみ機能し、note_official_topic由来のタグ（`/contest/<tag>`へ
// リダイレクトされる）には効かないことを確認済み（Phase B監査で判明）。
export function buildNoteHashtagPageUrl(tagName: string, paidOnly = false): string {
  const base = `https://note.com/hashtag/${encodeURIComponent(tagName)}`
  return paidOnly ? `${base}?paid_only=true` : base
}

export interface FetchNoteHashtagPageResult {
  ok: boolean
  url: string
  parsed: ParsedNoteHashtagPage | null
  errorMessage: string | null
  blockedByRobots: boolean
}

export async function fetchNoteHashtagPage(tagName: string, paidOnly = false): Promise<FetchNoteHashtagPageResult> {
  const url = buildNoteHashtagPageUrl(tagName, paidOnly)

  const robotsCheck = await checkRobotsAllowed(url, BOT_TOKEN, USER_AGENT)
  if (!robotsCheck.allowed) {
    return {
      ok: false,
      url,
      parsed: null,
      errorMessage: `robots.txtにより${url}へのアクセスが許可されていません: ${robotsCheck.reason ?? ''}`,
      blockedByRobots: true,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      return { ok: false, url, parsed: null, errorMessage: `HTTPエラー: ${res.status} ${res.statusText}`, blockedByRobots: false }
    }

    html = await res.text()
  } catch (err) {
    return {
      ok: false,
      url,
      parsed: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      blockedByRobots: false,
    }
  } finally {
    clearTimeout(timeoutId)
  }

  try {
    const parsed = parseNoteHashtagPage(html)
    return { ok: true, url, parsed, errorMessage: null, blockedByRobots: false }
  } catch (err) {
    if (err instanceof NoteHashtagPageStructureError) {
      return { ok: false, url, parsed: null, errorMessage: err.message, blockedByRobots: false }
    }
    throw err
  }
}
