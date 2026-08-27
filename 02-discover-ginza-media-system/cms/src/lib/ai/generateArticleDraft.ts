import Anthropic from '@anthropic-ai/sdk'

import { blocksToLexicalState, type TextBlock } from './lexical'

// AI編集部のAI下書き生成。CLAUDE.md 第8章「AI下書き＋人間が編集長として
// 全面レビュー」の下書き生成部分（承認前提、無人公開はしない）。
//
// 2026-08-25、CLAUDE.md第8章「Editorial Style Engine」（2026-08-19確定・
// NOTE_ARTICLE_TRIAL_STYLE_ENGINE.mdで人間承認済み）を正式反映した。
// Hook / THIS WEEK IN GINZA / Editor's Choice / Source Provenance / 結び、
// という記事構造を出力スキーマとして固定した。ArticleDraft（呼び出し元
// createDraftFromSource.tsが参照する外部契約）・lexical.ts・Payload
// スキーマは変更していない——構造化フィールドはこのファイル内で
// TextBlock[]へ変換し、既存のblocksToLexicalStateへそのまま渡す。
//
// 現状の呼び出し単位（Source 1件 → Article 1件）は変更していないため、
// editorsChoiceItemsは通常1件のみ生成される想定（プロンプトで明示）。
// 複数Editor's Choiceを束ねる週次ダイジェスト化は、DiscoveredContent
// 複数件を入力に取る後続タスクとして別途行う（今回のスコープ外）。

const PILLARS = ['歴史', '文化', 'アート', '建築', '人物', 'イベント'] as const

// Source Provenanceのfact単位の記録。Human Editorが後から追跡できるよう
// Article側（editorialProvenanceフィールド、Articles.ts）に保存する
// （2026-08-25、Human Editor Review P0-2対応）。単一Source生成では未使用
// （undefinedのまま）——週次生成でのみ設定する、後方互換の追加フィールド。
export interface EditorialProvenanceEntry {
  discoveredContentId: string | number
  sourceName: string
  sourceUrl: string
  verifiedAt?: string
  fact: string
  sourceType: 'primary' | 'official' | 'secondary'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
}

export interface ArticleDraft {
  title: string
  body: ReturnType<typeof blocksToLexicalState>
  seo: { metaTitle: string; metaDescription: string }
  socialCopy: { note: string; x: string; instagram: string }
  editorialProvenance?: EditorialProvenanceEntry[]
  // 記事末尾の単一CTA（2026-08-26、note編集部ノウハウ反映）。closingとは
  // 別にArticles.callToActionへも保存し、人間編集長が末尾だけを個別に
  // レビュー・修正できるようにする。
  callToAction: string
}

// 回遊導線（2026-08-26追加）。生成呼び出し元（createDraftFromSource.ts /
// createWeeklyDraftFromDiscoveredContent.ts）が、同じ収蔵室を持つ公開済み
// 記事をDBから機械的に検索して渡す——AIに関連記事を作文させない
// （存在しない記事タイトルの捏造を防ぐ）。
export interface RelatedArticleForPrompt {
  title: string
}

interface GenerateArticleDraftInput {
  sourceText: string
  pillars: string[]
  relatedArticles?: RelatedArticleForPrompt[]
}

