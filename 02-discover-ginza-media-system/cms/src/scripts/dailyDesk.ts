import { getPayload } from 'payload'

import { getDailyEditorialDeskRanking } from '../lib/curation/dailyRanking'
import config from '../payload.config'

// `./p2 daily` から呼び出すCLIエントリ（2026-08-17、Event Date Extraction/
// Story Clustering拡張で更新）。Daily Editorial Deskの考え方——
// A.当日新規/更新検知、B.現在開催中、C.近日開催で今日知る価値がある——
// のみを母集団とし、同一イベント・企画の複数URLは1 Story Cluster＝1枠に
// まとめてEditorial Score順ランキングを表示する。読み取り専用、新規の
// AI呼び出し・DB書き込みは一切行わない。

// CLI出力は`./p2 daily`のシェルラッパーが`tail -1`で1行JSONとして読み取る
// ため、候補数が多いと出力が肥大化しパイプのバッファ上限で切り詰められる
// 事象が実地で発生した（2026-08-17、160件のDaily候補で64KBを超過し破損）。
// フォーマッタはどのみちTop10＋残数しか表示しないため、CLI出力自体を
// 上限件数で切り詰める（総数・プールサイズ等の集計値はフル計算のまま保持）。
const MAX_CLI_ENTRIES = 30

async function main() {
  const payload = await getPayload({ config })
  const ranking = await getDailyEditorialDeskRanking(payload)

  console.log(
    JSON.stringify({
      ...ranking,
      entries: ranking.entries.slice(0, MAX_CLI_ENTRIES),
      entriesTruncated: ranking.entries.length > MAX_CLI_ENTRIES,
    }),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
