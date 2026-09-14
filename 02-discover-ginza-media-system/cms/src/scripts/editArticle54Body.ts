import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'

// Article 54「銀茶会」の公開前エディット（2026-09-02、マロン指示）。
//
// 対象は本文（body, locale ja）のみ。既存の draft を人手レビュー前提で読める形に整える：
//   1. 冒頭「今年で24回目」の重複を解消（1度だけ言及する構成に組み直す）。
//   2. 内部制作用の表現（「核記事」「事実ベースで伝える」、角度ラベル【CORE（核記事）】）を除去。
//   3. [IMAGE: ...] マーカーは body に入れない（配置情報は note-draft.json の images[] 側が持つ。
//      buildNoteDraftPackage.ts 側で body へマーカーを挿入しないよう変更済み）。
//   4. WHY NOW? / EDITOR'S NOTE / SOURCE の英語ラベルを読者向けの日本語見出しへ。
//   5. GINZA WHISKERS のラジオパーソナリティが秋の銀座へ誘うような、やわらかい文体へ。
//   6. 開催日・時間・申込期限・当選発表・3会場・申込条件・公式URLは元情報どおり維持。
//   7. 推測・未確認情報は加えない。
//   8. 本文は約900〜1,100字。
//
// reviewStatus は draft のまま。approve・自動投稿・socialCopy / callToAction の変更は行わない。
// --dry-run で書き込みなしのプレビュー。適用時は ../_backups/ へ現行 body を退避する。

const ARTICLE_ID = 54

// --- 新しい本文（読者向け） ------------------------------------------------
type Block = { type: 'heading' | 'paragraph' | 'quote'; text: string }

const NEW_BLOCKS: Block[] = [
  {
    type: 'paragraph',
    text:
      '秋が深まるほどに、銀座の空気はどこかあらたまっていきます。今年で24回目を迎える「銀茶会（ぎんちゃかい）」は、そんな季節にふさわしい一日。オリジナルのお菓子と一服のお茶とともに、銀座の各所に設けられた席をめぐります。本年のテーマは「和（わ）」。開催は10月25日（日）の13時から16時までです。',
  },
  { type: 'heading', text: 'お茶席体験は、事前抽選のお申し込みから' },
  {
    type: 'paragraph',
    text:
      '今年は事前申し込み・抽選制で、お茶席体験の席券が配られます。お申し込みの期限は10月7日（水）まで。当選の発表は10月15日（木）で、当選された方へのご連絡をもって発表に代えられるとのことです。',
  },
  {
    type: 'paragraph',
    text:
      'お申し込みは2名様分まで、お一人様1回限り。同じ方から複数のお申し込みがあった場合は、いちばん最後のお申し込みを正として抽選されます。三つの企画はいずれも有料です。',
  },
  { type: 'heading', text: '抽選で巡る、三つの席' },
  {
    type: 'paragraph',
    text:
      '対象となるのは、全銀座エリアに対応した三つの企画です。「濃茶体験会」は植松ビル地下1階の茶室「銀座慶庵」、「聞香体験会」は日本香堂ビル3階の香間「暁」、「銀座の金沢茶会」は銀座МＳビル1階の「KOGEI Art Gallery 銀座の金沢」で開かれます。',
  },
  { type: 'heading', text: '詳しい案内は、10月1日から' },
  {
    type: 'paragraph',
    text:
      '当日のより詳しい内容は、10月1日に公開が予定されている公式ウェブサイトで案内されます。全体の概要はPDFでも確認できます。',
  },
  { type: 'heading', text: 'なぜ、いまお伝えするのか' },
  {
    type: 'paragraph',
    text:
      'お申し込みの期限が10月7日（水）、当選の発表が10月15日（木）と決まっています。10月25日（日）の当日に向けて、いま、まさにお申し込みを受け付けている時期だからです。',
  },
  { type: 'heading', text: 'GINZA WHISKERS より' },
  {
    type: 'paragraph',
    text:
      '公式サイトに掲載された申し込みの要項を、開催の概要・抽選のスケジュール・会場の三つに整理してお届けしました。はじめての方でも迷わずお申し込みいただけますように。秋のはじまりに、お茶を通してゆっくりと銀座と向き合う時間を。',
  },
  { type: 'heading', text: '情報のもとにしたもの' },
  {
    type: 'quote',
    text:
      '出典：GINZA OFFICIAL（銀座公式ウェブサイト）／確認日：2026年9月1日／https://www.ginza.jp/event/35565',
  },
  {
    type: 'paragraph',
    text:
      'この秋の銀座の一日は、抽選というささやかな一手間の先にひらかれます。当選のお知らせが届いたら、どうぞゆっくりと街へお出かけください。',
  },
  {
    type: 'paragraph',
    text: 'お茶席体験を希望される場合は、10月7日（水）までに、公式の抽選申し込みページからご登録を。',
  },
]

function textNode(text: string) {
  return { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 }
}

