import { ARTICLE_BLOCK_MARKERS } from '../ai/articleBlocks'
import type { TextBlock } from '../ai/lexical'

// GINZA WHISKERS / Project 02 改善 第2段階A — 追加API課金0円のテンプレート生成
// エンジン（2026-09-02、文章品質 refine 反映）。
//
// 【役割】構造化された「旬の銀座」情報（イベント告知型）を、固定テンプレート
// ＋差し込みだけで読者向け記事へ変換するための純粋関数群。Claude API・他の
// 生成AI・DB・Payload には一切依存しない。同じ入力からは必ず同じ出力になる
// （乱数・現在時刻・ロケール依存の整形を使わない）。
//
// 【buildAngleArticleBlocks との関係】記事本文ブロックの骨格は既存の
// articleBlocks.ts / buildAngleArticleBlocks をそのまま再利用する。ただし
// buildAngleArticleBlocks が付ける内部用マーカー（【角度ラベル】/ WHY NOW？ /
// EDITOR'S NOTE / SOURCE: / → 次に：）は読者向けに出さないため、
// toReaderFacingBlocks() で決定的に読者向けへ置換・再配置する。
//
// 【refine（2026-09-02）】
//   ・タイトルは基本案45文字以内、開催日と申込期限を1案に詰め込まない。
//   ・本文中で同じ開催日・申込期限・当選発表日を繰り返さない。
//   ・「なぜ、いまお伝えするのか」は独立見出しにせず申込案内へ統合。
//   ・「GINZA WHISKERS の視点」は固定説明文でなく editorsNoteSeed（人間の
//     編集後記）を優先。無い場合は入力情報だけの控えめな定型文。
//   ・公式情報（確認日・URL）は末尾に簡潔な1行で記載。

// ---------------------------------------------------------------------------
// 読者向けセクション見出し（内部用語は使わない）
// ---------------------------------------------------------------------------
export const READER_HEADINGS = {
  editorsView: 'GINZA WHISKERS の視点',
  nextStep: '次の一歩',
} as const

/**
 * テンプレート既定文（人間が ArticleFacts に入力していないときのプレースホルダ）。
 * **無条件には本文へ出さない**。CTA は「confirmed 事実＋公式 URL があり、参加・予約・
 * 購入の案内が必要な記事」のときだけ出す（mapDiscoveredContentToEventFields で判定）。
 */
export const TEMPLATE_DEFAULT_CLOSING = '気になる方は、公式情報を確認のうえお出かけください。'
export const TEMPLATE_DEFAULT_CTA = '詳細と参加方法は、公式の案内をご確認ください。'

// ---------------------------------------------------------------------------
// buildAngleArticleBlocks（articleBlocks.ts）が本文へ埋め込む内部マーカー。
// 【二重管理の解消（2026-09-02、第2段階B）】マーカー文字列の定義元は
// articleBlocks.ts の ARTICLE_BLOCK_MARKERS ただ1つ。ここでは再エクスポート
// と、そこから導出した正規表現・ラベルだけを持つ（独自のリテラルは持たない）。
// ---------------------------------------------------------------------------
export { ARTICLE_BLOCK_MARKERS } from '../ai/articleBlocks'

/** 冒頭の角度ラベル段落（例: 【CORE（核記事）】）にマッチ。ARTICLE_BLOCK_MARKERS から導出 */
const ANGLE_LABEL_RE = new RegExp(
  `^${ARTICLE_BLOCK_MARKERS.angleLabelOpen}.+${ARTICLE_BLOCK_MARKERS.angleLabelClose}$`,
)
/** SOURCE 引用内の「確認: 」ラベル（先頭の全角スラッシュを除いた部分）。ARTICLE_BLOCK_MARKERS から導出 */
const VERIFIED_LABEL = ARTICLE_BLOCK_MARKERS.sourceQuoteVerifiedSep.slice(
  ARTICLE_BLOCK_MARKERS.sourcePartSep.length,
)

// ---------------------------------------------------------------------------
// テンプレート入力（イベント告知型）
// ---------------------------------------------------------------------------
export interface EventVenue {
  /** 企画・体験名（例: 濃茶体験会） */
  name: string
  /** 場所（例: 植松ビル地下1階の茶室「銀座慶庵」） */
  place: string
}

