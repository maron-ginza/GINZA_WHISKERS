import { getPayload } from 'payload'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../payload.config'
import { createDraftFromArticleFacts } from '../lib/template/createDraftFromArticleFacts'

// GINZA WHISKERS / Project 02（2026-09-07）— DC #369（花西子 FLORASIS「洛花飛霞チーク」、
// ArticleFacts が承認済み〈enrichmentStatus=ready、マロン本人が承認ボタンで確定〉）から、
// 「銀座情報局 by GINZA WHISKERS」note記事下書きを生成する。
//
// 【厳守】
//   ・確認済み ArticleFacts（confirmed 事実）と公式出典だけを使う。AI 呼び出しなし
//     （createDraftFromArticleFacts は決定的テンプレート・追加課金0円）。
//   ・ハッシュタグは、既存の確認済みテキスト（eventName・venues）に実際に現れる語だけを
//     タグ化する（新しい主張を作らない）。4個に調整。
//   ・reviewStatus は 'draft' 固定。公開・note投稿・push・外部送信は行わない。

const DC_ID = 369

async function main() {
  const payload = await getPayload({ config })

  const factsRes = await payload.find({
    collection: 'article-facts',
    where: { discoveredContent: { equals: DC_ID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const factsDoc = factsRes.docs[0] as unknown as Record<string, unknown>
  if (factsDoc.enrichmentStatus !== 'ready') throw new Error('ArticleFacts が ready でない。中止。')

  // --- ハッシュタグを4個へ（既存の確認済みテキストにある語のみ。新しい主張を作らない） ---
  const existingTags = (factsDoc.hashtags as { tag: string }[] | null) ?? []
  const eventName = String(factsDoc.eventName ?? '')
  const venues = (factsDoc.venues as { name?: string; place?: string }[] | null) ?? []
  const venueText = venues.map((v) => `${v.name ?? ''} ${v.place ?? ''}`).join(' ')
  const desiredTags = ['#銀座']
  if (/GINZA\s*SIX/i.test(venueText)) desiredTags.push('#GINZASIX')
  if (/花西子|FLORASIS/i.test(venueText) || /花西子|FLORASIS/i.test(eventName)) desiredTags.push('#花西子FLORASIS')
  if (/チーク/.test(eventName)) desiredTags.push('#チーク')
  const finalTags = [...new Set([...existingTags.map((t) => t.tag), ...desiredTags])].slice(0, 4)
  console.log('確認済みテキストから導いたハッシュタグ（4個）:', finalTags)
  await payload.update({
    collection: 'article-facts',
    id: factsDoc.id as number,
    overrideAccess: true,
    data: { hashtags: finalTags.map((tag) => ({ tag })) } as never,
  })

  // --- 決定的テンプレートで下書き生成（AI なし・確認済み事実のみ） ---
  const result = await createDraftFromArticleFacts(payload, DC_ID, { dryRun: false, regenerate: true })
  console.log('\n=== createDraftFromArticleFacts 結果 ===')
  console.log('status=' + result.status, 'articleId=' + result.articleId)
  if (result.status !== 'created' && result.status !== 'updated') {
    console.log(JSON.stringify(result, null, 2))
    throw new Error('下書き生成に失敗（status=' + result.status + '）')
  }
  const preview = result.preview!

  // --- note本文の組み立て（テンプレート出力＋冒頭挿絵の注釈文。新しい事実は加えない） ---
  const ILLUSTRATION_CAPTION =
    '※画像は記事内容をもとに生成したイメージです。実際の商品・店舗内装とは異なります。'
  const lines: string[] = []
  lines.push(preview.title)
  lines.push('')
  lines.push('（冒頭挿絵）')
  lines.push(ILLUSTRATION_CAPTION)
  lines.push('')
  for (const b of preview.blocks) {
    if (b.type === 'heading') {
      const marker = b.level === 1 ? '■' : b.level === 2 ? '◆' : '・'
      lines.push(`${marker} ${b.text}`)
    } else {
      lines.push(b.text)
    }
    lines.push('')
  }
  if (preview.callToAction) {
    lines.push(preview.callToAction)
    lines.push('')
  }
  lines.push(finalTags.join(' '))
  const noteBody = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'

  const dir = resolve(process.cwd(), '..', '.devlogs', 'manual-drafts', '2026-09-07-dc369-florasis-cheek')
  mkdirSync(dir, { recursive: true })
  const bodyPath = resolve(dir, 'note-body.txt')
  const jsonPath = resolve(dir, 'note-draft.json')
  writeFileSync(bodyPath, noteBody, 'utf8')
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        discoveredContentId: DC_ID,
        articleId: result.articleId,
        title: preview.title,
        hashtags: finalTags,
        illustrationCaption: ILLUSTRATION_CAPTION,
        sourceUrl: preview.sourceUrl,
        verifiedAt: preview.verifiedAt,
        provenance: preview.provenance,
        note: 'AI呼び出しなし。決定的テンプレート（createDraftFromArticleFacts）による生成。reviewStatus=draft。公開・note投稿・push未実施。',
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log('\n=== 保存先 ===')
  console.log('Article（Payload DB, reviewStatus=draft）: id=' + result.articleId)
  console.log('note本文ファイル: ' + bodyPath)
  console.log('構造化パッケージ: ' + jsonPath)
  console.log('\n=== 記事全文 ===\n')
  console.log(noteBody)

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
