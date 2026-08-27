import { blocksToLexicalState, type TextBlock } from '../ai/lexical'
import type { DailyWeather } from './fetchWeeklyWeather'
import type { MusicCandidate } from './musicCandidates'
import type { DailySceneOutput, TnsWeeklyEditionDraft } from './generateTnsWeeklyEditionDraft'
import { WEEKDAY_LABELS_JA } from './types'

// note記事本文の構成（TNS_SPEC.md §6.2 outputs.note.structure、v1.1で
// TNS固有テンプレートへ変更済み）：
// THIS WEEK IN GINZA → 週間昭和歌謡予報 → DAILY SOUNDTRACK → AFTERGLOW →
// GINZA WHISKERS導線。generateArticleDraft.tsのblocksToLexicalState・
// TextBlockをそのまま再利用し、lexical.ts本体は変更しない。

export interface DailySceneRenderInput {
  scene: DailySceneOutput
  date: string
  code: string
  fixedMoodLabel: string
  weather: DailyWeather
  track: MusicCandidate | null
}

function formatDailyHeading(date: string, scene: DailySceneOutput, code: string, fixedMoodLabel: string): string {
  const label = WEEKDAY_LABELS_JA[scene.weekday]
  const moodPart = fixedMoodLabel ? `${code}・${fixedMoodLabel}` : code
  return `${date}（${label}） — TNS Editorial Code: ${moodPart}`
}

function formatTrackLine(track: MusicCandidate | null): string {
  if (!track) {
    return '♪ 選定中（MusicTracksへの登録をお待ちしています。マロンによる選曲確認が必要です）'
  }
  return `♪ 「${track.title}」／${track.artist}／${track.releaseYear}年`
}

export function buildTnsArticleBlocks(
  draft: TnsWeeklyEditionDraft,
  days: DailySceneRenderInput[],
  weekSummary: string,
  editionNumber: number,
): TextBlock[] {
  const blocks: TextBlock[] = []

  blocks.push({
    type: 'paragraph',
    text: `GINZA WHISKERS SERIES｜🌈Tokyo Nostalgic Soundtrack #${String(editionNumber).padStart(3, '0')}`,
  })

  blocks.push({ type: 'paragraph', text: draft.hook })

  blocks.push({ type: 'heading', level: 2, text: 'THIS WEEK IN GINZA' })
  blocks.push({ type: 'paragraph', text: draft.coreTheme })
  blocks.push({ type: 'paragraph', text: `気分：${draft.emotion}／生活テーマ：${draft.lifeTheme}` })
  blocks.push({ type: 'paragraph', text: `銀座での過ごし方：${draft.ginzaExperience}` })
  blocks.push({ type: 'paragraph', text: `今週の天気：${weekSummary}` })
  blocks.push({ type: 'paragraph', text: `English Subtitle: ${draft.englishSubtitle}` })

  blocks.push({ type: 'heading', level: 2, text: '週間昭和歌謡予報' })
  blocks.push({
    type: 'paragraph',
    text: '今週、銀座の一日一日にどんな曲を添えるか——7日分のDAILY SOUNDTRACKへ。',
  })

  blocks.push({ type: 'heading', level: 2, text: 'DAILY SOUNDTRACK' })
  for (const day of days) {
    blocks.push({
      type: 'heading',
      level: 3,
      text: formatDailyHeading(day.date, day.scene, day.code, day.fixedMoodLabel),
    })
    blocks.push({ type: 'paragraph', text: day.scene.weeklyEnglishSubtitle })
    blocks.push({
      type: 'paragraph',
      text: `天気：${day.weather.conditionLabel}（${day.weather.tempLowC ?? '不明'}〜${day.weather.tempHighC ?? '不明'}℃）／気分：${day.scene.emotion}`,
    })
    blocks.push({ type: 'paragraph', text: `過ごし方：${day.scene.ginzaExperience}` })
    blocks.push({ type: 'paragraph', text: day.scene.sceneDescription })
    blocks.push({ type: 'paragraph', text: `EDITORIAL POINT OF VIEW　${day.scene.editorialPointOfView}` })
    blocks.push({ type: 'paragraph', text: formatTrackLine(day.track) })
    if (day.track && day.scene.readerFacingComment) {
      blocks.push({ type: 'paragraph', text: day.scene.readerFacingComment })
    }
  }

  blocks.push({ type: 'heading', level: 2, text: 'AFTERGLOW' })
  blocks.push({ type: 'paragraph', text: draft.afterglow })

  return blocks
}

export function buildTnsArticleBody(
  draft: TnsWeeklyEditionDraft,
  days: DailySceneRenderInput[],
  weekSummary: string,
  editionNumber: number,
) {
  const blocks = buildTnsArticleBlocks(draft, days, weekSummary, editionNumber)
  blocks.push({ type: 'paragraph', text: `→ 次に：${draft.callToAction}` })
  return blocksToLexicalState(blocks)
}
