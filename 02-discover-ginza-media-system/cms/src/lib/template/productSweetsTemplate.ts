// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：「商品・スウィーツ専用の
// 決定論的テンプレート」新設）
//
// 【背景】既存のイベント用テンプレート（renderArticleFromTemplate.ts /
// saleTemplate.ts / readyGate.ts）は、ready な ArticleFacts（イベント専用
// スキーマ：eventDate/eventTime/venues/editionLabel/theme/whatHappens/
// areaLead/audienceNote/paid/applyDeadline/resultDate/resultRule/applyRule/
// officialInfoNote 等）を要求する。DC #1152のような単純な商品・スウィーツの
// 販売情報はこのスキーマに合わず、ArticleFacts自体が作成されないため
// （factKind=product_newsの構造化事実は `.devlogs/morning/<date>/facts/` の
// プロポーザルに留まりDBへ書かれない設計・2026-09-02決定）、常に
// route=human_review へ落ちてしまう。
//
// 【このモジュールの役割】ArticleFactsを一切必要とせず、DiscoveredContentが
// 元々持っている軽量フィールドだけから「商品・スウィーツ」記事を決定的に
// （AIなし・追加課金0円）組み立てる、完全に独立した新規テンプレート。
// 既存のイベント用テンプレート（上記3ファイル）は一切変更しない。
//
// 【使用可能フィールド（マロン指定）】sourceName / sourceUrl / verifiedAt /
// title / venue / contentType / excerpt（本文抜粋） / 販売期間
// （eventStartAt/eventEndAt） / 価格（excerptから既存extractPriceHintで
// ラベル近傍のみ抽出——推測補完しない）。これ以外の事実を足さない。
// 欠落項目は「公式記載なし」と明記する（捏造しない）。
//
// 【本文構成（マロン指定）】なぜ今、見に行くか／見どころ／会期・時間・会場／
// 訪問前の注意／出典／GINZA WHISKERSの視点。
//
// 【厳守】
//   ・AI / ネットワーク / DB に触れない（純粋関数）。同じ入力から必ず同じ出力。
//   ・「見どころ」は公式抜粋（excerpt）をそのまま使う——新たな文章の創作は
//     しない。「訪問前の注意」「GINZA WHISKERSの視点」は特定の事実を主張
//     しない定型文（テンプレートの固定文言、記事ごとに変わらない）。
//   ・価格判定は既存 extractPriceHint と同じ基準（ラベル近傍のみ）を用いる
//     ——本文中の孤立した金額表記（ラベルなし）は確認済み価格として扱わない。

import type { TextBlock } from '../ai/lexical'
import { formatVerifiedAtForDisplay, type EditorialProvenanceEntry } from '../ai/generateArticleDraft'
import { extractPriceHint } from '../morning/extractPriceHint'
import { resolveFacilityKey } from '../curation/facilityKey'
import { deriveProvisionalCategory } from '../pipeline/provisionalCategory'
import { renderHashtagLine } from './templates'

export const NOT_STATED = '公式記載なし'

export interface ProductSweetsTemplateInput {
  /** 元となる DiscoveredContent の id（provenance の逆引き用） */
  discoveredContentId: string | number
  sourceName: string
  sourceUrl: string
  /** システムが実際に確認した日時（ISO 文字列）。無ければ「確認日不明」表記 */
  verifiedAt?: string | null
  title: string
  venue?: string | null
  contentType?: string | null
  /** 公式ページ本文の抜粋（そのまま「見どころ」に使う。要約・書き換えしない） */
  excerpt?: string | null
  /** 販売期間の開始（ISO）。DiscoveredContent.eventStartAt 相当 */
  eventStartAtISO?: string | null
  /** 販売期間の終了（ISO）。DiscoveredContent.eventEndAt 相当 */
  eventEndAtISO?: string | null
  /**
   * ハッシュタグを明示指定する場合（呼び出し元が人間承認済みの固定タグを
   * 渡す場合等）はそのまま使う。4個未満なら不足分を決定的な既定ルールで補う。
   * 未指定なら既定ルール（#旬の銀座／カテゴリー／施設／#GINZATIMEEDIT）のみで構成。
   */
  hashtags?: string[]
  /** 呼び出し元が把握している6:00定時収集の実行ID等（provenanceのfactへ含める） */
  collectionRunNote?: string | null
}

