// GINZA WHISKERS / Project 02 P0 改善（2026-09-02、2026-09-15 A判定候補不足の是正で全面改訂）
// — A/B/C 判定（純粋関数・AI なし）。
//
// 【判定基準（2026-09-15改訂・マロン指示）】
//   C（候補提示不可・安全条件。変更なし）: 開催終了 / 既投稿と重複 / 銀座関連性を
//                      確認できない / 追跡可能な公式出典が無い
//   A（旬の候補として提示可能。18カテゴリー共通の目的型／発見型ロジック）：
//     C でない かつ target­OrDiscoveryEligibility.ts の6条件をすべて満たす候補
//     （銀座で購入・飲食・鑑賞・利用・体験できる／公式情報で場所・提供状況を確認
//     できる／季節性・新規性・期間性・話題性・発見性のいずれかがある／非重複／
//     非終了／18カテゴリーへ分類できる）。**ArticleFacts.enrichmentStatus='ready'
//     （人間による事前データ入力）はA判定の必須条件にしない**——これは「記事
//     生成の準備が整っているか」の判定であり「候補として提示する価値があるか」
//     の判定ではないため（2026-09-15、実データでA=0の根本原因と特定）。
//     「銀座限定でない」「他地域にも店舗がある」「通販でも買える」「銀座を
//     訪れる唯一の目的でない」「常設店舗である」はいずれも除外理由にしない。
//     A判定の理由に「目的型」または「発見型」を明記する。
//   B（旬の候補としてマロンへ提示可能・記事生成前に不足項目の公式確認が必要）:
//       C でも A でもない。ArticleFacts が未作成／draft／期間未確認であっても、
//       銀座関連性・追跡可能な出典・非終了が確認できればBとして候補提示する。
//       常設商品・常設サービスで季節性等のsignalが一切無いものはBのまま
//       （意図的な設計。新規性なき常設情報を無理にAへ引き上げない）。
//       記事生成・CMS保存に進む際にArticleFactsのreadyゲート・Articles.
//       beforeChangeの人間承認ゲートを通す必要がある点は無変更（生成readiness＝
//       genReady として理由に併記する。A判定自体とは分離する）。
//
// 「完璧」＝必須項目を確認できた案件だけを A とする、という旧基準は
// 「記事生成readiness」の判定としては維持しつつ、候補「提示」のA判定からは
// 分離した（2026-09-15）。未確認情報は推測で埋めない——missing / unconfirmed
// に列挙するだけ。

import {
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../template/mapDiscoveredContentToEventFields'
import { assessGinzaRelevance, isSingleGinzaVenueSource } from './ginzaRelevance'
import { imagePreflight } from './imagePreflight'
import { isPastEventEnd } from '../curation/eventEndBoundary'
import { toTokyoDateString } from '../util/businessDate'
import { evaluateTargetOrDiscoveryEligibility } from './targetOrDiscoveryEligibility'
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
  /**
   * 公式ページ取得の結果区分（fetchOfficialSignals().fetchOutcome。2026-09-09）。
   * 'ok' 以外（http_error / timeout / robots_denied / …）のとき、B の理由に
   * 「取得失敗（再取得で解消しうる。『公式記載なし』とは別）」を明示する。verdict は動かさない。
   */
  officialFetchOutcome?: string
  /**
   * 近似重複ルール2（2026-09-15追加・マロン指示）。呼び出し元が
   * dedupCheck.checkRecentBrandVenueDuplicate() の結果を渡す。isDuplicate:true のときは
   * event/product_news いずれも A へ昇格させず B のまま保留する（除外〈C〉はしない）。
   */
  recentBrandVenueDuplicate?: {
    isDuplicate: boolean
    matchedArticleId?: number
    reason: string
  }
  /**
   * 【2026-09-16追加・マロン指示】使用済み候補の自動除外。呼び出し元
   * （morningRun.ts）が「過去の朝刊レポート（.devlogs/morning/*\/report.json）で
   * 既に候補として提示済みか」を、Project 02 内の既存データ（ArticleFactsではなく
   * 過去の朝刊出力そのもの）から機械的に判定して渡す。マロンが個別に設定するフラグでは
   * ない。isProcessed:true のときは verdict を C とし、reasons に alreadyProcessed
   * （このフィールド名）を含める。
   */
  alreadyProcessed?: {
    isProcessed: boolean
    reason: string
  }
}


function toDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000
}

