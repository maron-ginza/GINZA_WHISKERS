// GINZA WHISKERS / Project 02 P0 改善（2026-09-02）— 朝の A/B/C 候補評価レイヤーの型。
//
// 目的：承認済み DiscoveredContent を「決定的に」（AI なし・課金なし・DB 書き込みなし）
// A/B/C に分類し、A判定のみを 7:10 レポートへ載せる。未確認情報は絶対に補完しない
// ——missing / unconfirmed として列挙するだけ。
//
// 「完璧」の定義：必須項目を確認できた案件だけを A判定とする（項目を推測で埋めない）。

/** A=即記事化可 / B=未確認あり・上位に載せない / C=除外 */
export type AbcVerdict = 'A' | 'B' | 'C'

// ── 記事タイプ分類（P0 続き5・2026-09-02。ArticleFacts 抽出より前に決定的に判定） ──
/**
 * 今回の P0 で正式対応する記事タイプは event と product_news の 2 種のみ。
 * 判定不能・矛盾は unknown（推測で event / product_news に分類しない）。新タイプは増やさない。
 */
export type FactKind = 'event' | 'product_news' | 'unknown'

export interface FactKindClassification {
  factKind: FactKind
  /** 分類の信頼度（複数根拠の数と一貫性から決定的に算出） */
  confidence: 'high' | 'medium' | 'low'
  /** 人間が読む分類理由（複数根拠） */
  reasons: string[]
  /** どのシグナルがどちらへ働いたか（監査ログ用） */
  signals: {
    event: string[]
    productNews: string[]
    contradiction: string[]
  }
  /** URL・タイトル・本文からの決定的なページ種別判定（監査記録用。無ければ null） */
  sourcePage?: {
    pageKind: 'article' | 'index' | 'unknown'
    evidence: string[]
    ruleIds: string[]
  } | null
}

/** product_news 用の構造化事実候補（DB へは書かない。event 用 ArticleFacts には登録しない） */
/** sourceProvenanceFacts の1件（registerArticleFacts の型に合わせた最小形。mapper が追加分を返すのに使う） */
export interface ArticleFactsProvenanceFactLike {
  fact: string
  sourceType: 'primary' | 'official' | 'secondary'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
}

export interface ProductNewsFactsCandidate {
  discoveredContentId: number
  factKind: 'product_news'
  fields: {
    productName: string | null
    brandOrSeller: string | null
    salesLocation: string | null // フロア・店舗
    saleStartAt: string | null // 販売開始日（機械値。confidence 注記つき）
    saleEndAt: string | null // 販売終了日
    limitedTime: 'yes' | 'no' | 'unknown' // 期間限定の有無
    price: string | null
    productSummary: string | null
    purchaseConditions: string | null // 購入・販売条件
    stockNotes: string | null // 在庫・売切れに関する注意
    sourceName: string | null
    sourceUrl: string | null
    verifiedAt: string | null
    /**
     * 販売終了日の公式記載状況（2026-09-07根本改善）。
     *   'ongoing_no_end_stated' … 公式本文に「発売中/販売中」の明記があり、完売・数量限定・
     *     期間限定等の終了を示す語がないため、終了日は「公式記載なし」と決定的に確定できる。
     *   'has_end_date'          … saleEndAt が確認できている（終了日あり）。
     *   'unknown'               … どちらとも決定的に判定できない（人間が公式で確認する）。
     * 推測ではなく本文の明示語の有無だけで判定する（発売中/販売中の明記かつ終了示唆語なし、のときのみ
     * 'ongoing_no_end_stated'）。
     */
    saleAvailability: 'unknown' | 'ongoing_no_end_stated' | 'has_end_date'
  }
  provenance: Record<
    string,
    {
      value: string
      sourceUrl: string | null
      capturedAt: string | null
      verifiedAt: string | null
      method: string
      confirmationStatus: 'confirmed' | 'unconfirmed'
    }
  >
  detailPage: { url: string | null; lastCrawledAt: string | null; activeFetch: OfficialPageSignals | null }
  imagePolicy: string
  /** product_news 必須で「未確認」の項目（機械値から確定できない） */
  unknownItems: string[]
  /** product_news 必須だが「公式に記載なし」と決定的に言える項目（--fetch 時の決定的チェックのみ） */
  officiallyNotStated: string[]
  /** event 用の概念で product_news には「該当なし（不要）」の項目（未確認とは区別） */
  notApplicable: string[]
  /** 情報間の矛盾 */
  conflicts: string[]
  readyCheck: {
    allRequiredPresent: boolean
    everyRequiredHasSourceUrl: boolean
    datesValidNow: boolean
    noConflicts: boolean
    trustedSource: boolean
    blockers: string[]
  }
  /** 必須がすべて根拠つきで揃っているか（現状の機械抽出では基本 false） */
  readyEligible: boolean
  proposedStatus: 'draft'
  /**
   * サイト別本文アダプタの構造化結果（現状 store.tsite.jp のみ）。
   * mapper（mapSaleFactsToDraft）が officialInfoNote 合成・表記正規化・特典整理に使う。
   * 形は `parseTsutayaSaleBody` の戻り値（型は同モジュールから）。無ければ null。
   */
  siteParsed?: Record<string, unknown> | null
}

