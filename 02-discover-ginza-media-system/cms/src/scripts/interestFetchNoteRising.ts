import { getPayload } from 'payload'

import { captureNoteRisingTags } from '../lib/interestDiscovery/captureNoteRisingTags'
import config from '../payload.config'

// `./p2 interest fetch-note-rising [--dry-run]` のCLI実装（2026-08-27）。
// Project 02-2 Phase A「Interest Discovery」最小実装——note.com/trendの
// 急上昇タグ上位5件のみを対象にした試験取得。Claude API・外部有料APIは
// 一切呼び出さない（noteの公開HTMLページへのGETリクエストのみ）。
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const payload = await getPayload({ config })
  const result = await captureNoteRisingTags(payload, { dryRun })

  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON
  // （spinner/警告ログ等の他出力と混ざっても`grep '^{' | tail -1`で確実に分離できるようにする）。
  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