export interface EventArticleFields {
  /** 18カテゴリー（BEAUTY / ART / …）。sale の「EDITOR'S CHOICE | <CATEGORY>」見出し等で使う。空なら見出しはカテゴリー無し */
  primaryCategory?: string
  /** 季節（入力値。記事内で「秋」等を使うため。テンプレは季節を推測しない） */
  season: string
  /** イベント名（例: 銀茶会） */
  eventName: string
  /** 回次ラベル（例: 第24回）。「今年で◯回目」は本文で一度だけ言及する */
  editionLabel: string
  /** テーマ（例: 和（わ）） */
  theme: string
  /** 何が行われるか（1文、入力どおり。会場数など未確認の描写を含めない） */
  whatHappens: string
  /** 開催日（入力どおりの表記。テンプレは再整形しない。本文で1回だけ使う） */
  eventDate: string
  /** 開催時間（入力どおり） */
  eventTime: string
  /** 会場・体験の一覧 */
  venues: EventVenue[]
  /** エリアや企画数の前置き（例: 全銀座エリアに対応した3つの企画） */
  areaLead: string
  /** 対象読者の一文（例: 〜に向いています。） */
  audienceNote: string
  /** 有料イベントか */
  paid: boolean
  /** 価格の表示文字列（sale / generic 用。任意。空なら本文で価格に触れない） */
  priceText?: string
  /** 申込期限（入力どおり。本文で1回だけ使う） */
  applyDeadline: string
  /** 当選発表日（入力どおり。本文で1回だけ使う） */
  resultDate: string
  /** 当選発表の方法（例: 当選された方へのご連絡をもって発表に代えられます） */
  resultRule: string
  /** 申込条件（入力どおり、末尾に句点を付けない） */
  applyRule: string
  /** 公式情報の補足（例: 10月1日公開予定の公式サイトで案内、PDFでも確認可） */
  officialInfoNote: string
  /**
   * 販売終了日の記載状況（sale 用・任意。2026-09-07根本改善）。
   * 'ongoing_no_end_stated' のときは saleTemplate.ts が「催し／開催中」等の
   * イベント的な表現を避け、商品販売として自然な言い回しを使う。
   */
  saleAvailability?: string
  /**
   * GINZA WHISKERS の編集後記（人間が事前に1〜2文で記入する想定の seed、任意）。
   * 値があればその文章を「事実を変えずに」そのまま使う。AI で生成しない。
   * 空／未指定なら resolveEditorsNote() が入力情報だけの控えめな定型文を返す。
   */
  editorsNoteSeed?: string
  /** 結び（次の行動への短い橋渡し、1文） */
  closing: string
  /** 次の行動（CTA、入力どおり。申込期限の日付は再掲しない前提で渡す） */
  callToAction: string
}

// ---------------------------------------------------------------------------
// editorsNoteSeed の解決（refine 要件6・7）
// ---------------------------------------------------------------------------
export function resolveEditorsNote(f: EventArticleFields): string {
  const seed = (f.editorsNoteSeed ?? '').trim()
  if (seed) return seed
  // seed が無い場合：入力情報だけから作れる控えめな定型文（事実を足さない）
  return '公式の案内をもとに、日程と申し込みの要点を整理しました。はじめての方も、迷わず進められるはずです。'
}

// ---------------------------------------------------------------------------
// buildAngleArticleBlocks へ渡す input（narrative フィールド）を組み立てる。
// すべて EventArticleFields の値の差し込みのみ。入力にない事実を足さない。
// ---------------------------------------------------------------------------
export interface AngleNarrativeInput {
  hook: string
  angleSummary: string
  content: string
  whyNow: string
  editorsNote: string
  closing: string
  callToAction: string
  audience: string
}

