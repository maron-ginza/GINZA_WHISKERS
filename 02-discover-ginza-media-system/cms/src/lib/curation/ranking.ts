import type { Payload } from 'payload'

// 「旬の銀座」編集判断レイヤー：Editorial Score順ランキング（2026-08-17）。
// 読み取り専用——AIはここでも採否を決めない（Editorial Deskとして順位付けする
// だけ）。最終採用（Maron Editor's Choice）は人間が既存のeditorialStatus
// 承認フロー（Sources.ts、Phase 14）で行う。

export interface RankingEntry {
  id: number | string
  editorialStatus: string
  contentRefExcerpt: string
  scoringMethod: string | null
  scoredAt: string | null
  total: number | null
  /** 本文情報量ペナルティ適用前の合計（2026-08-18）。totalとの差があればペナルティが働いたことを意味する */
  rawTotal: number | null
  contentRichnessTier: string | null
  breakdown: {
    now: number | null
    ginza: number | null
    ux: number | null
    story: number | null
    discovery: number | null
  }
  audienceTags: {
    genderAffinity: string[]
    generation: string[]
    visitStyle: string[]
  }
}

const EXCERPT_LENGTH = 80

function toExcerpt(contentRef: unknown): string {
  const text = typeof contentRef === 'string' ? contentRef : ''
  const firstLine = text.split('\n')[0] ?? ''
  return firstLine.length > EXCERPT_LENGTH ? `${firstLine.slice(0, EXCERPT_LENGTH)}…` : firstLine
}

interface GetCurationRankingOptions {
  /** 'inbox'のみを対象にするか（既定true。現在のInbox候補ランキングという目的に合わせる） */
  onlyInbox?: boolean
  limit?: number
}

export async function getCurationRanking(
  payload: Payload,
  options: GetCurationRankingOptions = {},
): Promise<{ scored: RankingEntry[]; unscored: RankingEntry[] }> {
  const onlyInbox = options.onlyInbox ?? true
  const limit = options.limit ?? 200

  const where = onlyInbox ? { 'editorial.editorialStatus': { equals: 'inbox' } } : undefined

  const { docs } = await payload.find({
    collection: 'sources',
    where,
    limit,
    depth: 0,
    overrideAccess: true,
  })

  const entries: RankingEntry[] = docs.map((doc) => ({
    id: doc.id,
    editorialStatus: doc.editorial?.editorialStatus ?? 'unknown',
    contentRefExcerpt: toExcerpt(doc.contentRef),
    scoringMethod: doc.editorialScore?.scoringMethod ?? null,
    scoredAt: doc.editorialScore?.scoredAt ?? null,
    total: typeof doc.editorialScore?.total === 'number' ? doc.editorialScore.total : null,
    rawTotal: typeof doc.editorialScore?.rawTotal === 'number' ? doc.editorialScore.rawTotal : null,
    contentRichnessTier: doc.editorialScore?.contentRichnessTier ?? null,
    breakdown: {
      now: doc.editorialScore?.now ?? null,
      ginza: doc.editorialScore?.ginza ?? null,
      ux: doc.editorialScore?.ux ?? null,
      story: doc.editorialScore?.story ?? null,
      discovery: doc.editorialScore?.discovery ?? null,
    },
    audienceTags: {
      genderAffinity: doc.audienceTags?.genderAffinity ?? [],
      generation: doc.audienceTags?.generation ?? [],
      visitStyle: doc.audienceTags?.visitStyle ?? [],
    },
  }))

  const scored = entries
    .filter((e) => e.total !== null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
  const unscored = entries.filter((e) => e.total === null)

  return { scored, unscored }
}
