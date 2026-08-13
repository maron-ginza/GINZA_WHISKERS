import Anthropic from '@anthropic-ai/sdk'

// Phase 14：AIによるSources評価。CLAUDE.md 第8章「AI支援・人間承認」の考え方を
// Sourcesの編集パイプライン（第12章2026-08-10決定）に適用する。
// AIの役割は評価・要約・Editor's Choice候補の提示までであり、承認・公開・却下の
// 確定はここでは行わない（呼び出し側のevaluateSourceByIdが状態遷移を制御する）。

const PILLARS = ['歴史', '文化', 'アート', '建築', '人物', 'イベント'] as const

export interface SourceEvaluation {
  summary: string
  evaluationReason: string
  recommendation: 'proceed' | 'reject'
  isEditorsChoice: boolean
  editorsChoiceReason?: string
}

export interface EvaluateSourceInput {
  contentRef: string
  sourceType: string
  pillarNames: string[]
}

const SYSTEM_PROMPT = `あなたはGINZA WHISKERS「Discover GINZA」編集部のAIリサーチャーです。
銀座が昭和という時代に育んだ文化・記憶を扱う、上品・記録的・非扇動的なメディアの
情報収集担当として、投入された情報源（ソース）を評価してください。
対象の柱（収蔵室）: ${PILLARS.join('・')}。

評価の観点：
- この情報源から記事化に値する内容が読み取れるか（記事化を進めるべきか）
- ブランドのトーン（上品・記録的・非扇動的）と整合するか
- 特に優先度が高く、編集部として積極的に取り上げたい「Editor's Choice」候補と
  言えるほど内容が充実・希少・独自性があるか（通常の候補はisEditorsChoice: false）

重要な制約：あなたの評価はあくまで人間編集長への提案であり、最終的な承認・公開・
却下の判断は行いません。出力は必ずemit_source_evaluationツールの呼び出しのみで
行い、説明文を書かないこと。`

const EVALUATION_TOOL: Anthropic.Tool = {
  name: 'emit_source_evaluation',
  description: 'Discover GINZA編集部向けに、情報源の評価結果を構造化データとして出力する',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '情報源の内容を2〜3文で要約したもの',
      },
      evaluationReason: {
        type: 'string',
        description: '記事化に値するかどうかの評価理由（採否判断の根拠）',
      },
      recommendation: {
        type: 'string',
        enum: ['proceed', 'reject'],
        description: '記事化のプロセスを先に進めることを推奨するか',
      },
      isEditorsChoice: {
        type: 'boolean',
        description: '特に優先度の高いEditor\'s Choice候補として推薦する場合はtrue',
      },
      editorsChoiceReason: {
        type: 'string',
        description: 'isEditorsChoiceがtrueの場合、その理由（falseの場合は空文字でよい）',
      },
    },
    required: ['summary', 'evaluationReason', 'recommendation', 'isEditorsChoice'],
  },
}

export async function evaluateSource({
  contentRef,
  sourceType,
  pillarNames,
}: EvaluateSourceInput): Promise<SourceEvaluation> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません（.env参照）')
  }

  const client = new Anthropic({ apiKey })

  const pillarLine = pillarNames.length > 0 ? pillarNames.join('・') : '（未タグ付け）'

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [EVALUATION_TOOL],
    tool_choice: { type: 'tool', name: 'emit_source_evaluation' },
    messages: [
      {
        role: 'user',
        content: `種別: ${sourceType}\n付与済みの柱: ${pillarLine}\n\n情報源:\n${contentRef}`,
      },
    ],
  })

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )

  if (!toolUse) {
    throw new Error('Claudeからemit_source_evaluationツール呼び出しが得られませんでした')
  }

  const input = toolUse.input as {
    summary: string
    evaluationReason: string
    recommendation: 'proceed' | 'reject'
    isEditorsChoice: boolean
    editorsChoiceReason?: string
  }

  return {
    summary: input.summary,
    evaluationReason: input.evaluationReason,
    recommendation: input.recommendation,
    isEditorsChoice: Boolean(input.isEditorsChoice),
    editorsChoiceReason: input.editorsChoiceReason,
  }
}