export function buildAngleInputFromEvent(f: EventArticleFields): AngleNarrativeInput {
  const venueList = f.venues.map((v) => `「${v.name}」は${v.place}`).join('、')

  // 導入：季節・イベント名・回次・テーマ・何が行われるか。日付は入れない。
  const hook =
    `${f.season}が深まる頃、銀座で開かれる恒例の催しがあります。` +
    `今年で${f.editionLabel}を迎える「${f.eventName}」、本年のテーマは「${f.theme}」です。` +
    `${f.whatHappens}`

  const angleSummary = `今年の${f.eventName}と、参加のしかた`

  // 開催日はここで1回だけ。
  const p1 = `開催は${f.eventDate}、${f.eventTime}です。抽選対象のお茶席体験は、${f.areaLead}です。`
  const p2 = `${venueList}で開かれます。${f.audienceNote}`
  const paidClause = f.paid ? '3つの企画はいずれも有料で、' : ''
  // 申込案内。「なぜ、いま」は独立見出しにせず「受付はすでに始まっており」で統合。
  // 申込期限・当選発表日はここで1回だけ。
  const p3 =
    `${paidClause}事前申し込み・抽選制です。申し込みの受付はすでに始まっており、期限は${f.applyDeadline}まで。` +
    `当選の発表は${f.resultDate}で、${f.resultRule}。${f.applyRule}。`
  const content = [p1, p2, p3].join('\n\n')

  return {
    hook,
    angleSummary,
    content,
    whyNow: '', // 独立見出しにしない（toReaderFacingBlocks で空として落とす）
    editorsNote: resolveEditorsNote(f),
    closing: f.closing,
    callToAction: f.callToAction,
    audience: '',
  }
}

// ---------------------------------------------------------------------------
// タイトル案（決定的・AI非依存・3案）。先頭が既定タイトル。
//   [0] 基本案：日付を入れない（イベント名＋回次＋テーマ）。45文字以内目標。
//   [1] 開催日を入れる案（申込期限は入れない）
//   [2] 申込期限を入れる案（開催日は入れない）
// ---------------------------------------------------------------------------
export function buildTitleCandidates(f: EventArticleFields): string[] {
  return [
    `銀座の${f.season}の恒例行事「${f.eventName}」${f.editionLabel}、テーマは「${f.theme}」`,
    `「${f.eventName}」${f.editionLabel}、${f.eventDate}開催——テーマは「${f.theme}」`,
    `「${f.eventName}」お茶席体験の抽選申込は${f.applyDeadline}まで`,
  ]
}

// ---------------------------------------------------------------------------
// 展覧会バリアント（2026-09-03、第二投稿 最小修正）。
//
// 回次（editionLabel）・テーマ（theme）・抽選/当選発表（applyDeadline 等）を
// 持たない「通常の展覧会・個展・企画展」向け。銀茶会用の buildAngleInputFromEvent /
// buildTitleCandidates は一切変更せず、editionLabel か theme が空のとき
// renderArticleFromTemplate 側でこちらへ分岐する。
//
//   ・差し込むのは eventName / whatHappens / eventDate / eventTime / venues /
//     areaLead / audienceNote / paid だけ。入力にない事実は足さない。
//   ・「なぜ、いま」「抽選」「当選発表」の文言は使わない。
//   ・officialInfoNote は本文へ出さない（未確認事項の分離先。呼び出し側で制御）。
// ---------------------------------------------------------------------------
export function resolveEditorsNoteExhibition(f: EventArticleFields): string {
  const seed = (f.editorsNoteSeed ?? '').trim()
  if (seed) return seed
  // seed が無い場合：入力情報だけから作れる控えめな定型文（事実を足さない）
  return '公式の案内をもとに、会期と会場の要点を整理しました。予定を大きく空けなくても立ち寄れる展示です。'
}

export function buildAngleInputFromExhibition(f: EventArticleFields): AngleNarrativeInput {
  const venueList = f.venues.map((v) => `「${v.name}」は${v.place}`).join('、')
  const admission = f.paid ? '観覧は有料です。' : '入場は無料です。'

  // 導入：季節・展示名・何が行われるか。回次・テーマ・日付は入れない。
  const hook =
    `${f.season}の銀座で、静かに見て回れる展示があります。` +
    `「${f.eventName}」。${f.whatHappens}`

  const angleSummary = `「${f.eventName}」の見どころと、訪ねかた`

  // 会期・時間・入場料・会場前置きはここで1回だけ。
  const p1 = `会期は${f.eventDate}、${f.eventTime}。${admission}${f.areaLead}。`
  const p2 = venueList ? `${venueList}。${f.audienceNote}` : f.audienceNote
  const content = [p1, p2].join('\n\n')

  return {
    hook,
    angleSummary,
    content,
    whyNow: '', // 独立見出しにしない（toReaderFacingBlocks で空として落とす）
    editorsNote: resolveEditorsNoteExhibition(f),
    closing: f.closing,
    callToAction: f.callToAction,
    audience: '',
  }
}

