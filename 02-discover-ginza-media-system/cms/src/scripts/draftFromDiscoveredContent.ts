// GINZA WHISKERS / Project 02（2026-09-12）— 単一DiscoveredContentからCORE角度1本だけを
// 生成する、朝刊自動化の「承認後だけ記事下書きを生成」を支える最小スコープの入口。
//
// 既存の `./p2 draft-today` は「当日approvedの全DiscoveredContentから類似テーマを束ね、
// 上位トピックを最大5本」という広いスコープで動く。朝刊レビュー画面
// （candidateReviewServer.ts）の「承認」ボタンは、マロンが選んだ**その1件だけ**を
// 記事化したい——他に承認済みだが無関係のDCが残っていた場合にそれらも巻き込んで
// 生成してしまうと、意図しない記事・意図しない課金が発生しうる。そのため
// `createMultiAngleDraftsFromDiscoveredContent`（draft-todayの内部で使われているのと
// 同じ関数）を、指定した1つのdiscoveredContentIdに対してだけ、CORE角度のみで直接呼ぶ。
//
// 生成物は既存と同じ reviewStatus:draft（人間承認ゲート・Articles.beforeChangeは無変更）。
// 自動公開・自動note投稿はしない。
//
// 使い方: node --env-file=.env --import=tsx/esm src/scripts/draftFromDiscoveredContent.ts --dc=<id>

import { getPayload } from 'payload'
import config from '../payload.config'
import { createMultiAngleDraftsFromDiscoveredContent } from '../lib/ai/createMultiAngleDraftsFromDiscoveredContent'

async function main() {
  const args = process.argv.slice(2)
  const dcArg = args.find((a) => a.startsWith('--dc='))
  if (!dcArg) throw new Error('--dc=<DiscoveredContent id> は必須です')
  const dcId = Number(dcArg.split('=')[1])
  if (!Number.isFinite(dcId)) throw new Error(`--dc の値を数値として解釈できません: "${dcArg}"`)

  const payload = await getPayload({ config })

  // 二重生成防止：既にこのDCから生成済みのArticleがあれば新規生成しない
  // （editorialProvenance逆引き、既存draft-today/multi-angleと同じ判定方式）。
  const existing = await payload.find({
    collection: 'articles',
    where: { 'editorialProvenance.discoveredContentSource': { equals: dcId } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    console.log(
      JSON.stringify({
        discoveredContentId: dcId,
        createdArticles: [],
        skipped: true,
        reason: `既に生成済み（Article #${existing.docs.map((a) => a.id).join(', #')}）`,
      }),
    )
    process.exit(0)
  }

  const result = await createMultiAngleDraftsFromDiscoveredContent(payload, dcId, {
    angles: ['core'],
    enableCoreGuards: true,
  })
  console.log(JSON.stringify(result))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
