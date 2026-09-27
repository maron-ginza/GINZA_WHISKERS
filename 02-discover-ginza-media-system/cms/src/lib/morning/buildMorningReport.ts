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

import type { CandidateAssessment, MorningReport, SourceAvailability } from './types'
import { buildCandidateBoard, type BoardEntry } from './candidateBoard'
import { filterByCategory, filterNonSweetsClassified, summarizeShortfallReasons } from './categoryShortfallSummary'
import { PRIMARY_CATEGORY_8, PRIMARY_CATEGORY_8_LABELS, mapToPrimaryCategory8 } from '../pipeline/primaryCategory8'
import type { CandidateBoard } from './candidateBoard'

// 【2026-09-24追加・マロン指示：主カテゴリー整理】既存18カテゴリー（byCategory）の
// 表示は変更せず、その上にマロンが一覧しやすい8分類の件数サマリを追加する。
// 18カテゴリー・アイコン・DBのカテゴリーフィールドは一切変更しない（表示のみの集約）。
function summarizePrimaryCategory8(board: CandidateBoard): { label: string; count: number }[] {
  const counts = new Map<string, number>(PRIMARY_CATEGORY_8.map((c) => [c, 0]))
  let unmapped = 0
  const tally = (cat: string | null) => {
    const mapped = mapToPrimaryCategory8(cat)
    if (mapped) counts.set(mapped, (counts.get(mapped) ?? 0) + 1)
    else unmapped += 1
  }
  for (const e of board.sweets) tally(e.category)
  for (const cat of Object.keys(board.byCategory)) for (const e of board.byCategory[cat]) tally(e.category)
  // unclassified（18カテゴリー未確定）は8分類でも当然未確定のため unmapped に数えない
  // （もともとカテゴリーが無いことが明示されている候補であり、8分類マッピングの
  // 取りこぼしではないため区別する）。
  const rows = PRIMARY_CATEGORY_8.map((c) => ({ label: PRIMARY_CATEGORY_8_LABELS[c], count: counts.get(c) ?? 0 }))
  if (unmapped > 0) rows.push({ label: '（8分類未対応の18カテゴリー値・要確認）', count: unmapped })
  return rows
}

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
  opts: { now?: Date; topN?: number; usedDcIds?: ReadonlySet<number>; unavailableSources?: SourceAvailability[] } = {},
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

  const candidateBoard = buildCandidateBoard(assessments, opts.usedDcIds ?? new Set())

  // 【2026-09-24続き2追加・マロン指示】SWEETSは毎朝優先して探す——candidateBoard.sweets
  // が0件のときだけ、実際に落ちた理由と件数を機械的に集計して添える（新たな判定ロジック・
  // 新たな除外条件は追加しない。既存の判定結果を集計するだけ）。
  const sweetsShortfall =
    candidateBoard.sweets.length === 0 ? summarizeShortfallReasons(filterByCategory(assessments, 'SWEETS')) : undefined
  // SWEETS以外の18カテゴリーも全て0件（byCategoryが空）のときは、他カテゴリー全体の
  // 概観も添える——「システムが最終3本を決めず複数提示する」前提のうえで、なぜ提示できる
  // ものが無いのかをマロンが判断できるようにする。
  const otherCategoriesShortfall =
    Object.keys(candidateBoard.byCategory).length === 0
      ? summarizeShortfallReasons(filterNonSweetsClassified(assessments))
      : undefined

  // 【2026-09-25追加・マロン指示】「選定可能」（8カテゴリーに分類済み）と「未分類・要確認」
  // （分類保留、Stage 4選定の対象外）を機械可読な形でも別々に持つ——JSON出力（--json）を
  // 読む側が counts.A（合算値）だけを見て未分類を選定可能に含めてしまうことを防ぐ。
  const selectableCount =
    candidateBoard.sweets.length + Object.values(candidateBoard.byCategory).reduce((sum, list) => sum + list.length, 0)
  const unclassifiedCount = candidateBoard.unclassified.length

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
    // Stage 3：A候補ボード（読み取り専用・A/B/Cを変更しない）。usedDcIds は「過去に
    // マロンが実際に選定したDC」の集合（呼び出し元が selectionRecord.collectUsedDcIds
    // で用意する。未指定なら空集合＝除外なし）。
    candidateBoard,
    sourceAvailability: opts.unavailableSources ?? [],
    sweetsShortfall,
    otherCategoriesShortfall,
    selectableCount,
    unclassifiedCount,
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

