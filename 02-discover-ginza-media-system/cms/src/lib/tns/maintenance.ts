import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import type { Payload } from 'payload'

import { WEEKDAYS } from './types'

// 🌈TNS 週次エディションの「自動診断・修復・検証」共通ロジック（2026-08-30）。
//
// 設計方針：
//   - 過去状態を固定値（OLD_* 定数）で前提にしない。**常に現在DBを正**として
//     読み、あるべき不変条件（invariant）との差分だけを安全に更新する。
//   - reviewStatus=draft を安全条件として扱う。draft 以外は BLOCKER。
//   - 修復は「編集判断を伴わない機械的な整形」だけを行う（本文の内部コード
//     露出除去・ハッシュタグ行・translationStatus.ja・visualStatus の実態反映）。
//     選曲差し替え・見出しムードの創作・本文プローズの書き換えは行わない
//     （それらは人間の編集判断＝doctor は WARN で報告するだけ）。
//
// この共通モジュールは新規4スクリプト（tnsDoctor / tnsRepair / tnsVerify /
// tnsPrepare）から使う。既存の一回限りスクリプト（tnsEditArticle50.ts 等）は
// 変更しない。

// ───────────────────────── 既定ターゲット ─────────────────────────
export const DEFAULTS = {
  editionId: 11,
  articleId: 50,
  editionNumber: 36,
} as const

export const HASHTAG_LINE = '#TokyoNostalgicSoundtrack #銀座 #昭和歌謡 #シティポップ #AOR #GINZAWHISKERS'
export const BACKUP_DIR = path.resolve(process.cwd(), '..', '_backups')

// ───────────────────────── 型 ─────────────────────────
export type Severity = 'ok' | 'info' | 'warn' | 'blocker'

export interface Finding {
  code: string
  severity: Severity
  message: string
}

export interface TnsTargets {
  editionId: number
  articleId: number
  editionNumber: number
  skipNumberCheck: boolean
}

export interface Snapshot {
  targets: TnsTargets
  /** depth:1 / locale:'ja' の soundtrack-editions（現在DBそのまま） */
  edition: Record<string, any> | null
  /** depth:0 / locale:'ja' の articles（現在DBそのまま） */
  article: Record<string, any> | null
  /** reuseAllowed=false かつ このエディション以外の music-usage-ledger の trackId */
  ledgerNoReuseTrackIds: number[]
}

export interface RepairPlan {
  /** 適用予定の安全な変更（機械的整形のみ） */
  actions: { code: string; description: string }[]
  /** 自動修復できず人間の判断が必要（＝「危険な変更」） */
  skipped: { code: string; reason: string }[]
  nextBody: Record<string, any> | null
  nextTranslationJa: 'complete' | null
  nextVisualStatus: 'attached' | 'pending_selection' | null
}

// ───────────────────────── 引数パーサ ─────────────────────────
export function parseArgs(argv: string[]) {
  const flags = new Set<string>()
  const opts: Record<string, string> = {}
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) opts[m[1]] = m[2]
    else if (a.startsWith('--')) flags.add(a.slice(2))
  }
  return {
    flags,
    opts,
    has: (f: string) => flags.has(f),
    num: (k: string, d: number) => (opts[k] != null && opts[k] !== '' ? Number(opts[k]) : d),
  }
}

export function resolveTargets(a: ReturnType<typeof parseArgs>): TnsTargets {
  return {
    editionId: a.num('edition', DEFAULTS.editionId),
    articleId: a.num('article', DEFAULTS.articleId),
    editionNumber: a.num('edition-number', DEFAULTS.editionNumber),
    skipNumberCheck: a.has('skip-number-check'),
  }
}

// ───────────────────────── ユーティリティ ─────────────────────────
export function refId(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'object') return Number((v as { id?: unknown }).id)
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function nodeText(node: any): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

export interface BodyBlock {
  index: number
  tag: string
  text: string
  leafCount: number
}

export function bodyBlocks(article: Record<string, any> | null): BodyBlock[] {
  const kids: any[] = article?.body?.root?.children ?? []
  return kids.map((c, index) => ({
    index,
    tag: c.tag ?? c.type ?? '',
    text: nodeText(c),
    leafCount: Array.isArray(c.children) ? c.children.length : 0,
  }))
}

