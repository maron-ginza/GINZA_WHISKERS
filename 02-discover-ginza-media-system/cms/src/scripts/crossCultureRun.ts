// GINZA WHISKERS / Project 02 — GINZA CROSS CULTURE MAP CLI（2026-09-04）
//
//   ./p2 crossculture theme "<自由テキスト>" [--json]        DB 不要・単発判定
//   ./p2 crossculture run <DiscoveredContent の数値ID> [--force] [--json]
//   ./p2 crossculture audit [--limit=N] [--status=inbox|approved|inbox,approved] [--json]
//   ./p2 crossculture config                                 現在の軸・しきい値を表示
//
// 決定的・AI 呼び出しなし・ネットワークなし・DB 書き込みなし・追加課金なし。
// audit / run は既存の DiscoveredContent を読むだけ。結果は .devlogs/crossculture/ にキャッシュ。

import { getPayload } from 'payload'

import config from '../payload.config'
import {
  getOrComputeCrossCulture,
  runCrossCultureFilter,
  MARKET_AXES,
  loadCrossCultureThresholds,
  crossCultureSummaryLine,
  type CrossCultureInput,
  type CrossCultureFilterResult,
} from '../lib/crossCulture'

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : 'true'
}

function renderResult(label: string, cc: CrossCultureFilterResult): void {
  console.log(`──────── ${label} ────────`)
  console.log(`  ${crossCultureSummaryLine(cc)}`)
  console.log(`  mode=${cc.mode}${cc.skipped ? `（skipped: ${cc.skipReason}）` : ''}  version=${cc.version}`)
  for (const m of cc.markets) {
    const tag = cc.derivativeMarkets.includes(m.market)
      ? '派生候補'
      : cc.editorialMarkets.includes(m.market)
        ? '編集候補'
        : '除外'
    console.log(
      `  ${m.market.padEnd(14)} score ${String(m.score).padStart(3)}  [${tag} / ${m.articlePotential} / ${m.confidence}]  軸=${m.matchedAxes.join('・') || '—'}`,
    )
    if (m.suggestedAngle) console.log(`      角度: ${m.suggestedAngle}`)
    if (m.paidBasis.length) console.log(`      有料成立根拠: ${m.paidBasis.join(' ／ ')}`)
  }
  for (const n of cc.notes) console.log(`  ・${n}`)
}

