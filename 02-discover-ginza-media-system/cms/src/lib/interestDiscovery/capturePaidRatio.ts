import type { Payload } from 'payload'

import { fetchNoteHashtagPage } from './fetchNoteHashtagPage'
import { normalizeThemeKey } from './normalizeThemeKey'

// Project 02-2 Phase B（B2）：paidRatio 取得と interest-themes.monetization への保存
// （2026-08-28、恒久 CLI 化。2026-08-27 の使い捨て試験スクリプトを正式実装へ昇格）。
//
// 【取得元】note.com/hashtag/<theme>（既定ソート）の総記事数と、
// note.com/hashtag/<theme>?paid_only=true の総記事数の差分。
//   paidRatio = paidArticleCount / totalArticleCount
// Claude API・有料 API は一切呼ばない（note 公開 HTML ページ GET のみ）。
//
// 【適用不可のケース】note_official_topic 由来テーマは /contest/<tag> へ
// リダイレクトされ ?paid_only が効かないことを spec で確認済み。ここでは
// フェッチ結果がそのまま得られなければ「適用不可」として monetization を
// 書き込まずに返す（推測で埋めない）。
//
// 【保存単位】interest-themes は「1観測=1行」の時系列ログで同一テーマが複数行
// あり得るため、normalizeThemeKey が一致する全行の monetization グループを
// 更新する（Interest Score のクラスタ単位と揃える）。

export interface CapturePaidRatioOptions {
  dryRun?: boolean
}

export interface CapturePaidRatioResult {
  dryRun: boolean
  theme: string
  normalizedTheme: string
  applicable: boolean
  reason: string | null
  totalArticleCount: number | null
  paidArticleCount: number | null
  paidRatio: number | null
  isApproximate: boolean
  capturedAt: string
  updatedRowCount: number
}

async function resolveTheme(payload: Payload, themeOrId: string): Promise<string> {
  if (/^\d+$/.test(themeOrId)) {
    const doc = await payload.findByID({ collection: 'interest-themes', id: Number(themeOrId), depth: 0 })
    return String(doc.theme)
  }
  return themeOrId
}

export async function capturePaidRatio(
  payload: Payload,
  themeOrId: string,
  options: CapturePaidRatioOptions = {},
): Promise<CapturePaidRatioResult> {
  const dryRun = options.dryRun ?? false
  const capturedAt = new Date()
  const theme = await resolveTheme(payload, themeOrId)
  const normalizedTheme = normalizeThemeKey(theme)

  const base = () => ({
    dryRun,
    theme,
    normalizedTheme,
    capturedAt: capturedAt.toISOString(),
    isApproximate: false,
    updatedRowCount: 0,
  })

  const totalPage = await fetchNoteHashtagPage(theme, false)
  if (!totalPage.ok || !totalPage.parsed || totalPage.parsed.totalArticleCount === null) {
    return {
      ...base(),
      applicable: false,
      reason: `総記事数の取得に失敗（${totalPage.errorMessage ?? 'パース不可'}）。note_official_topic 由来タグ等では ?paid_only が使えないケースを含む`,
      totalArticleCount: null,
      paidArticleCount: null,
      paidRatio: null,
    }
  }

  const paidPage = await fetchNoteHashtagPage(theme, true)
  if (!paidPage.ok || !paidPage.parsed || paidPage.parsed.totalArticleCount === null) {
    return {
      ...base(),
      applicable: false,
      reason: `有料のみ記事数の取得に失敗（${paidPage.errorMessage ?? 'パース不可'}）`,
      totalArticleCount: totalPage.parsed.totalArticleCount,
      paidArticleCount: null,
      paidRatio: null,
    }
  }

  const totalArticleCount = totalPage.parsed.totalArticleCount
  const paidArticleCount = paidPage.parsed.totalArticleCount
  const isApproximate =
    totalPage.parsed.totalArticleCountIsApproximate || paidPage.parsed.totalArticleCountIsApproximate
  const paidRatio = totalArticleCount > 0 ? paidArticleCount / totalArticleCount : 0

  let updatedRowCount = 0
  if (!dryRun) {
    const { docs } = await payload.find({
      collection: 'interest-themes',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    const targets = docs.filter((d) => normalizeThemeKey(String(d.theme)) === normalizedTheme)
    for (const d of targets) {
      await payload.update({
        collection: 'interest-themes',
        id: d.id,
        overrideAccess: true,
        data: {
          monetization: {
            totalArticleCount,
            paidArticleCount,
            paidRatio,
            sampleSize: totalArticleCount,
            isApproximate,
            capturedAt: capturedAt.toISOString(),
          },
        },
      })
      updatedRowCount++
    }
  }

  return {
    ...base(),
    applicable: true,
    reason: null,
    totalArticleCount,
    paidArticleCount,
    paidRatio,
    isApproximate,
    updatedRowCount,
  }
}