export const INTERNAL_CODE_RE = /TNS Editorial Code|fixedMoodLabel|(?<![A-Za-z0-9])code[1-7](?![0-9])/
export const GINZA_CODE_HEADING_RE = /｜GINZA CODE [1-7][：:]/

function makeParagraph(text: string) {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [{ mode: 'normal', text, type: 'text', style: '', detail: 0, format: 0, version: 1 }],
  }
}

// ───────────────────────── スナップショット ─────────────────────────
export async function loadSnapshot(payload: Payload, targets: TnsTargets): Promise<Snapshot> {
  const edition = (await payload
    .findByID({ collection: 'soundtrack-editions', id: targets.editionId, depth: 1, locale: 'ja' })
    .catch(() => null)) as Record<string, any> | null

  const article = (await payload
    .findByID({ collection: 'articles', id: targets.articleId, depth: 0, locale: 'ja' })
    .catch(() => null)) as Record<string, any> | null

  const led = await payload.find({
    collection: 'music-usage-ledger',
    where: { reuseAllowed: { equals: false } },
    limit: 500,
    depth: 0,
  })
  const ledgerNoReuseTrackIds = led.docs
    .filter((d: any) => refId(d.soundtrackEdition) !== targets.editionId)
    .map((d: any) => refId(d.musicTrack))
    .filter((n: number | null): n is number => typeof n === 'number')

  return { targets, edition, article, ledgerNoReuseTrackIds }
}

