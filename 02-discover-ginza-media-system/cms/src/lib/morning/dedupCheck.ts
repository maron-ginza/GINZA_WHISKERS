// GINZA WHISKERS / Project 02 P0 改善（2026-09-02 続き2）— 重複判定（純粋関数・多シグナル）。
//
// 【P0 ブロッカー3】次をすべて突き合わせて重複を判定する：
//   Articles / DiscoveredContent / .devlogs/night/queue の note-draft.json・note-body.txt /
//   システム内で確認可能な published 記録 / 同一 sourceUrl / 正規化 URL /
//   同一イベント名 / 類似タイトル / 同一開催日・会場。
//
// **外部 note アカウントの自動巡回や Chrome・ログイン情報の使用はしない**（ローカル記録のみ）。
// システム外で公開された記事を完全には確認できないため、結果には常に
// `externalPublicationUnverified: true` を立て、8:00 の人間選定を最終ゲートとする。

import { toTokyoDateString } from '../util/businessDate'

export interface DedupDcInput {
  id: number
  articleUrl: string | null
  title: string | null
  eventStartAt: string | null
  venue: string | null
}

export interface DedupArticleRecord {
  id: number
  title: string | null
  /** editorialProvenance[].discoveredContentSource（DC 数値 ID） */
  provenanceDcIds: number[]
  /** editorialProvenance[].sourceUrl */
  provenanceSourceUrls: string[]
  eventDates: string[] // 参考：本文や provenance から取れた開催日（あれば）
  /** editorialProvenance[].fact のうち factType==='venue' のものから抽出した会場・ブランド記述（2026-09-15追加） */
  venueHints: string[]
  /**
   * 直近性の基準日時（2026-09-15追加・近似重複ルール用）。publishHistory の note
   * 公開日があればそれを優先、無ければ updatedAt/createdAt。取得できなければ null。
   * 任意項目（既存の呼び出し元を壊さないため）——未設定は
   * checkRecentBrandVenueDuplicate 側で「対象外」として扱う。
   */
  recentDate?: string | null
  /** 【2026-09-16追加】Article.createdAt。施設単位の14日間クールダウン判定に使う。 */
  createdAt?: string | null
}

export interface DedupNoteRecord {
  /** ファイルパス（.devlogs 相対） */
  path: string
  kind: 'note-draft' | 'note-body'
  discoveredContentId: number | null
  title: string | null
  sourceUrls: string[]
  eventDate: string | null
  venue: string | null
  published: boolean
}

export interface DedupSignal {
  type:
    | 'article-provenance-dc'
    | 'article-same-source-url'
    | 'article-exact-title'
    | 'article-similar-title'
    | 'article-same-event'
    | 'note-record-dc'
    | 'note-record-same-source-url'
    | 'note-record-exact-title'
    | 'note-record-similar-title'
    | 'note-record-same-event'
  strong: boolean
  detail: string
}

export interface DedupResult {
  duplicate: boolean
  /** 弱いシグナル（類似タイトルのみ 等）だけがある＝人間確認向け */
  possibleDuplicate: boolean
  signals: DedupSignal[]
  existingArticleId?: number
  /** 常に true：外部 note で公開済みかはシステムからは確認できない */
  externalPublicationUnverified: true
  externalNote: string
}

// ── URL 正規化（crawler/normalizeUrl と同方針の軽量版：ホスト小文字・www除去・
//    末尾スラッシュ除去・クエリ/フラグメント除去） ──
export function normUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== 'string') return null
  try {
    const url = new URL(u.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = ''
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1)
    return url.toString()
  } catch {
    return null
  }
}

