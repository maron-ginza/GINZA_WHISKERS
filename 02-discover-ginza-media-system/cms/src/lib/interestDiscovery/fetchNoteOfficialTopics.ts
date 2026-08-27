import { BOT_TOKEN, USER_AGENT } from '../crawler/fetchSource'
import { checkRobotsAllowed } from '../crawler/robotsTxt'
import { classifyNoteOfficialTitle } from './classifyNoteOfficialTopic'
import { NoteInfoRssStructureError, parseNoteInfoRss } from './parseNoteInfoRss'
import type { OfficialCategory } from './types'

// note.com/info（note公式アカウント）RSSから、現在開催中と推定できるお題・
// コンテストを抽出する（2026-08-27、Project 02-2 Phase A Priority 2試験実装）。
//
// robots.txt確認済み（2026-08-27）：`/*/rss`はGooglebot/bingbot/Yeti向けの
// 追加Disallowであり、汎用User-agent（本ボット）向けの包括ルールには含まれない。
// note.com/trend取得ロジック（fetchNoteRisingTags.ts）には一切手を入れていない。

export const NOTE_INFO_RSS_URL = 'https://note.com/info/rss'
const FETCH_TIMEOUT_MS = 15_000

export interface OpenOfficialTopicCandidate {
  theme: string // ハッシュタグ本体（#を除く）
  sourceURL: string
  startDate: string | null // RSSのpubDateをそのまま使用（推定開始日のproxy）
  officialCategory: OfficialCategory | null
}

export interface FetchNoteOfficialTopicsResult {
  ok: boolean
  totalItems: number
  candidateCount: number // ハッシュタグ付きOPEN/CLOSEDいずれかのシグナルに一致した件数
  closedHashtags: string[]
  openCandidates: OpenOfficialTopicCandidate[]
  errorMessage: string | null
  blockedByRobots: boolean
}

export async function fetchNoteOfficialTopics(): Promise<FetchNoteOfficialTopicsResult> {
  const robotsCheck = await checkRobotsAllowed(NOTE_INFO_RSS_URL, BOT_TOKEN, USER_AGENT)
  if (!robotsCheck.allowed) {
    return {
      ok: false,
      totalItems: 0,
      candidateCount: 0,
      closedHashtags: [],
      openCandidates: [],
      errorMessage: `robots.txtにより${NOTE_INFO_RSS_URL}へのアクセスが許可されていません: ${robotsCheck.reason ?? ''}`,
      blockedByRobots: true,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let xml: string
  try {
    const res = await fetch(NOTE_INFO_RSS_URL, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
    })

    if (!res.ok) {
      return {
        ok: false,
        totalItems: 0,
        candidateCount: 0,
        closedHashtags: [],
        openCandidates: [],
        errorMessage: `HTTPエラー: ${res.status} ${res.statusText}`,
        blockedByRobots: false,
      }
    }

    xml = await res.text()
  } catch (err) {
    return {
      ok: false,
      totalItems: 0,
      candidateCount: 0,
      closedHashtags: [],
      openCandidates: [],
      errorMessage: err instanceof Error ? err.message : String(err),
      blockedByRobots: false,
    }
  } finally {
    clearTimeout(timeoutId)
  }

  let items: ReturnType<typeof parseNoteInfoRss>
  try {
    items = parseNoteInfoRss(xml)
  } catch (err) {
    if (err instanceof NoteInfoRssStructureError) {
      return {
        ok: false,
        totalItems: 0,
        candidateCount: 0,
        closedHashtags: [],
        openCandidates: [],
        errorMessage: err.message,
        blockedByRobots: false,
      }
    }
    throw err
  }

  // 1パス目：ハッシュタグを持つ告知だけを候補とし、CLOSEDシグナルの
  // ハッシュタグ集合を先に確定する（同じハッシュタグの「募集開始」告知が
  // 別の回でCLOSED告知として見つかっている場合、その企画は現在対象外とする
  // ——過去終了済み企画を混ぜないための実装、マロン指示）。
  const closedHashtags = new Set<string>()
  const classified = items.map((item) => ({ item, classification: classifyNoteOfficialTitle(item.title) }))

  for (const { classification } of classified) {
    if (classification.hashtag && classification.isClosedSignal) {
      closedHashtags.add(classification.hashtag)
    }
  }

  const candidates = classified.filter(
    ({ classification }) => classification.hashtag && (classification.isOpenSignal || classification.isClosedSignal),
  )

  // 2パス目：OPENシグナルかつ、同一ハッシュタグのCLOSED告知が見つかっていないものだけを採用。
  const openCandidates: OpenOfficialTopicCandidate[] = candidates
    .filter(({ classification }) => classification.isOpenSignal && !closedHashtags.has(classification.hashtag!))
    .map(({ item, classification }) => ({
      theme: classification.hashtag!,
      sourceURL: item.link,
      startDate: item.pubDate,
      officialCategory: classification.officialCategory,
    }))

  return {
    ok: true,
    totalItems: items.length,
    candidateCount: candidates.length,
    closedHashtags: Array.from(closedHashtags),
    openCandidates,
    errorMessage: null,
    blockedByRobots: false,
  }
}