// ───────────────────────── 診断 ─────────────────────────
export function diagnose(snap: Snapshot): Finding[] {
  const f: Finding[] = []
  const push = (severity: Severity, code: string, message: string) => f.push({ severity, code, message })
  const { edition, article, targets } = snap

  // --- 存在・同一性 ---
  if (!edition) push('blocker', 'edition.exists', `soundtrack-editions id=${targets.editionId} が見つからない`)
  if (!article) push('blocker', 'article.exists', `articles id=${targets.articleId} が見つからない`)
  if (!edition || !article) return f

  if (!targets.skipNumberCheck && Number(edition.editionNumber) !== targets.editionNumber) {
    push(
      'blocker',
      'edition.number',
      `editionNumber=${edition.editionNumber}（期待 ${targets.editionNumber}）。意図的なら --skip-number-check`,
    )
  } else {
    push('ok', 'edition.number', `editionNumber=${edition.editionNumber}`)
  }

  const linkedId = refId(edition.generatedArticle)
  if (linkedId !== targets.articleId) {
    push('warn', 'edition.linkedArticle', `edition.generatedArticle=${linkedId ?? 'null'}（期待 ${targets.articleId}）`)
  } else {
    push('ok', 'edition.linkedArticle', `generatedArticle=${linkedId}`)
  }

  // --- 安全条件：reviewStatus ---
  if (article.reviewStatus !== 'draft') {
    push('blocker', 'article.reviewStatus', `reviewStatus="${article.reviewStatus}"（安全条件: draft のみ許可）`)
  } else {
    push('ok', 'article.reviewStatus', 'draft')
  }

  // --- dailyScenes 構造 ---
  const scenes: any[] = edition.dailyScenes ?? []
  if (scenes.length !== 7) {
    push('blocker', 'scenes.count', `dailyScenes=${scenes.length}件（期待 7）`)
  } else {
    push('ok', 'scenes.count', 'dailyScenes 7件')

    const weekdays = scenes.map((s) => s.weekday)
    if (!WEEKDAYS.every((w, i) => weekdays[i] === w)) {
      push('warn', 'scenes.weekdays', `曜日並びが月→日でない: ${weekdays.join(',')}`)
    } else {
      push('ok', 'scenes.weekdays', '月→日で整列')
    }

    const dates = scenes.map((s) => String(s.date).slice(0, 10))
    let contiguous = true
    for (let i = 1; i < dates.length; i++) {
      const prev = Date.parse(`${dates[i - 1]}T00:00:00Z`)
      const cur = Date.parse(`${dates[i]}T00:00:00Z`)
      if (cur - prev !== 86_400_000) contiguous = false
    }
    const wkStart = String(edition.weekStart).slice(0, 10)
    const wkEnd = String(edition.weekEnd).slice(0, 10)
    if (!contiguous) {
      push('warn', 'scenes.dates', `日付が連続7日でない: ${dates.join(',')}`)
    } else if (dates[0] !== wkStart || dates[6] !== wkEnd) {
      push('warn', 'scenes.dates', `日付範囲(${dates[0]}..${dates[6]})が weekStart/weekEnd(${wkStart}..${wkEnd})と不一致`)
    } else {
      push('ok', 'scenes.dates', `${dates[0]}..${dates[6]}（連続7日）`)
    }
  }

  // --- 選曲 trackRef ---
  const trackIds = scenes.map((s) => refId(s?.musicSelected?.trackRef))
  const pendingFlags = scenes.map((s) => Boolean(s?.musicSelected?.pendingHumanSelection))
  const missing = scenes
    .map((s, i) => ({ i, id: trackIds[i], pending: pendingFlags[i], date: String(s.date).slice(0, 10) }))
    .filter((x) => x.id == null)
  if (missing.length) {
    for (const m of missing) {
      push(
        m.pending ? 'warn' : 'blocker',
        'music.trackRef',
        `${m.date}: trackRef 未設定${m.pending ? '（pendingHumanSelection=true）' : ''}`,
      )
    }
  } else {
    push('ok', 'music.trackRef', '7日すべて trackRef 設定済み')
  }
  if (pendingFlags.some(Boolean)) {
    push('warn', 'music.pending', `pendingHumanSelection=true が ${pendingFlags.filter(Boolean).length}日`)
  }

  const present = trackIds.filter((n): n is number => typeof n === 'number')
  const dupWithin = [...new Set(present.filter((n, i) => present.indexOf(n) !== i))]
  if (dupWithin.length) {
    push('warn', 'music.dupWithinWeek', `週内で重複する trackId: ${dupWithin.join(',')}`)
  } else if (present.length === 7) {
    push('ok', 'music.dupWithinWeek', '週内重複なし')
  }

  const ledgerHits = [...new Set(present.filter((n) => snap.ledgerNoReuseTrackIds.includes(n)))]
  if (ledgerHits.length) {
    push('warn', 'music.dupLedger', `MusicUsageLedger(reuseAllowed=false)と重複する trackId: ${ledgerHits.join(',')}`)
  } else {
    push('ok', 'music.dupLedger', '過去使用台帳との重複なし')
  }

  const origins = scenes.map((s) => s?.musicSelected?.trackRef?.origin)
  const jp = origins.filter((o) => o === 'japanese').length
  const intl = origins.filter((o) => o === 'international').length
  push('info', 'music.balance', `邦楽 ${jp} / 洋楽 ${intl}（origin 未解決 ${7 - jp - intl}）`)

  // --- 世界観挿絵 ---
  const imgIds = scenes.map((s) => refId(s?.image))
  const withImg = imgIds.filter((n) => n != null).length
  if (withImg < 7) {
    const missDates = scenes.filter((_, i) => imgIds[i] == null).map((s) => String(s.date).slice(0, 10))
    push('warn', 'illustration.count', `世界観挿絵 ${withImg}/7 曜日（未設定: ${missDates.join(',')}）`)
  } else {
    push('ok', 'illustration.count', '7曜日すべて挿絵設定済み')
  }

  const visualStatus = edition.visual?.visualStatus
  if (withImg === 7 && visualStatus !== 'attached') {
    push('warn', 'visual.status', `挿絵7点そろっているが visualStatus="${visualStatus}"（期待 attached）`)
  } else if (withImg < 7 && visualStatus === 'attached') {
    push('warn', 'visual.status', `visualStatus=attached だが挿絵は ${withImg}/7`)
  } else {
    push('ok', 'visual.status', `visualStatus=${visualStatus}`)
  }

  // --- 翻訳ステータス ---
  if (article.translationStatus?.ja !== 'complete') {
    push('warn', 'translation.ja', `translationStatus.ja="${article.translationStatus?.ja}"（note転記には complete が必要）`)
  } else {
    push('ok', 'translation.ja', 'ja=complete')
  }
  push(
    'info',
    'translation.en',
    `translationStatus.en="${article.translationStatus?.en}"（#36 は JA 転記運用のため en 未着手は許容）`,
  )

  // --- 本文 ---
  const blocks = bodyBlocks(article)
  const leaks = blocks.filter((b) => INTERNAL_CODE_RE.test(b.text))
  if (leaks.length) {
    for (const b of leaks) push('warn', 'body.internalCodeLeak', `block#${b.index}(${b.tag}): 内部コード露出 "${b.text.slice(0, 80)}"`)
  } else {
    push('ok', 'body.internalCodeLeak', '内部コード露出なし')
  }

  const h3 = blocks.filter((b) => b.tag === 'h3')
  if (h3.length !== 7) {
    push('warn', 'body.headings', `h3 見出しが ${h3.length}件（期待 7）`)
  }
  const badHeadings = h3.filter((b) => !GINZA_CODE_HEADING_RE.test(b.text))
  if (badHeadings.length) {
    for (const b of badHeadings) push('warn', 'body.headingFormat', `block#${b.index}: "GINZA CODE N：" 形式でない "${b.text.slice(0, 60)}"`)
  } else if (h3.length === 7) {
    push('ok', 'body.headingFormat', '7見出しすべて GINZA CODE 形式')
  }

  if (!blocks.some((b) => b.text.startsWith('#TokyoNostalgicSoundtrack'))) {
    push('warn', 'body.hashtag', 'note向けハッシュタグ行がない')
  } else {
    push('ok', 'body.hashtag', 'ハッシュタグ行あり')
  }
  push('info', 'body.blocks', `本文 ${blocks.length} ブロック`)

  const emptyMood = scenes
    .filter((s) => !s?.tnsEditorialCode?.fixedMoodLabel)
    .map((s) => s?.tnsEditorialCode?.code)
    .filter(Boolean)
  if (emptyMood.length) {
    push(
      'info',
      'scenes.fixedMoodLabel',
      `fixedMoodLabel 未設定: ${emptyMood.join(',')}（本文見出しにラベルがあれば許容, DECISION_LOG 2026-08-28）`,
    )
  }

  return f
}

