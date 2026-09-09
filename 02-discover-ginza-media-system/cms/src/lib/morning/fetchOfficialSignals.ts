// GINZA WHISKERS / Project 02 P0 改善（2026-09-02 続き2）— 公式ページの決定的シグナル取得。
//
// 【安全設計（P0 ブロッカー1 対応で強化）】
//   ・取得対象は **SOURCE LEDGER 由来の許可ドメインのみ**（allowedHosts で明示）。
//     リダイレクト先も1ホップごとに許可ドメイン＋SSRF ガードで再検証する。
//   ・**SSRF 防止**：localhost / プライベート IP / リンクローカル / CGNAT / マルチキャスト /
//     予約帯 / `.local` `.internal` 等 / 認証情報つき URL / 非 80・443 ポート /
//     http・https 以外のスキーム（file:// ftp:// 等）を拒否。
//   ・Cookie・ログイン情報・トークンは送らない（`credentials` 既定、Authorization なし）。
//   ・robots.txt を尊重（`checkRobotsAllowed`。Disallow なら取得しない）。
//   ・接続タイムアウト＋全体タイムアウト＋本文サイズ上限＋最大リダイレクト数。
//   ・外部ページの本文中の命令・コード・プロンプトは**一切実行しない**
//     （eval / new Function / 動的 import を使わない。LLM にも渡さない）。
//   ・取得不能は「失敗」ではなく呼び出し側で **B 判定**。推測補完はしない。
//   ・過剰アクセス防止（同一 URL の再取得・同一ホストの本数上限）は呼び出し側で行う。

import { checkRobotsAllowed } from '../crawler/robotsTxt'
import type { OfficialPageSignals } from './types'

const DEFAULT_MAX_BYTES = 512 * 1024
const DEFAULT_CONNECT_TIMEOUT_MS = 8000
const DEFAULT_OVERALL_TIMEOUT_MS = 15000
const DEFAULT_MAX_REDIRECTS = 3
const BOT_TOKEN = 'GinzaWhiskersProject02MorningBot'
const USER_AGENT = 'GINZA-WHISKERS-Project02-morning/1.0 (+deterministic-signals; no-JS; respects robots.txt)'

function hostOf(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase()
  } catch {
    return null
  }
}
function hostnameOf(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase()
  } catch {
    return null
  }
}
function stripWww(h: string): string {
  return h.replace(/^www\./, '')
}

/** IPv4 リテラルか（"1.2.3.4"）。そうならオクテット配列を返す */
function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const o = m.slice(1).map(Number)
  if (o.some((n) => n < 0 || n > 255)) return null
  return o
}

/** プライベート/予約/内部帯の IPv4 か */
function isPrivateIpv4(o: number[]): boolean {
  const [a, b] = o
  if (a === 0 || a === 127) return true // this-host / loopback
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 169 && b === 254) return true // link-local
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 192 && b === 0 && o[2] === 0) return true // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true // benchmark
  if (a >= 224) return true // multicast(224-239) + reserved(240-255)
  return false
}

/** SSRF ガード：内部・非公開・危険なターゲットを拒否。理由文字列を返す（OK なら null） */
export function ssrfReject(rawUrl: string): string | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return 'URL として解釈できない'
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `許可されないスキーム: ${u.protocol}`
  if (u.username || u.password) return 'URL に認証情報が埋め込まれている'
  if (u.port && u.port !== '80' && u.port !== '443') return `非標準ポート: ${u.port}`

  const hn = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hn === 'localhost' || hn === 'localhost.localdomain') return 'localhost'
  if (/\.(local|internal|lan|home|corp|intranet)$/.test(hn)) return `内部ドメイン TLD: ${hn}`

  const v4 = parseIpv4(hn)
  if (v4) {
    if (isPrivateIpv4(v4)) return `プライベート/予約 IPv4: ${hn}`
    return null // 公開 IPv4 リテラルは許可ドメイン照合側で弾かれる想定
  }
  // IPv6 リテラル
  if (hn.includes(':')) {
    if (hn === '::1' || hn === '::' || hn === '0:0:0:0:0:0:0:1') return 'IPv6 loopback/unspecified'
    if (/^f[cd][0-9a-f]{2}:/.test(hn)) return 'IPv6 ULA (fc00::/7)'
    if (/^fe[89ab][0-9a-f]:/.test(hn)) return 'IPv6 link-local (fe80::/10)'
    const mapped = hn.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) {
      const mv4 = parseIpv4(mapped[1])
      if (mv4 && isPrivateIpv4(mv4)) return `IPv4-mapped プライベート: ${mapped[1]}`
    }
    return null
  }
  return null
}

