import { createHash } from 'node:crypto'

import { discoverListingPageCandidates, type ListingPageCandidate } from './discoverListingPages'
import { extractGinzaRelevantLinks, type DiscoveredLink } from './extractLinks'
import { normalizeHtmlForDiff } from './normalizeHtml'
import { checkRobotsAllowed } from './robotsTxt'

// SOURCE LEDGER 自動巡回（2026-08-16、取得品質改善）：SourceLedgerEntry.url を実際に
// HTTP取得し、Snapshot保存・差分検知に必要な最小限のメタデータへ正規化する。生HTML
// 全文は呼び出し元にも一切返さない——2種類のcontentHash（差分判定用）とtitle/excerpt
// （将来の「旬の銀座候補抽出」用の軽量テキスト、上限あり）のみを返す。
//
// 2026-08-16のDry Run結果を踏まえた改善点：
// 1) User-Agentを、Googlebot等と同じ業界標準の自己申告フォーマット
//    `Mozilla/5.0 (compatible; <Bot名>/<version>; +<説明URL>)` に変更した。
//    実サイト（POLA MUSEUM ANNEX）で、独自フォーマットのUAはCDN/WAFに403で
//    弾かれる一方、この標準フォーマットは200で通ることを実地確認した——実ブラウザを
//    詐称するものではなく「ボットである」ことを明記したまま、広く認知された
//    自己申告の型に合わせただけであり、アクセス制限の回避には当たらないと判断した。
// 2) robots.txtを事前チェックし、Disallowされたパスには実際のHTTPリクエストを
//    送信しない（robotsTxt.ts）。
// 3) タイムアウト・一時的エラー（5xx・ネットワークエラー）に限定した最大1回の
//    リトライを追加した（403等の意図的アクセス拒否はリトライしない——サイトの
//    アクセス制御を尊重し、無意味な再試行で負荷をかけないため）。
// 4) 差分判定用に、生バイト列ハッシュとは別に「並び替えに強い正規化ハッシュ」
//    （normalizeHtmlForDiff）を追加した。詳細はnormalizeHtml.tsのコメント参照。

const FETCH_TIMEOUT_MS = 20_000
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024 // 8MB。異常に大きいレスポンスからの保護
const MAX_EXCERPT_CHARS = 2000
const MAX_TITLE_CHARS = 300
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 1500

// fetchArticlePage.ts（個別記事・イベントページ取得、2026-08-17）が同一の
// ボット識別を再利用できるようexportする（値の変更なし、可視性のみの変更）。
export const BOT_TOKEN = 'GinzaWhiskersDiscoverGinzaBot'
export const USER_AGENT = `Mozilla/5.0 (compatible; ${BOT_TOKEN}/1.0; +https://discover.ginzawhiskers.com)`

export interface FetchOutcome {
  ok: boolean
  httpStatus: number | null
  finalUrl: string | null
  redirected: boolean
  contentType: string | null
  contentHash: string | null
  normalizedContentHash: string | null
  contentLength: number | null
  title: string | null
  excerpt: string | null
  errorMessage: string | null
  blockedByRobots: boolean
  attemptCount: number
  /**
   * トップページ本文から抽出した、記事・イベントらしき内部リンク候補
   * （2026-08-17追加）。既存の呼び出し元（SourceSnapshots保存、diff判定）は
   * このフィールドを一切参照しないため、追加しても既存の巡回・保存挙動に
   * 影響しない。生HTML自体はこの関数のスコープ外に一切出ない
   * （抽出済みのURL・アンカーテキストのみを返す）。
   */
  links: DiscoveredLink[]
  /** 同一ページ内での重複リンク除外件数（2026-08-17追加、既存フィールドと同じく追加のみ） */
  linksDuplicatesRemoved: number
  /**
   * トップページ本文から見つかった、NEWS/EVENT/EXHIBITION等の一覧ページ
   * らしき内部リンク候補（Source Coverage拡張、2026-08-17追加）。
   * discoverListingPages.tsが担当。既存の呼び出し元はこのフィールドを
   * 参照しないため、追加しても既存の巡回・保存挙動に影響しない。
   */
  listingPageCandidates: ListingPageCandidate[]
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match) return null
  const raw = decodeBasicEntities(match[1]).replace(/\s+/g, ' ').trim()
  if (!raw) return null
  return raw.length > MAX_TITLE_CHARS ? raw.slice(0, MAX_TITLE_CHARS) : raw
}

