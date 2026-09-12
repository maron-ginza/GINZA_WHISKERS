// GINZA WHISKERS / Project 02（2026-09-11、2026-09-12改訂）
// — 既公開テーマ台帳のロード（DB ＝ 主経路 ＋ 作業記録 ＋ 補助台帳）。
//
// 【主経路（自動照合）】は DB。候補生成のたびに以下を必ず突き合わせる：
//   ・DB `articles.publishHistory`（channel='note'）＝loadDbPublishedThemes()
//   ・`.devlogs/night/queue/*/*/note-draft.json`（publishRecord に url / state='公開完了'）
//   ・`.devlogs/manual-drafts/*/note-draft.json`（published:true / publishRecord あり）
// これらはいずれも「このシステム自身の記録」から機械的に導出され、コード変更なしに
// 新しい公開が増えるたびに自動で反映される。
//
// 【補助台帳（PUBLISHED_REGISTRY）】は、上記の自動照合では検知できない――つまり
// このシステムの外（別ルート・手動投稿等）で公開され、DB にも `.devlogs` にも
// 一切の記録が残っていない――既公開テーマのための、最後の安全網。2026-09-12、
// マロンから「MANUAL_PUBLISHED_SEEDは緊急用の補助に限定してほしい。今後も手動
// 登録漏れが起こり得る」との指摘を受け、この配列を TypeScript ソースへの
// 直書き（コード変更が必要）から、git管理のJSON台帳
// （`publishedRegistry.json`）＋追記専用CLI（`./p2 publishlog add`、
// `appendPublishedRegistryEntry()`）へ切り替えた。台帳への追記はコード変更を
// 伴わない運用作業として行える。ただし性質は変わらない――ここに載るのは
// 「このシステムでは自動検知できなかった」ケースであり、本来は根本対策
// （note転記時に必ず `publishHistory` を残す運用の徹底）で件数を減らすべき
// 補助手段である。
//
// 2026-09-12現在、DC#352・#246・#365 は `curationStatus=inbox`（承認すら
// されていない）のままDB上に残っており、Article化・publishHistory記録の
// いずれも存在しない。これは「自動照合ロジックの不備」ではなく「この3件が
// そもそもこのシステムのDiscoveredContent承認フローを経由せず公開された」
// ことを示す――DB外の行為はDBでは原理的に検知できないため、この種のケースは
// 今後もPUBLISHED_REGISTRYへの手動登録が唯一の対処法になる。

import type { Payload } from 'payload'
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PublishedTheme } from './publishedThemes'

const NOTE_URL_RE = /https:\/\/note\.com\/ginza_whiskers\/n\/[a-z0-9]+/i
// ESM実行（tsx/esm）では __dirname が使えないため import.meta.url から解決する。
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = resolve(MODULE_DIR, 'publishedRegistry.json')

/** PUBLISHED_REGISTRY（補助台帳）を読み込む。ファイル欠落・壊れたJSONは空配列（推測補完しない）。 */
export function loadPublishedRegistry(path: string = REGISTRY_PATH): PublishedTheme[] {
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as PublishedTheme[]
  } catch {
    return []
  }
}

/**
 * PUBLISHED_REGISTRY へ1件追記する（`./p2 publishlog add` から呼ばれる）。
 * 同一 dcId が既にあれば上書き（重複追加しない）。ファイル書き込みのみ・DBには触れない。
 */
