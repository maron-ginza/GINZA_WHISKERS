// GINZA WHISKERS / Project 02（2026-09-09 根本修正）— Payload の article-facts doc → ArticleFactsLike。
//
// 以前は morningRun.ts / assessInboxPool.ts / candidateReview.ts / templateCheck.ts /
// createDraftFromArticleFacts.ts に個別コピーがあり、コピーごとにフィールドを取りこぼしていた。
// とくに morningRun / candidateReview / templateCheck は templateType / priceText /
// saleAvailability / admissionApplicable / humanReviewedAt / primaryCategory を写しておらず、
// ready な sale / product_news の ArticleFacts が evaluateReadyGate で「必須不足」となり
// A 判定に上がらない不具合があった（DC #370 で顕在化）。
//
// この関数を **唯一の変換元** とし、ArticleFacts コレクションのフィールドはすべて写す。
// 返す型（ArticleFactsLike）は mapDiscoveredContentToEventFields が定義する。

import type { ArticleFactsLike } from '../template/mapDiscoveredContentToEventFields'

export function toFactsLike(f: Record<string, unknown> | undefined): ArticleFactsLike | undefined {
  if (!f) return undefined
  const g = <T = unknown>(k: string): T => f[k] as T
  return {
    enrichmentStatus: g<string | null>('enrichmentStatus') ?? null,
    // 人間レビュー日時：ready への遷移で ArticleFacts.beforeChange が自動設定する。
    // assessCandidate の product_news A 判定が「人間確認なしの自動A昇格禁止」で必須にする。
    humanReviewedAt: g<string | null>('humanReviewedAt') ?? null,
    // 記事テンプレート種別：無いと mapper が構造から推定し sale を exhibition と誤判定する。
    templateType: g<string | null>('templateType') ?? null,
    primaryCategory: g<string | null>('primaryCategory') ?? null,
    season: g<string | null>('season') ?? null,
    eventName: g<string | null>('eventName') ?? null,
    editionLabel: g<string | null>('editionLabel') ?? null,
    theme: g<string | null>('theme') ?? null,
    whatHappens: g<string | null>('whatHappens') ?? null,
    eventDate: g<string | null>('eventDate') ?? null,
    eventDateISO: g<string | null>('eventDateISO') ?? null,
    eventTime: g<string | null>('eventTime') ?? null,
    venues: g<ArticleFactsLike['venues']>('venues') ?? null,
    areaLead: g<string | null>('areaLead') ?? null,
    audienceNote: g<string | null>('audienceNote') ?? null,
    paid: g<string | null>('paid') ?? null,
    // 価格の表示文字列：sale テンプレの ready 必須。
    priceText: g<string | null>('priceText') ?? null,
    // 販売終了日の記載状況：'no_period_stated' で sale の期日ゲートを免除する（2026-09-09）。
    saleAvailability: g<string | null>('saleAvailability') ?? null,
    // 入場料の該当性：'no' で event 系の paid 必須を免除する（2026-09-09）。
    admissionApplicable: g<string | null>('admissionApplicable') ?? null,
    applyRequired: g<string | null>('applyRequired') ?? null,
    applyDeadline: g<string | null>('applyDeadline') ?? null,
    resultDate: g<string | null>('resultDate') ?? null,
    resultRule: g<string | null>('resultRule') ?? null,
    applyRule: g<string | null>('applyRule') ?? null,
    officialInfoNote: g<string | null>('officialInfoNote') ?? null,
    editorsNoteSeed: g<string | null>('editorsNoteSeed') ?? null,
    closing: g<string | null>('closing') ?? null,
    callToAction: g<string | null>('callToAction') ?? null,
    hashtags: g<ArticleFactsLike['hashtags']>('hashtags') ?? null,
    sourceProvenanceFacts: g<ArticleFactsLike['sourceProvenanceFacts']>('sourceProvenanceFacts') ?? null,
  }
}
