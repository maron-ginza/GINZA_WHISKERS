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
import { resolveBusinessDate } from '../lib/util/businessDate'
import { assessCandidate } from '../lib/morning/assessCandidate'
import { buildMorningReport, renderMorningReport } from '../lib/morning/buildMorningReport'
import { buildFinalCandidateDigest, renderFinalCandidateDigest } from '../lib/morning/buildFinalCandidateDigest'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { classifyTemplateType } from '../lib/morning/classifyTemplateType'
import { excludeNonArticleCandidate } from '../lib/morning/excludeNonArticleCandidate'
import { buildTemplatePrecheck } from '../lib/morning/templatePrecheck'
import { extractProductNewsFactsCandidate } from '../lib/morning/extractProductNewsFacts'
import { extractPriceHint } from '../lib/morning/extractPriceHint'
import {
  dedupCheck,
  normalizeVenueKey,
  checkRecentBrandVenueDuplicate,
  type DedupArticleRecord,
  type DedupNoteRecord,
} from '../lib/morning/dedupCheck'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { fetchOfficialSignals, isAllowedHost } from '../lib/morning/fetchOfficialSignals'
import { toFactsLike } from '../lib/morning/toFactsLike'
import {
  createOrUpdateArticleFactsFromCandidate,
  type ArticleFactsRow,
  type ArticleFactsStore,
  type ArticleFactsWrite,
  type RegisterResult,
} from '../lib/morning/registerArticleFacts'
import type { CandidateAssessment, FinalCandidateDigest, OfficialPageSignals, SourceAvailability } from '../lib/morning/types'
import type { DiscoveredContentLike } from '../lib/template/mapDiscoveredContentToEventFields'
import { resolveFacilityKey } from '../lib/curation/facilityKey'
import {
  buildFacilityActivityFromArticles,
  buildFacilityActivityFromApproved,
  buildFacilityActivityFromNoteDrafts,
  buildFacilityActivityFromPastMorning,
  checkAlreadyProcessedByPastMorning,
  checkFacilityCooldown,
  type FacilityActivityRecord,
  type RawArticleActivity,
  type RawApprovedActivity,
  type RawNoteDraftActivity,
  type RawPastMorningActivity,
} from '../lib/morning/facilityActivityHistory'
import { deriveProvisionalCategory, isCategoryResolved } from '../lib/pipeline/provisionalCategory'
import { deriveAutoArticleFacts } from '../lib/morning/autoArticleFacts'
import { assessInboxPool } from '../lib/pipeline/assessInboxPool'
import { selectRecommendedThemes, loadSelectThemesConfigFromEnv } from '../lib/pipeline/selectRecommendedThemes'
import { collectUsedDcIds, type MorningSelectionRecord } from '../lib/morning/selectionRecord'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * ready な ArticleFacts doc から会場補完のフォールバック値を取り出す（2026-09-10）。
 * DigestMeta.factsVenue* へ写し、buildFinalCandidateDigest が digestMeta.venue の
 * 補完（会場解決）に使う。ready 以外は確定情報として扱わずすべて null を返す
 * （A/B/C 判定は event/product_news で factsSource==='ready' を必須にするため、
 *  verdict==='A' の候補はここが埋まる）。
 */
function readyFactsVenueParts(
  factsDoc: Record<string, unknown> | undefined,
): { place: string | null; name: string | null; areaLead: string | null } {
  if (!factsDoc || String(factsDoc.enrichmentStatus ?? '') !== 'ready') {
    return { place: null, name: null, areaLead: null }
  }
  const f = toFactsLike(factsDoc)
  const v0 = Array.isArray(f?.venues) ? f?.venues?.[0] : null
  const clean = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null)
  return { place: clean(v0?.place), name: clean(v0?.name), areaLead: clean(f?.areaLead) }
}

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
  /** 業務日付の明示指定（--date=YYYY-MM-DD）。未指定なら Asia/Tokyo の当日 */
  date?: string
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
    date: (argv.find((a) => a.startsWith('--date=')) ?? '').split('=')[1] || undefined,
  }
}

