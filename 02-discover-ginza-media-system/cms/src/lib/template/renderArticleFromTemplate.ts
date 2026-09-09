import { buildAngleArticleBlocks } from '../ai/articleBlocks'
import type { EditorialProvenanceEntry } from '../ai/generateArticleDraft'
import type { TextBlock } from '../ai/lexical'
import type { AppliedTemplate } from './readyGate'
import { polishArticleDraft, normalizeBrandCollab, type PolishContext } from './polishArticleDraft'
import { buildSaleArticle } from './saleTemplate'
import {
  buildAngleInputFromEvent,
  buildAngleInputFromExhibition,
  buildAngleInputFromGeneric,
  buildTitleCandidates,
  buildTitleCandidatesExhibition,
  buildTitleCandidatesGeneric,
  renderHashtagLine,
  toReaderFacingBlocks,
  type EventArticleFields,
} from './templates'

// GINZA WHISKERS / Project 02 改善 第2段階A（2026-09-02）。
//
// 構造化された「旬の銀座」情報（イベント告知型）→ 記事タイトル・読者向け本文
// ブロック・note 本文 を、追加API課金0円で生成する純粋関数。
//
//   ・Claude API / 他の生成AI を呼ばない（articleBlocks.ts 経由で
//     @anthropic-ai/sdk がモジュールロードされるが、API 呼び出しは無い）。
//   ・DB / Payload / 既存 Article には触れない。
//   ・同じ入力からは必ず同じ出力（決定的）。
//   ・buildAngleArticleBlocks（articleBlocks.ts、Phase 1 で共通化済み）を
//     本文骨格の組み立てに再利用し、内部マーカーは toReaderFacingBlocks で
//     読者向けへ置換する。
//
// 既定モードの変更・draft-today・既存AI生成経路への接続は行っていない
// （このモジュールはどこからも import されていない純粋なユニット）。

export interface TemplateSourceProvenance {
  fact: string
  sourceType: 'primary' | 'official' | 'secondary'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
}

export interface TemplateArticleInput {
  /** 元となる DiscoveredContent 相当の id（provenance の逆引き用。DB 参照はしない） */
  discoveredContentId: string | number
  /** イベント告知型テンプレートの差し込みフィールド */
  fields: EventArticleFields
  /** 出典名（例: GINZA OFFICIAL） */
  sourceName: string
  /** 出典 URL（入力どおり保持） */
  sourceUrl: string
  /** システムが実際に確認した日時（ISO 文字列）。無ければ「確認日不明」表記になる */
  verifiedAt?: string
  /** 出典事実。confirmed のみを本文の provenance に使う */
  sourceProvenance: TemplateSourceProvenance[]
  /** ハッシュタグ（先頭 # 込み、入力どおり） */
  hashtags: string[]
  /** 回遊導線に載せる実在の公開済み記事タイトル（AI に作文させない前提で呼び出し元が渡す） */
  relatedArticleTitles?: string[]
  /**
   * 適用する本文テンプレート（2026-09-03、共通 Article Facts 化）。
   * 未指定なら editionLabel/theme の有無から従来どおり exhibition / recurring_event を推定。
   * 'sale' は商品販売・フェア専用の 8 セクション renderer（saleTemplate.ts）。
   * 'generic' は専用テンプレの無い種別のフォールバック（confirmed 事実のみで構成）。
   */
  appliedTemplate?: AppliedTemplate
}

export interface TemplateArticleResult {
  /** 既定タイトル（titleCandidates[0]） */
  title: string
  /** タイトル案（決定的・3件） */
  titleCandidates: string[]
  /** 読者向け本文ブロック（内部マーカー・画像指示を含まない） */
  blocks: TextBlock[]
  /** note 転記用の本文テキスト（blocks を \n\n 連結 + 末尾ハッシュタグ行） */
  noteBody: string
  /** noteBody の文字数（コードポイント数） */
  charCount: number
  /** 使用したハッシュタグ */
  hashtags: string[]
  /** confirmed な出典事実から機械生成した provenance（buildAngleArticleBlocks 由来） */
  provenance: EditorialProvenanceEntry[]
  /**
   * Article.callToAction に保存する値。**テンプレ既定文を無条件には返さない**。
   * 「購入 / 参加・申込」がある記事で confirmed 事実（公式 URL）に裏づけられた
   * CTA のみ文字列、それ以外は null（＝本文末尾に CTA を出さない）。
   */
  callToAction: string | null
}