export function appendPublishedRegistryEntry(entry: PublishedTheme, path: string = REGISTRY_PATH): PublishedTheme[] {
  const current = loadPublishedRegistry(path)
  const idx = entry.dcId != null ? current.findIndex((e) => e.dcId != null && Number(e.dcId) === Number(entry.dcId)) : -1
  const next = idx >= 0 ? [...current.slice(0, idx), entry, ...current.slice(idx + 1)] : [...current, entry]
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

/**
 * @deprecated 後方互換のためのエイリアス（既存テストが参照）。新規コードは
 * `loadPublishedRegistry()` を使うこと。中身は補助台帳（PUBLISHED_REGISTRY）そのもの。
 */
export const MANUAL_PUBLISHED_SEED: PublishedTheme[] = loadPublishedRegistry()

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** .devlogs/night/queue と .devlogs/manual-drafts の note-draft.json を走査して公開済みを拾う */
export function scanDevlogPublishedThemes(root: string): PublishedTheme[] {
  const out: PublishedTheme[] = []
  const seenUrl = new Set<string>()

  const scanFile = (path: string, source: string): void => {
    let raw: string
    try {
      raw = readFileSync(path, 'utf8')
    } catch {
      return
    }
    const urlM = raw.match(NOTE_URL_RE)
    const stateM = raw.match(/"state"\s*:\s*"([^"]+)"/)
    const publishedFlag = /"published"\s*:\s*true/.test(raw)
    const isPublished = !!urlM || publishedFlag || (stateM ? /公開/.test(stateM[1]) : false)
    if (!isPublished) return
    let doc: Record<string, unknown> = {}
    try {
      doc = JSON.parse(raw) as Record<string, unknown>
    } catch {
      /* raw だけで拾えるところは拾う */
    }
    const url = urlM ? urlM[0] : null
    if (url && seenUrl.has(url)) return
    if (url) seenUrl.add(url)
    const pubAtM = raw.match(/"publishedAt"\s*:\s*"([^"]+)"/)
    // venue / period は provenance の fact 文から拾えるだけ拾う（無ければ null）
    const venueM = raw.match(/(?:会場|開催場所)[:：]?\s*([^"、。\\n]{2,40})/)
    const periodM = raw.match(/(?:会期|開催期間|販売期間)[:：]?\s*([^"。\\n]{4,40})/)
    out.push({
      noteUrl: url,
      title: String(doc.title ?? ''),
      eventName: (doc.eventName as string) ?? (doc.title ? String(doc.title) : null),
      venue: venueM ? venueM[1].trim() : null,
      period: periodM ? periodM[1].trim() : null,
      dcId: num(doc.discoveredContentId),
      source,
      publishedAt: pubAtM ? pubAtM[1] : null,
    })
  }

  // night queue: .devlogs/night/queue/<date>/<idOrDcSlug>/note-draft.json
  const queueRoot = resolve(root, '.devlogs', 'night', 'queue')
  if (existsSync(queueRoot)) {
    for (const date of readdirSync(queueRoot)) {
      const dateDir = resolve(queueRoot, date)
      if (!statSync(dateDir).isDirectory()) continue
      for (const sub of readdirSync(dateDir)) {
        const f = resolve(dateDir, sub, 'note-draft.json')
        if (existsSync(f)) scanFile(f, `devlog:night/queue/${date}/${sub}`)
      }
    }
  }

  // manual drafts: .devlogs/manual-drafts/<slug>/note-draft.json
  const manualRoot = resolve(root, '.devlogs', 'manual-drafts')
  if (existsSync(manualRoot)) {
    for (const sub of readdirSync(manualRoot)) {
      const f = resolve(manualRoot, sub, 'note-draft.json')
      if (existsSync(f)) scanFile(f, `devlog:manual-drafts/${sub}`)
    }
  }
  return out
}

/** DB の articles.publishHistory（channel='note'）から公開済みテーマを拾う */
export async function loadDbPublishedThemes(payload: Payload): Promise<PublishedTheme[]> {
  const res = await payload.find({
    collection: 'articles',
    where: { 'publishHistory.channel': { equals: 'note' } },
    limit: 500,
    depth: 1,
    locale: 'ja',
    overrideAccess: true,
  })
  const out: PublishedTheme[] = []
  for (const a of res.docs as unknown as Record<string, any>[]) {
    const hist = (Array.isArray(a.publishHistory) ? a.publishHistory : []).filter((h: any) => h?.channel === 'note')
    if (hist.length === 0) continue
    const prov: any[] = Array.isArray(a.editorialProvenance) ? a.editorialProvenance : []
    const venueFact = prov.find((p) => (p.factType ?? '') === 'venue')?.fact ?? null
    const dateFact = prov.find((p) => (p.factType ?? '') === 'date')?.fact ?? null
    const dcId =
      prov.map((p) => {
        const r = p.discoveredContentSource
        return typeof r === 'object' && r ? Number(r.id) : Number(r)
      }).find((n) => Number.isFinite(n)) ?? null
    for (const h of hist) {
      out.push({
        noteUrl: String(h.reference ?? '') || null,
        title: String(a.title ?? ''),
        eventName: String(a.title ?? ''),
        venue: venueFact,
        period: dateFact,
        dcId,
        source: `db:publishHistory#${a.id}`,
        publishedAt: h.publishedAt ? String(h.publishedAt) : null,
      })
    }
  }
  return out
}

/**
 * 全公開履歴（DB＝主経路 ＋ 作業記録 ＋ PUBLISHED_REGISTRY＝補助台帳）を重複除去してまとめる。
 * 補助台帳は呼び出しのたびにファイルから再読込する（`./p2 publishlog add` による
 * 追記を、プロセス再起動なしに次回の候補生成から反映するため）。
 */
export async function loadPublishedThemes(payload: Payload, root: string): Promise<PublishedTheme[]> {
  const db = await loadDbPublishedThemes(payload)
  const devlog = scanDevlogPublishedThemes(root)
  const registry = loadPublishedRegistry()
  const merged: PublishedTheme[] = [...db, ...devlog, ...registry]

  // URL または (dcId+title) で重複除去（DB 優先）
  const byKey = new Map<string, PublishedTheme>()
  for (const t of merged) {
    const key = t.noteUrl ? `u:${t.noteUrl}` : `d:${t.dcId ?? '?'}:${t.title}`
    if (!byKey.has(key)) byKey.set(key, t)
  }
  return [...byKey.values()]
}
