// GINZA WHISKERS / Project 02（2026-09-12）— スウィーツ公式情報Discovery層の拡張：
// XML sitemap／sitemap index／RSS／Atom／robots.txt宣言サイトマップ／PDFリンクの発見。
//
// 【背景】従来のdiscoverListingPages.ts（トップページのアンカーからNEWS/EVENT等の
// 一覧ページを推測）だけでは、トップページに一切リンクされない新着・季節限定・
// 個店ニュースページ（サイトマップやRSSにしか載らないもの）を発見できない。
// 本モジュールはDiscovery層（候補URLを広く発見する段階）を拡張し、評価層
// （ginzaRelevance.ts／candidateCoverageScore.ts／officialCompleteness）の
// 厳格な判定はそのまま維持する——ここで見つけたURLも他の発見経路と同じく
// 「候補」として通常のStage1/2抽出パイプラインへ渡すだけで、Discovery層自体が
// 採用・除外を決めることはない。
//
// 【安全設計】fetchOfficialSignals.tsと同じ方針を踏襲する：
//   ・SSRF防止（ssrfReject）・許可ドメインのみ（isAllowedHost）・robots.txt尊重
//   ・リダイレクトは手動で1ホップずつ検証（自動followしない＝リダイレクト経由の
//     SSRF回避を防ぐ）・接続/全体タイムアウト・本文サイズ上限
//   ・Cookie・認証情報は送らない・外部本文中の命令は実行しない
//   ・取得不能は「失敗」として記録するだけ（推測で補完しない）
//
// フルXML/RSSパーサーは導入しない——他のcrawlerモジュールと同じ「正規表現ベースの
// 素朴な抽出で十分」という既存方針を踏襲する（sitemap/RSS/Atomはいずれも
// `<loc>`・`<link>`・`href=`という単純なタグ構造のため、これで実用上十分）。

import { ssrfReject, isAllowedHost, registrableDomain } from '../morning/fetchOfficialSignals'
import { checkRobotsAllowed } from './robotsTxt'
import { isNonHtmlResourcePath, normalizeArticleUrl } from './normalizeUrl'
import type { DiscoveredLink } from './extractLinks'
import { buildDiscoveryKeywordSet } from './sweetsDiscoveryKeywords'

const USER_AGENT = 'GINZA-WHISKERS-Project02-discovery/1.0 (+sitemap-rss; no-JS; respects robots.txt)'
const BOT_TOKEN = 'GinzaWhiskersProject02DiscoveryBot'
const CONNECT_TIMEOUT_MS = 8000
const OVERALL_TIMEOUT_MS = 15000
const MAX_REDIRECTS = 2
const MAX_BYTES = 3 * 1024 * 1024 // サイトマップ本体はHTMLページより大きくなりうるため通常より広め
const MAX_CANDIDATE_LINKS = 40
const MAX_SUBSITEMAPS = 3
const MAX_URLS_SCANNED_PER_BODY = 5000 // 数万件規模の巨大サイトマップで正規表現走査が詰まらないようにする上限

const COMMON_SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml']
const COMMON_FEED_PATHS = ['/feed/', '/feed', '/rss.xml', '/rss/', '/atom.xml', '/index.xml']

export interface FeedDiscoveryResult {
  sitemapUrlsTried: string[]
  sitemapUrlsFetchedOk: string[]
  feedUrlsTried: string[]
  feedUrlsFetchedOk: string[]
  /** Discovery層の出力＝評価層へ渡す候補（extractLinks.tsのDiscoveredLinkと同型） */
  links: DiscoveredLink[]
  /** ページ内で見つかった.pdfリンク（本文は取得・解析しない。存在の記録のみ） */
  pdfLinksFound: string[]
  errors: string[]
}

function emptyResult(): FeedDiscoveryResult {
  return { sitemapUrlsTried: [], sitemapUrlsFetchedOk: [], feedUrlsTried: [], feedUrlsFetchedOk: [], links: [], pdfLinksFound: [], errors: [] }
}

