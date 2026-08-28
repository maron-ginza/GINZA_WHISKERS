import Anthropic from '@anthropic-ai/sdk'

import { applyMultiAngleQualityGate } from '../curation/multiAngleQualityGate'
import { blocksToLexicalState, type TextBlock } from './lexical'
import {
  formatVerifiedAtForDisplay,
  buildRelatedArticlesBlocks,
  WEEKLY_SOURCE_PROVENANCE_SCHEMA,
  type ArticleDraft,
  type EditorialProvenanceEntry,
  type RelatedArticleForPrompt,
} from './generateArticleDraft'

// Project 02-1「核情報→最大5記事」拡張（2026-08-27）。
//
// 【位置づけ】既存の2系統（createDraftFromSource.ts＝Source単体、
// createWeeklyDraftFromDiscoveredContent.ts＝複数DiscoveredContent）とは
// 独立した第3の並行エントリーポイント。既存2系統・generateArticleDraft.ts
// 本体（SYSTEM_PROMPT/DRAFT_TOOL/WEEKLY_SYSTEM_PROMPT/WEEKLY_DRAFT_TOOL/
// generateArticleDraft/generateWeeklyArticleDraft）は一切変更していない
// ——formatVerifiedAtForDisplay・buildRelatedArticlesBlocks・
// WEEKLY_SOURCE_PROVENANCE_SCHEMA・ArticleDraft型のみをexport化して再利用
// する（可視性の変更のみ、既存の挙動は変わらない）。
//
// 【入力単位】1件のDiscoveredContent（curationStatus: approved、Maron
// Editor's Choiceで承認済み）を「核となる旬の銀座情報」とする。
//
// 【5角度】マロン指定の順序を優先順位（重複時の勝ち残り順）としてそのまま使う。
export const MULTI_ANGLE_KEYS = ['core', 'need', 'experience', 'interest', 'ginza_whiskers'] as const
export type MultiAngleKey = (typeof MULTI_ANGLE_KEYS)[number]

export const MULTI_ANGLE_LABELS: Record<MultiAngleKey, string> = {
  core: 'CORE（核記事）',
  need: 'NEED（読者ニーズ）',
  experience: 'EXPERIENCE（体験提案）',
  interest: 'INTEREST（関心接続）',
  ginza_whiskers: 'GINZA WHISKERS（編集視点）',
}

const VOLUMES = ['short', 'medium', 'long'] as const
export type ArticleVolume = (typeof VOLUMES)[number]

export interface GenerateMultiAngleDraftsInput {
  /** 記事化対象の核情報（title + excerpt等）。この範囲にない事実を生成させない */
  sourceText: string
  sourceName: string
  sourceUrl: string
  venue?: string
  period?: string
  verifiedAt?: string
  pillars: string[]
  relatedArticles?: RelatedArticleForPrompt[]
  /** editorialProvenance.discoveredContentSourceに使う元DiscoveredContent ID */
  discoveredContentId: string | number
  /**
   * 生成・保存する角度を絞る（既定は5角度すべて）。日次オーケストレーション
   * が「CORE のみ1本」で呼ぶために追加。AIツールスキーマ
   * （MULTI_ANGLE_DRAFT_TOOL、常に5候補）は変更しない——指定外の角度は
   * プロンプトで「include:false・skipReasonのみで可（本文生成不要）」と伝え、
   * 保存ループでも対象外にする。
   */
  angles?: MultiAngleKey[]
  /**
   * Project 02-2 収益化②（2026-08-28）：Phase A 由来の「note利用者の関心テーマ」。
   * AIツールスキーマは変更せず、user メッセージにのみ注入する。指定時は
   * interest / ginza_whiskers 角度がこの関心と旬の銀座情報の自然な接点を
   * 探る——関心テーマに引きずられて元情報にない事実を作らせない指示も添える。
   * interest / ginza_whiskers 角度がどちらも include:false を返した場合が
   * 「この関心テーマは銀座に接続しない」というPhase Cの最終判定になる。
   */
  readerInterestTheme?: string
}

export interface MultiAngleDraftResult {
  angle: MultiAngleKey
  volume: ArticleVolume
  draft: ArticleDraft
}

export interface MultiAngleSkipResult {
  angle: MultiAngleKey
  reason: string
}