// 商品ニュース（product_news）で「現在の販売状況」が公式に確認できているかを、
// 既存の構造化フィールド saleAvailability（extractProductNewsFacts.ts が公式ページ本文の
// 明記から決定的に判定・readyGate.ts が既に「過去/未来ゲート免除」の根拠に使っている値）
// で判定する（2026-09-14追加・マロン指示）。
//
//   'has_end_date'         … 販売終了日が明記されている → 現在の状況を確認済み
//   'ongoing_no_end_stated'… 公式本文に「発売中・継続販売中」等の明記があり終了を示す語も
//                             ない → 現在も販売中であることを確認済み
//   'no_period_stated'     … 開始日・終了日・会期ラベルいずれも無く「店頭にて取扱」等の
//                             一般的な販売明示のみ → **現在も販売中かどうかは公式に未確認**
//                             （readyGate は必須項目・過去/未来ゲートの両方を免除して
//                             templateEligible=true にできるが、それは「記事生成は妨げない」
//                             という判断であり「現在の状況を確認済み」という意味ではない）
//   'unknown' / 未設定      … 未確認
//
// A（候補提示：公式情報だけで記事生成可能）にするのは 'has_end_date' /
// 'ongoing_no_end_stated' のみ。'no_period_stated' はArticleFacts readyでも B へ落とし、
// 「現在の販売状況を公式ページで再確認してから記事生成へ」と明示する
// （DC#370のような事例。ArticleFactsの全項目confirmedを候補「提示」の必須条件にしない
// 一方で、A＝生成可能の判定にはこの追加確認を要求する）。
function isSaleAvailabilityConfirmed(saleAvailability: string | null | undefined): boolean {
  return saleAvailability === 'has_end_date' || saleAvailability === 'ongoing_no_end_stated'
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
    eventPeriod = `${toTokyoDateString(startD)} 〜 ${toTokyoDateString(endD)}`
  else if (startD) eventPeriod = toTokyoDateString(startD)
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
    reasons.push(`開催終了済み（終了日 ${endD ? toTokyoDateString(endD) : '不明'} < 基準日）`)
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
  } else if (dc.curationStatus === 'approved') {
    // 使用済み候補の自動除外（2026-09-16・マロン指示）：承認済み＝マロンが既に判断済み
    // であり、朝の「新規候補」ではない。publishedAt 等の別途設定を前提にせず、
    // DiscoveredContent.curationStatus という既存データだけで機械的に判定する。
    verdict = 'C'
    reasons.push('alreadyProcessed（承認済み。マロンが既に判断済みのため新規候補としては扱わない）')
  } else if (input.alreadyProcessed?.isProcessed) {
    // 使用済み候補の自動除外（続き）：Articleが作成済み・note-draft.json生成済みは
    // dedup.duplicate（既存ロジック）で C 判定済みのため、ここでは「過去の朝刊レポートで
    // 既に候補として提示済みか」を .devlogs/morning/*/report.json という既存データから
    // 機械的に判定した結果のみを受け取る（マロンの追加設定は不要）。
    verdict = 'C'
    reasons.push(`alreadyProcessed（${input.alreadyProcessed.reason}）`)
  } else {
    // 18カテゴリー共通・目的型／発見型のA判定（2026-09-15、マロン指示で全面改訂）。
    // ArticleFacts.enrichmentStatus='ready'（人間の事前手入力）はここでは判定条件にしない
    // ——記事「候補提示」の可否と記事「生成readiness」の可否を分離する（下記 genReady）。
    // 近似重複（同一ブランド・同一会場、直近14日以内）は event/product_news/unknown 共通で
    // A適格判定そのものをブロックする安全条件として維持する（targetOrDiscoveryEligibility 内）。
    const recentDupBlocks = !!input.recentBrandVenueDuplicate?.isDuplicate
    const eligibility = evaluateTargetOrDiscoveryEligibility({
      title: dc.title ?? null,
      venue: dc.venue ?? null,
      articleUrl: dc.articleUrl ?? null,
      excerpt: dc.excerpt ?? null,
      sourceSiteName: dc.sourceSiteName ?? null,
      contentType: dc.contentType ?? null,
      factKind: input.factKind ?? 'event',
      eventStartAt: dc.eventStartAt ?? null,
      eventEndAt: dc.eventEndAt ?? null,
      expired,
      ginzaRelevant,
      hasTraceableSource,
      duplicate: dedup.duplicate,
      recentBrandVenueDuplicate: recentDupBlocks,
      stale,
      now,
    })

    // 記事生成 readiness（ArticleFacts ベース。旧 A 判定ロジックをそのまま「生成可能か」の
    // 参考情報として温存する。verdict の決定には使わない）
    let genReady = false
    let genReadyNote = ''
    if (input.factKind === 'unknown') {
      genReadyNote = '記事タイプ未判定のため記事生成readiness未評価（推測分類はしない）'
    } else if (input.factKind === 'product_news') {
      // enrichmentStatus='ready' は ArticleFacts.beforeChange がログイン済み人間の操作でしか
      // 設定できないため、ready かつ humanReviewedAt 済みであれば人間確認は担保されている。
      const saleAvailabilityConfirmed = isSaleAvailabilityConfirmed(facts?.saleAvailability)
      genReady =
        map.templateEligible &&
        map.factsSource === 'ready' &&
        !!facts?.humanReviewedAt &&
        saleAvailabilityConfirmed &&
        !recentDupBlocks &&
        !stale
      if (map.factsSource === 'none') genReadyNote = 'ArticleFacts が未作成（必須項目が構造化されていない）'
      else if (map.factsSource === 'draft')
        genReadyNote =
          'ArticleFacts が draft（商品名・価格・販売期間・購入条件・出典を公式で人間が確定入力し、human_reviewed で ready にする必要あり）'
      else if (map.factsSource === 'withdrawn') genReadyNote = 'ArticleFacts が withdrawn'
      else if (!map.templateEligible) genReadyNote = '必須項目に不足あり（下記 missing）'
      else if (!facts?.humanReviewedAt) genReadyNote = 'human_reviewed_at が未設定（人間レビュー未確認）'
      else if (!saleAvailabilityConfirmed) {
        genReadyNote = `現在の販売状況が公式に確認できていない（saleAvailability=${facts?.saleAvailability ?? '未設定'}）`
        unconfirmed.push(
          `現在の販売状況（公式ページで再確認が必要）: ${sourceUrl || '（公式URLなし）'} — 記事生成前に確認が必要`,
        )
      } else if (recentDupBlocks) genReadyNote = `近似重複のため生成保留（${input.recentBrandVenueDuplicate?.reason}）`
      else if (stale) genReadyNote = '情報の確認日時が古く再確認が必要'
    } else {
      // event（未指定は後方互換で event 扱い）
      genReady = map.templateEligible && map.factsSource === 'ready' && !recentDupBlocks && !stale
      if (map.factsSource === 'none') genReadyNote = 'ArticleFacts が未作成（必須項目が構造化されていない）'
      else if (map.factsSource === 'draft') genReadyNote = 'ArticleFacts が draft（human_reviewed で ready にする必要あり）'
      else if (map.factsSource === 'withdrawn') genReadyNote = 'ArticleFacts が withdrawn'
      else if (!map.templateEligible) genReadyNote = '必須項目に不足あり（下記 missing）'
      else if (recentDupBlocks) genReadyNote = `近似重複のため生成保留（${input.recentBrandVenueDuplicate?.reason}）`
      else if (stale) genReadyNote = '情報の確認日時が古く再確認が必要'
    }
    if (recentDupBlocks) {
      unconfirmed.push(
        `近似重複の疑い（${input.recentBrandVenueDuplicate?.reason}）— 記事生成前に既存記事との重複を確認が必要`,
      )
    }

    if (eligibility.eligible) {
      verdict = 'A'
      const modeLabel = eligibility.mode === 'purpose' ? '目的型' : '発見型'
      reasons.push(`${modeLabel}：${eligibility.reasons.join(' / ')}（カテゴリー：${eligibility.category ?? '不明'}）`)
      if (genReady) {
        reasons.push('記事生成readinessも達成（ArticleFacts ready・人間レビュー済み）')
      } else {
        reasons.push(`参考：記事生成readinessは未達（${genReadyNote || 'ArticleFacts未確認'}）。公式情報の追加確認後に記事生成へ`)
      }
    } else {
      verdict = 'B'
      reasons.push(`Aにならなかった理由：${eligibility.blockers.join(' / ')}`)
      if (genReadyNote) reasons.push(`記事生成readiness：${genReadyNote}`)
    }
  }

  // 公式ページ取得に失敗した場合は、B の理由へ「取得失敗（再取得で解消しうる）」を明示する
  // ——「公式記載なし（確認済み）」と混同しないため、verdict は動かさず reason/unconfirmed に分けて残す（2026-09-09）。
  const fo = input.officialFetchOutcome
  if (fo && fo !== 'ok' && fo !== 'not_requested') {
    const msg = `公式ページ取得失敗（fetchOutcome=${fo}）。再取得で解消しうる（＝情報が無いのではなく取得できていない）`
    if (verdict === 'B') reasons.push(msg)
    unconfirmed.push(msg)
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
