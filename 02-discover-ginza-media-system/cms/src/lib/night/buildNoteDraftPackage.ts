import type { Payload } from 'payload'

import type {
  NightValidationFinding,
  NoteDraftHashtags,
  NoteDraftImageSlot,
  NoteDraftPackage,
  NightArticleStatus,
  NoteMasthead,
  NoteMeta,
} from './types'
import {
  NOTE_MASTHEAD_TEXT,
  composeNoteBodyWithMasthead,
  resolveCategoryIcon,
} from '../note/noteMasthead'
import {
  DEFAULT_ILLUSTRATION_CAPTION,
  bodySourceUrls,
  checkAiPromptConstraints,
  checkPaidContent,
  checkPaywallAnchor,
  checkWording,
  confirmedSourceUrls,
  extractHashtags,
  extractIllustrationCaption,
  paywallLine,
  sanitizeNoteBodyUnits,
  type BodyBlock,
} from './noteTransferChecks'

// 1 件の Article を「note へそのまま転記できる /note-draft パッケージ」へ変換する
//（読み取り専用・AI 呼び出しなし）。
//
// 画像は body に [IMAGE: ...] マーカーを挿入せず、配置情報を images[]
// （marker / role / placement）にのみ持たせる。
//
// 【2026-09-10 共通不具合の根本修正】
//  1. ハッシュタグ重複：body にハッシュタグ行を入れない。4個は hashtags.note のみ。
//  2. 挿絵注釈：category_icon / hero の caption は記事本文の正式な挿絵注釈。
//  3. 出典 URL：links.sourceUrls は公開本文の「出典」欄に載っている URL と一致。
//
// 【2026-09-10 100円 note 公開トライアル（Article #60）の恒久反映】
//  1. note-body には note 本文へ貼る文章だけを出力（sanitizeNoteBodyUnits）。
//  2. note-draft.json に noteMeta（title/価格/有料ライン/ハッシュタグ/hero/出典/公開後値）を分離。
//  3. 有料ライン：paywallAnchorHeading の見出しが本文にちょうど1件あることを検証（0/複数は BLOCKER）。
//  4〜6. 表記統一・有料記事の内容検査・AI 指示文の制約チェックを WARNING で自動検出。
//
// **公開・approve・スキーマ変更・DB 書き込みは一切しない。**

// 後方互換：以前 buildNoteDraftPackage から import していたヘルパーは再エクスポートする。
export {
  DEFAULT_ILLUSTRATION_CAPTION,
  HERO_IMAGE_CAPTION,
  bodySourceUrls,
  confirmedSourceUrls,
  extractHashtags,
  extractIllustrationCaption,
  isHashtagHeading,
  isHashtagOnlyText,
} from './noteTransferChecks'

const INTERNAL_ANGLE_LABEL_RE = /^【[^】]+】$/