// 2026-09-09: 会場住所補完のための「同一登録可能ドメイン（eTLD+1）」判定。
// 別ドメインの施設ページは参照しない、というユーザー確定制約を機械的に強制する。
const MULTI_LEVEL_TLDS = new Set([
  'co.jp', 'or.jp', 'ne.jp', 'go.jp', 'ac.jp', 'ad.jp', 'ed.jp', 'gr.jp', 'lg.jp',
  'com.au', 'net.au', 'org.au', 'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.cn', 'co.kr',
])
/** host → 登録可能ドメイン（eTLD+1）。判定できなければ末尾2ラベル。 */
export function registrableDomain(host: string): string {
  const h = stripWww(host.toLowerCase()).replace(/\.$/, '')
  const parts = h.split('.').filter(Boolean)
  if (parts.length <= 2) return h
  const last2 = parts.slice(-2).join('.')
  const last3 = parts.slice(-3).join('.')
  if (MULTI_LEVEL_TLDS.has(last2)) return parts.slice(-3).join('.')
  return last3.length && MULTI_LEVEL_TLDS.has(parts.slice(-2).join('.')) ? last3 : last2
}
/** 2つの URL/ホストが同じ登録可能ドメインか */
export function sameRegistrableDomain(a: string, b: string): boolean {
  const ha = hostnameOf(a) ?? a
  const hb = hostnameOf(b) ?? b
  return !!ha && !!hb && registrableDomain(ha) === registrableDomain(hb)
}