async function main(): Promise<void> {
  const sub = process.argv[2]
  const json = !!arg('json')

  if (sub === 'config') {
    const t = loadCrossCultureThresholds()
    console.log('=== CROSS CULTURE FILTER 設定（cms/src/lib/crossCulture/marketAxes.ts）===')
    console.log(`enabled=${t.enabled}  minDerivative=${t.minDerivative}  minEditorial=${t.minEditorial}  disabledMarkets=[${t.disabledMarkets.join(',')}]`)
    for (const m of MARKET_AXES) {
      console.log(`\n■ ${m.market}  enabled=${m.enabled}`)
      console.log(`  compass: ${m.compass}`)
      for (const a of m.axes) console.log(`  - ${a.key}（weight ${a.weight ?? 1}）: include ${a.include.length} 語 / boost ${(a.boost ?? []).length} 語`)
      if (m.negative?.length) console.log(`  negative: ${m.negative.join('・')}`)
    }
    if (json) console.log(JSON.stringify({ thresholds: t, markets: MARKET_AXES }))
    process.exit(0)
  }

  if (sub === 'theme') {
    const text = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : ''
    if (!text) {
      console.error('Usage: ./p2 crossculture theme "<自由テキスト>" [--json]')
      process.exit(1)
    }
    const cc = runCrossCultureFilter({ title: text })
    if (json) console.log(JSON.stringify(cc))
    else renderResult(`theme: ${text.slice(0, 60)}`, cc)
    process.exit(0)
  }

  if (sub === 'run') {
    const id = Number(process.argv[3])
    if (!Number.isInteger(id)) {
      console.error('Usage: ./p2 crossculture run <DiscoveredContent の数値ID> [--force] [--json]')
      process.exit(1)
    }
    const payload = await getPayload({ config })
    const dc = (await payload.findByID({ collection: 'discovered-content', id, depth: 1, overrideAccess: true })) as unknown as Record<
      string,
      unknown
    > | null
    if (!dc) {
      console.error(`DiscoveredContent #${id} が見つかりません`)
      process.exit(1)
    }
    let primaryCategory: string | null = null
    let templateType: string | null = null
    try {
      const af = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const f = af.docs[0] as unknown as Record<string, unknown> | undefined
      primaryCategory = (f?.primaryCategory as string | null) ?? null
      templateType = (f?.templateType as string | null) ?? null
    } catch {
      /* ArticleFacts なしでも継続 */
    }
    const dcSs = dc.sourceSite as { name?: string } | string | null
    const input: CrossCultureInput = {
      discoveredContentId: id,
      title: (dc.title as string | null) ?? null,
      excerpt: (dc.excerpt as string | null) ?? null,
      venue: (dc.venue as string | null) ?? null,
      contentType: (dc.contentType as string | null) ?? null,
      uxType: (dc.uxType as string | null) ?? null,
      templateType,
      primaryCategory,
      sourceName: dcSs && typeof dcSs === 'object' ? (dcSs.name ?? null) : ((dcSs as string | null) ?? null),
      sourceUrl: (dc.articleUrl as string | null) ?? null,
    }
    const cc = getOrComputeCrossCulture(input, { force: !!arg('force') })
    if (json) console.log(JSON.stringify({ discoveredContentId: id, input, result: cc }))
    else renderResult(`DC #${id}: ${String(dc.title ?? '').slice(0, 60)}`, cc)
    process.exit(0)
  }

  // 既定: audit
  const limit = Math.max(1, Math.min(1000, Number(arg('limit') ?? 50)))
  const statuses = (arg('status') ?? 'inbox')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'discovered-content',
    where: { curationStatus: { in: statuses } },
    limit,
    depth: 1,
    overrideAccess: true,
    sort: '-detectedAt',
  })
  const rows: {
    id: number
    title: string
    source: string
    mode: string
    top: string | null
    derivative: string[]
    editorial: string[]
  }[] = []
  const modeTally: Record<string, number> = {}
  const marketTally: Record<string, number> = {}
  for (const d of res.docs as unknown as Record<string, unknown>[]) {
    const ss = d.sourceSite as { name?: string } | null
    const cc = getOrComputeCrossCulture({
      discoveredContentId: d.id as number,
      title: (d.title as string | null) ?? null,
      excerpt: (d.excerpt as string | null) ?? null,
      venue: (d.venue as string | null) ?? null,
      contentType: (d.contentType as string | null) ?? null,
      uxType: (d.uxType as string | null) ?? null,
      sourceName: ss?.name ?? null,
      sourceUrl: (d.articleUrl as string | null) ?? null,
    })
    modeTally[cc.mode] = (modeTally[cc.mode] ?? 0) + 1
    for (const m of cc.derivativeMarkets) marketTally[m] = (marketTally[m] ?? 0) + 1
    rows.push({
      id: d.id as number,
      title: String(d.title ?? '').slice(0, 54),
      source: ss?.name ?? '',
      mode: cc.mode,
      top: cc.topMarket,
      derivative: cc.derivativeMarkets,
      editorial: cc.editorialMarkets,
    })
  }
  if (json) {
    console.log(JSON.stringify({ statuses, evaluated: rows.length, modeTally, marketTally, rows }))
    process.exit(0)
  }
  console.log(`=== CROSS CULTURE FILTER audit（status=${statuses.join(',')} / ${rows.length} 件・読み取り専用）===`)
  for (const r of rows) {
    const d = r.derivative.length ? `派生: ${r.derivative.join(',')}` : r.editorial.length ? `編集: ${r.editorial.join(',')}` : '—'
    console.log(`  DC #${String(r.id).padStart(3)}  ${r.mode === 'has_derivative' ? '◆' : '·'}  ${d.padEnd(28)}  「${r.title}」  <${r.source}>`)
  }
  console.log('────────────────────────────────────────────')
  console.log(`mode: ${Object.entries(modeTally).map(([k, v]) => `${k}=${v}`).join(' / ')}`)
  console.log(`派生候補になった市場: ${Object.entries(marketTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' / ') || 'なし'}`)
  console.log('※ スコアは仮説軸による推定。派生・有料の最終判断はマロン（Human-in-the-loop）。')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
