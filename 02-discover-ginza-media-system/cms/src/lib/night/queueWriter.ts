// GINZA WHISKERS / Project 02（2026-09-18、マロン指示：note-drafts.json → Articles
// ブリッジのための抽出）。
//
// Same-day Review Queue（.devlogs/night/queue/<date>/<articleId>/）への書き出し
// ロジックを nightBuild.ts（CLIスクリプト）から切り出しただけの純粋な移設
// ——挙動は一切変更していない。nightBuild.ts の main() は無条件に自己実行される
// （import.meta.url ガードが無い）ため、bridgeNoteDraftsToArticles.ts のような
// 別モジュールから nightBuild.ts を直接 import すると意図しない CLI 実行が
// 走ってしまう。それを避けるため、副作用を持たないこのファイルへ writePackage /
// upsertQueueIndex を移し、nightBuild.ts 側はここから import して使う形にした。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

import type {
  SameDayReviewQueueIndex,
  SameDayReviewQueueItem,
  NoteDraftPackage,
} from './types'

const ROOT = path.resolve(process.cwd(), '..')
const NIGHT_DIR = path.join(ROOT, '.devlogs', 'night')
const QUEUE_ROOT = path.join(NIGHT_DIR, 'queue')

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

export function writePackage(date: string, pkg: NoteDraftPackage): string {
  const dir = path.join(QUEUE_ROOT, date, String(pkg.articleId))
  ensureDir(dir)
  writeFileSync(path.join(dir, 'note-draft.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  writeFileSync(path.join(dir, 'note-body.txt'), pkg.body, 'utf8')
  if (pkg.validation.blockers.length > 0 || pkg.status === 'error') {
    const lines = [
      `Article #${pkg.articleId}  ${pkg.title}`,
      `status: ${pkg.status}`,
      '',
      'BLOCKERS:',
      ...pkg.validation.blockers.map((b) => `  - [${b.code}] ${b.message}`),
      '',
      'この項目は note 下書きに進めず、Same-day Review でマロンが判断してください。',
      '',
    ]
    writeFileSync(path.join(dir, 'ERROR.txt'), lines.join('\n'), 'utf8')
  }
  return dir
}

export function upsertQueueIndex(
  date: string,
  runId: string,
  packages: NoteDraftPackage[],
  dirs: Record<number, string>,
  unprocessed: SameDayReviewQueueIndex['unprocessed'],
  reviewStatusByArticle: Record<number, string>,
): string {
  const idxPath = path.join(QUEUE_ROOT, date, '_index.json')
  const existing = readJsonIfExists<SameDayReviewQueueIndex>(idxPath)
  const items: SameDayReviewQueueItem[] = existing?.items ? [...existing.items] : []

  for (const pkg of packages) {
    const item: SameDayReviewQueueItem = {
      articleId: pkg.articleId,
      discoveredContentId: pkg.discoveredContentId,
      title: pkg.title,
      status: pkg.status,
      blockerCount: pkg.validation.blockers.length,
      warningCount: pkg.validation.warnings.length,
      packageDir: path.relative(ROOT, dirs[pkg.articleId] ?? ''),
      reviewStatus: reviewStatusByArticle[pkg.articleId] ?? 'draft',
      createdAt: pkg.generatedAt,
    }
    const at = items.findIndex((i) => i.articleId === pkg.articleId)
    if (at >= 0) items[at] = item
    else items.push(item)
  }

  const idx: SameDayReviewQueueIndex = {
    date,
    updatedAt: new Date().toISOString(),
    runs: [...(existing?.runs ?? []), runId],
    items,
    unprocessed: [...(existing?.unprocessed ?? []), ...unprocessed],
  }
  ensureDir(path.join(QUEUE_ROOT, date))
  writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n', 'utf8')
  return idxPath
}
