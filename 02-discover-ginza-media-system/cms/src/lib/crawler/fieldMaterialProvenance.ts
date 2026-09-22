// GINZA WHISKERS / Project 02（2026-09-22）— 現地収集資料（紙資料・写真・チラシ等、
// Web URLを持たない情報源）を正式な情報源として継続利用するための共通ロジック。
//
// 【背景】従来 DiscoveredContent.articleUrl は必須（NOT NULL）かつ
// (sourceSite, articleUrl) がユニーク制約——Web巡回で見つかったURLを前提にした
// 重複判定キーだった。マロンが現地で収集する紙資料（AUTUMN GINZA 2026冊子等）は
// 個々の企画・商品にWebページを持たないため、この前提に合わない。
//
// 【設計】articleUrlは「Web巡回で見つかった記事のみ」必須のままとし
// （collectionMethod='web_crawl'、既定値・後方互換）、現地収集資料
// （collectionMethod='field_material'）はarticleUrlをnullのまま許容する
// 代わりに、sourceDocumentId・sourcePage・contentFingerprintの組で
// 出典と重複を管理する。contentFingerprintは「同一資料の同一箇所を指す
// 同一内容」かどうかを決定的に判定するためのハッシュ——推測は行わず、
// 呼び出し側が渡した識別要素（資料ID・ページ・内容を特定する文字列）だけから
// 機械的に計算する。

import { createHash } from 'node:crypto'

export type CollectionMethod = 'web_crawl' | 'field_material'

/**
 * contentFingerprint を決定的に計算する（純粋関数）。
 * parts は「この資料のこの1件を一意に特定する要素」を呼び出し側が明示的に渡す
 * （例：[sourceDocumentId, sourcePage, 正式名称]）。空文字列・undefinedは
 * 除外せずそのまま連結する（呼び出し側の入力ミスを隠さないため）。
 */
export function computeContentFingerprint(parts: readonly string[]): string {
  const joined = parts.join('␟') // Unit Separator相当の非表示記号で連結（実データに含まれにくい）
  return createHash('sha256').update(joined, 'utf8').digest('hex')
}

export interface DiscoveredContentSourceFields {
  collectionMethod?: CollectionMethod | null
  articleUrl?: string | null
  sourceDocumentId?: string | null
  sourcePage?: string | null
  contentFingerprint?: string | null
  sourceMaterialName?: string | null
  sourceMaterialHash?: string | null
  sourceMaterialLocation?: string | null
  collectedBy?: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * DiscoveredContent の出典フィールドの整合性を検証する（純粋関数、DBアクセスなし）。
 * ・collectionMethod が未指定または 'web_crawl' → articleUrl が必須（既存の挙動を維持）。
 * ・collectionMethod が 'field_material' → articleUrl は不要（null許容）の代わりに
 *   sourceDocumentId・sourcePage・contentFingerprint・sourceMaterialName・
 *   sourceMaterialHash・sourceMaterialLocation・collectedBy をすべて必須とする
 *   （出典を辿れない現地収集資料レコードを作らせない）。
 * 推測による補完は行わない——不足項目はそのままエラーとして返す。
 */
export function validateDiscoveredContentSourceFields(data: DiscoveredContentSourceFields): ValidationResult {
  const errors: string[] = []
  const method: CollectionMethod = data.collectionMethod ?? 'web_crawl'

  if (method === 'web_crawl') {
    if (!isNonEmpty(data.articleUrl)) {
      errors.push('collectionMethod=web_crawl の場合 articleUrl は必須です')
    }
    return { valid: errors.length === 0, errors }
  }

  // field_material
  if (isNonEmpty(data.articleUrl)) {
    // articleUrlを禁止はしない（後日Web版が見つかった場合の追記等に備える）が、
    // 主たる出典キーはcontentFingerprint側であることを前提にする。
  }
  const required: [keyof DiscoveredContentSourceFields, string][] = [
    ['sourceDocumentId', 'sourceDocumentId'],
    ['sourcePage', 'sourcePage'],
    ['contentFingerprint', 'contentFingerprint'],
    ['sourceMaterialName', 'sourceMaterialName'],
    ['sourceMaterialHash', 'sourceMaterialHash'],
    ['sourceMaterialLocation', 'sourceMaterialLocation'],
    ['collectedBy', 'collectedBy'],
  ]
  for (const [key, label] of required) {
    if (!isNonEmpty(data[key])) {
      errors.push(`collectionMethod=field_material の場合 ${label} は必須です`)
    }
  }
  return { valid: errors.length === 0, errors }
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