function nodeText(n: unknown): string {
  if (!n || typeof n !== 'object') return ''
  const node = n as { text?: unknown; children?: unknown }
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

export interface BuildNoteDraftPackageOptions {
  /** 見出しごとに images[] へ section 画像スロットを記録する（既定 true）。 */
  sectionImageMarkers?: boolean
  /**
   * draft 以外（approved / published）でもパッケージ化する（読み取り専用）。
   * 既定 false＝draft のみ（従来どおり。夜間フローの安全ガード）。
   * 転記前チェック（./p2 night check）だけ true で呼ぶ。
   */
  allowNonDraft?: boolean
}

export async function buildNoteDraftPackage(
  payload: Payload,
  articleId: number,
  options: BuildNoteDraftPackageOptions = {},
): Promise<NoteDraftPackage> {
  const sectionImageMarkers = options.sectionImageMarkers ?? true
  const allowNonDraft = options.allowNonDraft ?? false

  const article = (await payload.findByID({
    collection: 'articles',
    id: articleId,
    locale: 'ja',
    depth: 1,
    overrideAccess: true,
  })) as Record<string, any>

  if (!article) {
    throw new Error(`articles id=${articleId} が見つかりません`)
  }
  if (!allowNonDraft && article.reviewStatus !== 'draft') {
    throw new Error(
      `articles id=${articleId} は reviewStatus="${article.reviewStatus}"（draft のみパッケージ化します）`,
    )
  }

  // --- note 冒頭マストヘッド：カテゴリーアイコン → 固定文 → 本文 ---
  const venueFacts = (Array.isArray(article.editorialProvenance) ? article.editorialProvenance : [])
    .filter((p: any) => (p?.factType ?? '') === 'venue')
    .map((p: any) => String(p?.fact ?? ''))
    .join(' ')
  const pillarJa =
    Array.isArray(article.pillars) && article.pillars[0] && typeof article.pillars[0] === 'object'
      ? String((article.pillars[0] as { name?: string }).name ?? '')
      : null
  const iconResolved = resolveCategoryIcon({
    title: String(article.title ?? ''),
    venue: venueFacts,
    pillarJa,
  })
  const masthead: NoteMasthead = {
    categoryIcon: {
      resolveStatus: iconResolved.status,
      category: iconResolved.category,
      labelJa: iconResolved.labelJa,
      iconSlug: iconResolved.iconSlug,
      iconFile: iconResolved.iconFile,
      basis: iconResolved.basis,
      reason: iconResolved.reason,
    },
    fixedText: NOTE_MASTHEAD_TEXT,
    order: ['1. カテゴリーアイコン（1点）', '2. 固定文（GINZA TIME EDIT …）', '3. 本文'],
  }

  // --- 本文 Lexical → ブロック列 → sanitize（項目1） ---
  const kids: any[] = article.body?.root?.children ?? []
  const rawBlocks: BodyBlock[] = []
  let firstBlock = true
  for (const c of kids) {
    const tag = String(c.tag ?? c.type ?? '')
    const t = nodeText(c).trim()
    if (!t) continue
    // 先頭の内部角度ラベル（【CORE（核記事）】等）は落とす
    if (firstBlock && INTERNAL_ANGLE_LABEL_RE.test(t)) {
      firstBlock = false
      continue
    }
    firstBlock = false
    rawBlocks.push({ tag, text: t })
  }

  const rawUnits = rawBlocks.map((b) => b.text)
  const { kept, removed } = sanitizeNoteBodyUnits(rawBlocks, {
    articleTitle: String(article.title ?? ''),
  })
  const units = kept.map((b) => b.text)
  const bodyHeadings = kept.filter((b) => b.tag === 'h2' || b.tag === 'h3').map((b) => b.text)

  // section 画像スロット（sanitize 後の見出しに対して）
  const images: NoteDraftImageSlot[] = []

  // ハッシュタグ（socialCopy 優先・無ければ本文のハッシュタグ行）
  const bodyHashtags = extractHashtags(
    rawUnits.filter((u) => /^\s*#[^\s#、。，．,.]/.test(u)).join(' '),
  )
  const sc = article.socialCopy ?? {}
  const noteHashtags = extractHashtags(sc.note)
  const finalNoteHashtags = noteHashtags.length > 0 ? noteHashtags : bodyHashtags

  // 挿絵注釈（記事固有 → 無ければ既定。汎用文へは巻き戻さない）
  const illustrationCaption = extractIllustrationCaption(rawUnits) ?? DEFAULT_ILLUSTRATION_CAPTION

  // images[0]：マストヘッド先頭のカテゴリーアイコン（必須・1点）
  images.push({
    marker: `[IMAGE: カテゴリーアイコン ${iconResolved.iconSlug ?? '（未確定）'}]`,
    role: 'category_icon',
    placement: '記事冒頭（マストヘッドの先頭・固定文の直前）',
    note:
      iconResolved.status === 'resolved'
        ? `18カテゴリーアイコンから 1 点：${iconResolved.labelJa}（${iconResolved.iconSlug} / ` +
          `media/discover-ginza-category-icons/${iconResolved.iconFile}）。${iconResolved.reason}`
        : `カテゴリー未確定：${iconResolved.reason}`,
    status: 'not_prepared',
    caption: illustrationCaption,
  })
  images.push({
    marker: '[IMAGE: アイキャッチ]',
    role: 'hero',
    placement: '記事冒頭',
    note:
      'Editorial Trust Layer 準拠：外部サイト画像・OGP画像・イベント公式画像は転載しない。' +
      '独自撮影／独自アイキャッチ／権利上問題のない独自生成画像のいずれかを配置する。',
    status: 'not_prepared',
    caption: illustrationCaption,
  })
  if (sectionImageMarkers) {
    for (const h of bodyHeadings) {
      const label = h.length > 20 ? `${h.slice(0, 20)}…` : h
      images.push({
        marker: `[IMAGE: 見出し「${label}」]`,
        role: 'section',
        placement: `見出し「${h}」の直前`,
        note: '任意。文字の壁を避けるための区切り画像。不要なら削除してよい。',
        status: 'not_prepared',
      })
    }
  }

  const hashtags: NoteDraftHashtags = {
    note: finalNoteHashtags,
    x: extractHashtags(sc.x),
    instagram: extractHashtags(sc.instagram),
  }

  // マストヘッド固定文を冒頭に付与（二重付与しない）。本文にハッシュタグ行は入れない。
  const bodyText = composeNoteBodyWithMasthead(units)

  // --- editorialProvenance の集計 ---
  const prov: any[] = Array.isArray(article.editorialProvenance) ? article.editorialProvenance : []
  const bodyUrls = bodySourceUrls(bodyText)
  const sourceUrls: string[] = bodyUrls.length > 0 ? bodyUrls : confirmedSourceUrls(prov)
  let confirmed = 0
  let unconfirmed = 0
  let conflicting = 0
  const facts = prov.map((p) => {
    const url = String(p.sourceUrl ?? '').trim()
    const vs = p.verificationStatus ?? null
    if (vs === 'confirmed') confirmed++
    else if (vs === 'conflicting') conflicting++
    else unconfirmed++
    return {
      fact: String(p.fact ?? ''),
      factType: p.factType ?? null,
      sourceName: String(p.sourceName ?? ''),
      sourceUrl: url,
      verificationStatus: vs,
    }
  })

  // --- fact/source 検証（読み取り専用） ---
  const blockers: NightValidationFinding[] = []
  const warnings: NightValidationFinding[] = []

  if (iconResolved.status === 'needs_human') {
    blockers.push({
      level: 'blocker',
      code: 'categoryIconUnresolved',
      message: `マストヘッドの 18 カテゴリーアイコンを確定できません（${iconResolved.reason}）。マロンがアイコンを 1 点指定してください。`,
    })
  }
  if (prov.length === 0) {
    blockers.push({ level: 'blocker', code: 'noProvenance', message: 'editorialProvenance が空（重要 Fact の出典が追跡できない）' })
  }
  const missingUrl = prov.filter((p) => !String(p.sourceUrl ?? '').trim())
  if (missingUrl.length > 0) {
    blockers.push({
      level: 'blocker',
      code: 'provenanceMissingUrl',
      message: `sourceUrl が無い Fact が ${missingUrl.length} 件（Editorial Trust Layer: 出典URLが追跡できない重要事実は BLOCKER）`,
    })
  }
  if (conflicting > 0) {
    blockers.push({
      level: 'blocker',
      code: 'conflictingFacts',
      message: `verificationStatus=conflicting の Fact が ${conflicting} 件（一次・公式情報間の矛盾）`,
    })
  }
  if (prov.length > 0 && confirmed === 0) {
    warnings.push({ level: 'warning', code: 'noConfirmedFact', message: 'confirmed な Fact が 0 件（会期・会場等が未確認の可能性）' })
  }
  if (!article.callToAction || !String(article.callToAction).trim()) {
    warnings.push({ level: 'warning', code: 'missingCallToAction', message: 'callToAction が未設定（記事末尾の単一 CTA）' })
  }
  for (const ch of ['note', 'x', 'instagram'] as const) {
    if (!sc[ch] || !String(sc[ch]).trim()) {
      warnings.push({ level: 'warning', code: `missingSocialCopy_${ch}`, message: `socialCopy.${ch} が空` })
    }
  }
  const aiWarn = String(article.aiGeneratedBy ?? '').match(/\|warnings=([^)]*)/)
  if (aiWarn && aiWarn[1]) {
    for (const w of aiWarn[1].split(',').filter(Boolean)) {
      warnings.push({ level: 'warning', code: `genGate_${w}`, message: `生成時 post-gate WARNING: ${w}` })
    }
  }
  const bodyLen = [...bodyText].length
  if (bodyLen < 400) {
    warnings.push({ level: 'warning', code: 'thinBody', message: `本文が ${bodyLen} 字と短い（内容の薄さを要確認）` })
  }

  // --- 2026-09-10 恒久改善 3〜6 ---
  const isPaid = String(article.lane ?? 'free') === 'paid_100'
  const anchor: string | null = article.paywallAnchorHeading
    ? String(article.paywallAnchorHeading)
    : null
  blockers.push(...checkPaywallAnchor(bodyHeadings, anchor, isPaid))
  warnings.push(...checkWording({ title: String(article.title ?? ''), hashtags: hashtags.note, body: bodyText }))
  warnings.push(...checkPaidContent({ body: bodyText, provenance: prov, sourceUrls }))
  warnings.push(...checkAiPromptConstraints(bodyText, isPaid))

  const status: NightArticleStatus =
    blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ok'

  // --- pillar ---
  const pillars = Array.isArray(article.pillars) ? article.pillars : []
  const pillar =
    pillars.length > 0 && typeof pillars[0] === 'object' && pillars[0]
      ? String((pillars[0] as { name?: string }).name ?? '')
      : null

  // --- discoveredContentId（provenance から逆引き） ---
  let discoveredContentId: number | null = null
  for (const p of prov) {
    const ref = p.discoveredContentSource
    const id = typeof ref === 'object' && ref !== null ? ref.id : ref
    if (typeof id === 'number') {
      discoveredContentId = id
      break
    }
  }

  // --- hero / OG / 公開後の値 ---
  const imgArr: any[] = Array.isArray(article.images) ? article.images : []
  const heroImg = imgArr.find((i) => i && i.role === 'hero')
  const assetId = (v: unknown): number | null =>
    typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as any).id === 'number' ? (v as any).id : null
  const heroAsset = heroImg ? assetId(heroImg.asset) : null
  const ogImage = assetId(article.seo?.ogImage) ?? null

  const history: any[] = Array.isArray(article.publishHistory) ? article.publishHistory : []
  const noteHist = history.find((h) => h && h.channel === 'note')
  const publicNoteUrl = noteHist ? String(noteHist.reference ?? '') || null : null
  const publishedAt = noteHist && noteHist.publishedAt ? String(noteHist.publishedAt) : null
  const rs = String(article.reviewStatus ?? '')
  const transferStatus = publicNoteUrl
    ? 'published'
    : rs === 'approved'
      ? 'ready_for_transfer'
      : rs || 'draft'

  const noteMeta: NoteMeta = {
    title: String(article.title ?? ''),
    articleType: isPaid ? 'paid' : 'free',
    priceYen: isPaid ? (typeof article.priceYen === 'number' ? article.priceYen : null) : null,
    paywallAnchorHeading: anchor,
    paywallLine: paywallLine(anchor, isPaid),
    hashtags: hashtags.note,
    heroAsset,
    ogImage,
    categoryIcon: {
      slug: iconResolved.iconSlug,
      file: iconResolved.iconFile,
      labelJa: iconResolved.labelJa,
    },
    illustrationCaption,
    sourceUrls,
    publicNoteUrl,
    publishedAt,
    transferStatus,
  }

  return {
    schemaVersion: 1,
    articleId,
    discoveredContentId,
    title: String(article.title ?? ''),
    slug: String(article.slug ?? ''),
    pillar,
    masthead,
    titleCandidates: [String(article.title ?? '')],
    needsMoreTitleCandidates: true,
    noteMeta,
    body: bodyText,
    images,
    hashtags,
    links: { sourceUrls, canonical: null, youtube: [] },
    socialCopy: {
      note: String(sc.note ?? ''),
      x: String(sc.x ?? ''),
      instagram: String(sc.instagram ?? ''),
    },
    callToAction: article.callToAction ? String(article.callToAction) : null,
    provenance: { confirmed, unconfirmed, conflicting, facts },
    chromeHandoff: {
      target: 'note.com',
      executed: false,
      guardrails: [
        '下書き保存のみ。公開（「公開する」ボタン）は絶対に押さない',
        '既存記事の削除・編集をしない',
        '有料/無料設定・販売設定・価格を変更しない（有料ライン・価格はマロンが手動）',
        'アカウント設定・プロフィールを変更しない',
        '不明な項目は空のままにし Same-day Review へ回す（推測で入力しない）',
      ],
      steps: [
        'note.com にログイン済みの状態で、マロンが手動で開いた下書きを使う（/notes/new へ自動遷移しない）',
        'noteMeta.title をタイトルに入力する',
        'body を貼り付ける（先頭にマストヘッド固定文が入っている。一字一句変更しない）',
        `マストヘッド固定文の直前に noteMeta.categoryIcon（media/discover-ginza-category-icons/${
          masthead.categoryIcon.iconFile ?? '（マロンが指定）'
        }）を 1 点、その次に hero 画像を配置する`,
        'images[] の各スロットに caption があれば画像直下に併記する（独自撮影等で不要なら削除してよい）',
        `${noteMeta.paywallLine}（本文には仮表示を入れない。note の有料ラインはマロンが手動設定）`,
        'noteMeta.hashtags（4個）を note のタグ欄へ設定する（本文には書かない）',
        'noteMeta.sourceUrls を本文末尾の「出典」欄に反映する',
        '「下書き保存」する（公開しない）',
      ],
    },
    validation: { blockers, warnings },
    cleanup: { removed },
    status,
    generatedAt: new Date().toISOString(),
  }
}