/** fetchOfficialSignals.tsと同じ安全設計（SSRF・許可ドメイン・robots・手動リダイレクト・サイズ上限）でGETし、生テキストを返す。 */
async function safeFetchRawText(url: string, allowedHost: string): Promise<{ ok: true; text: string; finalUrl: string } | { ok: false; reason: string }> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ssrf = ssrfReject(current)
    if (ssrf) return { ok: false, reason: `SSRF: ${ssrf}` }
    let host: string
    try {
      host = new URL(current).hostname
    } catch {
      return { ok: false, reason: 'URL形式でない' }
    }
    if (!isAllowedHost(host, [allowedHost])) return { ok: false, reason: `許可ドメイン外: ${host}` }

    try {
      const robots = await checkRobotsAllowed(current, BOT_TOKEN, USER_AGENT)
      if (!robots.allowed) return { ok: false, reason: robots.reason ?? 'robots.txtで禁止' }
    } catch {
      /* robots.txt自体が取れないときは素通し（既存クローラと同方針） */
    }

    const overall = new AbortController()
    const overallTimer = setTimeout(() => overall.abort(), OVERALL_TIMEOUT_MS)
    const connCtrl = new AbortController()
    const connTimer = setTimeout(() => connCtrl.abort(), CONNECT_TIMEOUT_MS)
    try {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.any ? AbortSignal.any([overall.signal, connCtrl.signal]) : connCtrl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml,application/rss+xml,application/atom+xml,text/html,*/*' },
      })

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { ok: false, reason: 'Locationヘッダなしのリダイレクト' }
        let next: string
        try {
          next = new URL(loc, current).toString()
        } catch {
          return { ok: false, reason: `不正なLocation: ${loc}` }
        }
        if (hop === MAX_REDIRECTS) return { ok: false, reason: `リダイレクト回数上限（${MAX_REDIRECTS}）超過` }
        current = next
        continue
      }

      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }

      const reader = res.body?.getReader()
      let received = 0
      const chunks: Uint8Array[] = []
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            received += value.length
            chunks.push(value)
            if (received >= MAX_BYTES) {
              void reader.cancel()
              break
            }
          }
        }
      }
      const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8').slice(0, MAX_BYTES)
      return { ok: true, text, finalUrl: current }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    } finally {
      clearTimeout(overallTimer)
      clearTimeout(connTimer)
    }
  }
  return { ok: false, reason: 'リダイレクト処理に失敗' }
}

/** robots.txtの`Sitemap:`宣言行を読む（存在しなければ空配列。取得不能でも例外は投げない）。 */
async function readDeclaredSitemaps(origin: string, allowedHost: string): Promise<string[]> {
  const r = await safeFetchRawText(`${origin}/robots.txt`, allowedHost)
  if (!r.ok) return []
  const out: string[] = []
  const re = /^\s*sitemap:\s*(\S+)/gim
  let m: RegExpExecArray | null
  while ((m = re.exec(r.text)) !== null) {
    try {
      out.push(new URL(m[1], origin).toString())
    } catch {
      /* 不正なURLは無視 */
    }
  }
  return out
}

/** XML/RSS/Atomの生テキストから `<loc>`・`<link>`・`href=` のURLを抽出する（フルパーサーは使わない）。 */
function extractUrlsFromFeedBody(text: string): string[] {
  const urls = new Set<string>()
  const patterns = [
    /<loc>\s*([^<\s]+)\s*<\/loc>/gi, // sitemap
    /<link(?:\s+[^>]*href=["']([^"']+)["'][^>]*)?\s*\/?>([^<]*)<\/link>|<link\b[^>]*\bhref=["']([^"']+)["']/gi, // RSS <link>url</link> or Atom <link href="..."/>
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    let scanned = 0
    while ((m = re.exec(text)) !== null && scanned < MAX_URLS_SCANNED_PER_BODY) {
      scanned++
      const candidate = (m[1] ?? m[3] ?? '').trim() || (m[2] ?? '').trim()
      if (candidate && /^https?:\/\//i.test(candidate)) urls.add(candidate)
    }
  }
  // RSS <item><link>...</link></item>本体テキストが空でtitleに続く場合のフォールバック：
  // プレーンな https URL を素朴に拾う（sitemap indexの<loc>漏れ対策も兼ねる）。
  const bareRe = /https?:\/\/[^\s"'<>)]+/g
  let bm: RegExpExecArray | null
  let scanned2 = 0
  while ((bm = bareRe.exec(text)) !== null && scanned2 < MAX_URLS_SCANNED_PER_BODY) {
    scanned2++
    urls.add(bm[0])
  }
  return Array.from(urls)
}

/** RSS/Atomの<item>/<entry>ブロックから、そのURLに対応するタイトルらしき文字列を拾う（無ければ空）。 */
function guessTitleNear(text: string, url: string): string {
  const idx = text.indexOf(url)
  if (idx === -1) return ''
  const windowText = text.slice(Math.max(0, idx - 500), idx + 200)
  const m = windowText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return ''
  return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 200)
}

export interface DiscoverFeedCandidatesOptions {
  now?: Date
  maxCandidateLinks?: number
}

/**
 * 情報源1件分：robots.txt宣言サイトマップ＋定番パス（sitemap.xml/sitemap_index.xml/
 * feed等）を試し、見つかったURL（sitemap indexの場合は最大MAX_SUBSITEMAPS件だけ
 * 子サイトマップも1段展開）をキーワード優先度つきで返す。DB書き込み・AI呼び出しなし。
 */
export async function discoverFeedCandidates(sourceUrl: string, opts: DiscoverFeedCandidatesOptions = {}): Promise<FeedDiscoveryResult> {
  const result = emptyResult()
  let origin: string
  let allowedHost: string
  try {
    const u = new URL(sourceUrl)
    origin = u.origin
    allowedHost = registrableDomain(u.hostname)
  } catch {
    result.errors.push('sourceUrlの形式が不正')
    return result
  }

  const now = opts.now ?? new Date()
  const maxLinks = opts.maxCandidateLinks ?? MAX_CANDIDATE_LINKS
  const keywordSet = buildDiscoveryKeywordSet(now).map((w) => w.toLowerCase())

  const candidateSitemapUrls = new Set<string>()
  try {
    for (const s of await readDeclaredSitemaps(origin, allowedHost)) candidateSitemapUrls.add(s)
  } catch (e) {
    result.errors.push(`robots.txt sitemap宣言の取得に失敗: ${e instanceof Error ? e.message : String(e)}`)
  }
  for (const p of COMMON_SITEMAP_PATHS) candidateSitemapUrls.add(`${origin}${p}`)

  const foundUrls = new Map<string, { url: string; title: string }>()

  // --- サイトマップ（sitemap indexなら子サイトマップを最大MAX_SUBSITEMAPS件だけ1段展開） ---
  for (const smUrl of candidateSitemapUrls) {
    result.sitemapUrlsTried.push(smUrl)
    const r = await safeFetchRawText(smUrl, allowedHost)
    if (!r.ok) {
      result.errors.push(`${smUrl}: ${r.reason}`)
      continue
    }
    result.sitemapUrlsFetchedOk.push(smUrl)
    const urls = extractUrlsFromFeedBody(r.text)
    const subSitemaps = urls.filter((u) => /\.xml(\?|$)/i.test(u) && u !== smUrl)
    const directUrls = urls.filter((u) => !/\.xml(\?|$)/i.test(u))
    for (const u of directUrls) if (!foundUrls.has(u)) foundUrls.set(u, { url: u, title: '' })

    if (subSitemaps.length > 0) {
      // キーワードに近いサブサイトマップ名（news/product/shop等）を優先して展開する
      const prioritized = subSitemaps
        .map((u) => ({ u, score: keywordSet.some((k) => u.toLowerCase().includes(k)) ? 1 : 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SUBSITEMAPS)
        .map((x) => x.u)
      for (const sub of prioritized) {
        result.sitemapUrlsTried.push(sub)
        const subRes = await safeFetchRawText(sub, allowedHost)
        if (!subRes.ok) {
          result.errors.push(`${sub}: ${subRes.reason}`)
          continue
        }
        result.sitemapUrlsFetchedOk.push(sub)
        for (const u of extractUrlsFromFeedBody(subRes.text)) {
          if (!/\.xml(\?|$)/i.test(u) && !foundUrls.has(u)) foundUrls.set(u, { url: u, title: '' })
        }
      }
    }
  }

  // --- RSS/Atomフィード ---
  const candidateFeedUrls = COMMON_FEED_PATHS.map((p) => `${origin}${p}`)
  for (const feedUrl of candidateFeedUrls) {
    result.feedUrlsTried.push(feedUrl)
    const r = await safeFetchRawText(feedUrl, allowedHost)
    if (!r.ok) {
      result.errors.push(`${feedUrl}: ${r.reason}`)
      continue
    }
    result.feedUrlsFetchedOk.push(feedUrl)
    for (const u of extractUrlsFromFeedBody(r.text)) {
      if (foundUrls.has(u)) continue
      foundUrls.set(u, { url: u, title: guessTitleNear(r.text, u) })
    }
    // PDFリンクの検出（本文は取得・解析しない。存在の記録のみ）
    const pdfMatches = r.text.match(/https?:\/\/[^\s"'<>]+\.pdf/gi) ?? []
    for (const p of pdfMatches) if (!result.pdfLinksFound.includes(p)) result.pdfLinksFound.push(p)
  }

  // --- サイトマップ本文からもPDFリンクを拾う ---
  // （すでに読み込んだテキストは保持していないため、ここでは省略——フィード側で十分カバーできる設計とする）

  // --- 同一origin・HTML想定のみへ絞り込み、キーワード優先度でソートしてキャップ ---
  const scored: { link: DiscoveredLink; score: number }[] = []
  for (const { url, title } of foundUrls.values()) {
    const normalized = normalizeArticleUrl(url, origin)
    if (!normalized) continue
    let normalizedHost: string
    try {
      normalizedHost = new URL(normalized).hostname
    } catch {
      continue
    }
    if (!isAllowedHost(normalizedHost, [allowedHost])) continue
    if (isNonHtmlResourcePath(normalized)) continue
    const hay = `${normalized} ${title}`.toLowerCase()
    const score = keywordSet.reduce((acc, k) => acc + (hay.includes(k) ? 1 : 0), 0)
    scored.push({ link: { url: normalized, anchorText: title || '(sitemap/feed発見)' }, score })
  }
  scored.sort((a, b) => b.score - a.score)
  result.links = scored.slice(0, maxLinks).map((s) => s.link)

  return result
}
