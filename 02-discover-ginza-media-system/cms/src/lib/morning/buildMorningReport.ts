// GINZA WHISKERS / Project 02 P0 改善（2026-09-02、2026-09-14候補提示の是正で改訂）
// — 7:10 候補レポートの組み立て（純粋関数）。
//
//   ・【2026-09-14改訂・マロン指示】7:10の候補一覧（topPresentable）には A と B の
//     両方を表示する（A＋B、優先順位順・最大5）。C（候補提示不可）は含めない。
//       A＝公式情報だけで記事生成可能
//       B＝旬の候補としてマロンへ提示可能だが、記事生成前に不足項目の公式確認が必要
//       C＝候補提示不可
//   ・A＋Bの合計が5未満なら C で埋めず、実数だけを返す（presentableShortfall=true）。
//   ・topA（A判定のみ）は後方互換のため引き続き返す（buildDecisionSupport等が使用）。
//   ・B/C の全件詳細は引き続き別枠（b/c）で返す。
//   ・【2026-09-15追加・マロン指示・近似重複対策ルール3】topPresentable（同一日の上位候補）は
//     同じ施設（digestMeta.facilityKey）を最大1件までとする——2件目以降はスキップし
//     facilityCapSkips に理由つきで記録する（A/B/Cの元集合自体は変更しない・水増しもしない）。
//
// 優先順位（決定的）：A を B より先に（生成即応性が高い順）、各tier内は
// 開催が近い順 → 情報の確認日時が新しい順 → id 昇順。

import type { CandidateAssessment, MorningReport } from './types'
import { selectMorningThreeSlots } from './selectMorningThreeSlots'
import type { FacilityActivityRecord } from './facilityActivityHistory'

