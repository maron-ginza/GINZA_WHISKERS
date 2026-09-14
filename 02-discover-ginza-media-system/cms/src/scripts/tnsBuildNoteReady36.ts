import { writeFileSync } from 'fs'
import path from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'

// 🌈TNS #36 note転記用テキストの生成（2026-08-30、読み取り専用）。
//
//   node --env-file=.env --import=tsx/esm src/scripts/tnsBuildNoteReady36.ts
//
// 現在DBの Article 50（日本語本文）を、note へそのまま転記できる順序の
// プレーンテキストとして `02-discover-ginza-media-system/tns36_note_ready.txt`
// に書き出す。
//   - 各曜日セクション（h3 見出し）の直前に  [IMAGE: CODEn]  マーカー
//   - 各曲（♪ 行）の直後に  [YOUTUBE URL]  マーカー
//   - 内部ID・管理コード・DB情報・EDITORIAL POINT OF VIEW 等は出力しない
//     （本文には既に含まれていないことを前提。マーカーの CODEn は挿絵の
//     配置先を示す転記用ラベルであり、見出しの「GINZA CODE n」は既存の
//     読者向け表記）。
// DB は一切更新しない。reviewStatus != draft の場合は中断する。

const ARTICLE_ID = 50
const OUT = path.resolve(process.cwd(), '..', 'tns36_note_ready.txt')
const CODE_RE = /｜GINZA CODE ([1-7])[：:]/

function nodeText(n: any): string {
  if (!n) return ''
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return n.children.map(nodeText).join('')
  return ''
}

async function main() {
  const payload = await getPayload({ config })
  const article = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
  })) as Record<string, any>

  if (!article) {
    console.error(`[abort] articles id=${ARTICLE_ID} が見つからない`)
    process.exit(2)
  }
  if (article.reviewStatus !== 'draft') {
    console.error(`[abort] reviewStatus="${article.reviewStatus}"（draft のみ許可）`)
    process.exit(2)
  }

  const kids: any[] = article.body?.root?.children ?? []
  const units: string[] = []

  for (const c of kids) {
    const tag = c.tag ?? c.type
    const t = nodeText(c).trim()
    if (!t) continue

    if (tag === 'h3') {
      const m = t.match(CODE_RE)
      if (m) units.push(`[IMAGE: CODE${m[1]}]`)
    }

    units.push(t)

    if (t.startsWith('♪ ')) units.push('[YOUTUBE URL]')
  }

  const content = units.join('\n\n') + '\n'
  writeFileSync(OUT, content, 'utf8')

  const imageMarkers = content.match(/^\[IMAGE: CODE[1-7]\]$/gm) ?? []
  const youtubeMarkers = content.match(/^\[YOUTUBE URL\]$/gm) ?? []

  console.log(
    JSON.stringify(
      {
        file: OUT,
        chars: [...content].length,
        charsUtf16: content.length,
        bytes: Buffer.byteLength(content, 'utf8'),
        imageMarkers: imageMarkers.length,
        imageMarkerList: imageMarkers,
        youtubeMarkers: youtubeMarkers.length,
        reviewStatus: article.reviewStatus,
        bodyBlocks: kids.length,
      },
      null,
      2,
    ),
  )
  console.log('----CONTENT-START----')
  console.log(content)
  console.log('----CONTENT-END----')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
