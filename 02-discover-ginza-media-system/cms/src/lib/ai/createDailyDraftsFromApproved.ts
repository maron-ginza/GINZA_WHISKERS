import type { Payload } from 'payload'

import { computeCharBigramJaccardSimilarity } from '../curation/textSimilarity'
import {
  createMultiAngleDraftsFromDiscoveredContent,
} from './createMultiAngleDraftsFromDiscoveredContent'
import type { MultiAngleKey, ArticleVolume } from './generateMultiAngleArticleDrafts'

// 「旬の銀座」日次オーケストレーション（2026-08-28、Project 02-1）。
//
// 【目的】これまで手作業でエンドポイント/スクリプトを個別に叩いていた
// 「Maron Editor's Choiceで承認 → 記事ドラフト生成」を、`./p2 draft-today`
// という1つの日次ルーチンへまとめる——「旬の銀座 最大5本/日」を実運用可能に
// するための司令塔。
//
// 【方針（2026-08-28、マロン確定：トピック優先）】
// - 当日 curationStatus=approved になった DiscoveredContent を取得する
//   （decisionAt が当日以降。--since で遡り可）。
// - 既に記事ドラフト化済み（Articles.editorialProvenance から逆引き）の
//   ものは除外する——同日中に再実行しても二重生成しない（冪等）。
// - 類似テーマ（title+excerpt の文字バイグラムJaccard類似度）で束ね、
//   distinct トピックにする。代表は Editorial Score の高い方を残す。
// - distinct トピックを Editorial Score 降順に並べ、上位 maxDrafts（既定5）
//   を選ぶ。それを超えた分は「翌日以降へ繰り越し」として報告する。
// - 各トピックにつき1本、既存の createMultiAngleDraftsFromDiscoveredContent
//   を CORE 角度のみで再利用して Article(reviewStatus: draft) を作る
//   （新しいAI呼び出しスキーマは追加しない。GINZA WHISKERS 視点は
//   multi-angle の CORE プロンプト・system プロンプトがそのまま担保する）。
// - 生成物はすべて reviewStatus: draft。既存の Articles.ts beforeChange
//   人間承認ゲートをそのまま通る——新しい承認経路・バイパスは作らない。
//
// 【AI課金の扱い】選ばれたトピック数だけ Claude API を呼ぶ。CLI 側
// （./p2 draft-today）は `tns next` と同じく実行時 --yes を必須とし、
// --dry-run では選定計画のみ表示して API 呼び出し・DB 書き込みを行わない
// （「コスト発生処理は明示フラグで無効化できる」既存方針の踏襲）。

const DEFAULT_MAX_DRAFTS = 5
// multiAngleQualityGate.ts の DUPLICATE_SIMILARITY_THRESHOLD と揃える
// （同じ「文字バイグラムJaccardで実質重複を弾く」考え方の使い回し）。
const DEFAULT_SIMILARITY_THRESHOLD = 0.6

export interface RunDailyDraftsOptions {
  /** テスト用に「今日」を上書きする */
  now?: Date
  /** 承認取得の起点を明示上書きする（既定は now の当日0時）。遡り生成用 */
  since?: Date
  /** 1日あたりの最大ドラフト本数（既定5） */
  maxDrafts?: number
  /** 類似テーマ統合のしきい値（0〜1、既定0.6） */
  similarityThreshold?: number
  /** true の場合、選定計画のみ算出し AI 呼び出し・DB 書き込みを一切しない */
  dryRun?: boolean
}

interface TopicSummary {
  discoveredContentId: number
  title: string
  editorialScore: number | null
  articleUrl: string
}