/** 施設・店舗・アクセスページらしいパス（会場住所の補完元候補） */
const VENUE_DETAIL_PATH_RE =
  /\/(?:shop|store|stores|tenant|tenants|floor|floors|access|guide|company\/access|information\/access|about\/access|map|guidemap|facility|facilities|shopguide|shop-guide|floorguide|floor-guide)(?:[/?#]|$)/i

/**
 * 本文 HTML から「同一登録可能ドメインの施設・店舗・アクセスページ」候補 URL を最大1件返す。
 * ・別の登録可能ドメインは返さない（ユーザー確定制約）。
 * ・記事 URL 自身・アンカーのみ・mailto/tel は除外。
 * ・複数候補があるときは「パスが短い＝より施設トップに近い」ものを優先（決定的）。
 * 推測ではなく、リンク要素の href をパターン一致で選ぶだけ。取れなければ null。
 */
export function pickVenueDetailUrl(html: string, baseUrl: string): string | null {
  const cands = new Set<string>()
  const re = /href=["']([^"'#\s]+)["']/gi
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(html)) !== null && guard < 400) {
    guard++
    const raw = m[1]
    if (/^(?:mailto:|tel:|javascript:)/i.test(raw)) continue
    let abs: string
    try {
      abs = new URL(raw, baseUrl).toString()
    } catch {
      continue
    }
    if (!/^https?:\/\//i.test(abs)) continue
    if (abs.replace(/#.*$/, '') === baseUrl.replace(/#.*$/, '')) continue
    if (!sameRegistrableDomain(abs, baseUrl)) continue
    let path = ''
    try {
      path = new URL(abs).pathname + new URL(abs).search
    } catch {
      continue
    }
    if (!VENUE_DETAIL_PATH_RE.test(path)) continue
    cands.add(abs.replace(/#.*$/, ''))
  }
  if (cands.size === 0) return null
  return [...cands].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
}

/** host が許可リストのいずれかと一致 or サブドメイン（www. は無視） */
export function isAllowedHost(host: string, allowedHosts: string[]): boolean {
  const h = stripWww(host.toLowerCase())
  return allowedHosts.some((a) => {
    const aa = stripWww(a.toLowerCase())
    return h === aa || h.endsWith('.' + aa)
  })
}

// ── HTML 決定的パース（実行はしない） ──
/** <script type="application/ld+json"> ... </script> を決定的に拾って JSON.parse するだけ。
 *  本文中のスクリプト・命令文は**実行しない**（eval/Function を使わない）。テストのため export。 */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(html)) !== null && guard < 20) {
    guard++
    const raw = m[1].trim()
    if (!raw) continue
    try {
      out.push(JSON.parse(raw))
    } catch {
      /* 壊れた JSON-LD は無視（解釈しない） */
    }
  }
  return out
}

export function firstEventDates(jsonLd: unknown[]): { start?: string; end?: string } {
  const visit = (node: unknown): { start?: string; end?: string } | null => {
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = visit(n)
        if (r) return r
      }
      return null
    }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>
      const t = o['@type']
      const isEvent =
        t === 'Event' ||
        (Array.isArray(t) && t.includes('Event')) ||
        (typeof t === 'string' && /Event$/.test(t))
      if (isEvent && (typeof o.startDate === 'string' || typeof o.endDate === 'string')) {
        return {
          start: typeof o.startDate === 'string' ? o.startDate : undefined,
          end: typeof o.endDate === 'string' ? o.endDate : undefined,
        }
      }
      if (Array.isArray(o['@graph'])) {
        const r = visit(o['@graph'])
        if (r) return r
      }
    }
    return null
  }
  return visit(jsonLd) ?? {}
}

function extractOgImage(html: string): string | undefined {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
  return m ? m[1] : undefined
}

/**
 * 本文テキストの抽出（2026-09-03）。スクリプト・スタイル・ナビ等を落として
 * タグを除去し、空白を畳んだプレーンテキストを返す（上限 12,000 文字）。
 * **HTML を実行・評価しない**（正規表現による除去のみ）。呼び出し側の
 * サイト別アダプタが、対象イベント名の近傍からのみ事実を取り出す。
 */
export function extractBodyText(html: string): string {
  let s = html
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
  s = s.replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
  s = s.replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
  s = s.replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  // ブロック境界は改行に（近傍判定の精度のため）
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|section|article|dd|dt|br)\s*>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  // HTML エンティティの最小限デコード
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '—')
  s = s.replace(/[ \t　]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
  return s.slice(0, 12_000)
}

export function extractPdfLinks(html: string, baseUrl: string, sameHost: string | null): string[] {
  const out = new Set<string>()
  const re = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(html)) !== null && guard < 30) {
    guard++
    try {
      const abs = new URL(m[1], baseUrl).toString()
      if (!sameHost || hostOf(abs) === sameHost) out.add(abs)
    } catch {
      /* skip */
    }
  }
  return [...out]
}

export interface FetchOfficialOptions {
  /** SOURCE LEDGER から導出した許可ホスト（必須。空だと全 URL を拒否） */
  allowedHosts: string[]
  connectTimeoutMs?: number
  overallTimeoutMs?: number
  maxRedirects?: number
  maxBytes?: number
  /**
   * true のとき、本文から同一登録可能ドメイン（eTLD+1）の施設・店舗・アクセスページを
   * 最大1件だけ追加取得し `venueDetail` に格納する（2026-09-09、会場住所補完用）。
   * 再帰は1段のみ（venueDetail のさらに venueDetail は取らない）。別ドメインは参照しない。
   */
  fetchVenueDetail?: boolean
  /** @internal 再帰の深さ（外部からは指定しない） */
  _depth?: number
}

