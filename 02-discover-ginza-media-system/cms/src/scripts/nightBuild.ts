import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { tokyoBusinessDate } from '../lib/util/businessDate'
import { writePackage, upsertQueueIndex } from '../lib/night/queueWriter'

import type { SameDayReviewQueueIndex } from '../lib/night/types'

// `./p2 night <run|review|status|package>` の CLI 実装（2026-08-31、Night Automation Layer）。
//
//   node --env-file=.env --import=tsx/esm src/scripts/nightBuild.ts [--max=N] [--dry-run] [--since=YYYY-MM-DD]
//   node --env-file=.env --import=tsx/esm src/scripts/nightBuild.ts --package=<articleId>
//   node --env-file=.env --import=tsx/esm src/scripts/nightBuild.ts --review
//   node --env-file=.env --import=tsx/esm src/scripts/nightBuild.ts --status
//
// run（既定）：当日 curationStatus=approved の DiscoveredContent から最大 N 本
//   （既定 1）を CORE 角度で記事ドラフト化し、fact/source 検証 → /note-draft
//   パッケージ → Same-day Review Queue まで書き出す。--dry-run は選定計画のみ
//   （AI 呼び出し・DB 書き込みなし）。live 実行は選定トピック数だけ Claude API
//   を呼ぶため、ラッパー（scripts/project02）側で --yes を必須にしている。
// review/status：DB 不要。.devlogs/night/ のキュー・実行ログを読むだけ。
// package：既存の draft Article 1 本を /note-draft パッケージへ再変換する。
//
// **公開・approve・削除・有料/無料変更・アカウント設定変更・
//   mcp__claude-in-chrome__* の呼び出しは一切しない。**
// 出力の最終行は 1 行 JSON（既存コマンドと同じ規約：`grep '^{' | tail -1` で分離可能）。

const ROOT = path.resolve(process.cwd(), '..')
const NIGHT_DIR = path.join(ROOT, '.devlogs', 'night')
const QUEUE_ROOT = path.join(NIGHT_DIR, 'queue')

function todayStr(d = new Date()): string {
  // 業務日付＝Asia/Tokyo の暦日（サーバ TZ に依存しない・UTC 切り出しをしない）
  return tokyoBusinessDate(d)
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

function readJsonIfExists<T>(p: string): T | null {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T
  } catch {
    return null
  }
}

function emit(obj: unknown): void {
  // 最終行 1 行 JSON（先頭が `{`）
  console.log(JSON.stringify(obj))
}

// ---- review / status（DB 不要） --------------------------------------------

function listQueueDates(): string[] {
  if (!existsSync(QUEUE_ROOT)) return []
  return readdirSync(QUEUE_ROOT)
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort()
}

function runReview(dateArg?: string): void {
  const date = dateArg ?? listQueueDates().slice(-1)[0] ?? todayStr()
  const idx = readJsonIfExists<SameDayReviewQueueIndex>(
    path.join(QUEUE_ROOT, date, '_index.json'),
  )
  emit({
    mode: 'review',
    date,
    found: !!idx,
    index: idx,
    availableDates: listQueueDates(),
  })
}

function runStatus(): void {
  const date = todayStr()
  const runLog = path.join(NIGHT_DIR, `run_${date}.jsonl`)
  let lastRun: unknown = null
  if (existsSync(runLog)) {
    const lines = readFileSync(runLog, 'utf8').trim().split('\n').filter(Boolean)
    if (lines.length > 0) {
      try {
        lastRun = JSON.parse(lines[lines.length - 1])
      } catch {
        lastRun = null
      }
    }
  }
  emit({
    mode: 'status',
    date,
    hasRunToday: !!lastRun,
    lastRun,
    availableQueueDates: listQueueDates(),
  })
}

// ---- パッケージ書き出し ---------------------------------------------------
// writePackage / upsertQueueIndex の実体は lib/night/queueWriter.ts へ移設した
// （2026-09-18。挙動は無変更、上で import 済み）。

// ---- run（DB 必要） ----------------------------------------------------------

