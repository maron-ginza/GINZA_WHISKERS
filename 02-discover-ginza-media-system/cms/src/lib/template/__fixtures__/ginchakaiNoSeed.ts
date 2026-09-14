import type { TemplateArticleInput } from '../renderArticleFromTemplate'
import { ginchakaiFixture } from './ginchakai'

// 第2段階B 検証用：ginchakai fixture と同じ構造化データだが editorsNoteSeed を
// 持たない版。seed が無い場合に resolveEditorsNote() の控えめな定型文が出ること、
// および seed 有無以外は同じ本文構造になることを確認する。
const base = ginchakaiFixture
const { editorsNoteSeed: _omitSeed, ...fieldsWithoutSeed } = base.fields

export const ginchakaiNoSeedFixture: TemplateArticleInput & { unconfirmedNotes: string[] } = {
  discoveredContentId: base.discoveredContentId,
  fields: fieldsWithoutSeed, // editorsNoteSeed を含めない（任意項目）
  sourceName: base.sourceName,
  sourceUrl: base.sourceUrl,
  verifiedAt: base.verifiedAt,
  sourceProvenance: base.sourceProvenance,
  hashtags: base.hashtags,
  relatedArticleTitles: base.relatedArticleTitles,
  unconfirmedNotes: base.unconfirmedNotes,
}
