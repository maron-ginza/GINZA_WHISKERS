import type { Payload } from 'payload'

import { computeTrackFingerprint } from './trackIdentity'
import type { SeasonType, TnsEditorialCode } from './types'

// 過去使用曲との重複防止（マロン指示4「過去使用曲との重複をMusicUsageLedger
// で防止」、TNS_SPEC.md §6.4）。既存SOURCE LEDGERの「台帳＋履歴＋重複防止」
// パターンを踏襲——本モジュールは決定的なDB問い合わせのみでAI呼び出しは
// 行わない。「実在しない曲・歌手・年を生成しない」という要件は、選曲候補を
// 必ずこのMusicTracks（人間が事前確認・登録した実在曲のマスタ）から取得
// したものに限定することで構造的に担保する——AIが自由に曲名・アーティスト・
// 年を生成することは一切許可しない（generateTnsWeeklyEditionDraft.ts参照）。
//
// 【2026-08-27追加】verified=trueの曲だけを自動選曲対象にする（マロン指示1）。
// さらに、id一致だけでなくtitle×artistの正規化フィンガープリント一致でも
// 過去使用曲を除外する（表記ゆれで同一曲が別レコードとして紛れ込むケースへの
// 対策、trackIdentity.ts参照）。MusicUsageLedgerの各エントリはreuseAllowed
// フラグを持ち、trueの場合はその使用実績を除外判定から除く（マロン指示3
// 「再使用を許可する場合だけreuseAllowed=true」）。

export interface MusicCandidate {
  id: number
  title: string
  artist: string
  releaseYear: number
  origin: 'japanese' | 'international'
  genre: string
  eraEligibility: 'showa' | 'exception' | 'out_of_scope'
  ginzaAffinity?: string | null
  ginzaAffinityEvidence?: string | null
  moodTags: string[]
  weatherTags: string[]
  seasonTags: SeasonType[]
  ginzaCodeTags: TnsEditorialCode[]
}

export async function fetchEligibleMusicCandidates(payload: Payload): Promise<MusicCandidate[]> {
  // MusicUsageLedgerは追記専用ログのため件数上限を設けずページングで全件取得する
  const ledgerEntries: { musicTrackId: number; reuseAllowed: boolean }[] = []
  let page = 1
  for (;;) {
    const { docs, hasNextPage } = await payload.find({
      collection: 'music-usage-ledger',
      limit: 200,
      page,
      depth: 0,
    })
    for (const entry of docs) {
      const musicTrack = entry.musicTrack
      const musicTrackId = typeof musicTrack === 'object' && musicTrack !== null ? Number(musicTrack.id) : Number(musicTrack)
      ledgerEntries.push({ musicTrackId, reuseAllowed: Boolean(entry.reuseAllowed) })
    }
    if (!hasNextPage) break
    page++
  }

  // reuseAllowed:trueの使用実績は除外判定に使わない（マロン指示3）。
  // 1つのtrackに対しreuseAllowed:falseの実績が1件でもあれば、その曲は
  // 引き続き除外扱いとする（「原則除外、許可されたものだけ再使用可」の
  // デフォルト側を優先する安全な解釈）。
  const blockedTrackIds = new Set<number>(
    ledgerEntries.filter((e) => !e.reuseAllowed).map((e) => e.musicTrackId),
  )

  const { docs: allTracks } = await payload.find({
    collection: 'music-tracks',
    limit: 1000,
    depth: 0,
  })

  const blockedFingerprints = new Set<string>(
    allTracks
      .filter((track) => blockedTrackIds.has(Number(track.id)))
      .map((track) => computeTrackFingerprint(String(track.title), String(track.artist))),
  )

  const eligibleTracks = allTracks.filter((track) => {
    if (!track.verified) return false
    if (!track.active) return false
    if (track.eraEligibility === 'out_of_scope') return false
    if (blockedTrackIds.has(Number(track.id))) return false
    const fingerprint = computeTrackFingerprint(String(track.title), String(track.artist))
    if (blockedFingerprints.has(fingerprint)) return false
    return true
  })

  return eligibleTracks.map((track) => ({
    id: Number(track.id),
    title: String(track.title),
    artist: String(track.artist),
    releaseYear: Number(track.releaseYear),
    origin: track.origin,
    genre: String(track.genre),
    eraEligibility: track.eraEligibility,
    ginzaAffinity: track.ginzaAffinity ?? null,
    ginzaAffinityEvidence: track.ginzaAffinityEvidence ?? null,
    moodTags: (track.moodTags ?? []) as string[],
    weatherTags: (track.weatherTags ?? []) as string[],
    seasonTags: (track.seasonTags ?? []) as SeasonType[],
    ginzaCodeTags: (track.ginzaCodeTags ?? []) as TnsEditorialCode[],
  }))
}
