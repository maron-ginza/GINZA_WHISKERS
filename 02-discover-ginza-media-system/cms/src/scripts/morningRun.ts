// GINZA WHISKERS / Project 02 P0 改善（2026-09-02 続き）— 明朝運用パイプラインの単一経路。
//
// `./p2 morning`（および `./p2 am-candidates`）が呼ぶ唯一のオーケストレーター。
// 6:00 以降、次を1本の経路で順番に実行する（別経路を並行実行しない）：
//   1. 軽量 preflight（Docker / PostgreSQL / Payload）
//   2. 6:00 収集の完了確認（このスクリプトでは収集を実行しない）
//   3. 承認済み DiscoveredContent の読み込み
//   4. 重複除去 → 公式ページ/詳細ページ/PDF の取得確認（--fetch 時のみ）
//      → ArticleFacts 候補の抽出 → A/B/C 判定 → 画像 preflight
//   5. 7:10 候補レポートの生成（A判定のみ上位5・B/C は別表）
//   6. 記事生成レディ最終候補ダイジェスト（2026-09-05、--fetch 時のみ）：
//      承認済み A判定に加え、偏り補正済み inbox 推奨候補（selectRecommendedThemes と
//      同じロジック）も当日の公式確認まで実施し、施設上限2件・原則4カテゴリー以上分散・
//      水増しなしの「マロンが1件選べばそのまま記事生成へ進める」候補リストを組み立てる
//      （curationStatus は一切変更しない・DB 書き込みなし）。
//
// 【安全】DB 書き込みなし・Claude API なし・課金 0 円・note/Chrome/X 操作なし・
//   自動公開なし・記事生成に接続しない。外部ページは未信頼データとして決定的パースのみ。
//   1件の失敗で全体を止めない（失敗候補は理由つきで B/C）。ロックで二重起動を防ぐ。

import { mkdirSync, writeFileSync, appendFileSync, readdirSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPayload } from 'payload'

import config from '../payload.config'
import { assessCandidate } from '../lib/morning/assessCandidate'
import { buildMorningReport, renderMorningReport } from '../lib/morning/buildMorningReport'
import { buildFinalCandidateDigest, renderFinalCandidateDigest } from '../lib/morning/buildFinalCandidateDigest'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { classifyTemplateType } from '../lib/morning/classifyTemplateType'
import { buildTemplatePrecheck } from '../lib/morning/templatePrecheck'
import { extractProductNewsFactsCandidate } from '../lib/morning/extractProductNewsFacts'
import { extractPriceHint } from '../lib/morning/extractPriceHint'
import {
  dedupCheck,
  type DedupArticleRecord,
  type DedupNoteRecord,
} from '../lib/morning/dedupCheck'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { fetchOfficialSignals, isAllowedHost } from '../lib/morning/fetchOfficialSignals'
import {
  createOrUpdateArticleFactsFromCandidate,
  type ArticleFactsRow,
  type ArticleFactsStore,
  type ArticleFactsWrite,
  type RegisterResult,
} from '../lib/morning/registerArticleFacts'
import type { CandidateAssessment, FinalCandidateDigest, OfficialPageSignals } from '../lib/morning/types'
import type {
  ArticleFactsLike,
  DiscoveredContentLike,
} from '../lib/template/mapDiscoveredContentToEventFields'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import { deriveProvisionalCategory } from '../lib/pipeline/provisionalCategory'
import { assessInboxPool } from '../lib/pipeline/assessInboxPool'
import { selectRecommendedThemes, loadSelectThemesConfigFromEnv } from '../lib/pipeline/selectRecommendedThemes'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Args {
  limit: number
  json: boolean
  write: boolean
  fetch: boolean
  fetchDisabledByEnv: boolean
  connectTimeoutMs: number
  overallTimeoutMs: number
  maxPerHost: number
  /** ArticleFacts 自動登録の「差分計算」を行う（既定 false。--register-facts で ON） */
  registerFacts: boolean
  /** 実際に DB へ書く（--write-facts か env MORNING_WRITE_FACTS=1。既定 false＝差分のみ） */
  writeFacts: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const num = (p: string, d: number): number => {
    const f = argv.find((a) => a.startsWith(p))
    const n = f ? Number(f.split('=')[1]) : d
    return Number.isFinite(n) && n > 0 ? n : d
  }
  // --fetch フラグがあれば取得する。緊急停止は環境変数 MORNING_FETCH=0。
  const envDisabled = process.env.MORNING_FETCH === '0'
  const wantFetch = argv.includes('--fetch') && !envDisabled
  const registerFacts = argv.includes('--register-facts')
  // 実書き込みは --write-facts か MORNING_WRITE_FACTS=1 の明示が必要。--no-write でも抑止。
  const writeFacts =
    registerFacts &&
    !argv.includes('--no-write') &&
    (argv.includes('--write-facts') || process.env.MORNING_WRITE_FACTS === '1')
  return {
    limit: num('--limit=', 50),
    json: argv.includes('--json'),
    write: !argv.includes('--no-write'),
    fetch: wantFetch,
    fetchDisabledByEnv: argv.includes('--fetch') && envDisabled,
    connectTimeoutMs: num('--fetch-timeout=', 8000),
    overallTimeoutMs: num('--fetch-overall-timeout=', 15000),
    maxPerHost: num('--fetch-max-per-host=', 8),
    registerFacts,
    writeFacts,
  }
}