// ── Payload doc → プレーン値（templateCheck.ts / morningCandidates と同型） ──
// 【2026-09-16続き6・マロン指示】Stage 5（morningDraftSelected.ts）が
// DiscoveredContent 生データ → DiscoveredContentLike 変換を再利用するために export した
// （二重実装しない。ロジック自体は無変更）。
export function toDcLike(dc: Record<string, unknown>): DiscoveredContentLike {
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
    curationStatus: (dc.curationStatus as string | null) ?? null,
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
): Promise<{
  allowedHosts: string[]
  typeById: Map<number, string>
  /**
   * 【2026-09-17追加・マロン指示：取得障害時の安全動作】healthStatus='unreachable'
   * （確認済みの取得不能。既定値'unknown'＝未確認は含めない）の情報源一覧。
   * 候補ボード・7:10レポートに「取得失敗した公式収集元」として表示し、
   * 「該当情報0件」と「収集元へ到達できず確認不能」を区別するために使う。
   * 取得失敗を理由に既存の有効なA候補を削除・降格することはしない
   * （この一覧は表示専用・A/B/C判定には使わない）。
   */
  unavailableSources: SourceAvailability[]
}> {
  const hosts = new Set<string>()
  const typeById = new Map<number, string>()
  const unavailableSources: SourceAvailability[] = []
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
      // 【2026-09-17】healthStatusの既定値は'unknown'（未確認・専用の取得経路を
      // 持たない一般crawl対象サイトの通常状態）——これは失敗ではない。表示するのは
      // 確認済みの取得不能（'unreachable'）のみ（推測で「未確認」まで警告扱いしない）。
      const healthStatus = d.healthStatus as string | undefined
      if (healthStatus === 'unreachable') {
        unavailableSources.push({
          sourceId: String(d.sourceId ?? ''),
          name: String(d.name ?? d.sourceId ?? '（名称未登録）'),
          healthStatus,
          healthCheckedAt: (d.healthCheckedAt as string | null) ?? null,
          healthNote: (d.healthNote as string | null) ?? null,
        })
      }
    }
  } catch {
    /* コレクション未定義でも継続（＝許可リスト空＝全 URL 拒否） */
  }
  return { allowedHosts: [...hosts], typeById, unavailableSources }
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
// 2026-09-14（マロン指示）：dailySecondCandidates.ts から同じ dedup ロジック
// （dedupCheck.ts）をそのまま再利用するため export する（ロジック自体は無変更）。
export async function loadArticleRecords(
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
    const venueHints: string[] = []
    for (const p of prov) {
      const dcId = Number(p.discoveredContentSource)
      if (Number.isInteger(dcId) && dcId > 0) dcIds.push(dcId)
      if (typeof p.sourceUrl === 'string') urls.push(p.sourceUrl)
      // 2026-09-15追加（近似重複ルール2用）：factType==='venue' の事実文から会場・ブランド
      // 識別子を抽出する（createDraftFromArticleFactsがArticleFacts.venuesから
      // 「会場：{place} {name}」形式で書き込む値、と同じ正規化を適用）。
      if (p.factType === 'venue' && typeof p.fact === 'string') {
        const key = normalizeVenueKey(p.fact)
        if (key) venueHints.push(key)
      }
    }
    // 直近性の基準日時：publishHistory の note 公開日（最新）を優先、無ければ updatedAt。
    const publishHistory = Array.isArray(a.publishHistory) ? (a.publishHistory as Array<Record<string, unknown>>) : []
    const notePublishDates = publishHistory
      .filter((p) => p.channel === 'note' && typeof p.publishedAt === 'string')
      .map((p) => p.publishedAt as string)
      .sort()
    const recentDate = notePublishDates.length > 0 ? notePublishDates[notePublishDates.length - 1] : ((a.updatedAt as string | null) ?? null)
    out.push({
      id: Number(a.id),
      title: (a.title as string | null) ?? null,
      provenanceDcIds: [...new Set(dcIds)],
      provenanceSourceUrls: [...new Set(urls)],
      eventDates: [],
      venueHints: [...new Set(venueHints)],
      recentDate,
      createdAt: (a.createdAt as string | null) ?? null,
    })
  }
  return out
}

