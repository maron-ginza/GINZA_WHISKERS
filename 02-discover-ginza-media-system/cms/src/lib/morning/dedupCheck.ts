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
  venueHints: string[]
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
    | 'article-similar-title'
    | 'article-same-event'
    | 'note-record-dc'
    | 'note-record-same-source-url'
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
    if (ts >= th) signals.push({ type: 'article-similar-title', strong: false, detail: `Article #${a.id}「${a.title ?? ''}」と類似（${ts.toFixed(2)}）` })
    if (a.eventDates.some((d) => sameDay(d, dc.eventStartAt)) && a.venueHints.some((v) => venueOverlap(v, dc.venue)))
      signals.push({ type: 'article-same-event', strong: false, detail: `Article #${a.id} と開催日・会場が一致` })
  }

  for (const n of noteRecords) {
    if (n.discoveredContentId != null && n.discoveredContentId === dc.id)
      signals.push({ type: 'note-record-dc', strong: true, detail: `${n.kind}（${n.path}${n.published ? ' / published' : ''}）が DC #${dc.id} を参照` })
    if (dcUrl && n.sourceUrls.some((u) => normUrl(u) === dcUrl))
      signals.push({ type: 'note-record-same-source-url', strong: true, detail: `${n.kind}（${n.path}）が同一 sourceUrl` })
    const ts = titleSimilarity(dc.title, n.title)
    if (ts >= th) signals.push({ type: 'note-record-similar-title', strong: false, detail: `${n.kind}（${n.path}）「${n.title ?? ''}」と類似（${ts.toFixed(2)}）` })
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
