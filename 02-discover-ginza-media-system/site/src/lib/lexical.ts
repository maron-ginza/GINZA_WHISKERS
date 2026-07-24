// PayloadのrichText（Lexical）フィールドが返すJSONを最小限のHTMLへ変換する。
// CONTENT_MODEL.md 2.2節が想定するBlock種別（見出し/段落/引用/画像）に加え、
// lexicalEditor()の既定フィーチャーで生成されうるlist/linkにも対応する。
// 未知のノード種別は子要素を再帰的に展開し、内容が消えないようにする。

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 4
const FORMAT_UNDERLINE = 8
const FORMAT_CODE = 16

interface LexicalNode {
  type: string
  children?: LexicalNode[]
  text?: string
  format?: number | string
  tag?: string
  listType?: string
  url?: string
  [key: string]: unknown
}

export interface LexicalRoot {
  root: LexicalNode
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderText(node: LexicalNode): string {
  const format = typeof node.format === 'number' ? node.format : 0
  let html = escapeHtml(node.text ?? '')

  if (format & FORMAT_CODE) html = `<code>${html}</code>`
  if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`
  if (format & FORMAT_ITALIC) html = `<em>${html}</em>`
  if (format & FORMAT_UNDERLINE) html = `<u>${html}</u>`
  if (format & FORMAT_STRIKETHROUGH) html = `<s>${html}</s>`

  return html
}

function renderChildren(node: LexicalNode): string {
  return (node.children ?? []).map(renderNode).join('')
}

function renderNode(node: LexicalNode): string {
  switch (node.type) {
    case 'text':
      return renderText(node)
    case 'linebreak':
      return '<br />'
    case 'paragraph':
      return `<p>${renderChildren(node)}</p>`
    case 'heading': {
      const tag = node.tag && /^h[1-6]$/.test(node.tag) ? node.tag : 'h2'
      return `<${tag}>${renderChildren(node)}</${tag}>`
    }
    case 'quote':
      return `<blockquote>${renderChildren(node)}</blockquote>`
    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>${renderChildren(node)}</${tag}>`
    }
    case 'listitem':
      return `<li>${renderChildren(node)}</li>`
    case 'link': {
      const href = typeof node.url === 'string' ? escapeHtml(node.url) : '#'
      return `<a href="${href}">${renderChildren(node)}</a>`
    }
    default:
      // 未対応のノード種別は内容を失わないよう子要素だけ展開する
      return renderChildren(node)
  }
}

export function lexicalToHtml(value: LexicalRoot | null | undefined): string {
  if (!value?.root) return ''
  return renderChildren(value.root)
}

function extractText(node: LexicalNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.children ?? []).map(extractText).join(' ')
}

// SEOのmeta descriptionが未入力の記事向けフォールバック：本文冒頭を
// プレーンテキスト化して指定文字数に切り詰める
export function lexicalToPlainText(value: LexicalRoot | null | undefined, maxLength = 160): string {
  if (!value?.root) return ''
  const text = extractText(value.root).replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}
