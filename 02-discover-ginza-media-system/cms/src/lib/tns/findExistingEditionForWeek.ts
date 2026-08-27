import type { Payload } from 'payload'

// 同じ対象週の二重生成防止（2026-08-27、./p2 tns next 実装セッション）。
// historical_import（#33〜#35等、CMS外で公開済みの過去号を遡及登録した
// もの）は対象外とする——過去号の存在は「これから生成しようとしている
// 週」との重複判定には関係しないため。
export interface ExistingTnsEdition {
  id: number
  editionNumber: number
  weekStart: string
  weekEnd: string
  generatedArticle: number | null
}

export async function findExistingEditionForWeek(
  payload: Payload,
  weekStartISO: string,
): Promise<ExistingTnsEdition | null> {
  const { docs } = await payload.find({
    collection: 'soundtrack-editions',
    where: {
      and: [{ weekStart: { equals: weekStartISO } }, { status: { not_equals: 'historical_import' } }],
    },
    limit: 1,
    depth: 0,
  })

  const doc = docs[0]
  if (!doc) return null

  return {
    id: Number(doc.id),
    editionNumber: Number(doc.editionNumber),
    weekStart: String(doc.weekStart).slice(0, 10),
    weekEnd: String(doc.weekEnd).slice(0, 10),
    generatedArticle: doc.generatedArticle
      ? Number(typeof doc.generatedArticle === 'object' ? doc.generatedArticle.id : doc.generatedArticle)
      : null,
  }
}
