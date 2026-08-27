import type { Payload } from 'payload'

import { fetchNoteOfficialTopics, type OpenOfficialTopicCandidate } from './fetchNoteOfficialTopics'

// Project 02-2 Phase A Priority 2試験実装：note公式お題／コンテスト（note.com/
// info/rss）取得結果のInterestThemes保存オーケストレーション（2026-08-27）。
//
// 【note_risingとの重複防止方式の違い（意図的、要注意）】
// note_rising（/trend）は「同じテーマが別日に再上昇し得る」時系列ログのため、
// 「本日既に取得済みか」でのみ重複判定する（captureNoteRisingTags.ts参照）。
// 一方note_official_topicは「同じ企画（ハッシュタグ）が長期間開催され続ける」
// 性質のため、themeが一度でも保存されていれば恒久的にスキップする——毎回の
// 実行で同じ開催中企画を繰り返し保存しない（「同一企画の重複保存を防ぐ」、
// マロン指示）。既に保存済みの企画が後日終了しても、本v1は自動的に取り下げ
// ない（status変更は人間が行う想定、既知の未実装事項として報告する）。

const SOURCE_PLATFORM = 'note'
const SOURCE_TYPE = 'note_official_topic'
// タイトル文言だけでは「今日まさに募集中か」を断定できない消極的推定のため、
// note_rising（confidence: high、明示的な番号表示）とは異なりlowとする
// （classifyNoteOfficialTopic.tsのコメント参照）。
const CONFIDENCE = 'low'
const FRESHNESS = 'observed_now'

export interface CaptureNoteOfficialTopicsOptions {
  dryRun?: boolean
}

export interface CapturedOfficialTopicSummary {
  theme: string
  sourceURL: string
  officialCategory: string | null
}

export interface SkippedOfficialTopicSummary {
  theme: string
  reason: string
}

export interface CaptureNoteOfficialTopicsResult {
  dryRun: boolean
  capturedAt: string
  totalRssItems: number
  candidateCount: number
  closedHashtags: string[]
  openCandidateCount: number
  created: CapturedOfficialTopicSummary[]
  skippedAlreadyCaptured: SkippedOfficialTopicSummary[]
  skippedDuplicateInBatch: SkippedOfficialTopicSummary[]
  warning: string | null
}

function toIsoOrNull(dateText: string | null): string | null {
  if (!dateText) return null
  const d = new Date(dateText)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function dedupeInBatch(items: OpenOfficialTopicCandidate[]): {
  unique: OpenOfficialTopicCandidate[]
  duplicates: SkippedOfficialTopicSummary[]
} {
  const seen = new Set<string>()
  const unique: OpenOfficialTopicCandidate[] = []
  const duplicates: SkippedOfficialTopicSummary[] = []

  for (const item of items) {
    if (seen.has(item.theme)) {
      duplicates.push({ theme: item.theme, reason: '同一取得結果内でハッシュタグが重複していたため2件目以降をスキップ' })
      continue
    }
    seen.add(item.theme)
    unique.push(item)
  }

  return { unique, duplicates }
}

async function findExistingByTheme(payload: Payload, theme: string): Promise<boolean> {
  // note_risingのfindExistingTodayCapture（当日のみ判定）とは異なり、こちらは
  // 期間の制限を設けない恒久チェック——同一企画（ハッシュタグ）の重複保存を
  // 防ぐため（マロン指示）。
  const { totalDocs } = await payload.find({
    collection: 'interest-themes',
    where: {
      and: [{ theme: { equals: theme } }, { sourceType: { equals: SOURCE_TYPE } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return totalDocs > 0
}

export async function captureNoteOfficialTopics(
  payload: Payload,
  options: CaptureNoteOfficialTopicsOptions = {},
): Promise<CaptureNoteOfficialTopicsResult> {
  const dryRun = options.dryRun ?? false
  const capturedAt = new Date()

  const fetchResult = await fetchNoteOfficialTopics()
  if (!fetchResult.ok) {
    // 「HTML/RSS構造変更で取得失敗した場合は、空データを正常値として保存せず
    // エラー扱いにする」——ここで例外を投げ、DB書き込みは一切行わない。
    throw new Error(`note.com/info/rssの取得に失敗しました: ${fetchResult.errorMessage}`)
  }

  const { unique, duplicates } = dedupeInBatch(fetchResult.openCandidates)

  let warning: string | null = null
  if (fetchResult.openCandidates.length === 0) {
    // RSS取得・パース自体は成功したが、現在開催中と推定できる企画が0件——
    // マロン指示「取得件数が0件の場合も警告する」。
    warning = 'note.com/info/rssから現在開催中と推定できるお題／コンテストが1件も見つかりませんでした'
  }

  const created: CapturedOfficialTopicSummary[] = []
  const skippedAlreadyCaptured: SkippedOfficialTopicSummary[] = []

  for (const item of unique) {
    const alreadyCaptured = await findExistingByTheme(payload, item.theme)
    if (alreadyCaptured) {
      skippedAlreadyCaptured.push({
        theme: item.theme,
        reason: '同一企画（ハッシュタグ）を既に取得済みのためスキップ（恒久的な重複防止）',
      })
      continue
    }

    if (!dryRun) {
      await payload.create({
        collection: 'interest-themes',
        data: {
          theme: item.theme,
          sourcePlatform: SOURCE_PLATFORM,
          sourceType: SOURCE_TYPE,
          sourceURL: item.sourceURL,
          capturedAt: capturedAt.toISOString(),
          startDate: toIsoOrNull(item.startDate),
          officialCategory: item.officialCategory ?? undefined,
          freshness: FRESHNESS,
          confidence: CONFIDENCE,
          status: 'inbox',
          humanReviewed: false,
        },
        overrideAccess: true,
      })
    }

    created.push({ theme: item.theme, sourceURL: item.sourceURL, officialCategory: item.officialCategory })
  }

  return {
    dryRun,
    capturedAt: capturedAt.toISOString(),
    totalRssItems: fetchResult.totalItems,
    candidateCount: fetchResult.candidateCount,
    closedHashtags: fetchResult.closedHashtags,
    openCandidateCount: fetchResult.openCandidates.length,
    created,
    skippedAlreadyCaptured,
    skippedDuplicateInBatch: duplicates,
    warning,
  }
}
