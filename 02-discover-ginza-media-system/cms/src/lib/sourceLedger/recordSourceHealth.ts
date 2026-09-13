// GINZA WHISKERS / Project 02（2026-09-14新設）— 情報源ごとの取得可否
// （source health）をSOURCE_LEDGERへ記録する共通ヘルパー。
//
// 専用の取得経路（Storyblok公開API・埋め込みJSON・sitemap等）を持つ情報源
// （松屋銀座・銀座三越等）で、すべての経路が失敗した場合に「取得不能」を
// 明示的に記録し、呼び出し元が候補生成をスキップする判断材料にする——
// 非公式情報や推測データで埋め合わせない、というEditorial Trust Layerの
// 原則を情報源レベルでも徹底する。

import type { Payload } from 'payload'

export type SourceHealthStatus = 'ok' | 'unreachable'

export async function recordSourceHealth(
  payload: Payload,
  sourceId: string,
  status: SourceHealthStatus,
  note: string,
): Promise<void> {
  const docs = await payload.find({
    collection: 'source-ledger',
    where: { sourceId: { equals: sourceId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = docs.docs[0]
  if (!doc) {
    // SOURCE_LEDGERに未登録の情報源へは記録できない（推測で新規作成しない）。
    console.warn(`[recordSourceHealth] SOURCE_LEDGERに ${sourceId} が見つからないため記録をスキップしました`)
    return
  }
  await payload.update({
    collection: 'source-ledger',
    id: doc.id,
    overrideAccess: true,
    data: {
      healthStatus: status,
      healthCheckedAt: new Date().toISOString(),
      healthNote: note,
    },
  })
}
