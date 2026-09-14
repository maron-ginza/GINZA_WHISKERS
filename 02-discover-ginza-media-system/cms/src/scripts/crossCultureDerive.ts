// GINZA WHISKERS / Project 02 — CROSS CULTURE 派生記事の生成 CLI（2026-09-04）
//
//   ./p2 crossculture derive <DiscoveredContent の数値ID> [--yes] [--market=France] [--max=N] [--json]
//
//   ・既定は dry-run：派生プラン＋生成プロンプト注入テキストを表示（DB 書き込み・AI・課金なし）。
//   ・--yes：selectedMarkets（既定1市場）ごとに ginza_whiskers 角度で
//     Article(reviewStatus:draft) を「別候補」として生成（通常記事は上書きしない）。
//     ※ 有効な ANTHROPIC_API_KEY が必要。無効なら generationErrors に出て通常フローは無影響。
//   ・score>=70 の市場のみ派生。50-69 は編集候補として表示のみ。49以下は使わない。

import { getPayload } from 'payload'

import config from '../payload.config'
import { createCrossCultureDerivativeDrafts } from '../lib/ai/createCrossCultureDerivativeDrafts'

function flag(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : 'true'
}

async function main(): Promise<void> {
  const id = Number(process.argv[2])
  if (!Number.isInteger(id)) {
    console.error('Usage: ./p2 crossculture derive <DiscoveredContent の数値ID> [--yes] [--market=France] [--max=N] [--json]')
    process.exit(1)
  }
  const dryRun = !flag('yes')
  const json = !!flag('json')
  const onlyMarket = flag('market')
  const maxMarkets = flag('max') ? Math.max(1, Number(flag('max'))) : 1

  const payload = await getPayload({ config })
  const res = await createCrossCultureDerivativeDrafts(payload, id, {
    dryRun,
    onlyMarket,
    maxMarkets,
    force: !!flag('force'),
  })

  if (json) {
    console.log(JSON.stringify(res))
    process.exit(0)
  }

  console.log(`=== CROSS CULTURE 派生記事 ${dryRun ? '（dry-run：DB書き込み・AI・課金なし）' : '（LIVE：--yes）'} ===`)
  console.log(`DC #${id}   mode=${res.mode}`)
  console.log(`  ${res.reason}`)
  console.log('────────────────────────────────────────────')

  const p = res.plan
  if (p.editorialOnlyMarkets.length) {
    console.log('■ 編集候補として保持（50-69・自動派生しない）:')
    for (const e of p.editorialOnlyMarkets) console.log(`  ・${e.market} score ${e.score}  角度案: ${e.suggestedAngle || '—'}`)
  }
  if (p.excludedMarkets.length) {
    console.log(`■ 除外（<50・本文生成に使わない）: ${p.excludedMarkets.map((e) => `${e.market}:${e.score}`).join(' / ')}`)
  }

  if (res.mode === 'none') {
    console.log('\n→ CROSS CULTURE 派生なし。通常記事のみで正常。')
    process.exit(0)
  }

  console.log(`\n■ 派生記事候補（score>=70・記事価値順・最大 ${maxMarkets} 市場）:`)
  for (const sm of p.selectedMarkets) {
    console.log(`\n  ▼ ${sm.market}  score ${sm.score}  [${sm.articlePotential} / confidence ${sm.confidence}]`)
    console.log(`     軸: ${sm.matchedAxes.join('・') || '—'}`)
    console.log(`     角度: ${sm.suggestedAngle}`)
    console.log(`     有料/無料の根拠: ${sm.potentialReason}`)
    console.log(`     本文で事実として書ける確認済み情報: ${sm.confirmedForBody.length ? sm.confirmedForBody.join(' ／ ') : '（なし＝断定させない）'}`)
    console.log('     ガードレール:')
    for (const g of sm.guardrails) console.log(`       - ${g}`)
    console.log('     ── 生成プロンプトへ渡す注入テキスト ──')
    for (const line of sm.promptInjection.split('\n')) console.log(`     │ ${line}`)
  }

  if (!dryRun) {
    console.log('\n■ 生成結果:')
    for (const a of res.createdArticles)
      console.log(`  ✅ Article #${a.articleId}  [${a.market} / ${a.articlePotential}]  「${a.title}」${a.warnings?.length ? `  WARNING: ${a.warnings.join(',')}` : ''}`)
    for (const e of res.generationErrors) console.log(`  ⚠ ${e.market}: ${e.error}`)
    console.log('  ※ すべて reviewStatus:draft。通常記事は上書きしていない。公開はマロンが手動。')
  } else {
    console.log('\n→ dry-run。--yes で上記注入テキストを使い ginza_whiskers 角度で別候補を生成します（有効な ANTHROPIC_API_KEY 必須）。')
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