const SYSTEM_PROMPT = `あなたはGINZA WHISKERS「AI GINZA EDITORIAL DESK」編集部のAI編集ライターです。
銀座が昭和という時代に育んだ文化・記憶、そして「旬の銀座」を、上品・記録的・
非扇動的なトーンで書き起こしてください。対象の柱: ${PILLARS.join('・')}。

出力は必ずemit_article_draftツールの呼び出しのみで行い、説明文を書かないこと。

## note編集部ノウハウ（2026-08-26、公式記事から抽出・反映）

- **なぜ今読む価値があるか**：hookの最初の1〜2文で、この記事を「今」読む
  意味（季節・旬性・今週性のいずれかに基づく具体的な理由）を伝えること。
  一般論的な季節の挨拶で終わらせない。
- **スマホ前提の可読性**：段落は原則2〜3文まで。前置き・言い訳・冗長な
  接続表現（「さて」「ところで」「〜については」等の遠回しな導入）を
  使わず、最初の文から要点に入ること。
- **見出しだけで内容が把握できること**：categoryLabel・name・periodは、
  見出し部分だけを拾い読みしても「何が・どこで・いつ」がわかる具体性を
  持たせる。抽象的なラベル（例：「注目のイベント」）だけで終わらせない。
- **独自の編集視点**：情報の要約で終わらせず、editorsNoteでGINZA
  WHISKERSが選んだ理由・新しい銀座の見方を必ず示す（下記参照）。
- **読者の気分・体験・発見への接続**：「なぜ今銀座でこれを体験する価値が
  あるか」「読者のどんな気分・過ごし方につながるか」を、hookまたは
  editorsNoteのいずれかで具体的に示すこと。情報の網羅性より、読者が
  「これは今の自分のための記事だ」と感じられることを優先する。

## Editorial Style Engine（記事構造）

- **hook**：長い挨拶から始めない。最初の数行で「今週の銀座の特徴」
  （季節感・街の空気・今週性）と「なぜ今読む価値があるか」を短く伝え、
  なぜこの候補を選んだのかへ自然につなぐ導入文（2〜3文）。
- **thisWeekInGinza**：GINZA WHISKERS編集部が今回何を選んだかを短く
  伝えるフレーミング文。
- **editorsChoiceItems**：候補ごとの構成。ソース素材には通常1つの情報源
  しか含まれないため、原則1件のみ生成すること。ソース素材内に明確に独立
  した複数の候補が含まれる場合に限り複数件生成してよい（推測で分割しない）。
  各項目は以下を満たすこと：
  - categoryLabel：体験の性質を表す短い英語＋日本語ラベル（例:
    「PARTICIPATE / 体験」）。イベント名の言い換えにしない。
  - name / venue / period：確認できた事実のみを記載する。
  - periodShort（2026-08-26追加）：「いつ頃か」を見出しに収まる短さで
    表す表現（目安10〜15文字、例:「8月中旬〜9月上旬」「今週末から2週間」
    「来月上旬まで」）。periodの正式な日付表記をそのまま短縮するだけで
    よく、periodにない情報を推測で作らないこと。会期がすでに短く
    見出しに収まる場合はperiodと同じ値でよい。
  - content：体験内容の客観的な説明（広告コピーの丸写しをしない）。
    2〜3文まで。
  - whyNow：確認済み事実に基づく「なぜ今か」（Fact）。推測で補完しない。
  - editorsNote：GINZA WHISKERSが独自に選んだ理由・新しい銀座の見方
    （Editorial Note）。whyNowと明確に分離し、Factと混同しないこと。
    単なる内容の要約で終わらせず、読者の気分・体験・発見につながる
    一言を必ず含める。
  - audience：どんな人・どんな時間帯に向くか。
  - sourceProvenance：使用した主要な事実ごとに1件。**「掲載サイト＝
    開催場所」と推定しないこと**。確認できない事実はverificationStatusを
    unconfirmedとし、推測で埋めない。
  各項目の見出しは「name（venue｜periodShort）」の形で自動的に組み立てら
  れる（コード側の処理、あなたが見出し文字列自体を作る必要はない）。
  そのためname・venue・periodShortの3つはそれぞれ単独でも意味が通る、
  簡潔な語句にすること（長い説明文にしない）。
- **closing**：今週の銀座をどう歩くか、という短い結び（2〜3文）。
  **役割は余韻・まとめ・編集後記に限定する**——「行ってみてください」
  「立ち寄ってみるのが良さそう」「歩いてみましょう」のような、行動を
  促す・勧める・提案する表現は一切含めないこと。次の行動を示すのは
  callToActionの役目であり、closingで先取りしてはならない。
  - 悪い例（closingに行動提案が混入）：「残暑の合間、気になった場所から
    立ち寄ってみるのが良さそうです。」
  - 良い例（余韻・まとめのみ）：「めくる・聴く・触れる——今週の銀座には、
    立ち止まるための小さな時間がいくつも用意されています。」
- **callToAction**：記事末尾で読者に取ってほしい「次の行動」を1文・1つ
  だけ示す（例：来店を促す、次回の「旬の銀座」を楽しみにしてもらう、
  紹介した場所を実際に歩いてみることを促す、等）。**記事内で唯一の
  明確な行動提案はこのフィールドに限定する**——closingやeditorsNote等
  他の箇所で行動を促す表現を重ねてはならない。

## Editorial Trust Layer

- 出典サイトの文章をそのまま転載・言い換え盗用しない。GINZA WHISKERS独自の
  解説として書き起こすこと。
- 外部画像の使用を前提とした表現（「上の写真」等）を書かない——本文は画像
  なしでも成立する記事として書くこと（画像なしは公開のBLOCKERにしない）。
- 未確認の料金・予約要否・営業時間・撮影可否等は、断定せずverification
  Statusで正直に示すこと。

## SNS用コピー

- **socialCopyNote**：note本文相当（hook〜closingの要約ではなく、note
  投稿の添え文として使う短い紹介文）。ハッシュタグは多用せず、テーマに
  直接関係するもの（収蔵室・地名・体験の性質等）に絞り3〜5個までとする。
- **socialCopyX**：noteの要約版にしない。役割は「今週の銀座、少し気になる」
  と思わせてnoteへ誘導すること。Editor's Choiceを全部説明しない。旬性・
  独自視点を一言残す。ハッシュタグは1〜2個まで。未確認情報は書かない。
- **socialCopyInstagram**：簡潔なキャプション。誇張・断定を避ける。`

