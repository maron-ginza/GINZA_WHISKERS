import type { Payload } from 'payload'

import { dedupeThemesInBatch, findExistingTodayCapture, type SkippedThemeSummary } from './dedupHelpers'
import { buildNoteHashtagPageUrl, fetchNoteHashtagPage } from './fetchNoteHashtagPage'

// Project 02-2 Phase A Priority 1補強：note.com/hashtag/<tag>取得結果の
// InterestThemes保存オーケストレーション（2026-08-27）。
//
// 【note_risingと同じ重複防止方式（意図的）】このthemeの数値（記事数）は
// 日々変動し得る継続的な観測値のため、note_official_topicの恒久重複防止では
// なく、note_risingと同じ「本日既に取得済みか」のみを判定する——同じタグを
// 別日に再取得すれば新しい観測行として記録され、将来的な推移比較の土台になる。
//
// 【1回のfetchで複数themeが生まれる】シード（対象）タグ自身1件＋関連タグ
// 数件を、同じsourceType（note_hashtag_popular）の別々のtheme行として保存する。
// 「同じテーマでもsourceTypeが異なれば別Signalとして保持可能にする」（マロン指示）
// の実装として、既存のnote_rising/note_official_topicの同名themeとは独立に扱う
// （sourceTypeを条件に含むfindExistingTodayCaptureにより自然に両立する）。

const SOURCE_PLATFORM = 'note'
const SOURCE_TYPE = 'note_hashtag_popular'
const FRESHNESS = 'observed_now'
// 総記事数・関連タグ件数とも、noteが実際に表示している数値をそのまま転記した
// ものであり、解釈・推測を一切加えていないためhighとする（/trendの明示的な
// 順位表示と同じ「解釈ゼロで転記」という基準に基づく）。
const CONFIDENCE = 'high'

export interface CaptureNoteHashtagPopularOptions {
  dryRun?: boolean
}

interface CandidateTheme {
  theme: string
  sourceURL: string
  articleCount: number | null
  tagCount: number | null
}

export interface CapturedHashtagThemeSummary {
  theme: string
  sourceURL: string
  articleCount: number | null
  tagCount: number | null
}

export interface CaptureNoteHashtagPopularResult {
  dryRun: boolean
  capturedAt: string
  seedTag: string
  seedUrl: string
  relatedTagCount: number
  created: CapturedHashtagThemeSummary[]
  skippedAlreadyCapturedToday: SkippedThemeSummary[]
  skippedDuplicateInBatch: SkippedThemeSummary[]
  warning: string | null
}

export async function captureNoteHashtagPopular(
  payload: Payload,
  seedTag: string,
  options: CaptureNoteHashtagPopularOptions = {},
): Promise<CaptureNoteHashtagPopularResult> {
  const dryRun = options.dryRun ?? false
  const capturedAt = new Date()
  const seedUrl = buildNoteHashtagPageUrl(seedTag)

  const fetchResult = await fetchNoteHashtagPage(seedTag)
  if (!fetchResult.ok || !fetchResult.parsed) {
    // 「HTML構造変更で取得失敗した場合は、空データを正常値として保存せず
    // エラー扱いにする」——ここで例外を投げ、DB書き込みは一切行わない。
    throw new Error(`note.com/hashtag/${seedTag}の取得に失敗しました: ${fetchResult.errorMessage}`)
  }

  const { totalArticleCount, relatedTags } = fetchResult.parsed

  const candidates: CandidateTheme[] = []
  if (totalArticleCount !== null) {
    candidates.push({ theme: seedTag, sourceURL: seedUrl, articleCount: totalArticleCount, tagCount: null })
  }
  for (const tag of relatedTags) {
    candidates.push({ theme: tag.name, sourceURL: tag.sourceURL, articleCount: null, tagCount: tag.tagCount })
  }

  const { unique, duplicates } = dedupeThemesInBatch(
    candidates,
    '同一取得結果内でテーマ名（シード自身または関連タグ）が重複していたため2件目以降をスキップ',
  )

  let warning: string | null = null
  if (candidates.length === 0) {
    // 総記事数・関連タグのいずれも取得できなかった——マロン指示「取得件数が0件の場合も警告する」。
    warning = `note.com/hashtag/${seedTag}から総記事数・関連タグのいずれも取得できませんでした`
  }

  const created: CapturedHashtagThemeSummary[] = []
  const skippedAlreadyCapturedToday: SkippedThemeSummary[] = []

  for (const item of unique) {
    const alreadyCaptured = await findExistingTodayCapture(payload, item.theme, SOURCE_TYPE, capturedAt)
    if (alreadyCaptured) {
      skippedAlreadyCapturedToday.push({
        theme: item.theme,
        reason: '本日同一テーマ・sourceTypeを既に取得済みのためスキップ（同一日内の二重実行防止）',
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
          articleCount: item.articleCount ?? undefined,
          tagCount: item.tagCount ?? undefined,
          freshness: FRESHNESS,
          confidence: CONFIDENCE,
          status: 'inbox',
          humanReviewed: false,
        },
        overrideAccess: true,
      })
    }

    created.push({
      theme: item.theme,
      sourceURL: item.sourceURL,
      articleCount: item.articleCount,
      tagCount: item.tagCount,
    })
  }

  return {
    dryRun,
    capturedAt: capturedAt.toISOString(),
    seedTag,
    seedUrl,
    relatedTagCount: relatedTags.length,
    created,
    skippedAlreadyCapturedToday,
    skippedDuplicateInBatch: duplicates,
    warning,
  }
}
