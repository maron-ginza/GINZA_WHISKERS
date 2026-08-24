import Anthropic from '@anthropic-ai/sdk'

import type { CurationResult } from './types'
import {
  EDITORIAL_SCORE_MAX,
  GENDER_AFFINITY_VALUES,
  GENERATION_VALUES,
  VISIT_STYLE_VALUES,
} from './types'

// 「旬の銀座」編集判断レイヤー：AI（Editorial Desk）によるEditorial Score・
// Audience Tagsの付与（2026-08-17）。evaluateSource.ts（Phase 14、記事化の
// proceed/reject判定）とは別の関心事——こちらは採否を判断せず、Inbox候補を
// 「どれくらい旬か・誰に響くか」で構造化評価するだけの追加メタデータレイヤー。
// 既存のeditorialStatus状態遷移には一切触れない（呼び出し側scoreSourceById.tsが
// 書き込むのはeditorialScore/audienceTagsフィールドのみ）。

export interface ScoreSourceInput {
  contentRef: string
  sourceType: string
  pillarNames: string[]
}

const SYSTEM_PROMPT = `あなたはGINZA WHISKERS「Discover GINZA」編集部のEditorial Desk AIです。
銀座が昭和という時代に育んだ文化・記憶を、上品・記録的・非扇動的に伝えるメディアの
下読み役として、投入された情報源（＝SOURCE LEDGER自動巡回が見つけたInbox候補）を
評価してください。

【重要な役割の限定】あなたは編集長ではありません。あなたの評価はあくまで
人間編集者（Maron Editor's Choice）への提案・順位付け材料であり、記事化の
採否・公開・却下を決定する権限は一切ありません。出力は必ずemit_curation_result
ツールの呼び出しのみで行い、説明文を書かないこと。

【Editorial Score（合計100点、5軸）】各軸を指定の配点内で採点し、一言（日本語で
1〜2文）の判定理由を添えてください。
- NOW / 今だけ性（0〜${EDITORIAL_SCORE_MAX.now}点）：期間限定・季節性・速報性など「今このタイミングで
  価値がある」度合い
- GINZA / 銀座固有性（0〜${EDITORIAL_SCORE_MAX.ginza}点）：銀座という土地・文化に固有で、他エリアでは
  代替できない度合い
- UX / 体験価値（0〜${EDITORIAL_SCORE_MAX.ux}点）：読者が実際に訪れる・体験することの価値の具体性
- STORY / 文化・物語性（0〜${EDITORIAL_SCORE_MAX.story}点）：昭和浪漫・歴史・文化的背景の厚み
- DISCOVERY / 発見性（0〜${EDITORIAL_SCORE_MAX.discovery}点）：既に広く知られているか、意外性・発見の
  喜びがあるか

【Audience Tags（複数選択可、情報を除外するfilterではない）】この情報が
「誰に響くか」を示すタグであり、この情報を特定の読者だけに絞り込むためのもの
ではありません。該当するものをすべて選んでください。
**重要：'all'という値はgenderAffinityとvisitStyleにのみ存在します。
generationには'all'は存在しません**——generationで判断がつかない・世代を
問わない場合は必ず'timeless'を使ってください（'all'を指定するとスキーマ
違反でエラーになります）。
- genderAffinity: female / male / all（判断がつかない場合は'all'）
- generation: next（NEXT世代）/ core（CORE世代）/ mature（MATURE世代）/
  timeless（世代を問わない、判断がつかない場合はこれを使う。'all'は不可）
- visitStyle: solo / couple / friends / family / business / all`

const CURATION_TOOL: Anthropic.Tool = {
  name: 'emit_curation_result',
  description:
    'Discover GINZA編集部向けに、情報源のEditorial Score（5軸）とAudience Tagsを構造化データとして出力する',
  input_schema: {
    type: 'object',
    properties: {
      now: { type: 'integer', description: `NOW（今だけ性）のスコア、0〜${EDITORIAL_SCORE_MAX.now}` },
      nowReason: { type: 'string', description: 'NOWスコアの判定理由（1〜2文）' },
      ginza: { type: 'integer', description: `GINZA（銀座固有性）のスコア、0〜${EDITORIAL_SCORE_MAX.ginza}` },
      ginzaReason: { type: 'string', description: 'GINZAスコアの判定理由（1〜2文）' },
      ux: { type: 'integer', description: `UX（体験価値）のスコア、0〜${EDITORIAL_SCORE_MAX.ux}` },
      uxReason: { type: 'string', description: 'UXスコアの判定理由（1〜2文）' },
      story: { type: 'integer', description: `STORY（文化・物語性）のスコア、0〜${EDITORIAL_SCORE_MAX.story}` },
      storyReason: { type: 'string', description: 'STORYスコアの判定理由（1〜2文）' },
      discovery: {
        type: 'integer',
        description: `DISCOVERY（発見性）のスコア、0〜${EDITORIAL_SCORE_MAX.discovery}`,
      },
      discoveryReason: { type: 'string', description: 'DISCOVERYスコアの判定理由（1〜2文）' },
      genderAffinity: {
        type: 'array',
        items: { type: 'string', enum: [...GENDER_AFFINITY_VALUES] },
        description: '誰に響くか（性別親和性）。複数選択可、除外用ではない',
      },
      generation: {
        type: 'array',
        items: { type: 'string', enum: [...GENERATION_VALUES] },
        description: '誰に響くか（世代）。複数選択可、除外用ではない',
      },
      visitStyle: {
        type: 'array',
        items: { type: 'string', enum: [...VISIT_STYLE_VALUES] },
        description: '誰に響くか（同行形態）。複数選択可、除外用ではない',
      },
    },
    required: [
      'now',
      'nowReason',
      'ginza',
      'ginzaReason',
      'ux',
      'uxReason',
      'story',
      'storyReason',
      'discovery',
      'discoveryReason',
      'genderAffinity',
      'generation',
      'visitStyle',
    ],
  },
}

export async function scoreSource({
  contentRef,
  sourceType,
  pillarNames,
}: ScoreSourceInput): Promise<CurationResult> {
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
    tools: [CURATION_TOOL],
    tool_choice: { type: 'tool', name: 'emit_curation_result' },
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
    throw new Error('Claudeからemit_curation_resultツール呼び出しが得られませんでした')
  }

  const input = toolUse.input as CurationResult
  return input
}
