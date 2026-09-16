// GINZA WHISKERS / Project 02 P0 改善（2026-09-02〜2026-09-16続き7、A/B/C判定構造の是正）
// — A/B/C 判定（純粋関数・AI なし）。
//
// 【最重要定義（2026-09-16続き7・マロン指示：A判定とArticleFactsの矛盾を解消）】
// Aは「記事化に必要な公式情報の裏どりとArticleFacts保存が完了した候補」——単なる
// 候補プールではない。現在性・既処理・近似重複・施設14日間クールダウン**に加えて
// ArticleFacts.enrichmentStatus='ready'** まで通過した候補だけをAにする。
//
// 【2026-09-15〜続き3時点の旧方針からの反転】2026-09-15時点では「ArticleFacts
// readyはA判定の必須条件にしない」としていた（記事生成readinessと候補提示を分離
// する設計）。続き7でこれを明示的に反転した——V1のStage 4（マロンが候補ボードから
// 3本選定）→Stage 5（選定直後にnote原稿を自動生成）という運用では、選定後に人間が
// ArticleFactsを追加入力する工程を挟めない（挟むこと自体を禁止）ため、A＝「今すぐ
// 原稿化できる状態」まで前倒しする必要があった。ready化は6時処理内で
// autoArticleFacts.ts（DC保存済みの公式情報だけから決定論的に導出。推測しない）
// が自動的に行う——**マロン選定後の人間による追加入力を運用前提にしない**。
//
// 【判定基準】
//   C（候補提示不可・対象外。安全条件）: 開催終了 / 既投稿と重複 / 銀座関連性を
//     確認できない / 追跡可能な公式出典が無い / 明確に古い情報（構造化期間が無く、
//     タイトルに明示された過去の年月日がある。2026-09-16続き3追加・DC#40クラス）。
//   A（記事化に必要な公式情報の裏どりとArticleFacts保存が完了した候補。18カテゴリー
//     共通の目的型／発見型ロジック）：
//     C でない かつ targetOrDiscoveryEligibility.ts の7条件（現在性・近似重複なし等を
//     含む。2026-09-17改訂で施設/親施設クールダウンは条件から除外——後述）を
//     すべて満たし、かつ **ArticleFacts.enrichmentStatus==='ready'** の候補。
//     「銀座限定でない」「他地域にも店舗がある」「通販でも買える」「銀座を
//     訪れる唯一の目的でない」「常設店舗である」はいずれも除外理由にしない。
//     A判定の理由に「目的型」または「発見型」を明記する。
//   B（旬の候補としてマロンへ提示可能・記事生成前に不足項目の公式確認が必要、または
//     現在性/既処理/ArticleFacts未ready等の理由でAに一時的に届かない）：
//       C でも A でもない。alreadyProcessed／uncertainCurrentAvailability／
//       missingEventOrSalePeriod／nearDuplicate／evergreenWithoutTimelinessDetection／
//       articleFactsNotReady（続き7追加）のいずれか（reasonsに英語タグを明記）。
//       **削除しない**——情報の状況が変われば、次回の再判定で自動的にAへ戻る。
//       ArticleFactsが未readyのBも同様——翌日以降の6時処理で自動導出が成功すれば
//       Aに昇格しうる。
//
// 【2026-09-17改訂・マロン指示：A判定と施設クールダウンの責務分離】施設14日間
// クールダウン（facilityCooldown／parentFacilityCooldown）はA/B/C判定から完全に
// 切り離した——同じ施設が直近に使用されたことは、情報の正確性・裏どり状態とは
// 別問題であり、これを理由にA候補をBへ変更しない（旧方針ではB判定の理由の一つ
// だったが、今回はB判定にすらしない）。代わりに CandidateAssessment.facilityNotice
// （候補ボード表示専用の注意情報）として保持する。プログラムは注意表示のみを行い、
// 自動除外・自動降格・自動選定は行わない——同一施設を最終3本に採用するかどうかは
// マロンが判断する。ただし同一URL・同一商品/催事・近似重複・既投稿記事・現在性
// 未確認・裏どり不足は引き続きB/Cとして除外する（この節の対象外）。
//
// 未確認情報は推測で埋めない——missing / unconfirmed に列挙するだけ。