// ── Payload doc → プレーン値（templateCheck.ts / morningCandidates と同型） ──
function toDcLike(dc: Record<string, unknown>): DiscoveredContentLike {
  const ss = dc.sourceSite
  const sourceSiteName =
    ss && typeof ss === 'object'
      ? ((ss as { name?: string | null }).name ?? null)
      : ((ss as string | null) ?? null)
  return {
    id: dc.id as number,
    title: (dc.title as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    articleUrl: (dc.articleUrl as string | null) ?? null,
    sourceSiteName,
    publishedAt: (dc.publishedAt as string | null) ?? null,
    contentUpdatedAt: (dc.contentUpdatedAt as string | null) ?? null,
    eventStartAt: (dc.eventStartAt as string | null) ?? null,
    eventEndAt: (dc.eventEndAt as string | null) ?? null,
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    uxType: (dc.uxType as string | null) ?? null,
    lastCheckedAt: (dc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dc.detectedAt as string | null) ?? null,
    dateExtraction: (dc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }
}

function toFactsLike(f: Record<string, unknown> | undefined): ArticleFactsLike | undefined {
  if (!f) return undefined
  const g = <T = unknown>(k: string): T => f[k] as T
  return {
    enrichmentStatus: g<string | null>('enrichmentStatus') ?? null,
    season: g<string | null>('season') ?? null,
    eventName: g<string | null>('eventName') ?? null,
    editionLabel: g<string | null>('editionLabel') ?? null,
    theme: g<string | null>('theme') ?? null,
    whatHappens: g<string | null>('whatHappens') ?? null,
    eventDate: g<string | null>('eventDate') ?? null,
    eventDateISO: g<string | null>('eventDateISO') ?? null,
    eventTime: g<string | null>('eventTime') ?? null,
    venues: g<ArticleFactsLike['venues']>('venues') ?? null,
    areaLead: g<string | null>('areaLead') ?? null,
    audienceNote: g<string | null>('audienceNote') ?? null,
    paid: g<string | null>('paid') ?? null,
    applyRequired: g<string | null>('applyRequired') ?? null,
    applyDeadline: g<string | null>('applyDeadline') ?? null,
    resultDate: g<string | null>('resultDate') ?? null,
    resultRule: g<string | null>('resultRule') ?? null,
    applyRule: g<string | null>('applyRule') ?? null,
    officialInfoNote: g<string | null>('officialInfoNote') ?? null,
    editorsNoteSeed: g<string | null>('editorsNoteSeed') ?? null,
    closing: g<string | null>('closing') ?? null,
    callToAction: g<string | null>('callToAction') ?? null,
    hashtags: g<ArticleFactsLike['hashtags']>('hashtags') ?? null,
    sourceProvenanceFacts: g<ArticleFactsLike['sourceProvenanceFacts']>('sourceProvenanceFacts') ?? null,
  }
}

async function buildImageInventory(payload: Awaited<ReturnType<typeof getPayload>>): Promise<string[]> {
  const names = new Set<string>()
  try {
    for (const f of readdirSync(resolve(process.cwd(), '..', 'media', 'image-assets'))) names.add(f.toLowerCase())
  } catch {
    /* なくてもよい */
  }
  try {
    const res = await payload.find({ collection: 'image-assets', limit: 500, depth: 0, overrideAccess: true })
    for (const d of res.docs as unknown as Array<Record<string, unknown>>) {
      if (typeof d.filename === 'string') names.add(d.filename.toLowerCase())
      if (typeof d.altText === 'string') names.add(d.altText.toLowerCase())
    }
  } catch {
    /* コレクション未定義でも継続 */
  }
  return [...names]
}

/**
 * SOURCE LEDGER（enabled）から
 *   - URL のホスト名（--fetch の許可ドメイン）
 *   - id → source_type（分類ゲートの弱い補助シグナル）
 * を1回の取得でまとめて作る。
 */
async function buildSourceLedgerMaps(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<{ allowedHosts: string[]; typeById: Map<number, string> }> {
  const hosts = new Set<string>()
  const typeById = new Map<number, string>()
  try {
    const res = await payload.find({ collection: 'source-ledger', limit: 200, depth: 0, overrideAccess: true })
    for (const d of res.docs as unknown as Array<Record<string, unknown>>) {
      const u = d.url
      if (typeof u === 'string') {
        try {
          hosts.add(new URL(u).hostname.toLowerCase())
        } catch {
          /* skip */
        }
      }
      const st = d.sourceType ?? d.source_type
      if (typeof d.id === 'number' && typeof st === 'string') typeById.set(d.id, st)
    }
  } catch {
    /* コレクション未定義でも継続（＝許可リスト空＝全 URL 拒否） */
  }
  return { allowedHosts: [...hosts], typeById }
}

/**
 * ArticleFacts への I/O アダプタ。**draft のみ書く**（`enrichmentStatus:'draft'` を強制）。
 * `ready` は書かない（beforeChange が req.user を要求＝Local API では不可）。
 * write=false のときは create/update を呼ばれても投げる（安全側）。
 */
function buildArticleFactsStore(
  payload: Awaited<ReturnType<typeof getPayload>>,
  write: boolean,
): ArticleFactsStore {
  const toRow = (d: Record<string, unknown>): ArticleFactsRow => ({
    id: Number(d.id),
    discoveredContent:
      d.discoveredContent && typeof d.discoveredContent === 'object'
        ? { id: Number((d.discoveredContent as { id: number }).id) }
        : Number(d.discoveredContent),
    enrichmentStatus: String(d.enrichmentStatus ?? 'draft'),
    eventDateISO: (d.eventDateISO as string | null) ?? null,
    sourceProvenanceFacts:
      (d.sourceProvenanceFacts as ArticleFactsRow['sourceProvenanceFacts']) ?? null,
    notes: (d.notes as string | null) ?? null,
    // 2026-09-03（改善対象2 ＋ 共通 sale mapper）: 空欄補完の判定に使う既存値
    eventName: (d.eventName as string | null) ?? null,
    eventDate: (d.eventDate as string | null) ?? null,
    eventTime: (d.eventTime as string | null) ?? null,
    venues: (d.venues as ArticleFactsRow['venues']) ?? null,
    paid: (d.paid as string | null) ?? null,
    applyRequired: (d.applyRequired as string | null) ?? null,
    whatHappens: (d.whatHappens as string | null) ?? null,
    officialInfoNote: (d.officialInfoNote as string | null) ?? null,
    priceText: (d.priceText as string | null) ?? null,
    areaLead: (d.areaLead as string | null) ?? null,
    audienceNote: (d.audienceNote as string | null) ?? null,
    hashtags: (d.hashtags as ArticleFactsRow['hashtags']) ?? null,
    primaryCategory: (d.primaryCategory as string | null) ?? null,
    templateType: (d.templateType as ArticleFactsRow['templateType']) ?? null,
    humanReviewedAt: (d.humanReviewedAt as string | null) ?? null,
    humanReviewedBy: (d.humanReviewedBy as ArticleFactsRow['humanReviewedBy']) ?? null,
  })
  return {
    async findByDc(dcId) {
      const res = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: dcId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const d = res.docs[0] as unknown as Record<string, unknown> | undefined
      return d ? toRow(d) : null
    },
    async create(data: ArticleFactsWrite) {
      if (!write) throw new Error('ArticleFacts write is disabled (差分計算のみ)')
      // primaryCategory / templateType は registerArticleFacts で検証済みの列挙値
      // （primaryCategory は morning からは渡さない・templateType は TemplateType）。
      // 生成型の厳密な列挙 union には string 側からは代入できないため、書き込み境界で cast する。
      const created = await payload.create({
        collection: 'article-facts',
        overrideAccess: true,
        data: { ...data, enrichmentStatus: 'draft' } as never, // draft を強制
      })
      return toRow(created as unknown as Record<string, unknown>)
    },
    async update(id, data) {
      if (!write) throw new Error('ArticleFacts write is disabled (差分計算のみ)')
      const { enrichmentStatus: _ignore, ...rest } = data // status は自動で変えない
      void _ignore
      const updated = await payload.update({
        collection: 'article-facts',
        id,
        overrideAccess: true,
        data: rest as never,
      })
      return toRow(updated as unknown as Record<string, unknown>)
    },
  }
}

/** 全 Article を dedup 用の軽量レコードへ（title + editorialProvenance の dcId/sourceUrl） */
async function loadArticleRecords(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<DedupArticleRecord[]> {
  const out: DedupArticleRecord[] = []
  const res = await payload.find({
    collection: 'articles',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    locale: 'ja',
  })
  for (const a of res.docs as unknown as Array<Record<string, unknown>>) {
    const prov = Array.isArray(a.editorialProvenance) ? (a.editorialProvenance as Array<Record<string, unknown>>) : []
    const dcIds: number[] = []
    const urls: string[] = []
    for (const p of prov) {
      const dcId = Number(p.discoveredContentSource)
      if (Number.isInteger(dcId) && dcId > 0) dcIds.push(dcId)
      if (typeof p.sourceUrl === 'string') urls.push(p.sourceUrl)
    }
    out.push({
      id: Number(a.id),
      title: (a.title as string | null) ?? null,
      provenanceDcIds: [...new Set(dcIds)],
      provenanceSourceUrls: [...new Set(urls)],
      eventDates: [],
      venueHints: [],
    })
  }
  return out
}

/** .devlogs/night/queue 配下の note-draft.json / note-body.txt を dedup 用レコードへ（ローカル記録のみ） */
function buildNoteRecords(): DedupNoteRecord[] {
  const recs: DedupNoteRecord[] = []
  const root = resolve(process.cwd(), '..', '.devlogs', 'night', 'queue')
  if (!existsSync(root)) return recs
  try {
    for (const d of readdirSync(root)) {
      let entries: string[]
      try {
        entries = readdirSync(resolve(root, d))
      } catch {
        continue
      }
      for (const e of entries) {
        const dir = resolve(root, d, e)
        const draftPath = resolve(dir, 'note-draft.json')
        const bodyPath = resolve(dir, 'note-body.txt')
        let draftTitle: string | null = null
        let draftDcId: number | null = null
        let sourceUrls: string[] = []
        let published = false
        if (existsSync(draftPath)) {
          try {
            const j = JSON.parse(readFileSync(draftPath, 'utf8')) as Record<string, unknown>
            draftTitle = (j.title as string | null) ?? null
            const id = Number(j.discoveredContentId)
            draftDcId = Number.isInteger(id) && id > 0 ? id : null
            published = j.status === 'published' || j.publishRecord != null
            const links = j.links as Record<string, unknown> | undefined
            const su = links?.sourceUrls
            if (Array.isArray(su)) sourceUrls = su.filter((x): x is string => typeof x === 'string')
            else if (typeof j.sourceUrl === 'string') sourceUrls = [j.sourceUrl]
          } catch {
            /* skip */
          }
          recs.push({
            path: `.devlogs/night/queue/${d}/${e}/note-draft.json`,
            kind: 'note-draft',
            discoveredContentId: draftDcId,
            title: draftTitle,
            sourceUrls,
            eventDate: null,
            venue: null,
            published,
          })
        }
        if (existsSync(bodyPath)) {
          let firstLine: string | null = null
          try {
            firstLine = readFileSync(bodyPath, 'utf8').split('\n').map((s) => s.trim()).find(Boolean) ?? null
          } catch {
            /* skip */
          }
          recs.push({
            path: `.devlogs/night/queue/${d}/${e}/note-body.txt`,
            kind: 'note-body',
            discoveredContentId: draftDcId, // 兄弟 note-draft.json から
            title: firstLine ?? draftTitle,
            sourceUrls,
            eventDate: null,
            venue: null,
            published,
          })
        }
      }
    }
  } catch {
    /* skip */
  }
  return recs
}

/** 6:00 収集の完了確認（.devlogs/trial/run_<date>.jsonl に score exitCode:0 があるか）。実行はしない。 */
function checkCollection(dateStr: string): { done: boolean; detail: string } {
  const f = resolve(process.cwd(), '..', '.devlogs', 'trial', `run_${dateStr}.jsonl`)
  if (!existsSync(f)) return { done: false, detail: `run_${dateStr}.jsonl が無い（6:00 収集が未実行の可能性）` }
  try {
    const lines = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)
    for (const ln of lines) {
      try {
        const j = JSON.parse(ln) as Record<string, unknown>
        if (String(j.step ?? '').includes('score') && Number(j.exitCode) === 0)
          return { done: true, detail: `score 成功（${String(j.finishedAt ?? j.startedAt ?? '')}）` }
      } catch {
        /* skip */
      }
    }
    return { done: false, detail: `run_${dateStr}.jsonl はあるが score 成功行が無い` }
  } catch (e) {
    return { done: false, detail: `run ログ読取失敗: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const LOCK_MAX_AGE_MS = 30 * 60 * 1000

async function main(): Promise<void> {
  const args = parseArgs()
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const outDir = resolve(process.cwd(), '..', '.devlogs', 'morning', dateStr)
  const lockDir = resolve(process.cwd(), '..', '.devlogs', 'morning', '.lock')
  const t0 = Date.now()
  const timings: Record<string, number> = {}
  const mark = (k: string, since: number): void => {
    timings[k] = Date.now() - since
  }

  // ── ロック（二重起動防止・item 4） ──
  try {
    mkdirSync(resolve(process.cwd(), '..', '.devlogs', 'morning'), { recursive: true })
  } catch {
    /* ok */
  }
  if (existsSync(lockDir)) {
    const age = Date.now() - statSync(lockDir).mtimeMs
    if (age < LOCK_MAX_AGE_MS) {
      console.error(
        `前回の morning 処理が実行中/未完了です（ロック経過 ${Math.round(age / 1000)}s < ${LOCK_MAX_AGE_MS / 1000}s）。二重実行せず安全停止します。`,
      )
      console.error(`  古いロックだと分かっている場合のみ手動削除: rm -rf "${lockDir}"`)
      process.exit(3)
    }
    // 古いロックは奪取
    try {
      rmSync(lockDir, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  }
  try {
    mkdirSync(lockDir)
  } catch {
    console.error('ロック取得に失敗しました。安全停止します。')
    process.exit(3)
  }

  const releaseLock = (): void => {
    try {
      rmSync(lockDir, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  }
  process.on('exit', releaseLock)

  try {
    const payload = await getPayload({ config })

    // 1. 軽量 preflight（結果は表示のみ・停止条件にしない）
    let step = Date.now()
    const pre: string[] = []
    try {
      const r = await payload.find({ collection: 'discovered-content', limit: 1, depth: 0, overrideAccess: true })
      pre.push(`Payload/DB: OK（discovered-content ${r.totalDocs} 件）`)
    } catch (e) {
      pre.push(`Payload/DB: NG（${e instanceof Error ? e.message : String(e)}）`)
    }
    mark('preflight', step)

    // 2. 6:00 収集の完了確認（実行しない）
    step = Date.now()
    const coll = checkCollection(dateStr)
    mark('collectionCheck', step)

    // 3. 承認済み DiscoveredContent ＋ 重複判定用データ ＋ 許可ドメイン
    step = Date.now()
    const imageInventory = await buildImageInventory(payload)
    const { allowedHosts, typeById: sourceLedgerTypeById } = await buildSourceLedgerMaps(payload)
    const articleRecords = await loadArticleRecords(payload)
    const noteRecords = buildNoteRecords()
    const approved = await payload.find({
      collection: 'discovered-content',
      where: { curationStatus: { equals: 'approved' } },
      limit: args.limit,
      depth: 1,
      overrideAccess: true,
      sort: '-updatedAt',
    })
    mark('loadApproved', step)

    // 4. 候補ごとの評価（1件失敗で全体を止めない）
    step = Date.now()
    if (args.write) mkdirSync(resolve(outDir, 'facts'), { recursive: true })
    const assessments: CandidateAssessment[] = []

    // fetch 実測メトリクス
    const fetchMetrics = {
      enabled: args.fetch,
      disabledByEnv: args.fetchDisabledByEnv,
      allowedHostCount: allowedHosts.length,
      attempted: 0,
      success: 0,
      httpFail: 0,
      timeout: 0,
      rejected: 0,
      jsonLd: 0,
      rejectedList: [] as Array<{ dcId: number; url: string; reason: string }>,
    }
    // 過剰アクセス防止：同一 URL は1回だけ取得、同一ホストの本数上限
    const fetchCache = new Map<string, OfficialPageSignals>()
    const perHostCount = new Map<string, number>()

    // ArticleFacts 自動登録（--register-facts。実書き込みは --write-facts / MORNING_WRITE_FACTS=1）
    const factsStore = buildArticleFactsStore(payload, args.writeFacts)
    const registerResults: RegisterResult[] = []
    const factsAudit: unknown[] = []

    for (const raw of approved.docs as unknown as Array<Record<string, unknown>>) {
      const dcId = Number(raw.id)
      try {
        const factsRes = await payload.find({
          collection: 'article-facts',
          where: { discoveredContent: { equals: dcId } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown> | undefined

        const dcLike = toDcLike(raw)

        // --- 重複判定（多シグナル・ローカル記録のみ） ---
        const dr = dedupCheck(
          {
            id: dcId,
            articleUrl: dcLike.articleUrl ?? null,
            title: dcLike.title ?? null,
            eventStartAt: dcLike.eventStartAt ?? null,
            venue: dcLike.venue ?? null,
          },
          articleRecords,
          noteRecords,
        )
        const dedup = {
          duplicate: dr.duplicate,
          possibleDuplicate: dr.possibleDuplicate,
          existingArticleId: dr.existingArticleId,
          notePublished: dr.signals.some((s) => s.type.startsWith('note-record') && s.strong) || undefined,
          signalSummary: dr.signals.map((s) => s.detail),
          externalUnverified: true,
        }

        // --- 出典が SOURCE LEDGER の許可ドメインか（trustedSource） ---
        let dcHost = ''
        try {
          if (dcLike.articleUrl) dcHost = new URL(dcLike.articleUrl).hostname.toLowerCase()
        } catch {
          /* skip */
        }
        const trustedSource = dcHost !== '' && isAllowedHost(dcHost, allowedHosts)

        // --- 公式ページ取得（--fetch のときだけ・重複でない・許可ドメイン・タイムアウトつき・失敗は握る） ---
        let signals: OfficialPageSignals | null = null
        if (args.fetch && !dedup.duplicate && dcLike.articleUrl) {
          const key = dcLike.articleUrl
          if (fetchCache.has(key)) {
            signals = fetchCache.get(key) ?? null
          } else {
            const used = perHostCount.get(dcHost) ?? 0
            if (dcHost && used >= args.maxPerHost) {
              signals = {
                requested: true,
                ok: false,
                fetchedAt: new Date().toISOString(),
                rejectedReason: `同一ホストの取得本数上限（${args.maxPerHost}）に達したためスキップ`,
                rejectedUrl: key,
              }
            } else {
              fetchMetrics.attempted++
              if (dcHost) perHostCount.set(dcHost, used + 1)
              try {
                signals = await fetchOfficialSignals(key, {
                  allowedHosts,
                  connectTimeoutMs: args.connectTimeoutMs,
                  overallTimeoutMs: args.overallTimeoutMs,
                })
              } catch (e) {
                signals = {
                  requested: true,
                  ok: false,
                  fetchedAt: new Date().toISOString(),
                  error: e instanceof Error ? e.message : String(e),
                }
              }
              fetchCache.set(key, signals)
              await sleep(300) // 礼儀正しい間隔
            }
            // メトリクス集計
            if (signals) {
              if (signals.ok) {
                fetchMetrics.success++
                if (Array.isArray(signals.jsonLd) && signals.jsonLd.length > 0) fetchMetrics.jsonLd++
              } else if (signals.rejectedReason) {
                fetchMetrics.rejected++
                fetchMetrics.rejectedList.push({ dcId, url: signals.rejectedUrl ?? key, reason: signals.rejectedReason })
              } else if (signals.error && /タイムアウト/.test(signals.error)) {
                fetchMetrics.timeout++
              } else {
                fetchMetrics.httpFail++
              }
            }
          }
        }

        // --- 記事タイプ分類ゲート（ArticleFacts 抽出・登録より前・決定的・AI なし） ---
        const classification = classifyFactKind({
          contentType: (raw.contentType as string | null) ?? dcLike.contentType ?? null,
          uxType: (raw.uxType as string | null) ?? dcLike.uxType ?? null,
          title: dcLike.title ?? null,
          excerpt: dcLike.excerpt ?? null,
          sourceType: sourceLedgerTypeById.get(Number(raw.sourceSite ?? raw.source_site_id)) ?? null,
          officialSignals: signals,
        })
        const factKind = classification.factKind
        factsAudit.push({
          at: now.toISOString(),
          kind: 'classify',
          discoveredContentId: dcId,
          factKind,
          confidence: classification.confidence,
          reasons: classification.reasons,
          signals: classification.signals,
        })

        const a = assessCandidate({
          dc: dcLike,
          facts: toFactsLike(factsDoc),
          dedup,
          imageInventory,
          now,
          factKind,
        })
        a.factKind = factKind
        a.factKindClassification = classification

        // --- 記事テンプレート種別（全 factKind で決定的に分類。AI なし） ---
        //   event      → exhibition / application / workshop / recurring_event / unknown
        //   product_news → sale
        //   unknown     → unknown
        const templateTypeCls = classifyTemplateType({
          factKind,
          contentType: (raw.contentType as string | null) ?? dcLike.contentType ?? null,
          uxType: (raw.uxType as string | null) ?? dcLike.uxType ?? null,
          title: dcLike.title ?? null,
          excerpt: dcLike.excerpt ?? null,
        })
        a.templateType = templateTypeCls.templateType

        // タイプ別に構造化事実へ振り分ける（レポート表示用の要約）
        if (factKind === 'event') {
          a.extraction = extractArticleFactsCandidate({
            dc: dcLike,
            image: a.image,
            officialSignals: signals,
            trustedSource,
          })
          // 7:10 レポート用テンプレート事前検査（改善対象1・決定的・AI なし。event 専用）
          a.templatePrecheck = buildTemplatePrecheck({
            dc: dcLike,
            facts: toFactsLike(factsDoc),
            factsSource: a.factsSource,
            templateType: templateTypeCls,
            extraction: a.extraction,
            verdict: a.verdict,
            now,
          })
          factsAudit.push({
            at: now.toISOString(),
            kind: 'template-precheck',
            discoveredContentId: dcId,
            templateType: templateTypeCls.templateType,
            confidence: templateTypeCls.confidence,
            templateEligible: a.templatePrecheck.templateEligible,
            decision: a.templatePrecheck.decision,
            recommendation: a.templatePrecheck.recommendation,
            foreignDateSuspect: a.templatePrecheck.foreignDateSuspect,
          })
        } else if (factKind === 'product_news') {
          a.productExtraction = extractProductNewsFactsCandidate({
            dc: dcLike,
            image: a.image,
            officialSignals: signals,
            trustedSource,
          })
        }
        // unknown は event 用/商品用の要約抽出は行わない（推測分類しない）

        // --- digestMeta（記事生成レディ最終候補ダイジェスト用。2026-09-05。読み取り専用・DB非依存） ---
        {
          const facility = resolveFacilityKey({
            venue: dcLike.venue,
            sourceName: dcLike.sourceSiteName,
            sourceUrl: dcLike.articleUrl,
            title: dcLike.title,
          })
          const provisionalCategory = deriveProvisionalCategory({
            primaryCategory: (factsDoc?.primaryCategory as string | null) ?? null,
            title: dcLike.title,
            venue: dcLike.venue,
            templateType: a.templateType,
            contentType: dcLike.contentType,
          })
          a.digestMeta = {
            venue: dcLike.venue ?? null,
            officialFetch: signals
              ? {
                  requested: signals.requested,
                  ok: signals.ok,
                  httpStatus: signals.httpStatus,
                  fetchedAt: signals.fetchedAt,
                  rejectedReason: signals.rejectedReason,
                  error: signals.error,
                }
              : null,
            priceHint: extractPriceHint(signals?.bodyText).price,
            facilityKey: facility.key,
            facilityLabel: facility.store || facility.area || '',
            category: provisionalCategory.category,
            categoryBasis: provisionalCategory.basis,
            publishedAt: factKind === 'event' ? (a.extraction?.fields.publishedAt ?? null) : null,
            origin: 'approved',
          }
        }

        // --- ArticleFacts 自動登録（共通構造・全 factKind・draft のみ・冪等・監査つき。1件失敗で全体は止めない） ---
        //   共通 Article Facts 化（2026-09-03、RUNBOOKS 付録 G.25）：
        //   ・event 系      → extractArticleFactsCandidate を base に、confirmed な event 事実を draft へ。
        //   ・product_news  → 同じ base（DC＋公式ページから決定的抽出）＋ productExtraction を渡し、
        //                     confirmed な販売事実だけを共通フィールドへ（priceText 等は人間確認）。
        //   ・unknown       → base のみ。confirmed 事実だけ draft へ。templateType=unknown で保持し、
        //                     ready 化・記事生成はできない（evaluateReadyGate が停止させる）。
        //   ・primaryCategory は機械推測しない（マロンが admin で確定）。
        if (args.registerFacts) {
          try {
            const registerBase =
              factKind === 'event' && a.extraction
                ? a.extraction
                : extractArticleFactsCandidate({
                    dc: dcLike,
                    image: a.image,
                    officialSignals: signals,
                    trustedSource,
                  })
            const rr = await createOrUpdateArticleFactsFromCandidate(
              factsStore,
              registerBase,
              {
                verdict: a.verdict,
                verdictReasons: a.reasons,
                expired: a.expired,
                duplicate: a.dedup.duplicate,
                factKind,
                templateType: templateTypeCls.templateType,
                productExtraction: factKind === 'product_news' ? a.productExtraction ?? null : null,
              },
              { dryRun: !args.writeFacts, now },
            )
            registerResults.push(rr)
            factsAudit.push(rr.auditEntry)
            a.factsRegister = {
              action: rr.action,
              reason: rr.reason,
              diff: rr.diff,
              articleFactsId: rr.articleFactsId,
            }
          } catch (e) {
            a.factsRegister = {
              action: 'skipped',
              reason: `登録処理エラー（他候補は継続）: ${e instanceof Error ? e.message : String(e)}`,
              diff: [],
            }
          }
        }

        if (args.write) {
          const p = resolve(outDir, 'facts', `${dcId}.json`)
          writeFileSync(
            p,
            JSON.stringify(
              {
                schemaVersion: 2,
                generatedAt: now.toISOString(),
                note: '記事タイプ分類つき構造化事実プロポーザル。DB へは書いていない（event の draft 登録は --write-facts のときだけ）。',
                discoveredContentId: dcId,
                verdict: a.verdict,
                factKind,
                classification,
                eventExtraction: factKind === 'event' ? a.extraction : null,
                productNewsExtraction: factKind === 'product_news' ? a.productExtraction : null,
                dedup,
              },
              null,
              2,
            ),
          )
          a.factsProposalPath = `.devlogs/morning/${dateStr}/facts/${dcId}.json`
        }

        assessments.push(a)
      } catch (e) {
        // この候補だけ C として理由を記録（全体は継続）
        const msg = e instanceof Error ? e.message : String(e)
        assessments.push({
          discoveredContentId: dcId,
          title: String(raw.title ?? `DiscoveredContent #${dcId}`),
          displayTitle: String(raw.title ?? `DiscoveredContent #${dcId}`).split(/\s*\|\s*/)[0],
          sourceName: '（処理エラー）',
          sourceUrl: String(raw.articleUrl ?? ''),
          verdict: 'C',
          reasons: ['この候補の処理中に例外が発生したため自動的に除外（他候補は継続）'],
          verifiedItems: [],
          missing: [],
          unconfirmed: [],
          dedup: { duplicate: false },
          expired: false,
          ginzaRelevant: false,
          hasTraceableSource: false,
          factsSource: 'none',
          templateEligible: false,
          image: {
            available: false,
            policy: '画像なし（処理エラー）',
            externalImageProhibited: true,
          },
          eventPeriod: '不明',
          applyDeadline: '不明',
          estimateMinutes: 0,
          processingError: msg,
        })
      }
    }
    mark('assessLoop', step)

    // 4b. 記事生成レディ最終候補ダイジェスト（2026-09-05、--fetch 時のみ）
    //   承認済みだけでは施設・カテゴリーの多様性が確保できないことがあるため、
    //   偏り補正済み inbox 推奨候補（./p2 themes recommend と同じロジック＝
    //   selectRecommendedThemes、承諾前のまま・curationStatus は変更しない）を
    //   最大12件まで追加で取り込み、承認済みループと同じ「当日の公式確認」
    //   （dedup → --fetch → 記事タイプ分類 → A/B/C 判定）を通す。
    //   ここで得られる候補はあくまで「未承認（inbox）」のまま提示し、
    //   DB 書き込み・ArticleFacts 登録・curationStatus 変更は一切行わない。
    step = Date.now()
    let digest: FinalCandidateDigest | null = null
    if (args.fetch) {
      try {
        const approvedIds = new Set(assessments.map((x) => x.discoveredContentId))
        const inboxPool = await assessInboxPool(payload, { now, statuses: ['inbox'], limit: 200 })
        const themesCfg = loadSelectThemesConfigFromEnv()
        const rec = selectRecommendedThemes(inboxPool.candidates, { now, config: themesCfg, enableTargetFitRanking: true })
        const supplementIds = [...rec.recommendedDcIds, ...rec.spare.map((e) => e.candidate.discoveredContentId)]
          .filter((id) => !approvedIds.has(id))
          .slice(0, 12)

        const supplemental: CandidateAssessment[] = []
        for (const dcId of supplementIds) {
          try {
            const dcRes = await payload.find({
              collection: 'discovered-content',
              where: { id: { equals: dcId } },
              limit: 1,
              depth: 1,
              overrideAccess: true,
            })
            const raw = dcRes.docs[0] as unknown as Record<string, unknown> | undefined
            if (!raw) continue
            const factsRes = await payload.find({
              collection: 'article-facts',
              where: { discoveredContent: { equals: dcId } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown> | undefined
            const dcLike = toDcLike(raw)

            const dr = dedupCheck(
              {
                id: dcId,
                articleUrl: dcLike.articleUrl ?? null,
                title: dcLike.title ?? null,
                eventStartAt: dcLike.eventStartAt ?? null,
                venue: dcLike.venue ?? null,
              },
              articleRecords,
              noteRecords,
            )
            const dedup = {
              duplicate: dr.duplicate,
              possibleDuplicate: dr.possibleDuplicate,
              existingArticleId: dr.existingArticleId,
              notePublished: dr.signals.some((s) => s.type.startsWith('note-record') && s.strong) || undefined,
              signalSummary: dr.signals.map((s) => s.detail),
              externalUnverified: true,
            }

            let dcHost = ''
            try {
              if (dcLike.articleUrl) dcHost = new URL(dcLike.articleUrl).hostname.toLowerCase()
            } catch {
              /* skip */
            }
            const trustedSource = dcHost !== '' && isAllowedHost(dcHost, allowedHosts)

            let signals: OfficialPageSignals | null = null
            if (!dedup.duplicate && dcLike.articleUrl) {
              const key = dcLike.articleUrl
              if (fetchCache.has(key)) {
                signals = fetchCache.get(key) ?? null
              } else {
                const used = perHostCount.get(dcHost) ?? 0
                if (dcHost && used >= args.maxPerHost) {
                  signals = {
                    requested: true,
                    ok: false,
                    fetchedAt: new Date().toISOString(),
                    rejectedReason: `同一ホストの取得本数上限（${args.maxPerHost}）に達したためスキップ`,
                    rejectedUrl: key,
                  }
                } else {
                  fetchMetrics.attempted++
                  if (dcHost) perHostCount.set(dcHost, used + 1)
                  try {
                    signals = await fetchOfficialSignals(key, {
                      allowedHosts,
                      connectTimeoutMs: args.connectTimeoutMs,
                      overallTimeoutMs: args.overallTimeoutMs,
                    })
                  } catch (e) {
                    signals = {
                      requested: true,
                      ok: false,
                      fetchedAt: new Date().toISOString(),
                      error: e instanceof Error ? e.message : String(e),
                    }
                  }
                  fetchCache.set(key, signals)
                  await sleep(300)
                }
                if (signals) {
                  if (signals.ok) {
                    fetchMetrics.success++
                    if (Array.isArray(signals.jsonLd) && signals.jsonLd.length > 0) fetchMetrics.jsonLd++
                  } else if (signals.rejectedReason) {
                    fetchMetrics.rejected++
                    fetchMetrics.rejectedList.push({ dcId, url: signals.rejectedUrl ?? key, reason: signals.rejectedReason })
                  } else if (signals.error && /タイムアウト/.test(signals.error)) {
                    fetchMetrics.timeout++
                  } else {
                    fetchMetrics.httpFail++
                  }
                }
              }
            }

            const classification = classifyFactKind({
              contentType: (raw.contentType as string | null) ?? dcLike.contentType ?? null,
              uxType: (raw.uxType as string | null) ?? dcLike.uxType ?? null,
              title: dcLike.title ?? null,
              excerpt: dcLike.excerpt ?? null,
              sourceType: sourceLedgerTypeById.get(Number(raw.sourceSite ?? (raw as Record<string, unknown>).source_site_id)) ?? null,
              officialSignals: signals,
            })
            const factKind = classification.factKind

            const a = assessCandidate({ dc: dcLike, facts: toFactsLike(factsDoc), dedup, imageInventory, now, factKind })
            a.factKind = factKind
            a.factKindClassification = classification

            const templateTypeCls = classifyTemplateType({
              factKind,
              contentType: (raw.contentType as string | null) ?? dcLike.contentType ?? null,
              uxType: (raw.uxType as string | null) ?? dcLike.uxType ?? null,
              title: dcLike.title ?? null,
              excerpt: dcLike.excerpt ?? null,
            })
            a.templateType = templateTypeCls.templateType

            if (factKind === 'event') {
              a.extraction = extractArticleFactsCandidate({ dc: dcLike, image: a.image, officialSignals: signals, trustedSource })
            } else if (factKind === 'product_news') {
              a.productExtraction = extractProductNewsFactsCandidate({ dc: dcLike, image: a.image, officialSignals: signals, trustedSource })
            }

            const facility = resolveFacilityKey({
              venue: dcLike.venue,
              sourceName: dcLike.sourceSiteName,
              sourceUrl: dcLike.articleUrl,
              title: dcLike.title,
            })
            const provisionalCategory = deriveProvisionalCategory({
              primaryCategory: (factsDoc?.primaryCategory as string | null) ?? null,
              title: dcLike.title,
              venue: dcLike.venue,
              templateType: a.templateType,
              contentType: dcLike.contentType,
            })
            a.digestMeta = {
              venue: dcLike.venue ?? null,
              officialFetch: signals
                ? {
                    requested: signals.requested,
                    ok: signals.ok,
                    httpStatus: signals.httpStatus,
                    fetchedAt: signals.fetchedAt,
                    rejectedReason: signals.rejectedReason,
                    error: signals.error,
                  }
                : null,
              priceHint: extractPriceHint(signals?.bodyText).price,
              facilityKey: facility.key,
              facilityLabel: facility.store || facility.area || '',
              category: provisionalCategory.category,
              categoryBasis: provisionalCategory.basis,
              publishedAt: factKind === 'event' ? (a.extraction?.fields.publishedAt ?? null) : null,
              origin: 'inbox-recommended',
            }
            supplemental.push(a)
          } catch {
            // この候補だけスキップ（既存方針どおり1件失敗で全体は止めない）
          }
        }

        digest = buildFinalCandidateDigest([...assessments, ...supplemental], {
          now,
          maxCandidates: 5,
          facilityCap: 2,
          minCategoriesTarget: 4,
        })
      } catch {
        // ダイジェスト生成に失敗しても、本体の 7:10 レポートは継続する
        digest = null
      }
    }
    mark('editorialDigest', step)

    // 5. レポート
    step = Date.now()
    const report = buildMorningReport(assessments, { now })
    mark('buildReport', step)

    const totalMs = Date.now() - t0
    const fetchRates = {
      attempted: fetchMetrics.attempted,
      successRate: fetchMetrics.attempted ? +(fetchMetrics.success / fetchMetrics.attempted).toFixed(3) : null,
      timeoutRate: fetchMetrics.attempted ? +(fetchMetrics.timeout / fetchMetrics.attempted).toFixed(3) : null,
      jsonLdRate: fetchMetrics.success ? +(fetchMetrics.jsonLd / fetchMetrics.success).toFixed(3) : null,
      httpFail: fetchMetrics.httpFail,
      rejected: fetchMetrics.rejected,
    }
    // ArticleFacts 登録サマリ
    const factsSummary = {
      enabled: args.registerFacts,
      mode: args.registerFacts ? (args.writeFacts ? 'write' : 'dry-run(差分のみ)') : 'off',
      wouldCreate: registerResults.filter((r) => r.action === 'would_create').length,
      wouldUpdate: registerResults.filter((r) => r.action === 'would_update').length,
      created: registerResults.filter((r) => r.action === 'created').length,
      updated: registerResults.filter((r) => r.action === 'updated').length,
      unchanged: registerResults.filter((r) => r.action === 'unchanged').length,
      skipped: registerResults.filter((r) => r.action === 'skipped').length,
    }
    const factKindCounts = {
      event: assessments.filter((x) => x.factKind === 'event').length,
      product_news: assessments.filter((x) => x.factKind === 'product_news').length,
      unknown: assessments.filter((x) => x.factKind === 'unknown').length,
    }
    const digestSummary = digest
      ? {
          enabled: true,
          evaluatedCount: digest.evaluatedCount,
          finalCount: digest.candidates.length,
          shortfall: digest.shortfall,
          excludedCount: digest.excluded.length,
          categoriesUsed: digest.diversitySummary.categoriesUsed,
          achievedDiversity: digest.diversitySummary.achievedDiversity,
          finalDcIds: digest.candidates.map((c) => c.discoveredContentId),
        }
      : { enabled: false, reason: args.fetch ? 'ダイジェスト生成に失敗（本体レポートは継続）' : '--fetch なしのため生成していません' }
    const machine = {
      dateStr,
      assessed: report.assessed,
      counts: report.counts,
      factKindCounts,
      topAIds: report.topA.map((a) => a.discoveredContentId),
      aShortfall: report.aShortfall,
      collection: { done: coll.done, detail: coll.detail },
      fetch: { ...fetchMetrics, rates: fetchRates },
      articleFacts: factsSummary,
      editorialDigest: digestSummary,
      timingsMs: { ...timings, total: totalMs },
    }
    const factsLine = args.registerFacts
      ? `${factsSummary.mode}: would_create=${factsSummary.wouldCreate} would_update=${factsSummary.wouldUpdate} created=${factsSummary.created} updated=${factsSummary.updated} unchanged=${factsSummary.unchanged} skipped=${factsSummary.skipped}`
      : 'off（--register-facts なし。DB 書き込みなし）'
    const factsDiffLines = registerResults
      .filter((r) => r.action === 'would_create' || r.action === 'would_update' || r.action === 'created' || r.action === 'updated')
      .map(
        (r) =>
          `    - DC #${r.discoveredContentId} [${r.action}] facts=${r.provenanceCount}件 ${r.diff
            .map((d) => `${d.field}: ${JSON.stringify(d.before)}→${JSON.stringify(d.after)}`)
            .join(' ; ')}`,
      )
      .join('\n')
    const fetchLine = args.fetch
      ? `有効: attempted=${fetchMetrics.attempted} success=${fetchMetrics.success} httpFail=${fetchMetrics.httpFail} timeout=${fetchMetrics.timeout} rejected=${fetchMetrics.rejected} / 成功率=${fetchRates.successRate ?? '-'} timeout率=${fetchRates.timeoutRate ?? '-'} JSON-LD率=${fetchRates.jsonLdRate ?? '-'} / 許可ホスト=${fetchMetrics.allowedHostCount}`
      : args.fetchDisabledByEnv
        ? '無効（MORNING_FETCH=0 で緊急停止中・外部リクエスト 0 件）'
        : '無効（--fetch なし・外部リクエスト 0 件・追加課金 0 円）'
    const rejectedLines = fetchMetrics.rejectedList
      .map((r) => `    - DC #${r.dcId}: ${r.reason}（${r.url}）`)
      .join('\n')

    const digestText = digest
      ? renderFinalCandidateDigest(digest)
      : `\n（記事生成レディ最終候補ダイジェスト: ${args.fetch ? 'ダイジェスト生成に失敗したため今回は非表示（本体の7:10レポートには影響なし）' : '--fetch なしのため生成していません（./p2 morning は既定で --fetch 付き）'}）\n`

    // 6. 書き出し（.devlogs のみ。DB ではない。ArticleFacts の実書き込みは --write-facts のときだけ別途）
    let reportPath = '(未保存: --no-write)'
    if (args.write) {
      mkdirSync(outDir, { recursive: true })
      const factKindLine = `event=${factKindCounts.event} / product_news=${factKindCounts.product_news} / unknown=${factKindCounts.unknown}（記事タイプ分類ゲート。event のみ event 用 ArticleFacts へ）`
      const txt =
        renderMorningReport(report) +
        `\n[preflight] ${pre.join(' / ')}` +
        `\n[collection] ${coll.done ? '完了' : '未完了'} — ${coll.detail}` +
        `\n[factkind] ${factKindLine}` +
        `\n[fetch] ${fetchLine}` +
        (rejectedLines ? `\n[fetch-rejected]\n${rejectedLines}` : '') +
        `\n[articlefacts] ${factsLine}` +
        (factsDiffLines ? `\n[articlefacts-diff]\n${factsDiffLines}` : '') +
        `\n[timings ms] ${JSON.stringify(machine.timingsMs)}` +
        `\n[machine] ${JSON.stringify(machine)}\n\n` +
        digestText
      writeFileSync(resolve(outDir, 'report.txt'), txt)
      writeFileSync(resolve(outDir, 'report.json'), JSON.stringify({ report, machine, preflight: pre, digest }, null, 2))
      reportPath = `.devlogs/morning/${dateStr}/report.txt`
      if (digest) writeFileSync(resolve(outDir, 'editorial-digest.txt'), digestText)
      // 監査ログ（追記。差分と根拠を残す）
      if (args.registerFacts && factsAudit.length > 0) {
        const line = factsAudit.map((e) => JSON.stringify(e)).join('\n') + '\n'
        appendFileSync(resolve(outDir, 'articlefacts-audit.jsonl'), line)
      }
    }

    // 7. 出力
    if (args.json) {
      console.log(JSON.stringify({ report, machine, digest }))
    } else {
      console.log(renderMorningReport(report))
      console.log(`[preflight] ${pre.join(' / ')}`)
      console.log(`[collection] ${coll.done ? '✅ 完了' : '⚠️ 未完了'} — ${coll.detail}`)
      console.log(`[factkind] event=${factKindCounts.event} / product_news=${factKindCounts.product_news} / unknown=${factKindCounts.unknown}`)
      console.log(`[fetch] ${fetchLine}`)
      if (rejectedLines) console.log(`[fetch-rejected]\n${rejectedLines}`)
      console.log(`[articlefacts] ${factsLine}`)
      if (factsDiffLines) console.log(`[articlefacts-diff]\n${factsDiffLines}`)
      console.log(`[timings ms] ${JSON.stringify(machine.timingsMs)}`)
      console.log(`[saved] ${reportPath}`)
      console.log(`[machine] ${JSON.stringify(machine)}`)
      console.log(digestText)
    }

    releaseLock()
    process.exit(0)
  } catch (err) {
    releaseLock()
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
    process.exit(1)
  }
}

main()
