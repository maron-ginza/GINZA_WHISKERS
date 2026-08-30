// Project 02-2 収益化② Tier 1（2026-08-30）：記事生成「前」の決定的品質ゲート。
//
// マロン承認済み設計。pre-gate だけで4品質ゲートを満たしたとはみなさない
// （残りは interestArticlePostGate.ts と人間レビュー）。ここで担保するのは：
//   1. 銀座固有性（下限）  … 銀座への手掛かりがゼロなら記事化しない
//   2. 今行く理由           … 日付由来の根拠がどれも無ければ記事化しない（HARD）
//   3. 体験価値（下限）     … 体験カテゴリらしさが全く無ければ記事化しない
//   4. 素材充足             … excerpt が boilerplate なら編集視点を組めない
//
// いずれか失敗なら Claude を呼ばず plan.status='gate_failed'。AI呼び出しなし。
// 既存の決定的ヘルパー（eventStatus / temporalRelevance / uxType / pillarHint /
// contentTypeToPillar / contentRichness）を再利用し、重複実装しない。

import { CONTENT_TYPE_TO_PILLAR_NAME } from './contentTypeToPillar'
import { assessContentRichness, type ContentRichnessTier } from './contentRichness'
import { deriveEventStatus, isUpcomingSoon } from './eventStatus'
import { deriveTemporalRelevance } from './temporalRelevance'
import { classifyUxType } from './uxType'
import type { ContentType } from '../crawler/discoveredContentTypes'
import { resolvePillarHints } from '../interestDiscovery/pillarHint'

export interface InterestPreGateConfig {
  gateUpcomingDays: number
  gatePublishedRecencyDays: number
  gateGinzaMin: number
  experienceContentTypes: string[]
}

export interface InterestPreGateDc {
  id: number | string
  title?: string | null
  excerpt?: string | null
  venue?: string | null
  contentType?: string | null
  uxType?: string | null
  eventStartAt?: string | null
  eventEndAt?: string | null
  publishedAt?: string | null
  /** editorialScore.ginza（0〜25） */
  editorialScoreGinza?: number | null
  /** editorialScore.contentRichnessTier */
  contentRichnessTier?: ContentRichnessTier | string | null
}

export type InterestPreGateName =
  | 'ginzaSignal'
  | 'timelyReason'
  | 'experienceCategory'
  | 'materialSufficiency'

export interface InterestPreGateResult {
  verdict: 'pass' | 'gate_failed'
  failedGates: InterestPreGateName[]
  notes: string[]
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const GINZA_TOKEN_RE = /銀座|ＧＩＮＺＡ|GINZA|Ginza|ginza|中央区/

export function evaluateInterestArticlePreGate(
  theme: string,
  dc: InterestPreGateDc,
  now: Date,
  config: InterestPreGateConfig,
): InterestPreGateResult {
  const failed: InterestPreGateName[] = []
  const notes: string[] = []

  const haystack = [dc.title, dc.excerpt, dc.venue].filter(Boolean).join(' ')

  // --- ゲート1（下限）: 銀座固有性 ---
  const pillarHints = resolvePillarHints(theme)
  const dcPillar = CONTENT_TYPE_TO_PILLAR_NAME[dc.contentType ?? 'other'] ?? '文化'
  const ginzaByToken = GINZA_TOKEN_RE.test(haystack)
  const ginzaByScore =
    typeof dc.editorialScoreGinza === 'number' && dc.editorialScoreGinza >= config.gateGinzaMin
  const ginzaByPillar = pillarHints.includes(dcPillar as (typeof pillarHints)[number])
  if (!ginzaByToken && !ginzaByScore && !ginzaByPillar) {
    failed.push('ginzaSignal')
  } else {
    notes.push(
      `ginzaSignal ok (${[
        ginzaByToken && 'token',
        ginzaByScore && `score>=${config.gateGinzaMin}`,
        ginzaByPillar && `pillarHint:${dcPillar}`,
      ]
        .filter(Boolean)
        .join('+')})`,
    )
  }

  // --- ゲート2: 今行く理由（日付根拠。どれも無ければ HARD で落とす） ---
  const evStatus = deriveEventStatus(dc.eventStartAt, dc.eventEndAt, now)
  const upcomingSoon =
    evStatus === 'upcoming' && isUpcomingSoon(dc.eventStartAt, now, config.gateUpcomingDays)
  const temporal = deriveTemporalRelevance(dc.eventStartAt, dc.eventEndAt, now)
  let publishedRecent = false
  if (dc.publishedAt) {
    const pub = new Date(dc.publishedAt)
    if (!Number.isNaN(pub.getTime())) {
      const ageMs = now.getTime() - pub.getTime()
      publishedRecent = ageMs >= 0 && ageMs <= config.gatePublishedRecencyDays * MS_PER_DAY
    }
  }
  const timelyOk =
    evStatus === 'ongoing' ||
    upcomingSoon ||
    temporal.tier === 'now' ||
    temporal.tier === 'soon' ||
    temporal.tier === 'next' ||
    publishedRecent
  if (!timelyOk) {
    failed.push('timelyReason')
  } else {
    notes.push(
      `timelyReason ok (eventStatus=${evStatus} temporal=${temporal.tier}${
        publishedRecent ? ' publishedRecent' : ''
      })`,
    )
  }

  // --- ゲート3（下限）: 体験価値 ---
  const storedUx = dc.uxType && dc.uxType !== 'other' ? dc.uxType : null
  const classifiedUx = storedUx
    ? storedUx
    : classifyUxType(
        dc.title,
        dc.excerpt,
        (dc.contentType ?? undefined) as ContentType | undefined,
        dc.contentRichnessTier ?? null,
      )
  const uxOk = !!classifiedUx && classifiedUx !== 'other'
  const contentTypeOk = config.experienceContentTypes.includes(dc.contentType ?? '')
  if (!uxOk && !contentTypeOk) {
    failed.push('experienceCategory')
  } else {
    notes.push(
      `experienceCategory ok (uxType=${classifiedUx}${contentTypeOk ? ` contentType=${dc.contentType}` : ''})`,
    )
  }

  // --- ゲート4: 素材充足（editorsNote を組む素材があるか） ---
  const richnessTier: ContentRichnessTier | string =
    dc.contentRichnessTier ?? assessContentRichness(dc.excerpt).tier
  if (richnessTier === 'boilerplate') {
    failed.push('materialSufficiency')
  } else {
    notes.push(`materialSufficiency ok (richness=${richnessTier})`)
  }

  return {
    verdict: failed.length === 0 ? 'pass' : 'gate_failed',
    failedGates: failed,
    notes,
  }
}
