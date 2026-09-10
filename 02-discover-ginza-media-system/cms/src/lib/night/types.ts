// Night Automation Layer（2026-08-31）の共有型。
//
// 目的：マロンが就寝中に「承認済み DiscoveredContent → 記事ドラフト生成 →
// fact/source 検証 → note 下書きパッケージ（/note-draft 再利用構造）→
// Same-day Review Queue」まで（保険としてエラー・未処理・持ち越し用）。**公開・approve・削除・
// 有料/無料変更・アカウント設定変更は一切行わない**（既存の
// Articles.beforeChange 人間承認ゲートもそのまま機能する）。
//
// 既存資産の再利用：
//  - 選定＋生成 = runDailyDraftsFromApproved（./p2 draft-today と同一コードパス）
//  - 生成本体   = createMultiAngleDraftsFromDiscoveredContent（CORE 角度のみ）
//  - note パッケージのマーカー規約 = tnsBuildNoteReady36.ts と同じ
//    （[IMAGE: ...] / [YOUTUBE URL] / ハッシュタグ行）を汎用化したもの

export type NightArticleStatus = 'ok' | 'warning' | 'blocked' | 'error'

/** fact/source 検証（読み取り専用・AI 呼び出しなし）の 1 件 */
export interface NightValidationFinding {
  /** 'blocker' は note パッケージ化を止める。'warning' は Same-day Review で判断 */
  level: 'blocker' | 'warning'
  code: string
  message: string
}

/** note 冒頭・見出し前に置く画像プレースホルダ（実ファイルは未添付） */
export interface NoteDraftImageSlot {
  /** 本文テキストに現れるマーカー文字列（例: "[IMAGE: アイキャッチ]"） */
  marker: string
  /** 'category_icon'＝マストヘッド先頭の 18 カテゴリーアイコン（必須・1点）。'hero'＝冒頭挿絵。'section'＝任意の区切り */
  role: 'category_icon' | 'hero' | 'section'
  /** 本文中の挿入位置の目安（先頭 / 直後に来る見出しテキスト） */
  placement: string
  /** Editorial Trust Layer 準拠：外部画像転載不可。独自素材の作成方針メモ */
  note: string
  status: 'not_prepared'
  /**
   * 読者向けの画像注釈文（2026-09-08追加）。独自生成画像を使う場合に本文中へ
   * 表示する注記（例：「※画像は記事内容をもとに生成したイメージです。
   * 実際の商品・店舗とは異なる場合があります。」）。hero スロットのみ設定する
   * （section 画像は任意の区切りのため注釈を必須にしない）。
   */
  caption?: string
}

export interface NoteDraftHashtags {
  note: string[]
  x: string[]
  instagram: string[]
}

export interface NoteDraftLinks {
  /** editorialProvenance から集めた出典 URL（重複排除済み） */
  sourceUrls: string[]
  /** 記事公開後の canonical（この段階では未確定） */
  canonical: string | null
  /** TNS 以外の通常記事では通常空。将来の拡張用 */
  youtube: string[]
}

export interface NoteDraftProvenanceSummary {
  confirmed: number
  unconfirmed: number
  conflicting: number
  facts: {
    fact: string
    factType: string | null
    sourceName: string
    sourceUrl: string
    verificationStatus: string | null
  }[]
}

/** Claude in Chrome へ渡す手順（現時点では未接続。コード側の受け渡し定義のみ） */
export interface NoteDraftChromeHandoff {
  target: 'note.com'
  /** 実行してよい操作の上限。ここを越える操作は禁止 */
  guardrails: string[]
  steps: string[]
  /** 実際に mcp__claude-in-chrome__* を呼んだか（Night Layer は常に false） */
  executed: boolean
}

/**
 * note 記事冒頭マストヘッド（2026-09-10 恒久ルール）。すべての note 記事の冒頭に
 * 「カテゴリーアイコン 1 点 → 固定文 → 本文」の順で必ず入れる。fixedText は
 * noteMasthead.NOTE_MASTHEAD_TEXT（一字一句不変）。categoryIcon が resolveStatus
 * ='needs_human' のときはパッケージ化を BLOCKER で止める。
 */
export interface NoteMasthead {
  categoryIcon: {
    resolveStatus: 'resolved' | 'needs_human'
    category: string | null
    labelJa: string | null
    iconSlug: string | null
    iconFile: string | null
    basis: string | null
    reason: string
  }
  fixedText: string
  order: string[]
}

/** /note-draft 再利用構造。1 ドラフト記事 = 1 パッケージ */
export interface NoteDraftPackage {
  schemaVersion: 1
  articleId: number
  discoveredContentId: number | null
  title: string
  slug: string
  pillar: string | null
  /** note 冒頭マストヘッド（必須）。categoryIcon.resolveStatus='needs_human' のとき status='blocked' */
  masthead: NoteMasthead
  /**
   * note 編集部ノウハウ（Editorial Style Engine 項目1）ではタイトルは 3〜5 案。
   * multi-angle 生成は 1 案しか返さないため、ここは 1 案 + Same-day Review での
   * 追加を促すフラグを持つ。
   */
  titleCandidates: string[]
  needsMoreTitleCandidates: boolean
  /** そのまま note へ貼れるプレーンテキスト（[IMAGE: ...] マーカー入り） */
  body: string
  images: NoteDraftImageSlot[]
  hashtags: NoteDraftHashtags
  links: NoteDraftLinks
  socialCopy: { note: string; x: string; instagram: string }
  callToAction: string | null
  provenance: NoteDraftProvenanceSummary
  chromeHandoff: NoteDraftChromeHandoff
  validation: { blockers: NightValidationFinding[]; warnings: NightValidationFinding[] }
  status: NightArticleStatus
  generatedAt: string
}

/** Same-day Review Queue の 1 行（_index.json の items[]）。標準は当日レビュー、
 *  queue はエラー・未処理・持ち越し案件の保険として残す。 */
export interface SameDayReviewQueueItem {
  articleId: number
  discoveredContentId: number | null
  title: string
  status: NightArticleStatus
  blockerCount: number
  warningCount: number
  packageDir: string
  reviewStatus: string
  createdAt: string
}

export interface SameDayReviewQueueIndex {
  date: string
  updatedAt: string
  runs: string[]
  items: SameDayReviewQueueItem[]
  /** 生成・検証を最後まで進められなかった項目（異常時に残す） */
  unprocessed: { discoveredContentId: number | null; title: string; reason: string }[]
}

export interface NightBuildRunResult {
  mode: 'dry-run' | 'live'
  date: string
  startedAt: string
  finishedAt: string
  since: string
  maxArticles: number
  /** ./p2 draft-today と同じ選定計画（dry-run はここまで） */
  plan: {
    approvedFound: number
    selectedTopics: { discoveredContentId: number; title: string; editorialScore: number | null }[]
    deferredTopics: { discoveredContentId: number; title: string }[]
    alreadyDrafted: { discoveredContentId: number; title: string }[]
  }
  /** live 実行で生成・パッケージ化した記事 */
  articles: {
    articleId: number
    discoveredContentId: number | null
    title: string
    status: NightArticleStatus
    blockers: NightValidationFinding[]
    warnings: NightValidationFinding[]
    packageDir: string | null
  }[]
  /** 生成に失敗したトピック（runDailyDraftsFromApproved.failures 由来） */
  failures: { discoveredContentId: number | null; title: string; reason: string }[]
  /** 異常時に処理を止めた場合の理由（null = 正常終了） */
  haltedReason: string | null
  queueDir: string | null
}