import {
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../template/mapDiscoveredContentToEventFields'
import { assessGinzaRelevance, isSingleGinzaVenueSource } from './ginzaRelevance'
import { imagePreflight } from './imagePreflight'
import { isPastEventEnd } from '../curation/eventEndBoundary'
import { toTokyoDateString } from '../util/businessDate'
import { evaluateTargetOrDiscoveryEligibility, findExplicitPastDateInTitle } from './targetOrDiscoveryEligibility'
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
   * 【2026-09-16追加・マロン指示、続き3改訂でC→Bへ変更】使用済み候補の自動除外。
   * 呼び出し元（morningRun.ts）が「過去の朝刊レポート（.devlogs/morning/*\/report.json）で
   * 既に候補として提示済みか」を、Project 02 内の既存データ（ArticleFactsではなく
   * 過去の朝刊出力そのもの）から機械的に判定して渡す。マロンが個別に設定するフラグでは
   * ない。isProcessed:true のときは verdict を B とし（削除しない・恒久除外ではない）、
   * reasons に alreadyProcessed（このフィールド名）を含める。
   */
  alreadyProcessed?: {
    isProcessed: boolean
    reason: string
  }
  /**
   * 【2026-09-16続き3追加・2026-09-17改訂（マロン指示：A/B/C判定と施設クールダウンの
   * 責務分離）】施設14日間クールダウン。呼び出し元（morningRun.ts）が
   * facilityActivityHistory.checkFacilityCooldown() の結果をそのまま渡す。
   * **A/B/C判定には一切使わない**——候補ボード上の注意情報
   * （CandidateAssessment.facilityNotice）としてのみ保持する。
   */
  facilityCooldown?: {
    onCooldown: boolean
    reason: string
    matchType?: 'facility' | 'parent'
    /** 表示用の親施設名（呼び出し元が resolveFacilityKey の結果から渡す。無ければ null） */
    parentFacilityLabel?: string | null
    /** 一致した過去活動の詳細（表示用。無ければ null） */
    matched?: {
      date: string
      facilityLabel: string
      articleId?: number
      source: 'article' | 'approved' | 'note-draft' | 'morning-selected'
    } | null
  }
  /**
   * 【2026-09-16続き7追加・マロン指示】呼び出し元（morningRun.ts）が
   * autoArticleFacts.deriveAutoArticleFacts() の結果（不足項目）をそのまま渡す。
   * map.factsSource!=='ready' でBになる際の理由文に使うのみ——推測で埋めない。
   */
  articleFactsAutoMissing?: string[]
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
  } else if (!dc.eventStartAt && !dc.eventEndAt && findExplicitPastDateInTitle(dc.title ?? null, now).found) {
    // 【2026-09-16続き3追加・マロン指示】明確に古い情報はC（安全条件・非対象）。
    // 構造化開催期間が無く、タイトルに明示された年月日（西暦4桁を含む表記）が判定日より
    // 過去の場合のみ——構造化期間がある場合はそちらを優先し（endD/expiredで別途判定済み）、
    // タイトルの数字列を誤って古い情報と断定しない（DC#40クラスの実例を受けて）。
    verdict = 'C'
    const pd = findExplicitPastDateInTitle(dc.title ?? null, now)
    reasons.push(`明確に古い情報（タイトルに過去の年月日 ${pd.date} が明記されている。last_checked_atは根拠にしない）`)
  } else if (dc.curationStatus === 'approved') {
    // 使用済み候補の自動除外（2026-09-16・マロン指示、続き3改訂でC→Bへ変更）：
    // 承認済み＝マロンが既に判断済みであり、朝の「新規候補」ではない——ただし完全に
    // 除外するのではなくB（参考情報）として残す。publishedAt等の別途設定を前提にせず、
    // DiscoveredContent.curationStatus という既存データだけで機械的に判定する。
    verdict = 'B'
    reasons.push('alreadyProcessed（承認済み。マロンが既に判断済みのため朝の新規候補としては渡さない）')
  } else if (input.alreadyProcessed?.isProcessed) {
    // 使用済み候補の自動除外（続き、続き3改訂でC→Bへ変更）：Articleが作成済み・
    // note-draft.json生成済みは dedup.duplicate（既存ロジック）で C 判定済みのため、
    // ここでは「過去の朝刊レポートで既に候補として提示済みか」を
    // .devlogs/morning/*/report.json という既存データから機械的に判定した結果のみを
    // 受け取る（マロンの追加設定は不要）。Bとして残す（削除・恒久除外ではない）。
    verdict = 'B'
    reasons.push(`alreadyProcessed（${input.alreadyProcessed.reason}）`)
  } else if (map.factsSource !== 'ready') {
    // 【2026-09-16続き7追加・マロン指示】A判定は「記事化に必要な公式情報の裏どりと
    // ArticleFacts保存が完了した候補」——ArticleFactsがreadyでなければAにしない
    // （2026-09-15の「ArticleFacts readyはA判定の必須条件にしない」方針を、V1の
    // Stage 4/5（マロン選定→即note原稿作成）運用のため明示的に反転した）。
    // ready化は6時処理内でDC保存済み公式情報から決定論的に自動導出する
    // （autoArticleFacts.ts／ArticleFacts.applyArticleFactsReadyGateのreq.context
    // 経由の自動導出経路）——**マロン選定後の人間による追加入力は前提にしない**。
    // 不足項目は呼び出し元（morningRun.ts）がautoArticleFacts.tsの出力からそのまま
    // 渡す（推測で埋めない）。
    verdict = 'B'
    const missingText = input.articleFactsAutoMissing?.length
      ? input.articleFactsAutoMissing.join(' / ')
      : map.factsSource === 'none'
        ? 'ArticleFactsが未作成（保存済み公式情報からの自動導出でも必須項目が不足）'
        : `ArticleFactsがready化されていません（現在: ${map.factsSource}）`
    reasons.push(`articleFactsNotReady（${missingText}）`)
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
      // 【2026-09-17改訂】facilityCooldownはA判定のブロッカーとして渡さない
      // （施設クールダウンはA/B/C判定から切り離した。下の facilityNotice を参照）。
      now,
    })

    // 記事生成 readiness（ArticleFacts ベース。旧 A 判定ロジックをそのまま「生成可能か」の
    // 参考情報として温存する。verdict の決定には使わない）
    let genReady = false
    let genReadyNote = ''
    if (input.factKind === 'unknown') {
      genReadyNote = '記事タイプ未判定のため記事生成readiness未評価（推測分類はしない）'
    } else if (input.factKind === 'product_news') {
      // 【2026-09-16続き7】map.factsSource==='ready' はこの分岐へ来る時点で既に確定済み
      // （上のarticleFactsNotReady分岐で!=='ready'はB化されている）が、humanReviewedAtは
      // 別の安全条件（2026-09-06・人間確認なしの自動A昇格禁止）としてそのまま残す——
      // 6時処理の自動導出経路（autoArticleFacts.ts）はhumanReviewedAtを設定しないため、
      // genReady（記事生成readinessの参考情報。verdict自体には影響しない）はfalseのまま
      // 「human_reviewed_at が未設定」を明示する。
      const saleAvailabilityConfirmed = isSaleAvailabilityConfirmed(facts?.saleAvailability)
      genReady = map.templateEligible && !!facts?.humanReviewedAt && saleAvailabilityConfirmed && !recentDupBlocks && !stale
      if (!map.templateEligible) genReadyNote = '必須項目に不足あり（下記 missing）'
      else if (!facts?.humanReviewedAt) genReadyNote = 'human_reviewed_at が未設定（人間レビュー未確認）'
      else if (!saleAvailabilityConfirmed) {
        genReadyNote = `現在の販売状況が公式に確認できていない（saleAvailability=${facts?.saleAvailability ?? '未設定'}）`
        unconfirmed.push(
          `現在の販売状況（公式ページで再確認が必要）: ${sourceUrl || '（公式URLなし）'} — 記事生成前に確認が必要`,
        )
      } else if (recentDupBlocks) genReadyNote = `近似重複のため生成保留（${input.recentBrandVenueDuplicate?.reason}）`
      else if (stale) genReadyNote = '情報の確認日時が古く再確認が必要'
    } else {
      // event（未指定は後方互換で event 扱い）。factsSource==='ready' は確定済み（上記同様）。
      genReady = map.templateEligible && !recentDupBlocks && !stale
      if (!map.templateEligible) genReadyNote = '必須項目に不足あり（下記 missing）'
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

  // --- 施設クールダウン注意情報（2026-09-17・マロン指示：A/B/C判定から切り離す） ---
  // verdictには一切影響しない。候補ボード（A候補のみ表示）向けの表示専用データ。
  let facilityNotice: CandidateAssessment['facilityNotice']
  if (input.facilityCooldown?.onCooldown) {
    const m = input.facilityCooldown.matched
    const matchedDate = m?.date ?? null
    const matchedD = matchedDate ? toDate(matchedDate) : null
    const daysSince = matchedD ? Math.round(daysBetween(now, matchedD)) : null
    facilityNotice = {
      recentlyUsed: true,
      parentFacilityLabel: input.facilityCooldown.parentFacilityLabel ?? null,
      lastUsedDate: matchedDate,
      lastArticleId: m?.source === 'article' && m.articleId != null ? m.articleId : null,
      daysSince,
      message: `同一施設が直近に使用されています（${input.facilityCooldown.reason}）`,
    }
  }

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
    facilityNotice,
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
