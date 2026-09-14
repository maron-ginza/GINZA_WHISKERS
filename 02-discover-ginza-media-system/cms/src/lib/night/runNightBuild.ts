import type { Payload } from 'payload'

import { tokyoBusinessDate } from '../util/businessDate'
import { runDailyDraftsFromApproved } from '../ai/createDailyDraftsFromApproved'
import { buildNoteDraftPackage } from './buildNoteDraftPackage'
import type { NightBuildRunResult, NoteDraftPackage } from './types'

// Night Automation Layer の司令塔（2026-08-31）。
//
// フロー：
//   source collection / deduplication / scoring は既存の日次パイプライン
//   （SOURCE LEDGER Jobs Queue・./p2 crawl・./p2 score-articles）と
//   Maron Editor's Choice（人間承認）が担う。Night Layer はマロンが日中に
//   curationStatus=approved にした DiscoveredContent を入力に、
//     selection → article generation → fact/source validation → /note-draft
//   までを無人で進める。
//
//   selection + article generation は runDailyDraftsFromApproved を
//   **そのまま再利用**する（./p2 draft-today と同一コードパス。CORE 角度のみ、
//   reviewStatus=draft、Articles.beforeChange の人間承認ゲートは無変更）。
//
// **異常時**：BLOCKER 検出時点でそれ以降のパッケージ化を止め、
// haltedReason と unprocessed をキューに残す（呼び出し側スクリプトが書き出す）。
//
// **禁止**：公開・approve・削除・有料/無料変更・アカウント設定変更・
// mcp__claude-in-chrome__* の呼び出し。

export interface RunNightBuildOptions {
  maxArticles?: number
  since?: Date
  dryRun?: boolean
  now?: Date
}

export interface RunNightBuildOutput {
  result: NightBuildRunResult
  packages: NoteDraftPackage[]
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export async function runNightBuild(
  payload: Payload,
  options: RunNightBuildOptions = {},
): Promise<RunNightBuildOutput> {
  const now = options.now ?? new Date()
  const since = options.since ?? startOfDay(now)
  const maxArticles = options.maxArticles ?? 1
  const dryRun = options.dryRun ?? false
  const startedAt = new Date().toISOString()
  const date = tokyoBusinessDate(now)

  if (maxArticles < 1) {
    throw new Error(`maxArticles は 1 以上を指定してください（現在: ${maxArticles}）`)
  }

  // --- selection（+ dry-run はここまで）。runDailyDraftsFromApproved を再利用 ---
  const daily = await runDailyDraftsFromApproved(payload, {
    now,
    since,
    maxDrafts: maxArticles,
    dryRun,
  })

  const base: NightBuildRunResult = {
    mode: dryRun ? 'dry-run' : 'live',
    date,
    startedAt,
    finishedAt: startedAt,
    since: since.toISOString(),
    maxArticles,
    plan: {
      approvedFound: daily.approvedFound,
      selectedTopics: daily.selectedTopics.map((t) => ({
        discoveredContentId: t.discoveredContentId,
        title: t.title,
        editorialScore: t.editorialScore,
      })),
      deferredTopics: daily.deferredTopics.map((t) => ({
        discoveredContentId: t.discoveredContentId,
        title: t.title,
      })),
      alreadyDrafted: daily.alreadyDrafted.map((t) => ({
        discoveredContentId: t.discoveredContentId,
        title: t.title,
      })),
    },
    articles: [],
    failures: daily.failures.map((f) => ({
      discoveredContentId: f.discoveredContentId ?? null,
      title: f.title,
      reason: f.reason,
    })),
    haltedReason: null,
    queueDir: null,
  }

  if (dryRun) {
    base.finishedAt = new Date().toISOString()
    return { result: base, packages: [] }
  }

  // --- fact/source validation + /note-draft パッケージ化 ---
  const packages: NoteDraftPackage[] = []
  let halted = false

  for (const created of daily.createdDrafts) {
    if (halted) break
    try {
      const pkg = await buildNoteDraftPackage(payload, created.articleId)
      packages.push(pkg)
      base.articles.push({
        articleId: created.articleId,
        discoveredContentId: pkg.discoveredContentId,
        title: pkg.title,
        status: pkg.status,
        blockers: pkg.validation.blockers,
        warnings: pkg.validation.warnings,
        packageDir: null, // スクリプト側で書き出しパスを埋める
      })
      if (pkg.validation.blockers.length > 0) {
        halted = true
        base.haltedReason =
          `Article #${created.articleId} で BLOCKER を検出したため処理を停止しました` +
          `（${pkg.validation.blockers.map((b) => b.code).join(', ')}）`
      }
    } catch (err) {
      base.articles.push({
        articleId: created.articleId,
        discoveredContentId: created.discoveredContentId ?? null,
        title: created.title,
        status: 'error',
        blockers: [
          {
            level: 'blocker',
            code: 'packageError',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
        warnings: [],
        packageDir: null,
      })
      halted = true
      base.haltedReason = `Article #${created.articleId} のパッケージ化で例外が発生したため処理を停止しました`
    }
  }

  // 生成自体が失敗していた場合も異常として明示（draft-today は失敗を握って続行するため）
  if (!base.haltedReason && daily.failures.length > 0) {
    base.haltedReason = `記事生成に失敗したトピックが ${daily.failures.length} 件あります（failures 参照）`
  }

  base.finishedAt = new Date().toISOString()
  return { result: base, packages }
}
