// GINZA WHISKERS / Project 02（2026-09-14）— Storyblokのリッチテキスト
// （Tiptap/ProseMirror形式のJSONドキュメント）を、既存のプレーンテキスト前提の
// 抽出器（extractMatsuyaSweetsWeekly.ts等）にそのまま渡せる形へ平坦化する
// （純粋関数・推測しない・入力に無いテキストを生成しない）。
//
// 構造：{ type:'doc', content: [ {type:'paragraph'|'heading', content:[
//   {type:'text', text:'...'}, {type:'hard_break'}, ... ] }, ... ] }
// 同一段落内のtextノードは連結（間に区切りを入れない——スタイル違いで分割された
// 一つの文を正しく復元するため）。hard_breakは改行1つ。段落・見出しの区切りは
// 空行（\n\n）。

interface StoryblokNode {
  type?: string
  text?: string
  content?: StoryblokNode[]
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'])

function walk(node: StoryblokNode | null | undefined, out: string[]): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'text' && typeof node.text === 'string') {
    out.push(node.text)
    return
  }
  if (node.type === 'hard_break') {
    out.push('\n')
    return
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, out)
  }
  if (node.type && BLOCK_TYPES.has(node.type)) {
    out.push('\n\n')
  }
}

/** 1件のStoryblokリッチテキストdoc（{type:'doc', content:[...]}）を平坦なテキストへ変換する。 */
export function flattenStoryblokRichText(doc: unknown): string {
  const out: string[] = []
  walk(doc as StoryblokNode, out)
  return out
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 松屋銀座のストーリーcontent（{body:[...]}）から、`richText`フィールドを
 * 木構造のどの深さにあっても（`sideBySideContainer.leftContent[].richText`等の
 * ネストも含め）本文の出現順に見つけ出し、平坦化して連結する。
 * Storyblokのコンテナ系コンポーネント（sideBySideContainer等）は左右の
 * カラムを配列プロパティとして持つため、キー名を決め打ちにせず、オブジェクトの
 * 全プロパティ・配列の全要素を再帰的に探索する（新しいコンテナ種別が増えても
 * 追随できる）。
 */
export function flattenMatsuyaStoryblokStory(storyContent: unknown): string {
  const parts: string[] = []

  function collect(node: unknown): void {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) collect(item)
      return
    }
    const obj = node as Record<string, unknown>
    if (obj.richText && typeof obj.richText === 'object') {
      const t = flattenStoryblokRichText(obj.richText)
      if (t) parts.push(t)
      // richTextを消費したブロック自身の他プロパティ（画像等）は探索不要
      return
    }
    for (const key of Object.keys(obj)) {
      collect(obj[key])
    }
  }

  const body = (storyContent as { body?: unknown } | null)?.body
  if (!Array.isArray(body)) return ''
  collect(body)
  return parts.join('\n\n')
}