export function renderArticleFromTemplate(input: TemplateArticleInput): TemplateArticleResult {
  // 0. ブランドコラボ名（AMBUSH® × New Era® 等）の × / x 記号と空白を先に正規化してから
  //    各テンプレートへ渡す（タイトルのシリーズ名抽出が壊れるのを防ぐ・全テンプレ共通）。
  const fields: EventArticleFields = {
    ...input.fields,
    eventName: normalizeBrandCollab(input.fields.eventName ?? ''),
  }

  // 1. 未確認・矛盾ありの事実は本文に使わない（confirmed のみ）
  const confirmedProvenance = input.sourceProvenance.filter(
    (p) => p.verificationStatus === 'confirmed',
  )

  // provenance（confirmed 事実 → EditorialProvenanceEntry）を機械生成するヘルパー
  //   （buildAngleArticleBlocks 経由と同じ形。sale バリアントはこちらを使う）
  const buildProvenance = (): EditorialProvenanceEntry[] =>
    confirmedProvenance.map((p) => ({
      discoveredContentId: input.discoveredContentId,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      verifiedAt: input.verifiedAt,
      fact: p.fact,
      sourceType: p.sourceType,
      factType: p.factType,
      verificationStatus: p.verificationStatus,
    }))

  // 2. 構造化フィールド -> buildAngleArticleBlocks へ渡す narrative（差し込みのみ）
  //    appliedTemplate があればそれに従う。無ければ editionLabel/theme の有無で
  //    exhibition（展覧会・回次/テーマなし）か recurring_event（銀茶会型）を推定。
  const inferredRecurring =
    !!(fields.editionLabel ?? '').trim() && !!(fields.theme ?? '').trim()
  const applied: AppliedTemplate =
    input.appliedTemplate ?? (inferredRecurring ? 'recurring_event' : 'exhibition')

  // 後処理（品質調整）の共通コンテキスト：会場・ブランド・カテゴリー由来のハッシュタグ補完等に使う
  const polishCtx: PolishContext = {
    appliedTemplate: applied,
    eventName: fields.eventName,
    brand: (fields.eventName ?? '')
      .replace(/^【[^】]*】\s*/, '')
      .match(/^([^\s　「」『』（(×]{2,24})/)?.[1]
      ?.replace(/[®™]/g, ''),
    category: fields.primaryCategory,
    venueNames: (fields.venues ?? []).map((v) => v?.name ?? '').filter(Boolean),
    venuePlaces: (fields.venues ?? []).map((v) => v?.place ?? '').filter(Boolean),
  }

  // --- sale：専用の 8 セクション renderer（buildAngleArticleBlocks を経由しない） ---
  if (applied === 'sale') {
    const sale = buildSaleArticle(fields, {
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      verifiedAt: input.verifiedAt,
    })
    const polished = polishArticleDraft(
      { titleCandidates: sale.titleCandidates, blocks: sale.blocks, hashtags: input.hashtags },
      polishCtx,
    )
    const noteBody =
      polished.blocks.map((b) => b.text).join('\n\n') + '\n\n' + renderHashtagLine(polished.hashtags)
    return {
      title: polished.titleCandidates[0],
      titleCandidates: polished.titleCandidates,
      blocks: polished.blocks,
      noteBody,
      charCount: [...noteBody].length,
      hashtags: polished.hashtags,
      provenance: buildProvenance(),
      callToAction: (fields.callToAction ?? '').trim() || null,
    }
  }

  const isExhibition = applied === 'exhibition'
  const isGeneric = applied === 'generic'
  const angleInput = isGeneric
    ? buildAngleInputFromGeneric(fields)
    : isExhibition
      ? buildAngleInputFromExhibition(fields)
      : buildAngleInputFromEvent(fields)

  // 3. 本文骨格の組み立ては既存の buildAngleArticleBlocks を再利用（CORE 角度）
  const { blocks: rawBlocks, provenance } = buildAngleArticleBlocks(
    'core',
    angleInput,
    {
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      verifiedAt: input.verifiedAt,
    },
    confirmedProvenance,
    input.discoveredContentId,
    (input.relatedArticleTitles ?? []).map((title) => ({ title })),
  )

  // 4. 内部マーカー（【..】/ WHY NOW？ / EDITOR'S NOTE / SOURCE: / → 次に：）を
  //    読者向けへ決定的に置換・再配置（WHY NOW？ は落とし、SOURCE は末尾へ）
  //    展覧会バリアントでは officialInfoNote を本文へ出さない
  //    （未確認事項の分離先。本文は confirmed な構造化事実だけで構成する）。
  //    exhibition/generic は officialInfoNote を本文へ出さない（分離）。recurring_event（銀茶会型）は末尾へ。
  const blocks = toReaderFacingBlocks(
    rawBlocks,
    // recurring_event と generic（sale 含む）は officialInfoNote を末尾へ出す。
    // exhibition は officialInfoNote を本文へ出さない（未確認事項の分離先）。
    applied === 'recurring_event' || applied === 'generic'
      ? { officialInfoNoteAtEnd: fields.officialInfoNote }
      : {},
  )

  // 5. タイトル（決定的）
  const rawTitleCandidates = isGeneric
    ? buildTitleCandidatesGeneric(fields)
    : isExhibition
      ? buildTitleCandidatesExhibition(fields)
      : buildTitleCandidates(fields)

  // 6. 後処理（品質調整）＋ note 本文（blocks を \n\n 連結 + 末尾ハッシュタグ行）
  const polished = polishArticleDraft(
    { titleCandidates: rawTitleCandidates, blocks, hashtags: input.hashtags },
    polishCtx,
  )
  const noteBody =
    polished.blocks.map((b) => b.text).join('\n\n') + '\n\n' + renderHashtagLine(polished.hashtags)

  return {
    title: polished.titleCandidates[0],
    titleCandidates: polished.titleCandidates,
    blocks: polished.blocks as TextBlock[],
    noteBody,
    charCount: [...noteBody].length,
    hashtags: polished.hashtags,
    provenance,
    // recurring_event / application は mapper が「申込あり」に裏づけて callToAction を埋める。
    // exhibition / generic は空（本文末尾に CTA を出さない）。
    callToAction: (fields.callToAction ?? '').trim() || null,
  }
}