function eventSortKey(a: CandidateAssessment): number {
  // eventPeriod は "YYYY-MM-DD" もしくは "YYYY-MM-DD 〜 YYYY-MM-DD" もしくは "不明"
  const m = a.eventPeriod.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return Number.MAX_SAFE_INTEGER // 不明は後ろ
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function verifiedSortKey(a: CandidateAssessment): number {
  const t = a.verifiedAt ? Date.parse(a.verifiedAt) : NaN
  return Number.isNaN(t) ? 0 : t
}

export function rankAssessments(list: CandidateAssessment[]): CandidateAssessment[] {
  return [...list].sort((x, y) => {
    const ex = eventSortKey(x)
    const ey = eventSortKey(y)
    if (ex !== ey) return ex - ey // 開催が近い順
    const vx = verifiedSortKey(x)
    const vy = verifiedSortKey(y)
    if (vx !== vy) return vy - vx // 確認日時が新しい順
    return x.discoveredContentId - y.discoveredContentId
  })
}

export function buildMorningReport(
  assessments: CandidateAssessment[],
  opts: { now?: Date; topN?: number; facilityHistory?: FacilityActivityRecord[] } = {},
): MorningReport {
  const now = opts.now ?? new Date()
  const topN = opts.topN ?? 5

  const A = rankAssessments(assessments.filter((a) => a.verdict === 'A'))
  const B = rankAssessments(assessments.filter((a) => a.verdict === 'B'))
  const C = assessments.filter((a) => a.verdict === 'C')

  const topA = A.slice(0, topN)
  // A を先に、続けて B（それぞれ既にrankAssessments済み）を並べ、施設は最大1件まで、topNで切る。
  // Cは候補提示不可のため含めない。水増しはしない（A+Bの実数のみ）。
  const topPresentable: CandidateAssessment[] = []
  const facilityCapSkips: MorningReport['facilityCapSkips'] = []
  const seenFacility = new Set<string>()
  for (const a of [...A, ...B]) {
    if (topPresentable.length >= topN) break
    const fk = a.digestMeta?.facilityKey ?? null
    if (fk && seenFacility.has(fk)) {
      facilityCapSkips.push({ discoveredContentId: a.discoveredContentId, facilityKey: fk, verdict: a.verdict })
      continue
    }
    if (fk) seenFacility.add(fk)
    topPresentable.push(a)
  }

  return {
    generatedAt: now.toISOString(),
    assessed: assessments.length,
    counts: { A: A.length, B: B.length, C: C.length },
    topA,
    aShortfall: A.length < topN,
    topPresentable,
    presentableShortfall: A.length + B.length < topN,
    facilityCapSkips,
    b: B,
    c: C,
    morningThreeSlots: selectMorningThreeSlots(assessments, { facilityHistory: opts.facilityHistory, now }),
  }
}

// ─────────────────────────────────────────────────────────────
// 人間が読むテキスト整形（7:10 レポート）。CLI から呼ぶ。
// ─────────────────────────────────────────────────────────────
function line(s = ''): string {
  return s + '\n'
}

function factKindLabel(a: CandidateAssessment): string {
  const k = a.factKind ?? 'event'
  const conf = a.factKindClassification?.confidence
  const label = k === 'product_news' ? 'product_news（商品ニュース）' : k === 'unknown' ? 'unknown（判定不能）' : 'event（イベント）'
  return `${label}${conf ? ` / 信頼度 ${conf}` : ''}`
}

function renderOne(a: CandidateAssessment, rank: number): string {
  let s = ''
  s += line(`【${rank}位】 DC #${a.discoveredContentId}  [${a.verdict}判定]`)
  s += line(`  タイトル      : ${a.displayTitle}`)
  s += line(`  記事タイプ    : ${factKindLabel(a)}`)
  if (a.factKindClassification)
    s += line(`  分類理由      : ${a.factKindClassification.reasons.join(' / ')}`)
  s += line(`  推薦理由      : ${a.reasons.join(' / ') || '（なし）'}`)
  s += line(`  公式出典      : ${a.sourceName}`)
  s += line(`  URL           : ${a.sourceUrl || '（なし）'}`)
  s += line(`  確認日時      : ${a.verifiedAt ?? '（未記録）'}`)
  if ((a.factKind ?? 'event') === 'event') {
    s += line(`  開催期間      : ${a.eventPeriod}`)
    s += line(`  申込期限      : ${a.applyDeadline}`)
    s += line(`  ArticleFacts  : ${a.factsSource}${a.templateEligible ? '（templateEligible:true）' : ''}`)
  }
  s += line(
    `  重複判定      : ${
      a.dedup.duplicate
        ? `重複あり${a.dedup.existingArticleId != null ? `（Article #${a.dedup.existingArticleId}）` : ''}`
        : a.dedup.possibleDuplicate
          ? '重複の可能性あり（弱シグナル・人間確認）'
          : '重複なし'
    }${a.dedup.externalUnverified ? ' ／ 外部公開記録は未確認・マロン最終確認' : ''}`,
  )
  if (a.dedup.signalSummary && a.dedup.signalSummary.length > 0)
    for (const sg of a.dedup.signalSummary) s += line(`                  ・${sg}`)
  s += line(`  画像方針      : ${a.image.available ? `使用可（${a.image.assetPath}）` : '画像なし'} — ${a.image.policy}`)
  s += line(`  未確認事項    : ${a.unconfirmed.length ? a.unconfirmed.join(' / ') : 'なし'}`)
  if (a.missing.length) s += line(`  不足項目      : ${a.missing.join(' / ')}`)
  if (a.verdict === 'B' && a.bAdditionalMinutes != null)
    s += line(`  記事化想定    : A化まで +約${a.bAdditionalMinutes}分（合計 約${a.estimateMinutes}分）`)
  else s += line(`  記事化想定    : 約${a.estimateMinutes}分`)
  if (a.processingError) s += line(`  処理エラー    : ${a.processingError}（→ この候補は自動的に降格）`)
  if (a.factsProposalPath) s += line(`  ArticleFacts候補: ${a.factsProposalPath}`)
  if (a.extraction) {
    const f = a.extraction.fields
    s += line(`  event 抽出（根拠つき）:`)
    s += line(`    出典       : ${f.sourceName ?? '—'} / ${f.sourceUrl ?? '—'}`)
    s += line(`    確認日時   : ${f.verifiedAt ?? '—'}`)
    s += line(`    公開日     : ${f.publishedAt ?? '—'}`)
    s += line(`    開催/終了  : ${f.eventStartAt ?? '—'} 〜 ${f.eventEndAt ?? '—'}`)
    s += line(`    会場       : ${f.venue ?? '—'}`)
    s += line(`    申込期限   : ${f.applyDeadline ?? '未取得（公式で要確認・推測しない）'}`)
    s += line(`    料金/定員/対象: ${f.price ?? '未取得'} / ${f.capacity ?? '未取得'} / ${f.audience ?? '未取得'}`)
    s += line(`    未確認（admin入力待ち）: ${a.extraction.missingRequired.slice(0, 6).join(' / ')}`)
    if (a.extraction.officiallyNotStated?.length)
      s += line(`    公式記載なし: ${a.extraction.officiallyNotStated.join(' / ')}`)
    if (a.extraction.missingBecauseFetchFailed?.length)
      s += line(`    取得失敗で未取得: ${a.extraction.missingBecauseFetchFailed.join(' / ')}`)
    if (a.extraction.notApplicable?.length)
      s += line(`    記事タイプ上該当なし: ${a.extraction.notApplicable.join(' / ')}`)
    if (a.extraction.venueAddress) s += line(`    会場住所   : ${a.extraction.venueAddress.value}（${a.extraction.venueAddress.method}）`)
    s += line(`    入場料の該当性: ${a.extraction.admissionApplicable}`)
    s += line(`    proposedStatus: ${a.extraction.proposedStatus}（ready 化は 7:10〜8:00 に人間が admin で実施）`)
  }
  if (a.templatePrecheck) {
    const tp = a.templatePrecheck
    s += line(`  ── テンプレート事前検査（7:10・DB書き込みなし） ──`)
    s += line(`    記事種別      : ${tp.templateType}（信頼度 ${tp.templateTypeConfidence}）`)
    s += line(`    判定根拠      : ${tp.templateTypeReasons.join(' / ')}`)
    s += line(`    適用テンプレ  : ${tp.appliedTemplate}`)
    s += line(`    ArticleFacts  : ${tp.articleFactsStatus}`)
    s += line(`    templateEligible 見込み : ${tp.templateEligible}`)
    s += line(`    抽出済み項目  : ${tp.extractedFields.length ? tp.extractedFields.join(' / ') : '（なし）'}`)
    s += line(`    自動入力できる項目 : ${tp.autoFillFields.length ? tp.autoFillFields.join('・') : '（なし）'}（--write-facts で draft へ）`)
    s += line(`    人間確認項目  : ${tp.humanInputFields.length ? tp.humanInputFields.join('・') : 'なし'}`)
    s += line(`    ハッシュタグ候補 : ${tp.hashtagCandidates.length ? tp.hashtagCandidates.join(' ') : '（なし）'}（人間確認待ち）`)
    s += line(`    未確認項目    : ${tp.unconfirmedFields.length ? tp.unconfirmedFields.join(' / ') : 'なし'}`)
    s += line(`    テンプレ不足  : ${tp.missingForTemplate.join(' / ') || 'なし'}`)
    s += line(`    別記事日付混入: ${tp.foreignDateSuspect ? 'あり（要人間確認）' : 'なし'}`)
    s += line(`    判定          : ${tp.decision} ／ ${tp.recommendation}`)
    s += line(`    判定理由      : ${tp.decisionReason}`)
  }
  if (a.productExtraction) {
    const f = a.productExtraction.fields
    s += line(`  product_news 抽出（根拠つき）:`)
    s += line(`    出典       : ${f.sourceName ?? '—'} / ${f.sourceUrl ?? '—'}`)
    s += line(`    確認日時   : ${f.verifiedAt ?? '—'}`)
    s += line(`    販売期間(候補): ${f.saleStartAt ?? '—'} 〜 ${f.saleEndAt ?? '—'}（※別記事由来の疑い・要人間確認の場合あり）`)
    s += line(`    商品名/ブランド/フロア/価格: ${f.productName ?? '未確認'} / ${f.brandOrSeller ?? '未確認'} / ${f.salesLocation ?? '未確認'} / ${f.price ?? '未確認'}`)
    s += line(`    確認済み   : 出典・sourceUrl・確認日時`)
    s += line(`    未確認     : ${a.productExtraction.unknownItems.slice(0, 6).join(' / ')}`)
    if (a.productExtraction.officiallyNotStated.length)
      s += line(`    公式記載なし: ${a.productExtraction.officiallyNotStated.join(' / ')}`)
    s += line(`    該当なし(不要): ${a.productExtraction.notApplicable.slice(0, 4).join(' / ')} …`)
    if (a.productExtraction.conflicts.length)
      s += line(`    矛盾       : ${a.productExtraction.conflicts.join(' / ')}`)
    s += line(`    proposedStatus: draft（商品ニュース必須を公式で人間が確定入力して初めて ready 候補）`)
  }
  return s
}

export function renderMorningReport(report: MorningReport): string {
  let s = ''
  s += line('════════════════════════════════════════════════')
  s += line(`  Project 02 — 7:10 候補レポート`)
  s += line(`  生成: ${report.generatedAt}`)
  s += line(`  評価: DiscoveredContent ${report.assessed} 件（inbox＋approved。承認前情報も含む）`)
  s += line(`  内訳: A=${report.counts.A} / B=${report.counts.B} / C=${report.counts.C}`)
  s += line('════════════════════════════════════════════════')
  s += line()
  s += line('■ 朝の3枠（ビューティー・ファッション／グルメ・スウィーツ／文化・アート、各1件）')
  s += line('  A判定（18カテゴリー全体）の中から表示用に3枠へ絞る。未分類はこの3枠には入れない。')
  for (const slot of report.morningThreeSlots.slots) {
    if (slot.candidate) {
      const c = slot.candidate
      s += line(`  ・${slot.bucketLabel}: DC #${c.discoveredContentId} ${c.displayTitle}`)
      s += line(`      施設: ${c.digestMeta?.facilityLabel || c.digestMeta?.facilityKey || '（不明）'} ／ 期間: ${c.eventPeriod} ／ URL: ${c.sourceUrl || '（なし）'}`)
    } else {
      s += line(`  ・${slot.bucketLabel}: 該当なし（${slot.emptyReason ?? '不明'}）`)
    }
  }
  if (report.morningThreeSlots.facilityCooldownSkips.length > 0) {
    s += line('  ※ 施設14日間クールダウンにより繰り上げ対象となった候補（削除はしていない）：')
    for (const sk of report.morningThreeSlots.facilityCooldownSkips)
      s += line(`    - DC #${sk.discoveredContentId}（${sk.bucketKey}）: ${sk.reason}`)
  }
  s += line()
  s += line('■ 候補一覧（A＋B・優先順位順・最大5）')
  s += line('  A＝公式情報だけで記事生成可能 ／ B＝旬の候補として提示可能・記事生成前に不足項目の公式確認が必要')
  if (report.topPresentable.length === 0) {
    s += line('  A・B判定の候補は 0 件です（Cで埋めません）。')
    s += line('  → 8:00 の選定に出せる候補がありません。当日の投稿判断はマロン／レナで。')
  } else {
    report.topPresentable.forEach((a, i) => {
      s += line()
      s += renderOne(a, i + 1)
      if (a.verdict === 'B') {
        s += line(`  ── B判定：記事生成前に確認が必要 ──`)
        s += line(`  確認すべき公式URL : ${a.sourceUrl || '（なし）'}`)
        s += line(
          `  未確認項目        : ${[...a.missing, ...a.unconfirmed].length ? [...a.missing, ...a.unconfirmed].join(' / ') : a.reasons.join(' / ')}`,
        )
        s += line(`  → 記事生成前に確認が必要（公式URLで不足項目を確認・ArticleFactsをreadyにしてから記事生成へ）`)
      }
    })
    if (report.presentableShortfall) {
      s += line()
      s += line(`  ※ A＋Bは ${report.counts.A + report.counts.B} 件のみ（5件に満たないため、Cでは補充していません）。`)
    }
    if (report.facilityCapSkips.length > 0) {
      s += line()
      s += line('  ※ 同一施設は上位候補に最大1件まで（施設集中回避）。以下は同一施設のため除外：')
      for (const sk of report.facilityCapSkips)
        s += line(`    - DC #${sk.discoveredContentId}（施設: ${sk.facilityKey} ／ [${sk.verdict}判定]）`)
    }
  }

  s += line()
  s += line('■ B判定 全件（参考・詳細）')
  if (report.b.length === 0) s += line('  なし')
  else
    report.b.forEach((a) => {
      s += line(`  - DC #${a.discoveredContentId} ${a.displayTitle}  [${factKindLabel(a)}]`)
      if (a.templatePrecheck) {
        const tp = a.templatePrecheck
        s += line(`      公式URL  : ${a.sourceUrl || '（なし）'}`)
        s += line(`      記事種別 : ${tp.templateType}（信頼度 ${tp.templateTypeConfidence}） ／ 適用テンプレ: ${tp.appliedTemplate}`)
        s += line(`      判定根拠 : ${tp.templateTypeReasons.join(' / ')}`)
        s += line(`      templateEligible 見込み : ${tp.templateEligible} ／ 別記事日付混入: ${tp.foreignDateSuspect ? 'あり' : 'なし'}`)
        s += line(`      抽出済み : ${tp.extractedFields.length ? tp.extractedFields.join(' / ') : '（なし）'}`)
        s += line(`      自動入力可 : ${tp.autoFillFields.length ? tp.autoFillFields.join('・') : '（なし）'}`)
        s += line(`      人間確認 : ${tp.humanInputFields.length ? tp.humanInputFields.join('・') : 'なし'}`)
        s += line(`      タグ候補 : ${tp.hashtagCandidates.length ? tp.hashtagCandidates.join(' ') : '（なし）'}`)
        s += line(`      判定     : ${tp.decision} ／ ${tp.recommendation}  — ${tp.decisionReason}`)
      }
      const k = a.factKind ?? 'event'
      if (k === 'event') {
        s += line(`      不足項目(event必須) : ${a.missing.join(' / ') || a.reasons.join(' / ')}`)
        if (a.extraction && a.extraction.missingRequired.length)
          s += line(`      要確認（admin 入力待ち） : ${a.extraction.missingRequired.join(' / ')}`)
        // 2026-09-09：3分類（公式記載なし＝A必須から除外可 ／ 取得失敗＝再取得で解消しうる ／ 記事タイプ上該当なし）
        if (a.extraction && a.extraction.officiallyNotStated?.length)
          s += line(`      公式記載なし（確認済み） : ${a.extraction.officiallyNotStated.join(' / ')}`)
        if (a.extraction && a.extraction.missingBecauseFetchFailed?.length)
          s += line(`      取得失敗のため未取得（再取得で解消しうる） : ${a.extraction.missingBecauseFetchFailed.join(' / ')}`)
        if (a.extraction && a.extraction.notApplicable?.length)
          s += line(`      記事タイプ上該当なし : ${a.extraction.notApplicable.join(' / ')}`)
        if (a.extraction?.venueAddress)
          s += line(`      会場住所（同一公式ドメインの施設ページ等より） : ${a.extraction.venueAddress.value}`)
      } else if (k === 'product_news') {
        s += line(`      不足項目(product_news必須) : ${a.productExtraction ? a.productExtraction.unknownItems.join(' / ') : '（抽出なし）'}`)
        if (a.productExtraction && a.productExtraction.notApplicable.length)
          s += line(`      該当なし(不要) : ${a.productExtraction.notApplicable.slice(0, 4).join(' / ')} …（event 用の会場・時刻・申込期限・定員・体験時間・ハッシュタグ・eventName は要求しない）`)
        if (a.productExtraction && a.productExtraction.officiallyNotStated.length)
          s += line(`      公式記載なし（確認済み） : ${a.productExtraction.officiallyNotStated.join(' / ')}`)
        if (a.productExtraction && a.productExtraction.missingBecauseFetchFailed?.length)
          s += line(`      取得失敗のため未取得（再取得で解消しうる） : ${a.productExtraction.missingBecauseFetchFailed.join(' / ')}`)
        if (a.productExtraction && a.productExtraction.conflicts.length)
          s += line(`      矛盾     : ${a.productExtraction.conflicts.join(' / ')}`)
      } else {
        s += line(`      理由     : ${a.reasons.join(' / ')}（推測で event / product_news に分類しない。8:00 で人間が判断）`)
      }
      s += line(`      追加確認時間: 約${a.bAdditionalMinutes ?? '?'}分（合計 約${a.estimateMinutes}分）`)
      if (a.factsProposalPath) s += line(`      構造化事実プロポーザル: ${a.factsProposalPath}`)
    })

  s += line()
  s += line('■ C判定（除外・別表）')
  if (report.c.length === 0) s += line('  なし')
  else
    report.c.forEach((a) => {
      s += line(`  - DC #${a.discoveredContentId} ${a.displayTitle}  [${factKindLabel(a)}]`)
      s += line(`      除外理由 : ${a.reasons.join(' / ')}`)
      if (a.processingError) s += line(`      処理エラー: ${a.processingError}`)
    })

  // ── 8:00 意思決定サポート（A=0 / A<5 でも必ず作る） ──
  s += line()
  s += renderDecisionSupport(report)

  s += line()
  s += line('（このレポートは読み取り専用。記事生成・note 投稿・DB 書き込み・課金は行っていません。')
  s += line(' システム内で確認できる範囲の重複は自動確認済み。システム外の note 公開履歴は未確認')
  s += line(' ——最終ゲートは 8:00 の人間確認〈マロン＋レナ〉。Chrome・note ログイン・Cookie は使用していません。）')
  return s
}

// ── A=0 / A<5 時の安全運用ガイド ──
export interface DecisionSupport {
  aCount: number
  /** B のうち「ArticleFacts を ready 化すれば A になる」候補（追加時間つき） */
  promotable: { dcId: number; title: string; addMinutes: number; missingSummary: string }[]
  /** 最短で A を1本用意するのに要する追加時間（分）。promotable が無ければ null */
  fastestPromoteMinutes: number | null
  post0800: 'possible' | 'tight' | 'unlikely'
  post0830: 'possible' | 'tight' | 'unlikely'
  recommendation: 'post' | 'consider' | 'skip'
  maronRenaChecklist: string[]
}

export function buildDecisionSupport(report: MorningReport, opts: { transcribeMinutes?: number } = {}): DecisionSupport {
  const transcribe = opts.transcribeMinutes ?? 25 // 手動転記 20〜30 分の中央
  const aCount = report.counts.A
  const promotable = report.b
    .filter((b) => !b.expired && b.hasTraceableSource && b.ginzaRelevant && (b.factKind ?? 'event') !== 'unknown')
    .map((b) => {
      const k = b.factKind ?? 'event'
      const miss =
        k === 'product_news'
          ? b.productExtraction?.unknownItems.slice(0, 4).join(' / ') ?? ''
          : b.extraction && b.extraction.missingRequired.length
            ? b.extraction.missingRequired.slice(0, 4).join(' / ')
            : b.missing.slice(0, 4).join(' / ')
      return {
        dcId: b.discoveredContentId,
        title: `${b.displayTitle}（${k}）`,
        addMinutes: b.bAdditionalMinutes ?? b.estimateMinutes,
        missingSummary: miss,
      }
    })
    .sort((x, y) => x.addMinutes - y.addMinutes)
  const fastestPromoteMinutes = promotable.length > 0 ? promotable[0].addMinutes : null

  // 6:00 開始・7:10 レポート・8:00 選定・その後に転記、が前提
  // 8:00 まで＝転記に約30分／8:30 まで＝約60分の余裕、で概算
  let post0800: DecisionSupport['post0800']
  let post0830: DecisionSupport['post0830']
  if (aCount >= 1) {
    post0800 = transcribe <= 30 ? 'possible' : 'tight'
    post0830 = 'possible'
  } else if (fastestPromoteMinutes != null) {
    // A 化に fastest 分 + 転記 transcribe 分
    const total = fastestPromoteMinutes + transcribe
    post0800 = 'unlikely' // 7:10 以降に ready 化してから転記＝8:00 はほぼ無理
    post0830 = total <= 80 ? 'tight' : 'unlikely'
  } else {
    post0800 = 'unlikely'
    post0830 = 'unlikely'
  }

  let recommendation: DecisionSupport['recommendation']
  if (aCount >= 1) recommendation = 'post'
  else if (fastestPromoteMinutes != null && post0830 !== 'unlikely') recommendation = 'consider'
  else recommendation = 'skip'

  const maronRenaChecklist: string[] = [
    `A判定の実数は ${aCount} 件（水増ししていない）。`,
    aCount === 0
      ? '「候補なし」を正常結果として扱う。無理に記事生成せず、推測で不足を補完しない。'
      : 'A判定各案件の出典・開催日・会場・申込期限を最終確認する。',
    promotable.length > 0
      ? `B判定 ${promotable.length} 件は ArticleFacts を admin で ready 化すれば A 化可能（最短 +約${fastestPromoteMinutes}分：DC #${promotable[0].dcId}）。7:10〜8:00 に着手するか判断する。`
      : 'B判定に「短時間で A 化できる」候補は無い。',
    'C判定は除外理由を確認（多くは既投稿と重複）。システム外の note 公開履歴は未確認——重複が疑わしい候補は投稿を見送る。',
    `8:00 時点で投稿準備可: ${labelPost(post0800)} ／ 8:30 までに第1投稿: ${labelPost(post0830)} ／ 推奨: ${labelReco(recommendation)}。`,
    '投稿数目標より正確性・安全性を優先する。誤情報・重複投稿・誤公開 0 件が最優先。',
  ]

  return { aCount, promotable, fastestPromoteMinutes, post0800, post0830, recommendation, maronRenaChecklist }
}

function labelPost(v: 'possible' | 'tight' | 'unlikely'): string {
  return v === 'possible' ? '可能' : v === 'tight' ? '厳しい（間に合えば1本）' : '不可（見送り前提）'
}
function labelReco(v: 'post' | 'consider' | 'skip'): string {
  return v === 'post' ? '投稿へ進む' : v === 'consider' ? 'ready化を試み、間に合えば投稿／無理なら見送り' : '本日は投稿を見送る'
}

function renderDecisionSupport(report: MorningReport): string {
  const d = buildDecisionSupport(report)
  let s = ''
  s += line('■ 8:00 候補・カテゴリー選定サポート（マロン＋レナ。7:10 レポートに基づく）')
  s += line(`  A判定の実数     : ${d.aCount} 件${d.aCount === 0 ? '（＝「候補なし」。正常結果として扱う）' : ''}`)
  if (d.aCount > 0) {
    s += line('  A判定各案件     :')
    report.topA.forEach((a, i) => s += line(`    ${i + 1}. DC #${a.discoveredContentId} ${a.displayTitle}（想定 約${a.estimateMinutes}分）`))
  }
  s += line(`  Aへ上げられる可能性:`)
  if (d.promotable.length === 0) s += line('    なし（B判定に短時間でA化できる候補はない）')
  else
    d.promotable.forEach((p) =>
      s += line(`    - DC #${p.dcId} ${p.title}：ArticleFacts を ready 化で A（+約${p.addMinutes}分）／不足: ${p.missingSummary}`),
    )
  s += line(`  最短でA1本      : ${d.fastestPromoteMinutes != null ? `+約${d.fastestPromoteMinutes}分` : '—'}`)
  s += line(`  8:00 時点で投稿準備可 : ${labelPost(d.post0800)}`)
  s += line(`  8:30 までに第1投稿     : ${labelPost(d.post0830)}`)
  s += line(`  推奨             : ${labelReco(d.recommendation)}`)
  s += line('  8:00 に判断する事項:')
  for (const c of d.maronRenaChecklist) s += line(`    ・${c}`)
  return s
}
