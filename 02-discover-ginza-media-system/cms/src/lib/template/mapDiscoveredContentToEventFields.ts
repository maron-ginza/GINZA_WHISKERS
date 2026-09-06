import { evaluateReadyGate, type AppliedTemplate, type CommonArticleFacts, type TemplateType } from './readyGate'
import { TEMPLATE_DEFAULT_CTA, type EventArticleFields } from './templates'
import type { TemplateArticleInput, TemplateSourceProvenance } from './renderArticleFromTemplate'
import { isPastEventEnd } from '../curation/eventEndBoundary'

// GINZA WHISKERS / Project 02 改善（2026-09-02）。
//
// 実際の DiscoveredContent（1レコード）を、追加API課金0円のテンプレート入力
// EventArticleFields へ変換する純粋関数。
//
//   ・Claude API / 他の生成AI / DB / Payload には依存しない（呼び出し元が
//     読み取り済みのプレーンオブジェクトを渡す）。
//   ・同じ入力（+ 同じ now）からは必ず同じ出力（決定的）。
//   ・**推測で補完しない**：構造化フィールドとして存在する値だけを使う。
//     excerpt 本文からの日付・会場・条件の抽出は行わない。
//
// 【第2段階B】DiscoveredContent 単体からの変換。構造化された申込期限・会場
// 一覧・回次・テーマ等が無いため、現行データでは常に templateEligible=false /
// route='human_review'（AI へ自動送信しない安全経路）。
//
// 【第2段階C Stage 2（2026-09-02）】options.facts（ArticleFacts サイドカーの
// 読み取り値）を追加。**enrichmentStatus === 'ready' の ArticleFacts があり、
// かつ必須項目がすべて揃っている場合のみ** templateEligible=true / route=
// 'template' を返す。facts が無い／draft／withdrawn／不足あり の場合は、従来
// どおり templateEligible=false / route='human_review' を維持する。
//   ・facts は「人間が入力した構造化ファクト」。mapper はそれをそのまま使い、
//     ここでも一切推測補完しない（空欄は missing として扱う）。
//   ・出典URL・確認日は facts ではなく DiscoveredContent の機械確認値を使う。
//   ・過去/未来の判定は facts.eventDateISO（無ければ dc.eventStartAt）で行い、
//     機械日付が無ければ eligible にしない（過去を除外できないため）。

/** DiscoveredContent から読み取ったプレーン値（呼び出し元が findByID の結果から詰める） */
export interface DiscoveredContentLike {
  id: number | string
  title?: string | null
  excerpt?: string | null
  /** 正規化後の記事/イベント URL */
  articleUrl?: string | null
  /** sourceSite リレーションの name を解決したもの */
  sourceSiteName?: string | null
  publishedAt?: string | null
  contentUpdatedAt?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  venue?: string | null
  contentType?: string | null
  uxType?: string | null
  lastCheckedAt?: string | null
  detectedAt?: string | null
  /** 日付抽出の根拠。confidence が無ければ「抽出が曖昧」とみなす。
   *  source（'json_ld' / 'body_label' 等）は「別記事の会期を拾った」疑いの判定に使う。 */
  dateExtraction?: {
    eventStartAt?: { value?: string | null; confidence?: string | null; source?: string | null } | null
    eventEndAt?: { value?: string | null; confidence?: string | null; source?: string | null } | null
  } | null
}

/**
 * ArticleFacts サイドカー（`article-facts` コレクション）から読み取ったプレーン値。
 * Payload の生成型（ArticleFact）に依存しないよう、必要なフィールドだけを緩く定義する。
 * 呼び出し元が `payload.findByID`/`find` の結果から詰める（Stage 2 では書き込みはしない）。
 */
