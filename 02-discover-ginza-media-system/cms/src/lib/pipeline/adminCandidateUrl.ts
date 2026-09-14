// GINZA WHISKERS / Project 02（2026-09-04、候補確認URLの配列クエリ修正）
//
// Payload 3 の管理画面 List View は URL の `where` パラメータを qs-esm で復元する。
// `id` の "is in" 条件は **配列**（インデックス付き）で渡す必要がある——
// カンマ区切りの1文字列（`[id][in]=1,2,3`）では ID 欄が空欄のまま復元される。
//
// 正しい形（Payload admin が自ら生成するのと同じ or > and 構造）:
//   ?where[or][0][and][0][id][in][0]=334
//   &where[or][0][and][0][id][in][1]=367
//   &...（ID の数だけ）
//   &where[or][0][and][1][curationStatus][equals]=inbox
//   &limit=10
//
// 角括弧は Payload 実 URL に合わせて生（未エンコード）で出す。値のみ encode する。

export interface AdminCandidateReviewUrlOptions {
  /** 例 http://localhost:3000（末尾スラッシュは除去） */
  baseUrl?: string
  collectionSlug?: string
  dcIds: number[]
  /** 例 'inbox'。空なら status 条件を付けない */
  curationStatus?: string
  /** 一覧の表示件数。既定は dcIds 件数（最低10） */
  limit?: number
}

export function buildAdminCandidateReviewUrl(opts: AdminCandidateReviewUrlOptions): string {
  const base = (opts.baseUrl || 'http://localhost:3000').replace(/\/+$/, '')
  const slug = opts.collectionSlug || 'discovered-content'
  // 重複除去しつつ順序は保持
  const ids = [...new Set(opts.dcIds.map((n) => Number(n)).filter((n) => Number.isFinite(n)))]

  const parts: string[] = []
  ids.forEach((id, i) => {
    parts.push(`where[or][0][and][0][id][in][${i}]=${encodeURIComponent(String(id))}`)
  })
  if (opts.curationStatus) {
    parts.push(`where[or][0][and][1][curationStatus][equals]=${encodeURIComponent(opts.curationStatus)}`)
  }
  parts.push(`limit=${opts.limit ?? Math.max(ids.length, 10)}`)

  return `${base}/admin/collections/${slug}?${parts.join('&')}`
}

/**
 * URL の `where` パラメータを（qs-esm 互換で）パースして {ids, curationStatus, limit} を返す。
 * 回帰テストで「Payload が復元する形になっているか」を検証するために使う。
 * qs-esm は依存に含まれるためテスト側から読み込む（この関数はビルダーの逆変換の最小版）。
 */
export function parseAdminCandidateReviewUrl(url: string): {
  collectionSlug: string
  ids: number[]
  curationStatus: string | null
  limit: number | null
  raw: Record<string, unknown>
} {
  const u = new URL(url)
  const slug = u.pathname.split('/').filter(Boolean).pop() ?? ''
  const q = u.search.replace(/^\?/, '')
  // 手書きの最小 qs パーサ（bracket 記法・配列インデックス対応）。テスト用途。
  const root: Record<string, unknown> = {}
  for (const pair of q.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const rawVal = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1))
    const segs: string[] = []
    const m = rawKey.match(/^[^[\]]+/)
    if (m) segs.push(m[0])
    for (const b of rawKey.slice(m ? m[0].length : 0).matchAll(/\[([^\]]*)\]/g)) segs.push(b[1])
    let node: Record<string, unknown> | unknown[] = root
    for (let i = 0; i < segs.length; i++) {
      const key = segs[i]
      const last = i === segs.length - 1
      if (last) {
        if (Array.isArray(node)) (node as unknown[])[Number(key)] = rawVal
        else (node as Record<string, unknown>)[key] = rawVal
      } else {
        const nextIsIndex = /^\d+$/.test(segs[i + 1])
        let child = Array.isArray(node) ? (node as unknown[])[Number(key)] : (node as Record<string, unknown>)[key]
        if (child == null) {
          child = nextIsIndex ? [] : {}
          if (Array.isArray(node)) (node as unknown[])[Number(key)] = child
          else (node as Record<string, unknown>)[key] = child
        }
        node = child as Record<string, unknown> | unknown[]
      }
    }
  }
  const where = root.where as
    | { or?: Array<{ and?: Array<Record<string, { in?: unknown[]; equals?: unknown }>> }> }
    | undefined
  const and = where?.or?.[0]?.and ?? []
  const idIn = (and.find((c) => c && 'id' in c)?.id?.in ?? []) as unknown[]
  const status = (and.find((c) => c && 'curationStatus' in c)?.curationStatus?.equals ?? null) as string | null
  return {
    collectionSlug: slug,
    ids: idIn.map((x) => Number(x)).filter((n) => Number.isFinite(n)),
    curationStatus: status,
    limit: root.limit != null ? Number(root.limit) : null,
    raw: root,
  }
}
