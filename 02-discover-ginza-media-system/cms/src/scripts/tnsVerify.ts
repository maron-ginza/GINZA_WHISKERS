import { getPayload } from 'payload'

import config from '../payload.config'
import {
  diagnose,
  loadSnapshot,
  parseArgs,
  printChecks,
  printReport,
  readiness,
  resolveTargets,
  summarize,
} from '../lib/tns/maintenance'

// 🌈TNS 週次エディションの最終検証（2026-08-30）。読み取り専用。
//
//   npm run tns:verify
//   npm run tns:verify -- --edition=11 --article=50
//
// 修正後に 7曜日・7画像・本文・status を再検証し、問題がなければ
// 「READY FOR NOTE」を表示する。終了コード: 0=READY / 1=NOT READY / 2=BLOCKER。

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = resolveTargets(args)
  const payload = await getPayload({ config })

  const snap = await loadSnapshot(payload, targets)
  const findings = diagnose(snap)
  const sum = summarize(findings)
  printReport('TNS VERIFY', targets, findings, sum)

  if (sum.hasBlocker) {
    console.log('\n⛔ NOT READY — BLOCKER を解消してください。')
    process.exit(2)
  }

  const { ready, checks } = readiness(snap, findings)
  printChecks(checks)

  if (ready) {
    console.log(`\n✅ READY FOR NOTE — #${targets.editionNumber}（edition id=${targets.editionId} / article id=${targets.articleId}）は note 転記可能な状態です。`)
    console.log('   残る工程（note 上での作業）: 曜日ごとの挿絵7点の配置 / 7曲の YouTube 動画URL 挿入 / 最終レイアウト確認 → その後 approve。')
    process.exit(0)
  }

  console.log('\n⛔ NOT READY — 上記 READINESS CHECKS の未達（✗）項目を解消してください。')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