export function buildTitleCandidatesExhibition(f: EventArticleFields): string[] {
  const audienceShort = f.audienceNote.replace(/。\s*$/, '')
  return [
    `${f.season}の銀座で出会う展示——「${f.eventName}」`,
    `「${f.eventName}」、${f.eventDate}まで`,
    `${audienceShort}——「${f.eventName}」`,
  ]
}

// ---------------------------------------------------------------------------
// generic バリアント（2026-09-03、共通 Article Facts / 記事種別非依存化）。
//
// 専用テンプレートが無い記事種別（sale / その他）向けのフォールバック。
// **confirmed な事実だけ**を差し込む。種別固有の文言（回次・テーマ・抽選・
// 「展示」等）は使わない。会場・料金は入力があるときだけ触れる。
// Human-in-the-loop（reviewStatus:draft）・公開前検査は render 側で維持。
// ---------------------------------------------------------------------------
export function resolveEditorsNoteGeneric(f: EventArticleFields): string {
  const seed = (f.editorsNoteSeed ?? '').trim()
  if (seed) return seed
  return '公式の案内をもとに、要点だけを整理しました。詳しくは公式情報でご確認ください。'
}

export function buildAngleInputFromGeneric(f: EventArticleFields): AngleNarrativeInput {
  const endPunct = (s: string) => s.replace(/[。．.]+$/u, '') + '。'
  const venueList = f.venues.map((v) => `${v.name}は${v.place}`).join('、')
  const priceLine = (f.priceText ?? '').trim()
    ? `価格は${(f.priceText ?? '').trim()}。`
    : f.paid
      ? '有料です。'
      : ''

  const seasonPrefix = f.season.trim() ? `${f.season}の銀座から、ひとつの話題を。` : '銀座から、ひとつの話題を。'
  const hook = `${seasonPrefix}「${f.eventName}」。${f.whatHappens}`
  const angleSummary = `「${f.eventName}」の要点`

  // confirmed / 人間承認済みの項目だけを本文へ。空なら文を作らない。
  const parts: string[] = []
  if (f.eventDate.trim()) parts.push(`期間は${f.eventDate}${f.eventTime.trim() ? `、${f.eventTime}` : ''}。`)
  if (f.areaLead.trim()) parts.push(endPunct(f.areaLead.trim()))
  if (venueList) parts.push(endPunct(venueList))
  if (priceLine) parts.push(priceLine)
  if (f.audienceNote.trim()) parts.push(endPunct(f.audienceNote.trim()))
  const content = parts.join('\n\n') || f.whatHappens

  // editorsNote / closing / callToAction は「人間が ArticleFacts に入力した値」だけ出す。
  // 未入力のテンプレ既定文は generic では出さない（confirmed 事実と人間承認済み editorial 項目のみ）。
  const seed = (f.editorsNoteSeed ?? '').trim()
  const humanClosing = (f.closing ?? '').trim()
  const humanCta = (f.callToAction ?? '').trim()

  return {
    hook,
    angleSummary,
    content,
    whyNow: '',
    editorsNote: seed,
    closing: humanClosing && humanClosing !== TEMPLATE_DEFAULT_CLOSING ? humanClosing : '',
    callToAction: humanCta && humanCta !== TEMPLATE_DEFAULT_CTA ? humanCta : '',
    audience: '',
  }
}

export function buildTitleCandidatesGeneric(f: EventArticleFields): string[] {
  return [
    `${f.season}の銀座の話題——「${f.eventName}」`,
    `「${f.eventName}」、${f.eventDate.trim() || '公式情報でご確認を'}`,
    `${f.audienceNote.replace(/。\s*$/, '') || '銀座の今'}——「${f.eventName}」`,
  ]
}

