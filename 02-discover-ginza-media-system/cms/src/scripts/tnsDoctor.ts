import { getPayload } from 'payload'

import config from '../payload.config'
import { diagnose, loadSnapshot, parseArgs, printReport, resolveTargets, summarize } from '../lib/tns/maintenance'

// 🌈TNS 週次エディションの自動診断（2026-08-30）。読み取り専用。
//
//   npm run tns:doctor                 # 既定 edition id=11 / #36 / article id=50
//   npm run tns:doctor -- --json       # 機械可読出力
//   npm run tns:doctor -- --edition=11 --article=50 --edition-number=36
//   npm run tns:doctor -- --skip-number-check
//
// 終了コード: 0=クリーン / 1=WARN あり / 2=BLOCKER あり
//
// 確認項目:
//   - edition / article の存在・editionNumber・相互リンク
//   - article.reviewStatus（draft 以外は BLOCKER）
//   - dailyScenes 7曜日（月→日整列・連続7日・weekStart/weekEnd 整合）
//   - 選曲 trackRef 7件（未設定・週内重複・過去使用台帳との重複・邦洋バランス）
//   - 世界観挿絵 7件・visualStatus の実態整合
//   - translationStatus（ja=complete / en）
//   - 本文の内部コード露出（TNS Editorial Code / fixedMoodLabel / codeN）
//   - 本文の GINZA CODE 見出し形式・note向けハッシュタグ行

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const targets = resolveTargets(args)
  const payload = await getPayload({ config })

  const snap = await loadSnapshot(payload, targets)
  const findings = diagnose(snap)
  const sum = summarize(findings)

  if (args.has('json')) {
    console.log(JSON.stringify({ targets, summary: sum, findings }, null, 2))
  } else {
    printReport('TNS DOCTOR', targets, findings, sum)
  }

  process.exit(sum.hasBlocker ? 2 : sum.warn > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
