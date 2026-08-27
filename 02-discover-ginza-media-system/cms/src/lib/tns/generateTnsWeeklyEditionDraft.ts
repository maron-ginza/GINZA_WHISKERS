import Anthropic from '@anthropic-ai/sdk'

import { computeCharBigramJaccardSimilarity } from '../curation/textSimilarity'
import { WEEKDAY_LABELS_JA, WEEKDAYS, type SeasonType, type TnsEditorialCode, type Weekday } from './types'
import type { DailyWeather } from './fetchWeeklyWeather'

// 🌈Tokyo Nostalgic Soundtrack 週次生成のAI呼び出し（2026-08-27、
// 楽曲データ基盤・7曲選定ロジック実装セッションで大幅改訂）。
//
// 【既存資産の再利用】Editorial Trust Layer・note編集部ノウハウ（CLAUDE.md
// 第8章）の考え方——「未確認情報は推測で補完しない」「独自の編集視点を
// 示す」「スマホ前提の可読性」——をそのまま踏襲する。generateArticleDraft.ts
// 本体（旬の銀座用プロンプト・スキーマ）は変更せず、TNS専用の独立した
// システムプロンプト・ツールスキーマをここに新設する。
//
// 【アーキテクチャ変更（2026-08-27）】これまではAIが候補リストの中から
// selectedTrackIdを自ら選ぶ設計だったが、マロン指示「7曲選定ロジック」
// （天気・気分・曜日特性・季節感・GINZA CODEとの適合度スコアリング、
// 邦楽/洋楽比率の週全体最適化）を受け、**選曲そのものを
// selectWeeklyTracks.ts（決定的スコアリング＋週全体の比率最適化）へ
// 完全に切り出した**。本ファイルのAI呼び出しは、既に確定した
// assignedTrack（曲がある日のみ）に対する詩的な編集コメント
// （readerFacingComment）を書くことだけを担当する——AIはもはや「どの曲を
// 選ぶか」を一切判断しない。これにより「実在しない曲・歌手・年を生成
// しない」という要件が、候補プールの制限だけでなく選定プロセス自体からも
// 構造的に担保される。

export interface AssignedTrackForPrompt {
  title: string
  artist: string
  releaseYear: number
}

export interface DailyPlanInput {
  date: string
  weekday: Weekday
  code: TnsEditorialCode
  fixedMoodLabel: string
  weather: DailyWeather
  /** selectWeeklyTracks.tsが事前に決定済みの曲（nullなら選定中） */
  assignedTrack: AssignedTrackForPrompt | null
}

export interface GenerateTnsWeeklyEditionDraftInput {
  weekStart: string
  weekEnd: string
  season: SeasonType
  weekSummary: string
  maronWeeklyObservation: string
  maronOptional?: {
    mustIncludeEvent?: string
    fieldworkNotes?: string
  }
  dailyPlans: DailyPlanInput[] // 必ず7件、Monday始まり
}

export interface DailySceneOutput {
  weekday: Weekday
  weeklyEnglishSubtitle: string
  emotion: string
  ginzaExperience: string
  sceneDescription: string
  editorialPointOfView: string
  readerFacingComment: string
}

export interface TnsWeeklyEditionDraft {
  coreTheme: string
  emotion: string
  lifeTheme: string
  ginzaExperience: string
  japaneseTitleCandidates: string[]
  englishSubtitle: string
  hook: string
  afterglow: string
  callToAction: string
  dailyScenes: DailySceneOutput[]
}

