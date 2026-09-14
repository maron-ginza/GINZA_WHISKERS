// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// 本文検査（steps 5〜9・6つの sale 共通検査）の共通入力型。
// 記事1本を「セクション列 + 確定事実 + テンプレ種別」に落とし込んだもの。
// すべての検査は純粋関数・AI 呼び出しなし・DB 非依存。

export interface ConfirmedFact {
  fact: string
  factType: string
  /** 'confirmed' | 'unconfirmed' | 'conflicting' */
  verificationStatus: string
  sourceUrl?: string | null
  verifiedAt?: string | null
}

export interface AuditSection {
  /** 見出しテキスト（例: "EDITOR'S CHOICE | BEAUTY" / "基本情報"）。導入は "導入" */
  name: string
  /** そのセクションの本文（見出しは含めない） */
  text: string
}

export interface AuditFactsView {
  eventName?: string | null
  whatHappens?: string | null
  eventDate?: string | null
  eventDateISO?: string | null
  eventTime?: string | null
  venues?: ({ name?: string | null; place?: string | null } | null)[] | null
  priceText?: string | null
  officialInfoNote?: string | null
  applyRequired?: string | null
  applyDeadline?: string | null
  paid?: string | null
  editorsNoteSeed?: string | null
  areaLead?: string | null
  audienceNote?: string | null
}

export interface ArticleUnderAudit {
  articleId?: number | string
  discoveredContentId?: number | string
  title: string
  /** 読者向けセクション列（順序どおり・ハッシュタグ行は含めない） */
  sections: AuditSection[]
  /** exhibition | recurring_event | sale | generic */
  appliedTemplate: string
  /** ArticleFacts.templateType（exhibition/sale/application/workshop/recurring_event/generic/unknown） */
  templateType: string
  primaryCategory?: string | null
  /** Article.callToAction（本文末尾 CTA の文言。無ければ null） */
  callToAction: string | null
  /** 本文中に CTA ブロックが存在するか */
  ctaInBody: boolean
  /** ハッシュタグ（先頭 # 込み） */
  hashtags: string[]
  /** 出典事実（confirmed/unconfirmed/conflicting すべて。gate 側で選別） */
  provenance: ConfirmedFact[]
  facts: AuditFactsView
  /** 追跡可能な公式 URL があるか（出典判定・CTA 判定） */
  hasOfficialUrl: boolean
  verifiedAt?: string | null
}
