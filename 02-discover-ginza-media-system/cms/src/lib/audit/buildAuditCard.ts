// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// 監査カード（step 14）。記事1本の全検査結果・確定事実・編集表現・CTA 判断・
// verdict を1つの構造体にまとめ、整形テキストへ描画する純粋関数。
//
// v1：整形テキスト ＋ .devlogs の JSON。ただし 10月運用までに Payload 管理画面で
//   green/yellow/red・指摘箇所・出典・主要事実・公開候補を一覧できる UI へ移行
//   できるよう、カードの構造（AuditCard）は UI からも読める形にしておく。

import {
  aggregateVerdict,
  countBySeverity,
  verdictLabel,
  type AuditFinding,
  type RiskSeverity,
} from './riskModel'
import { ctaReason, ctaShouldEmit, type ArticleUnderAudit } from './articleBodyChecks'
import type { CrossCultureFilterResult } from '../crossCulture/crossCultureFilter'
import type { DerivativePlan } from '../crossCulture/derivativeCandidate'
import { crossCultureSummaryLine, derivativePlanSummaryLine } from '../crossCulture'

const EDITORIAL_SECTION_RE = /EDITOR'S CHOICE|GINZA WHISKERS' NOTE|WHY NOW/i

export interface AuditCard {
  schemaVersion: 1
  articleId?: number | string | null
  discoveredContentId?: number | string | null
  title: string
  appliedTemplate: string
  templateType: string
  primaryCategory?: string | null
  verdict: RiskSeverity
  bucket: 'green' | 'yellow' | 'red'
  counts: { red: number; yellow: number }
  /** yellow/red の指摘のみ（green は「指摘なし」で表す） */
  findings: AuditFinding[]
  /** 確定事実（confirmed provenance）— 主要事実の一覧 */
  confirmedFacts: { fact: string; factType: string; sourceUrl?: string | null; verifiedAt?: string | null }[]
  /** 編集表現（どの文が GINZA WHISKERS の編集文か） */
  editorialExpressions: { section: string; text: string }[]
  cta: { inBody: boolean; text: string | null; warranted: boolean; reason: string }
  sourceUrls: string[]
  verifiedAt?: string | null
  /** green/yellow のときの note-draft パッケージのパス（.devlogs 相対）。red は null */
  notePackagePath?: string | null
  /**
   * CROSS CULTURE FILTER の結果（GINZA WHISKERS 適合判定の後段）。
   * 派生記事候補・有料化候補判定の参考。verdict / bucket には影響しない。
   */
  crossCulture?: CrossCultureFilterResult | null
  /** CROSS CULTURE 派生記事プラン（提案）。マロンが `./p2 crossculture derive` で実行する。 */
  crossCultureDerivative?: DerivativePlan | null
  generatedAt: string
}

export interface BuildAuditCardInput {
  article: ArticleUnderAudit
  findings: AuditFinding[]
  notePackagePath?: string | null
  /** CROSS CULTURE FILTER の結果（任意）。参考情報としてカードに載せるだけ。 */
  crossCulture?: CrossCultureFilterResult | null
  /** CROSS CULTURE 派生記事プラン（任意）。提案としてカードに載せるだけ。 */
  crossCultureDerivative?: DerivativePlan | null
  now?: Date
}