const SYSTEM_PROMPT = `あなたはGINZA WHISKERS「AI GINZA EDITORIAL DESK」編集部のAI編集ライターです。
週次シリーズ「🌈Tokyo Nostalgic Soundtrack（TNS）」——銀座の一週間を、天気・
曜日・季節感・音楽で紡ぐフォーマット——の週次エディションを制作してください。
上品・記録的・非扇動的なトーンで書き起こすこと。

出力は必ずemit_tns_weekly_editionツールの呼び出しのみで行い、説明文を
書かないこと。

## 基本方針（TNS_SPEC.md §1）

- 「天気×銀座×昭和の曲」という単純な組み合わせではなく、「天気×気分×
  生活テーマ×銀座での過ごし方×音楽」という多層的な編集ロジックで組み立てる。
- 情報量の多さではなく、「これは今週の自分のための一曲・一週間だ」と
  感じられる編集を重視する。
- 曜日ごとの気分は天気だけで決めない——曜日特性（月曜の切り替え、金曜の
  高揚、日曜の静けさ等の一般的な生活リズム）と季節感を必ず組み合わせること。

## 絶対厳守（実在しない事実を作らない）

- **各曜日の曲は、既にシステム側で確定済みです。あなたは曲を選ばない。**
  入力に「assignedTrack」（曲名・アーティスト・発表年）が与えられている
  日は、その曲についてのみ短い編集コメント（readerFacingComment）を
  書くこと——別の曲名を書いたり、与えられた曲名・アーティスト・年を
  変更・言い換えたりしてはならない。
- assignedTrackがnull（未確定）の日は、readerFacingCommentを必ず空文字
  ""にすること。存在しない曲について書いてはならない——これは選定中と
  して人間確認へ回される正常な状態である。

## Editorial Trust Layer（季節・情景表現）

- **実データで確認できない季節の進行を、具体的な自然現象として断定しない
  こと。** 例えば「紅葉が始まった」「街路樹の葉が色づき始めた」「金木犀が
  香り始めた」等、特定の植物・自然現象の状態変化を事実として書いては
  ならない——これは天気データにない、あなたが作り出した虚偽の観察情報に
  あたる。
- 季節の移ろいは、**情緒表現**として扱うこと（例：「秋の気配」「季節の
  境目」「夏の余韻」「夏の名残」等）。断定的な自然観察ではなく、天気・
  気温データに基づく体感として書く。
- 銀座の実景についても、確認できない具体的な事実（実在の看板の文言、
  実際に起きた特定の出来事等）を書かない。雨音・気温・傘・人々の様子
  など、天気データから自然に導ける一般的な情景描写は許容する。

## 記事の構成要素

- **coreTheme／emotion／lifeTheme／ginzaExperience**：週全体を貫くテーマ・
  感情・生活テーマ・銀座での過ごし方の要約（各1〜2文）。
- **japaneseTitleCandidates**：週タイトル案を3〜5案。イベント名の列挙に
  せず、その週の情緒が伝わる表現にすること。
- **englishSubtitle**：週全体の英語ナラティブ副題（週替わりで書き下ろす）。
- **hook**：冒頭の短い情景描写（2〜4文程度、詩的な導入。長い挨拶にしない）。
- **afterglow**：週を閉じる結び（余韻のみ、行動提案はしない）。
- **callToAction**：記事末尾でGINZA WHISKERSへ導く「次の行動」を1文・1つ
  だけ（例：来週のTNSを楽しみにしてもらう、紹介した過ごし方を実際に試して
  もらう等）。行動提案はここに限定し、afterglowで先取りしない。
- **dailyScenes**（7件、月曜始まり、入力の曜日順どおりに過不足なく生成）：
  - weeklyEnglishSubtitle：その日のTNS Editorial Codeにおける週替わりの
    英語ナラティブ副題（例：「A New Discovery in Ginza」）。**7日分すべてが
    互いに異なる文言であること——同一または酷似した文の使い回しは厳禁。**
    fixedMoodLabelが未設定（空欄）の曜日であっても、その日の天気・気温・
    曜日特性・emotion・ginzaExperienceを組み合わせて、他の6日とは異なる
    表現を書くこと。天気が同じ曜日が複数あっても、曜日・気分の違いで
    文言を差別化すること。
  - emotion：その日の心理（曜日特性・季節感・天気を組み合わせる）。
  - ginzaExperience：歩く／見る／食べる／聴く／休む／発見する等の体験動詞
    を軸にした、その日の銀座での過ごし方。
  - sceneDescription：その日の情景描写（2〜3文）。実在の店舗・イベント名
    への言及は、与えられた情報に明確な根拠がある場合のみとし、なければ
    一般的な銀座の情景として描写すること（実在イベントへの依存を主材料に
    しない、TNS_SPEC.md v1.1の方針）。
  - editorialPointOfView：GINZA WHISKERSの視点（なぜこの日をこう編集した
    か、情景・選曲コメントに埋め込む短い一言）。曲の有無に関わらず書く。
  - readerFacingComment：上記「絶対厳守」に従うこと。条件説明ではなく、
    詩的で短い編集コメントとすること（assignedTrackがある場合のみ）。

## SNS用コピー・タイトルのトーン

- 誇張・断定を避け、上品で記録的なトーンを保つ。`

