// GINZA WHISKERS / Project 02 — CROSS CULTURE FILTER の結果キャッシュ（2026-09-04）
//
// 「同じテーマで毎回再判定しない」ための軽量ファイルキャッシュ。
//   ・保存先: <repo>/.devlogs/crossculture/<key>.json（gitignore 済みの .devlogs 配下）
//   ・キー: version ＋ 意味に効く入力フィールドの正規化ハッシュ。title / excerpt /
//     venue / 分類が変われば別キー＝自動で再判定される。
//   ・キャッシュ I/O の失敗は握りつぶす（判定は必ず返る・本体を止めない）。
//   ・DB スキーマ変更なし・追加コレクションなし・追加課金なし。

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  runCrossCultureFilter,
  type CrossCultureInput,
  type CrossCultureFilterResult,
} from './crossCultureFilter'
import { CROSS_CULTURE_VERSION } from './marketAxes'

function defaultCacheDir(): string {
  // cms/ から見た repo ルートの .devlogs
  return resolve(process.cwd(), '..', '.devlogs', 'crossculture')
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** 意味に効くフィールドだけを含めた決定的キャッシュキー */
export function themeCacheKey(input: CrossCultureInput): string {
  const material = [
    CROSS_CULTURE_VERSION,
    norm(input.title),
    // excerpt はスコアリングに使わない（buildHaystack と同じ理由）ためキーにも含めない
    norm(input.venue),
    norm(input.contentType),
    norm(input.uxType),
    norm(input.factKind),
    norm(input.templateType),
    norm(input.primaryCategory),
    norm(input.extraText),
    norm(input.sourceName),
  ].join('␟')
  return createHash('sha1').update(material).digest('hex').slice(0, 20)
}

export interface CachedCrossCulture {
  key: string
  discoveredContentId?: number | string | null
  input: CrossCultureInput
  result: CrossCultureFilterResult
  cachedAt: string
}

/**
 * キャッシュがあれば返し、無ければ FILTER を実行して保存する。
 * すべての I/O・実行は try/catch 済み。失敗しても必ず結果を返す。
 */
export function getOrComputeCrossCulture(
  input: CrossCultureInput,
  opts: { now?: Date; cacheDir?: string; force?: boolean } = {},
): CrossCultureFilterResult {
  const now = opts.now ?? new Date()
  const dir = opts.cacheDir ?? defaultCacheDir()
  const key = themeCacheKey(input)
  const file = resolve(dir, `${key}.json`)

  if (!opts.force) {
    try {
      if (existsSync(file)) {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as CachedCrossCulture
        if (parsed?.result?.version === CROSS_CULTURE_VERSION) return parsed.result
      }
    } catch {
      /* キャッシュ読み込み失敗 → 再計算 */
    }
  }

  const result = runCrossCultureFilter(input, { now })

  try {
    mkdirSync(dir, { recursive: true })
    const payload: CachedCrossCulture = {
      key,
      discoveredContentId: input.discoveredContentId ?? null,
      input,
      result,
      cachedAt: now.toISOString(),
    }
    writeFileSync(file, JSON.stringify(payload, null, 2))
  } catch {
    /* 書き込み失敗は無視（判定結果は返す） */
  }

  return result
}

/** DC id からキャッシュを読むだけ（派生記事生成が「前段の判定を自動参照」するため）。 */
export function loadCrossCultureByKey(key: string, cacheDir?: string): CrossCultureFilterResult | null {
  try {
    const file = resolve(cacheDir ?? defaultCacheDir(), `${key}.json`)
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as CachedCrossCulture
    return parsed?.result ?? null
  } catch {
    return null
  }
}