const SOURCE_PROVENANCE_SCHEMA = {
  type: 'object',
  properties: {
    fact: { type: 'string' },
    sourceName: { type: 'string' },
    sourceUrl: { type: 'string' },
    sourceType: { type: 'string', enum: ['primary', 'official', 'secondary'] },
    verifiedAt: { type: 'string' },
    verificationStatus: { type: 'string', enum: ['confirmed', 'unconfirmed', 'conflicting'] },
    factType: {
      type: 'string',
      enum: ['date', 'venue', 'price', 'reservation', 'hours', 'access', 'other'],
    },
  },
  required: [
    'fact',
    'sourceName',
    'sourceUrl',
    'sourceType',
    'verifiedAt',
    'verificationStatus',
    'factType',
  ],
} as const

const EDITORS_CHOICE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    categoryLabel: { type: 'string' },
    name: { type: 'string' },
    venue: { type: 'string' },
    period: { type: 'string' },
    periodShort: { type: 'string' },
    content: { type: 'string' },
    whyNow: { type: 'string' },
    editorsNote: { type: 'string' },
    audience: { type: 'string' },
    sourceProvenance: { type: 'array', items: SOURCE_PROVENANCE_SCHEMA, minItems: 1 },
  },
  required: [
    'categoryLabel',
    'name',
    'venue',
    'period',
    'periodShort',
    'content',
    'whyNow',
    'editorsNote',
    'audience',
    'sourceProvenance',
  ],
} as const

const DRAFT_TOOL: Anthropic.Tool = {
  name: 'emit_article_draft',
  description:
    "GINZA WHISKERS「旬の銀座」記事の下書きを、Editorial Style Engineの構造（Hook/THIS WEEK IN GINZA/Editor's Choice/Source Provenance/結び）に沿った構造化データとして出力する",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      hook: { type: 'string' },
      thisWeekInGinza: { type: 'string' },
      editorsChoiceItems: {
        type: 'array',
        items: EDITORS_CHOICE_ITEM_SCHEMA,
        minItems: 1,
      },
      closing: { type: 'string' },
      callToAction: { type: 'string' },
      metaTitle: { type: 'string' },
      metaDescription: { type: 'string' },
      socialCopyNote: { type: 'string' },
      socialCopyX: { type: 'string' },
      socialCopyInstagram: { type: 'string' },
    },
    required: [
      'title',
      'hook',
      'thisWeekInGinza',
      'editorsChoiceItems',
      'closing',
      'callToAction',
      'metaTitle',
      'metaDescription',
      'socialCopyNote',
      'socialCopyX',
      'socialCopyInstagram',
    ],
  },
}

interface SourceProvenanceInput {
  fact: string
  sourceName: string
  sourceUrl: string
  sourceType: 'primary' | 'official' | 'secondary'
  verifiedAt: string
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
}

interface EditorsChoiceItemInput {
  categoryLabel: string
  name: string
  venue: string
  period: string
  periodShort: string
  content: string
  whyNow: string
  editorsNote: string
  audience: string
  sourceProvenance: SourceProvenanceInput[]
}

// 見出しに「何の情報か・どこで・いつ頃か」が自然に伝わるよう、name/venue/
// periodShortを1つの短い見出し文字列へ組み立てる（2026-08-26、見出し
// 拾い読みへの対応）。venue・periodShortが欠けている場合は該当部分を
// 省略し、長文化・不自然な空欄表示を避ける。
export function formatEditorsChoiceHeading(name: string, venue: string, periodShort: string): string {
  const detail = [venue, periodShort].filter(Boolean).join('｜')
  return detail ? `${name}（${detail}）` : name
}

interface EmitArticleDraftInput {
  title: string
  hook: string
  thisWeekInGinza: string
  editorsChoiceItems: EditorsChoiceItemInput[]
  closing: string
  callToAction: string
  metaTitle: string
  metaDescription: string
  socialCopyNote: string
  socialCopyX: string
  socialCopyInstagram: string
}

// 回遊導線ブロック（2026-08-26追加）。AIには作らせず、呼び出し元がDBから
// 取得した実在の公開済み記事タイトルのみを使う。
export function buildRelatedArticlesBlocks(relatedArticles: RelatedArticleForPrompt[]): TextBlock[] {
  if (relatedArticles.length === 0) return []
  const blocks: TextBlock[] = [
    { type: 'heading', level: 2, text: '続けて読む GINZA WHISKERSの記事' },
  ]
  for (const related of relatedArticles) {
    blocks.push({ type: 'paragraph', text: `・${related.title}` })
  }
  return blocks
}

