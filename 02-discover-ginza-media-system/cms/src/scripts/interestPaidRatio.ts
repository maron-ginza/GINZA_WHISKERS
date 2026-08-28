import { getPayload } from 'payload'

import { capturePaidRatio } from '../lib/interestDiscovery/capturePaidRatio'
import config from '../payload.config'

// `./p2 interest paid-ratio <theme|id> [--dry-run]` の CLI 実装
// （2026-08-28、Project 02-2 Phase B / B2）。
// note.com/hashtag/<theme> と ?paid_only=true の総記事数差分から paidRatio を
// 算出し interest-themes.monetization へ保存する。Claude API・有料API 呼び出しなし。

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const themeOrId = args.find((a) => !a.startsWith('--'))

  if (!themeOrId) {
    console.error('Usage: interestPaidRatio.ts <theme|id> [--dry-run]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const result = await capturePaidRatio(payload, themeOrId, { dryRun })
  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