export interface RunDailyDraftsResult {
  since: string
  dryRun: boolean
  maxDrafts: number
  similarityThreshold: number
  /** 当日 approved で見つかった件数（除外前） */
  approvedFound: number
  /** 既にドラフト化済みのため除外した件 */
  alreadyDrafted: TopicSummary[]
  /** 類似テーマとして代表へ統合した件 */
  mergedAway: (TopicSummary & { mergedIntoDiscoveredContentId: number; similarity: number })[]
  /** 束ねた後の distinct トピック（Editorial Score 降順） */
  distinctTopics: TopicSummary[]
  /** 今日ドラフト化するトピック（上位 maxDrafts） */
  selectedTopics: TopicSummary[]
  /** maxDrafts を超えたため翌日以降へ繰り越すトピック */
  deferredTopics: TopicSummary[]
  /** 実際に作成された Article ドラフト（dryRun 時は空） */
  createdDrafts: {
    articleId: number
    discoveredContentId: number
    title: string
    angle: MultiAngleKey
    volume: ArticleVolume
  }[]
  /** トピック単位の生成失敗（品質ゲート落ち・AIエラー等。dryRun 時は空） */
  failures: { discoveredContentId: number; title: string; reason: string }[]
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** 類似判定に使う正規化テキスト（空白除去は textSimilarity 側で行うため trim のみ） */
function topicText(title: string | null | undefined, excerpt: string | null | undefined): string {
  return [title ?? '', excerpt ?? ''].join('\n').trim()
}

export async function runDailyDraftsFromApproved(
  payload: Payload,
  options: RunDailyDraftsOptions = {},
): Promise<RunDailyDraftsResult> {
  const now = options.now ?? new Date()
  const since = options.since ?? startOfDay(now)
  const maxDrafts = options.maxDrafts ?? DEFAULT_MAX_DRAFTS
  const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD
  const dryRun = options.dryRun ?? false

  if (maxDrafts < 1) {
    throw new Error(`maxDrafts は 1 以上を指定してください（現在: ${maxDrafts}）`)
  }

  // 1. 当日 approved になった DiscoveredContent を取得（読み取りのみ、書き込みなし）。
  const { docs: approvedDocs } = await payload.find({
    collection: 'discovered-content',
    where: {
      and: [
        { curationStatus: { equals: 'approved' } },
        { decisionAt: { greater_than_equal: since.toISOString() } },
      ],
    },
    sort: '-decisionAt',
    depth: 1,
    limit: 200,
    overrideAccess: true,
  })

  // 2. 既にドラフト化済みのものを除外（冪等）。Articles.editorialProvenance の
  //    discoveredContentSource から逆引きする。記事数は多くないため全件走査で足りる。
  const { docs: allArticles } = await payload.find({
    collection: 'articles',
    depth: 0,
    limit: 2000,
    overrideAccess: true,
  })
  const draftedDiscoveredIds = new Set<number>()
  for (const article of allArticles) {
    const prov = (article as unknown as {
      editorialProvenance?: { discoveredContentSource?: number | { id?: number } | null }[] | null
    }).editorialProvenance
    if (!Array.isArray(prov)) continue
    for (const entry of prov) {
      const ref = entry?.discoveredContentSource
      const id = typeof ref === 'object' && ref !== null ? ref.id : ref
      if (typeof id === 'number') draftedDiscoveredIds.add(id)
    }
  }

  const toSummary = (doc: (typeof approvedDocs)[number]): TopicSummary => ({
    discoveredContentId: Number(doc.id),
    title: String(doc.title ?? '(無題)'),
    editorialScore:
      typeof (doc as { editorialScore?: { total?: number | null } }).editorialScore?.total === 'number'
        ? ((doc as { editorialScore?: { total?: number | null } }).editorialScore!.total as number)
        : null,
    articleUrl: String((doc as { articleUrl?: string }).articleUrl ?? ''),
  })

  const alreadyDrafted: TopicSummary[] = []
  const pending: typeof approvedDocs = []
  for (const doc of approvedDocs) {
    if (draftedDiscoveredIds.has(Number(doc.id))) {
      alreadyDrafted.push(toSummary(doc))
    } else {
      pending.push(doc)
    }
  }

  // 3. Editorial Score 降順に並べる（未採点は末尾）。以降の類似統合・上位選抜の
  //    優先順位に使う。
  const scoreOf = (doc: (typeof approvedDocs)[number]): number =>
    typeof (doc as { editorialScore?: { total?: number | null } }).editorialScore?.total === 'number'
      ? ((doc as { editorialScore?: { total?: number | null } }).editorialScore!.total as number)
      : -1
  pending.sort((a, b) => scoreOf(b) - scoreOf(a))

  // 4. 類似テーマ統合（貪欲・先勝ち）。Score 上位から順に「代表」を確定し、
  //    後続で類似度がしきい値以上のものは代表へ merge する。
  const kept: typeof approvedDocs = []
  const keptText: string[] = []
  const mergedAway: RunDailyDraftsResult['mergedAway'] = []
  for (const doc of pending) {
    const text = topicText(doc.title as string, (doc as { excerpt?: string }).excerpt)
    let mergedInto: { doc: (typeof approvedDocs)[number]; similarity: number } | null = null
    for (let i = 0; i < kept.length; i++) {
      const sim = computeCharBigramJaccardSimilarity(keptText[i], text)
      if (sim >= similarityThreshold) {
        mergedInto = { doc: kept[i], similarity: sim }
        break
      }
    }
    if (mergedInto) {
      mergedAway.push({
        ...toSummary(doc),
        mergedIntoDiscoveredContentId: Number(mergedInto.doc.id),
        similarity: Number(mergedInto.similarity.toFixed(3)),
      })
    } else {
      kept.push(doc)
      keptText.push(text)
    }
  }

  const distinctTopics = kept.map(toSummary)
  const selectedDocs = kept.slice(0, maxDrafts)
  const selectedTopics = selectedDocs.map(toSummary)
  const deferredTopics = kept.slice(maxDrafts).map(toSummary)

  const result: RunDailyDraftsResult = {
    since: since.toISOString(),
    dryRun,
    maxDrafts,
    similarityThreshold,
    approvedFound: approvedDocs.length,
    alreadyDrafted,
    mergedAway,
    distinctTopics,
    selectedTopics,
    deferredTopics,
    createdDrafts: [],
    failures: [],
  }

  if (dryRun) return result

  // 5. 各トピックにつき1本、CORE 角度のみで multi-angle を再利用してドラフト生成。
  //    1トピックの失敗（品質ゲート落ち・AIエラー）で全体を止めない。
  for (const doc of selectedDocs) {
    const discoveredContentId = Number(doc.id)
    try {
      const { createdArticles } = await createMultiAngleDraftsFromDiscoveredContent(
        payload,
        discoveredContentId,
        { angles: ['core'] },
      )
      for (const created of createdArticles) {
        result.createdDrafts.push({
          articleId: created.id,
          discoveredContentId,
          title: created.title,
          angle: created.angle,
          volume: created.volume,
        })
      }
      if (createdArticles.length === 0) {
        result.failures.push({
          discoveredContentId,
          title: String(doc.title ?? '(無題)'),
          reason: 'CORE 角度が生成されませんでした（品質ゲート落ちの可能性）',
        })
      }
    } catch (err) {
      result.failures.push({
        discoveredContentId,
        title: String(doc.title ?? '(無題)'),
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