/** タイトル正規化＋文字バイグラム Jaccard */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const norm = (x: string): string =>
    x
      .toLowerCase()
      .replace(/[\s　]+/g, '')
      .replace(/[【】\[\]（）()「」『』｜|・,、。.!！?？：:;；\-—–~〜"'"']/g, '')
  const A = a ? norm(a) : ''
  const B = b ? norm(b) : ''
  if (!A || !B) return 0
  if (A === B) return 1
  const bg = (x: string): Set<string> => {
    const s = new Set<string>()
    for (let i = 0; i < x.length - 1; i++) s.add(x.slice(i, i + 2))
    if (x.length === 1) s.add(x)
    return s
  }
  const sa = bg(A)
  const sb = bg(B)
  let inter = 0
  for (const g of sa) if (sb.has(g)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return toTokyoDateString(da) === toTokyoDateString(db)
}

function venueOverlap(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const toks = (x: string): string[] => x.replace(/[\s　]+/g, '').match(/.{2,}/g)?.slice(0, 1) ?? [x]
  // 2文字以上の連結一致でざっくり（ビル名・ホール名の部分一致）
  const na = a.replace(/[\s　]+/g, '')
  const nb = b.replace(/[\s　]+/g, '')
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na) || toks(na).some((tkn) => nb.includes(tkn))
}

export interface DedupOptions {
  titleThreshold?: number // 既定 0.72
}

export function dedupCheck(
  dc: DedupDcInput,
  articles: DedupArticleRecord[],
  noteRecords: DedupNoteRecord[],
  opts: DedupOptions = {},
): DedupResult {
  const th = opts.titleThreshold ?? 0.72
  const dcUrl = normUrl(dc.articleUrl)
  const signals: DedupSignal[] = []
  let existingArticleId: number | undefined

  for (const a of articles) {
    if (a.provenanceDcIds.includes(dc.id)) {
      signals.push({ type: 'article-provenance-dc', strong: true, detail: `Article #${a.id} が editorialProvenance で DC #${dc.id} を参照` })
      existingArticleId ??= a.id
    }
    if (dcUrl && a.provenanceSourceUrls.some((u) => normUrl(u) === dcUrl)) {
      signals.push({ type: 'article-same-source-url', strong: true, detail: `Article #${a.id} が同一 sourceUrl（${dcUrl}）を参照` })
      existingArticleId ??= a.id
    }
    const ts = titleSimilarity(dc.title, a.title)
    // 2026-09-15追加（マロン指示・近似重複対策ルール1）：正規化後に完全一致（ts===1）は
    // 「タイトルが一致」＝強シグナルとして単独で duplicate にする。1未満は従来どおり
    // 類似タイトルの弱シグナル（同一開催日・会場との組み合わせでのみ duplicate）のまま。
    if (ts === 1) signals.push({ type: 'article-exact-title', strong: true, detail: `Article #${a.id}「${a.title ?? ''}」とタイトルが一致` })
    else if (ts >= th) signals.push({ type: 'article-similar-title', strong: false, detail: `Article #${a.id}「${a.title ?? ''}」と類似（${ts.toFixed(2)}）` })
    if (a.eventDates.some((d) => sameDay(d, dc.eventStartAt)) && a.venueHints.some((v) => venueOverlap(v, dc.venue)))
      signals.push({ type: 'article-same-event', strong: false, detail: `Article #${a.id} と開催日・会場が一致` })
  }

  for (const n of noteRecords) {
    if (n.discoveredContentId != null && n.discoveredContentId === dc.id)
      signals.push({ type: 'note-record-dc', strong: true, detail: `${n.kind}（${n.path}${n.published ? ' / published' : ''}）が DC #${dc.id} を参照` })
    if (dcUrl && n.sourceUrls.some((u) => normUrl(u) === dcUrl))
      signals.push({ type: 'note-record-same-source-url', strong: true, detail: `${n.kind}（${n.path}）が同一 sourceUrl` })
    const ts = titleSimilarity(dc.title, n.title)
    if (ts === 1) signals.push({ type: 'note-record-exact-title', strong: true, detail: `${n.kind}（${n.path}）「${n.title ?? ''}」とタイトルが一致` })
    else if (ts >= th) signals.push({ type: 'note-record-similar-title', strong: false, detail: `${n.kind}（${n.path}）「${n.title ?? ''}」と類似（${ts.toFixed(2)}）` })
    if (sameDay(n.eventDate, dc.eventStartAt) && venueOverlap(n.venue, dc.venue))
      signals.push({ type: 'note-record-same-event', strong: false, detail: `${n.kind}（${n.path}）と開催日・会場が一致` })
  }

  const strongHit = signals.some((s) => s.strong)
  // 弱いシグナルは「類似タイトル」と「同一開催日・会場」が両方揃えば重複扱い
  const weakBothTitleAndEvent =
    signals.some((s) => s.type.endsWith('similar-title')) && signals.some((s) => s.type.endsWith('same-event'))
  const duplicate = strongHit || weakBothTitleAndEvent
  const possibleDuplicate = !duplicate && signals.length > 0

  return {
    duplicate,
    possibleDuplicate,
    signals,
    existingArticleId,
    externalPublicationUnverified: true,
    externalNote: '外部公開記録は未確認・マロン最終確認（システムは外部 note アカウントを巡回しない。8:00 の人間選定が最終ゲート）',
  }
}

// ─────────────────────────────────────────────────────────────
// 近似重複ルール2（2026-09-15追加・マロン指示）：
// 「除外（C）」ではなく「Aへ昇格させずBのまま保留」の判定に使う、既投稿の
// duplicate/possibleDuplicateとは独立した別シグナル。
//
//   直近14日以内に「同一ブランド＋同一会場」の記事が既にある場合、Aへは昇格させない。
//
// 実例（2026-09-15）：DC#246「花西子 FLORASIS GINZA」のファンデーション記事が、
// 2026-09-08 公開済みの同ブランド・同会場（GINZA SIX）のチーク記事と、
// URL・タイトルはどちらも一致しないため dedupCheck の duplicate 判定はすり抜けたが、
// 編集上は近似重複だった。ArticleFacts.venues（name+place）から会場・ブランド識別子を
// 決定的に作り、Article.editorialProvenance の factType==='venue' な事実から
// 同じ識別子を持つ既存記事を探す（推測しない・厳密一致のみ）。
// ─────────────────────────────────────────────────────────────

/**
 * 会場・ブランド識別子を正規化する。「会場：」等の接頭辞・空白差を吸収するだけで、
 * 意味的な推測（別名の統合等）はしない——厳密一致のみを目的とする。
 */
export function normalizeVenueKey(...parts: (string | null | undefined)[]): string | null {
  const joined = parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(' ')
    .replace(/^会場[：:]\s*/, '')
    .replace(/[\s　]+/g, '')
    .trim()
  return joined.length > 0 ? joined : null
}

export interface RecentBrandVenueDuplicateResult {
  isDuplicate: boolean
  matchedArticleId?: number
  matchedVenueKey?: string
  windowDays: number
  reason: string
}

/**
 * 直近 windowDays（既定14日）以内に、同一の会場・ブランド識別子（normalizeVenueKey）を
 * 持つ Article が既にあるかを判定する。あれば isDuplicate:true——呼び出し側
 * （assessCandidate）はこれを「Aへ昇格させずBのまま保留」の根拠として使う
 * （既存の dedupCheck の duplicate/C判定とは別軸。除外はしない）。
 */
export function checkRecentBrandVenueDuplicate(
  candidateVenueKey: string | null,
  articles: DedupArticleRecord[],
  now: Date,
  windowDays = 14,
): RecentBrandVenueDuplicateResult {
  if (!candidateVenueKey) {
    return { isDuplicate: false, windowDays, reason: '会場・ブランド識別子が確認できないため判定対象外' }
  }
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  for (const a of articles) {
    const d = a.recentDate ? Date.parse(a.recentDate) : NaN
    if (Number.isNaN(d) || d < cutoff || d > now.getTime()) continue
    if (a.venueHints.some((v) => v === candidateVenueKey)) {
      return {
        isDuplicate: true,
        matchedArticleId: a.id,
        matchedVenueKey: candidateVenueKey,
        windowDays,
        reason: `直近${windowDays}日以内に同一ブランド・同一会場（${candidateVenueKey}）の記事 Article #${a.id} が既にあるため`,
      }
    }
  }
  return { isDuplicate: false, windowDays, reason: `直近${windowDays}日以内に同一ブランド・同一会場の記事なし` }
}
