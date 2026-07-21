import Anthropic from '@anthropic-ai/sdk'

import { blocksToLexicalState, type TextBlock } from './lexical'

// AI編集部のAI下書き生成。CLAUDE.md 第8章「AI下書き＋人間が編集長として
// 全面レビュー」の下書き生成部分（承認前提、無人公開はしない）。

const PILLARS = ['歴史', '文化', 'アート', '建築', '人物', 'イベント'] as const

export interface ArticleDraft {
  title: string
  body: ReturnType<typeof blocksToLexicalState>
  seo: { metaTitle: string; metaDescription: string }
  socialCopy: { note: string; x: string; instagram: string }
}

interface GenerateArticleDraftInput {
  sourceText: string
  pillars: string[]
}

const SYSTEM_PROMPT = `あなたはGINZA WHISKERS「Discover GINZA」編集部のAIライターです。
銀座が昭和という時代に育んだ文化・記憶を、上品・記録的・非扇動的なトーンで
書き起こしてください。対象の柱（収蔵室）: ${PILLARS.join('・')}。
出力は必ずemit_article_draftツールの呼び出しのみで行い、説明文を書かないこと。
本文は見出し(heading)・段落(paragraph)・引用(quote)のブロックに分けること。`

const DRAFT_TOOL: Anthropic.Tool = {
  name: 'emit_article_draft',
  description: 'Discover GINZA記事の下書きを構造化データとして出力する',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['heading', 'paragraph', 'quote'] },
            level: { type: 'number', enum: [2, 3] },
            text: { type: 'string' },
            attribution: { type: 'string' },
          },
          required: ['type', 'text'],
        },
      },
      metaTitle: { type: 'string' },
      metaDescription: { type: 'string' },
      socialCopyNote: { type: 'string' },
      socialCopyX: { type: 'string' },
      socialCopyInstagram: { type: 'string' },
    },
    required: [
      'title',
      'body',
      'metaTitle',
      'metaDescription',
      'socialCopyNote',
      'socialCopyX',
      'socialCopyInstagram',
    ],
  },
}

export async function generateArticleDraft({
  sourceText,
  pillars,
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

  const input = toolUse.input as {
    title: string
    body: TextBlock[]
    metaTitle: string
    metaDescription: string
    socialCopyNote: string
    socialCopyX: string
    socialCopyInstagram: string
  }

  return {
    title: input.title,
    body: blocksToLexicalState(input.body),
    seo: {
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
    },
    socialCopy: {
      note: input.socialCopyNote,
      x: input.socialCopyX,
      instagram: input.socialCopyInstagram,
    },
  }
}