// Editorial Style Engineの構造化フィールドを、既存のTextBlock（heading/
// paragraph/quote）へ変換する。lexical.ts側は変更しない。
function buildEditorialBlocks(
  input: EmitArticleDraftInput,
  relatedArticles: RelatedArticleForPrompt[],
): TextBlock[] {
  const blocks: TextBlock[] = []

  blocks.push({ type: 'paragraph', text: input.hook })
  blocks.push({ type: 'heading', level: 2, text: 'THIS WEEK IN GINZA' })
  blocks.push({ type: 'paragraph', text: input.thisWeekInGinza })

  input.editorsChoiceItems.forEach((item, index) => {
    const number = String(index + 1).padStart(2, '0')
    blocks.push({
      type: 'heading',
      level: 3,
      text: `EDITOR'S CHOICE ${number} — ${item.categoryLabel}`,
    })
    blocks.push({
      type: 'heading',
      level: 3,
      text: formatEditorsChoiceHeading(item.name, item.venue, item.periodShort),
    })
    blocks.push({ type: 'paragraph', text: `${item.venue}｜${item.period}` })
    blocks.push({ type: 'paragraph', text: item.content })
    blocks.push({ type: 'paragraph', text: `WHY NOW？ ${item.whyNow}` })
    blocks.push({ type: 'paragraph', text: `EDITOR'S NOTE　${item.editorsNote}` })
    if (item.audience) {
      blocks.push({ type: 'paragraph', text: item.audience })
    }
    for (const provenance of item.sourceProvenance) {
      blocks.push({
        type: 'quote',
        text: provenance.fact,
        attribution: `SOURCE: ${provenance.sourceName}／確認: ${provenance.verifiedAt}／${provenance.sourceUrl}`,
      })
    }
  })

  blocks.push({ type: 'heading', level: 2, text: '今週の銀座をどう楽しむか' })
  blocks.push({ type: 'paragraph', text: input.closing })
  blocks.push({ type: 'paragraph', text: `→ 次に：${input.callToAction}` })
  blocks.push(...buildRelatedArticlesBlocks(relatedArticles))

  return blocks
}

export async function generateArticleDraft({
  sourceText,
  pillars,
  relatedArticles = [],
}: GenerateArticleDraftInput): Promise<ArticleDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません（.env参照）')
  }

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [DRAFT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_article_draft' },
    messages: [
      {
        role: 'user',
        content: `対象の収蔵室: ${pillars.join('・')}\n\nソース素材:\n${sourceText}`,
      },
    ],
  })

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )

  if (!toolUse) {
    throw new Error('Claudeからemit_article_draftツール呼び出しが得られませんでした')
  }

  const input = toolUse.input as EmitArticleDraftInput

  return {
    title: input.title,
    body: blocksToLexicalState(buildEditorialBlocks(input, relatedArticles)),
    seo: {
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
    },
    socialCopy: {
      note: input.socialCopyNote,
      x: input.socialCopyX,
      instagram: input.socialCopyInstagram,
    },
    callToAction: input.callToAction,
  }
}

// ---------------------------------------------------------------------------
// 週次「旬の銀座」記事生成（複数DiscoveredContent入力、2026-08-25追加、
// 同日Article id=22のHuman Editor Reviewを受けてP0/P1/P2改善を反映）
//
// 上記の単一Source生成（generateArticleDraft / SYSTEM_PROMPT / DRAFT_TOOL /
// buildEditorialBlocks）は一切変更していない。週次専用のスキーマ・プロン
// プト・ブロック組み立て関数を独立して持つ——理由は、sourceName/sourceUrl/
// verifiedAtをAIに生成させず常にシステム側（候補データ）から供給する設計
// （Human Editor Review P0-1・P0-3）に変えたため、単一Source版とは
// input_schemaの形状そのものが異なるため（sourceProvenanceからfact/
// sourceType/factType/verificationStatusのみをAIに求め、sourceName/
// sourceUrl/verifiedAtは求めない）。
// ---------------------------------------------------------------------------

export interface WeeklyCandidateInput {
  discoveredContentId: string | number
  sourceText: string
  sourceName: string
  sourceUrl: string
  venue?: string
  period?: string
  // システムが実際に確認した日時（DiscoveredContent.lastCheckedAt等）。
  // AIには生成させない（Human Editor Review P0-1）——不明な場合はundefined
  // のままとし、公開本文には「確認日不明」と表示する（推測で埋めない）。
  verifiedAt?: string
}

interface GenerateWeeklyArticleDraftInput {
  candidates: WeeklyCandidateInput[]
  pillars: string[]
  relatedArticles?: RelatedArticleForPrompt[]
  // シリーズ内の自動採番（2026-08-26追加）。呼び出し元
  // （createWeeklyDraftFromDiscoveredContent.ts）が既存の週次記事数から
  // 機械的に算出して渡す——AIには生成させない（TNS #32〜#34のような既存の
  // note連載ナンバリング慣例をnote編集部ノウハウの「シリーズ性」に適用）。
  seriesEditionNumber?: number
}