export interface ProductSweetsTemplateResult {
  title: string
  titleCandidates: string[]
  blocks: TextBlock[]
  noteBody: string
  charCount: number
  hashtags: string[]
  provenance: EditorialProvenanceEntry[]
  callToAction: string | null
  facilityLabel: string
  categoryLabel: string | null
  /** 会期・価格が公式記載で確認できたかどうか（監査用） */
  salesPeriodConfirmed: boolean
  priceConfirmed: boolean
}

function formatDateJa(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
}

function formatSalesPeriod(startISO?: string | null, endISO?: string | null): { text: string; confirmed: boolean } {
  const s = startISO ? formatDateJa(startISO) : null
  const e = endISO ? formatDateJa(endISO) : null
  if (s && e) return { text: `${s}〜${e}`, confirmed: true }
  if (s) return { text: `${s}から（終了日 ${NOT_STATED}）`, confirmed: false }
  if (e) return { text: `${NOT_STATED}〜${e}`, confirmed: false }
  return { text: NOT_STATED, confirmed: false }
}

// カテゴリー→ハッシュタグ（18カテゴリーのうちマロン指定の対象範囲＝食関連のみ。
// それ以外のカテゴリーが来た場合は汎用の #銀座グルメ にフォールバックする
// ——このテンプレートは「商品・スウィーツ」専用だが、deriveProvisionalCategory
// 自体はSWEETS以外も返し得るため安全側のフォールバックを用意する）。
const CATEGORY_HASHTAG: Record<string, string> = {
  SWEETS: '#銀座スイーツ',
  FOOD: '#銀座グルメ',
  CAFE: '#銀座カフェ',
  GIFT: '#銀座ギフト',
  SHOPPING: '#銀座ショッピング',
}