// ───────────────────────── 修復プラン ─────────────────────────
function transformLeak(
  text: string,
  moodForDate: (d: string) => string | undefined,
): { out: string; ok: boolean } {
  let out = text

  // 1. `fixedMoodLabel「X」` -> `「X」`
  out = out.replace(/fixedMoodLabel(?=「)/g, '')

  // 2. 見出し: `YYYY-MM-DD（W曜日） — TNS Editorial Code: codeN[・rest]`
  const h = out.match(
    /^(\d{4}-\d{2}-\d{2}（.曜日）)\s*[—-]\s*TNS Editorial Code:\s*code([1-7])(?:・(.+))?\s*$/,
  )
  if (h) {
    const dateStr = out.slice(0, 10)
    const mood = (h[3] && h[3].trim()) || moodForDate(dateStr)
    if (!mood) return { out, ok: false } // ムードが現在DBから解決できない → 人間判断
    return { out: `${h[1]}｜GINZA CODE ${h[2]}：${mood}`, ok: true }
  }

  // 3. 文中に紛れた `— TNS Editorial Code: codeN` 断片を除去
  if (INTERNAL_CODE_RE.test(out)) {
    const stripped = out.replace(/\s*[—-]\s*TNS Editorial Code:\s*code[1-7]/g, '')
    if (!INTERNAL_CODE_RE.test(stripped)) return { out: stripped, ok: true }
    return { out, ok: false }
  }

  return { out, ok: out !== text }
}