export interface ArticleFactsLike {
  enrichmentStatus?: 'draft' | 'ready' | 'withdrawn' | string | null
  /**
   * 2026-09-06追加：ready 化した人間の操作日時（ArticleFacts.beforeChange が
   * req.user 必須で自動設定する）。factsSource==='ready' は本来この値が
   * 設定されていることを前提とするが、product_news の A 判定（2026-09-06追加・
   * 人間確認なしの自動A昇格を禁止する二重防御）では明示的にも確認する。
   */
  humanReviewedAt?: string | null
  /** 記事テンプレート種別（ArticleFacts.templateType）。判定は evaluateReadyGate に一本化 */
  templateType?: TemplateType | string | null
  /** 18カテゴリー（ArticleFacts.primaryCategory）。sale の見出し等で使う */
  primaryCategory?: string | null
  season?: string | null
  eventName?: string | null
  editionLabel?: string | null
  theme?: string | null
  whatHappens?: string | null
  eventDate?: string | null
  eventDateISO?: string | null
  eventTime?: string | null
  venues?: ({ name?: string | null; place?: string | null } | null)[] | null
  areaLead?: string | null
  audienceNote?: string | null
  paid?: 'paid' | 'free' | 'unknown' | string | null
  /** 価格の表示文字列（sale / generic 用。paid 列とは別） */
  priceText?: string | null
  applyRequired?: 'yes' | 'no' | string | null
  applyDeadline?: string | null
  resultDate?: string | null
  resultRule?: string | null
  applyRule?: string | null
  officialInfoNote?: string | null
  editorsNoteSeed?: string | null
  closing?: string | null
  callToAction?: string | null
  hashtags?: ({ tag?: string | null } | null)[] | null
  sourceProvenanceFacts?:
    | ({
        fact?: string | null
        sourceType?: 'primary' | 'official' | 'secondary' | string | null
        factType?: string | null
        verificationStatus?: 'confirmed' | 'unconfirmed' | 'conflicting' | string | null
      } | null)[]
    | null
}

export interface MapOptions {
  /** 過去イベント判定の基準時刻。決定的テストのため明示指定可（既定 new Date()） */
  now?: Date
  /** マロンの任意入力（編集後記の種）。facts.editorsNoteSeed が空のときのフォールバック */
  editorsNoteSeed?: string
  /** ArticleFacts サイドカーの読み取り値（呼び出し元が読み込んで渡す。書き込みはしない） */
  facts?: ArticleFactsLike
  /**
   * DC レベルの記事種別分類（classifyTemplateType の結果。2026-09-03 追加）。
   * 'application' / 'workshop' のときは applyRequired 未設定でも exhibition バリアントにしない
   * （公募・参加要件が抜けるのを防ぐ）。未指定なら従来どおり applyRequired と回次・テーマで判定。
   */
  templateType?:
    | 'exhibition'
    | 'application'
    | 'workshop'
    | 'sale'
    | 'recurring_event'
    | 'generic'
    | 'unknown'
}

export type TemplateRoute = 'template' | 'human_review'
export type FactsSource = 'none' | 'draft' | 'withdrawn' | 'ready'
/**
 * テンプレートのバリアント（2026-09-03、第二投稿 最小修正）。
 *   recurring_event: 回次・テーマ・抽選/当選発表を持つ催事（銀茶会型・従来）
 *   exhibition:      回次・テーマ・申込のない展覧会／個展／企画展
 */
export type TemplateVariant = 'recurring_event' | 'exhibition' | 'sale' | 'generic'

export interface CapturedItem {
  field: string
  value: string
}

export interface MapDiscoveredContentResult {
  discoveredContentId: string | number
  /** 必須項目がすべて揃ったか（ready な ArticleFacts が無い限り false） */
  templateEligible: boolean
  /** eligible=false は必ず人間確認へ。AI へ自動送信はしない */
  route: TemplateRoute
  /** ArticleFacts の状態: none=無し / draft / withdrawn / ready */
  factsSource: FactsSource
  /** テンプレートのバリアント（ready な facts があるときのみ確定。無ければ undefined） */
  variant?: TemplateVariant
  /**
   * renderArticleFromTemplate に渡す本文テンプレート（2026-09-03、共通 Article Facts 化）。
   * variant と 1:1（recurring_event / exhibition / sale / generic）。
   */
  appliedTemplate?: AppliedTemplate
  /** 取得できた項目 */
  captured: CapturedItem[]
  /** テンプレート必須だが取れなかった項目 */
  missing: string[]
  /** 値はあるが信頼できない／そのままは使えない項目 */
  ambiguous: string[]
  /** eligible のときのみ */
  fields?: EventArticleFields
  sourceMeta?: { sourceName: string; sourceUrl: string; verifiedAt?: string }
  provenance?: TemplateSourceProvenance[]
  hashtags?: string[]
}

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'] as const

