import type { TextBlock } from './lexical'
import {
  buildRelatedArticlesBlocks,
  formatVerifiedAtForDisplay,
  type EditorialProvenanceEntry,
  type RelatedArticleForPrompt,
} from './generateArticleDraft'
import { MULTI_ANGLE_LABELS } from './generateMultiAngleArticleDrafts'
import type {
  MultiAngleKey,
  RawMultiAngleCandidate,
  RawSourceProvenance,
} from './generateMultiAngleArticleDrafts'

// buildAngleArticleBlocks（記事本文ブロックの決定的な組み立て）を、
// generateMultiAngleArticleDrafts.ts から再利用可能な共通モジュールとして
// 切り出したもの（2026-09-02、Project 02 改善 第1段階）。
//
// 処理内容・引数・戻り値は移設前と同一。AI 呼び出し・DB アクセス・Payload
// 依存はいずれも無い純粋関数。
//
// 【循環参照について】本モジュールは MULTI_ANGLE_LABELS（値）を
// generateMultiAngleArticleDrafts.ts から import し、同ファイルは
// buildAngleArticleBlocks を本モジュールから import する。この相互 import は
// 意図的で安全：どちらの値もモジュール初期化時ではなく関数呼び出し時
// （リクエスト時）にのみ参照されるため、ESM のライブバインディングで解決される。
// MultiAngleKey / RawMultiAngleCandidate / RawSourceProvenance は型のみの
// import（コンパイル時に消去され、実行時の循環には寄与しない）。

// buildAngleArticleBlocks が本文へ埋め込む内部マーカー文字列の単一の定義元
// （2026-09-02、第2段階B）。テンプレート生成側（lib/template/templates.ts）は
// これを import して読者向けへの置換に使う——リテラルの二重定義を避けるため、
// マーカー文字列はここにのみ置く。値・組み立て結果は従来と byte 単位で同一。
export const ARTICLE_BLOCK_MARKERS = {
  /** 冒頭の角度ラベル段落の囲い（例: 【CORE（核記事）】） */
  angleLabelOpen: '【',
  angleLabelClose: '】',
  /** 「なぜ今か」段落の接頭辞（全角？ + 半角スペース） */
  whyNowPrefix: 'WHY NOW？ ',
  /** 編集メモ段落の接頭辞（全角スペース U+3000） */
  editorsNotePrefix: "EDITOR'S NOTE　",
  /** SOURCE 引用の接頭辞 */
  sourceQuotePrefix: 'SOURCE: ',
  /** SOURCE 引用内の「確認日時」区切り */
  sourceQuoteVerifiedSep: '／確認: ',
  /** SOURCE 引用内の一般区切り（全角スラッシュ） */
  sourcePartSep: '／',
  /** 末尾 CTA 段落の接頭辞 */
  nextActionPrefix: '→ 次に：',
} as const

// 角度1件分の記事本文をTextBlockへ組み立てる。buildEditorialBlocks
// （generateArticleDraft.ts、単一Source版）・buildWeeklyEditorialBlocks
// （同、週次版）と同じ「見出し＋段落＋SOURCE quote＋回遊導線」という骨格を
// 踏襲しつつ、角度ラベルを冒頭に明示する点のみ異なる。
export function buildAngleArticleBlocks(
  angle: MultiAngleKey,
  input: Required<
    Pick<
      RawMultiAngleCandidate,
      | 'hook'
      | 'angleSummary'
      | 'content'
      | 'whyNow'
      | 'editorsNote'
      | 'closing'
      | 'callToAction'
    >
  > &
    Pick<RawMultiAngleCandidate, 'audience'>,
  sourceMeta: { sourceName: string; sourceUrl: string; verifiedAt?: string },
  sourceProvenanceInput: RawSourceProvenance[],
  discoveredContentId: string | number,
  relatedArticles: RelatedArticleForPrompt[],
): { blocks: TextBlock[]; provenance: EditorialProvenanceEntry[] } {
  const blocks: TextBlock[] = []
  const provenance: EditorialProvenanceEntry[] = []

  blocks.push({
    type: 'paragraph',
    text: `${ARTICLE_BLOCK_MARKERS.angleLabelOpen}${MULTI_ANGLE_LABELS[angle]}${ARTICLE_BLOCK_MARKERS.angleLabelClose}`,
  })
  blocks.push({ type: 'paragraph', text: input.hook })
  blocks.push({ type: 'heading', level: 2, text: input.angleSummary })

  const contentParagraphs = input.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  for (const paragraph of contentParagraphs) {
    blocks.push({ type: 'paragraph', text: paragraph })
  }

  blocks.push({
    type: 'paragraph',
    text: `${ARTICLE_BLOCK_MARKERS.whyNowPrefix}${input.whyNow}`,
  })
  blocks.push({
    type: 'paragraph',
    text: `${ARTICLE_BLOCK_MARKERS.editorsNotePrefix}${input.editorsNote}`,
  })
  if (input.audience) {
    blocks.push({ type: 'paragraph', text: input.audience })
  }

  blocks.push({
    type: 'quote',
    text:
      `${ARTICLE_BLOCK_MARKERS.sourceQuotePrefix}${sourceMeta.sourceName}${ARTICLE_BLOCK_MARKERS.sourceQuoteVerifiedSep}` +
      `${formatVerifiedAtForDisplay(sourceMeta.verifiedAt)}${ARTICLE_BLOCK_MARKERS.sourcePartSep}${sourceMeta.sourceUrl}`,
  })

  for (const p of sourceProvenanceInput) {
    provenance.push({
      discoveredContentId,
      sourceName: sourceMeta.sourceName,
      sourceUrl: sourceMeta.sourceUrl,
      verifiedAt: sourceMeta.verifiedAt,
      fact: p.fact,
      sourceType: p.sourceType,
      factType: p.factType,
      verificationStatus: p.verificationStatus,
    })
  }

  blocks.push({ type: 'paragraph', text: input.closing })
  blocks.push({
    type: 'paragraph',
    text: `${ARTICLE_BLOCK_MARKERS.nextActionPrefix}${input.callToAction}`,
  })
  blocks.push(...buildRelatedArticlesBlocks(relatedArticles))

  return { blocks, provenance }
}