export function buildProductSweetsArticle(
  input: ProductSweetsTemplateInput,
): ProductSweetsTemplateResult {
  const period = formatSalesPeriod(input.eventStartAtISO, input.eventEndAtISO)
  const priceHint = extractPriceHint(input.excerpt)
  const priceText = priceHint.price ?? NOT_STATED
  const priceConfirmed = priceHint.price != null
  const venueText = (input.venue ?? '').trim() || NOT_STATED
  const excerptText = (input.excerpt ?? '').trim()
  const verifiedDisplay = formatVerifiedAtForDisplay(input.verifiedAt ?? undefined)

  const facility = resolveFacilityKey({
    venue: input.venue,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    title: input.title,
  })
  const facilityLabel = facility.store || input.sourceName

  const category = deriveProvisionalCategory({
    title: input.title,
    venue: input.venue,
    contentType: input.contentType,
  })
  const categoryTag = (category.category && CATEGORY_HASHTAG[category.category]) || '#銀座グルメ'
  const facilityTag = facilityLabel ? `#${facilityLabel.replace(/\s+/g, '')}` : null

  // --- ① なぜ今、見に行くか ---
  const whyNowText = period.confirmed
    ? `${input.title}は、${period.text}の期間、${venueText}にて販売されています（${input.sourceName}公式サイトで確認済み・確認日 ${verifiedDisplay}）。`
    : `${input.title}の販売期間は${NOT_STATED}です。詳細は${input.sourceName}公式サイトでご確認ください（確認日 ${verifiedDisplay}）。`

  // --- ② 見どころ（公式抜粋をそのまま使う。書き換え・創作をしない） ---
  const highlightText = excerptText
    ? excerptText
    : `商品の詳細は${input.sourceName}公式サイトに掲載されています（公式ページからの抜粋は${NOT_STATED}）。`

  // --- ③ 会期・時間・会場 ---
  const infoLines = [`会期：${period.text}`, `会場：${venueText}`, `価格：${priceText}`].join('\n')

  // --- ④ 訪問前の注意（特定の事実を主張しない定型文） ---
  const cautionText =
    '価格・販売期間・在庫状況は変更となる場合があります。お出かけ前に公式サイトでの最新情報のご確認をおすすめします。'

  // --- ⑥ GINZA WHISKERSの視点（特定の事実を主張しない定型文） ---
  const viewpointText = `季節の銀座で見つけた一品としてご紹介しました。本記事の情報は${input.sourceName}公式サイトの記載にもとづいています。`

  const blocks: TextBlock[] = [
    { type: 'heading', level: 2, text: 'なぜ今、見に行くか' },
    { type: 'paragraph', text: whyNowText },
    { type: 'heading', level: 2, text: '見どころ' },
    { type: 'paragraph', text: highlightText },
    { type: 'heading', level: 2, text: '会期・時間・会場' },
    { type: 'paragraph', text: infoLines },
    { type: 'heading', level: 2, text: '訪問前の注意' },
    { type: 'paragraph', text: cautionText },
    { type: 'heading', level: 2, text: 'GINZA WHISKERSの視点' },
    { type: 'paragraph', text: viewpointText },
    { type: 'quote', text: `SOURCE: ${input.sourceName}／確認: ${verifiedDisplay}／${input.sourceUrl}` },
  ]

  // --- タイトル案（決定的・3件。事実の言い換えのみ、新規情報を足さない） ---
  const titleBase = input.title.trim()
  const titleCandidates = Array.from(
    new Set(
      [
        titleBase,
        facilityLabel && facilityLabel !== titleBase ? `${facilityLabel}で見つけた「${titleBase}」` : null,
        period.confirmed ? `${period.text}、${facilityLabel}にて「${titleBase}」` : null,
      ].filter((t): t is string => !!t && t.trim().length > 0),
    ),
  )
  if (titleCandidates.length === 0) titleCandidates.push(titleBase)

  // --- ハッシュタグ4個（決定的既定ルール。呼び出し元指定があれば優先） ---
  const providedTags = (input.hashtags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
  const defaultTags = Array.from(
    new Set(['#旬の銀座', categoryTag, ...(facilityTag ? [facilityTag] : []), '#GINZATIMEEDIT']),
  )
  const hashtags = (providedTags.length >= 4 ? providedTags : defaultTags).slice(0, 4)

  // --- provenance（確認済み事実のみ。推測しない） ---
  const provenance: EditorialProvenanceEntry[] = []
  const baseNote = input.collectionRunNote ? `（${input.collectionRunNote}）` : ''
  if (venueText !== NOT_STATED) {
    provenance.push({
      discoveredContentId: input.discoveredContentId,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      verifiedAt: input.verifiedAt ?? undefined,
      fact: `会場は${venueText}${baseNote}`,
      sourceType: 'official',
      factType: 'venue',
      verificationStatus: 'confirmed',
    })
  }
  if (period.confirmed) {
    provenance.push({
      discoveredContentId: input.discoveredContentId,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      verifiedAt: input.verifiedAt ?? undefined,
      fact: `販売期間は${period.text}${baseNote}`,
      sourceType: 'official',
      factType: 'date',
      verificationStatus: 'confirmed',
    })
  }
  if (priceConfirmed) {
    provenance.push({
      discoveredContentId: input.discoveredContentId,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      verifiedAt: input.verifiedAt ?? undefined,
      fact: `価格は${priceText}${baseNote}`,
      sourceType: 'official',
      factType: 'price',
      verificationStatus: 'confirmed',
    })
  }

  const noteBody = blocks.map((b) => b.text).join('\n\n') + '\n\n' + renderHashtagLine(hashtags)

  return {
    title: titleCandidates[0],
    titleCandidates,
    blocks,
    noteBody,
    charCount: [...noteBody].length,
    hashtags,
    provenance,
    // 購入条件が公式記載で確認できていないため、CTAは出さない（推測しない）。
    callToAction: null,
    facilityLabel,
    categoryLabel: category.category,
    salesPeriodConfirmed: period.confirmed,
    priceConfirmed,
  }
}
