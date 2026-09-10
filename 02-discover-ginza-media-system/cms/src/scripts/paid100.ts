// GINZA WHISKERS / Project 02（2026-09-10）— 100円note記事レーン CLI（PAID_100_LANE_SPEC.md）。
//
//   ./p2 paid100 propose            … 今週の候補を最大3案だけ提示（読み取り専用・AI/note/課金なし）
//   ./p2 paid100 draft <番号>       … 選んだ1案から CMS 下書き（lane=paid_100）を自動生成（note 公開なし）
//   ./p2 paid100 status            … paid_100 記事一覧と今週の提案数（読み取り専用）
//
// 通常記事（無料・1日3本）とは完全に別枠。DB 書き込みは draft の作成のみ（reviewStatus=draft）。
// note への自動ログイン・自動公開は実装しない。マロンの最終承認後に note で公開する。

import { getPayload } from 'payload'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import config from '../payload.config'
import { blocksToLexicalState, type TextBlock } from '../lib/ai/lexical'
import { slugify } from '../lib/ai/slugify'
import { proposePaid100Candidates } from '../lib/paid100/proposePaid100Candidates'
import { buildPaid100Draft } from '../lib/paid100/buildPaid100Draft'
import {
  PAID100_PRICE_YEN,
  PAID100_SERIES_LABEL_V1,
  PAID100_TARGET_WEEKDAYS,
  type FreeArticleSummary,
} from '../lib/paid100/types'

// このスクリプトは scripts/project02 が `cd "$ROOT/cms"` してから実行する（cwd = .../cms）
const ROOT = resolve(process.cwd(), '..')
const OUT_DIR = resolve(ROOT, '.devlogs/paid100')

function nodeText(n: any): string {
  if (!n || typeof n !== 'object') return ''
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return n.children.map(nodeText).join('')
  return ''
}
function flattenBody(body: any): string {
  const kids: any[] = body?.root?.children ?? []
  return kids.map((c) => nodeText(c).trim()).filter(Boolean).join('\n')
}

function isoWeekLabel(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function provOf(a: Record<string, any>): FreeArticleSummary['provenance'] {
  const prov = Array.isArray(a.editorialProvenance) ? a.editorialProvenance : []
  return prov.map((p: any) => ({
    fact: String(p.fact ?? ''),
    factType: p.factType ?? null,
    sourceName: String(p.sourceName ?? ''),
    sourceUrl: String(p.sourceUrl ?? ''),
    verificationStatus: p.verificationStatus ?? null,
  }))
}
function pillarNameOf(a: Record<string, any>): string | null {
  const ps = Array.isArray(a.pillars) ? a.pillars : []
  const first = ps[0]
  if (first && typeof first === 'object') return String(first.name ?? '') || null
  return null
}

async function loadPayload() {
  return getPayload({ config })
}

// ── propose ─────────────────────────────────────────────────────────────
async function cmdPropose(): Promise<number> {
  const payload = await loadPayload()
  const weekLabel = isoWeekLabel()

  const res = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { lane: { not_equals: 'paid_100' } },
        { reviewStatus: { in: ['published', 'approved', 'draft'] } },
      ],
    },
    sort: '-updatedAt',
    limit: 200,
    depth: 1,
    locale: 'ja',
    overrideAccess: true,
  })

  const free: FreeArticleSummary[] = (res.docs as unknown as Record<string, any>[]).map((a) => ({
    id: Number(a.id),
    title: String(a.title ?? ''),
    bodyText: flattenBody(a.body),
    pillar: pillarNameOf(a),
    reviewStatus: String(a.reviewStatus ?? ''),
    lane: String(a.lane ?? 'free'),
    provenance: provOf(a),
  }))

  const result = proposePaid100Candidates(free, { weekLabel })

  mkdirSync(resolve(OUT_DIR, weekLabel), { recursive: true })
  const outPath = resolve(OUT_DIR, weekLabel, 'proposals.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2))

  console.log(`\n=== 100円レーン 今週の候補（${weekLabel}／公開目安 ${PAID100_TARGET_WEEKDAYS.join('・')}曜）===`)
  console.log(`対象にした無料記事: ${result.meta.freeArticlesConsidered} 件 ／ 提示: ${result.proposals.length} 案（最大3）\n`)
  for (const p of result.proposals) {
    console.log(`【案 ${p.rank}】 ${p.title}   （再利用元 #${p.sourceArticleId}／制作見込み 約${p.estimatedMinutes}分／score ${p.score}）`)
    console.log(`  無料部分  課題: ${p.freePortion.challenge}`)
    console.log(`            変化: ${p.freePortion.change}`)
    console.log(`            結果: ${p.freePortion.result}`)
    console.log(`  有料価値: ${p.paidValue}`)
    console.log(`  再現性  : ${p.reproducibility.reproducible ? 'OK' : 'NG'} — ${p.reproducibility.reason}`)
    console.log(`  再利用素材:`)
    for (const m of p.reusableMaterials) console.log(`    - ${m}`)
    console.log('')
  }
  if (result.proposals.length === 0) {
    console.log('  今週は再現性の必須条件を満たす候補がありません（水増ししない）。')
  }
  if (result.rejected.length) {
    console.log(`■ 見送り（${result.rejected.length} 件・理由つき）`)
    for (const r of result.rejected) console.log(`  - #${r.sourceArticleId}「${r.title}」: ${r.reason}`)
  }
  console.log(`\n保存: ${outPath}`)
  console.log(`次: マロンが1案を選び  ./p2 paid100 draft <番号>  で CMS 下書きを生成（note 公開なし）`)
  console.log('=================================================================\n')
  return 0
}