export interface GenerateMultiAngleDraftsResult {
  included: MultiAngleDraftResult[]
  skipped: MultiAngleSkipResult[]
}

const MULTI_ANGLE_SYSTEM_PROMPT = `あなたはGINZA WHISKERS「AI GINZA EDITORIAL DESK」編集部のAI編集ライターです。
1つの「核となる旬の銀座情報」から、性質の異なる最大5つの記事候補（角度）へ
展開してください。上品・記録的・非扇動的なトーンで書き起こすこと。

出力は必ずemit_multi_angle_article_candidatesツールの呼び出しのみで行い、
説明文を書かないこと。candidatesは必ず5件（各角度1件ずつ）を出力すること
——ただし各角度のincludeがtrueかfalseかはあなたの品質判断に委ねる。

## 5つの角度（マロン指定）

1. **core**：元となる旬の銀座情報を事実ベースで記事化する核記事。原則として
   必ずinclude:trueとする——編集承認済みの核情報である以上、事実ベースの
   核記事は基本的に成立するはず。
2. **need**：その情報から、読者が知りたい・困っている・判断したいこと
   （例：行くべきか、いつが良いか、何を準備すべきか）へ展開する記事。
3. **experience**：「実際に銀座でどう楽しむか／どう過ごすか」という体験
   記事へ展開する。
4. **interest**：元情報と接点のある読者の関心テーマへ展開する記事。
   **元情報にない外部の事実を作り出してはならない**——元情報と自然に
   つながる範囲の関心（例：同じ季節・同じ文化領域・同じ体験の系統）に
   限定すること。
5. **ginza_whiskers**：GINZA WHISKERSならではの「銀座の昔・今・未来を
   紡ぐ編集視点」を加えた記事。

## 「毎回5本」にしない判断

- core以外の4角度は、元情報から**真に価値のある独立した記事**が書ける
  場合のみinclude:trueとすること。無理に別角度を捻り出さない。
- 元情報が短い・単純で複数角度に耐えない場合、1〜2角度のみの生成でよい。
- 5角度の内容が互いに重複しないこと——同じ論点・同じ文をNEED/EXPERIENCE/
  INTEREST等で繰り返さない。書けることがCOREと実質的に同じ角度は
  include:falseにすること。
- **すべてのプロパティを常に出力すること（省略不可）**。includeがfalseの
  角度は、angle/include/skipReasonに実質的な値を入れ、他の文字列
  フィールドは空文字""、sourceProvenanceは空配列[]でよい——無理に内容を
  作る必要はないが、フィールド自体を省略してはならない。
- **includeがtrueの角度は、title/hook/content等の本文系フィールドに加え、
  metaTitle・metaDescription・socialCopyNote・socialCopyX・
  socialCopyInstagramも角度ごとに個別に出力すること**（他の角度と共有・
  流用したり省略したりしない。5角度それぞれが独立した1本の記事として
  必要な情報をすべて持つこと）。
- **GINZA WHISKERS独自の視点は、それが本当に価値を加える場合にのみ用いる
  こと。すべての角度に無理に「GINZA WHISKERSらしさ」を挿入する必要はない**
  ——need/experience/interestの各角度は、読者の実用的な関心にまっすぐ
  応えることを優先してよい。ginza_whiskers角度でのみ、銀座の昔・今・未来を
  紡ぐ編集視点を前面に出すこと。

## note編集部ノウハウ（2026-08-26、公式記事から抽出・反映。CLAUDE.md第8章）

- **なぜ今読む価値があるか**：hookの最初の1〜2文で、この記事を「今」読む
  意味（季節・旬性・今週性のいずれかに基づく具体的な理由）を伝えること。
- **スマホ前提の可読性**：contentは原則2〜3文の段落を空行区切りで並べる
  こと。前置き・冗長な接続表現を使わず、最初の文から要点に入ること。
- **見出しだけで内容が把握できること**：title・angleSummaryは、拾い読み
  しても「何が・どういう角度の記事か」がわかる具体性を持たせる。
- **独自の編集視点**：情報の要約で終わらせず、editorsNoteで選んだ理由・
  新しい見方を必ず示す。

## Editorial Trust Layer（重要）

- **元情報にない事実を生成しないこと**。確認できない事実は推測で補完せず、
  sourceProvenanceのverificationStatusをunconfirmedとして正直に示す。
- 「掲載サイト＝開催場所」と推定しないこと。
- 出典サイトの文章をそのまま転載・言い換え盗用しない。GINZA WHISKERS独自の
  解説として書き起こすこと。
- 外部画像の使用を前提とした表現（「上の写真」等）を書かない——本文は画像
  なしでも成立する記事として書くこと（画像なしは公開のBLOCKERにしない）。
- **sourceName・sourceUrl・確認日時は出力しないこと**——システム側が別途
  保持し機械的に付与する。あなたが出力するsourceProvenanceにはfact・
  sourceType・factType・verificationStatusのみを含めればよい。

## 記事の構成要素（角度ごとに1本の記事として成立させる）

- **hook**：導入（2〜3文）。
- **angleSummary**：この記事がどの角度で何を伝えるかを短く示すフレーミング文
  （見出しとして使う）。
- **content**：本文（段落は空行区切り、2〜3文/段落を原則とする）。
- **whyNow**：確認済み事実に基づく「なぜ今か」。推測で補完しない。
- **editorsNote**：GINZA WHISKERSが独自に選んだ理由・新しい見方
  （whyNowと明確に分離し、Factと混同しない）。
- **audience**：どんな人・どんな時間帯に向くか（任意）。
- **closing**：余韻・まとめのみに限定する——行動を促す・勧める表現は
  callToActionに譲り、closingでは先取りしない。
- **callToAction**：記事末尾で読者に取ってほしい「次の行動」を1文・1つだけ。
- **volume**：この角度が元情報からどれだけ実質的な内容を展開できるかに
  応じて "short"（軽い一言添え程度）／"medium"（通常の1本分）／
  "long"（複数論点を持つ厚めの記事）から選ぶこと。角度ごとに機械的に
  固定せず、実際に書ける内容量で判断すること。

## SNS用コピー

- **socialCopyNote**：note投稿の添え文（短い紹介文）。ハッシュタグは
  テーマに直接関係するもの3〜5個までとする。
- **socialCopyX**：役割は「気になる」と思わせてnoteへ誘導すること。
  内容を全部説明しない。ハッシュタグは1〜2個まで。未確認情報は書かない。
- **socialCopyInstagram**：簡潔なキャプション。誇張・断定を避ける。`

