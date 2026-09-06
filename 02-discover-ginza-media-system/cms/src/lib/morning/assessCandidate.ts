// GINZA WHISKERS / Project 02 P0 改善（2026-09-02）— A/B/C 判定（純粋関数・AI なし）。
//
// 【判定基準（ユーザー確定・2026-09-02）】
//   C（記事候補から除外）: 開催終了 / 既投稿と重複 / 銀座関連性を確認できない /
//                          追跡可能な公式出典が無い
//   A（即記事化可・上位提示対象）: C でない かつ
//       ・ArticleFacts が ready（必須項目がすべて確認済み）
//       ・templateEligible:true
//       ・追跡可能な公式 URL を持つ
//       ・情報の確認日時が新しい（既定 14 日以内）
//     → 20〜30 分で記事化できる見込み
//   B（未確認あり・上位5件には原則含めない）: C でも A でもない。
//       不足項目（missing）と、A へ引き上げるための追加所要時間を明示する。
//
// 「完璧」＝必須項目を確認できた案件だけを A とする。未確認情報は推測で埋めない
// ——missing / unconfirmed に列挙するだけ。

import {
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../template/mapDiscoveredContentToEventFields'
import { assessGinzaRelevance, isSingleGinzaVenueSource } from './ginzaRelevance'
import { imagePreflight } from './imagePreflight'
import { isPastEventEnd } from '../curation/eventEndBoundary'
import type { CandidateAssessment, FactKind } from './types'

export interface AssessCandidateInput {
  dc: DiscoveredContentLike
  facts?: ArticleFactsLike
  /**
   * 記事タイプ分類の結果（ArticleFacts 抽出より前に決定的に判定済み）。
   * 'event' のみ event 用 mapper（templateEligible / factsSource）で A 判定する。
   * 'product_news' / 'unknown' は event 必須項目で評価しない（常に B か C）。
   */
  factKind?: FactKind
  /** 重複判定（呼び出し元が実施。dedupCheck.ts の多シグナル結果を詰める） */
  dedup: {
    duplicate: boolean
    possibleDuplicate?: boolean
    existingArticleId?: number
    notePublished?: boolean
    signalSummary?: string[]
    externalUnverified?: boolean
  }
  /** 画像在庫（media/image-assets/ ＋ image-assets コレクション名の小文字連結） */
  imageInventory: string[]
  /** 基準時刻（決定的テスト用。既定 new Date()） */
  now?: Date
  /** 情報鮮度のしきい値（日）。これより古い確認日時は A から B へ落とす（既定 14） */
  freshnessDays?: number
}


function toDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000
}

/** サイトナビ由来のノイズを避けた表示用タイトル */
function displayTitleOf(title: string): string {
  const parts = title.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    // 「◯◯ | 公式イベント情報 | … | GINZA OFFICIAL」→ 先頭のみ
    return parts[0]
  }
  return title.trim()
}

