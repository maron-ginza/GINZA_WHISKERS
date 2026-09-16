// GINZA WHISKERS / Project 02（2026-09-16、マロン指示：既投稿・施設偏重の自動判定）
//
// 【大前提】マロンによる投稿済み設定・施設設定・手動台帳登録を一切前提にしない。
// Project 02内の既存データ（Articles・DiscoveredContent.curationStatus・
// .devlogs/night/queue の note-draft.json・.devlogs/morning/*/report.json という
// 過去の朝刊出力）だけから、①個別DC単位の「使用済み」判定と②施設単位の14日間
// クールダウン判定を自動的に導く（純粋関数・DB非依存・AIなし・外部APIなし）。
//
// 呼び出し元（morningRun.ts）が、上記の既存データソースをこのファイルの入力形式へ
// 変換して渡す（ファイルI/O・DBクエリはこのファイルでは行わない＝テスト容易性のため）。

import { resolveFacilityKey } from '../curation/facilityKey'

export interface FacilityActivityRecord {
  /** 実質的なグルーピングキー（parentFacilityKey があればそれ、無ければ facilityKey） */
  groupKey: string
  facilityKey: string
  facilityLabel: string
  /** ISO日時 */
  date: string
  source: 'article' | 'approved' | 'note-draft' | 'morning-selected'
  detail: string
  /**
   * 【2026-09-17追加・マロン指示：候補ボード注意表示用】source==='article' の
   * ときのみ設定される元記事ID（「前回の記事ID」の表示に使う。推測で埋めない
   * ——articleでない活動〈approved/note-draft/morning-selected〉は undefined のまま）。
   */
  articleId?: number
}

export interface RawArticleActivity {
  articleId: number
  /** editorialProvenance の sourceUrl／会場ヒントのいずれか（施設解決に使う） */
  sourceUrl: string | null
  venueHint: string | null
  /** Article作成日時等、この活動の基準日時 */
  date: string | null
}

export interface RawApprovedActivity {
  discoveredContentId: number
  venue: string | null
  sourceName: string | null
  sourceUrl: string | null
  /** 承認日時（DiscoveredContent.decisionAt） */
  decisionAt: string | null
}

export interface RawNoteDraftActivity {
  path: string
  venue: string | null
  sourceUrl: string | null
  /** note-draft.json のフォルダ日付等から推定した基準日時 */
  date: string | null
}

export interface RawPastMorningActivity {
  discoveredContentId: number
  sourceName: string | null
  sourceUrl: string | null
  venue: string | null
  /** その朝刊レポートの generatedAt */
  generatedAt: string
}

function toRecord(
  input: { venue: string | null; sourceName?: string | null; sourceUrl: string | null },
  date: string | null,
  source: FacilityActivityRecord['source'],
  detail: string,
  articleId?: number,
): FacilityActivityRecord | null {
  if (!date) return null
  const f = resolveFacilityKey({ venue: input.venue, sourceName: input.sourceName ?? null, sourceUrl: input.sourceUrl })
  if (!f.key) return null
  return {
    groupKey: f.parentFacilityKey ?? f.key,
    facilityKey: f.key,
    facilityLabel: f.store || f.area || f.key,
    date,
    source,
    detail,
    ...(articleId != null ? { articleId } : {}),
  }
}

export function buildFacilityActivityFromArticles(rows: RawArticleActivity[]): FacilityActivityRecord[] {
  const out: FacilityActivityRecord[] = []
  for (const r of rows) {
    const rec = toRecord(
      { venue: r.venueHint, sourceUrl: r.sourceUrl },
      r.date,
      'article',
      `Article #${r.articleId} 作成`,
      r.articleId,
    )
    if (rec) out.push(rec)
  }
  return out
}

export function buildFacilityActivityFromApproved(rows: RawApprovedActivity[]): FacilityActivityRecord[] {
  const out: FacilityActivityRecord[] = []
  for (const r of rows) {
    const rec = toRecord(
      { venue: r.venue, sourceName: r.sourceName, sourceUrl: r.sourceUrl },
      r.decisionAt,
      'approved',
      `DC #${r.discoveredContentId} 承認`,
    )
    if (rec) out.push(rec)
  }
  return out
}