const DAILY_SCENE_SCHEMA = {
  type: 'object',
  properties: {
    weekday: { type: 'string', enum: [...WEEKDAYS] },
    weeklyEnglishSubtitle: { type: 'string' },
    emotion: { type: 'string' },
    ginzaExperience: { type: 'string' },
    sceneDescription: { type: 'string' },
    editorialPointOfView: { type: 'string' },
    readerFacingComment: { type: 'string' },
  },
  required: [
    'weekday',
    'weeklyEnglishSubtitle',
    'emotion',
    'ginzaExperience',
    'sceneDescription',
    'editorialPointOfView',
    'readerFacingComment',
  ],
} as const

const TNS_DRAFT_TOOL: Anthropic.Tool = {
  name: 'emit_tns_weekly_edition',
  description:
    '🌈Tokyo Nostalgic Soundtrack週次エディション（週テーマ＋7日分のシーン・確定済み曲への編集コメント）を構造化データとして出力する',
  input_schema: {
    type: 'object',
    properties: {
      coreTheme: { type: 'string' },
      emotion: { type: 'string' },
      lifeTheme: { type: 'string' },
      ginzaExperience: { type: 'string' },
      japaneseTitleCandidates: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
      englishSubtitle: { type: 'string' },
      hook: { type: 'string' },
      afterglow: { type: 'string' },
      callToAction: { type: 'string' },
      dailyScenes: { type: 'array', items: DAILY_SCENE_SCHEMA, minItems: 7, maxItems: 7 },
    },
    required: [
      'coreTheme',
      'emotion',
      'lifeTheme',
      'ginzaExperience',
      'japaneseTitleCandidates',
      'englishSubtitle',
      'hook',
      'afterglow',
      'callToAction',
      'dailyScenes',
    ],
  },
}

function formatDailyPlansForPrompt(dailyPlans: DailyPlanInput[]): string {
  return dailyPlans
    .map((day) => {
      const trackLine = day.assignedTrack
        ? `確定済みの曲: 「${day.assignedTrack.title}」／${day.assignedTrack.artist}／${day.assignedTrack.releaseYear}年（この曲名・アーティスト・年は変更しないこと）`
        : '確定済みの曲: なし（選定中——readerFacingCommentは空文字""にすること）'

      return (
        `--- ${day.date}（${WEEKDAY_LABELS_JA[day.weekday]}／${day.weekday}／` +
        `TNS Editorial Code:${day.code}／fixedMoodLabel:${day.fixedMoodLabel || '未設定'}） ---\n` +
        `天気: ${day.weather.conditionLabel}（最高${day.weather.tempHighC ?? '不明'}℃／最低${day.weather.tempLowC ?? '不明'}℃）\n` +
        trackLine
      )
    })
    .join('\n\n')
}

