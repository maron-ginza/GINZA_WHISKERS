import { classifyContentType } from './classifyContentType'
import type { ContentType } from './discoveredContentTypes'
import { emptyImageUrlResult, extractRepresentativeImageUrl, type ImageUrlResult } from './extractImageUrl'
import { extractStructuredDates, type DateFieldResult, type VenueFieldResult } from './extractStructuredDates'
import { BOT_TOKEN, USER_AGENT } from './fetchSource'
import { decodeAndNormalizeDisplayText, decodeHtmlEntities } from './htmlEntities'
import { checkRobotsAllowed } from './robotsTxt'
import { getSiteDateAdapter } from './siteAdapters/registry'

// 個別記事・イベントページの取得（Stage 2、2026-08-17）。
//
// fetchSource.tsのfetchOnce/fetchSourceContentとは意図的に別実装にしている
// （ロジックの共有ではなく複製）——毎朝のPayload Jobs Queue cronが依存する
// 既存のトップページ巡回（fetchSource.ts）に一切手を入れず、個別記事取得の
// 障害・挙動変更が既存の巡回に影響しないようにするための安全側の設計判断。
// robots.txtチェック（robotsTxt.ts）とUser-Agent識別（fetchSource.tsから
// export済みの定数）のみ共有する。
//
// 生HTMLはこの関数内でのみ扱い、戻り値には含めない（永続化しない）——
// fetchSource.tsと同じ規律。

const FETCH_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

function emptyDateField(): DateFieldResult {
  return { value: null, source: null, confidence: null, rawMatch: null }
}

function emptyVenueField(): VenueFieldResult {
  return { value: null, source: null }
}

export interface ArticleFetchOutcome {
  ok: boolean
  httpStatus: number | null
  title: string | null
  excerpt: string | null
  contentType: ContentType
  publishedAt: DateFieldResult
  updatedAt: DateFieldResult
  eventStartAt: DateFieldResult
  eventEndAt: DateFieldResult
  venue: VenueFieldResult
  imageUrl: ImageUrlResult
  errorMessage: string | null
  blockedByRobots: boolean
}

const MAX_EXCERPT_CHARS = 1200
const MAX_TITLE_CHARS = 300

// 再発防止 #3（2026-09-01 Trial）：旧実装は &nbsp; &amp; &lt; &gt; &quot; &#39; の
// 6種のみで、数値文字参照（&#8211; 等）を素通ししてタイトルにそのまま残っていた
// （DiscoveredContent.title「… &#8211; GINZA SIX」）。名前付き＋10進＋16進を
// まとめてデコードする共通実装へ委譲する。
function decodeBasicEntities(text: string): string {
  return decodeHtmlEntities(text)
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match) return null
  // タイトル表示前に文字参照デコード＋空白正規化（#3）
  const raw = decodeAndNormalizeDisplayText(match[1])
  if (!raw) return null
  return raw.length > MAX_TITLE_CHARS ? raw.slice(0, MAX_TITLE_CHARS) : raw
}

function extractExcerpt(html: string): string | null {
  const withoutScriptsAndStyles = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const withoutTags = withoutScriptsAndStyles.replace(/<[^>]+>/g, ' ')
  const normalized = decodeBasicEntities(withoutTags).replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length > MAX_EXCERPT_CHARS ? normalized.slice(0, MAX_EXCERPT_CHARS) : normalized
}

function failure(reason: string, blockedByRobots = false, httpStatus: number | null = null): ArticleFetchOutcome {
  return {
    ok: false,
    httpStatus,
    title: null,
    excerpt: null,
    contentType: 'other',
    publishedAt: emptyDateField(),
    updatedAt: emptyDateField(),
    eventStartAt: emptyDateField(),
    eventEndAt: emptyDateField(),
    venue: emptyVenueField(),
    imageUrl: emptyImageUrlResult(),
    errorMessage: reason,
    blockedByRobots,
  }
}

export async function fetchArticleMetadata(url: string, sourceId?: string | null): Promise<ArticleFetchOutcome> {
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

    // PDF/画像等のバイナリレスポンスを誤ってHTMLとしてUTF-8デコード・パース
    // しないための防御（2026-08-17、Source Coverage拡張の実運用テストで、
    // PDF/PNGを不正なUTF-8バイト列としてDB書き込みしようとし失敗する事故が
    // 実際に発生したための追加。extractLinks.ts/discoverListingPages.tsの
    // 拡張子フィルタでほとんどは弾けるが、拡張子だけでは判定できないURLの
    // ための二重防御）。
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
    const title = extractTitle(html)
    const excerpt = extractExcerpt(html)
    const dates = extractStructuredDates(html)
    const imageUrl = extractRepresentativeImageUrl(html, url)
    const contentType = classifyContentType(url, title ?? '', dates.jsonLdType)

    // サイト固有アダプタ（siteAdapters/、2026-08-17追加）：全サイト共通の
    // Tier 1〜3bで見つからなかったフィールドのみを埋める最後のフォールバック。
    // 既に見つかっている値（より高いconfidence）は絶対に上書きしない。
    const adapter = getSiteDateAdapter(sourceId)
    if (adapter) {
      const adapterResult = adapter(html, url)
      if (!dates.publishedAt.value && adapterResult.publishedAt) dates.publishedAt = adapterResult.publishedAt
      if (!dates.updatedAt.value && adapterResult.updatedAt) dates.updatedAt = adapterResult.updatedAt
      if (!dates.eventStartAt.value && adapterResult.eventStartAt) dates.eventStartAt = adapterResult.eventStartAt
      if (!dates.eventEndAt.value && adapterResult.eventEndAt) dates.eventEndAt = adapterResult.eventEndAt
    }

    return {
      ok: true,
      httpStatus: res.status,
      title,
      excerpt,
      contentType,
      publishedAt: dates.publishedAt,
      updatedAt: dates.updatedAt,
      eventStartAt: dates.eventStartAt,
      eventEndAt: dates.eventEndAt,
      venue: dates.venue,
      imageUrl,
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