export function buildAuditCard(input: BuildAuditCardInput): AuditCard {
  const a = input.article
  const verdict = aggregateVerdict(input.findings)
  const confirmed = (a.provenance ?? []).filter((p) => p.verificationStatus === 'confirmed')

  const editorialExpressions: { section: string; text: string }[] = []
  for (const s of a.sections) {
    if (EDITORIAL_SECTION_RE.test(s.name)) {
      for (const sent of s.text.split(/(?<=。)/u).map((x) => x.trim()).filter(Boolean)) {
        editorialExpressions.push({ section: s.name, text: sent })
      }
    }
  }

  return {
    schemaVersion: 1,
    articleId: a.articleId ?? null,
    discoveredContentId: a.discoveredContentId ?? null,
    title: a.title,
    appliedTemplate: a.appliedTemplate,
    templateType: a.templateType,
    primaryCategory: a.primaryCategory ?? null,
    verdict,
    bucket: verdict,
    counts: countBySeverity(input.findings),
    findings: input.findings,
    confirmedFacts: confirmed.map((p) => ({
      fact: p.fact,
      factType: p.factType,
      sourceUrl: p.sourceUrl ?? null,
      verifiedAt: p.verifiedAt ?? null,
    })),
    editorialExpressions,
    cta: {
      inBody: a.ctaInBody,
      text: a.callToAction ?? null,
      warranted: ctaShouldEmit(a),
      reason: ctaReason(a),
    },
    sourceUrls: [...new Set(confirmed.map((p) => String(p.sourceUrl ?? '')).filter(Boolean))],
    verifiedAt: a.verifiedAt ?? null,
    notePackagePath: verdict === 'red' ? null : (input.notePackagePath ?? null),
    crossCulture: input.crossCulture ?? null,
    crossCultureDerivative: input.crossCultureDerivative ?? null,
    generatedAt: (input.now ?? new Date()).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// 整形テキスト（v1）
// ---------------------------------------------------------------------------
function line(s = ''): string {
  return s + '\n'
}

export function renderAuditCardText(card: AuditCard): string {
  let s = ''
  s += line('────────────────────────────────────────────')
  s += line(`監査カード  ${verdictLabel(card.verdict)}   Article #${card.articleId ?? '-'}  ← DC #${card.discoveredContentId ?? '-'}`)
  s += line(`  タイトル : ${card.title}`)
  s += line(`  テンプレ : appliedTemplate=${card.appliedTemplate} / templateType=${card.templateType} / category=${card.primaryCategory ?? '-'}`)
  s += line(`  指摘     : 🔴 ${card.counts.red} 件 / 🟡 ${card.counts.yellow} 件`)
  s += line('')

  if (card.findings.length === 0) {
    s += line('  ✅ 指摘なし（公式情報が揃い矛盾なし）')
  } else {
    // yellow は「該当箇所だけ表示」／red は「理由を明示」
    const red = card.findings.filter((f) => f.severity === 'red')
    const yellow = card.findings.filter((f) => f.severity === 'yellow')
    if (red.length) {
      s += line('  🔴 red（生成 / 公開候補登録を停止）:')
      for (const f of red) {
        s += line(`    - [${f.checkId}] ${f.message}`)
        if (f.section) s += line(`        セクション: ${f.section}`)
        if (f.excerpt) s += line(`        該当箇所  : ${f.excerpt}`)
      }
    }
    if (yellow.length) {
      s += line('  🟡 yellow（該当箇所のみ確認・保留）:')
      for (const f of yellow) {
        s += line(`    - [${f.checkId}] ${f.message}`)
        if (f.section) s += line(`        セクション: ${f.section}`)
        if (f.excerpt) s += line(`        該当箇所  : ${f.excerpt}`)
      }
    }
  }

  s += line('')
  s += line('  主要事実（confirmed / 出典つき）:')
  if (card.confirmedFacts.length === 0) s += line('    （なし）')
  for (const f of card.confirmedFacts) {
    s += line(`    ・[${f.factType}] ${f.fact}`)
    if (f.sourceUrl) s += line(`        出典: ${f.sourceUrl}${f.verifiedAt ? `（確認 ${String(f.verifiedAt).slice(0, 10)}）` : ''}`)
  }

  s += line('')
  s += line(`  CTA : ${card.cta.inBody || card.cta.text ? `有「${card.cta.text ?? '(本文ブロック)'}」` : '無'} / 要否=${card.cta.warranted ? '要' : '不要'}`)
  s += line(`        理由: ${card.cta.reason}`)

  s += line('')
  s += line('  編集表現（GINZA WHISKERS の編集文）:')
  for (const e of card.editorialExpressions) s += line(`    ・[${e.section}] ${e.text}`)

  s += line('')
  s += line(`  出典URL : ${card.sourceUrls.join(' , ') || '(なし)'}`)
  if (card.notePackagePath) s += line(`  note下書き: ${card.notePackagePath}`)

  s += line('')
  s += line('  CROSS CULTURE FILTER（GINZA WHISKERS 適合判定の後段・仮説軸による推定）:')
  s += line(`    ${crossCultureSummaryLine(card.crossCulture)}`)
  if (card.crossCulture && !card.crossCulture.skipped) {
    for (const m of card.crossCulture.markets) {
      const tag =
        card.crossCulture.derivativeMarkets.includes(m.market)
          ? '派生候補'
          : card.crossCulture.editorialMarkets.includes(m.market)
            ? '編集候補'
            : '除外'
      s += line(`    ・${m.market} score ${m.score}〔${tag} / ${m.articlePotential} / ${m.confidence}〕 軸=${m.matchedAxes.join('・') || '—'}`)
      if (m.suggestedAngle) s += line(`        角度: ${m.suggestedAngle}`)
      if (m.paidBasis.length) s += line(`        有料成立根拠: ${m.paidBasis.join(' ／ ')}`)
    }
    s += line('    ※ 有料・派生の最終判断はマロン（Human-in-the-loop）。スコアは確認済み事実ではない。')
  }

  const dv = card.crossCultureDerivative
  if (dv) {
    s += line('')
    s += line('  CROSS CULTURE 派生記事プラン（提案・生成はマロンが ./p2 crossculture derive で実行）:')
    s += line(`    ${derivativePlanSummaryLine(dv)}`)
    for (const sm of dv.selectedMarkets) {
      s += line(`    ▼ ${sm.market} score ${sm.score}〔${sm.articlePotential} / ${sm.confidence}〕 軸=${sm.matchedAxes.join('・') || '—'}`)
      s += line(`        角度: ${sm.suggestedAngle}`)
      s += line(`        有料/無料の根拠: ${sm.potentialReason}`)
      s += line(`        本文で事実にできる確認済み情報: ${sm.confirmedForBody.length ? sm.confirmedForBody.join(' ／ ') : '（なし＝断定させない）'}`)
    }
    if (dv.editorialOnlyMarkets.length)
      s += line(`    保持（50-69・自動派生しない）: ${dv.editorialOnlyMarkets.map((e) => `${e.market}:${e.score}`).join(' / ')}`)
    s += line('    ※ 通常記事本文は上書きしない。派生記事は別候補（reviewStatus:draft）。断定禁止・仮説明示。')
  }

  s += line(`  bucket  : ${card.bucket}`)
  s += line('────────────────────────────────────────────')
  return s
}

export function renderAuditIndexText(cards: AuditCard[], opts: { date?: string } = {}): string {
  const g = cards.filter((c) => c.verdict === 'green').length
  const y = cards.filter((c) => c.verdict === 'yellow').length
  const r = cards.filter((c) => c.verdict === 'red').length
  let s = ''
  s += line('════════════════════════════════════════════')
  s += line(`  Project 02 — 自動制作パイプライン 監査インデックス${opts.date ? `（${opts.date}）` : ''}`)
  s += line(`  ${cards.length} 件：🟢 ${g}（公開候補） / 🟡 ${y}（保留） / 🔴 ${r}（停止）`)
  s += line('════════════════════════════════════════════')
  for (const c of cards) {
    const oneLine =
      c.findings.length === 0
        ? '公式情報が揃い矛盾なし'
        : c.findings
            .slice(0, 2)
            .map((f) => f.checkId)
            .join(', ') + (c.findings.length > 2 ? ` ほか${c.findings.length - 2}件` : '')
    s += line(
      `  ${verdictLabel(c.verdict)}  #${c.articleId ?? '-'} ← DC#${c.discoveredContentId ?? '-'}  ${c.appliedTemplate}  「${c.title}」`,
    )
    s += line(`        ${oneLine}`)
  }
  s += line('════════════════════════════════════════════')
  s += line('  🟢 green のみ公開候補（green バケット）へ。reviewStatus は draft のまま・自動公開なし。')
  s += line('  🟡 yellow は該当箇所のみ確認して保留。🔴 red は理由を確認して再生成。')
  s += line('  公開は必ずマロンが手動で承認・実行する。')
  return s
}