/** 画像 preflight の結果（候補提示前に確定させる） */
export interface ImagePreflightResult {
  /** 使用可能な独自素材が在庫にあるか */
  available: boolean
  /** available=true のときの相対パス（media/ 起点） */
  assetPath?: string
  /** 季節（世界観挿絵の切替キー）。DiscoveredContent / ArticleFacts から決定的に導出 */
  season?: string
  /** カテゴリー画像のラベル（例「アート・文化」）。無ければ undefined */
  categoryLabel?: string
  /** レポートに出す一文。available=false なら「画像なし」を明示 */
  policy: string
  /** 外部画像（ginza.jp OGP 等）は常に転載禁止。新規生成はマロン判断後 */
  externalImageProhibited: true
}

/** 1候補の評価結果 */
export interface CandidateAssessment {
  discoveredContentId: number
  title: string
  /** サイトナビ由来のノイズを除いた表示用タイトル（無ければ元 title） */
  displayTitle: string
  sourceName: string
  sourceUrl: string
  /** 情報の確認日時（DiscoveredContent.lastCheckedAt を ISO のまま） */
  verifiedAt?: string
  verdict: AbcVerdict
  /** 判定理由（人間が読む短文の配列） */
  reasons: string[]
  /** 確認できた必須項目 */
  verifiedItems: string[]
  /** テンプレート必須だが取れていない項目（B の主因）。ここを推測で埋めない */
  missing: string[]
  /** 値はあるが信頼できずそのまま使えない項目 */
  unconfirmed: string[]
  /**
   * 既投稿との重複（多シグナル。詳細は dedupCheck.ts）。
   *  - duplicate: 強シグナル or（類似タイトル＋同一開催日会場）で確定
   *  - possibleDuplicate: 弱シグナルのみ＝人間確認向け
   *  - existingArticleId: 参照元 Article
   *  - notePublished: Article にひも付かないが .devlogs の note 記録が published 済み
   *  - signalSummary: レポート表示用の1行サマリ
   *  - externalUnverified: 外部 note の公開状況はシステム未確認（常に true）
   */
  dedup: {
    duplicate: boolean
    possibleDuplicate?: boolean
    existingArticleId?: number
    notePublished?: boolean
    signalSummary?: string[]
    externalUnverified?: boolean
  }
  /** 開催終了済みか（eventEndAt < now） */
  expired: boolean
  /** 銀座関連性を確認できたか */
  ginzaRelevant: boolean
  /** 銀座関連性の判定根拠（監査・再検証用） */
  ginzaRelevanceBasis?: string
  /** 追跡可能な公式 URL を持つか */
  hasTraceableSource: boolean
  /** ArticleFacts の状態 */
  factsSource: 'none' | 'draft' | 'withdrawn' | 'ready'
  templateEligible: boolean
  image: ImagePreflightResult
  /** 開催期間（表示用文字列。無ければ「不明」） */
  eventPeriod: string
  /** 申込期限（表示用。無ければ「不明／なし」） */
  applyDeadline: string
  /** 記事化の想定所要時間（分）。A は 20〜30、B は「A化までの追加時間」を足した値 */
  estimateMinutes: number
  /** B の場合の「追加で必要な作業時間（分）」 */
  bAdditionalMinutes?: number
  /** 記事タイプ分類（ArticleFacts 抽出より前に決定的に判定） */
  factKind?: FactKind
  factKindClassification?: FactKindClassification
  /** テンプレート種別（exhibition / application / workshop / sale / recurring_event / unknown） */
  templateType?: string
  /** ArticleFacts 候補プロポーザルの保存先（.devlogs 配下。DB ではない） */
  factsProposalPath?: string
  /** event 抽出の要約（factKind==='event' のときのみ。レポート表示用） */
  extraction?: ArticleFactsCandidate
  /** product_news 抽出の要約（factKind==='product_news' のときのみ） */
  productExtraction?: ProductNewsFactsCandidate
  /** ArticleFacts 自動登録の結果（--register-facts 時のみ。draft のみ・差分/監査つき） */
  factsRegister?: {
    action:
      | 'would_create'
      | 'would_update'
      | 'created'
      | 'updated'
      | 'unchanged'
      | 'skipped'
    reason?: string
    diff: { field: string; before: unknown; after: unknown }[]
    articleFactsId?: number
  }
  /** この候補の処理でハンドリングした例外（1件失敗で全体は止めない） */
  processingError?: string
  /** 記事生成レディ最終候補ダイジェスト用の追加情報（2026-09-05。未設定なら従来どおり無視される） */
  digestMeta?: DigestMeta
  /**
   * 7:10 レポート用のテンプレート事前検査（2026-09-03、改善対象1）。
   * 「この候補は今のデータで記事化できるか／人間確認待ちか／生成不可か」を候補ごとに提示する。
   */
  templatePrecheck?: {
    /** DC レベルの記事種別分類（exhibition / application / workshop / sale / recurring_event / unknown） */
    templateType: string
    templateTypeConfidence: 'high' | 'medium' | 'low'
    templateTypeReasons: string[]
    /** ready な ArticleFacts があれば mapper が確定するバリアント（無ければ推定値） */
    appliedTemplate: string
    /** ArticleFacts の状態 */
    articleFactsStatus: 'none' | 'draft' | 'withdrawn' | 'ready'
    /** 公式ページから決定的に抽出できた記事フィールド（confirmed） */
    extractedFields: string[]
    /** 抽出できず人間確認が要る記事フィールド（unconfirmed / 空） */
    unconfirmedFields: string[]
    /** テンプレート生成に不足している項目（ready な ArticleFacts があれば mapper.missing） */
    missingForTemplate: string[]
    /** 別記事の日付混入の疑いがあるか（FIX 4） */
    foreignDateSuspect: boolean
    /** templateEligible（今の ArticleFacts で決定的にテンプレ生成できるか） */
    templateEligible: boolean
    /** item5: ArticleFacts draft へ自動入力できる項目（confirmed。DB 書き込みなしの見込み） */
    autoFillFields: string[]
    /** item5: 人間が admin で入力する項目（自動化しない or 抽出できず） */
    humanInputFields: string[]
    /** item5: ハッシュタグ候補（機械生成・人間確認待ち・confirmed にしない） */
    hashtagCandidates: string[]
    /** 3段階判定：投稿可能（ready+eligible）／確認後可能（不足を人間が埋めれば可）／生成不可（C・種別不明） */
    decision: '投稿可能' | '確認後可能' | '生成不可'
    /** 推奨／保留／除外 */
    recommendation: '推奨' | '保留' | '除外'
    /** 判定理由（短文） */
    decisionReason: string
  }
}

