import type { Payload } from 'payload'

import type {
  NightValidationFinding,
  NoteDraftHashtags,
  NoteDraftImageSlot,
  NoteDraftPackage,
  NightArticleStatus,
  NoteMasthead,
} from './types'
import {
  NOTE_MASTHEAD_TEXT,
  composeNoteBodyWithMasthead,
  resolveCategoryIcon,
} from '../note/noteMasthead'

// 1 件の Article(reviewStatus: draft) を「note へそのまま転記できる /note-draft
// パッケージ」へ変換する（読み取り専用・AI 呼び出しなし）。
//
// tnsBuildNoteReady36.ts のマーカー規約を通常記事向けに一般化したもの。
// ただし画像は body に [IMAGE: ...] マーカーを挿入せず、配置情報を images[]
// （marker / role / placement）にのみ持たせる。
//
// 【2026-09-10 共通不具合の根本修正】
//  1. ハッシュタグ重複：body 本文にはハッシュタグ行を入れない。4個は hashtags.note
//     （note-draft.json）だけに保持し、本文の既存ハッシュタグ行・見出しは除去する。
//  2. 挿絵注釈：category_icon / hero の caption は「記事本文の正式な挿絵注釈」を使う。
//     記事固有の注釈があればそれを優先。無ければ DEFAULT_ILLUSTRATION_CAPTION。
//     旧・汎用 caption（HERO_IMAGE_CAPTION）へは巻き戻さない。
//  3. 出典 URL：links.sourceUrls と読者向けには confirmed の公式出典だけを入れる。
//     unconfirmed / 除外・削除理由の記録は editorialProvenance（CMS 内部）にのみ保持。
//
// **公開・approve・スキーマ変更・DB 書き込みは一切しない。**

const INTERNAL_ANGLE_LABEL_RE = /^【[^】]+】$/
const HASHTAG_RE = /#[^\s#、。，．,.]+/g
// テキスト全体がハッシュタグ（＋空白）だけで構成される行
const HASHTAG_ONLY_RE = /^\s*#[^\s#、。，．,.]+(?:\s+#[^\s#、。，．,.]+)*\s*$/

// Editorial Trust Layer（独自生成画像の読者向け注釈）。
// 旧・汎用文（商品・店舗）。後方互換のため残すが、caption には使わない。
export const HERO_IMAGE_CAPTION =
  '※画像は記事内容をもとに生成したイメージです。実際の商品・店舗とは異なる場合があります。'

// 記事本文に挿絵注釈が無い場合の既定（2026-09-10。汎用文へ巻き戻さない）。
export const DEFAULT_ILLUSTRATION_CAPTION =
  '※画像は記事内容をもとに生成したイメージです。実際の展示作品・会場とは異なります。'

/** テキストがハッシュタグだけの行か（本文から除去する対象） */
export function isHashtagOnlyText(t: string | null | undefined): boolean {
  const s = (t ?? '').trim()
  return s.length > 1 && HASHTAG_ONLY_RE.test(s)
}

/** 「ハッシュタグ」だけの見出しか（本文から除去する対象） */
export function isHashtagHeading(tag: string, t: string | null | undefined): boolean {
  return (tag === 'h2' || tag === 'h3') && (t ?? '').trim() === 'ハッシュタグ'
}

/**
 * 記事本文（見出し・段落テキストの配列）から「挿絵注釈」を取り出す。
 * ・「挿絵注釈」見出しの直後の段落、または
 * ・「※画像は記事内容をもとに生成したイメージ…」で始まる行
 * を記事固有 caption として優先。無ければ null。
 */
export function extractIllustrationCaption(units: string[]): string | null {
  for (let i = 0; i < units.length; i++) {
    const u = (units[i] ?? '').trim()
    if (u === '挿絵注釈' || u === '挿絵注釈について') {
      const next = (units[i + 1] ?? '').trim()
      if (next) return next
    }
    if (/^※\s*画像は記事内容をもとに生成した/.test(u)) return u
  }
  return null
}