function renderBoardEntry(e: BoardEntry): string {
  let s = ''
  s += line(`    - DC #${e.discoveredContentId} ${e.title}`)
  s += line(`        施設: ${e.facilityLabel ?? '（不明）'} ／ 期間: ${e.eventPeriod} ／ URL: ${e.sourceUrl || '（なし）'}`)
  s += line(`        A判定理由: ${e.reasons.join(' / ')}`)
  if (e.facilityNotice) {
    const n = e.facilityNotice
    s += line(
      `        ⚠ ${n.message} ／ 親施設: ${n.parentFacilityLabel ?? '（不明）'} ／ 前回使用日: ${n.lastUsedDate ?? '（不明）'} ／ ` +
        `前回の記事ID: ${n.lastArticleId != null ? `#${n.lastArticleId}` : '（該当なし）'} ／ 経過日数: ${n.daysSince != null ? `${n.daysSince}日` : '（不明）'}`,
    )
    s += line(`        → A判定は維持（施設クールダウンはA/B/C判定に影響しない）。最終3本への採否はマロンが判断。`)
  }
  if (e.preStartNotice) {
    s += line(`        📅 ${e.preStartNotice.message}`)
    s += line(`        → A判定は維持するが「予告・要確認」——本日時点で実際に選定可能（販売・開催中）ではない。開始日以降に再確認のうえ選定すること。`)
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
  if (report.sourceAvailability.length > 0) {
    s += line('■ 取得失敗した公式収集元（確認不能・2026-09-17追加）')
    s += line('  「該当情報0件」と「収集元へ到達できず確認不能」は異なる——以下の収集元は取得できていないだけで、')
    s += line('  実際には情報が存在する可能性がある。取得失敗を理由に既存の有効なA候補を削除・降格してはいない。')
    for (const src of report.sourceAvailability) {
      s += line(`    - ${src.name}（${src.sourceId}） [${src.healthStatus}] 確認日時: ${src.healthCheckedAt ?? '（未記録）'}`)
      if (src.healthNote) s += line(`        ${src.healthNote}`)
    }
    s += line()
  }
  s += line('■ Stage 3：A候補ボード（最終3本はここでは確定しない・マロンが選ぶ）')
  s += line('  A判定は既に現在性・既処理・近似重複を通過済み（B/Cはここに出さない）。')
  s += line('  【2026-09-24再改訂・マロン指示】「同一施設を直近14日以内に掲載」は一律除外条件に')
  s += line('  しない（2026-09-23改訂を撤回）。同一商品・同一企画・既投稿の重複は別途除外済みで、')
  s += line('  同じ施設・同じ館内の別ブランド・別企画はこのボードに残る。施設への偏りは除外ではなく')
  s += line('  「選定時の優先順位」で調整する（直近使用済みの候補は同点内で後方へ弱く押し下げるのみ）。')
  s += line('  このボードはA/B/Cを一切変更しない読み取り専用の表示。除外するのは使用済み')
  s += line('  （過去に実際に選定済み）のA候補のみ。')
  s += line(`  （使用済みのため除外した件数: ${report.candidateBoard.usedExcludedCount}）`)
  s += line(`  （直近14日以内の同一施設投稿の注意表示あり・除外はしていない件数: ${report.candidateBoard.facilityRecentlyUsedNoticeCount}）`)
  s += line(`  （販売・開催が本日時点で未開始〈予告・要確認〉の注意表示あり・除外はしていない件数: ${report.candidateBoard.preStartNoticeCount}）`)
  s += line()
  // 【2026-09-25追加・マロン指示】「選定可能」と「未分類・要確認」を合算せず別々に示す
  // ——未分類（category:null）は8カテゴリーへの機械分類に失敗しているだけで、公式確認・
  // ArticleFacts readyの水準は分類済み候補と同じでも、そのままではStage 4選定の対象に
  // 含めない（推測でカテゴリーを割り当てない既存方針）。合計20件のような単一の集計値だけを
  // 見せると未分類が選定可能候補であるかのように誤読されるため、内訳を明示する。
  const selectableCount =
    report.candidateBoard.sweets.length +
    Object.values(report.candidateBoard.byCategory).reduce((sum, list) => sum + list.length, 0)
  const unclassifiedCount = report.candidateBoard.unclassified.length
  s += line(
    `  選定可能（8カテゴリーに分類済み・公式確認済み・ArticleFacts ready）: ${selectableCount}件` +
      ` ／ 未分類・要確認（分類保留、Stage 4選定の対象外）: ${unclassifiedCount}件` +
      ` （合計A判定 ${report.counts.A}件）`,
  )
  s += line()
  s += line('  ◆ 主カテゴリー（8分類・表示集約のみ。18カテゴリー・アイコンは変更していない）')
  for (const row of summarizePrimaryCategory8(report.candidateBoard)) {
    s += line(`      - ${row.label}: ${row.count}件`)
  }
  s += line()
  s += line(`  ◆ SWEETS（${report.candidateBoard.sweets.length}件・先頭の独立枠・毎朝優先して探す）`)
  if (report.candidateBoard.sweets.length === 0) {
    s += line('    SWEETS 0件')
    if (report.sweetsShortfall && report.sweetsShortfall.totalNonA > 0) {
      s += line(`    （SWEETS分類の候補 ${report.sweetsShortfall.totalNonA}件のうち、実際に落ちた理由の内訳）`)
      for (const r of report.sweetsShortfall.reasons) s += line(`      - ${r.label}: ${r.count}件`)
    } else {
      s += line('    （SWEETSに分類された候補自体が今回の評価対象に存在しない）')
    }
  } else for (const e of report.candidateBoard.sweets) s += renderBoardEntry(e)
  const catKeys = Object.keys(report.candidateBoard.byCategory).sort()
  if (catKeys.length === 0) {
    s += line()
    s += line('  ◆ その他カテゴリー：該当候補なし')
    if (report.otherCategoriesShortfall && report.otherCategoriesShortfall.totalNonA > 0) {
      s += line(`    （SWEETS以外に分類された候補 ${report.otherCategoriesShortfall.totalNonA}件のうち、実際に落ちた理由の内訳）`)
      for (const r of report.otherCategoriesShortfall.reasons) s += line(`      - ${r.label}: ${r.count}件`)
    }
  } else {
    for (const cat of catKeys) {
      s += line()
      s += line(`  ◆ ${cat}（${report.candidateBoard.byCategory[cat].length}件）`)
      for (const e of report.candidateBoard.byCategory[cat]) s += renderBoardEntry(e)
    }
  }
  if (report.candidateBoard.unclassified.length > 0) {
    s += line()
    s += line(`  ◆ 未分類（推測で割り当てず未分類のまま。${report.candidateBoard.unclassified.length}件・Stage 4選定の対象外）`)
    for (const e of report.candidateBoard.unclassified) s += renderBoardEntry(e)
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
