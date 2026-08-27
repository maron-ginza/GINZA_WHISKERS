import type { Payload } from 'payload'

import { dedupeThemesInBatch, findExistingTodayCapture, type SkippedThemeSummary } from './dedupHelpers'
import { fetchNoteRisingTags } from './fetchNoteRisingTags'
import type { ParsedNoteTrendItem } from './parseNoteTrendHtml'

// Project 02-2 Phase A試験実装：note.com/trend取得結果のInterestThemes保存
// オーケストレーション（2026-08-27）。fetchNoteRisingTags.ts（HTTP取得＋パース）と
// InterestThemesコレクション（永続化）の間をつなぐ層——CLI（scripts/
// interestFetchNoteRising.ts）から呼び出される。
//
// 【安全設計（マロン指示）】
// 1. 同一capturedAtバッチ（＝同じ実行内の5件）で万一theme重複があれば、
//    先勝ちで1件目のみ残し警告する（noteのHTML自体の異常を検知するための防御）。
// 2. themeだけで永久重複排除はしない——「本日既に同じtheme×sourceTypeを
//    捕捉済みか」だけをチェックする（同じテーマが別日に再上昇するケースを
//    正しく新規記録として扱うため）。この「本日」判定が実質的な
//    「同一バッチの二重実行防止」になる：同日に2回スクリプトを実行しても
//    2回目は全件スキップされる。
// 3. HTML構造変更等でfetchNoteRisingTagsがok:falseを返した場合は、
//    空データを正常値として保存せずエラーを投げる。
// 4. 取得件数が0件（構造は壊れていないが対象が0件）の場合も、正常成功とは
//    区別して警告フラグを立てる（呼び出し元がログ・JSON出力で判別できるようにする）。

const SOURCE_PLATFORM = 'note'
const SOURCE_TYPE = 'note_rising'
const CONFIDENCE = 'high' // /trendはnoteが明示的に番号を振って表示しているため
const FRESHNESS = 'observed_now'

export interface CaptureNoteRisingTagsOptions {
  dryRun?: boolean
}

export interface CapturedThemeSummary {
  theme: string
  sourceURL: string
  rankPosition: number
}

export interface CaptureNoteRisingTagsResult {
  dryRun: boolean
  capturedAt: string
  fetchedCount: number
  created: CapturedThemeSummary[]
  skippedAlreadyCapturedToday: SkippedThemeSummary[]
  skippedDuplicateInBatch: SkippedThemeSummary[]
  warning: string | null
}

export async function captureNoteRisingTags(
  payload: Payload,
  options: CaptureNoteRisingTagsOptions = {},
): Promise<CaptureNoteRisingTagsResult> {
  const dryRun = options.dryRun ?? false
  const capturedAt = new Date()

  const fetchResult = await fetchNoteRisingTags()
  if (!fetchResult.ok) {
    // 「HTML構造変更で取得失敗した場合は、空データを正常値として保存せず
    // エラー扱いにする」（マロン指示）——ここで例外を投げ、DB書き込みは一切行わない。
    throw new Error(`note.com/trendの取得に失敗しました: ${fetchResult.errorMessage}`)
  }

  const { unique, duplicates } = dedupeThemesInBatch(
    fetchResult.items,
    '同一取得結果内でテーマ名が重複していたため2件目以降をスキップ',
  )

  let warning: string | null = null
  if (fetchResult.items.length === 0) {
    // 構造は壊れていないが対象が0件——マロン指示「取得件数が0件の場合も警告する」。
    warning = 'note.com/trendから急上昇タグが1件も取得できませんでした（HTML構造は正常に検出、対象0件）'
  }

  const created: CapturedThemeSummary[] = []
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
          rankPosition: item.rankPosition,
          freshness: FRESHNESS,
          confidence: CONFIDENCE,
          status: 'inbox',
          humanReviewed: false,
        },
        overrideAccess: true,
      })
    }

    created.push({ theme: item.theme, sourceURL: item.sourceURL, rankPosition: item.rankPosition })
  }

  return {
    dryRun,
    capturedAt: capturedAt.toISOString(),
    fetchedCount: fetchResult.items.length,
    created,
    skippedAlreadyCapturedToday,
    skippedDuplicateInBatch: duplicates,
    warning,
  }
}
