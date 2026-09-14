// GINZA WHISKERS / Project 02（2026-09-03、第一投稿遅延の是正 — 改善対象1）
// 7:10 レポート用のテンプレート事前検査（決定的・AI なし）。
//
// 候補ごとに「今のデータで記事化できるか／人間確認待ちか／生成不可か」を出す。
// mapDiscoveredContentToEventFields を dry-run で回して templateEligible / variant /
// missing を取り、抽出済み・未確認・別記事日付混入・記事種別 を合わせて提示する。

import {
  mapDiscoveredContentToEventFields,
  type ArticleFactsLike,
  type DiscoveredContentLike,
} from '../template/mapDiscoveredContentToEventFields'
import type { TemplateTypeClassification } from './classifyTemplateType'
import type { ArticleFactsCandidate, CandidateAssessment } from './types'

export interface BuildTemplatePrecheckInput {
  dc: DiscoveredContentLike
  facts?: ArticleFactsLike
  factsSource: 'none' | 'draft' | 'withdrawn' | 'ready'
  templateType: TemplateTypeClassification
  extraction?: ArticleFactsCandidate
  verdict: 'A' | 'B' | 'C'
  now?: Date
}

const EF_LABELS: Record<string, string> = {
  eventName: 'イベント名',
  eventDate: '会期（表示）',
  eventDateISO: '会期（機械日付）',
  eventTime: '開催時間',
  venuePlace: '会場',
  paid: '有料/無料',
  applyRequired: '申込要否',
}