const WEEKLY_SYSTEM_PROMPT = `あなたはGINZA WHISKERS「AI GINZA EDITORIAL DESK」編集部のAI編集ライターです。
週次シリーズ「旬の銀座」の記事を、上品・記録的・非扇動的なトーンで書き起こして
ください。対象の柱: ${PILLARS.join('・')}。

入力には、Maron Editor's Choiceによって既に人間が承認済みの複数候補が渡され
ます。各候補には候補番号・sourceName（掲載サイト名）・sourceUrl（記事/イベント
自体のURL）・判明していればvenue/periodが付与されています。**sourceName・
sourceUrl・確認日時はシステム側が別途保持するため、あなたが出力する
sourceProvenanceにはfact/sourceType/factType/verificationStatusのみを
含めればよく、sourceName・sourceUrl・確認日を書く必要はありません。**

出力は必ずemit_weekly_article_draftツールの呼び出しのみで行い、説明文を
書かないこと。

## タイトル（Human Editor Review P1-5、体験型を優先）

タイトルは候補名・カテゴリーの単純な列挙にしないこと。読者が銀座で何を
体験できるかが動詞・体感で伝わる表現を優先する。
- 悪い例（カテゴリー列挙型）：「音・写真・うつわが交差する、文化の秋支度」
- 良い例（体験型）：「音を聴き、写真をめくり、うつわに触れる。夏の終わりの
  銀座3選」
候補の数・体験の性質に応じて、読者が実際に取る行動（聴く・めくる・触れる・
歩く・選ぶ等）を動詞で並べる構成を基本とする。

## note編集部ノウハウ（2026-08-26、公式記事から抽出・反映）

- **なぜ今読む価値があるか**：hookの最初の1〜2文で、この記事を「今」読む
  意味（季節・旬性・今週性のいずれかに基づく具体的な理由）を伝えること。
  一般論的な季節の挨拶で終わらせない。
- **スマホ前提の可読性**：段落は原則2〜3文まで。前置き・言い訳・冗長な
  接続表現（「さて」「ところで」「〜については」等の遠回しな導入）を
  使わず、最初の文から要点に入ること。
- **見出しだけで内容が把握できること**：categoryLabel・name・periodは、
  見出し部分だけを拾い読みしても「何が・どこで・いつ」がわかる具体性を
  持たせる。抽象的なラベル（例：「注目のイベント」）だけで終わらせない。
- **独自の編集視点**：情報の要約で終わらせず、editorsNoteでGINZA
  WHISKERSが選んだ理由・新しい銀座の見方を必ず示す（下記参照）。
- **読者の気分・体験・発見への接続**：社会・季節・生活文脈から読者の
  気分・潜在ニーズを想像し、それが銀座でどんな体験・発見につながるかを
  hookまたはeditorsNoteのいずれかで具体的に示すこと。情報の網羅性より、
  読者が「これは今の自分のための記事だ」と感じられることを優先する
  （2026-08-21 CLAUDE.md確定「読者接続の編集ロジック」の実運用反映）。

## Editorial Style Engine（記事構造）

- **hook**：長い挨拶から始めない。最初の数行で「今週の銀座の特徴」
  （季節感・街の空気・今週性）と「なぜ今読む価値があるか」を短く伝え、
  なぜ今回の候補を選んだのかへ自然につなぐ導入文（2〜3文）。
- **thisWeekInGinza**：GINZA WHISKERS編集部が今回何を選んだかを短く
  伝えるフレーミング文。
- **editorsChoiceItems**：入力候補ごとに、正確に1件のeditorsChoiceItemsを
  入力の順序どおり過不足なく生成すること。候補の統合・省略・新規候補の
  追加はしない——承認済みでない情報を勝手に補ってはならない。各項目は
  以下を満たすこと：
  - categoryLabel：体験の性質を表す短い英語＋日本語ラベル（例:
    「PARTICIPATE / 体験」）。イベント名の言い換えにしない。
  - name / venue / period：確認できた事実のみを記載する。
  - periodShort（2026-08-26追加）：「いつ頃か」を見出しに収まる短さで
    表す表現（目安10〜15文字、例:「8月中旬〜9月上旬」「今週末から2週間」
    「来月上旬まで」）。periodの正式な日付表記をそのまま短縮するだけで
    よく、periodにない情報を推測で作らないこと。会期がすでに短く
    見出しに収まる場合はperiodと同じ値でよい。
  - content：体験内容の客観的な説明（広告コピーの丸写しをしない）。
    2〜3文まで。
  - whyNow：確認済み事実に基づく「なぜ今か」（Fact）。推測で補完しない。
  - editorsNote（Human Editor Review P1-4）：GINZA WHISKERSが独自に選んだ
    理由・新しい銀座の見方（Editorial Note）。whyNowと明確に分離し、Fact
    と混同しないこと。**以下のうち少なくとも1つを必ず含めること**：
    (a) なぜ銀座で体験する価値があるか、(b) 前後にどんな銀座時間を組み
    合わせられるか、(c) 今この時期に銀座へ行く理由。単なる内容の要約や
    広告コピーの言い換えだけで終わらせないこと。
  - audience：どんな人・どんな時間帯に向くか。
  - sourceProvenance：使用した主要な事実ごとに1件。fact（事実の内容）・
    sourceType（primary/official/secondary）・factType（date/venue/
    price/reservation/hours/access/other）・verificationStatus
    （confirmed/unconfirmed/conflicting）のみを出力すること。**「掲載
    サイト＝開催場所」と推定しないこと**。確認できない事実は
    verificationStatusをunconfirmedとし、推測で埋めない。
  各項目の見出しは「name（venue｜periodShort）」の形で自動的に組み立てら
  れる（コード側の処理、あなたが見出し文字列自体を作る必要はない）。
  そのためname・venue・periodShortの3つはそれぞれ単独でも意味が通る、
  簡潔な語句にすること（長い説明文にしない）。
- **closing**：今週の銀座をどう歩くか、という短い結び（2〜3文）。
  **役割は余韻・まとめ・編集後記に限定する**——「行ってみてください」
  「立ち寄ってみるのが良さそう」「歩いてみましょう」のような、行動を
  促す・勧める・提案する表現は一切含めないこと。次の行動を示すのは
  callToActionの役目であり、closingで先取りしてはならない。
  - 悪い例（closingに行動提案が混入）：「残暑の合間、気になった場所から
    立ち寄ってみるのが良さそうです。」
  - 良い例（余韻・まとめのみ）：「めくる・聴く・触れる——今週の銀座には、
    立ち止まるための小さな時間がいくつも用意されています。」
- **callToAction**：記事末尾で読者に取ってほしい「次の行動」を1文・1つ
  だけ示す（例：来店を促す、次回の「旬の銀座」を楽しみにしてもらう、
  紹介した場所を実際に歩いてみることを促す、等）。**記事内で唯一の
  明確な行動提案はこのフィールドに限定する**——closingやeditorsNote等
  他の箇所で行動を促す表現を重ねてはならない。

## Editorial Trust Layer

- 各候補の出典サイトの文章をそのまま転載・言い換え盗用しない。GINZA
  WHISKERS独自の解説として書き起こすこと。
- 外部画像の使用を前提とした表現（「上の写真」等）を書かない——本文は画像
  なしでも成立する記事として書くこと（画像なしは公開のBLOCKERにしない）。
- 未確認の料金・予約要否・営業時間・撮影可否等は、断定せずverification
  Statusで正直に示すこと。
- **確認日時（verifiedAt）は出力しないこと**。根拠のない確認日をあなたが
  作り出すと、実際には確認していない日付を読者に断定的に提示することに
  なる——これはEditorial Trust Layer違反である。確認日はシステム側が
  実際の記録から付与する。

## SNS用コピー

- **socialCopyNote**：note本文相当（hook〜closingの要約ではなく、note
  投稿の添え文として使う短い紹介文）。ハッシュタグは多用せず、テーマに
  直接関係するもの（収蔵室・地名・体験の性質等）に絞り3〜5個までとする。
- **socialCopyX**：noteの要約版にしない。役割は「今週の銀座、少し気になる」
  と思わせてnoteへ誘導すること。Editor's Choiceを全部説明しない。旬性・
  独自視点を一言残す。ハッシュタグは1〜2個まで。未確認情報は書かない。
- **socialCopyInstagram**：簡潔なキャプション。誇張・断定を避ける。`

