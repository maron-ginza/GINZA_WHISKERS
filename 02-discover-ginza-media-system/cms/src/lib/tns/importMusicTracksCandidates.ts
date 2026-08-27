import type { Payload } from 'payload'

import { computeTrackFingerprint } from './trackIdentity'
import { MUSIC_GENRES, SEASON_TYPES, TNS_EDITORIAL_CODES, type SeasonType, type TnsEditorialCode } from './types'

// TNS MusicTracks 候補曲一括インポート（2026-08-27）。
//
// 【位置づけ】マロン指示のD方式（B＋A＋C）のうちA（マロン候補）・C（公開
// 音楽DBによる検証補助）で集めた候補曲を、安全にMusicTracksへ取り込むための
// 機構。実在確認・TNS適合性の最終判断は人間が行う——本モジュールは
// 「入力データの形式検証・重複排除・登録」のみを担当し、曲名・アーティスト・
// 年を一切生成・補完しない（Claude API・外部APIは呼び出さない）。
//
// 【releaseYearの年代制限について（2026-08-27、マロン指摘反映）】
// 当初案では1926〜1989年の範囲外を取り込み時にエラーとしていたが、
// 「TNSは1990年代以降の楽曲を機械的に除外する企画ではない」というマロンの
// 指摘を受け撤回した。releaseYearは実在確認できた整数であれば年代を問わず
// 受け付ける。eraEligibility（既存フィールド）は1926〜1989年なら'showa'、
// それ以外は'exception'を自動付与するのみで、'out_of_scope'（選曲候補からの
// 除外）には一切しない——年代による機械的排除をしないという方針の徹底。

export interface ImportRowInput {
  title?: string
  artist?: string
  releaseYear?: string | number
  japaneseOrWestern?: string
  verified?: string | boolean
  active?: string | boolean
  sourceNote?: string
  genre?: string
  country?: string
  language?: string
  moodTags?: string | string[]
  weatherTags?: string | string[]
  seasonTags?: string | string[]
  ginzaCodeTags?: string | string[]
}

interface ValidatedTrackCandidate {
  title: string
  artist: string
  releaseYear: number
  origin: 'japanese' | 'international'
  verified: boolean
  active: boolean
  sourceNote: string
  genre?: string
  country?: string
  language?: string
  moodTags: string[]
  weatherTags: string[]
  seasonTags: SeasonType[]
  ginzaCodeTags: TnsEditorialCode[]
  eraEligibility: 'showa' | 'exception'
}

export interface ImportRowResult {
  rowNumber: number
  title: string
  artist: string
  status: 'created' | 'would_create' | 'skipped_duplicate' | 'skipped_invalid'
  reason?: string
}

export interface ImportReport {
  mode: 'dry-run' | 'live'
  totalRows: number
  created: number
  skippedDuplicate: number
  skippedInvalid: number
  results: ImportRowResult[]
}

function parseBoolean(value: string | boolean | undefined, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === undefined || value.trim() === '') return defaultValue
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  throw new Error(`真偽値として解釈できません: "${value}"`)
}

function parseTagArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean)
  return value
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
}

// 1926〜1989年（Showa）を基準に自動分類する。範囲外でも選曲候補から機械的に
// 除外する'out_of_scope'にはしない——年代の上限・下限を設けないというマロン
// 指示に基づく（'exception'は「主要ウィンドウ外・人間の確認が必要」という
// 位置づけであり、既にTNS利用が承認された曲を意味しない点に注意）。
function computeEraEligibility(releaseYear: number): 'showa' | 'exception' {
  return releaseYear >= 1926 && releaseYear <= 1989 ? 'showa' : 'exception'
}