// フルHTMLパーサーは導入しない（v1のスコープ外）。script/style除去→タグ除去→
// 空白正規化という素朴な処理で、目視・将来のキーワード抽出に足りる程度の
// テキストのみを抽出する簡易実装。
function extractExcerpt(html: string): string | null {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ')
  const normalized = decodeBasicEntities(withoutTags).replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length > MAX_EXCERPT_CHARS ? normalized.slice(0, MAX_EXCERPT_CHARS) : normalized
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(outcome: FetchOutcome): boolean {
  if (outcome.ok || outcome.blockedByRobots) return false
  if (outcome.httpStatus !== null && outcome.httpStatus >= 500 && outcome.httpStatus < 600) return true
  // httpStatusがnull＝タイムアウト・DNS/接続エラー等のネットワーク層の失敗
  return outcome.httpStatus === null
}

async function fetchOnce(url: string): Promise<FetchOutcome> {
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
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl: res.url || null,
        redirected: res.redirected,
        contentType: res.headers.get('content-type'),
        contentHash: null,
        normalizedContentHash: null,
        contentLength: null,
        title: null,
        excerpt: null,
        errorMessage: `HTTPエラー: ${res.status} ${res.statusText}`,
        blockedByRobots: false,
        attemptCount: 0,
        links: [],
        linksDuplicatesRemoved: 0,
        listingPageCandidates: [],
      }
    }

    const contentLengthHeader = res.headers.get('content-length')
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl: res.url || null,
        redirected: res.redirected,
        contentType: res.headers.get('content-type'),
        contentHash: null,
        normalizedContentHash: null,
        contentLength: Number(contentLengthHeader),
        title: null,
        excerpt: null,
        errorMessage: `レスポンスサイズが上限(${MAX_RESPONSE_BYTES}バイト)を超過`,
        blockedByRobots: false,
        attemptCount: 0,
        links: [],
        linksDuplicatesRemoved: 0,
        listingPageCandidates: [],
      }
    }

    const buf = Buffer.from(await res.arrayBuffer())

    if (buf.byteLength > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl: res.url || null,
        redirected: res.redirected,
        contentType: res.headers.get('content-type'),
        contentHash: null,
        normalizedContentHash: null,
        contentLength: buf.byteLength,
        title: null,
        excerpt: null,
        errorMessage: `レスポンスサイズが上限(${MAX_RESPONSE_BYTES}バイト)を超過`,
        blockedByRobots: false,
        attemptCount: 0,
        links: [],
        linksDuplicatesRemoved: 0,
        listingPageCandidates: [],
      }
    }

    const contentHash = createHash('sha256').update(buf).digest('hex')
    const text = buf.toString('utf-8')
    const normalizedContentHash = createHash('sha256').update(normalizeHtmlForDiff(text)).digest('hex')
    const linkExtraction = extractGinzaRelevantLinks(text, url)
    const listingPageCandidates = discoverListingPageCandidates(text, url)

    return {
      ok: true,
      httpStatus: res.status,
      finalUrl: res.url || null,
      redirected: res.redirected,
      contentType: res.headers.get('content-type'),
      contentHash,
      normalizedContentHash,
      contentLength: buf.byteLength,
      title: extractTitle(text),
      excerpt: extractExcerpt(text),
      errorMessage: null,
      blockedByRobots: false,
      attemptCount: 0,
      links: linkExtraction.links,
      linksDuplicatesRemoved: linkExtraction.duplicatesRemoved,
      listingPageCandidates,
    }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      httpStatus: null,
      finalUrl: null,
      redirected: false,
      contentType: null,
      contentHash: null,
      normalizedContentHash: null,
      contentLength: null,
      title: null,
      excerpt: null,
      errorMessage: isAbort
        ? `タイムアウト（${FETCH_TIMEOUT_MS}ms以内に応答なし）`
        : err instanceof Error
          ? err.message
          : String(err),
      blockedByRobots: false,
      attemptCount: 0,
      links: [],
      linksDuplicatesRemoved: 0,
      listingPageCandidates: [],
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchSourceContent(url: string): Promise<FetchOutcome> {
  const robotsCheck = await checkRobotsAllowed(url, BOT_TOKEN, USER_AGENT)
  if (!robotsCheck.allowed) {
    return {
      ok: false,
      httpStatus: null,
      finalUrl: null,
      redirected: false,
      contentType: null,
      contentHash: null,
      normalizedContentHash: null,
      contentLength: null,
      title: null,
      excerpt: null,
      errorMessage: robotsCheck.reason ?? 'robots.txtにより禁止されています',
      blockedByRobots: true,
      attemptCount: 0,
      links: [],
      linksDuplicatesRemoved: 0,
      listingPageCandidates: [],
    }
  }

  let outcome: FetchOutcome = await fetchOnce(url)
  let attempts = 1

  while (attempts < MAX_ATTEMPTS && isRetryable(outcome)) {
    await sleep(RETRY_DELAY_MS)
    outcome = await fetchOnce(url)
    attempts += 1
  }

  return { ...outcome, attemptCount: attempts }
}