// 週次専用のSource Provenanceスキーマ（Human Editor Review P0-1対応）。
// sourceName/sourceUrl/verifiedAtはAIに生成させず、システム側
// （WeeklyCandidateInput）から後段で機械的に付与する。
export const WEEKLY_SOURCE_PROVENANCE_SCHEMA = {
  type: 'object',
  properties: {
    fact: { type: 'string' },
    sourceType: { type: 'string', enum: ['primary', 'official', 'secondary'] },
    verificationStatus: { type: 'string', enum: ['confirmed', 'unconfirmed', 'conflicting'] },
    factType: {
      type: 'string',
      enum: ['date', 'venue', 'price', 'reservation', 'hours', 'access', 'other'],
    },
  },
  required: ['fact', 'sourceType', 'verificationStatus', 'factType'],
} as const

const WEEKLY_EDITORS_CHOICE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    categoryLabel: { type: 'string' },
    name: { type: 'string' },
    venue: { type: 'string' },
    period: { type: 'string' },
    periodShort: { type: 'string' },
    content: { type: 'string' },
    whyNow: { type: 'string' },
    editorsNote: { type: 'string' },
    audience: { type: 'string' },
    sourceProvenance: { type: 'array', items: WEEKLY_SOURCE_PROVENANCE_SCHEMA, minItems: 1 },
  },
  required: [
    'categoryLabel',
    'name',
    'venue',
    'period',
    'periodShort',
    'content',
    'whyNow',
    'editorsNote',
    'audience',
    'sourceProvenance',
  ],
} as const