const MULTI_ANGLE_CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    angle: { type: 'string', enum: [...MULTI_ANGLE_KEYS] },
    include: { type: 'boolean' },
    skipReason: {
      type: 'string',
      description: 'include:falseの理由。include:trueの場合は空文字でよい',
    },
    volume: { type: 'string', enum: [...VOLUMES] },
    title: { type: 'string' },
    hook: { type: 'string' },
    angleSummary: { type: 'string' },
    content: { type: 'string' },
    whyNow: { type: 'string' },
    editorsNote: { type: 'string' },
    audience: { type: 'string' },
    closing: { type: 'string' },
    callToAction: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    socialCopyNote: { type: 'string' },
    socialCopyX: { type: 'string' },
    socialCopyInstagram: { type: 'string' },
    sourceProvenance: { type: 'array', items: WEEKLY_SOURCE_PROVENANCE_SCHEMA },
  },
  // 2026-08-27、実AI E2Eテストで発覚した不具合の修正：narrativeフィールドを
  // required化していなかったため、include:trueの候補でもmetaTitle/
  // metaDescriptionが省略される事例が実際に発生した（4/5候補で欠落、
  // id=97でのテストで確認）。全フィールドを常時requiredにし、
  // include:falseの場合は空文字/空配列で埋めるようプロンプト側で指示する
  // ことで、モデルに一貫した形状の出力を強制する。
  required: [
    'angle',
    'include',
    'skipReason',
    'volume',
    'title',
    'hook',
    'angleSummary',
    'content',
    'whyNow',
    'editorsNote',
    'audience',
    'closing',
    'callToAction',
    'metaTitle',
    'metaDescription',
    'socialCopyNote',
    'socialCopyX',
    'socialCopyInstagram',
    'sourceProvenance',
  ],
} as const