/**
 * URL を1回 GET し、決定的シグナルだけを返す。**例外は投げない**——
 * 拒否・失敗はすべて OfficialPageSignals.error / rejectedReason に入れる。
 * 呼び出し側（morningRun）はこの結果で候補を B/C にするだけで、処理全体は止めない。
 */
export async function fetchOfficialSignals(
  url: string | null | undefined,
  opts: FetchOfficialOptions,
): Promise<OfficialPageSignals> {
  const now = () => new Date().toISOString()
  const allowed = Array.isArray(opts.allowedHosts) ? opts.allowedHosts : []
  const connectTimeout = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
  const overallTimeout = opts.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const startedAt = Date.now()

  if (!url || !/^https?:\/\/\S+$/.test(url)) {
    return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'bad_url', rejectedReason: 'URL 形式でない／空' }
  }

  // 0) 事前 SSRF ＋ 許可ドメイン検証
  const ssrf = ssrfReject(url)
  if (ssrf) return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'ssrf_blocked', rejectedReason: `SSRF ガード: ${ssrf}`, rejectedUrl: url }
  const host0 = hostnameOf(url) ?? ''
  if (allowed.length === 0)
    return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'not_allowed_host', rejectedReason: '許可ホストリストが空（取得しない）', rejectedUrl: url }
  if (!isAllowedHost(host0, allowed))
    return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'not_allowed_host', rejectedReason: `許可ドメイン外: ${host0}`, rejectedUrl: url }

  // 1) robots.txt を尊重
  let robotsAllowed = true
  let robotsReason: string | undefined
  try {
    const r = await checkRobotsAllowed(url, BOT_TOKEN, USER_AGENT)
    robotsAllowed = r.allowed
    robotsReason = r.reason
  } catch {
    robotsAllowed = true // robots.txt 自体が取れないときは素通し（既存クローラと同方針）
  }
  if (!robotsAllowed) {
    return {
      requested: true,
      ok: false,
      fetchedAt: now(),
      fetchOutcome: 'robots_denied',
      robotsChecked: true,
      robotsAllowed: false,
      rejectedReason: `robots.txt で Disallow${robotsReason ? `（${robotsReason}）` : ''}`,
      rejectedUrl: url,
    }
  }

  // 2) 手動リダイレクト（1ホップごとに SSRF ＋ 許可ドメイン再検証）
  const overall = new AbortController()
  const overallTimer = setTimeout(() => overall.abort(), overallTimeout)
  const redirectChain: string[] = [url]
  let current = url
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (Date.now() - startedAt > overallTimeout) {
        return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'timeout', robotsChecked: true, robotsAllowed: true, redirectChain, error: `全体タイムアウト（${overallTimeout}ms）` }
      }
      const connCtrl = new AbortController()
      const connTimer = setTimeout(() => connCtrl.abort(), connectTimeout)
      let res: Response
      try {
        res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.any ? AbortSignal.any([overall.signal, connCtrl.signal]) : connCtrl.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
          },
        })
      } finally {
        clearTimeout(connTimer)
      }

      // リダイレクト？
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'redirect_error', httpStatus: res.status, redirectChain, error: 'Location ヘッダなしのリダイレクト' }
        let nextUrl: string
        try {
          nextUrl = new URL(loc, current).toString()
        } catch {
          return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'redirect_error', httpStatus: res.status, redirectChain, error: `不正な Location: ${loc}` }
        }
        const nssrf = ssrfReject(nextUrl)
        if (nssrf) return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'ssrf_blocked', redirectChain: [...redirectChain, nextUrl], rejectedReason: `リダイレクト先 SSRF: ${nssrf}`, rejectedUrl: nextUrl }
        const nhost = hostnameOf(nextUrl) ?? ''
        if (!isAllowedHost(nhost, allowed))
          return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'not_allowed_host', redirectChain: [...redirectChain, nextUrl], rejectedReason: `リダイレクト先が許可ドメイン外: ${nhost}`, rejectedUrl: nextUrl }
        if (hop === maxRedirects)
          return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'redirect_error', redirectChain: [...redirectChain, nextUrl], error: `リダイレクト回数上限（${maxRedirects}）超過` }
        current = nextUrl
        redirectChain.push(nextUrl)
        continue
      }

      // 最終応答
      if (!res.ok) {
        return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'http_error', httpStatus: res.status, finalUrl: current, redirectChain, robotsChecked: true, robotsAllowed: true, sameHost: hostOf(current) === hostOf(url) }
      }

      // 本文を上限まで読む
      const reader = res.body?.getReader()
      let received = 0
      const chunks: Uint8Array[] = []
      if (reader) {
        for (;;) {
          if (Date.now() - startedAt > overallTimeout) {
            void reader.cancel()
            return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'timeout', httpStatus: res.status, finalUrl: current, redirectChain, error: `本文読み取り中に全体タイムアウト` }
          }
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            received += value.length
            chunks.push(value)
            if (received >= maxBytes) {
              void reader.cancel()
              break
            }
          }
        }
      }
      const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8').slice(0, maxBytes)
      const jsonLd = extractJsonLd(html)
      const ev = firstEventDates(jsonLd)

      // 会場住所補完：同一登録可能ドメインの施設・店舗・アクセスページを最大1件だけ追加取得。
      //   ・fetchVenueDetail=true かつ再帰1段目のときだけ。
      //   ・別ドメインは pickVenueDetailUrl が弾く。取得自体も同じ allowedHosts / SSRF / robots を通す
      //     （fetchOfficialSignals を再帰呼び出しするため）。取れなければ venueDetail は null。
      let venueDetail: OfficialPageSignals | null = null
      if (opts.fetchVenueDetail && (opts._depth ?? 0) < 1) {
        const vurl = pickVenueDetailUrl(html, current)
        if (vurl && vurl.replace(/#.*$/, '') !== current.replace(/#.*$/, '') && sameRegistrableDomain(vurl, current)) {
          try {
            venueDetail = await fetchOfficialSignals(vurl, {
              allowedHosts: allowed,
              connectTimeoutMs: connectTimeout,
              overallTimeoutMs: overallTimeout,
              maxRedirects,
              maxBytes,
              fetchVenueDetail: false,
              _depth: (opts._depth ?? 0) + 1,
            })
          } catch {
            venueDetail = null
          }
        }
      }

      return {
        requested: true,
        ok: true,
        fetchOutcome: 'ok',
        httpStatus: res.status,
        fetchedAt: now(),
        finalUrl: current,
        redirectChain,
        sameHost: hostOf(current) === hostOf(url),
        robotsChecked: true,
        robotsAllowed: true,
        jsonLd,
        jsonLdEventStart: ev.start,
        jsonLdEventEnd: ev.end,
        ogImage: extractOgImage(html),
        pdfLinks: extractPdfLinks(html, current, hostnameOf(current)),
        bodyText: extractBodyText(html),
        bytes: received,
        venueDetail,
      }
    }
    return { requested: true, ok: false, fetchedAt: now(), fetchOutcome: 'redirect_error', redirectChain, error: 'リダイレクトループ' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isAbort = /abort/i.test(msg)
    return {
      requested: true,
      ok: false,
      fetchedAt: now(),
      fetchOutcome: isAbort ? 'timeout' : 'http_error',
      redirectChain,
      error: isAbort ? `タイムアウト（connect ${connectTimeout}ms / overall ${overallTimeout}ms）` : msg,
    }
  } finally {
    clearTimeout(overallTimer)
  }
}