async function runNight(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run')
  const maxFlag = args.find((a) => a.startsWith('--max='))
  const maxArticles = maxFlag ? Number(maxFlag.split('=')[1]) : 1
  if (!Number.isInteger(maxArticles) || maxArticles < 1) {
    throw new Error(`--max は 1 以上の整数で指定してください（受け取った値: "${maxFlag}"）`)
  }
  const sinceFlag = args.find((a) => a.startsWith('--since='))
  let since: Date | undefined
  if (sinceFlag) {
    const v = sinceFlag.split('=')[1]
    since = new Date(`${v}T00:00:00`)
    if (Number.isNaN(since.getTime())) {
      throw new Error(`--since の日付を解釈できません: "${v}"（YYYY-MM-DD 形式）`)
    }
  }

  // 運用ルール（2026-08-31 方針変更）：Project 02 は収益化前のため、
  // ANTHROPIC_API_KEY を使う従量課金の夜間自動生成（live night run）は実施しない。
  // ここで payload / Anthropic クライアントを import する前に停止する
  // （有料 API 呼び出しが構造的に起きないようにする二重ガード。scripts/project02
  // 側にも同じゲートがある）。--dry-run は選定計画のみで課金が無いため許可。
  if (!dryRun && process.env.NIGHT_RUN_LIVE_ENABLED !== '1') {
    emit({
      mode: 'disabled',
      reason:
        'live night run は現在の運用ルールで無効化されています（Project 02 収益化前・従量課金の夜間自動生成は実施しない）。' +
        '課金なしの ./p2 night run --dry-run / review / status / package を使うか、' +
        '再開する場合は cms/.env に NIGHT_RUN_LIVE_ENABLED=1 を追加してください。',
    })
    process.exit(0)
  }

  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const { runNightBuild } = await import('../lib/night/runNightBuild')

  const payload = await getPayload({ config })
  const now = new Date()
  const date = todayStr(now)
  const runId = `night_${now.toISOString()}`

  const { result, packages } = await runNightBuild(payload, { maxArticles, since, dryRun, now })

  ensureDir(NIGHT_DIR)

  if (dryRun) {
    // dry-run は選定計画のみ。キュー・パッケージは書かない。
    appendFileSync(
      path.join(NIGHT_DIR, `run_${date}.jsonl`),
      JSON.stringify({ ...result, runId }) + '\n',
      'utf8',
    )
    emit({ ...result, runId, packagesWritten: 0, queueIndex: null })
    process.exit(0)
  }

  // --- パッケージ書き出し + キュー更新 ---
  const dirs: Record<number, string> = {}
  for (const pkg of packages) {
    dirs[pkg.articleId] = writePackage(date, pkg)
  }
  for (const a of result.articles) {
    if (dirs[a.articleId]) a.packageDir = path.relative(ROOT, dirs[a.articleId])
  }

  // 異常時に「最後まで進められなかった」トピックを unprocessed として残す
  const packagedIds = new Set(packages.map((p) => p.articleId))
  const unprocessed: SameDayReviewQueueIndex['unprocessed'] = []
  for (const f of result.failures) {
    unprocessed.push({
      discoveredContentId: f.discoveredContentId,
      title: f.title,
      reason: `記事生成に失敗: ${f.reason}`,
    })
  }
  if (result.haltedReason) {
    for (const t of result.plan.selectedTopics) {
      const stillPending =
        !packagedIds.size ||
        !result.articles.some((a) => a.discoveredContentId === t.discoveredContentId)
      if (stillPending && !result.failures.some((f) => f.discoveredContentId === t.discoveredContentId)) {
        unprocessed.push({
          discoveredContentId: t.discoveredContentId,
          title: t.title,
          reason: `異常検出により未処理（${result.haltedReason}）`,
        })
      }
    }
  }

  const reviewStatusByArticle: Record<number, string> = {}
  for (const pkg of packages) reviewStatusByArticle[pkg.articleId] = 'draft'

  let queueIndexPath: string | null = null
  if (packages.length > 0 || unprocessed.length > 0) {
    queueIndexPath = upsertQueueIndex(
      date,
      runId,
      packages,
      dirs,
      unprocessed,
      reviewStatusByArticle,
    )
    result.queueDir = path.relative(ROOT, path.join(QUEUE_ROOT, date))
  }

  // 実行ログ（機械可読）
  appendFileSync(
    path.join(NIGHT_DIR, `run_${date}.jsonl`),
    JSON.stringify({ ...result, runId }) + '\n',
    'utf8',
  )

  // サマリ（人間可読）
  const okCount = result.articles.filter((a) => a.status === 'ok').length
  const warnCount = result.articles.filter((a) => a.status === 'warning').length
  const blockedCount = result.articles.filter(
    (a) => a.status === 'blocked' || a.status === 'error',
  ).length
  const summaryLines = [
    `=== Night Build  ${new Date().toLocaleString('ja-JP')}  (${date}) ===`,
    `  mode: ${result.mode}  max: ${maxArticles}`,
    `  approvedFound: ${result.plan.approvedFound}  selected: ${result.plan.selectedTopics.length}`,
    `  packaged: ${packages.length}  (ok ${okCount} / warning ${warnCount} / blocked ${blockedCount})`,
    ...result.articles.map(
      (a) =>
        `    - Article #${a.articleId} [${a.status}] ${a.title}` +
        (a.blockers.length ? `  BLOCKER:${a.blockers.map((b) => b.code).join(',')}` : '') +
        (a.warnings.length ? `  WARN:${a.warnings.map((w) => w.code).join(',')}` : ''),
    ),
    result.haltedReason ? `  HALTED: ${result.haltedReason}` : `  RESULT: OK`,
    unprocessed.length ? `  unprocessed: ${unprocessed.length} 件（Same-day Review Queue に記録）` : '',
    '',
  ].filter(Boolean)
  appendFileSync(path.join(NIGHT_DIR, 'night_collect.log'), summaryLines.join('\n') + '\n', 'utf8')

  emit({
    ...result,
    runId,
    packagesWritten: packages.length,
    unprocessedCount: unprocessed.length,
    queueIndex: queueIndexPath ? path.relative(ROOT, queueIndexPath) : null,
  })
  process.exit(0)
}