/** .devlogs/night/queue 配下の note-draft.json / note-body.txt を dedup 用レコードへ（ローカル記録のみ） */
export function buildNoteRecords(): DedupNoteRecord[] {
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

// ── 施設単位の14日間クールダウン・使用済み候補の自動除外（2026-09-16追加・マロン指示） ──
//    大前提：マロンによる投稿済み設定・施設設定・手動台帳登録を一切前提にしない。
//    Project 02 内の既存データ（note-draft.json の フォルダ日付・過去の朝刊レポート
//    report.json）だけから機械的に導く。

/** note-draft.json（buildNoteRecords の path から日付を取り出す）を施設活動レコードへ変換する材料に */
export function buildNoteDraftActivityInputs(noteRecords: DedupNoteRecord[]): RawNoteDraftActivity[] {
  const out: RawNoteDraftActivity[] = []
  for (const n of noteRecords) {
    if (n.kind !== 'note-draft') continue
    // path 例： .devlogs/night/queue/2026-09-11/63/note-draft.json
    const m = n.path.match(/queue\/(\d{4}-\d{2}-\d{2})\//)
    out.push({
      path: n.path,
      venue: n.venue,
      sourceUrl: n.sourceUrls[0] ?? null,
      date: m ? `${m[1]}T00:00:00.000Z` : null,
    })
  }
  return out
}

/**
 * 【2026-09-16続き5改訂・マロン指示：V1 5段階責任分離】.devlogs/morning/<YYYY-MM-DD>/
 * selection.json（日付名ディレクトリのみ）を読み、①過去に実際にマロンが選定した
 * （＝Stage 4 の選定記録に picks として残っている）DC ID集合と②施設活動レコード材料を
 * 返す（読み取り専用・DB非依存）。
 *
 * 【重要】旧実装は report.json の topA/topPresentable（＝候補ボードに表示されただけの
 * 候補）を「既処理」とみなしていたが、これは「本日選ばれなかったAは翌日も候補ボードへ
 * 残る」という新方針と矛盾するため撤廃した。「使用済み」とみなすのは selection.json に
 * 実際に記録された選定（マロンが選んだ3本）のみ。checkAlreadyProcessedByPastMorning /
 * buildFacilityActivityFromPastMorning（facilityActivityHistory.ts）は既存のまま
 * 再利用し、渡すデータソースだけをここで差し替える。
 */
export function loadPastMorningActivity(withinDays = 400): {
  dcIds: Set<number>
  raw: RawPastMorningActivity[]
  records: MorningSelectionRecord[]
} {
  const records: MorningSelectionRecord[] = []
  const raw: RawPastMorningActivity[] = []
  const root = resolve(process.cwd(), '..', '.devlogs', 'morning')
  if (!existsSync(root)) return { dcIds: new Set(), raw, records }
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000
  let dirs: string[]
  try {
    dirs = readdirSync(root)
  } catch {
    return { dcIds: new Set(), raw, records }
  }
  for (const d of dirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue // 日付名ディレクトリのみ（auto/brief等を除外）
    const selPath = resolve(root, d, 'selection.json')
    if (!existsSync(selPath)) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(selPath, 'utf8'))
    } catch {
      continue
    }
    const rec = parsed as MorningSelectionRecord
    if (!rec || !Array.isArray(rec.picks)) continue
    const t = Date.parse(rec.selectedAt ?? '')
    // 選定は時間窓なしで恒久的に「使用済み」扱いにする方針だが、ディレクトリ走査の
    // スコープだけは withinDays（既定400日）で区切る（性能上のスコープ限定であり、
    // 「クールダウン14日」等の意味的な時間窓とは別）。
    if (!Number.isNaN(t) && t < cutoff) continue
    records.push(rec)
    for (const p of rec.picks) {
      if (!Number.isInteger(p.discoveredContentId) || p.discoveredContentId <= 0) continue
      raw.push({
        discoveredContentId: p.discoveredContentId,
        sourceName: null,
        sourceUrl: p.sourceUrl ?? null,
        venue: p.facilityLabel ?? null,
        generatedAt: rec.selectedAt ?? `${d}T00:00:00.000Z`,
      })
    }
  }
  return { dcIds: collectUsedDcIds(records), raw, records }
}

