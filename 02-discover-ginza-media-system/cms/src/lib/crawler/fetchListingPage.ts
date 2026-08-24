import { extractGinzaRelevantLinks, type DiscoveredLink } from './extractLinks'
import { BOT_TOKEN, USER_AGENT } from './fetchSource'
import { checkRobotsAllowed } from './robotsTxt'

// 一覧ページ（NEWS/EVENT/EXHIBITION等）の取得（Source Coverage拡張、
// 2026-08-17）。
//
// fetchArticlePage.ts（Stage 2、個別記事取得）と意図的に別実装にしている——
// 同じ理由：既存のトップページ巡回（fetchSource.ts）・個別記事取得
// （fetchArticlePage.ts）に一切手を入れず、一覧ページ取得の障害・挙動変更が
// 既存のパイプラインに影響しないための安全側の設計判断。robots.txtチェックと
// User-Agent識別のみ共有する。
//
// 一覧ページ自体の構造化日付・contentTypeは抽出しない（一覧ページは個別記事
// ではないため）——抽出するのはページ本文から見つかる個別記事・イベントリンク
// （extractGinzaRelevantLinksを再利用、トップページと全く同じロジック）のみ。
// 生HTMLはこの関数内でのみ扱い、戻り値には含めない。

const FETCH_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

export interface ListingPageFetchOutcome {
  ok: boolean
  httpStatus: number | null
  links: DiscoveredLink[]
  duplicatesRemoved: number
  errorMessage: string | null
  blockedByRobots: boolean
}

function failure(reason: string, blockedByRobots = false, httpStatus: number | null = null): ListingPageFetchOutcome {
  return { ok: false, httpStatus, links: [], duplicatesRemoved: 0, errorMessage: reason, blockedByRobots }
}

export async function fetchListingPageLinks(url: string): Promise<ListingPageFetchOutcome> {
  const robotsCheck = await checkRobotsAllowed(url, BOT_TOKEN, USER_AGENT)
  if (!robotsCheck.allowed) {
    return failure(robotsCheck.reason ?? 'robots.txtにより禁止されています', true)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

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
      return failure(`HTTPエラー: ${res.status} ${res.statusText}`, false, res.status)
    }

    // fetchArticlePage.tsと同じ理由（PDF/画像等のバイナリを誤ってHTMLとして
    // 扱わないための防御、2026-08-17）。
    const responseContentType = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml\+xml/i.test(responseContentType)) {
      return failure(`非HTMLレスポンス（Content-Type: ${responseContentType || '不明'}）のため対象外`, false, res.status)
    }

    const contentLengthHeader = res.headers.get('content-length')
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_RESPONSE_BYTES) {
      return failure(`レスポンスサイズが上限(${MAX_RESPONSE_BYTES}バイト)を超過`, false, res.status)
    }

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return failure(`レスポンスサイズが上限(${MAX_RESPONSE_BYTES}バイト)を超過`, false, res.status)
    }

    const html = buf.toString('utf-8')
    const extraction = extractGinzaRelevantLinks(html, url)

    return {
      ok: true,
      httpStatus: res.status,
      links: extraction.links,
      duplicatesRemoved: extraction.duplicatesRemoved,
      errorMessage: null,
      blockedByRobots: false,
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return failure(
      isAbort ? `タイムアウト（${FETCH_TIMEOUT_MS}ms以内に応答なし）` : err instanceof Error ? err.message : String(err),
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