export function planRepair(snap: Snapshot, findings: Finding[]): RepairPlan {
  const plan: RepairPlan = { actions: [], skipped: [], nextBody: null, nextTranslationJa: null, nextVisualStatus: null }
  const { edition, article } = snap
  if (!edition || !article) return plan
  if (findings.some((x) => x.severity === 'blocker')) {
    plan.skipped.push({ code: 'blocked', reason: 'BLOCKER があるため修復は行わない' })
    return plan
  }

  const scenes: any[] = edition.dailyScenes ?? []
  const moodByDate = new Map<string, string>()
  for (const s of scenes) {
    const label = s?.tnsEditorialCode?.fixedMoodLabel
    if (label) moodByDate.set(String(s.date).slice(0, 10), label)
  }

  // --- 本文: 内部コード露出の機械的除去 + ハッシュタグ行 ---
  const body = article.body ? (JSON.parse(JSON.stringify(article.body)) as Record<string, any>) : null
  let bodyChanged = false
  if (body?.root?.children) {
    const children: any[] = body.root.children
    for (const child of children) {
      const before = nodeText(child)
      if (!INTERNAL_CODE_RE.test(before)) continue
      if (!Array.isArray(child.children) || child.children.length !== 1 || typeof child.children[0].text !== 'string') {
        plan.skipped.push({ code: 'body.internalCodeLeak', reason: `block(${child.tag ?? child.type}) が単一テキストでなく自動整形不可: "${before.slice(0, 60)}"` })
        continue
      }
      const { out, ok } = transformLeak(before, (d) => moodByDate.get(d))
      if (!ok) {
        plan.skipped.push({ code: 'body.internalCodeLeak', reason: `見出しムードが現在DBから解決できず自動整形不可: "${before.slice(0, 60)}"` })
        continue
      }
      child.children[0].text = out
      bodyChanged = true
      plan.actions.push({ code: 'body.stripInternalCode', description: `内部コード除去: "${before.slice(0, 50)}" -> "${out.slice(0, 50)}"` })
    }

    const hasHashtag = children.some((c) => nodeText(c).startsWith('#TokyoNostalgicSoundtrack'))
    if (!hasHashtag) {
      children.push(makeParagraph(HASHTAG_LINE))
      bodyChanged = true
      plan.actions.push({ code: 'body.appendHashtag', description: 'note向けハッシュタグ行を末尾に追加' })
    }
  }
  if (bodyChanged) plan.nextBody = body

  // --- translationStatus.ja ---
  if (article.translationStatus?.ja !== 'complete') {
    const blockCount = bodyBlocks(article).length
    if (blockCount >= 20) {
      plan.nextTranslationJa = 'complete'
      plan.actions.push({ code: 'translation.ja', description: `translationStatus.ja "${article.translationStatus?.ja}" -> complete（本文 ${blockCount} ブロック）` })
    } else {
      plan.skipped.push({ code: 'translation.ja', reason: `本文が ${blockCount} ブロックしかなく ja=complete への自動昇格を保留` })
    }
  }

  // --- visualStatus の実態反映 ---
  const withImg = scenes.map((s) => refId(s?.image)).filter((n) => n != null).length
  const cur = edition.visual?.visualStatus
  if (withImg === 7 && cur !== 'attached') {
    plan.nextVisualStatus = 'attached'
    plan.actions.push({ code: 'visual.status', description: `visualStatus "${cur}" -> attached（挿絵7点そろっている）` })
  } else if (withImg < 7 && cur === 'attached') {
    plan.nextVisualStatus = 'pending_selection'
    plan.actions.push({ code: 'visual.status', description: `visualStatus "attached" -> pending_selection（挿絵は ${withImg}/7）` })
  }

  return plan
}

// ───────────────────────── バックアップ / 適用 ─────────────────────────
export async function writeBackup(payload: Payload, targets: TnsTargets, tag: string): Promise<string> {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const edition = await payload
    .findByID({ collection: 'soundtrack-editions', id: targets.editionId, depth: 0, locale: 'all' })
    .catch(() => null)
  const article = await payload
    .findByID({ collection: 'articles', id: targets.articleId, depth: 0, locale: 'all' })
    .catch(() => null)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_')
  const file = path.join(BACKUP_DIR, `tns_${tag}_ed${targets.editionId}_art${targets.articleId}_${stamp}.json`)
  writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), targets, edition, article }, null, 2), 'utf8')
  return file
}

export async function applyRepair(
  payload: Payload,
  snap: Snapshot,
  plan: RepairPlan,
): Promise<{ backupPath: string }> {
  if (!snap.article || !snap.edition) throw new Error('applyRepair: snapshot が不完全')
  if (snap.article.reviewStatus !== 'draft') {
    throw new Error(`applyRepair 中断: reviewStatus="${snap.article.reviewStatus}"（draft のみ許可）`)
  }
  if (plan.skipped.length) {
    throw new Error('applyRepair 中断: 自動修復できない項目（skipped）が残っている')
  }

  const backupPath = await writeBackup(payload, snap.targets, 'prepare_before')

  const articleData: Record<string, unknown> = {}
  if (plan.nextBody) articleData.body = plan.nextBody
  if (plan.nextTranslationJa) {
    articleData.translationStatus = {
      ja: 'complete',
      en: snap.article.translationStatus?.en ?? 'not_started',
    }
  }
  if (Object.keys(articleData).length) {
    await payload.update({
      collection: 'articles',
      id: snap.targets.articleId,
      locale: 'ja',
      data: articleData as never,
    })
  }

  if (plan.nextVisualStatus) {
    const edRaw = (await payload.findByID({
      collection: 'soundtrack-editions',
      id: snap.targets.editionId,
      depth: 0,
    })) as Record<string, any>
    await payload.update({
      collection: 'soundtrack-editions',
      id: snap.targets.editionId,
      data: { visual: { ...(edRaw.visual ?? {}), visualStatus: plan.nextVisualStatus } } as never,
    })
  }

  return { backupPath }
}

