import type { Payload } from 'payload'

import type { DiffStatus } from '../crawler/diff'

// SOURCE LEDGER 自動巡回 → 既存Sourcesコレクションへの接続（2026-08-17）。
//
// CLAUDE.md未決事項として残っていた「巡回結果からSourcesを自動生成するか」を、
// 次の設計で解消する：source-snapshots（cms/src/collections/SourceSnapshots.ts）の
// うち「取得成功」かつ「差分あり（changed）または初回取得（first_seen）」の
// Snapshotのみを対象に、editorialStatus:inboxのSourceを1件生成する。
// unchanged（変化なし）・fetch_error（取得失敗）は対象外——新しく人間が見るべき
// 内容が無いため。
//
// 生成されたSourceは既存の編集パイプライン（Sources.ts、Phase 14のevaluate-inbox等）に
// そのまま合流する。editorialStatus:inboxはSources.tsの既定値であり、AI評価
// （evaluateInboxSources）は`editorial.editorialStatus === 'inbox'`のSourceを対象に
// 動くため、この関数を実行するだけで既存のAI評価バッチが自動的にcrawl由来の候補も
// 拾うようになる（evaluateInboxSources側の変更は不要）。
//
// contentRef（Sources必須フィールド）には、evaluateSource.tsがcontentRefの文字列を
// そのままAIへの入力として使う設計（URLを渡すだけでは実際のページ内容をAIが読めない）
// を踏まえ、Snapshotのtitle・excerpt・出典URLを組み合わせたテキストを設定する。
//
// 冪等性：DBのunique制約ではなく、生成前に`crawlOrigin.sourceSnapshot`が既存の
// Sourceに存在するかを検索して判定する（1 Snapshot → 最大1 Source）。この処理は
// `./p2 crawl`から単一プロセス・順次実行されるバッチであり並行書き込みが無いため、
// 検索してから作成する方式でも安全（SocialPosts.dedupeKeyのようなDB unique制約は
// 不要と判断した）。

const CANDIDATE_DIFF_STATUSES = ['changed', 'first_seen'] as const

const MAX_CONTENT_REF_CHARS = 8000

export interface GenerateSourceCandidatesResult {
  persisted: boolean
  scannedSnapshots: number
  /** persisted:falseの場合は「実際に作成した数」ではなく「作成対象になったであろう数」 */
  createdCount: number
  created: Array<{
    sourceId: string | number | null
    snapshotId: string | number
    sourceLedgerSourceId: string
    sourceLedgerName: string
    diffStatus: string
  }>
  skipped: Array<{ snapshotId: string | number; sourceLedgerSourceId: string; reason: string }>
}

interface GenerateSourceCandidatesOptions {
  /** falseの場合、対象Snapshotの走査・重複判定は行うがSourceの新規作成は行わない（プレビュー用） */
  persist?: boolean
  /** 1回の呼び出しで走査するSnapshot件数の上限 */
  limit?: number
}

function buildContentRef(snapshot: {
  title?: unknown
  excerpt?: unknown
  url: unknown
}): string {
  const title = typeof snapshot.title === 'string' && snapshot.title.trim() ? snapshot.title.trim() : '(タイトル取得なし)'
  const excerpt = typeof snapshot.excerpt === 'string' ? snapshot.excerpt.trim() : ''
  const url = typeof snapshot.url === 'string' ? snapshot.url : ''

  const body = [title, excerpt, `(出典: ${url})`].filter(Boolean).join('\n\n')
  return body.length > MAX_CONTENT_REF_CHARS ? body.slice(0, MAX_CONTENT_REF_CHARS) : body
}

export async function generateSourceCandidatesFromSnapshots(
  payload: Payload,
  options: GenerateSourceCandidatesOptions = {},
): Promise<GenerateSourceCandidatesResult> {
  const persist = options.persist ?? true
  const limit = options.limit ?? 500

  const { docs: snapshots } = await payload.find({
    collection: 'source-snapshots',
    where: {
      and: [
        { success: { equals: true } },
        { diffStatus: { in: [...CANDIDATE_DIFF_STATUSES] } },
      ],
    },
    sort: '-fetchedAt',
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const created: GenerateSourceCandidatesResult['created'] = []
  const skipped: GenerateSourceCandidatesResult['skipped'] = []

  for (const snapshot of snapshots) {
    const sourceLedgerSourceId = String(snapshot.sourceId)
    const sourceLedgerName = String(snapshot.sourceName)
    const diffStatus = snapshot.diffStatus as DiffStatus

    const existing = await payload.find({
      collection: 'sources',
      where: { 'crawlOrigin.sourceSnapshot': { equals: snapshot.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      skipped.push({ snapshotId: snapshot.id, sourceLedgerSourceId, reason: '既にSourceを生成済み' })
      continue
    }

    if (!persist) {
      created.push({
        sourceId: null,
        snapshotId: snapshot.id,
        sourceLedgerSourceId,
        sourceLedgerName,
        diffStatus,
      })
      continue
    }

    const doc = await payload.create({
      collection: 'sources',
      overrideAccess: true,
      data: {
        type: 'url',
        contentRef: buildContentRef(snapshot),
        status: 'untouched',
        editorial: { editorialStatus: 'inbox' },
        crawlOrigin: {
          sourceSnapshot: snapshot.id,
          sourceLedger:
            typeof snapshot.sourceLedger === 'object' && snapshot.sourceLedger !== null
              ? Number((snapshot.sourceLedger as { id: string | number }).id)
              : Number(snapshot.sourceLedger),
          diffStatus,
        },
      },
    })

    created.push({
      sourceId: doc.id,
      snapshotId: snapshot.id,
      sourceLedgerSourceId,
      sourceLedgerName,
      diffStatus,
    })
  }

  return {
    persisted: persist,
    scannedSnapshots: snapshots.length,
    createdCount: created.length,
    created,
    skipped,
  }
}
