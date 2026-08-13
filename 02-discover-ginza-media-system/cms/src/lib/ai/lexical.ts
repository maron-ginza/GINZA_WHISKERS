// CONTENT_MODEL.md 2.2節のBlock型（簡易版）を、Payloadのリッチテキスト
// （Lexical）が保存するエディタ状態JSONへ変換する。
//
// 注意：Lexicalのノード形状はバージョンに依存する。ここでの形状は
// @payloadcms/richtext-lexicalの標準機能（見出し/段落/引用）に基づく
// 最小構成であり、実際にPayload管理画面で一度保存した内容と照合してから
// 本番投入すること（このサンドボックス環境にはDBがなく実行検証ができない）。

export interface TextBlock {
  type: 'heading' | 'paragraph' | 'quote'
  level?: 2 | 3
  text: string
  attribution?: string
}

function textNode(text: string) {
  return {
    type: 'text',
    text,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}

export function blocksToLexicalState(blocks: TextBlock[]) {
  const children = blocks.map((block) => {
    if (block.type === 'heading') {
      return {
        type: 'heading',
        tag: `h${block.level ?? 2}`,
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [textNode(block.text)],
      }
    }

    if (block.type === 'quote') {
      const text = block.attribution ? `${block.text}（${block.attribution}）` : block.text
      return {
        type: 'quote',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [textNode(text)],
      }
    }

    return {
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [textNode(block.text)],
    }
  })

  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children,
    },
  }
}
