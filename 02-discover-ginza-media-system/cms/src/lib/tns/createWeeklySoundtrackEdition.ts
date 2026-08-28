import type { Payload } from 'payload'

import { fetchWeeklyWeather } from './fetchWeeklyWeather'
import { fetchEligibleMusicCandidates, type MusicCandidate } from './musicCandidates'
import { generateTnsWeeklyEditionDraft, type DailyPlanInput } from './generateTnsWeeklyEditionDraft'
import { selectWeeklyTracks, type DaySlot } from './selectWeeklyTracks'
import { buildTnsArticleBody, type DailySceneRenderInput } from './buildTnsArticleBlocks'
import { deriveHeroVisualBrief } from './seasonVisualBrief'
import { computeNextTnsWeek, deriveSeasonType, formatDateISO } from './weekDates'
import { findExistingEditionForWeek } from './findExistingEditionForWeek'
import type { TnsEditorialCode, Weekday } from './types'

// 🌈Tokyo Nostalgic Soundtrack 週次生成オーケストレーション（2026-08-27、
// 楽曲データ基盤・7曲選定ロジック実装セッションで改訂）。
//
// 既存のcreateDraftFromSource.ts／createWeeklyDraftFromDiscoveredContent.ts
// ／createMultiAngleDraftsFromDiscoveredContent.ts（いずれもProject 02-1）
// と同型の「生成 → payload.create（reviewStatus: draft）」パターンを踏襲する。
// TNS固有の新しい承認フローは作らず、既存Articles.reviewStatusをそのまま
// 承認ゲートとして使う（マロン指示「既存reviewStatusを利用する」）。
//
// 【2026-08-27改訂】選曲の決定をAI呼び出しの外（selectWeeklyTracks.ts、
// 決定的スコアリング＋週全体の邦楽/洋楽比率最適化）へ切り出した。AIは
// 確定済みの曲に対する編集コメントの執筆のみを担当する。
//
// 【2026-08-27再改訂、./p2 tns next 実装セッション】
// ①同じ対象週の二重生成を防ぐガード（findExistingEditionForWeek.ts）を
//   AI呼び出し・DB作成の前に追加した——重複時はAPI課金の前に即座に
//   エラーとする。
// ②MusicUsageLedgerへの本番使用済み登録は、この関数から削除した。
//   従来はここで即座に台帳追記していたが、マロン指示「MusicUsageLedgerの
//   本番確定は最終承認後に別コマンドとする」に基づき、ledger登録は将来の
//   `./p2 tns approve`（今回は設計のみ、未実装）が担当する責務へ切り出した。
//   本関数はArticles(draft)・SoundtrackEditionsの作成までを担当する。

const TNS_SERIES_LABEL = '🌈Tokyo Nostalgic Soundtrack'
const TNS_AI_GENERATED_BY = 'claude-sonnet-5 (tns-weekly)'
// TNSは特定の店舗・催事を主題にしないため、6本柱のうち「文化」を既定の
// 収蔵室とする（createWeeklyDraftFromDiscoveredContent.tsのCONTENT_TYPE_TO_
// PILLAR_NAMEが未分類コンテンツを「文化」に倒しているのと同じ考え方）。
const TNS_DEFAULT_PILLAR_NAME = '文化'

export interface CreateWeeklySoundtrackEditionInput {
  /** 週次唯一の必須手入力（TNS_SPEC.md §6.2） */
  maronWeeklyObservation: string
  maronOptional?: {
    mustIncludeEvent?: string
    fieldworkNotes?: string
  }
  /** テスト・手動指定用。省略時は「翌週」を自動計算する（マロン指示1） */
  baseDate?: Date
}

export interface CreateWeeklySoundtrackEditionResult {
  soundtrackEditionId: number
  editionNumber: number
  articleId: number
  articleTitle: string
  weekStart: string
  weekEnd: string
  weatherSource: string
  primaryWeatherSource: string
  secondaryWeatherSource: string
  jmaReportDatetime: string | null
  fetchedAt: string
  humanReviewRequired: boolean
  humanReviewReasons: string[]
  daysWithTrackSelected: number
  daysPendingHumanSelection: number
  japaneseTrackCount: number
  internationalTrackCount: number
}