/** 外部公式ページの決定的シグナル（未信頼データ。命令・コードは実行しない） */
export interface OfficialPageSignals {
  requested: boolean
  ok: boolean
  httpStatus?: number
  fetchedAt?: string
  finalUrl?: string
  sameHost?: boolean
  /** SSRF ガード / 許可ドメイン / robots で「取得しなかった」理由 */
  rejectedReason?: string
  /** 拒否したときの対象 URL（リダイレクト先を含む） */
  rejectedUrl?: string
  robotsChecked?: boolean
  robotsAllowed?: boolean
  /** 実際にたどった URL（手動リダイレクト検証の記録） */
  redirectChain?: string[]
  /** application/ld+json を JSON.parse しただけの生値（解釈しない） */
  jsonLd?: unknown[]
  /** JSON-LD の @type:Event から取れた開始/終了（決定的抽出のみ） */
  jsonLdEventStart?: string
  jsonLdEventEnd?: string
  ogImage?: string
  /** ページ内の .pdf リンク（絶対 URL 化済み・同ホストのみ） */
  pdfLinks?: string[]
  /** タグ除去済みの本文プレーンテキスト（上限 12,000 字。サイト別アダプタが近傍抽出に使う） */
  bodyText?: string
  bytes?: number
  /** タイムアウト・接続エラー等（rejectedReason は「意図的に取得しなかった」区別） */
  error?: string
}

