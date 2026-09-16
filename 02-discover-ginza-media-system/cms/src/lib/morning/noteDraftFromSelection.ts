// GINZA WHISKERS / Project 02（2026-09-16続き6、マロン指示：V1 Stage 5 追加費用0円化）
//
// Stage 5「選定後のnote原稿作成」の中核（純粋関数・AI / DB / 外部fetch なし）。
// Stage 4 の選定1件分（SelectionPick）と、呼び出し元が既に取得済みのDC・
// ArticleFacts（Like型。DBアクセス自体はこのファイルの外・morningDraftSelected.ts
// が担う）から、note原稿を決定的に組み立てる。
//
//   mapDiscoveredContentToEventFields → buildTemplateArticleInput →
//   renderArticleFromTemplate（いずれも既存・追加API課金0円の決定的関数。
//   2026-09-02〜。新しい生成ロジックはここでは追加していない）
//
// 【全体を停止の前提となる個別チェック】
//   ・選定時点の sourceUrl と現在の articleUrl が食い違う → 'stopped'（データ不整合）
//   ・templateEligible:false（タイトル・開催期間・施設・公式URL等が不足、または
//     ArticleFacts が ready 化されていない）→ 'stopped'（推測しない）
// このファイル自体は「1件の判定」のみを行う。3件すべてを検証してから書き込む
// all-or-nothing の判断は呼び出し元（morningDraftSelected.ts）が行う。

import type { SelectionPick } from './selectionRecord'
import {
  mapDiscoveredContentToEventFields,
  buildTemplateArticleInput,
  type DiscoveredContentLike,
  type ArticleFactsLike,
} from '../template/mapDiscoveredContentToEventFields'
import { renderArticleFromTemplate } from '../template/renderArticleFromTemplate'

export interface PreparedNoteDraft {
  discoveredContentId: number
  title: string
  titleCandidates: string[]
  noteBody: string
  charCount: number
  hashtags: string[]
  provenance: unknown[]
  callToAction: string | null
  category: string | null
  facilityLabel: string | null
  sourceUrl: string
}

export type NoteDraftPrepResult =
  | { status: 'prepared'; draft: PreparedNoteDraft }
  | { status: 'stopped'; discoveredContentId: number; reason: string }

export function prepareNoteDraftFromSelection(params: {
  pick: SelectionPick
  /** 呼び出し元がDBから取得した現在のDiscoveredContent.articleUrl（無ければ null） */
  currentArticleUrl: string | null
  dc: DiscoveredContentLike
  facts?: ArticleFactsLike
  now?: Date
}): NoteDraftPrepResult {
  const { pick } = params
  const currentUrl = params.currentArticleUrl ?? ''

  if (pick.sourceUrl && currentUrl && pick.sourceUrl !== currentUrl) {
    return {
      status: 'stopped',
      discoveredContentId: pick.discoveredContentId,
      reason: `データ不整合：Stage 4 選定時の公式URL（${pick.sourceUrl}）と現在のDB値（${currentUrl}）が異なります。再調査・推測はせず停止します。`,
    }
  }

  const map = mapDiscoveredContentToEventFields(params.dc, { facts: params.facts, now: params.now ?? new Date() })
  if (!map.templateEligible) {
    return {
      status: 'stopped',
      discoveredContentId: pick.discoveredContentId,
      reason: `必須情報の不足・未確認のため停止（推測しません）: ${map.missing.join(' / ') || 'ArticleFactsがready化されていません'}`,
    }
  }
  const templateInput = buildTemplateArticleInput(map, [])
  if (!templateInput) {
    return {
      status: 'stopped',
      discoveredContentId: pick.discoveredContentId,
      reason: '必須情報の不足のため停止（buildTemplateArticleInputがnullを返しました）',
    }
  }

  const result = renderArticleFromTemplate(templateInput)
  return {
    status: 'prepared',
    draft: {
      discoveredContentId: pick.discoveredContentId,
      title: result.title,
      titleCandidates: result.titleCandidates,
      noteBody: result.noteBody,
      charCount: result.charCount,
      hashtags: result.hashtags,
      provenance: result.provenance,
      callToAction: result.callToAction,
      category: pick.category,
      facilityLabel: pick.facilityLabel,
      sourceUrl: currentUrl,
    },
  }
}

/** SelectionPick を再export（呼び出し元の import を1箇所にまとめるため） */
export type { SelectionPick }
