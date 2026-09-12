// GINZA WHISKERS / Project 02（2026-09-11）— 既公開テーマ台帳のロード（DB ＋ 作業記録 ＋ 手動シード）。
//
// 「全公開履歴」を対象にする。集める先：
//   ・DB `articles.publishHistory`（channel='note'）
//   ・`.devlogs/night/queue/*/*/note-draft.json`（publishRecord に url / state='公開完了'）
//   ・`.devlogs/manual-drafts/*/note-draft.json`（published:true / publishRecord あり）
//   ・手動シード（マロン確認済みで URL 未記録のもの）

import type { Payload } from 'payload'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PublishedTheme } from './publishedThemes'

const NOTE_URL_RE = /https:\/\/note\.com\/ginza_whiskers\/n\/[a-z0-9]+/i

/**
 * マロン確認済みだが URL がローカルに記録されていない既公開テーマ。
 * 恒久対策（publishHistory へ手動転記時も URL を残す）が入るまでのシード。
 */
export const MANUAL_PUBLISHED_SEED: PublishedTheme[] = [
  {
    noteUrl: null,
    title: '韓国ウェルネス アフタヌーンティー（NAMIKI667）',
    eventName: '韓国ウェルネス アフタヌーンティー',
    venue: 'NAMIKI667／ハイアット セントリック 銀座 東京',
    period: '2026年9月1日〜10月31日',
    dcId: 327,
    source: 'manual:seed（マロン確認・過去投稿済み・URL未記録）',
    publishedAt: null,
  },
  // 2026-09-12：マロンから「DC#352・#246・#365 はいずれも過去投稿済み」との指摘を受けて追加。
  // DB（editorialProvenance／publishHistory）・.devlogs のいずれにも紐づく記録が見つからず、
  // 本システムの記録範囲外（手動投稿・別ルート等）での既公開と判断し、URL・投稿日は
  // 未記録のまま推測せず登録する（DC id による一致で以後は確実に除外される）。
  {
    noteUrl: null,
    title: '【秋季限定】栗とはちみつのパウンドケーキ（GINZA SIX）',
    eventName: '栗とはちみつのパウンドケーキ',
    venue: 'GINZA SIX',
    period: '2026年9月1日〜9月15日',
    dcId: 352,
    source: 'manual:seed（マロン確認・過去投稿済み・URL未記録）',
    publishedAt: null,
  },
  {
    noteUrl: null,
    title: '花西子 FLORASIS UV機能付ファンデーション（GINZA SIX）',
    eventName: '花西子 FLORASIS UV機能付ファンデーション',
    venue: 'GINZA SIX',
    period: '2026年8月29日〜9月16日',
    dcId: 246,
    source: 'manual:seed（マロン確認・過去投稿済み・URL未記録）',
    publishedAt: null,
  },
  {
    noteUrl: null,
    title: '櫻井万里明 “Hustle!!” 刊行記念展示（銀座 蔦屋書店）',
    eventName: '櫻井万里明 “Hustle!!” 刊行記念 ブックサイニング&作品展示',
    venue: '銀座 蔦屋書店',
    period: '2026年9月11日〜9月13日',
    dcId: 365,
    source: 'manual:seed（マロン確認・過去投稿済み・URL未記録）',
    publishedAt: null,
  },
]

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

/** 全公開履歴（DB ＋ 作業記録 ＋ 手動シード）を重複除去してまとめる */
export async function loadPublishedThemes(payload: Payload, root: string): Promise<PublishedTheme[]> {
  const db = await loadDbPublishedThemes(payload)
  const devlog = scanDevlogPublishedThemes(root)
  const merged: PublishedTheme[] = [...db, ...devlog, ...MANUAL_PUBLISHED_SEED]

  // URL または (dcId+title) で重複除去（DB 優先）
  const byKey = new Map<string, PublishedTheme>()
  for (const t of merged) {
    const key = t.noteUrl ? `u:${t.noteUrl}` : `d:${t.dcId ?? '?'}:${t.title}`
    if (!byKey.has(key)) byKey.set(key, t)
  }
  return [...byKey.values()]
}
