import { getPayload } from 'payload'

import config from '../payload.config'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { classifyTemplateType } from '../lib/morning/classifyTemplateType'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { fetchOfficialSignals } from '../lib/morning/fetchOfficialSignals'
import type { OfficialPageSignals } from '../lib/morning/types'
import type { DiscoveredContentLike } from '../lib/template/mapDiscoveredContentToEventFields'
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// GINZA WHISKERS / Project 02（2026-09-03、8:15 迂回コマンド — RUNBOOK 付録G.21）
//
// 標準経路（./p2 draft-template）が 8:00 選定後 15 分以内に解消できないとき、
// **confirmed な事実だけ**から note 転記用 Markdown を作る安全な代替経路。
//
//   ./p2 bypass-draft <dcId> --reason="<標準経路で詰まった理由>"      # dry-run（表示のみ）
//   ./p2 bypass-draft <dcId> --reason="..." --write                    # content/drafts/ へ .md 出力＋ログ記録
//
// 【厳守】DB 書き込みなし・ready 化なし・note/X 投稿なし・Claude API なし・追加課金なし。
//         confirmed の事実だけを本文へ。unconfirmed / conflicting は「確認事項」として分離。
//         時刻到達による無人実行はしない（マロンが判断して起動する）。

interface Args {
  dcId: number
  reason: string
  write: boolean
}
function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const dcId = Number(argv.find((a) => !a.startsWith('--')))
  const reasonFlag = argv.find((a) => a.startsWith('--reason='))
  const reason = reasonFlag ? reasonFlag.slice('--reason='.length).replace(/^["']|["']$/g, '') : ''
  const write = argv.includes('--write')
  if (!Number.isInteger(dcId) || dcId < 1) {
    console.error('Usage: bypassDraft.ts <DiscoveredContent 数値ID> --reason="..." [--write]')
    process.exit(1)
  }
  return { dcId, reason, write }
}

function slugify(s: string): string {
  return s
    .replace(/[『』「」（）()【】\[\]]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function jstDateStr(now = new Date()): string {
  const j = new Date(now.getTime() + 9 * 3600_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

async function main() {
  const args = parseArgs()
  const payload = await getPayload({ config })

  const dc = (await payload.findByID({
    collection: 'discovered-content',
    id: args.dcId,
    depth: 1,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  const ss = dc.sourceSite as { name?: string | null } | null

  const dcLike: DiscoveredContentLike = {
    id: args.dcId,
    title: (dc.title as string | null) ?? null,
    excerpt: (dc.excerpt as string | null) ?? null,
    articleUrl: (dc.articleUrl as string | null) ?? null,
    sourceSiteName: ss?.name ?? null,
    publishedAt: (dc.publishedAt as string | null) ?? null,
    eventStartAt: (dc.eventStartAt as string | null) ?? null,
    eventEndAt: (dc.eventEndAt as string | null) ?? null,
    venue: (dc.venue as string | null) ?? null,
    contentType: (dc.contentType as string | null) ?? null,
    uxType: (dc.uxType as string | null) ?? null,
    lastCheckedAt: (dc.lastCheckedAt as string | null) ?? null,
    detectedAt: (dc.detectedAt as string | null) ?? null,
    dateExtraction: (dc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
  }

  // 公式ページ取得（読み取りのみ・0円）。許可ホストは記事 URL のホストのみ許す。
  let signals: OfficialPageSignals | null = null
  const host = (() => {
    try { return new URL(dcLike.articleUrl ?? '').hostname } catch { return '' }
  })()
  if (host) {
    try {
      signals = await fetchOfficialSignals(dcLike.articleUrl ?? '', { allowedHosts: [host.replace(/^www\./, '')] })
    } catch (e) {
      signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: String(e) }
    }
  }

  const factKind = classifyFactKind({
    contentType: dcLike.contentType, uxType: dcLike.uxType,
    title: dcLike.title, excerpt: dcLike.excerpt, officialSignals: signals,
  }).factKind
  const tt = classifyTemplateType({ factKind, contentType: dcLike.contentType, uxType: dcLike.uxType, title: dcLike.title, excerpt: dcLike.excerpt })

  const extraction = extractArticleFactsCandidate({
    dc: dcLike,
    image: { available: false, assetPath: null, policy: '画像なし', season: null } as never,
    officialSignals: signals,
    trustedSource: true,
  })
  const eef = extraction.extractedEventFacts
  const C = (k: keyof typeof eef) => {
    const f = eef[k] as { value: unknown; confirmationStatus: string }
    return f.confirmationStatus === 'confirmed' && f.value != null ? String(f.value) : null
  }

  const eventName = C('eventName') ?? (dcLike.title ?? '（イベント名 要人間入力）').split(/\s*\|\s*/)[0]
  const eventDate = C('eventDate')
  const eventTime = C('eventTime')
  const venue = C('venuePlace')
  const paid = C('paid')
  const whatHappens = C('whatHappens')
  const officialInfoNote = C('officialInfoNote')
  const sourceName = dcLike.sourceSiteName ?? '公式サイト'
  const sourceUrl = dcLike.articleUrl ?? ''
  const verifiedJst = jstDateStr()

  // --- confirmed だけで本文を組む ---
  const lines: string[] = []
  lines.push(`# ${eventName}`)
  lines.push('')
  if (whatHappens) lines.push(whatHappens)
  else lines.push('（導入・概要は編集長が加筆。公式本文から概要を確定取得できませんでした）')
  lines.push('')
  lines.push('## 基本情報')
  lines.push('')
  lines.push(`- 名称：${eventName}`)
  if (eventDate) lines.push(`- 会期：${eventDate}`)
  if (venue) lines.push(`- 会場：${venue}`)
  if (eventTime) lines.push(`- 時間：${eventTime}`)
  if (paid) lines.push(`- 料金：${paid === 'free' ? '入場無料' : '有料'}`)
  lines.push('')
  if (officialInfoNote) {
    lines.push('## 注意事項（公式）')
    lines.push('')
    for (const n of officialInfoNote.split('\n')) lines.push(`- ${n}`)
    lines.push('')
  }
  lines.push('## SOURCE')
  lines.push('')
  lines.push(`Source｜${sourceName}`)
  lines.push(`確認：${verifiedJst}`)
  lines.push(`公式情報：${sourceUrl}`)
  lines.push('')
  lines.push('*本記事は公式情報で confirmed とできた事実のみで構成しています。*')

  // --- 本文に出していない確認事項（unconfirmed / conflicting） ---
  const unconfirmed: string[] = []
  for (const k of ['eventName', 'eventDate', 'eventTime', 'venuePlace', 'paid', 'whatHappens', 'officialInfoNote', 'applyRequired'] as const) {
    const f = eef[k] as { value: unknown; confirmationStatus: string; method: string }
    if (!(f.confirmationStatus === 'confirmed' && f.value != null)) {
      unconfirmed.push(`- ${k}: ${f.value != null ? `「${String(f.value)}」（未照合）` : '未取得'} — ${f.method}`)
    }
  }
  for (const c of extraction.conflicts) unconfirmed.push(`- 矛盾: ${c}`)

  const md = lines.join('\n') + '\n'
  const editorNote =
    `<!--\nBYPASS DRAFT（8:15 迂回経路・RUNBOOK 付録G.21）\n` +
    `DC #${args.dcId} / factKind=${factKind} / templateType=${tt.templateType}(${tt.confidence})\n` +
    `迂回理由: ${args.reason || '（--reason 未指定）'}\n` +
    `生成: ${new Date().toISOString()} / 公式取得 ok=${signals?.ok}\n\n` +
    `── 本文に出していない確認事項（人間が公式で確認）──\n${unconfirmed.join('\n') || '（なし）'}\n\n` +
    `── ハッシュタグ候補（人間確認待ち）──\n${(eef.hashtagCandidates ?? []).join(' ') || '（なし）'}\n\n` +
    `禁止: DB書き込み / ready化 / note・X投稿 / 自動公開。reviewStatus は draft 相当（この .md は下書き）。\n-->\n`

  const dateStr = jstDateStr()
  const slug = slugify(eventName)
  const outMd = resolve(process.cwd(), '..', 'content', 'drafts', `${dateStr}-${slug}-bypass.md`)
  const bypassLog = resolve(process.cwd(), '..', '.devlogs', 'morning', dateStr, 'bypass.md')

  console.log('=== 8:15 迂回ドラフト（bypass-draft） ===')
  console.log(`DC #${args.dcId}  factKind=${factKind}  templateType=${tt.templateType}`)
  console.log(`迂回理由: ${args.reason || '（--reason 未指定・--write 時は必須推奨）'}`)
  console.log(`confirmed で本文に使えた項目: ${[eventDate && '会期', venue && '会場', eventTime && '時間', paid && '料金', whatHappens && '概要', officialInfoNote && '注意事項'].filter(Boolean).join(' / ') || '（少ない）'}`)
  console.log(`本文に出していない確認事項: ${unconfirmed.length} 件`)
  console.log('')
  console.log('---------- 生成される Markdown（プレビュー）----------')
  console.log(editorNote + md)
  console.log('----------------------------------------------------')

  if (!args.write) {
    console.log('\n（dry-run：ファイル出力なし。--write を付けると content/drafts/ へ .md を書き、.devlogs へ迂回ログを記録します）')
    console.log(`  出力予定: ${outMd}`)
    process.exit(0)
  }

  mkdirSync(resolve(outMd, '..'), { recursive: true })
  writeFileSync(outMd, editorNote + md, 'utf8')
  mkdirSync(resolve(bypassLog, '..'), { recursive: true })
  const logLine =
    `\n## ${new Date().toISOString()} — DC #${args.dcId} 迂回\n` +
    `- 迂回理由: ${args.reason || '（未指定）'}\n` +
    `- 記事種別: ${tt.templateType}（${tt.confidence}）\n` +
    `- 出力: content/drafts/${dateStr}-${slug}-bypass.md\n` +
    `- confirmed 使用項目: ${[eventDate && '会期', venue && '会場', eventTime && '時間', paid && '料金'].filter(Boolean).join(' / ') || 'なし'}\n` +
    `- 未確認（本文非掲載）: ${unconfirmed.length} 件\n` +
    `- DB書き込み/ready化/note・X投稿: なし\n`
  if (!existsSync(bypassLog)) writeFileSync(bypassLog, `# 迂回経路の記録（${dateStr}）\n`, 'utf8')
  appendFileSync(bypassLog, logLine, 'utf8')

  console.log(`\n✅ 出力: ${outMd}`)
  console.log(`✅ 迂回ログ: ${bypassLog}`)
  console.log('DB 書き込み・ready 化・note/X 投稿・課金はしていません。マロンが .md を確認して note へ転記してください。')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