const WEEKLY_DRAFT_TOOL: Anthropic.Tool = {
  name: 'emit_weekly_article_draft',
  description:
    "GINZA WHISKERS週次「旬の銀座」記事の下書きを、Editorial Style Engineの構造" +
    "（Hook/THIS WEEK IN GINZA/Editor's Choice/Source Provenance/結び）に沿った" +
    '構造化データとして出力する（sourceName/sourceUrl/確認日はシステム側が付与するため含めない）',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      hook: { type: 'string' },
      thisWeekInGinza: { type: 'string' },
      editorsChoiceItems: {
        type: 'array',
        items: WEEKLY_EDITORS_CHOICE_ITEM_SCHEMA,
        minItems: 1,
      },
      closing: { type: 'string' },
      callToAction: { type: 'string' },
      metaTitle: { type: 'string' },
      metaDescription: { type: 'string' },
      socialCopyNote: { type: 'string' },
      socialCopyX: { type: 'string' },
      socialCopyInstagram: { type: 'string' },
    },
    required: [
      'title',
      'hook',
      'thisWeekInGinza',
      'editorsChoiceItems',
      'closing',
      'callToAction',
      'metaTitle',
      'metaDescription',
      'socialCopyNote',
      'socialCopyX',
      'socialCopyInstagram',
    ],
  },
}

interface WeeklySourceProvenanceAiOutput {
  fact: string
  sourceType: 'primary' | 'official' | 'secondary'
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
}

interface WeeklyEditorsChoiceItemAiOutput {
  categoryLabel: string
  name: string
  venue: string
  period: string
  periodShort: string
  content: string
  whyNow: string
  editorsNote: string
  audience: string
  sourceProvenance: WeeklySourceProvenanceAiOutput[]
}

interface WeeklyEmitArticleDraftInput {
  title: string
  hook: string
  thisWeekInGinza: string
  editorsChoiceItems: WeeklyEditorsChoiceItemAiOutput[]
  closing: string
  callToAction: string
  metaTitle: string
  metaDescription: string
  socialCopyNote: string
  socialCopyX: string
  socialCopyInstagram: string
}

function formatWeeklyCandidatesForPrompt(candidates: WeeklyCandidateInput[]): string {
  return candidates
    .map((candidate, index) => {
      const meta = [
        `sourceName: ${candidate.sourceName}`,
        `sourceUrl: ${candidate.sourceUrl}`,
        candidate.venue ? `venue: ${candidate.venue}` : null,
        candidate.period ? `period: ${candidate.period}` : null,
      ]
        .filter(Boolean)
        .join(' / ')

      return `--- 候補${index + 1} ---\n${meta}\n本文素材:\n${candidate.sourceText}`
    })
    .join('\n\n')
}

// verifiedAtの表示用フォーマット（Human Editor Review P0-1）。
// システムに確認日時がない場合は「確認日不明」とし、AIによる推測での
// 補完はしない。
export function formatVerifiedAtForDisplay(verifiedAt: string | undefined): string {
  if (!verifiedAt) return '確認日不明'
  const parsed = new Date(verifiedAt)
  if (Number.isNaN(parsed.getTime())) return '確認日不明'
  return parsed.toISOString().slice(0, 10)
}

interface WeeklyEditorialBlocksResult {
  blocks: TextBlock[]
  provenance: EditorialProvenanceEntry[]
}