export function buildFacilityActivityFromNoteDrafts(rows: RawNoteDraftActivity[]): FacilityActivityRecord[] {
  const out: FacilityActivityRecord[] = []
  for (const r of rows) {
    const rec = toRecord({ venue: r.venue, sourceUrl: r.sourceUrl }, r.date, 'note-draft', `note下書き生成（${r.path}）`)
    if (rec) out.push(rec)
  }
  return out
}

export function buildFacilityActivityFromPastMorning(rows: RawPastMorningActivity[]): FacilityActivityRecord[] {
  const out: FacilityActivityRecord[] = []
  for (const r of rows) {
    const rec = toRecord(
      { venue: r.venue, sourceName: r.sourceName, sourceUrl: r.sourceUrl },
      r.generatedAt,
      'morning-selected',
      `DC #${r.discoveredContentId} 朝刊選定`,
    )
    if (rec) out.push(rec)
  }
  return out
}

export interface FacilityCooldownResult {
  onCooldown: boolean
  reason: string
  matched?: FacilityActivityRecord
  /**
   * 【2026-09-16続き3追加】一致が facilityKey の完全一致によるものか（'facility'）、
   * parentFacilityKey（グルーピングキー）のみの一致か（'parent'）。呼び出し元
   * （assessCandidate）が B判定の理由タグ（facilityCooldown／parentFacilityCooldown）を
   * 決めるために使う。
   */
  matchType?: 'facility' | 'parent'
}

/**
 * 施設単位の14日間抑制（2026-09-16追加、続き3でA/B/C判定本体へ統合）。facilityKey／
 * parentFacilityKey いずれかのグルーピングキーが一致する活動が windowDays 以内に
 * あれば onCooldown:true。候補自体は除外しない——呼び出し元（assessCandidate）が
 * このクールダウン中はAにせずB判定にする（理由タグつき）。施設クールダウン終了後、
 * 情報が引き続き有効なら次回の再判定でAに戻る（削除・恒久ブロックはしない）。
 */
export function checkFacilityCooldown(
  facilityKey: string | null,
  parentFacilityKey: string | null,
  history: FacilityActivityRecord[],
  now: Date,
  windowDays = 14,
): FacilityCooldownResult {
  const groupKey = parentFacilityKey ?? facilityKey
  if (!groupKey) return { onCooldown: false, reason: '施設キーを確認できないため判定対象外' }
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  let best: FacilityActivityRecord | null = null
  for (const h of history) {
    if (h.groupKey !== groupKey) continue
    const t = Date.parse(h.date)
    if (Number.isNaN(t) || t < cutoff || t > now.getTime()) continue
    if (!best || t > Date.parse(best.date)) best = h
  }
  if (best) {
    const matchType: 'facility' | 'parent' = facilityKey && best.facilityKey === facilityKey ? 'facility' : 'parent'
    return {
      onCooldown: true,
      reason: `過去${windowDays}日以内に同一施設（${best.facilityLabel}）で${best.detail}（${best.date.slice(0, 10)}）`,
      matched: best,
      matchType,
    }
  }
  return { onCooldown: false, reason: `過去${windowDays}日以内の同一施設の活動なし` }
}

export interface AlreadyProcessedResult {
  isProcessed: boolean
  reason: string
}

/**
 * 個別DC単位の使用済み判定（2026-09-16追加）。時間窓なし——一度使用済みになった
 * DCは恒久的に「新規候補」から除外する（施設単位の14日間クールダウンとは異なる）。
 * 「Articleが作成済み」「note-draft.json生成済み」は既存の dedupCheck.duplicate が
 * 別途カバーするため、ここでは「過去の朝刊レポートで既に候補として提示済みか」のみを
 * 判定する（重複判定の責務を分離）。
 */
export function checkAlreadyProcessedByPastMorning(dcId: number, pastMorningDcIds: ReadonlySet<number>): AlreadyProcessedResult {
  if (pastMorningDcIds.has(dcId)) {
    return { isProcessed: true, reason: '過去の朝刊レポートで既に候補として提示済み（.devlogs/morning/*/report.json）' }
  }
  return { isProcessed: false, reason: '過去の朝刊レポートに記録なし' }
}