/** UTC 月 → 季節（推測ではなく暦の対応） */
function seasonFromIso(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const m = d.getUTCMonth() + 1
  if (m >= 3 && m <= 5) return '春'
  if (m >= 6 && m <= 8) return '夏'
  if (m >= 9 && m <= 11) return '秋'
  return '冬'
}

/** ISO 文字列 → "YYYY年M月D日（曜）"。UTC 部品で決定的に整形（TZ 非依存） */
function formatJpDate(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAY_JP[d.getUTCDay()]}）`
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/\S+$/.test(s.trim())
}

/** タイトルがサイトナビ由来のノイズ（" | " 区切りが複数、末尾に媒体名）を含むか */
function titleLooksNoisy(title: string): boolean {
  const pipeCount = (title.match(/\s\|\s/g) ?? []).length
  return pipeCount >= 2 || /GINZA OFFICIAL|銀座公式ウェブサイト/.test(title)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function pickIso(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  return Number.isNaN(new Date(s).getTime()) ? null : s
}

function normEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(typeof v === 'string' ? v : '') ? (v as T) : fallback
}

function clip(s: string, n = 40): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

/**
 * CTA（本文末尾の行動喚起）を出すべき記事か。
 * **テンプレ既定文を無条件には出さない**。confirmed 事実（公式 URL）があり、
 * かつ「購入 / 参加・申込」の具体的な次の行動がある記事だけ true。
 */
function shouldEmitCta(tt: TemplateType, hasOfficialUrl: boolean, applyRequired: boolean): boolean {
  if (!hasOfficialUrl) return false
  return tt === 'sale' || applyRequired
}

/** sale の CTA 文（officialInfoNote に現れた確認済みの購入チャネルから決定的に組み立てる。推測しない） */
function saleCtaText(officialInfoNote: string): string {
  const hasEc = /EC予約|オンライン予約|WEB予約|ネット予約|オンライン販売|EC販売/.test(officialInfoNote)
  const hasStore = /店頭/.test(officialInfoNote)
  if (hasEc && hasStore) return 'EC予約・店頭販売の受付状況は、公式イベントページでご確認ください。'
  if (hasStore) return '店頭販売の最新情報は、公式イベントページでご確認ください。'
  if (hasEc) return 'EC予約の受付状況は、公式イベントページでご確認ください。'
  return '販売の詳細と最新情報は、公式イベントページでご確認ください。'
}

// ---------------------------------------------------------------------------
// ready な ArticleFacts から EventArticleFields を組み立てる（推測補完しない）
// ---------------------------------------------------------------------------
function mapFromReadyFacts(
  dc: DiscoveredContentLike,
  facts: ArticleFactsLike,
  options: MapOptions,
  base: {
    now: Date
    sourceName: string
    sourceUrl: string
    verifiedAt: string | undefined
    factsSource: FactsSource
  },
): MapDiscoveredContentResult {
  const { now, sourceName, sourceUrl, verifiedAt, factsSource } = base
  const captured: CapturedItem[] = []
  const missing: string[] = []
  const ambiguous: string[] = []

  // --- 出典（DiscoveredContent の機械確認値。facts には持たせない） ---
  if (sourceName) captured.push({ field: 'sourceName (DiscoveredContent.sourceSite.name)', value: sourceName })
  else missing.push('sourceName（DiscoveredContent.sourceSite.name が空）')
  if (sourceUrl && isHttpUrl(sourceUrl))
    captured.push({ field: 'sourceUrl (DiscoveredContent.articleUrl)', value: sourceUrl })
  else missing.push('sourceUrl（DiscoveredContent.articleUrl が空／URL 形式でない）')
  if (verifiedAt) captured.push({ field: 'verifiedAt (DiscoveredContent.lastCheckedAt/detectedAt)', value: verifiedAt })
  else ambiguous.push('verifiedAt（確認日時が取れない）')

  // --- 記事種別（templateType）の解決 ---
  //   ・options.templateType / facts.templateType が明示（exhibition/sale/application/
  //     workshop/recurring_event/generic）→ それを使う。
  //   ・'unknown' → 記事生成しない（evaluateReadyGate が eligible=false を返す）。
  //   ・未指定（レガシー呼び出し：assessCandidate 等の旧 ready 行）→ 構造から推定する。
  //     暗黙の exhibition 固定はしない（回次+テーマ→recurring_event、applyRequired=yes→
  //     application、priceText あり→sale、いずれも無ければ exhibition）。
  const ttRaw = str(options.templateType) || str(facts.templateType)
  const KNOWN_TT = ['exhibition', 'sale', 'application', 'workshop', 'recurring_event', 'generic', 'unknown'] as const
  const legacyInferredTt: TemplateType =
    str(facts.editionLabel) && str(facts.theme)
      ? 'recurring_event'
      : facts.applyRequired === 'yes'
        ? 'application'
        : str((facts as { priceText?: string | null }).priceText)
          ? 'sale'
          : 'exhibition'
  const resolvedTt: TemplateType = (KNOWN_TT as readonly string[]).includes(ttRaw)
    ? (ttRaw as TemplateType)
    : legacyInferredTt
  const templateTypeInferred = !ttRaw && resolvedTt !== 'unknown'

  // --- fields 組み立て用の抽出（判定そのものは evaluateReadyGate が担う） ---
  const venues = (Array.isArray(facts.venues) ? facts.venues : [])
    .map((v) => ({ name: str(v?.name), place: str(v?.place) }))
    .filter((v) => v.name && v.place)
  const hashtags = (Array.isArray(facts.hashtags) ? facts.hashtags : [])
    .map((h) => str(h?.tag))
    .filter(Boolean)
  const priceText = str((facts as { priceText?: string | null }).priceText)
  const paid = facts.paid === 'paid'
  const applyRequired = facts.applyRequired === 'yes'
  const applyDeadline = str(facts.applyDeadline)
  const resultDate = str(facts.resultDate)
  const resultRule = str(facts.resultRule)
  const applyRule = str(facts.applyRule)
  const editionLabel = str(facts.editionLabel)
  const theme = str(facts.theme)

  const isoForSeason = pickIso(facts.eventDateISO) ?? pickIso(dc.eventStartAt)
  let season = str(facts.season)
  if (!season && isoForSeason) season = seasonFromIso(isoForSeason) ?? ''

  const provenance: TemplateSourceProvenance[] = (Array.isArray(facts.sourceProvenanceFacts)
    ? facts.sourceProvenanceFacts
    : []
  )
    .filter((p) => str(p?.fact))
    .map((p) => ({
      fact: str(p?.fact),
      sourceType: normEnum(p?.sourceType, ['primary', 'official', 'secondary'] as const, 'official'),
      factType: normEnum(
        p?.factType,
        ['date', 'venue', 'price', 'reservation', 'hours', 'access', 'other'] as const,
        'other',
      ),
      verificationStatus: normEnum(
        p?.verificationStatus,
        ['confirmed', 'unconfirmed', 'conflicting'] as const,
        'confirmed',
      ),
    }))
  if (provenance.length === 0) {
    ambiguous.push('sourceProvenanceFacts が空：fact 単位の出典追跡なし（本文の出典行は sourceMeta から出る）')
  }

  // --- 種別別の必須判定は evaluateReadyGate に一本化（記事生成側で独自の exhibition 判定をしない）---
  const commonFacts: CommonArticleFacts = {
    primaryCategory: str(facts.primaryCategory) || null,
    templateType: resolvedTt,
    contentTitle: str(facts.eventName) || undefined,
    contentSummary: str(facts.whatHappens) || undefined,
    availablePeriod: str(facts.eventDate) || undefined,
    eventDateISO: (str(facts.eventDateISO) || str(dc.eventStartAt)) || undefined,
    eventTime: str(facts.eventTime) || undefined,
    venues,
    priceText: priceText || undefined,
    paid: (facts.paid as string | null) ?? undefined,
    applyRequired: (facts.applyRequired as string | null) ?? undefined,
    applyDeadline: applyDeadline || undefined,
    resultDate: resultDate || undefined,
    resultRule: resultRule || undefined,
    applyRule: applyRule || undefined,
    officialInfoNote: str(facts.officialInfoNote) || undefined,
    editionLabel: editionLabel || undefined,
    theme: theme || undefined,
    areaLead: str(facts.areaLead) || undefined,
    audienceNote: str(facts.audienceNote) || undefined,
    hashtags: hashtags.map((t) => ({ tag: t })),
    sourceProvenanceFacts: (Array.isArray(facts.sourceProvenanceFacts) ? facts.sourceProvenanceFacts : []).map(
      (p) => ({ fact: str(p?.fact), verificationStatus: str(p?.verificationStatus) || 'confirmed' }),
    ),
    enrichmentStatus: 'ready',
  }
  const gate = evaluateReadyGate(commonFacts, resolvedTt, { now })
  for (const m of gate.missing) missing.push(m)
  if (templateTypeInferred) {
    ambiguous.push(
      `templateType が ArticleFacts に未設定のため構造から「${resolvedTt}」と推定。admin で明示設定を推奨`,
    )
  }

  // captured（情報表示用。判定は gate が担う）
  if (str(facts.eventName)) captured.push({ field: 'eventName (ArticleFacts)', value: clip(str(facts.eventName)) })
  if (str(facts.eventDate)) captured.push({ field: 'eventDate (ArticleFacts)', value: clip(str(facts.eventDate)) })
  if (str(facts.eventTime)) captured.push({ field: 'eventTime (ArticleFacts)', value: clip(str(facts.eventTime)) })
  if (venues.length) captured.push({ field: 'venues (ArticleFacts)', value: `${venues.length}件` })
  if (hashtags.length) captured.push({ field: 'hashtags (ArticleFacts)', value: hashtags.join(' ') })
  if (priceText) captured.push({ field: 'priceText (ArticleFacts)', value: clip(priceText) })
  if (str(facts.officialInfoNote)) captured.push({ field: 'officialInfoNote (ArticleFacts)', value: clip(str(facts.officialInfoNote)) })
  if (season) captured.push({ field: 'season', value: season })

  const variant: TemplateVariant = gate.appliedTemplate

  const templateEligible = missing.length === 0
  const route: TemplateRoute = templateEligible ? 'template' : 'human_review'
  // variant → 本文テンプレート（evaluateReadyGate と 1:1。sale は専用 renderer）
  const appliedTemplate: AppliedTemplate = gate.appliedTemplate

  if (!templateEligible) {
    return {
      discoveredContentId: dc.id,
      templateEligible,
      route,
      factsSource,
      variant,
      appliedTemplate,
      captured,
      missing,
      ambiguous,
    }
  }

  const fields: EventArticleFields = {
    primaryCategory: str(facts.primaryCategory) || undefined,
    season,
    eventName: str(facts.eventName),
    editionLabel,
    theme,
    whatHappens: str(facts.whatHappens),
    eventDate: str(facts.eventDate),
    eventTime: str(facts.eventTime),
    venues,
    areaLead: str(facts.areaLead),
    audienceNote: str(facts.audienceNote),
    paid,
    priceText: priceText || undefined,
    applyDeadline,
    resultDate,
    resultRule,
    applyRule,
    officialInfoNote: str(facts.officialInfoNote),
    editorsNoteSeed: (str(facts.editorsNoteSeed) || str(options.editorsNoteSeed)) || undefined,
    closing: str(facts.closing) || '気になる方は、公式情報を確認のうえお出かけください。',
    // CTA：人間が入力した値があればそれを使う。無ければ「購入 / 申込がある記事」だけ
    //      confirmed 事実（公式 URL）に裏づけられた定型 CTA を出す。それ以外は空（本文末尾に CTA を出さない）。
    callToAction: (() => {
      const human = str(facts.callToAction)
      if (human) return human
      const hasOfficialUrl = !!(sourceUrl && isHttpUrl(sourceUrl))
      if (!shouldEmitCta(resolvedTt, hasOfficialUrl, applyRequired)) return ''
      return resolvedTt === 'sale' ? saleCtaText(str(facts.officialInfoNote)) : TEMPLATE_DEFAULT_CTA
    })(),
  }

  return {
    discoveredContentId: dc.id,
    templateEligible,
    route,
    factsSource,
    variant,
    appliedTemplate,
    captured,
    missing,
    ambiguous,
    fields,
    sourceMeta: { sourceName, sourceUrl, verifiedAt },
    provenance,
    hashtags,
  }
}

export function mapDiscoveredContentToEventFields(
  dc: DiscoveredContentLike,
  options: MapOptions = {},
): MapDiscoveredContentResult {
  const now = options.now ?? new Date()
  const facts = options.facts
  const factsSource: FactsSource = !facts
    ? 'none'
    : facts.enrichmentStatus === 'ready'
      ? 'ready'
      : facts.enrichmentStatus === 'withdrawn'
        ? 'withdrawn'
        : 'draft'

  // 出典（DiscoveredContent の機械確認値）— 両分岐で使う
  const sourceName = str(dc.sourceSiteName)
  const sourceUrl = str(dc.articleUrl)
  const verifiedAt = str(dc.lastCheckedAt) || str(dc.detectedAt) || undefined

  // ready な ArticleFacts があれば、そこから組み立てる
  if (factsSource === 'ready') {
    return mapFromReadyFacts(dc, facts as ArticleFactsLike, options, {
      now,
      sourceName,
      sourceUrl,
      verifiedAt,
      factsSource,
    })
  }

  // === DiscoveredContent 単体からの変換（現行の安全経路。templateEligible は常に false） ===
  const captured: CapturedItem[] = []
  const missing: string[] = []
  const ambiguous: string[] = []

  if (sourceName) captured.push({ field: 'sourceName (sourceSite.name)', value: sourceName })
  else missing.push('sourceName（sourceSite.name が空）')
  if (sourceUrl && isHttpUrl(sourceUrl)) captured.push({ field: 'sourceUrl (articleUrl)', value: sourceUrl })
  else missing.push('sourceUrl（articleUrl が空／URL 形式でない）')

  if (verifiedAt) captured.push({ field: 'verifiedAt (lastCheckedAt/detectedAt)', value: verifiedAt })
  else ambiguous.push('verifiedAt（確認日時が取れない）')

  if (dc.title && dc.title.trim()) {
    if (titleLooksNoisy(dc.title)) {
      ambiguous.push('title（サイトナビ由来のノイズを含む・クレンジングが必要）')
    } else {
      captured.push({ field: 'title', value: dc.title.trim() })
    }
  } else {
    missing.push('title')
  }

  const startIso = str(dc.eventStartAt)
  const endIso = str(dc.eventEndAt)
  const startConf = dc.dateExtraction?.eventStartAt?.confidence ?? null
  if (!startIso) {
    missing.push('eventDate（eventStartAt が未設定）')
  } else if (Number.isNaN(new Date(startIso).getTime())) {
    missing.push('eventDate（eventStartAt が日付として解釈できない）')
  } else if (!startConf) {
    ambiguous.push('eventDate（dateExtraction に信頼度が無い＝抽出根拠が曖昧）')
    missing.push('eventDate（抽出が曖昧なため自動生成対象外）')
  } else {
    // 2026-09-06、根本改善：event_end_at が日付のみ（時刻情報なし）の場合、
    // 日本時間の当日23:59:59までは開催中として扱う（isPastEventEnd参照）。
    const refEndIso = endIso && !Number.isNaN(new Date(endIso).getTime()) ? endIso : startIso
    if (isPastEventEnd(refEndIso, now)) {
      missing.push('eventDate（開催日／会期が過去）')
    } else {
      const d = formatJpDate(startIso)
      const s = seasonFromIso(startIso)
      if (d) captured.push({ field: 'eventDate (eventStartAt)', value: d })
      if (s) captured.push({ field: 'season (eventStartAt の月から)', value: s })
    }
  }

  const hasStartTime = startIso && !/T00:00:00(\.000)?Z?$/.test(startIso) && /T\d{2}:\d{2}/.test(startIso)
  const hasEndTime = endIso && /T\d{2}:\d{2}/.test(endIso) && !/T00:00:00(\.000)?Z?$/.test(endIso)
  if (hasStartTime && hasEndTime) {
    const s = new Date(startIso)
    const e = new Date(endIso)
    captured.push({
      field: 'eventTime (eventStartAt/eventEndAt)',
      value: `${s.getUTCHours()}時から${e.getUTCHours()}時まで`,
    })
  } else {
    missing.push('eventTime（開始・終了の時刻が構造化されていない）')
  }

  const venueRaw = str(dc.venue)
  if (venueRaw) {
    captured.push({ field: 'venue (raw text)', value: venueRaw })
    ambiguous.push('venue（単一テキスト。テンプレ必須の構造化会場一覧〈name+place〉には足りない）')
  }
  missing.push('venues（構造化された会場一覧: name + place）')

  const NOT_STRUCTURED = [
    'editionLabel（例: 第24回。構造化フィールドが無い）',
    'theme（例: 和（わ）。構造化フィールドが無い）',
    'whatHappens（何が行われるか。excerpt からの推測はしない）',
    'areaLead（対象エリア/企画数の前置き）',
    'audienceNote（対象読者）',
    'paid（有料/無料）',
    'applyDeadline（申込期限）',
    'resultDate（当選発表日）',
    'resultRule（当選発表の方法）',
    'applyRule（申込条件）',
    'officialInfoNote（公式情報の補足）',
  ]
  missing.push(...NOT_STRUCTURED)

  if (dc.contentType) captured.push({ field: 'contentType', value: dc.contentType })
  if (dc.uxType) captured.push({ field: 'uxType', value: dc.uxType })
  if (dc.excerpt && dc.excerpt.trim()) {
    captured.push({ field: 'excerpt（参考・本文には使わない）', value: `${dc.excerpt.trim().slice(0, 40)}…` })
  }

  if (factsSource === 'draft' || factsSource === 'withdrawn') {
    ambiguous.push(
      `ArticleFacts は存在するが enrichmentStatus=${factsSource}（ready ではないため templateEligible にしない）`,
    )
  }

  // DiscoveredContent 単体では構造化フィールドが不足するため常に false。
  return {
    discoveredContentId: dc.id,
    templateEligible: false,
    route: 'human_review',
    factsSource,
    captured,
    missing,
    ambiguous,
  }
}

// ---------------------------------------------------------------------------
// eligible な判定結果 → renderArticleFromTemplate に渡す TemplateArticleInput
// （純粋。DB・AI なし。not eligible なら null）
// ---------------------------------------------------------------------------
export function buildTemplateArticleInput(
  result: MapDiscoveredContentResult,
  relatedArticleTitles: string[] = [],
): TemplateArticleInput | null {
  if (!result.templateEligible || !result.fields || !result.sourceMeta) return null
  return {
    discoveredContentId: result.discoveredContentId,
    fields: result.fields,
    sourceName: result.sourceMeta.sourceName,
    sourceUrl: result.sourceMeta.sourceUrl,
    verifiedAt: result.sourceMeta.verifiedAt,
    sourceProvenance: result.provenance ?? [],
    hashtags: result.hashtags ?? [],
    relatedArticleTitles,
    appliedTemplate: result.appliedTemplate,
  }
}
