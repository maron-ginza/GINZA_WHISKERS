import type { Payload } from 'payload'

// Interest Discovery各取得スクリプト（note_rising/note_hashtag_popular等）で
// 共有する「本日重複防止」ヘルパー（2026-08-27）。captureNoteRisingTags.tsに
// 最初実装した内容を、note_hashtag_popular追加にあたり汎用化して切り出した
// （日付計算のみの純粋関数のため、共有してもクロール系ロジックのような
// 密結合リスクはない——fetchArticlePage.ts/fetchSource.tsが意図的にロジックを
// 複製しているのとは性質が異なると判断）。captureNoteRisingTags.tsの
// 挙動（本日重複防止のみ・恒久重複排除はしない）は変更していない。

export interface SkippedThemeSummary {
  theme: string
  reason: string
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

// 「本日、同一theme×sourceTypeを既に取得済みか」だけを判定する——themeだけで
// 永久重複排除はしない（同じテーマが別日に再上昇・再観測される可能性があるため）。
export async function findExistingTodayCapture(
  payload: Payload,
  theme: string,
  sourceType: string,
  now: Date,
): Promise<boolean> {
  const { totalDocs } = await payload.find({
    collection: 'interest-themes',
    where: {
      and: [
        { theme: { equals: theme } },
        { sourceType: { equals: sourceType } },
        { capturedAt: { greater_than_equal: startOfDay(now).toISOString() } },
        { capturedAt: { less_than: endOfDay(now).toISOString() } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return totalDocs > 0
}

export function dedupeThemesInBatch<T extends { theme: string }>(
  items: T[],
  duplicateReason: string,
): { unique: T[]; duplicates: SkippedThemeSummary[] } {
  const seen = new Set<string>()
  const unique: T[] = []
  const duplicates: SkippedThemeSummary[] = []

  for (const item of items) {
    if (seen.has(item.theme)) {
      duplicates.push({ theme: item.theme, reason: duplicateReason })
      continue
    }
    seen.add(item.theme)
    unique.push(item)
  }

  return { unique, duplicates }
}