// Editorial Style Engineの構造化フィールドを、既存のTextBlock（heading/
// paragraph/quote）へ変換する（週次専用）。sourceName/sourceUrl/
// verifiedAtはAIの出力を使わず、常にcandidates（システム側データ）から
// 機械的に補う——これにより出典の取り違え・確認日の捏造を構造的に防ぐ
// （Human Editor Review P0-1・P0-3の防衛ライン）。
// 公開本文のSOURCE表示は候補（=Editor's Choice項目）ごとに1ブロックへ
// 集約し、fact単位の詳細はprovenance配列として返す（Human Editor Review
// P1-3・P0-2）——本文には出さず、Article.editorialProvenanceへ保存する。
function buildWeeklyEditorialBlocks(
  input: WeeklyEmitArticleDraftInput,
  candidates: WeeklyCandidateInput[],
  relatedArticles: RelatedArticleForPrompt[],
  seriesEditionNumber: number | undefined,
): WeeklyEditorialBlocksResult {
  const blocks: TextBlock[] = []
  const provenance: EditorialProvenanceEntry[] = []

  // シリーズの目印（2026-08-26追加）：noteクリエイターページ上で連載として
  // 認識できるよう、既存のTNS（#32〜#34）と同じ「#連番」形式の目印を冒頭に
  // 置く。番号未確定（呼び出し元が渡さない場合）はブロック自体を出さない。
  if (seriesEditionNumber !== undefined) {
    const number = String(seriesEditionNumber).padStart(3, '0')
    blocks.push({
      type: 'paragraph',
      text: `GINZA WHISKERS SERIES｜旬の銀座 #${number}`,
    })
  }

  blocks.push({ type: 'paragraph', text: input.hook })
  blocks.push({ type: 'heading', level: 2, text: 'THIS WEEK IN GINZA' })
  blocks.push({ type: 'paragraph', text: input.thisWeekInGinza })

  input.editorsChoiceItems.forEach((item, index) => {
    const candidate = candidates[index]
    const number = String(index + 1).padStart(2, '0')

    blocks.push({
      type: 'heading',
      level: 3,
      text: `EDITOR'S CHOICE ${number} — ${item.categoryLabel}`,
    })
    blocks.push({
      type: 'heading',
      level: 3,
      text: formatEditorsChoiceHeading(item.name, item.venue, item.periodShort),
    })
    blocks.push({ type: 'paragraph', text: `${item.venue}｜${item.period}` })
    blocks.push({ type: 'paragraph', text: item.content })
    blocks.push({ type: 'paragraph', text: `WHY NOW？ ${item.whyNow}` })
    blocks.push({ type: 'paragraph', text: `EDITOR'S NOTE　${item.editorsNote}` })
    if (item.audience) {
      blocks.push({ type: 'paragraph', text: item.audience })
    }

    // 公開本文：fact単位で繰り返さず、候補ごとに1つのSOURCEブロックへ集約
    // （Human Editor Review P1-3）。
    blocks.push({
      type: 'quote',
      text:
        `SOURCE: ${candidate.sourceName}／確認: ` +
        `${formatVerifiedAtForDisplay(candidate.verifiedAt)}／${candidate.sourceUrl}`,
    })

    // 内部保存：fact単位のprovenanceはHuman Editor追跡用に全件保持する
    // （Human Editor Review P0-2）——sourceName/sourceUrl/verifiedAtは
    // AI出力ではなくcandidate（システム側の実データ）から付与する。
    for (const p of item.sourceProvenance) {
      provenance.push({
        discoveredContentId: candidate.discoveredContentId,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.sourceUrl,
        verifiedAt: candidate.verifiedAt,
        fact: p.fact,
        sourceType: p.sourceType,
        factType: p.factType,
        verificationStatus: p.verificationStatus,
      })
    }
  })

  blocks.push({ type: 'heading', level: 2, text: '今週の銀座をどう楽しむか' })
  blocks.push({ type: 'paragraph', text: input.closing })
  blocks.push({ type: 'paragraph', text: `→ 次に：${input.callToAction}` })
  blocks.push(...buildRelatedArticlesBlocks(relatedArticles))

  return { blocks, provenance }
}

export async function generateWeeklyArticleDraft({
  candidates,
  pillars,
  relatedArticles = [],
  seriesEditionNumber,
}: GenerateWeeklyArticleDraftInput): Promise<ArticleDraft> {
  if (candidates.length === 0) {
    throw new Error('候補が0件のため週次記事を生成できません')
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません（.env参照）')
  }

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8192,
    system: WEEKLY_SYSTEM_PROMPT,
    tools: [WEEKLY_DRAFT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_weekly_article_draft' },
    messages: [
      {
        role: 'user',
        content: `対象の収蔵室: ${pillars.join('・')}\n\n候補数: ${candidates.length}\n\n${formatWeeklyCandidatesForPrompt(candidates)}`,
      },
    ],
  })

  console.error('=== ANTHROPIC_USAGE ===', JSON.stringify(message.usage))

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )

  if (!toolUse) {
    throw new Error('Claudeからemit_weekly_article_draftツール呼び出しが得られませんでした')
  }

  const input = toolUse.input as WeeklyEmitArticleDraftInput

  // 要件3（source provenanceを失わない）の防衛ライン：件数が一致しない場合は
  // 承認済み候補の欠落・統合が起きた疑いがあるため、記事化せず中止する。
  if (input.editorsChoiceItems.length !== candidates.length) {
    throw new Error(
      `生成されたeditorsChoiceItems件数（${input.editorsChoiceItems.length}）が入力候補数` +
        `（${candidates.length}）と一致しません。承認済み候補の欠落・統合の疑いがあるため` +
        '下書き作成を中止しました。',
    )
  }

  const { blocks, provenance } = buildWeeklyEditorialBlocks(
    input,
    candidates,
    relatedArticles,
    seriesEditionNumber,
  )

  return {
    title: input.title,
    body: blocksToLexicalState(blocks),
    seo: {
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
    },
    socialCopy: {
      note: input.socialCopyNote,
      x: input.socialCopyX,
      instagram: input.socialCopyInstagram,
    },
    editorialProvenance: provenance,
    callToAction: input.callToAction,
  }
}