export function assessCandidate(input: AssessCandidateInput): CandidateAssessment {
  const { dc, facts, dedup } = input
  const now = input.now ?? new Date()
  const freshnessDays = input.freshnessDays ?? 14

  const map = mapDiscoveredContentToEventFields(dc, { facts, now })

  const title = (dc.title ?? '').trim() || `DiscoveredContent #${dc.id}`
  const displayTitle = displayTitleOf(title)
  const sourceName = (dc.sourceSiteName ?? '').trim() || '（出典サイト名 未解決）'
  const sourceUrl = (dc.articleUrl ?? '').trim()
  const verifiedAt = typeof dc.lastCheckedAt === 'string' ? dc.lastCheckedAt : undefined

  // --- 決定的な素性 ---
  const hasTraceableSource = /^https?:\/\/\S+$/.test(sourceUrl)

  // 銀座関連性：情報源名だけで通さない。個別記事のタイトル・会場・URL を確認し、
  // 銀座外の特定支店（◯◯テラス店 等）・市区の明記があれば除外する（推測しない）。
  const gr = assessGinzaRelevance({
    title: dc.title,
    venue: dc.venue,
    areaLead: facts?.areaLead,
    eventName: facts?.eventName,
    excerpt: dc.excerpt,
    sourceName: dc.sourceSiteName,
    articleUrl: dc.articleUrl,
    sourceIsSingleGinzaVenue: isSingleGinzaVenueSource(dc.sourceSiteName, dc.articleUrl),
  })
  const ginzaRelevant = gr.ginzaRelevant
  const ginzaRelevanceBasis = gr.basis

  const endIsoRaw = dc.eventEndAt ?? dc.eventStartAt ?? facts?.eventDateISO ?? null
  const endD = toDate(endIsoRaw)
  // 2026-09-06、根本改善：event_end_at が日付のみ（時刻情報なし）の場合、
  // 日本時間の当日23:59:59までは開催中として扱い、翌日から終了済みにする
  // （終了時刻が明示されている場合はその時刻をそのまま優先。isPastEventEnd参照）。
  const expired = endD !== null && isPastEventEnd(endIsoRaw, now)

  // --- 表示用の期間 / 期限 ---
  const startD = toDate(dc.eventStartAt) ?? toDate(facts?.eventDateISO)
  let eventPeriod = '不明'
  if (facts?.eventDate) eventPeriod = String(facts.eventDate)
  else if (startD && endD && startD.getTime() !== endD.getTime())
    eventPeriod = `${startD.toISOString().slice(0, 10)} 〜 ${endD.toISOString().slice(0, 10)}`
  else if (startD) eventPeriod = startD.toISOString().slice(0, 10)
  const applyDeadline = (facts?.applyDeadline && String(facts.applyDeadline)) || '不明／なし'

  // --- 画像 preflight（候補提示前に確定） ---
  const image = imagePreflight({
    season: map.fields?.season ?? facts?.season ?? null,
    categoryLabel: dc.contentType ? contentTypeToLabel(dc.contentType) : null,
    inventory: input.imageInventory,
  })

  // --- 確認できた必須項目 / 不足 / 曖昧 ---
  // mapper（evaluateReadyGate 一本化・2026-09-03）は templateType='sale' も判定できるが、
  // それが sale として意味を持つのは ArticleFacts が ready のとき（mapFromReadyFacts 経路）
  // のみ——draft/none/withdrawn のときは mapper が event 用フォールバック分岐に入り、
  // product_news には無関係な missing（venues 等）を出してしまう。不足項目は
  // extractProductNewsFactsCandidate.unknownItems 側で別途表示するため、ready でない
  // product_news では従来どおり空のままにする（2026-09-06、根本改善：A判定の可否に
  // 使う map.factsSource/map.templateEligible 自体は常に mapper の値をそのまま使う）。
  const isEventKind = input.factKind === undefined || input.factKind === 'event'
  const isReadyProductNews = input.factKind === 'product_news' && map.factsSource === 'ready'
  const usesMapperDetails = isEventKind || isReadyProductNews
  const verifiedItems = usesMapperDetails ? map.captured.map((c) => `${c.field}=${c.value}`) : []
  const missing = usesMapperDetails ? [...map.missing] : []
  const unconfirmed = usesMapperDetails ? [...map.ambiguous] : []

  // 情報鮮度
  let stale = false
  const vD = toDate(verifiedAt)
  if (!vD) {
    unconfirmed.push('情報の確認日時（lastCheckedAt）が無い')
  } else if (daysBetween(now, vD) > freshnessDays) {
    stale = true
    unconfirmed.push(`情報の確認日時が古い（${Math.round(daysBetween(now, vD))}日前 > ${freshnessDays}日）。再確認が必要`)
  }

  // --- A / B / C 判定 ---
  const reasons: string[] = []
  let verdict: CandidateAssessment['verdict']

  if (expired) {
    verdict = 'C'
    reasons.push(`開催終了済み（終了日 ${endD?.toISOString().slice(0, 10)} < 基準日）`)
  } else if (dedup.duplicate) {
    verdict = 'C'
    if (dedup.signalSummary && dedup.signalSummary.length > 0)
      reasons.push(`既投稿と重複（${dedup.signalSummary.join(' / ')}）`)
    else if (dedup.existingArticleId != null)
      reasons.push(`既投稿と重複（Article #${dedup.existingArticleId} が同じ DiscoveredContent を参照済み）`)
    else if (dedup.notePublished)
      reasons.push('既投稿と重複（.devlogs の note 記録が published 済み。Article 未ひも付け）')
    else reasons.push('既投稿と重複')
  } else if (!ginzaRelevant) {
    verdict = 'C'
    reasons.push(`銀座関連性を確認できない：${ginzaRelevanceBasis}`)
  } else if (!hasTraceableSource) {
    verdict = 'C'
    reasons.push('追跡可能な公式出典 URL が無い')
  } else if (input.factKind === 'unknown') {
    // 記事タイプ判定不能：推測で event / product_news に分類しない → B のまま人間へ
    verdict = 'B'
    reasons.push('記事タイプを判定できない（event / product_news のシグナルが揃わない・矛盾）。推測分類はしない。8:00 で人間が判断')
  } else if (input.factKind === 'product_news') {
    // 2026-09-06、根本改善：product_news も evaluateReadyGate（templateType='sale'）で
    // 商品名(contentTitle)・商品概要(contentSummary)・販売期間(availablePeriod+eventDateISO)・
    // 価格(priceText)・購入条件等(officialInfoNote)・confirmed出典・ハッシュタグを一本化して
    // 判定できる（2026-09-03の共通Article Facts化で mapper 側は既に対応済み）。
    // enrichmentStatus='ready' は ArticleFacts.beforeChange がログイン済み人間の操作でしか
    // 設定できない（AI・自動化からの直接遷移は不可）ため、ここに到達する時点で
    // 必須項目のconfirmedと人間確認は担保されている。humanReviewedAt の明示確認は
    // 「人間確認なしの自動A昇格を禁止する」ことの二重防御（belt and suspenders）。
    const eligible = map.templateEligible && map.factsSource === 'ready' && !!facts?.humanReviewedAt
    if (eligible && !stale) {
      verdict = 'A'
      reasons.push(
        '記事タイプ＝product_news（商品ニュース）／必須項目（商品名・価格・販売期間・購入条件・出典）が' +
          'confirmedでArticleFacts ready・人間レビュー済み（humanReviewedAt設定）／templateEligible:true／公式出典あり／情報が新しい',
      )
    } else {
      verdict = 'B'
      reasons.push('記事タイプ＝product_news（商品ニュース）')
      if (map.factsSource === 'none') reasons.push('ArticleFacts が未作成（必須項目が構造化されていない）')
      else if (map.factsSource === 'draft')
        reasons.push(
          'ArticleFacts が draft（商品名・価格・販売期間・購入条件・出典を公式で人間が確定入力し、human_reviewed で ready にする必要あり）',
        )
      else if (map.factsSource === 'withdrawn') reasons.push('ArticleFacts が withdrawn')
      else if (!map.templateEligible) reasons.push('必須項目に不足あり（下記 missing）')
      else if (!facts?.humanReviewedAt) reasons.push('human_reviewed_at が未設定（人間レビュー未確認のため自動A昇格しない）')
      if (stale) reasons.push('情報の確認日時が古く再確認が必要')
    }
  } else {
    // factKind === 'event'（未指定は後方互換で event 扱い）
    const eligible = map.templateEligible && map.factsSource === 'ready'
    if (eligible && !stale) {
      verdict = 'A'
      reasons.push('記事タイプ＝event／必須項目を確認済み（ArticleFacts ready）／templateEligible:true／公式出典あり／情報が新しい')
    } else {
      verdict = 'B'
      reasons.push('記事タイプ＝event')
      if (map.factsSource === 'none') reasons.push('ArticleFacts が未作成（必須項目が構造化されていない）')
      else if (map.factsSource === 'draft') reasons.push('ArticleFacts が draft（human_reviewed で ready にする必要あり）')
      else if (map.factsSource === 'withdrawn') reasons.push('ArticleFacts が withdrawn')
      else if (!map.templateEligible) reasons.push('必須項目に不足あり（下記 missing）')
      if (stale) reasons.push('情報の確認日時が古く再確認が必要')
    }
  }

  // 重複の弱シグナル・外部未確認は verdict を動かさず「未確認事項」に出す（8:00 の人間ゲート向け）
  if (dedup.possibleDuplicate && dedup.signalSummary && dedup.signalSummary.length > 0)
    unconfirmed.push(`重複の可能性（弱シグナル）: ${dedup.signalSummary.join(' / ')}`)
  if (dedup.externalUnverified)
    unconfirmed.push('外部公開記録は未確認・マロン最終確認（システムは外部 note を巡回しない。8:00 の人間選定が最終ゲート）')

  // --- 所要時間 ---
  const A_MIN = 25 // 20〜30 の中央
  let estimateMinutes = A_MIN
  let bAdditionalMinutes: number | undefined
  if (verdict === 'B') {
    // 不足カテゴリ数 × 15 分（会場/日付/期限/料金…）＋ ArticleFacts 作成分。上限 90。
    const perItem = 15
    const factsCreate = map.factsSource === 'none' ? 20 : 10
    bAdditionalMinutes = Math.min(90, factsCreate + missing.length * perItem + (stale ? 15 : 0))
    estimateMinutes = A_MIN + bAdditionalMinutes
  } else if (verdict === 'C') {
    estimateMinutes = 0
  }

  return {
    discoveredContentId: Number(dc.id),
    title,
    displayTitle,
    sourceName,
    sourceUrl,
    verifiedAt,
    verdict,
    reasons,
    verifiedItems,
    missing,
    unconfirmed,
    dedup,
    expired,
    ginzaRelevant,
    ginzaRelevanceBasis,
    hasTraceableSource,
    factKind: input.factKind ?? 'event',
    // event 用 mapper の値は event 記事にのみ意味がある
    // factsSource は event/product_news なら常に mapper の実値（none/draft/withdrawn/ready）を
    // そのまま使う（unknown のみ 'none' 固定）。verdict 理由分岐（map.factsSource==='draft' 等）が
    // 正しく機能するために必要（2026-09-06）。
    factsSource: isEventKind || input.factKind === 'product_news' ? map.factsSource : 'none',
    templateEligible: usesMapperDetails ? map.templateEligible : false,
    image,
    eventPeriod,
    applyDeadline,
    estimateMinutes,
    bAdditionalMinutes,
  }
}

/** contentType（event / exhibition / …）→ カテゴリー画像ラベル */
function contentTypeToLabel(ct: string): string {
  const m: Record<string, string> = {
    event: 'イベント',
    exhibition: '展覧会',
    article: 'アート・文化',
    news: 'アート・文化',
  }
  return m[ct] ?? 'アート・文化'
}