// ---------------------------------------------------------------------------
// ハッシュタグ行
// ---------------------------------------------------------------------------
export function renderHashtagLine(tags: string[]): string {
  return tags.map((t) => t.trim()).filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// SOURCE 引用（buildAngleArticleBlocks 出力）を末尾用の簡潔な1行へ整形。
//   "SOURCE: <name>／確認: <date>／<url>" -> "情報：<name>（確認日 <date>）／<url>"
// 想定形でなければ "SOURCE: " と "確認: " だけ落として返す（内部語を残さない）。
// ---------------------------------------------------------------------------
function briefSourceLine(raw: string): string {
  let t = raw
  if (t.startsWith(ARTICLE_BLOCK_MARKERS.sourceQuotePrefix)) {
    t = t.slice(ARTICLE_BLOCK_MARKERS.sourceQuotePrefix.length)
  }
  // URL は ASCII "/"、区切りは全角 "／"。全角で分割すれば name／確認: date／url の3片。
  const parts = t.split(ARTICLE_BLOCK_MARKERS.sourcePartSep)
  if (parts.length >= 3) {
    const name = parts[0].trim()
    const datePart = parts[1].replace(VERIFIED_LABEL, '').trim()
    const url = parts.slice(2).join(ARTICLE_BLOCK_MARKERS.sourcePartSep).trim()
    if (name && datePart && url) {
      return `情報：${name}（確認日 ${datePart}）／${url}`
    }
  }
  return `情報：${t.replace(VERIFIED_LABEL, '確認日 ')}`
}

// ---------------------------------------------------------------------------
// buildAngleArticleBlocks の出力（内部マーカー入り）を、読者向けブロック列へ
// 決定的に変換する。
//   - 冒頭 【角度ラベル】 段落を落とす
//   - 空段落を落とす
//   - `WHY NOW？ X` -> X が空なら丸ごと落とす（独立見出しにしない）。
//                     万一 X が非空なら見出しを付けずに素の段落として出す。
//   - `EDITOR'S NOTE X` -> 見出し「GINZA WHISKERS の視点」 + 段落 X（X が空なら節ごと省略）
//   - `SOURCE: ...` 引用 -> インラインには出さず、末尾に簡潔な1行として再配置
//   - `→ 次に：X` -> 見出し「次の一歩」 + 段落 X
//   - それ以外はそのまま
//   - 末尾に officialInfoNoteAtEnd（あれば）→ SOURCE 由来の簡潔な情報行 の順で追加
// ---------------------------------------------------------------------------
export interface ToReaderFacingOptions {
  /** 本文末尾（情報行の直前）に置く公式情報の補足（任意） */
  officialInfoNoteAtEnd?: string
}

export function toReaderFacingBlocks(
  rawBlocks: TextBlock[],
  options: ToReaderFacingOptions = {},
): TextBlock[] {
  const out: TextBlock[] = []
  let sourceLine: string | null = null

  for (const block of rawBlocks) {
    const text = block.text ?? ''

    if (block.type === 'paragraph' && ANGLE_LABEL_RE.test(text.trim())) {
      continue
    }

    if (block.type === 'paragraph' && text.startsWith(ARTICLE_BLOCK_MARKERS.whyNowPrefix)) {
      const rest = text.slice(ARTICLE_BLOCK_MARKERS.whyNowPrefix.length).trim()
      if (rest) out.push({ type: 'paragraph', text: rest }) // 見出しは付けない
      continue
    }

    if (!text.trim()) {
      continue
    }

    if (block.type === 'paragraph' && text.startsWith(ARTICLE_BLOCK_MARKERS.editorsNotePrefix)) {
      const rest = text.slice(ARTICLE_BLOCK_MARKERS.editorsNotePrefix.length).trim()
      if (rest) {
        out.push({ type: 'heading', level: 2, text: READER_HEADINGS.editorsView })
        out.push({ type: 'paragraph', text: rest })
      }
      continue
    }

    if (block.type === 'quote' && text.startsWith(ARTICLE_BLOCK_MARKERS.sourceQuotePrefix)) {
      sourceLine = briefSourceLine(text)
      continue
    }

    if (block.type === 'paragraph' && text.startsWith(ARTICLE_BLOCK_MARKERS.nextActionPrefix)) {
      const rest = text.slice(ARTICLE_BLOCK_MARKERS.nextActionPrefix.length).trim()
      // callToAction が空なら「次の一歩」見出しごと出さない（generic で既定文を抑止したケース）
      if (rest) {
        out.push({ type: 'heading', level: 2, text: READER_HEADINGS.nextStep })
        out.push({ type: 'paragraph', text: rest })
      }
      continue
    }

    // 空段落（closing 等が空のケース）は落とす
    if (block.type === 'paragraph' && !text.trim()) continue

    out.push(block)
  }

  if (options.officialInfoNoteAtEnd && options.officialInfoNoteAtEnd.trim()) {
    out.push({ type: 'paragraph', text: options.officialInfoNoteAtEnd })
  }
  if (sourceLine) {
    out.push({ type: 'paragraph', text: sourceLine })
  }

  return out
}