/** 承認済み（approved）DiscoveredContent から施設活動レコード材料を作る（既に取得済みの approved.docs を再利用） */
export function buildApprovedActivityInputs(docs: Array<Record<string, unknown>>): RawApprovedActivity[] {
  const out: RawApprovedActivity[] = []
  for (const raw of docs) {
    if (raw.curationStatus !== 'approved') continue
    const ss = raw.sourceSite
    const sourceName =
      ss && typeof ss === 'object' ? ((ss as { name?: string | null }).name ?? null) : ((ss as string | null) ?? null)
    out.push({
      discoveredContentId: Number(raw.id),
      venue: (raw.venue as string | null) ?? null,
      sourceName,
      sourceUrl: (raw.articleUrl as string | null) ?? null,
      decisionAt: (raw.decisionAt as string | null) ?? null,
    })
  }
  return out
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
  // 業務日付＝Asia/Tokyo の暦日（--date= 指定時はそれを優先）。UTC 切り出しはしない。
  const dateStr = resolveBusinessDate(args.date ?? null, now)
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

    // 3. 承認前（inbox）＋承認済み（approved）DiscoveredContent ＋ 重複判定用データ ＋ 許可ドメイン
    //    【2026-09-14変更・マロン指示】候補抽出・事実評価・18カテゴリー分類の対象から
    //    curationStatus=approved 限定条件を完全に外した（根本原因の確定を受けた修正）。
    //    マロン承認は、ここで評価された候補を記事生成・CMS保存へ進める条件としてのみ
    //    使う（この読み込み自体はrejectedのみを除外し、inbox/approved両方を評価する）。
    step = Date.now()
    const imageInventory = await buildImageInventory(payload)
    const { allowedHosts, typeById: sourceLedgerTypeById, unavailableSources } = await buildSourceLedgerMaps(payload)
    const articleRecords = await loadArticleRecords(payload)
    const noteRecords = buildNoteRecords()
    // 【2026-09-17改訂・マロン指示：朝処理の統合】候補ボードを「更新日時順の直近N件」で
    // 打ち切らない——DB側でcurationStatus（inbox/approved）だけを条件抽出し、残り全件を
    // ページングして読み込む（取得上限による切り捨てをしない）。現在性（開催終了済みか）の
    // 判定は既存のassessCandidate側（isPastEventEnd、日付なしの候補も含めて扱う既存ロジック）
    // に委ねる——DB側で終了日フィルタを重ねると、日付のみ格納・時刻情報なしの候補を
    // 誤って過剰除外するリスクがあるため、ここでは行わない。
    // --limit=N が明示指定された場合のみ、手動テスト用に総件数をその値で打ち切る
    // （既定値50は「打ち切り」の意味を持たなくなったため、未指定時は打ち切らない）。
    const limitExplicitlySet = process.argv.some((a) => a.startsWith('--limit='))
    const PAGE_SIZE = 200
    const approvedDocs: Array<Record<string, unknown>> = []
    {
      let page = 1
      for (;;) {
        const batch = await payload.find({
          collection: 'discovered-content',
          where: { curationStatus: { in: ['inbox', 'approved'] } },
          limit: PAGE_SIZE,
          page,
          depth: 1,
          overrideAccess: true,
          sort: '-updatedAt',
        })
        approvedDocs.push(...(batch.docs as unknown as Array<Record<string, unknown>>))
        if (limitExplicitlySet && approvedDocs.length >= args.limit) break
        if (!batch.hasNextPage || batch.docs.length === 0) break
        page += 1
      }
    }
    const approved = {
      docs: limitExplicitlySet ? approvedDocs.slice(0, args.limit) : approvedDocs,
      totalDocs: approvedDocs.length,
    }
    mark('loadApproved', step)

    // 3.5 施設単位の14日間クールダウン・使用済み候補の自動除外（2026-09-16追加・マロン指示）。
    //     マロンによる投稿済み設定・施設設定・手動台帳登録は一切前提にせず、Project 02 内の
    //     既存データ（Articles・承認済みDC・note-draft.json・過去の朝刊report.json）だけから
    //     機械的に導く。
    const pastMorning = loadPastMorningActivity()
    const articleActivityInputs: RawArticleActivity[] = articleRecords.map((a) => ({
      articleId: a.id,
      sourceUrl: a.provenanceSourceUrls[0] ?? null,
      venueHint: a.venueHints[0] ?? null,
      date: a.createdAt ?? a.recentDate ?? null,
    }))
    const approvedActivityInputs: RawApprovedActivity[] = buildApprovedActivityInputs(
      approved.docs as unknown as Array<Record<string, unknown>>,
    )
    const noteDraftActivityInputs: RawNoteDraftActivity[] = buildNoteDraftActivityInputs(noteRecords)
    const facilityHistory: FacilityActivityRecord[] = [
      ...buildFacilityActivityFromArticles(articleActivityInputs),
      ...buildFacilityActivityFromApproved(approvedActivityInputs),
      ...buildFacilityActivityFromNoteDrafts(noteDraftActivityInputs),
      ...buildFacilityActivityFromPastMorning(pastMorning.raw),
    ]

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

        // --- 対象外ページの決定的除外（2026-09-14追加・マロン指示） ---
        //   一覧ページ／カテゴリーページ／アーカイブ／検索結果／共通案内／システム告知／
        //   My account／通信販売トップ／本文を確認できないページ、を記事タイプ分類より
        //   前に除外する。URL構造とタイトルは信頼できる情報源としてそのまま使うが、
        //   excerptがナビ・メニュー文言のみで実質空のときは「本文を確認できない」として
        //   除外する（推測補完しない）。除外された候補はCとして理由つきで残す。
        const excl = excludeNonArticleCandidate({
          sourceName: dcLike.sourceSiteName ?? null,
          url: dcLike.articleUrl ?? null,
          venue: dcLike.venue ?? null,
          title: dcLike.title ?? null,
          excerpt: dcLike.excerpt ?? null,
          contentType: dcLike.contentType ?? null,
          uxType: dcLike.uxType ?? null,
        })
        if (excl.excluded) {
          assessments.push({
            discoveredContentId: dcId,
            title: dcLike.title ?? `DiscoveredContent #${dcId}`,
            displayTitle: (dcLike.title ?? `DiscoveredContent #${dcId}`).split(/\s*\|\s*/)[0],
            sourceName: dcLike.sourceSiteName ?? '',
            sourceUrl: dcLike.articleUrl ?? '',
            verdict: 'C',
            reasons: [`候補対象外（${excl.pageKind}）: ${excl.reasons.join(' ／ ')}`],
            verifiedItems: [],
            missing: [],
            unconfirmed: [],
            dedup: { duplicate: false },
            expired: false,
            ginzaRelevant: false,
            hasTraceableSource: false,
            factKind: 'unknown',
            factsSource: 'none',
            templateEligible: false,
            image: { available: false, policy: '画像なし（候補対象外のため未評価）', externalImageProhibited: true },
            eventPeriod: '不明',
            applyDeadline: '不明',
            estimateMinutes: 0,
          })
          continue
        }

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
                  fetchVenueDetail: true,
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
          // 【2026-09-14修正・マロン指示】url/sourceName/venueが未指定だとclassifySourcePageType
          // が常にpageKind='unknown'を返し、既存のURL構造ベースの個別記事判定が実質機能して
          // いなかった（根本原因の一つ）。assessInboxPool.tsと同じ呼び出し方に揃える。
          url: dcLike.articleUrl ?? null,
          sourceName: dcLike.sourceSiteName ?? null,
          venue: dcLike.venue ?? null,
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

        // --- 近似重複ルール2（2026-09-15追加・マロン指示）：直近14日以内の同一ブランド・
        //     同一会場の既投稿記事があればAへ昇格させない（除外はしない・B保留の根拠のみ）。
        const candidateVenues = Array.isArray((factsDoc as Record<string, unknown> | undefined)?.venues)
          ? ((factsDoc as Record<string, unknown>).venues as Array<{ name?: string | null; place?: string | null }>)
          : []
        const candidateVenueKey = normalizeVenueKey(candidateVenues[0]?.place, candidateVenues[0]?.name)
        const recentBrandVenueDuplicate = checkRecentBrandVenueDuplicate(candidateVenueKey, articleRecords, now)

        // 施設単位の14日間クールダウン（2026-09-16続き3追加・2026-09-17改訂）：
        // 【2026-09-17改訂・マロン指示】A/B/C判定には使わない——候補ボード上の
        // 注意情報（facilityNotice）としてのみ assessCandidate.ts へ渡す。
        // digestMeta用の resolveFacilityKey 呼び出しをここへ前倒しし、同じ facility を
        // digestMeta 側でも再利用する（二重実装・二重計算をしない）。
        const facility = resolveFacilityKey({
          venue: dcLike.venue,
          sourceName: dcLike.sourceSiteName,
          sourceUrl: dcLike.articleUrl,
          title: dcLike.title,
        })
        const facilityCooldownRaw = checkFacilityCooldown(facility.key, facility.parentFacilityKey, facilityHistory, now)
        // 表示用に親施設名・一致した過去活動の詳細（記事IDを含む）を補って渡す
        // （assessCandidate.ts はこれを facilityNotice へそのまま写すだけ・A/B/C判定には使わない）。
        const facilityCooldown = {
          ...facilityCooldownRaw,
          parentFacilityLabel: facility.parentFacilityLabel ?? facility.store ?? facility.area ?? null,
          matched: facilityCooldownRaw.matched
            ? {
                date: facilityCooldownRaw.matched.date,
                facilityLabel: facilityCooldownRaw.matched.facilityLabel,
                articleId: facilityCooldownRaw.matched.articleId,
                source: facilityCooldownRaw.matched.source,
              }
            : null,
        }

        // --- ArticleFacts 自動導出・自動ready化（2026-09-16続き7追加・マロン指示：
        //     A判定とArticleFactsの矛盾を解消） ---
        //   DC保存済みの公式情報だけから決定論的に導出する（autoArticleFacts.ts・
        //   推測しない）。既にready済みのArticleFactsは一切変更しない（人間が
        //   確認済みのready状態を上書きしない）。enteredBy／humanReviewedAt が
        //   設定済み（＝人間が既に触れた行）も上書きしない——このスクリプトは
        //   「人間の入力を前提にしない新規導出」だけを行い、既存の人間操作を
        //   自動生成で消さない。--no-write のときは書き込まず（読み取り専用実行を
        //   維持）、factsDoc は既存のまま assessCandidate へ渡す——この場合
        //   factsSource!=='ready' な候補は articleFactsNotReady で B になる
        //   （推測でAにしない）。
        let effectiveFactsDoc = factsDoc
        let articleFactsAutoMissing: string[] | undefined
        const factsTouchedByHuman = !!factsDoc?.enteredBy || !!factsDoc?.humanReviewedAt
        if (args.write && String(factsDoc?.enrichmentStatus ?? '') !== 'ready' && !factsTouchedByHuman) {
          const autoCategory = deriveProvisionalCategory({
            title: dcLike.title,
            venue: dcLike.venue,
            contentType: dcLike.contentType,
          }).category
          const auto = deriveAutoArticleFacts({
            title: dcLike.title ?? null,
            articleUrl: dcLike.articleUrl ?? null,
            eventStartAt: dcLike.eventStartAt ?? null,
            eventEndAt: dcLike.eventEndAt ?? null,
            category: autoCategory,
          })
          if (auto.eligible && auto.payload) {
            try {
              const updatedDoc =
                factsDoc?.id != null
                  ? await payload.update({
                      collection: 'article-facts',
                      id: factsDoc.id as string | number,
                      data: auto.payload as never,
                      overrideAccess: true,
                      context: { autoReadyFromSavedDcFacts: true },
                    })
                  : await payload.create({
                      collection: 'article-facts',
                      data: { discoveredContent: dcId, ...auto.payload } as never,
                      overrideAccess: true,
                      context: { autoReadyFromSavedDcFacts: true },
                    })
              effectiveFactsDoc = updatedDoc as unknown as Record<string, unknown>
              factsAudit.push({
                at: now.toISOString(),
                kind: 'autoArticleFacts',
                discoveredContentId: dcId,
                status: 'ready',
                derivedFrom: auto.derivedFrom,
              })
            } catch (err) {
              // evaluateReadyGate 等での reject。推測せず未readyのまま次へ進める（B）。
              const msg = err instanceof Error ? err.message : String(err)
              articleFactsAutoMissing = [msg]
              factsAudit.push({
                at: now.toISOString(),
                kind: 'autoArticleFacts',
                discoveredContentId: dcId,
                status: 'rejected',
                error: msg,
              })
            }
          } else {
            articleFactsAutoMissing = auto.missing
            factsAudit.push({
              at: now.toISOString(),
              kind: 'autoArticleFacts',
              discoveredContentId: dcId,
              status: 'ineligible',
              missing: auto.missing,
            })
          }
        }

        const a = assessCandidate({
          dc: dcLike,
          facts: toFactsLike(effectiveFactsDoc),
          articleFactsAutoMissing,
          dedup,
          imageInventory,
          now,
          factKind,
          officialFetchOutcome: signals?.fetchOutcome ?? (signals ? (signals.ok ? 'ok' : 'unknown') : undefined),
          recentBrandVenueDuplicate,
          alreadyProcessed: checkAlreadyProcessedByPastMorning(dcId, pastMorning.dcIds),
          facilityCooldown,
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
          // 【2026-09-14修正】classifyFactKindと同じ理由でurl/sourceName/venueを渡す。
          url: dcLike.articleUrl ?? null,
          sourceName: dcLike.sourceSiteName ?? null,
          venue: dcLike.venue ?? null,
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
        //   provisionalCategory はこのブロックの外（下の ArticleFacts 自動登録）でも使う
        //   （2026-09-07 根本改善：basis==='title' の決定的キーワード一致のときだけ auto-fill する）。
        const provisionalCategory = deriveProvisionalCategory({
          primaryCategory: (factsDoc?.primaryCategory as string | null) ?? null,
          title: dcLike.title,
          venue: dcLike.venue,
          templateType: a.templateType,
          contentType: dcLike.contentType,
        })
        {
          // facility は近似重複・施設クールダウン判定用に既に上で計算済み（再利用・二重計算しない）。
          const rfv = readyFactsVenueParts(factsDoc)
          a.digestMeta = {
            venue: dcLike.venue ?? null,
            factsVenuePlace: rfv.place,
            factsVenueName: rfv.name,
            factsAreaLead: rfv.areaLead,
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
            parentFacilityKey: facility.parentFacilityKey,
            parentFacilityLabel: facility.parentFacilityLabel,
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
        //   ・primaryCategory は原則機械推測しない。ただし 2026-09-07 根本改善：
        //     deriveProvisionalCategory の basis==='title'（タイトル/会場に明記された語からの
        //     決定的一致。isCategoryResolved が true を返す唯一の自動判定）のときだけ auto-fill する
        //     （basis==='templateType' の弱い推定は書かない＝マロンが admin で確定）。
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
                primaryCategory: isCategoryResolved(provisionalCategory.basis) ? provisionalCategory.category : null,
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
                      fetchVenueDetail: true,
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

            const a = assessCandidate({
              dc: dcLike,
              facts: toFactsLike(factsDoc),
              dedup,
              imageInventory,
              now,
              factKind,
              officialFetchOutcome: signals?.fetchOutcome ?? (signals ? (signals.ok ? 'ok' : 'unknown') : undefined),
            })
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
            const rfv = readyFactsVenueParts(factsDoc)
            a.digestMeta = {
              venue: dcLike.venue ?? null,
              factsVenuePlace: rfv.place,
              factsVenueName: rfv.name,
              factsAreaLead: rfv.areaLead,
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
              parentFacilityKey: facility.parentFacilityKey,
              parentFacilityLabel: facility.parentFacilityLabel,
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
    const report = buildMorningReport(assessments, { now, usedDcIds: pastMorning.dcIds, unavailableSources })
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

// 2026-09-14（マロン指示対応、実機発見）：他スクリプト（dailySecondCandidates.ts等）が
// loadArticleRecords/buildNoteRecordsをexport経由で再利用するためimportしたところ、
// このファイルがCLIとして直接実行されたとき以外（＝importされただけ）でもmain()が
// 無条件に走り、6:00時点のスナップショットであるべき.devlogs/morning/<date>/report.txt
// を現在のDB状態で上書きしてしまう事故が実際に発生した。他の全スクリプトと同じ
// 「CLIとして直接実行されたときだけmain()を呼ぶ」ガードに揃える（動作そのものは
// 無変更——直接実行時の挙動は従来どおり）。
if (import.meta.url === `file://${process.argv[1]}`) main()