/** ArticleFacts 候補（構造化プロポーザル。DB へは書かない） */
export interface ArticleFactsCandidate {
  discoveredContentId: number
  /** 取得できた構造化値（推測で埋めない。取れなければ null） */
  fields: {
    officialSourceName: string | null
    sourceUrl: string | null
    sourceName: string | null
    verifiedAt: string | null
    publishedAt: string | null
    eventStartAt: string | null
    eventEndAt: string | null
    applyDeadline: string | null
    venue: string | null
    price: string | null
    capacity: string | null
    audience: string | null
  }
  /**
   * 公式ページ本文 or 構造化データから決定的に取れた「記事フィールド」候補（2026-09-03）。
   * それぞれ confirmationStatus を持つ。confirmed のものだけを ArticleFacts へ自動登録する
   * （推測補完なし・関連記事の値は confirmed にしない）。
   */
  extractedEventFacts: {
    eventName: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    eventDate: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    eventDateISO: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    eventTime: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    venuePlace: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    paid: { value: 'free' | 'paid' | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    applyRequired: { value: 'yes' | 'no' | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    /** 公式本文に明記された概要（1〜2文）。取れなければ null＝人間が入力 */
    whatHappens: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    /** 最終日時間変更・休業・注意事項の明記のみ。無ければ null＝人間が入力 */
    officialInfoNote: { value: string | null; confirmationStatus: 'confirmed' | 'unconfirmed'; method: string }
    /** ハッシュタグ候補（機械生成・人間確認待ち。confirmed にしない） */
    hashtagCandidates: string[]
    /** 対象イベント名が公式本文に現れたか（近傍照合の前提） */
    targetNameFoundInBody: boolean
    /** どのサイト別アダプタを使ったか */
    adapter: string
  }
  /** フィールドごとの根拠（値 / 取得元 URL / 取得日時 / 確認日時 / 抽出方法 / 確認状態） */
  provenance: Record<
    string,
    {
      value: string
      sourceUrl: string | null
      capturedAt: string | null
      verifiedAt: string | null
      method: string
      confirmationStatus: 'confirmed' | 'unconfirmed'
    }
  >
  detailPage: { url: string | null; lastCrawledAt: string | null; activeFetch: OfficialPageSignals | null }
  pdf: { found: boolean; url: string | null; activeFetch: OfficialPageSignals | null; note: string }
  imagePolicy: string
  /** テンプレ必須で取れていない項目（推測補完しない） */
  missingRequired: string[]
  /** 相互矛盾（開始>終了、JSON-LD と DC の乖離 等） */
  conflicts: string[]
  /** ready 判定の内訳（人間が admin で ready 化するときの残作業チェックリスト） */
  readyCheck: {
    allRequiredPresent: boolean
    everyRequiredHasSourceUrl: boolean
    datesValidNow: boolean
    noConflicts: boolean
    trustedSource: boolean
    noSpeculativeFill: boolean
    blockers: string[]
  }
  /** 必須が揃い根拠つき・未来・非重複・銀座・出典追跡可・情報が新しい */
  readyEligible: boolean
  /** readyEligible のときだけ 'ready'。それ以外は 'draft'（＝B判定） */
  proposedStatus: 'ready' | 'draft'
}

/** 7:10 レポート全体 */
export interface MorningReport {
  generatedAt: string
  /** 評価した承認済み DiscoveredContent 件数 */
  assessed: number
  counts: { A: number; B: number; C: number }
  /** A判定のみ・優先順位順（最大5）。A が5未満なら実数のみ */
  topA: CandidateAssessment[]
  /** A が5未満のとき true（B/C で埋めていない） */
  aShortfall: boolean
  /** B判定（参考・上位には載せない） */
  b: CandidateAssessment[]
  /** C判定（除外理由つき） */
  c: CandidateAssessment[]
}

// ─────────────────────────────────────────────────────────────
// 記事生成レディ最終候補ダイジェスト（2026-09-05）
//
// 「マロンが1件選べば、そのまま記事生成へ進める品質」を満たすための追加レイヤー。
// 既存の A/B/C 判定（above）はそのまま・無変更で使い、ここでは
//   ① 当日の一次情報／公式情報が実際に取得できたか（officialFetch.ok）
//   ② 施設・カテゴリーの多様性（同一施設上限2件・原則4カテゴリー以上）
//   ③ 決定的テンプレートによる編集ブリーフ（切り口・タイトル案・導入案・構成案・
//     推奨記事量・無料/有料候補）
// を追加する。AI 呼び出し・DB 書き込みは一切ない（純粋関数のみ）。
// ─────────────────────────────────────────────────────────────

/** 当日の公式ページ取得の成否（fetchOfficialSignals の結果を要約） */
export interface OfficialFetchOutcome {
  requested: boolean
  ok: boolean
  httpStatus?: number
  fetchedAt?: string
  /** SSRF/許可ドメイン外等で「意図的に取得しなかった」理由 */
  rejectedReason?: string
  /** HTTP エラー・タイムアウト等 */
  error?: string
}

/** 記事生成レディ判定・多様性判定に必要な追加情報（CandidateAssessment に付与） */
export interface DigestMeta {
  venue: string | null
  officialFetch: OfficialFetchOutcome | null
  /** extractPriceHint の結果（見つからなければ null＝「確認できません」表示） */
  priceHint: string | null
  facilityKey: string | null
  facilityLabel: string
  /** 18カテゴリーの暫定判定（deriveProvisionalCategory 由来） */
  category: string | null
  categoryBasis: 'primaryCategory' | 'title' | 'templateType' | null
  publishedAt: string | null
  /** 承認済み DiscoveredContent 由来か、偏り補正済み inbox 推奨候補由来か */
  origin: 'approved' | 'inbox-recommended'
}

/** 決定的テンプレートによる編集ブリーフ（AI なし・たたき台） */
export interface EditorialBrief {
  /** コアターゲット（20代後半〜30代女性）適合度 0-100 */
  targetFitScore: number
  /** 適合理由（computeTargetFitScore.reason をそのまま使う） */
  targetFitReason: string
  /** GINZA WHISKERS 独自の記事切り口 */
  ginzaWhiskersAngle: string
  /** タイトル案（2〜3案。決定的テンプレートによるたたき台） */
  titleCandidates: string[]
  /** 導入案（1段落） */
  introDraft: string
  /** 記事構成案（見出しラベルの配列） */
  structureOutline: string[]
  /** 推奨記事量 */
  recommendedLength: { tier: 'short' | 'medium' | 'long'; charRange: string; reason: string }
  /** 無料／有料候補の判定（収益化②の検討材料。最終判断はマロン） */
  payFreeCandidate: { type: 'free' | 'paid_candidate'; reason: string }
}

/** 記事生成レディ最終候補（1件） */
export interface FinalCandidateEntry {
  discoveredContentId: number
  officialName: string
  verifiedAt: string | null
  publishedAt: string | null
  eventPeriod: string
  venue: string
  price: string
  sourceUrl: string
  sourceName: string
  facilityKey: string | null
  facilityLabel: string
  category: string | null
  origin: 'approved' | 'inbox-recommended'
  brief: EditorialBrief
}

export interface ExcludedDigestEntry {
  discoveredContentId: number
  title: string
  reason: string
}

/** 記事生成レディ最終候補ダイジェスト全体 */
export interface FinalCandidateDigest {
  generatedAt: string
  /** 確定候補（最大5件。水増しなし＝品質条件を満たす件数だけ） */
  candidates: FinalCandidateEntry[]
  /** 除外候補（理由つき） */
  excluded: ExcludedDigestEntry[]
  diversitySummary: {
    categoriesUsed: number
    categoryList: string[]
    facilityCounts: Record<string, number>
    minCategoriesTarget: number
    /** 候補が5件未満のときは常に true（データ制約であり未達ではない） */
    achievedDiversity: boolean
  }
  /** 確定候補が5件未満のとき true */
  shortfall: boolean
  /** 今回の評価対象件数（承認済み＋補完した inbox 推奨候補の合計） */
  evaluatedCount: number
}