const MULTI_ANGLE_DRAFT_TOOL: Anthropic.Tool = {
  name: 'emit_multi_angle_article_candidates',
  description:
    '1つの核情報から展開したCORE/NEED/EXPERIENCE/INTEREST/GINZA_WHISKERSの5角度の記事候補を、' +
    '各角度ごとの採否判断（include/skipReason）付きで出力する',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: MULTI_ANGLE_CANDIDATE_SCHEMA,
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ['candidates'],
  },
}

interface RawSourceProvenance {
  fact: string
  sourceType: 'primary' | 'official' | 'secondary'
  verificationStatus: 'confirmed' | 'unconfirmed' | 'conflicting'
  factType: 'date' | 'venue' | 'price' | 'reservation' | 'hours' | 'access' | 'other'
}

interface RawMultiAngleCandidate {
  angle: string
  include: boolean
  skipReason: string
  volume?: string
  title?: string
  hook?: string
  angleSummary?: string
  content?: string
  whyNow?: string
  editorsNote?: string
  audience?: string
  closing?: string
  callToAction?: string
  metaTitle?: string
  metaDescription?: string
  socialCopyNote?: string
  socialCopyX?: string
  socialCopyInstagram?: string
  sourceProvenance?: RawSourceProvenance[]
}

const REQUIRED_NARRATIVE_FIELDS: (keyof RawMultiAngleCandidate)[] = [
  'title',
  'hook',
  'angleSummary',
  'content',
  'whyNow',
  'editorsNote',
  'closing',
  'callToAction',
  'metaTitle',
  'metaDescription',
  'socialCopyNote',
  'socialCopyX',
  'socialCopyInstagram',
  'volume',
]

function isMultiAngleKey(value: string): value is MultiAngleKey {
  return (MULTI_ANGLE_KEYS as readonly string[]).includes(value)
}

function isArticleVolume(value: string | undefined): value is ArticleVolume {
  return !!value && (VOLUMES as readonly string[]).includes(value)
}

// 角度1件分の記事本文をTextBlockへ組み立てる。buildEditorialBlocks
// （generateArticleDraft.ts、単一Source版）・buildWeeklyEditorialBlocks
// （同、週次版）と同じ「見出し＋段落＋SOURCE quote＋回遊導線」という骨格を
// 踏襲しつつ、角度ラベルを冒頭に明示する点のみ異なる。
function buildAngleArticleBlocks(
  angle: MultiAngleKey,
  input: Required<
    Pick<
      RawMultiAngleCandidate,
      | 'hook'
      | 'angleSummary'
      | 'content'
      | 'whyNow'
      | 'editorsNote'
      | 'closing'
      | 'callToAction'
    >
  > &
    Pick<RawMultiAngleCandidate, 'audience'>,
  sourceMeta: { sourceName: string; sourceUrl: string; verifiedAt?: string },
  sourceProvenanceInput: RawSourceProvenance[],
  discoveredContentId: string | number,
  relatedArticles: RelatedArticleForPrompt[],
): { blocks: TextBlock[]; provenance: EditorialProvenanceEntry[] } {
  const blocks: TextBlock[] = []
  const provenance: EditorialProvenanceEntry[] = []

  blocks.push({ type: 'paragraph', text: `【${MULTI_ANGLE_LABELS[angle]}】` })
  blocks.push({ type: 'paragraph', text: input.hook })
  blocks.push({ type: 'heading', level: 2, text: input.angleSummary })

  const contentParagraphs = input.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  for (const paragraph of contentParagraphs) {
    blocks.push({ type: 'paragraph', text: paragraph })
  }

  blocks.push({ type: 'paragraph', text: `WHY NOW？ ${input.whyNow}` })
  blocks.push({ type: 'paragraph', text: `EDITOR'S NOTE　${input.editorsNote}` })
  if (input.audience) {
    blocks.push({ type: 'paragraph', text: input.audience })
  }

  blocks.push({
    type: 'quote',
    text:
      `SOURCE: ${sourceMeta.sourceName}／確認: ` +
      `${formatVerifiedAtForDisplay(sourceMeta.verifiedAt)}／${sourceMeta.sourceUrl}`,
  })

  for (const p of sourceProvenanceInput) {
    provenance.push({
      discoveredContentId,
      sourceName: sourceMeta.sourceName,
      sourceUrl: sourceMeta.sourceUrl,
      verifiedAt: sourceMeta.verifiedAt,
      fact: p.fact,
      sourceType: p.sourceType,
      factType: p.factType,
      verificationStatus: p.verificationStatus,
    })
  }

  blocks.push({ type: 'paragraph', text: input.closing })
  blocks.push({ type: 'paragraph', text: `→ 次に：${input.callToAction}` })
  blocks.push(...buildRelatedArticlesBlocks(relatedArticles))

  return { blocks, provenance }
}