// ── draft <n> [--title=...] ─────────────────────────────────────────────
async function cmdDraft(argN: string, rest: string[]): Promise<number> {
  const n = Number(argN)
  if (!Number.isInteger(n) || n < 1) {
    console.error('Usage: ./p2 paid100 draft <1-3> [--title="第一タイトル"]（先に ./p2 paid100 propose を実行）')
    return 1
  }
  const titleFlag = rest.find((a) => a.startsWith('--title='))
  const titleOverride = titleFlag ? titleFlag.slice('--title='.length).replace(/^["']|["']$/g, '') : undefined
  if (!existsSync(OUT_DIR)) {
    console.error('提案がありません。先に ./p2 paid100 propose を実行してください。')
    return 1
  }
  const weeks = readdirSync(OUT_DIR).filter((d) => /^\d{4}-W\d{2}$/.test(d)).sort()
  const latest = weeks[weeks.length - 1]
  const proposalsPath = resolve(OUT_DIR, latest, 'proposals.json')
  if (!existsSync(proposalsPath)) {
    console.error('proposals.json が見つかりません。先に ./p2 paid100 propose を実行してください。')
    return 1
  }
  const proposalsFile = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as {
    weekLabel: string
    proposals: import('../lib/paid100/types').Paid100Proposal[]
  }
  const proposal = proposalsFile.proposals.find((p) => p.rank === n)
  if (!proposal) {
    console.error(`案 ${n} がありません（今週の提示: ${proposalsFile.proposals.length} 案）`)
    return 1
  }

  const payload = await loadPayload()

  const srcDoc = (await payload.findByID({
    collection: 'articles',
    id: proposal.sourceArticleId,
    depth: 1,
    locale: 'ja',
    overrideAccess: true,
  })) as Record<string, any> | null
  if (!srcDoc) {
    console.error(`再利用元 article #${proposal.sourceArticleId} が見つかりません`)
    return 1
  }

  const source: FreeArticleSummary = {
    id: Number(srcDoc.id),
    title: String(srcDoc.title ?? ''),
    bodyText: flattenBody(srcDoc.body),
    pillar: pillarNameOf(srcDoc),
    reviewStatus: String(srcDoc.reviewStatus ?? ''),
    lane: String(srcDoc.lane ?? 'free'),
    provenance: provOf(srcDoc),
  }

  const draft = buildPaid100Draft(proposal, source, { titleOverride })

  // 重複ガード：同じ再利用元から生成した paid_100 記事が既にあれば中止
  const existing = await payload.find({
    collection: 'articles',
    where: { and: [{ lane: { equals: 'paid_100' } }, { aiGeneratedBy: { like: `paid100 source=#${source.id}` } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) {
    console.error(`ABORT: 再利用元 #${source.id} からの paid_100 記事が既に存在します（article id=${existing.docs[0].id}）。`)
    return 2
  }

  // 本文 Lexical（無料エリア → 有料エリア → 出典 → 注意事項 → ハッシュタグ）。
  // 有料ライン位置は本文に仮表示を入れず Articles.paywallAnchorHeading（＝有料エリア最初の見出し）に持たせる。
  const blocks: TextBlock[] = []
  for (const s of draft.freeSections) {
    blocks.push({ type: 'heading', level: 2, text: s.heading })
    for (const l of s.lines) blocks.push({ type: 'paragraph', text: l })
  }
  for (const s of draft.paidSections) {
    blocks.push({ type: 'heading', level: 2, text: s.heading })
    for (const l of s.lines) blocks.push({ type: 'paragraph', text: l })
  }
  blocks.push({ type: 'heading', level: 2, text: '出典・確認日時' })
  if (draft.sources.length) {
    for (const s of draft.sources) blocks.push({ type: 'paragraph', text: `${s.sourceName}：${s.sourceUrl}` })
  } else {
    blocks.push({ type: 'paragraph', text: '[マロン具体化]：再利用元記事の出典URLを1〜2件入れる' })
  }
  blocks.push({ type: 'heading', level: 2, text: '注意事項' })
  for (const nline of draft.notes) blocks.push({ type: 'paragraph', text: `・${nline}` })
  blocks.push({ type: 'heading', level: 2, text: '挿絵注釈' })
  blocks.push({
    type: 'paragraph',
    text: '※画像は記事内容をもとに生成したイメージです。実際の展示作品・会場とは異なります。',
  })
  blocks.push({ type: 'heading', level: 2, text: 'ハッシュタグ' })
  blocks.push({ type: 'paragraph', text: draft.hashtags.join(' ') })

  const pillarIds = (Array.isArray(srcDoc.pillars) ? srcDoc.pillars : [])
    .map((p: any) => (p && typeof p === 'object' ? Number(p.id) : Number(p)))
    .filter((x: number) => Number.isFinite(x))
  const slug = `paid100-${slugify(draft.title, { maxLength: 48 }) || `src${source.id}`}-${source.id}`

  const editorialProvenance = source.provenance
    .filter((p) => p.sourceUrl && p.sourceName && p.fact)
    .map((p) => {
      const orig = (Array.isArray(srcDoc.editorialProvenance) ? srcDoc.editorialProvenance : []).find(
        (o: any) => String(o.sourceUrl ?? '') === p.sourceUrl && String(o.fact ?? '') === p.fact,
      )
      const dcRef = orig?.discoveredContentSource
      const dcId = dcRef && typeof dcRef === 'object' ? Number(dcRef.id) : Number(dcRef)
      return {
        discoveredContentSource: Number.isFinite(dcId) ? dcId : undefined,
        sourceName: p.sourceName,
        sourceUrl: p.sourceUrl,
        verifiedAt: orig?.verifiedAt ?? undefined,
        fact: p.fact,
        sourceType: (orig?.sourceType as never) ?? 'official',
        factType: (orig?.factType as never) ?? 'other',
        verificationStatus: (p.verificationStatus as never) ?? 'confirmed',
      }
    })

  const created = await payload.create({
    collection: 'articles',
    draft: true,
    overrideAccess: true,
    data: {
      reviewStatus: 'draft',
      lane: 'paid_100',
      priceYen: draft.priceYen,
      paywallAnchorHeading: draft.paywallAnchorHeading || undefined,
      title: draft.title,
      slug,
      body: blocksToLexicalState(blocks) as never,
      pillars: pillarIds.length ? pillarIds : undefined,
      series: { label: draft.seriesLabel },
      seo: {
        metaTitle: draft.title,
        metaDescription: `${proposal.freePortion.challenge} ${proposal.freePortion.result}`.slice(0, 150),
      },
      aiGeneratedBy:
        `paid100 source=#${source.id} (deterministic scaffold, not AI). GINZA WHISKERS 編集部, ${new Date()
          .toISOString()
          .slice(0, 10)}. series=${draft.seriesLabel}. price=${draft.priceYen}. reuse-only, no new research.`,
      editorialProvenance: editorialProvenance.length ? (editorialProvenance as never) : undefined,
    },
  })

  console.log(
    JSON.stringify(
      {
        ok: true,
        articleId: (created as { id: number }).id,
        lane: 'paid_100',
        priceYen: draft.priceYen,
        reviewStatus: (created as { reviewStatus?: string }).reviewStatus,
        series: draft.seriesLabel,
        sourceArticleId: source.id,
        slug,
        note: 'note 未公開。note の有料設定・価格・公開はマロンが手動。',
      },
      null,
      2,
    ),
  )
  return 0
}

// ── status ──────────────────────────────────────────────────────────────
async function cmdStatus(): Promise<number> {
  const payload = await loadPayload()
  const res = await payload.find({
    collection: 'articles',
    where: { lane: { equals: 'paid_100' } },
    sort: '-updatedAt',
    limit: 100,
    depth: 0,
    locale: 'ja',
    overrideAccess: true,
  })
  console.log(`\n=== 100円レーン（paid_100）状況 ===`)
  console.log(`シリーズ第一弾: ${PAID100_SERIES_LABEL_V1} ／ 価格: ${PAID100_PRICE_YEN}円 ／ 目標: 週2本・月8〜9本 ／ 公開目安 ${PAID100_TARGET_WEEKDAYS.join('・')}曜`)
  console.log(`paid_100 記事: ${res.totalDocs} 件`)
  for (const a of res.docs as unknown as Record<string, any>[]) {
    console.log(`  #${a.id}  [${a.reviewStatus}]  ${a.title}`)
  }
  const weekLabel = isoWeekLabel()
  const pPath = resolve(OUT_DIR, weekLabel, 'proposals.json')
  if (existsSync(pPath)) {
    const pf = JSON.parse(readFileSync(pPath, 'utf-8'))
    console.log(`\n今週（${weekLabel}）の提案: ${pf.proposals?.length ?? 0} 案（${pPath}）`)
  } else {
    console.log(`\n今週（${weekLabel}）の提案: なし（./p2 paid100 propose）`)
  }
  console.log('====================================\n')
  return 0
}

async function main() {
  const sub = process.argv[2]
  let code = 0
  if (sub === 'propose') code = await cmdPropose()
  else if (sub === 'draft') code = await cmdDraft(process.argv[3], process.argv.slice(4))
  else if (sub === 'status') code = await cmdStatus()
  else {
    console.log('Usage: ./p2 paid100 <propose|draft <番号>|status>')
    code = 1
  }
  process.exit(code)
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