function validateRow(row: ImportRowInput): { candidate: ValidatedTrackCandidate } | { error: string } {
  const title = (row.title ?? '').trim()
  const artist = (row.artist ?? '').trim()
  if (!title) return { error: 'titleが空です' }
  if (!artist) return { error: 'artistが空です' }

  const releaseYearRaw = row.releaseYear
  const releaseYear = typeof releaseYearRaw === 'number' ? releaseYearRaw : Number(releaseYearRaw)
  if (
    releaseYearRaw === undefined ||
    releaseYearRaw === '' ||
    !Number.isFinite(releaseYear) ||
    !Number.isInteger(releaseYear)
  ) {
    return {
      error: 'releaseYearが整数として確認できません（未確認の場合は登録前に人間が確認してください）',
    }
  }

  const origin = (row.japaneseOrWestern ?? '').trim()
  if (origin !== 'japanese' && origin !== 'international') {
    return {
      error: `japaneseOrWesternは"japanese"または"international"のみです（入力値: "${row.japaneseOrWestern ?? ''}"）`,
    }
  }

  let verified: boolean
  let active: boolean
  try {
    verified = parseBoolean(row.verified, false)
    active = parseBoolean(row.active, true)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const sourceNote = (row.sourceNote ?? '').trim()
  if (!sourceNote) {
    return { error: 'sourceNoteが空です（この候補曲をなぜ登録したかを一言記録してください）' }
  }

  const genre = row.genre?.trim() || undefined
  if (genre && !(MUSIC_GENRES as readonly string[]).includes(genre)) {
    return { error: `genreが不正な値です: "${genre}"` }
  }

  const seasonTags = parseTagArray(row.seasonTags)
  const invalidSeason = seasonTags.find((s) => !(SEASON_TYPES as readonly string[]).includes(s))
  if (invalidSeason) return { error: `seasonTagsに不正な値があります: "${invalidSeason}"` }

  const ginzaCodeTags = parseTagArray(row.ginzaCodeTags)
  const invalidCode = ginzaCodeTags.find((c) => !(TNS_EDITORIAL_CODES as readonly string[]).includes(c))
  if (invalidCode) return { error: `ginzaCodeTagsに不正な値があります: "${invalidCode}"` }

  return {
    candidate: {
      title,
      artist,
      releaseYear,
      origin,
      verified,
      active,
      sourceNote,
      genre,
      country: row.country?.trim() || undefined,
      language: row.language?.trim() || undefined,
      moodTags: parseTagArray(row.moodTags),
      weatherTags: parseTagArray(row.weatherTags),
      seasonTags: seasonTags as SeasonType[],
      ginzaCodeTags: ginzaCodeTags as TnsEditorialCode[],
      eraEligibility: computeEraEligibility(releaseYear),
    },
  }
}

export async function importMusicTracksCandidates(
  payload: Payload,
  rows: ImportRowInput[],
  options: { dryRun: boolean },
): Promise<ImportReport> {
  const { docs: existingTracks } = await payload.find({ collection: 'music-tracks', limit: 5000, depth: 0 })
  const existingFingerprints = new Set(
    existingTracks.map((t) => computeTrackFingerprint(String(t.title), String(t.artist))),
  )
  const seenInBatch = new Set<string>()

  const results: ImportRowResult[] = []
  let created = 0
  let skippedDuplicate = 0
  let skippedInvalid = 0

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1
    const row = rows[i]
    const validated = validateRow(row)

    if ('error' in validated) {
      results.push({
        rowNumber,
        title: row.title ?? '',
        artist: row.artist ?? '',
        status: 'skipped_invalid',
        reason: validated.error,
      })
      skippedInvalid++
      continue
    }

    const candidate = validated.candidate
    const fingerprint = computeTrackFingerprint(candidate.title, candidate.artist)
    if (existingFingerprints.has(fingerprint) || seenInBatch.has(fingerprint)) {
      results.push({
        rowNumber,
        title: candidate.title,
        artist: candidate.artist,
        status: 'skipped_duplicate',
        reason: '既存MusicTracksまたは同一インポートファイル内で重複（title×artist正規化フィンガープリント一致）',
      })
      skippedDuplicate++
      continue
    }
    seenInBatch.add(fingerprint)

    if (options.dryRun) {
      results.push({ rowNumber, title: candidate.title, artist: candidate.artist, status: 'would_create' })
      created++
      continue
    }

    await payload.create({
      collection: 'music-tracks',
      data: {
        title: candidate.title,
        artist: candidate.artist,
        releaseYear: candidate.releaseYear,
        origin: candidate.origin,
        eraEligibility: candidate.eraEligibility,
        verified: candidate.verified,
        active: candidate.active,
        sourceNote: candidate.sourceNote,
        genre: (candidate.genre ?? null) as never,
        country: candidate.country,
        language: candidate.language,
        moodTags: candidate.moodTags,
        weatherTags: candidate.weatherTags,
        seasonTags: candidate.seasonTags,
        ginzaCodeTags: candidate.ginzaCodeTags,
      },
    })
    results.push({ rowNumber, title: candidate.title, artist: candidate.artist, status: 'created' })
    created++
  }

  return {
    mode: options.dryRun ? 'dry-run' : 'live',
    totalRows: rows.length,
    created,
    skippedDuplicate,
    skippedInvalid,
    results,
  }
}
