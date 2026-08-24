// SOURCE LEDGER 自動巡回：robots.txt準拠チェック（2026-08-16、取得品質改善）。
//
// サイト固有のルールをハードコードせず、各情報源のorigin配下の`/robots.txt`を
// 実際に取得・パースして、対象パスがDisallowされていないかを汎用的に判定する。
// パーサーはUser-agentグループの選択（自ボットトークンに一致するグループを優先、
// なければ`*`）、Disallow/Allowの最長プレフィックス一致、のみをサポートする
// 簡略実装（`*`/`$`によるワイルドカードパターンは非対応の既知の制約）。

export interface RobotsCheckResult {
  allowed: boolean
  reason?: string
}

const ROBOTS_FETCH_TIMEOUT_MS = 8_000

interface ParsedRules {
  disallow: string[]
  allow: string[]
}

function parseRobotsGroups(text: string): Map<string, ParsedRules> {
  const groups = new Map<string, ParsedRules>()
  let pendingAgents: string[] = []
  let sawDirectiveSincePendingAgents = false

  const ensureGroup = (agent: string): ParsedRules => {
    const key = agent.toLowerCase()
    let g = groups.get(key)
    if (!g) {
      g = { disallow: [], allow: [] }
      groups.set(key, g)
    }
    return g
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'user-agent') {
      // 直前が非user-agent行（=グループ確定済み）なら新グループの開始とみなす。
      // 連続するuser-agent行は同一グループ（複数エージェントへの同一ルール適用）。
      if (sawDirectiveSincePendingAgents) {
        pendingAgents = []
        sawDirectiveSincePendingAgents = false
      }
      pendingAgents.push(value)
      ensureGroup(value)
      continue
    }

    if (field === 'disallow' || field === 'allow') {
      sawDirectiveSincePendingAgents = true
      if (!value) continue // 空値の Disallow: は「全許可」を意味するため、ルール追加不要
      for (const agent of pendingAgents) {
        const g = ensureGroup(agent)
        ;(field === 'disallow' ? g.disallow : g.allow).push(value)
      }
    }
    // crawl-delay/sitemap等は本チェックの対象外（無視）
  }

  return groups
}

function selectApplicableRules(groups: Map<string, ParsedRules>, botToken: string): ParsedRules | null {
  const lowerToken = botToken.toLowerCase()
  let best: { agent: string; rules: ParsedRules } | null = null

  for (const [agent, rules] of groups) {
    if (agent === '*') continue
    if (lowerToken.includes(agent) || agent.includes(lowerToken)) {
      if (!best || agent.length > best.agent.length) {
        best = { agent, rules }
      }
    }
  }

  if (best) return best.rules
  return groups.get('*') ?? null
}

function isPathDisallowed(pathAndQuery: string, rules: ParsedRules): boolean {
  let matchedLength = -1
  let matchedType: 'allow' | 'disallow' | null = null

  for (const pattern of rules.disallow) {
    if (pathAndQuery.startsWith(pattern) && pattern.length > matchedLength) {
      matchedLength = pattern.length
      matchedType = 'disallow'
    }
  }
  for (const pattern of rules.allow) {
    if (pathAndQuery.startsWith(pattern) && pattern.length > matchedLength) {
      matchedLength = pattern.length
      matchedType = 'allow'
    }
  }

  return matchedType === 'disallow'
}

/**
 * @param targetUrl 実際に取得しようとしているURL
 * @param botToken robots.txtのUser-agentグループ選択に使う自ボットの識別トークン
 *   （User-Agentヘッダ全体ではなく、ボット名部分のみ。例：'GinzaWhiskersDiscoverGinzaBot'）
 */
export async function checkRobotsAllowed(
  targetUrl: string,
  botToken: string,
  requestUserAgent: string,
): Promise<RobotsCheckResult> {
  let origin: string
  let pathAndQuery: string
  try {
    const u = new URL(targetUrl)
    origin = u.origin
    pathAndQuery = u.pathname + u.search
  } catch {
    return { allowed: true }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ROBOTS_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`${origin}/robots.txt`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': requestUserAgent },
    })

    // 200以外（404/403/リダイレクト先が別内容 等）は「robots.txtから確実な禁止
    // ルールを読み取れない」ケースとして素通し（allow）にする。多くのサイトで
    // robots.txt自体がCDN/WAFの一般的なアクセス制御の対象になっており、これを
    // disallowと誤認すると本来アクセス可能なコンテンツまで一律スキップして
    // しまうため（RFC 9309の厳密な5xx=一時的全面禁止までは実装しない、v1の
    // 意図的な簡略化）。
    if (res.status !== 200) {
      return { allowed: true }
    }

    const contentType = res.headers.get('content-type') || ''
    if (contentType && !/^text\//i.test(contentType)) {
      return { allowed: true }
    }

    const text = await res.text()
    const groups = parseRobotsGroups(text)
    const rules = selectApplicableRules(groups, botToken)
    if (!rules) return { allowed: true }

    if (isPathDisallowed(pathAndQuery, rules)) {
      return {
        allowed: false,
        reason: `robots.txtにより ${pathAndQuery} へのアクセスが禁止されています（実際のHTTPリクエストは送信していません）`,
      }
    }

    return { allowed: true }
  } catch {
    // タイムアウト・ネットワークエラー時も素通し（上記と同じ理由）
    return { allowed: true }
  } finally {
    clearTimeout(timeoutId)
  }
}