interface TNSSettingsDoc {
  weekdayCodeMapping: { weekday: Weekday; code: TnsEditorialCode }[]
  codeFixedMoodLabels: { code: TnsEditorialCode; fixedMoodLabel: string }[]
  historicalReferenceJapaneseRatio: number
  nextEditionNumber: number
}

// 2026-08-27、マロン指摘を受けての修正：号数を固定値（TNSSettings.
// nextEditionNumberの自動インクリメント）ではなく、既存SoundtrackEditions
// の最新レコードから連番取得する設計に変更した。既存の最新editionNumber+1を
// 常に正とする——`nextEditionNumber`は「SoundtrackEditionsが1件も存在しない
// 初回起動時」のみのフォールバック初期値として位置づけを変更する。
async function computeNextEditionNumber(payload: Payload, fallbackSeed: number): Promise<number> {
  const { docs } = await payload.find({
    collection: 'soundtrack-editions',
    sort: '-editionNumber',
    limit: 1,
  })
  if (docs.length === 0) return fallbackSeed
  return Number(docs[0].editionNumber) + 1
}

export async function createWeeklySoundtrackEdition(
  payload: Payload,
  input: CreateWeeklySoundtrackEditionInput,
): Promise<CreateWeeklySoundtrackEditionResult> {
  if (!input.maronWeeklyObservation || input.maronWeeklyObservation.trim() === '') {
    throw new Error(
      'maronWeeklyObservation（今週の銀座を一言で）は週次唯一の必須手入力です。空では生成できません。',
    )
  }

  const settings = (await payload.findGlobal({ slug: 'tns-settings' })) as unknown as TNSSettingsDoc

  const week = computeNextTnsWeek(input.baseDate)

  // 同じ対象週の二重生成防止（マロン指示「同じ対象週・同じeditionNumberの
  // 重複生成を防ぐ」）。天気取得・AI呼び出しより前に判定し、重複時は
  // 一切のAPI課金を発生させずに停止する。
  const existing = await findExistingEditionForWeek(payload, formatDateISO(week.weekStart))
  if (existing) {
    throw new Error(
      `対象週${formatDateISO(week.weekStart)}〜${formatDateISO(week.weekEnd)}は既に#${existing.editionNumber}` +
        `（SoundtrackEditions id=${existing.id}${existing.generatedArticle ? `、Article id=${existing.generatedArticle}` : ''}）` +
        'として生成済みです。二重生成を防ぐため停止しました。',
    )
  }

  const season = deriveSeasonType(week.weekStart)
  const weather = await fetchWeeklyWeather(week)

  const codeByWeekday = new Map(settings.weekdayCodeMapping.map((m) => [m.weekday, m.code]))
  const moodLabelByCode = new Map(settings.codeFixedMoodLabels.map((m) => [m.code, m.fixedMoodLabel]))

  const allCandidates = await fetchEligibleMusicCandidates(payload)

  const daySlots: (DaySlot & { weather: (typeof weather.daily)[number] })[] = week.days.map(({ date, weekday }) => {
    const code = codeByWeekday.get(weekday)
    if (!code) {
      throw new Error(
        `TNSSettings.weekdayCodeMapping に "${weekday}" の対応するTNS Editorial Codeが設定されていません。`,
      )
    }
    const fixedMoodLabel = moodLabelByCode.get(code) ?? ''
    const dailyWeather = weather.daily.find((d) => d.date === formatDateISO(date)) ?? {
      date: formatDateISO(date),
      conditionLabel: '不明',
      tempHighC: null,
      tempLowC: null,
      pop: null,
      reliability: null,
      weatherSource: 'manual' as const,
      divergence: { level: 'none' as const, reasons: [] },
    }
    return {
      weekday,
      date: formatDateISO(date),
      code,
      fixedMoodLabel,
      conditionLabel: dailyWeather.conditionLabel,
      // 2026-08-27：季節は週単位ではなく日単位で判定する（季節の境目を
      // またぐ週で、summer+autumnのような複数季節タグが実際に機能するように
      // するため、selectWeeklyTracks.ts参照）。
      season: deriveSeasonType(date),
      weather: dailyWeather,
    }
  })

  // 7曲選定（決定的スコアリング＋週全体の邦楽/洋楽比率最適化）。AI呼び出しの
  // 前に確定させる——マロン指示4「7曲選定ロジック」。
  const assignments = selectWeeklyTracks(daySlots, allCandidates, settings.historicalReferenceJapaneseRatio)
  const candidateById = new Map<number, MusicCandidate>(allCandidates.map((c) => [c.id, c]))

  const dailyPlans: DailyPlanInput[] = daySlots.map((day, i) => {
    const assignment = assignments[i]
    const track = assignment.trackId !== null ? candidateById.get(assignment.trackId) : undefined
    return {
      date: day.date,
      weekday: day.weekday,
      code: day.code,
      fixedMoodLabel: day.fixedMoodLabel,
      weather: day.weather,
      assignedTrack: track ? { title: track.title, artist: track.artist, releaseYear: track.releaseYear } : null,
    }
  })

  const draft = await generateTnsWeeklyEditionDraft({
    weekStart: formatDateISO(week.weekStart),
    weekEnd: formatDateISO(week.weekEnd),
    season,
    weekSummary: weather.weekSummary,
    maronWeeklyObservation: input.maronWeeklyObservation,
    maronOptional: input.maronOptional,
    dailyPlans,
  })

  const renderDays: DailySceneRenderInput[] = dailyPlans.map((plan, i) => ({
    scene: draft.dailyScenes[i],
    date: plan.date,
    code: plan.code,
    fixedMoodLabel: plan.fixedMoodLabel,
    weather: plan.weather,
    track: assignments[i].trackId !== null ? (candidateById.get(assignments[i].trackId!) ?? null) : null,
  }))

  const editionNumber = await computeNextEditionNumber(payload, settings.nextEditionNumber)

  const { docs: pillarDocs } = await payload.find({
    collection: 'tags',
    where: { and: [{ type: { equals: 'pillar' } }, { name: { equals: TNS_DEFAULT_PILLAR_NAME } }] },
    limit: 1,
  })
  const pillarDoc = pillarDocs[0]
  if (!pillarDoc) {
    throw new Error(`収蔵室（pillar）"${TNS_DEFAULT_PILLAR_NAME}"に対応する既存Tagが見つかりません。`)
  }

  const articleTitle = draft.japaneseTitleCandidates[0] ?? `🌈Tokyo Nostalgic Soundtrack #${editionNumber}`
  const articleBody = buildTnsArticleBody(draft, renderDays, weather.weekSummary, editionNumber)

  const article = await payload.create({
    collection: 'articles',
    locale: 'ja',
    data: {
      reviewStatus: 'draft',
      title: articleTitle,
      slug: articleTitle,
      body: articleBody,
      pillars: [Number(pillarDoc.id)],
      seo: {
        metaTitle: articleTitle,
        metaDescription: draft.coreTheme,
      },
      socialCopy: {
        note: draft.hook,
        x: draft.hook,
        instagram: draft.hook,
      },
      callToAction: draft.callToAction,
      series: {
        label: TNS_SERIES_LABEL,
        editionNumber,
      },
      aiGeneratedBy: TNS_AI_GENERATED_BY,
    },
  })

  const soundtrackEdition = await payload.create({
    collection: 'soundtrack-editions',
    data: {
      weekStart: formatDateISO(week.weekStart),
      weekEnd: formatDateISO(week.weekEnd),
      editionNumber,
      status: 'article_generated',
      generatedArticle: Number(article.id),
      context: {
        season,
        weather: {
          weekSummary: weather.weekSummary,
          daily: weather.daily.map((d) => ({
            date: d.date,
            conditionLabel: d.conditionLabel,
            tempHighC: d.tempHighC,
            tempLowC: d.tempLowC,
            pop: d.pop ?? undefined,
            reliability: d.reliability ?? undefined,
            daySource: d.weatherSource,
            divergenceLevel: d.divergence.level,
          })),
          weatherSource: weather.weatherSource,
          provenance: {
            primaryWeatherSource: weather.provenance.primaryWeatherSource,
            secondaryWeatherSource: weather.provenance.secondaryWeatherSource,
            fetchedAt: weather.provenance.fetchedAt,
            jmaReportDatetime: weather.provenance.jmaReportDatetime ?? undefined,
            humanReviewRequired: weather.provenance.humanReviewRequired,
            humanReviewReasons: weather.provenance.humanReviewReasons.join('\n'),
          },
        },
        maronWeeklyObservation: input.maronWeeklyObservation,
        maronOptional: {
          mustIncludeEvent: input.maronOptional?.mustIncludeEvent ?? '',
          fieldworkNotes: input.maronOptional?.fieldworkNotes ?? '',
        },
      },
      editorialTheme: {
        coreTheme: draft.coreTheme,
        emotion: draft.emotion,
        lifeTheme: draft.lifeTheme,
        ginzaExperience: draft.ginzaExperience,
        japaneseTitleCandidates: draft.japaneseTitleCandidates,
        englishSubtitle: draft.englishSubtitle,
        hook: draft.hook,
        afterglow: draft.afterglow,
      },
      dailyScenes: daySlots.map((day, i) => ({
        date: day.date,
        weekday: day.weekday,
        tnsEditorialCode: {
          code: day.code,
          fixedMoodLabel: day.fixedMoodLabel,
          weeklyEnglishSubtitle: draft.dailyScenes[i].weeklyEnglishSubtitle,
        },
        emotion: draft.dailyScenes[i].emotion,
        ginzaExperience: draft.dailyScenes[i].ginzaExperience,
        sceneDescription: draft.dailyScenes[i].sceneDescription,
        editorialPointOfView: draft.dailyScenes[i].editorialPointOfView,
        musicSelected: {
          trackRef: assignments[i].trackId,
          pendingHumanSelection: assignments[i].trackId === null,
          internalReason: assignments[i].internalReason,
          readerFacingComment: draft.dailyScenes[i].readerFacingComment,
        },
      })),
      music: {
        musicBalance: {
          policy: 'adaptive',
          effectiveJapaneseCount: renderDays.filter((d) => d.track?.origin === 'japanese').length,
          effectiveInternationalCount: renderDays.filter((d) => d.track?.origin === 'international').length,
          pendingCount: renderDays.filter((d) => d.track === null).length,
        },
      },
      visual: {
        heroVisualBrief: deriveHeroVisualBrief(season),
        visualStatus: 'pending_selection',
      },
    },
  })

  // 【2026-08-27変更】MusicUsageLedgerへの本番使用済み登録はここでは行わない
  // （将来の`./p2 tns approve`、今回は設計のみ・未実装、が最終承認後に担当）。
  // このため本関数が生成した候補曲は、次回以降の`fetchEligibleMusicCandidates`
  // でも引き続き「未使用」として扱われ、承認前に別週で再選定される余地を
  // 残す——最終承認されるまでは正式に「使用済み」を確定させない設計。

  return {
    soundtrackEditionId: Number(soundtrackEdition.id),
    editionNumber,
    articleId: Number(article.id),
    articleTitle,
    weekStart: formatDateISO(week.weekStart),
    weekEnd: formatDateISO(week.weekEnd),
    weatherSource: weather.weatherSource,
    primaryWeatherSource: weather.provenance.primaryWeatherSource,
    secondaryWeatherSource: weather.provenance.secondaryWeatherSource,
    jmaReportDatetime: weather.provenance.jmaReportDatetime,
    fetchedAt: weather.provenance.fetchedAt,
    humanReviewRequired: weather.provenance.humanReviewRequired,
    humanReviewReasons: weather.provenance.humanReviewReasons,
    daysWithTrackSelected: renderDays.filter((d) => d.track !== null).length,
    daysPendingHumanSelection: renderDays.filter((d) => d.track === null).length,
    japaneseTrackCount: renderDays.filter((d) => d.track?.origin === 'japanese').length,
    internationalTrackCount: renderDays.filter((d) => d.track?.origin === 'international').length,
  }
}