export async function generateMultiAngleArticleDrafts({
  sourceText,
  sourceName,
  sourceUrl,
  venue,
  period,
  verifiedAt,
  pillars,
  relatedArticles = [],
  discoveredContentId,
  angles,
  readerInterestTheme,
}: GenerateMultiAngleDraftsInput): Promise<GenerateMultiAngleDraftsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません（.env参照）')
  }

  // 生成対象角度（既定は5角度すべて）。MULTI_ANGLE_KEYS の並び順を維持する。
  const requestedAngles: MultiAngleKey[] =
    angles && angles.length > 0
      ? MULTI_ANGLE_KEYS.filter((a) => angles.includes(a))
      : [...MULTI_ANGLE_KEYS]

  const client = new Anthropic({ apiKey })

  const focusNote =
    requestedAngles.length < MULTI_ANGLE_KEYS.length
      ? `\n\n※今回システムが採用するのは【${requestedAngles.join('・')}】角度のみです。` +
        `それ以外の角度は include:false とし skipReason に「今回の生成対象外」等を入れ、` +
        `本文系フィールドは空文字""・sourceProvenanceは空配列[]で構いません（本文を作り込む必要はありません）。`
      : ''

  const interestThemeNote = readerInterestTheme
    ? `\n\n【Phase A由来の読者関心テーマ】「${readerInterestTheme}」\n` +
      `このnote利用者の関心と、上記の旬の銀座情報とが自然につながる範囲で` +
      `interest / ginza_whiskers 角度を展開すること。\n` +
      `- 関心テーマに引きずられて、元情報にない事実（別のイベント・別の店舗・` +
      `関心テーマ側の一般論を銀座の事実であるかのように書く等）を作らないこと。\n` +
      `- 元情報と関心テーマの間に無理のない接点がない場合は、interest / ` +
      `ginza_whiskers 角度を include:false とし、skipReason にその旨（例：` +
      `「関心テーマと元情報の間に自然な接点がない」）を書くこと。`
    : ''

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8192,
    system: MULTI_ANGLE_SYSTEM_PROMPT,
    tools: [MULTI_ANGLE_DRAFT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_multi_angle_article_candidates' },
    messages: [
      {
        role: 'user',
        content:
          `対象の収蔵室: ${pillars.join('・')}\n\n` +
          `元となる旬の銀座情報（この情報にない事実を作らないこと）:\n` +
          `sourceName: ${sourceName}\nsourceUrl: ${sourceUrl}\n` +
          `venue: ${venue ?? '不明'}\nperiod: ${period ?? '不明'}\n\n` +
          `本文素材:\n${sourceText}` +
          focusNote +
          interestThemeNote,
      },
    ],
  })

  console.error('=== ANTHROPIC_USAGE (multi-angle) ===', JSON.stringify(message.usage))

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    throw new Error('Claudeからemit_multi_angle_article_candidatesツール呼び出しが得られませんでした')
  }

  const rawCandidates = (toolUse.input as { candidates: RawMultiAngleCandidate[] }).candidates

  // 角度ごとに最大1件へ正規化（AIが同一角度を複数返した場合は最初の1件のみ採用）
  const byAngle = new Map<MultiAngleKey, RawMultiAngleCandidate>()
  for (const candidate of rawCandidates) {
    if (!isMultiAngleKey(candidate.angle)) continue
    if (!byAngle.has(candidate.angle)) byAngle.set(candidate.angle, candidate)
  }

  const skipped: MultiAngleSkipResult[] = []
  const includedRaw: { angle: MultiAngleKey; candidate: RawMultiAngleCandidate }[] = []

  // 角度指定で対象外になったものは、AI出力の有無に関わらず先に除外として記録する。
  for (const angle of MULTI_ANGLE_KEYS) {
    if (!requestedAngles.includes(angle)) {
      skipped.push({ angle, reason: '今回の生成対象外（角度指定により除外）' })
    }
  }

  for (const angle of requestedAngles) {
    const candidate = byAngle.get(angle)
    if (!candidate) {
      skipped.push({ angle, reason: 'AIが当該角度を出力しなかったため除外' })
      continue
    }
    if (!candidate.include) {
      skipped.push({ angle, reason: candidate.skipReason || 'AIが価値なしと判断したため除外' })
      continue
    }

    const missingFields = REQUIRED_NARRATIVE_FIELDS.filter((field) => !candidate[field])
    const hasProvenance = (candidate.sourceProvenance?.length ?? 0) > 0
    // sourceProvenance（fact単位の出典）は core/need/experience（事実主体の角度）
    // では必須。interest / ginza_whiskers は編集的視点が主体で、元情報の facts を
    // 直接列挙しない書き方が正しいことも多いため、本文系フィールドが揃っていれば
    // provenance が空でも許容する（Editorial Trust Layer 自体はプロンプトの
    // 「元情報にない事実を作らない」で担保。2026-08-28、収益化②の実E2Eで
    // interest/ginza_whiskers が provenance 空により全落ちしたのを受けて緩和）。
    const provenanceRequired = angle !== 'interest' && angle !== 'ginza_whiskers'
    if (missingFields.length > 0 || (provenanceRequired && !hasProvenance)) {
      skipped.push({
        angle,
        reason:
          `AI出力形式が不完全なため除外（欠落: ${[...missingFields, ...(provenanceRequired && !hasProvenance ? ['sourceProvenance'] : [])].join('・')}）`,
      })
      continue
    }

    includedRaw.push({ angle, candidate })
  }

  // 品質ゲート（薄さ・重複判定）。優先順位はMULTI_ANGLE_KEYSの並び順
  // （マロン指定のCORE→NEED→EXPERIENCE→INTEREST→GINZA_WHISKERS順）をそのまま使う。
  const gateResult = applyMultiAngleQualityGate(
    includedRaw.map(({ angle, candidate }) => ({
      angle,
      text: [candidate.hook, candidate.content, candidate.editorsNote, candidate.closing]
        .filter(Boolean)
        .join('\n'),
    })),
  )
  skipped.push(...gateResult.dropped.map((d) => ({ angle: d.angle as MultiAngleKey, reason: d.reason })))

  const keptAngles = new Set(gateResult.kept.map((k) => k.angle))
  const sourceMeta = { sourceName, sourceUrl, verifiedAt }

  const included: MultiAngleDraftResult[] = includedRaw
    .filter(({ angle }) => keptAngles.has(angle))
    .map(({ angle, candidate }) => {
      const volume = isArticleVolume(candidate.volume) ? candidate.volume : 'medium'
      if (!isArticleVolume(candidate.volume)) {
        console.error(
          `[generateMultiAngleArticleDrafts] 角度"${angle}"のvolume値が不正のため"medium"に既定化: ${candidate.volume}`,
        )
      }

      const { blocks, provenance } = buildAngleArticleBlocks(
        angle,
        {
          hook: candidate.hook!,
          angleSummary: candidate.angleSummary!,
          content: candidate.content!,
          whyNow: candidate.whyNow!,
          editorsNote: candidate.editorsNote!,
          closing: candidate.closing!,
          callToAction: candidate.callToAction!,
          audience: candidate.audience,
        },
        sourceMeta,
        candidate.sourceProvenance ?? [],
        discoveredContentId,
        relatedArticles,
      )

      return {
        angle,
        volume,
        draft: {
          title: candidate.title!,
          body: blocksToLexicalState(blocks),
          seo: { metaTitle: candidate.metaTitle!, metaDescription: candidate.metaDescription! },
          socialCopy: {
            note: candidate.socialCopyNote!,
            x: candidate.socialCopyX!,
            instagram: candidate.socialCopyInstagram!,
          },
          editorialProvenance: provenance,
          callToAction: candidate.callToAction!,
        },
      }
    })

  return { included, skipped }
}
