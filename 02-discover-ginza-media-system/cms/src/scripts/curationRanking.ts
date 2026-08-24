import { getPayload } from 'payload'

import { getCurationRanking } from '../lib/curation/ranking'
import config from '../payload.config'

// `./p2 ranking [--all]` から呼び出すCLIエントリ。Editorial Score順にInbox候補を
// ランキング表示する（読み取り専用、新規のAI呼び出し・DB書き込みは一切行わない）。
// --all を付けるとeditorialStatusに関わらず全Sourcesを対象にする（既定はinboxのみ）。

async function main() {
  const onlyInbox = !process.argv.includes('--all')

  const payload = await getPayload({ config })
  const ranking = await getCurationRanking(payload, { onlyInbox })

  console.log(JSON.stringify(ranking))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
