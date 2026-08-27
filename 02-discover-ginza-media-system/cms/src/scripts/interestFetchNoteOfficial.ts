import { getPayload } from 'payload'

import { captureNoteOfficialTopics } from '../lib/interestDiscovery/captureNoteOfficialTopics'
import config from '../payload.config'

// `./p2 interest fetch-note-official [--dry-run]` のCLI実装（2026-08-27）。
// Project 02-2 Phase A「Interest Discovery」Priority 2試験実装——note.com/
// info/rssから現在開催中と推定できるお題・コンテストのみを対象にした試験取得。
// Claude API・外部有料APIは一切呼び出さない（note公開RSSへのGETのみ）。
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const payload = await getPayload({ config })
  const result = await captureNoteOfficialTopics(payload, { dryRun })

  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON。
  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
