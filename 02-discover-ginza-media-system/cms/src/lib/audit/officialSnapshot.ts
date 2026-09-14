// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン step 2）
//
// 公式ページ本文のスナップショットを official-snapshots へ **追記型** で保存する。
//   ・contentHash（正規化済み本文の SHA-256 先頭16バイト）で重複保存しない
//   ・既存 ArticleFacts / DiscoveredContent との関連を保持
//   ・生 HTML は保存しない（呼び出し側が渡すのはタグ除去済み本文）
//   ・AI 呼び出しなし。DB 書き込みは create のみ（update しない）。

import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

const RAW_SNAPSHOT_MAX = 20_000

/** 正規化：改行・連続空白を1つに、前後トリム（hash の安定化） */
export function normalizeSnapshotText(text: string): string {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 正規化済み本文の SHA-256（先頭16バイトを hex＝32文字）。同一内容の重複排除キー。 */
export function computeContentHash(text: string): string {
  return createHash('sha256').update(normalizeSnapshotText(text), 'utf8').digest('hex').slice(0, 32)
}

export interface UpsertOfficialSnapshotInput {
  sourceUrl: string
  sourceName: string
  bodyText: string
  capturedAt: string
  verifiedAt?: string | null
  httpStatus?: number | null
  normalizedFacts?: unknown
  articleFactsId?: number | string | null
  discoveredContentId?: number | string | null
  fetchNotes?: string | null
}

export interface UpsertOfficialSnapshotResult {
  action: 'created' | 'duplicate'
  id?: number | string
  contentHash: string
}

export async function upsertOfficialSnapshot(
  payload: Payload,
  input: UpsertOfficialSnapshotInput,
  opts: { dryRun?: boolean } = {},
): Promise<UpsertOfficialSnapshotResult> {
  const contentHash = computeContentHash(input.bodyText)

  const existing = await payload.find({
    collection: 'official-snapshots',
    where: {
      and: [{ sourceUrl: { equals: input.sourceUrl } }, { contentHash: { equals: contentHash } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return { action: 'duplicate', id: (existing.docs[0] as { id: number | string }).id, contentHash }
  }

  if (opts.dryRun) return { action: 'created', contentHash }

  const raw = normalizeSnapshotText(input.bodyText)
  const afId = input.articleFactsId != null ? Number(input.articleFactsId) : undefined
  const dcId = input.discoveredContentId != null ? Number(input.discoveredContentId) : undefined
  const created = await payload.create({
    collection: 'official-snapshots',
    overrideAccess: true,
    data: {
      sourceUrl: input.sourceUrl,
      sourceName: input.sourceName,
      capturedAt: input.capturedAt,
      verifiedAt: input.verifiedAt ?? input.capturedAt,
      contentHash,
      httpStatus: input.httpStatus ?? undefined,
      rawSnapshot: raw.length > RAW_SNAPSHOT_MAX ? raw.slice(0, RAW_SNAPSHOT_MAX) : raw,
      normalizedFacts: (input.normalizedFacts ?? undefined) as Record<string, unknown> | undefined,
      articleFacts: Number.isFinite(afId) ? afId : undefined,
      discoveredContent: Number.isFinite(dcId) ? dcId : undefined,
      fetchNotes:
        (input.fetchNotes ?? '') +
        (raw.length > RAW_SNAPSHOT_MAX ? ` [truncated ${raw.length}→${RAW_SNAPSHOT_MAX}]` : ''),
    },
  })
  return { action: 'created', id: (created as { id: number | string }).id, contentHash }
}
