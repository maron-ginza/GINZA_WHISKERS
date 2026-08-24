import { getPayload } from 'payload'

import { persistStoryClusters } from '../lib/curation/persistStoryClusters'
import config from '../payload.config'

// `./p2 clusters [--dry-run]` から呼び出すCLIエントリ（2026-08-17）。
// Story Clusters（storyClustering.ts）を再計算し、StoryClustersコレクションへ
// 反映する。DiscoveredContent自体は削除・変更しない
// （persistStoryClusters.tsのコメント参照）。--dry-runで実際の書き込みなしに
// 計算結果のみ確認できる。

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const payload = await getPayload({ config })
  const result = await persistStoryClusters(payload, { persist: !dryRun })

  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
