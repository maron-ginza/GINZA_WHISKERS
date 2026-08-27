import { getPayload } from 'payload'

import { captureNoteHashtagPopular } from '../lib/interestDiscovery/captureNoteHashtagPopular'
import config from '../payload.config'

// `./p2 interest fetch-note-hashtag <tag> [--dry-run]` のCLI実装（2026-08-27）。
// Project 02-2 Phase A「Interest Discovery」Priority 1補強——note.com/hashtag/
// <tag>（人気=既定ソート）の総記事数・関連タグを取得する試験実装。対象タグは
// 引数で明示的に指定する（特定のタグを既定値としてハードコードしない——
// 銀座変換はPhase Cの役割であり、Phase Aは汎用の情報源のまま維持する）。
// Claude API・外部有料APIは一切呼び出さない（note公開HTMLページへのGETのみ）。
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const tag = args.find((a) => !a.startsWith('--'))

  if (!tag) {
    console.error('Usage: interestFetchNoteHashtag.ts <tag> [--dry-run]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const result = await captureNoteHashtagPopular(payload, tag, { dryRun })

  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON。
  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
