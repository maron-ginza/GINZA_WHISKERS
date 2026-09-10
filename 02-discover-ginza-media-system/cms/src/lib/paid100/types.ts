// GINZA WHISKERS / Project 02（2026-09-10）— 100円note記事の別レーン（PAID_100_LANE_SPEC.md）。
//
// 通常投稿（無料・1日3本）とは完全に別枠。週2本（公開目安 水・土）、月8〜9本を初期目標。
// シリーズ第一弾「AIで叶える、わたしだけの銀座」。無料記事・収集済み Facts・既存候補を
// 再利用し、追加調査と手作業を最小化する。すべて決定的（AI 呼び出しなし・ネットワークなし）。

export const PAID100_SERIES_LABEL_V1 = 'AIで叶える、わたしだけの銀座'
export const PAID100_PRICE_YEN = 100
/** 公開目安の曜日（運用ガイド。コマンドは曜日を強制しない） */
export const PAID100_TARGET_WEEKDAYS = ['水', '土'] as const

/** 提案の入力：無料レーンの既存記事の要約（buildNoteDraftPackage 相当の情報を再利用） */
export interface FreeArticleSummary {
  id: number
  title: string
  /** 本文プレーンテキスト（Lexical から平坦化済み） */
  bodyText: string
  pillar: string | null
  reviewStatus: string
  lane: string
  provenance: {
    fact: string
    factType: string | null
    sourceName: string
    sourceUrl: string
    verificationStatus: string | null
  }[]
}

export interface Paid100Proposal {
  rank: number
  sourceArticleId: number
  seriesLabel: string
  /** 提案する 100円記事のタイトル */
  title: string
  /** 無料部分：課題・変化・結果の概要 */
  freePortion: { challenge: string; change: string; result: string }
  /** なぜ 100円の価値があるか（再現可能性を明示） */
  paidValue: string
  /** 再利用素材（記事ID・出典・fact・収蔵室） */
  reusableMaterials: string[]
  /** 制作見込み時間（分） */
  estimatedMinutes: number
  /** 読者が実際に再現できるか（有料判定の必須条件） */
  reproducibility: { reproducible: boolean; reason: string }
  score: number
}

export interface Paid100ProposalResult {
  /** ISO 週ラベル（例: 2026-W37） */
  weekLabel: string
  targetWeekdays: string[]
  /** 最大3案 */
  proposals: Paid100Proposal[]
  rejected: { sourceArticleId: number; title: string; reason: string }[]
  /** 集計メモ（対象にした無料記事数など） */
  meta: { freeArticlesConsidered: number; generatedAt: string }
}

/** 選定後に自動生成する CMS 下書きの構造（決定的スキャフォールド） */
export interface Paid100DraftSection {
  heading: string
  /** 段落・箇条書き（プレーンテキスト） */
  lines: string[]
}

export interface Paid100Draft {
  sourceArticleId: number
  title: string
  seriesLabel: string
  lane: 'paid_100'
  priceYen: number
  /** 無料エリア（課題・変化・結果 概要） */
  freeSections: Paid100DraftSection[]
  /** 有料エリア（具体的手順・AI指示文・候補比較・確認方法・再利用テンプレート） */
  paidSections: Paid100DraftSection[]
  /** 出典（再利用元記事の editorialProvenance から重複排除） */
  sources: { sourceName: string; sourceUrl: string; fact: string; verificationStatus: string | null }[]
  notes: string[]
  hashtags: string[]
}
