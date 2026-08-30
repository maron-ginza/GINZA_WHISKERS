import { getPayload } from 'payload'

import { runInterestDrivenDraftsFromThemes } from '../lib/ai/createInterestDrivenDraftsFromThemes'
import config from '../payload.config'

// `./p2 draft-interest [--dry-run] [--limit=N] [--strict] [--w-paid=N] [--c-match=N]`
// の CLI 実装（2026-08-28、Project 02-2 収益化②）。
//
// 承認済み interest-themes → topicInterestScore（既存 Phase A、無変更）
//   → monetizationMultiplier（Phase B / B2）→ finalRankScore で順位付け
//   → 承認済み DiscoveredContent へプレマッチ（C_MATCH）
//   → multi-angle の interest / ginza_whiskers 角度で Article(draft) 生成。
//
// --dry-run: 選定計画のみ（AI 呼び出し・DB 書き込みなし）。
// live 実行は選定テーマ数ぶん Claude API を呼ぶため、ラッパー（scripts/project02）
// 側で --yes を必須にしている。--w-paid / --c-match は 9月Trial の調整用上書き。

function parseNum(args: string[], flag: string): number | undefined {
  const f = args.find((a) => a.startsWith(`${flag}=`))
  if (!f) return undefined
  const n = Number(f.split('=')[1])
  if (!Number.isFinite(n)) throw new Error(`${flag} の値を数値として解釈できません: "${f.split('=')[1]}"`)
  return n
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const strict = args.includes('--strict')
  // Tier 1（2026-08-30）：主稿は ginza_whiskers。--with-interest 指定時のみ
  // interest 補助稿も生成する（主稿が成立した場合のみ保存される）。
  const withInterest = args.includes('--with-interest')
  const maxDrafts = parseNum(args, '--limit')
  const wPaid = parseNum(args, '--w-paid')
  const cMatch = parseNum(args, '--c-match')

  if (maxDrafts !== undefined && (!Number.isInteger(maxDrafts) || maxDrafts < 1)) {
    throw new Error(`--limit は 1 以上の整数で指定してください（受け取った値: ${maxDrafts}）`)
  }
  // --w-paid は monetization 補正の強さ。負値だと monetized テーマを不当に
  // 減点する（乗数 < 1）ため 0 以上のみ許可。
  if (wPaid !== undefined && wPaid < 0) {
    throw new Error(`--w-paid は 0 以上を指定してください（受け取った値: ${wPaid}）`)
  }
  // --c-match は「テーマ側 bigram 被覆率」のしきい値なので 0〜1 の範囲のみ。
  if (cMatch !== undefined && (cMatch < 0 || cMatch > 1)) {
    throw new Error(`--c-match は 0〜1 の範囲で指定してください（受け取った値: ${cMatch}）`)
  }

  const payload = await getPayload({ config })
  const result = await runInterestDrivenDraftsFromThemes(payload, {
    dryRun,
    strict,
    maxDrafts,
    wPaid,
    cMatch,
    withInterest,
  })

  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'live', ...result }))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
