// GINZA WHISKERS / Project 02（2026-09-12）— `./p2 publishlog add` の実装。
//
// 【背景】DB自動照合（loadDbPublishedThemes）は「このシステム自身が記録した公開」しか
// 検知できない。DC#352・#246・#365 のように、DiscoveredContent承認フローを経由せず
// 別ルートで note へ公開された案件は、DB上に痕跡が一切残らないため自動検知できない。
// このコマンドは、そういう「DB外で公開されたとマロンが確認した案件」を、コード変更
// （publishedRegistry.json をエディタで直接編集する必要）なしに追記できるようにする、
// 補助台帳（PUBLISHED_REGISTRY）への唯一の書き込み口。
//
// 【できること】
//   1. publishedRegistry.json への追記（同一 dcId は上書き、重複追加しない）
//   2. --url 指定時、該当 DC を editorialProvenance で参照する Article が存在すれば、
//      その Article の `publishHistory` へも同じ内容を書き戻す（ベストエフォート）。
//      これにより、次回以降は DB 自動照合（主経路）だけで検知できるようになり、
//      補助台帳への依存を将来的に減らせる。該当 Article が無ければ台帳登録のみ
//      （DB外の投稿と判断し、Articleの新規作成やcurationStatusの変更は一切行わない）。
//
// 使い方：
//   ./p2 publishlog add --dc=352 --title="..." --event="..." --venue="..." \
//     --period="..." [--url=https://note.com/...] [--published-at=2026-09-05] \
//     [--source="マロン確認"]
//
// --dc 以外は省略可（省略した項目は null のまま登録＝推測補完しない）。

import { getPayload } from 'payload'
import config from '../payload.config'
import { appendPublishedRegistryEntry, loadPublishedRegistry } from '../lib/publish/loadPublishedThemes'
import type { PublishedTheme } from '../lib/publish/publishedThemes'

function str(args: string[], flag: string): string | null {
  const f = args.find((a) => a.startsWith(`${flag}=`))
  if (!f) return null
  const v = f.slice(flag.length + 1)
  return v.length > 0 ? v : null
}

async function main() {
  const args = process.argv.slice(2)
  const dcRaw = str(args, '--dc')
  if (!dcRaw) throw new Error('--dc=<DiscoveredContent id> は必須です')
  const dcId = Number(dcRaw)
  if (!Number.isFinite(dcId)) throw new Error(`--dc の値を数値として解釈できません: "${dcRaw}"`)

  const title = str(args, '--title')
  const event = str(args, '--event')
  const venue = str(args, '--venue')
  const period = str(args, '--period')
  const url = str(args, '--url')
  const publishedAt = str(args, '--published-at')
  const source = str(args, '--source')

  const existing = loadPublishedRegistry().find((e) => e.dcId != null && Number(e.dcId) === dcId)

  const entry: PublishedTheme = {
    noteUrl: url,
    title: title ?? existing?.title ?? `DiscoveredContent #${dcId}`,
    eventName: event ?? existing?.eventName ?? title ?? null,
    venue: venue ?? existing?.venue ?? null,
    period: period ?? existing?.period ?? null,
    dcId,
    source: source ? `manual:registry（${source}）` : 'manual:registry（./p2 publishlog add）',
    publishedAt: publishedAt ?? existing?.publishedAt ?? null,
  }

  const registry = appendPublishedRegistryEntry(entry)

  // ベストエフォートで DB の Article.publishHistory へも書き戻す（url があるときのみ）。
  let dbBackfill: { attempted: boolean; articleId: number | null; updated: boolean; reason: string } = {
    attempted: false,
    articleId: null,
    updated: false,
    reason: 'urlが未指定のためDB書き戻しは行わない（台帳登録のみ）',
  }
  if (url) {
    dbBackfill = { attempted: true, articleId: null, updated: false, reason: '' }
    try {
      const payload = await getPayload({ config })
      const res = await payload.find({
        collection: 'articles',
        where: { 'editorialProvenance.discoveredContentSource': { equals: dcId } },
        limit: 5,
        depth: 0,
        overrideAccess: true,
      })
      if (res.docs.length === 0) {
        dbBackfill.reason = `DC#${dcId} を参照する Article が見つからない（DB外での投稿と判断し、台帳登録のみ）`
      } else {
        const article = res.docs[0] as unknown as Record<string, any>
        const hist: any[] = Array.isArray(article.publishHistory) ? article.publishHistory : []
        const already = hist.some((h) => h?.channel === 'note' && String(h?.reference ?? '') === url)
        if (already) {
          dbBackfill.articleId = Number(article.id)
          dbBackfill.reason = `Article #${article.id} には既に同一URLのpublishHistoryあり（更新不要）`
        } else {
          const newHist = [...hist, { channel: 'note', publishedAt: publishedAt ?? new Date().toISOString(), reference: url }]
          await payload.update({
            collection: 'articles',
            id: article.id,
            overrideAccess: true,
            data: { publishHistory: newHist },
          })
          dbBackfill.articleId = Number(article.id)
          dbBackfill.updated = true
          dbBackfill.reason = `Article #${article.id} の publishHistory へ追記した（次回以降DB自動照合の主経路で検知可能）`
        }
      }
    } catch (e) {
      dbBackfill.reason = `DB書き戻し試行中にエラー: ${e instanceof Error ? e.message : String(e)}（台帳登録は完了済み）`
    }
  }

  console.log(
    JSON.stringify(
      {
        registered: entry,
        registrySize: registry.length,
        dbBackfill,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
