import { getPayload } from 'payload'

import { importMusicTracksCandidates } from '../lib/tns/importMusicTracksCandidates'
import { parseMusicTracksImportFile } from '../lib/tns/parseMusicTracksImportFile'
import config from '../payload.config'

// TNS MusicTracks 候補曲一括インポートCLI（2026-08-27）。
// 実行例：
//   node --env-file=.env --import=tsx/esm src/scripts/importTnsMusicTracks.ts <file.csv|file.json> [--dry-run]
// `./p2 tns import-tracks <file> [--dry-run]` からも呼び出せる（scripts/project02参照）。
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filePath = args.find((a) => !a.startsWith('--'))

  if (!filePath) {
    console.error('Usage: importTnsMusicTracks.ts <file.csv|file.json> [--dry-run]')
    process.exit(1)
  }

  const rows = parseMusicTracksImportFile(filePath)
  const payload = await getPayload({ config })
  const report = await importMusicTracksCandidates(payload, rows, { dryRun })

  // scripts/project02の既存コマンド群と同じ規約：最終出力は1行JSON
  // （spinner/警告ログ等の他出力と混ざっても`tail -1`で確実に分離できるようにする）。
  console.log(JSON.stringify(report))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