function toLexical(blocks: Block[]) {
  const children = blocks.map((b) => ({
    type: b.type === 'heading' ? 'heading' : b.type,
    ...(b.type === 'heading' ? { tag: 'h2' as const } : {}),
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [textNode(b.text)],
  }))
  return {
    root: { type: 'root', format: '' as const, indent: 0, version: 1, direction: 'ltr' as const, children },
  }
}

function plainLen(blocks: Block[]): number {
  // buildNoteDraftPackage が算出する bodyText と同じ規約（ブロックを \n\n 連結 + 末尾ハッシュタグ行）
  const joined = blocks.map((b) => b.text).join('\n\n') + '\n\n' + '#銀茶会 #銀座 #お茶会' + '\n'
  return [...joined].length
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = await getPayload({ config })

  const before = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
    overrideAccess: true,
  })) as {
    reviewStatus?: string
    title?: string
    body?: { root?: { children?: Array<{ tag?: string; type?: string; children?: Array<{ text?: string }> }> } }
  }

  if (before.reviewStatus !== 'draft') {
    console.error(
      `[abort] Article ${ARTICLE_ID} の reviewStatus が "${before.reviewStatus}"（draft 以外は編集しない）`,
    )
    process.exit(2)
  }

  const currentText = (before.body?.root?.children ?? [])
    .map((c) => c.children?.map((n) => n.text ?? '').join('') ?? '')
    .join('\n')

  // 想定している「編集前」の本文かどうかを確認（すでに手が入っていたら止める）
  const preEditMarkers = ['核記事', 'WHY NOW', 'EDITOR']
  const missing = preEditMarkers.filter((m) => !currentText.includes(m))
  if (missing.length > 0) {
    console.error(
      `[abort] Article ${ARTICLE_ID} の body が想定した編集前の状態ではありません（見つからない目印: ${missing.join(
        ', ',
      )}）。既に編集済みの可能性があるため中止します。`,
    )
    process.exit(2)
  }

  const newBody = toLexical(NEW_BLOCKS)
  const estLen = plainLen(NEW_BLOCKS)
  const headings = NEW_BLOCKS.filter((b) => b.type === 'heading').map((b) => b.text)

  console.log(`[plan] Article ${ARTICLE_ID}: "${before.title}"`)
  console.log(`[plan] 新ブロック数: ${NEW_BLOCKS.length}（見出し ${headings.length} / 引用 ${NEW_BLOCKS.filter((b) => b.type === 'quote').length}）`)
  console.log(`[plan] 想定 note 本文長（buildNoteDraftPackage 換算）: 約 ${estLen} 字`)
  console.log(`[plan] 見出し:`)
  for (const h of headings) console.log(`   - ${h}`)

  if (dryRun) {
    console.log('[dry-run] DB書き込みは行いません。')
    process.exit(0)
  }

  // --- バックアップ（現行 body / locale ja） ---
  const backupDir = path.resolve(process.cwd(), '..', '_backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '_')
  const backupPath = path.join(backupDir, `article_54_body_before_${stamp}.json`)
  writeFileSync(
    backupPath,
    JSON.stringify(
      { articleId: ARTICLE_ID, locale: 'ja', capturedAt: new Date().toISOString(), body: before.body },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`[backup] 現行 body を退避: ${backupPath}`)

  await payload.update({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    overrideAccess: true,
    data: { body: newBody as never },
  })
  console.log(`[done] Article ${ARTICLE_ID} body を更新（reviewStatus は draft のまま）`)

  // --- verify ---
  const after = (await payload.findByID({
    collection: 'articles',
    id: ARTICLE_ID,
    locale: 'ja',
    depth: 0,
    overrideAccess: true,
  })) as {
    reviewStatus?: string
    body?: { root?: { children?: Array<{ tag?: string; type?: string; children?: Array<{ text?: string }> }> } }
  }
  const kids = after.body?.root?.children ?? []
  const allText = kids.map((c) => c.children?.map((n) => n.text ?? '').join('') ?? '').join('\n')
  console.log(
    JSON.stringify(
      {
        reviewStatus: after.reviewStatus,
        totalBlocks: kids.length,
        headings: kids.filter((c) => (c.tag ?? c.type) === 'h2' || c.type === 'heading').map((c) =>
          c.children?.map((n) => n.text ?? '').join(''),
        ),
        stillHasInternalPhrasing: /核記事|事実ベースで伝える|【CORE|WHY NOW|EDITOR'S NOTE|SOURCE:|\[IMAGE:/.test(allText),
        keepsKeyFacts: {
          date: allText.includes('10月25日（日）'),
          time: allText.includes('13時から16時'),
          applyDeadline: allText.includes('10月7日（水）'),
          resultDate: allText.includes('10月15日（木）'),
          venue1: allText.includes('銀座慶庵'),
          venue2: allText.includes('香間「暁」'),
          venue3: allText.includes('KOGEI Art Gallery 銀座の金沢'),
          url: allText.includes('https://www.ginza.jp/event/35565'),
        },
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