/** editorialProvenance から confirmed の出典 URL だけを重複排除して返す */
export function confirmedSourceUrls(
  prov: { sourceUrl?: string | null; verificationStatus?: string | null }[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of prov) {
    const url = String(p?.sourceUrl ?? '').trim()
    if (!url) continue
    if ((p?.verificationStatus ?? '') !== 'confirmed') continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

function nodeText(n: unknown): string {
  if (!n || typeof n !== 'object') return ''
  const node = n as { text?: unknown; children?: unknown }
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[0].trim()
    if (tag.length > 1 && !seen.has(tag)) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

export interface BuildNoteDraftPackageOptions {
  /**
   * 見出し（h2/h3）ごとに images[] へ section 画像スロットを記録する（既定 true）。
   * 本文テキスト（body）には画像マーカーを一切挿入しない。画像の配置情報は
   * すべて images[]（marker / role / placement）に持たせ、note 転記時は images[]
   * を見て配置する。
   */
  sectionImageMarkers?: boolean
}

export async function buildNoteDraftPackage(
  payload: Payload,
  articleId: number,
  options: BuildNoteDraftPackageOptions = {},
): Promise<NoteDraftPackage> {
  const sectionImageMarkers = options.sectionImageMarkers ?? true

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
  // 安全ガード：draft 以外は Night Layer の対象にしない
  //（承認済み・公開済みへ後戻りで手を入れない）。
  if (article.reviewStatus !== 'draft') {
    throw new Error(
      `articles id=${articleId} は reviewStatus="${article.reviewStatus}"（draft のみパッケージ化します）`,
    )
  }

  // --- note 冒頭マストヘッド（2026-09-10 恒久ルール）：カテゴリーアイコン → 固定文 → 本文 ---
  // カテゴリーアイコンは記事分類から決定的に解決する。確定できないときは BLOCKER で停止し、
  // マロンが指定する（推測で埋めない）。
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

  // --- 本文 Lexical → プレーンテキスト ---
  // 画像マーカーは body に入れない。配置情報は images[] にのみ持たせる。
  const kids: any[] = article.body?.root?.children ?? []
  const units: string[] = []
  const images: NoteDraftImageSlot[] = []

  // 事前スキャン：挿絵注釈（記事固有 caption）と本文中のハッシュタグを先に拾う。
  const rawUnits = kids.map((c) => nodeText(c).trim()).filter(Boolean)
  const bodyHashtags = extractHashtags(rawUnits.filter(isHashtagOnlyText).join(' '))
  // 修正1：4個は socialCopy 由来を優先し、無ければ本文のハッシュタグ行から拾う。
  const noteHashtags = extractHashtags((article.socialCopy ?? {}).note)
  const finalNoteHashtags = noteHashtags.length > 0 ? noteHashtags : bodyHashtags
  // 修正2：category_icon / hero の caption は記事本文の正式な挿絵注釈を使う。
  //        記事固有があればそれを優先、無ければ DEFAULT_ILLUSTRATION_CAPTION（汎用文へ巻き戻さない）。
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

  const heroMarker = '[IMAGE: アイキャッチ]'
  images.push({
    marker: heroMarker,
    role: 'hero',
    placement: '記事冒頭',
    note:
      'Editorial Trust Layer 準拠：外部サイト画像・OGP画像・イベント公式画像は転載しない。' +
      '独自撮影／独自アイキャッチ／権利上問題のない独自生成画像のいずれかを配置する。',
    status: 'not_prepared',
    // 独自生成画像を使う場合、note 転記時に画像直下へこの注釈を併記する
    // （記事本文の正式な挿絵注釈と同一。独自撮影等で不要なら削除してよい）。
    caption: illustrationCaption,
  })

  let firstBlock = true
  for (const c of kids) {
    const tag = c.tag ?? c.type
    const t = nodeText(c).trim()
    if (!t) continue

    // 内部の角度ラベル（【CORE（核記事）】等）は読者向けに出さない
    if (firstBlock && INTERNAL_ANGLE_LABEL_RE.test(t)) {
      firstBlock = false
      continue
    }
    firstBlock = false

    // 修正1：ハッシュタグ行・「ハッシュタグ」見出しは body に入れない（note のタグ欄へ）
    if (isHashtagOnlyText(t) || isHashtagHeading(tag, t)) continue

    if (sectionImageMarkers && (tag === 'h2' || tag === 'h3')) {
      const label = t.length > 20 ? `${t.slice(0, 20)}…` : t
      const marker = `[IMAGE: 見出し「${label}」]`
      images.push({
        marker,
        role: 'section',
        placement: `見出し「${t}」の直前`,
        note: '任意。文字の壁を避けるための区切り画像。不要なら削除してよい。',
        status: 'not_prepared',
      })
    }

    units.push(t)
  }

  // --- ハッシュタグ（socialCopy 優先・無ければ本文のハッシュタグ行から。修正1） ---
  const sc = article.socialCopy ?? {}
  const hashtags: NoteDraftHashtags = {
    note: finalNoteHashtags,
    x: extractHashtags(sc.x),
    instagram: extractHashtags(sc.instagram),
  }

  // --- 冒頭にマストヘッド固定文を付与（note 転記用）。修正1：本文にハッシュタグ行は入れない ---
  // マストヘッド固定文は body 先頭へ（既に含まれていれば二重付与しない）。
  // カテゴリーアイコンは images[0] の配置指示に従い、この固定文の直前に置く。
  // ハッシュタグ4個は hashtags.note にのみ保持し、転記時に note のタグ欄へ設定する。
  const bodyText = composeNoteBodyWithMasthead(units)

  // --- editorialProvenance の集計 ---
  const prov: any[] = Array.isArray(article.editorialProvenance) ? article.editorialProvenance : []
  // 修正3：読者向け／links.sourceUrls は confirmed の公式出典だけ。unconfirmed・除外記録は
  //        editorialProvenance（CMS 内部）にのみ残し、パッケージの出典一覧には出さない。
  const sourceUrls: string[] = confirmedSourceUrls(prov)
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

  // マストヘッドのカテゴリーアイコンが確定できないときだけ、人間確認のため停止する。
  if (iconResolved.status === 'needs_human') {
    blockers.push({
      level: 'blocker',
      code: 'categoryIconUnresolved',
      message: `マストヘッドの 18 カテゴリーアイコンを確定できません（${iconResolved.reason}）。マロンがアイコンを 1 点指定してください。`,
    })
  }

  if (prov.length === 0) {
    blockers.push({
      level: 'blocker',
      code: 'noProvenance',
      message: 'editorialProvenance が空（重要 Fact の出典が追跡できない）',
    })
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
    warnings.push({
      level: 'warning',
      code: 'noConfirmedFact',
      message: 'confirmed な Fact が 0 件（会期・会場等が未確認の可能性）',
    })
  }
  if (!article.callToAction || !String(article.callToAction).trim()) {
    warnings.push({
      level: 'warning',
      code: 'missingCallToAction',
      message: 'callToAction が未設定（記事末尾の単一 CTA）',
    })
  }
  for (const ch of ['note', 'x', 'instagram'] as const) {
    if (!sc[ch] || !String(sc[ch]).trim()) {
      warnings.push({
        level: 'warning',
        code: `missingSocialCopy_${ch}`,
        message: `socialCopy.${ch} が空`,
      })
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
    warnings.push({
      level: 'warning',
      code: 'thinBody',
      message: `本文が ${bodyLen} 字と短い（内容の薄さを要確認）`,
    })
  }

  const status: NightArticleStatus = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ok'

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
        '有料/無料設定・販売設定を変更しない',
        'アカウント設定・プロフィールを変更しない',
        '不明な項目は空のままにし Same-day Review へ回す（推測で入力しない）',
      ],
      steps: [
        'note.com にログイン済みの状態で「新規投稿 → テキスト」を開く',
        'title を本文タイトルに入力する',
        'body を貼り付ける（body の先頭にマストヘッド固定文が入っている。一字一句変更しない）',
        `記事冒頭・マストヘッド固定文の直前に、masthead.categoryIcon のカテゴリーアイコンを 1 点配置する（media/discover-ginza-category-icons/${
          masthead.categoryIcon.iconFile ?? '（マロンが指定）'
        }）`,
        'images[] の placement に従って画像を配置する（画像は別途 Same-day Review で用意。body には画像マーカーを入れない。未用意なら画像なしで下書き保存する）',
        'images[] の各スロットに caption があれば、その画像の直下に注釈として併記する（独自生成画像であることの読者向け明示。独自撮影・独自アイキャッチ等で不要なら削除してよい）',
        'links.sourceUrls を本文末尾の「Source」欄に反映する',
        'hashtags.note をハッシュタグ欄に設定する',
        '「下書き保存」する（公開しない）',
      ],
    },
    validation: { blockers, warnings },
    status,
    generatedAt: new Date().toISOString(),
  }
}