export async function generateTnsWeeklyEditionDraft(
  input: GenerateTnsWeeklyEditionDraftInput,
): Promise<TnsWeeklyEditionDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません（.env参照）')
  }

  const client = new Anthropic({ apiKey })

  const userMessage =
    `週: ${input.weekStart} 〜 ${input.weekEnd}\n季節: ${input.season}\n` +
    `週間天気サマリー: ${input.weekSummary}\n\n` +
    `マロンの今週の観察（週次唯一の必須入力）: ${input.maronWeeklyObservation}\n` +
    (input.maronOptional?.mustIncludeEvent
      ? `マロン任意入力・必ず扱いたいイベント: ${input.maronOptional.mustIncludeEvent}\n`
      : '') +
    (input.maronOptional?.fieldworkNotes
      ? `マロン任意入力・フィールドワークメモ: ${input.maronOptional.fieldworkNotes}\n`
      : '') +
    `\n7日分の詳細:\n${formatDailyPlansForPrompt(input.dailyPlans)}`

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [TNS_DRAFT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_tns_weekly_edition' },
    messages: [{ role: 'user', content: userMessage }],
  })

  console.error('=== ANTHROPIC_USAGE (tns-weekly) ===', JSON.stringify(message.usage))

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    throw new Error('Claudeからemit_tns_weekly_editionツール呼び出しが得られませんでした')
  }

  const rawDraft = toolUse.input as TnsWeeklyEditionDraft

  // 防衛的再検証（Editorial Trust Layerと同じ「AIの自己申告を信用しない」
  // 設計）：assignedTrackがnullの日にAIがreaderFacingCommentを書いてしまった
  // 場合（存在しない曲へのコメントになる恐れがある）は強制的に空文字へ戻す。
  const dailyScenes = rawDraft.dailyScenes.map((scene, i) => {
    const plan = input.dailyPlans[i]
    if (!plan.assignedTrack && scene.readerFacingComment) {
      console.error(
        `[generateTnsWeeklyEditionDraft] ${plan.date}：曲未確定の日にreaderFacingCommentが` +
          '生成されたため空文字へ強制修正',
      )
      return { ...scene, readerFacingComment: '' }
    }
    return scene
  })

  // weeklyEnglishSubtitleの7日間使い回しバグ（実データで発覚、全7日が同一文に
  // なっていた）への防衛的再検証。プロンプト強化だけに頼らず、Project 02-1の
  // textSimilarity.ts（computeCharBigramJaccardSimilarity）をそのまま再利用
  // してコード側でも検証する。重複が見つかった場合は記事化を中止する。
  validateDistinctWeeklyEnglishSubtitles(dailyScenes)

  return { ...rawDraft, dailyScenes }
}

const DUPLICATE_SUBTITLE_SIMILARITY_THRESHOLD = 0.75

function validateDistinctWeeklyEnglishSubtitles(dailyScenes: DailySceneOutput[]): void {
  for (let i = 0; i < dailyScenes.length; i++) {
    for (let j = i + 1; j < dailyScenes.length; j++) {
      const a = dailyScenes[i].weeklyEnglishSubtitle.trim().toLowerCase()
      const b = dailyScenes[j].weeklyEnglishSubtitle.trim().toLowerCase()
      const isExactDuplicate = a === b
      const similarity = computeCharBigramJaccardSimilarity(a, b)
      if (isExactDuplicate || similarity >= DUPLICATE_SUBTITLE_SIMILARITY_THRESHOLD) {
        throw new Error(
          `weeklyEnglishSubtitleが${dailyScenes[i].weekday}と${dailyScenes[j].weekday}で` +
            `重複/酷似しています（類似度${similarity.toFixed(2)}）：` +
            `"${dailyScenes[i].weeklyEnglishSubtitle}" / "${dailyScenes[j].weeklyEnglishSubtitle}"。` +
            '7日分すべてが異なる文言である必要があります。生成をやり直してください。',
        )
      }
    }
  }
}