export function buildTemplatePrecheck(
  input: BuildTemplatePrecheckInput,
): NonNullable<CandidateAssessment['templatePrecheck']> {
  const { dc, facts, factsSource, templateType, extraction, verdict } = input
  const now = input.now ?? new Date()

  // ready な ArticleFacts があれば mapper で確定判定。無ければ「推定バリアント」。
  // 記事種別（DC レベル）を mapper へ渡す：application / workshop は applyRequired 未設定でも
  // exhibition バリアントに落とさない（item4）。
  const mapped = mapDiscoveredContentToEventFields(dc, {
    facts,
    now,
    templateType: templateType.templateType as
      | 'exhibition'
      | 'application'
      | 'workshop'
      | 'sale'
      | 'recurring_event'
      | 'unknown',
  })
  const templateEligible = mapped.templateEligible
  const appliedTemplate =
    mapped.variant ??
    (templateType.templateType === 'exhibition'
      ? 'exhibition（推定）'
      : templateType.templateType === 'recurring_event'
        ? 'recurring_event（推定）'
        : `${templateType.templateType}（推定）`)

  // 抽出済み / 未確認（extractedEventFacts の confirmationStatus で分ける）
  const extractedFields: string[] = []
  const unconfirmedFields: string[] = []
  const autoFillFields: string[] = []
  const eef = extraction?.extractedEventFacts
  // register が draft へ自動入力する対象（confirmed のみ）。areaLead / audienceNote は常に人間。
  const AUTOFILLABLE = ['eventName', 'eventDate', 'eventDateISO', 'eventTime', 'venuePlace', 'paid', 'whatHappens', 'officialInfoNote'] as const
  const humanInputFields: string[] = ['areaLead（編集判断・人間入力）', 'audienceNote（編集判断・人間入力）']
  let hashtagCandidates: string[] = []
  if (eef) {
    hashtagCandidates = eef.hashtagCandidates ?? []
    for (const k of ['eventName', 'eventDate', 'eventDateISO', 'eventTime', 'venuePlace', 'paid', 'whatHappens', 'officialInfoNote', 'applyRequired'] as const) {
      const f = eef[k]
      const label = EF_LABELS[k] ?? k
      if (f.value != null && f.confirmationStatus === 'confirmed') {
        extractedFields.push(`${label}: ${typeof f.value === 'string' && f.value.length > 40 ? f.value.slice(0, 40) + '…' : f.value}`)
        if ((AUTOFILLABLE as readonly string[]).includes(k)) autoFillFields.push(label)
      } else {
        unconfirmedFields.push(`${label}（${f.value != null ? '未照合' : '未取得'}・人間確認）`)
        if ((AUTOFILLABLE as readonly string[]).includes(k)) humanInputFields.push(`${label}（公式本文から取れず）`)
      }
    }
    humanInputFields.push('hashtags（候補あり・人間が確認して確定）')
    if (!eef.targetNameFoundInBody && eef.adapter !== 'none') {
      unconfirmedFields.push('※対象イベント名が公式本文に見つからず、抽出値の照合ができていない')
    }
  } else {
    unconfirmedFields.push('公式ページ未取得（--fetch 無効 or 取得失敗）— 記事フィールドは全て人間入力')
    humanInputFields.push('eventName / eventDate / eventTime / venues / paid / whatHappens / officialInfoNote / hashtags（すべて人間入力）')
  }

  const foreignDateSuspect = !!extraction?.conflicts.some((c) =>
    c.includes('別記事の開催期間を拾った可能性'),
  )

  // テンプレ生成に不足している項目
  const missingForTemplate =
    factsSource === 'ready' ? mapped.missing : ['ArticleFacts が ready でない（必須項目を人間が確定入力 → ready 化が必要）']

  // 3段階：投稿可能 / 確認後可能 / 生成不可
  let decision: '投稿可能' | '確認後可能' | '生成不可'
  let recommendation: '推奨' | '保留' | '除外'
  let decisionReason: string

  if (verdict === 'C') {
    decision = '生成不可'
    recommendation = '除外'
    decisionReason = 'C 判定（既投稿と重複／開催終了／銀座関連なし／出典追跡不可のいずれか）'
  } else if (templateType.templateType === 'unknown') {
    decision = '生成不可'
    recommendation = '保留'
    decisionReason = '記事種別（exhibition / application / workshop）を本文・タイトル・構造化データから決定的に判定できない。8:00 で人間が種別を確定する'
  } else if (templateEligible) {
    decision = '投稿可能'
    recommendation = '推奨'
    decisionReason = `ArticleFacts が ready かつ必須充足（適用テンプレ: ${appliedTemplate}）。./p2 draft-template で決定的に生成可`
  } else if (foreignDateSuspect) {
    decision = '確認後可能'
    recommendation = '保留'
    decisionReason = '別記事の会期を拾った疑い（FIX 4）。公式ページで会期を人間が確認してから ArticleFacts を ready 化する'
  } else if (
    templateType.templateType === 'exhibition' &&
    (templateType.signals.application.length > 0 || templateType.signals.workshop.length > 0)
  ) {
    decision = '確認後可能'
    recommendation = '保留'
    decisionReason =
      '展覧会と判定したが公募/参加要件のシグナルもある。applyRequired の要否を人間が確定（未設定だと公募情報が抜ける）'
  } else {
    decision = '確認後可能'
    recommendation = '保留'
    decisionReason =
      factsSource === 'none'
        ? `ArticleFacts 未作成。--write-facts で draft 自動作成（自動入力: ${autoFillFields.join('・') || 'なし'}）→ 残り（${humanInputFields.slice(0, 4).join('・')}…）を人間が確定 → ready 化（適用予定テンプレ: ${appliedTemplate}）`
        : `ArticleFacts は draft。残りの不足項目を人間が確定 → ready 化（適用予定テンプレ: ${appliedTemplate}）`
  }

  return {
    templateType: templateType.templateType,
    templateTypeConfidence: templateType.confidence,
    templateTypeReasons: templateType.reasons,
    appliedTemplate,
    articleFactsStatus: factsSource,
    extractedFields,
    unconfirmedFields,
    missingForTemplate,
    foreignDateSuspect,
    templateEligible,
    autoFillFields,
    humanInputFields,
    hashtagCandidates,
    decision,
    recommendation,
    decisionReason,
  }
}