// ───────────────────────── 検証（READY 判定） ─────────────────────────
export interface ReadinessCheck {
  label: string
  pass: boolean
  note?: string
}

export function readiness(snap: Snapshot, findings: Finding[]): { ready: boolean; checks: ReadinessCheck[] } {
  const scenes: any[] = snap.edition?.dailyScenes ?? []
  const has = (code: string, sev: Severity) => findings.some((x) => x.code === code && x.severity === sev)
  const warnOn = (codes: string[]) => findings.some((x) => codes.includes(x.code) && x.severity === 'warn')

  const checks: ReadinessCheck[] = [
    { label: '7曜日 dailyScenes', pass: scenes.length === 7 },
    {
      label: '7画像（世界観挿絵）',
      pass: scenes.filter((s) => refId(s?.image) != null).length === 7,
    },
    { label: '本文 内部コード露出なし', pass: has('body.internalCodeLeak', 'ok') },
    { label: '本文 GINZA CODE 見出し 7件', pass: !warnOn(['body.headings', 'body.headingFormat']) },
    { label: '本文 note向けハッシュタグ行', pass: !warnOn(['body.hashtag']) },
    { label: 'translationStatus.ja = complete', pass: snap.article?.translationStatus?.ja === 'complete' },
    { label: 'reviewStatus = draft（安全条件維持）', pass: snap.article?.reviewStatus === 'draft' },
    { label: 'visualStatus = attached', pass: snap.edition?.visual?.visualStatus === 'attached' },
    {
      label: '選曲 週内重複なし / 台帳重複なし / 全曜日 trackRef',
      pass: !warnOn(['music.dupWithinWeek', 'music.dupLedger']) && has('music.trackRef', 'ok'),
    },
  ]
  const ready = checks.every((c) => c.pass) && !findings.some((x) => x.severity === 'blocker')
  return { ready, checks }
}

// ───────────────────────── 表示 ─────────────────────────
const SEV_MARK: Record<Severity, string> = { ok: '  ✓', info: '  ·', warn: '  ⚠', blocker: '  ✗' }

export function summarize(findings: Finding[]) {
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length
  const blocker = count('blocker')
  const warn = count('warn')
  return {
    ok: count('ok'),
    info: count('info'),
    warn,
    blocker,
    hasBlocker: blocker > 0,
    worst: (blocker ? 'blocker' : warn ? 'warn' : 'ok') as Severity,
  }
}

export function printReport(
  title: string,
  targets: TnsTargets,
  findings: Finding[],
  sum: ReturnType<typeof summarize>,
) {
  console.log(`\n=== ${title} ===`)
  console.log(`target: edition id=${targets.editionId} / #${targets.editionNumber} / article id=${targets.articleId}`)
  console.log('')
  for (const f of findings) console.log(`${SEV_MARK[f.severity]} [${f.code}] ${f.message}`)
  console.log('')
  console.log(`summary: ok=${sum.ok} info=${sum.info} warn=${sum.warn} blocker=${sum.blocker} -> ${sum.worst.toUpperCase()}`)
}

export function printPlan(plan: RepairPlan) {
  console.log('\n--- REPAIR PLAN（現在DBを正とした差分。編集判断は行わない）---')
  if (!plan.actions.length) {
    console.log('  （適用予定の変更なし）')
  } else {
    for (const a of plan.actions) console.log(`  + [${a.code}] ${a.description}`)
  }
  if (plan.skipped.length) {
    console.log('  自動修復できない項目（人間の判断が必要）:')
    for (const s of plan.skipped) console.log(`  ! [${s.code}] ${s.reason}`)
  }
}

export function printChecks(checks: ReadinessCheck[]) {
  console.log('\n--- READINESS CHECKS ---')
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.label}${c.note ? ` — ${c.note}` : ''}`)
}