async function runPackage(articleId: number): Promise<void> {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const { buildNoteDraftPackage } = await import('../lib/night/buildNoteDraftPackage')

  const payload = await getPayload({ config })
  const pkg = await buildNoteDraftPackage(payload, articleId)
  const date = todayStr()
  ensureDir(NIGHT_DIR)
  const dir = writePackage(date, pkg)
  upsertQueueIndex(date, `package_${new Date().toISOString()}`, [pkg], { [pkg.articleId]: dir }, [], {
    [pkg.articleId]: 'draft',
  })
  emit({
    mode: 'package',
    articleId,
    status: pkg.status,
    blockers: pkg.validation.blockers,
    warnings: pkg.validation.warnings,
    packageDir: path.relative(ROOT, dir),
  })
  process.exit(0)
}

// note 転記前チェック（項目7）。draft/approved/published いずれも対象（読み取り専用）。
// キュー index は触らず、note-body.txt / note-draft.json は同一内容で上書き（冪等）。
async function runCheck(articleId: number): Promise<void> {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../payload.config')
  const { buildNoteDraftPackage } = await import('../lib/night/buildNoteDraftPackage')

  const payload = await getPayload({ config })
  const pkg = await buildNoteDraftPackage(payload, articleId, { allowNonDraft: true })
  const date = todayStr()
  ensureDir(NIGHT_DIR)
  const dir = writePackage(date, pkg)
  emit({
    mode: 'note_check',
    articleId,
    status: pkg.status,
    noteMeta: pkg.noteMeta,
    bodyChars: [...pkg.body].length,
    headings: (pkg.images || []).filter((i) => i.role === 'section').length,
    hashtags: pkg.hashtags.note,
    sourceUrls: pkg.links.sourceUrls,
    provenance: { confirmed: pkg.provenance.confirmed, unconfirmed: pkg.provenance.unconfirmed, conflicting: pkg.provenance.conflicting },
    unconfirmedFacts: pkg.provenance.facts.filter((f) => f.verificationStatus !== 'confirmed').map((f) => f.fact),
    cleanupRemoved: pkg.cleanup.removed,
    blockers: pkg.validation.blockers,
    warnings: pkg.validation.warnings,
    files: {
      body: path.relative(ROOT, path.join(dir, 'note-body.txt')),
      json: path.relative(ROOT, path.join(dir, 'note-draft.json')),
    },
    postPublishRecord: [
      'publishHistory に { channel:"note", publishedAt:<note公開日時>, reference:<note URL> } を追加',
      'reviewStatus を運用仕様に沿って更新（#58 前例＝published）',
      'noteMeta.publicNoteUrl / publishedAt / transferStatus を確認',
    ],
  })
  process.exit(0)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--review')) {
    const dateFlag = args.find((a) => a.startsWith('--date='))
    runReview(dateFlag ? dateFlag.split('=')[1] : undefined)
    process.exit(0)
  }
  if (args.includes('--status')) {
    runStatus()
    process.exit(0)
  }
  const pkgFlag = args.find((a) => a.startsWith('--package='))
  if (pkgFlag) {
    const id = Number(pkgFlag.split('=')[1])
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`--package は Article の数値 ID で指定してください（受け取った値: "${pkgFlag}"）`)
    }
    await runPackage(id)
    return
  }

  const checkFlag = args.find((a) => a.startsWith('--check='))
  if (checkFlag) {
    const id = Number(checkFlag.split('=')[1])
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`--check は Article の数値 ID で指定してください（受け取った値: "${checkFlag}"）`)
    }
    await runCheck(id)
    return
  }

  await runNight(args)
}

main().catch((err) => {
  console.error(err)
  // 失敗も 1 行 JSON で返す（ラッパーが検知できるように）
  console.log(JSON.stringify({ mode: 'error', error: err instanceof Error ? err.message : String(err) }))
  process.exit(1)
})
