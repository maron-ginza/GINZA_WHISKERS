// GINZA WHISKERS / Project 02（2026-09-22）— AUTUMN GINZA 2026（マロン現地収集PDF）正式登録。
//
// 【スコープ】マロンが Downloads に保存した「オータムギンザ.pdf」（全銀座会発行、
// 163.9MB・16ページ・画像のみでテキスト層なし）から、ローカルの pdftoppm＋
// Claude自身の画像読み取りのみ（外部OCR API・追加課金なし）で確認した内容を、
// 親企画7件（新規5件・既存3件への追記）として登録する。
//
// 【スコープの意図的な縮小（重要）】銀茶会サブイベント9件・秋のスウィーツ15件・
// レストラン34件・神社13件・バー15件という詳細な内訳（前回dry-runで提示済み）は、
// 個々に「実在する固有URL」を持たない（PDF掲載のみ・Webページ無し）。
// DiscoveredContent.articleUrl は NOT NULL かつ (sourceSite, articleUrl) が
// UNIQUE制約のため、これらに架空のURLを割り当てることは「実際にクロール可能な
// ページであるかのような記録を作る」ことになり、既存パイプライン（sweets-detail-
// fetch等）が後日これらを再取得しようとして404を積み重ねる副作用も生む。
// そのため今回は、実在する公式ページURLを持つ「親企画」7件のみをDiscoveredContent
// として正式登録し、サブイベント・個別店舗の詳細情報は各親企画のexcerptへ
// 構造化テキストとして保持する（スキーマ変更なし・架空URL生成なし）。
//
// 【冪等性】(sourceSite, articleUrl) の組で既存レコードを検索し、存在すれば
// 新規作成をスキップして追記のみ行う。ArticleFactsは discoveredContent の
// 1:1 unique indexで同様に冪等。
//
// 【トランザクション】Payload の db.beginTransaction/commitTransaction/
// rollbackTransaction を使用し、途中で例外が起きれば全件ロールバックする。
//
// 実行例:
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/registerAutumnGinza2026.ts --dry-run
//   cd cms && node --env-file=.env --import=tsx/esm src/scripts/registerAutumnGinza2026.ts --yes

import { getPayload } from 'payload'
import config from '../payload.config'
import { getPayloadWithRetry } from '../lib/util/getPayloadWithRetry'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const DRY = !process.argv.includes('--yes')

const ROOT = path.resolve(process.cwd(), '..')
const PDF_PATH = path.join(ROOT, 'media', 'manual-source-inbox', 'autumn-ginza-2026', 'オータムギンザ.pdf')
const PDF_RELATIVE_PATH = 'media/manual-source-inbox/autumn-ginza-2026/オータムギンザ.pdf'

const SOURCE_DOCUMENT = 'AUTUMN GINZA 2026'
const PUBLISHER = '全銀座会'
const COLLECTED_BY = 'Maron'
const COLLECTION_METHOD = 'field_material'

function provenanceNote(pdfPage: string, pdfHash: string): string {
  return (
    `[マロン現地収集資料] sourceDocument: ${SOURCE_DOCUMENT}／発行: ${PUBLISHER}／` +
    `collectionMethod: ${COLLECTION_METHOD}／collectedBy: ${COLLECTED_BY}／` +
    `PDF掲載ページ: ${pdfPage}／保存先: ${PDF_RELATIVE_PATH}／SHA-256: ${pdfHash}`
  )
}

interface NewProgramItem {
  key: string
  title: string
  articleUrl: string
  eventStartAt: string
  eventEndAt: string
  venue: string
  contentType: 'event' | 'food' | 'exhibition' | 'culture'
  primaryCategory: string
  pdfPage: string
  eventName: string
  eventDate: string
  eventTime: string
  priceText: string
  whatHappens: string
  subItemsSummary: string
}

function main() {
  const pdfBuf = readFileSync(PDF_PATH)
  const pdfHash = createHash('sha256').update(pdfBuf).digest('hex')

  const NEW_PROGRAMS: NewProgramItem[] = [
    {
      key: 'autumn-ginza-2026-hacchojinja',
      title: '銀座八丁神社めぐり2026',
      articleUrl: 'https://www.ginza.jp/hacchojinja2026/',
      eventStartAt: '2026-10-30T00:00:00.000Z',
      eventEndAt: '2026-10-31T23:59:59.000Z',
      venue:
        '銀座1〜8丁目 神社13社（幸稲荷神社・銀座稲荷神社・龍光不動尊・朝日稲荷神社・宝珠稲荷神社・' +
        '銀座山王地霊尊・宝童稲荷神社・歌舞伎稲荷神社・あづま稲荷神社・龍神稲荷神社・成功稲荷神社・' +
        '豊岩稲荷神社・熊谷稲荷神社）',
      contentType: 'culture',
      primaryCategory: 'ART',
      pdfPage: 'p.18-19',
      eventName: '銀座八丁神社めぐり2026',
      eventDate: '2026年10月30日（金）・31日（土）',
      eventTime: '11時〜16時',
      priceText: '無料（巡拝で各社記念品あり）',
      whatHappens: '銀座エリア13社の神社を巡拝し、各社で記念品を受け取れるスタンプラリー型の企画。',
      subItemsSummary: '対象13社（詳細はPDF p.18-19に各社住所・由来記載）',
    },
    {
      key: 'autumn-ginza-2026-afternoon-galleries',
      title: 'アフタヌーン・ギャラリーズ',
      articleUrl: 'https://www.ginza.jp/afternoongalleries2026/',
      eventStartAt: '2026-10-30T00:00:00.000Z',
      eventEndAt: '2026-10-31T23:59:59.000Z',
      venue: '銀座エリア画廊5コース（A〜E、約19画廊）＋TKP新橋汐留ビジネスセンター（レクチャー会場）',
      contentType: 'exhibition',
      primaryCategory: 'ART',
      pdfPage: 'p.20-21',
      eventName: 'アフタヌーン・ギャラリーズ',
      eventDate: 'ギャラリー巡りツアー：10月31日（土）／レクチャー：10月30日（金）',
      eventTime: 'ツアー13:00〜・15:00〜（所要約90分）／レクチャー18:30〜20:00',
      priceText: '無料',
      whatHappens:
        '銀座の画廊を巡るガイド付きツアー（A〜E5コース、各定員5名・先着順）と、' +
        '美術雑誌編集者によるレクチャー「何でもQ&A」（定員20名・先着順）。',
      subItemsSummary: 'A〜E 5コース・各コース複数画廊（詳細はPDF p.20-21）',
    },
    {
      key: 'autumn-ginza-2026-restaurant-week',
      title: 'ダイナースクラブ 銀座レストランウィーク 2026 Autumn',
      articleUrl: 'https://www.ginza.jp/restaurants2026/',
      eventStartAt: '2026-10-16T00:00:00.000Z',
      eventEndAt: '2026-11-03T23:59:59.000Z',
      venue: '銀座エリア参加約40店舗（和食・洋食・中華・フランス料理等）',
      contentType: 'food',
      primaryCategory: 'FOOD',
      pdfPage: 'p.22-28',
      eventName: 'ダイナースクラブ 銀座レストランウィーク 2026 Autumn',
      eventDate: '2026年10月16日（金）〜11月3日（火・祝）',
      eventTime: '各店舗の営業時間による',
      priceText: 'ランチセットコース5,500円（税込）／ディナーコース1: 11,000円（税込）／ディナーコース2: 16,500円（税込）',
      whatHappens:
        'ダイナースクラブカード会員向けの特別コース料理を、銀座エリア約40店舗で19日間提供。' +
        '予約はTableCheckまたは電話（2026年9月24日午前10時受付開始）。',
      subItemsSummary: '参加約40店舗（詳細はPDF p.22参加店舗一覧・p.24-28個別ページ）',
    },
    {
      key: 'autumn-ginza-2026-night',
      title: 'AUTUMN GINZA NIGHT（オータム・ギンザ・ナイト）',
      articleUrl: 'https://www.ginza.jp/autumnginzanight2026/',
      eventStartAt: '2026-10-16T00:00:00.000Z',
      eventEndAt: '2026-11-03T23:59:59.000Z',
      venue: '銀座エリア参加バー15店舗',
      contentType: 'food',
      primaryCategory: 'NIGHT',
      pdfPage: 'p.28-31',
      eventName: 'AUTUMN GINZA NIGHT',
      eventDate: '2026年10月16日（金）〜11月3日（火・祝）',
      eventTime: '各店舗の営業時間による',
      priceText: 'オリジナルカクテル1,650円（税込・各店1杯のみ）',
      whatHappens: '銀座の厳選バー15店舗が、期間中オリジナルカクテルを1杯1,650円（税込）で提供。',
      subItemsSummary: '参加15店舗（詳細はPDF p.30-31に各店住所・電話・営業時間）',
    },
    {
      key: 'autumn-ginza-2026-golden-parade',
      title: '交通安全ゴールデンパレード',
      articleUrl: 'https://www.ginza.jp/goldenparade2026/',
      eventStartAt: '2026-10-18T00:00:00.000Z',
      eventEndAt: '2026-10-18T23:59:59.000Z',
      venue: '銀座通り（スタート：銀座8丁目御門通り交差点／ゴール：銀座1丁目）',
      contentType: 'event',
      primaryCategory: 'EVENT',
      pdfPage: 'p.9, p.16-17',
      eventName: '交通安全ゴールデンパレード',
      eventDate: '2026年10月18日（日）',
      eventTime: '10:30〜12:00',
      priceText: '無料（観覧イベント）',
      whatHappens:
        '警視庁・東京都道路整備保全公社等の協力による交通安全パレード。白バイ・パトカー・音楽隊・' +
        '地元の小中高大学等約15団体が銀座通りをパレード。',
      subItemsSummary: '主催：全銀座会／協力：警視庁・東京都道路整備保全公社・東京都吹奏楽連盟',
    },
  ]

  // 既存3件（DC#1280＝AUTUMN GINZA本体、DC#275・DC#386＝銀茶会本体）への追記内容。
  const APPEND_TARGETS: { dcId: number; pdfPage: string; extra: string }[] = [
    {
      dcId: 1280,
      pdfPage: 'p.1-3',
      extra: '会期2026.10.16(金)-11.3(火・祝)。銀茶会／交通安全ゴールデンパレード／銀座八丁神社めぐり／アフタヌーン・ギャラリーズ／ダイナースクラブ銀座レストランウィーク／オータム・ギンザ・ナイトを含む親企画。',
    },
    {
      dcId: 275,
      pdfPage: 'p.6-16',
      extra: '第24回 銀座茶会。本会：2026年10月25日（日）13:00〜16:00。主催：一般社団法人銀座通連合会。会場：銀座1〜8丁目 各流派茶席（表千家・裏千家・江戸千家・遠州流茶道・武者小路千家・和敬流煎茶道）。サブイベント（学生創作茶席・藝大in銀座茶会・各種有料体験会等）はPDF p.12-16に詳細。',
    },
    {
      dcId: 386,
      pdfPage: 'p.6-16',
      extra: '第24回 銀座茶会。本会：2026年10月25日（日）13:00〜16:00。主催：一般社団法人銀座通連合会。詳細はDC#275と同一企画（イベント申し込みページ）。',
    },
  ]

  return { pdfHash, NEW_PROGRAMS, APPEND_TARGETS }
}

async function run() {
  const { pdfHash, NEW_PROGRAMS, APPEND_TARGETS } = main()
  console.log(`PDF SHA-256: ${pdfHash}`)
  console.log(DRY ? '=== DRY RUN（--yes 未指定、書き込みなし） ===' : '=== 実書き込みモード ===')

  const payload = await getPayloadWithRetry(() => getPayload({ config }))

  const beforeCounts = {
    discoveredContent: await payload.count({ collection: 'discovered-content', overrideAccess: true }),
    articleFacts: await payload.count({ collection: 'article-facts', overrideAccess: true }),
  }
  console.log('登録前件数:', JSON.stringify({ dc: beforeCounts.discoveredContent.totalDocs, af: beforeCounts.articleFacts.totalDocs }))

  const results = {
    created: [] as { key: string; dcId: number }[],
    skippedExisting: [] as string[],
    appended: [] as number[],
    skippedAppendAlreadyDone: [] as number[],
    errors: [] as string[],
  }

  const GINZA_OFFICIAL_SOURCE_ID = 1 // 既存 SOURCE_LEDGER「GINZA OFFICIAL」（https://www.ginza.jp/）を再利用

  let transactionID: string | number | null = null
  try {
    if (!DRY) {
      transactionID = (await payload.db.beginTransaction()) as string | number | null
    }
    const reqCtx = transactionID != null ? { req: { transactionID } as any } : {}

    // --- 新規5件 ---
    for (const item of NEW_PROGRAMS) {
      const { docs: existing } = await payload.find({
        collection: 'discovered-content',
        where: { and: [{ sourceSite: { equals: GINZA_OFFICIAL_SOURCE_ID } }, { articleUrl: { equals: item.articleUrl } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        ...reqCtx,
      })
      if (existing.length > 0) {
        results.skippedExisting.push(item.key)
        console.log(`[skip] 既存: ${item.title} (DC#${existing[0].id})`)
        continue
      }

      const note = provenanceNote(item.pdfPage, pdfHash)
      if (DRY) {
        console.log(`[would create] ${item.title} -> ${item.articleUrl}`)
        continue
      }

      const dc = await payload.create({
        collection: 'discovered-content',
        overrideAccess: true,
        data: {
          sourceSite: GINZA_OFFICIAL_SOURCE_ID,
          articleUrl: item.articleUrl,
          title: item.title,
          eventStartAt: item.eventStartAt,
          eventEndAt: item.eventEndAt,
          venue: item.venue,
          excerpt: `${note}／会場: ${item.venue}／${item.subItemsSummary}`,
          detectedAt: new Date().toISOString(),
          discoveryStatus: 'first_seen',
          contentType: item.contentType,
          articleFetchStatus: 'fetched', // PDFで既に内容確認済み。パイプラインによる再取得を防ぐ
          curationStatus: 'inbox',
        },
        ...reqCtx,
      })

      const af = await payload.create({
        collection: 'article-facts',
        overrideAccess: true,
        data: {
          discoveredContent: dc.id,
          enrichmentStatus: 'draft',
          primaryCategory: item.primaryCategory as
            | 'ART'
            | 'FOOD'
            | 'NIGHT'
            | 'EVENT'
            | 'CAFE'
            | 'SWEETS'
            | 'SHOPPING'
            | 'ARCHITECTURE'
            | 'MUSIC'
            | 'BEAUTY'
            | 'HOTEL'
            | 'WELLNESS'
            | 'EXPERIENCE'
            | 'GIFT'
            | 'WORKSHOP'
            | 'PHOTO'
            | 'FAMILY'
            | 'NIGHT_VIEW'
            | 'RAINY_DAY',
          eventName: item.eventName,
          whatHappens: item.whatHappens,
          eventDate: item.eventDate,
          eventDateISO: item.eventStartAt,
          eventTime: item.eventTime,
          areaLead: '全銀座会主催「AUTUMN GINZA 2026」の参加企画。',
          paid: item.priceText.includes('無料') ? 'free' : 'unknown',
          priceText: item.priceText,
          officialInfoNote: `詳細はAUTUMN GINZA 2026公式サイト（${item.articleUrl}）または冊子${item.pdfPage}をご確認ください。`,
          sourceProvenanceFacts: [
            {
              fact: `開催日・会場（PDF掲載ページ ${item.pdfPage}）`,
              sourceType: 'official',
              factType: 'date',
              verificationStatus: 'confirmed',
            },
          ],
          notes: note,
        },
        ...reqCtx,
      })

      results.created.push({ key: item.key, dcId: dc.id as number })
      console.log(`[created] ${item.title} -> DC#${dc.id} / AF#${af.id}`)
    }

    // --- 既存3件への追記 ---
    // 【方針変更】DiscoveredContent.excerptは3件とも既に既存の公式サイト抜粋で
    // maxLength(1300)近くまで埋まっており（DC#1280/275/386とも1200文字）、
    // これ以上の追記は検証エラーになる（実行時に判明・トランザクションは
    // 正しくロールバックされた）。加えてDC#1280には既にArticleFacts（#464、
    // enrichmentStatus=ready、Stage 0自動ready化済み）が存在すると判明した。
    // そのためexcerptには触れず、ArticleFacts.notesへ追記する方式に変更する
    // （#1280は既存レコードのnotesへ追記のみ・ready状態は変更しない。
    // #275/#386はArticleFacts未作成だったため新規作成〈draft〉する）。
    const marker = 'sourceDocument: AUTUMN GINZA 2026'
    for (const target of APPEND_TARGETS) {
      const { docs: existingAf } = await payload.find({
        collection: 'article-facts',
        where: { discoveredContent: { equals: target.dcId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        ...reqCtx,
      })
      const note = provenanceNote(target.pdfPage, pdfHash)

      if (existingAf.length > 0) {
        const af = existingAf[0]
        const currentNotes = String(af.notes ?? '')
        if (currentNotes.includes(marker)) {
          results.skippedAppendAlreadyDone.push(target.dcId)
          console.log(`[skip] DC#${target.dcId} (AF#${af.id}) は既に追記済み`)
          continue
        }
        if (DRY) {
          console.log(`[would append to existing AF] DC#${target.dcId} (AF#${af.id})`)
          continue
        }
        const newNotes = currentNotes ? `${currentNotes}\n${note}／${target.extra}` : `${note}／${target.extra}`
        await payload.update({
          collection: 'article-facts',
          id: af.id,
          overrideAccess: true,
          data: { notes: newNotes }, // enrichmentStatus等の既存フィールドには一切触れない（ready状態を保護）
          ...reqCtx,
        })
        results.appended.push(target.dcId)
        console.log(`[appended to existing AF] DC#${target.dcId} (AF#${af.id})`)
      } else {
        if (DRY) {
          console.log(`[would create new AF for append] DC#${target.dcId}`)
          continue
        }
        const af = await payload.create({
          collection: 'article-facts',
          overrideAccess: true,
          data: {
            discoveredContent: target.dcId,
            enrichmentStatus: 'draft',
            primaryCategory: 'ART',
            eventName: '銀茶会（第24回）',
            eventDate: '2026年10月25日（日）',
            eventDateISO: '2026-10-25T00:00:00.000Z',
            eventTime: '13時から16時まで',
            areaLead: '全銀座会主催「AUTUMN GINZA 2026」の参加企画。',
            notes: `${note}／${target.extra}`,
          },
          ...reqCtx,
        })
        results.appended.push(target.dcId)
        console.log(`[created new AF for append] DC#${target.dcId} (AF#${af.id})`)
      }
    }

    if (!DRY && transactionID != null) {
      await payload.db.commitTransaction(transactionID)
      console.log('=== トランザクションをコミットしました ===')
    }
  } catch (err) {
    if (!DRY && transactionID != null) {
      await payload.db.rollbackTransaction(transactionID)
      console.log('=== エラーのためロールバックしました ===')
    }
    console.error(err)
    results.errors.push(err instanceof Error ? err.message : String(err))
    console.log(JSON.stringify({ results, error: true }))
    process.exit(1)
  }

  const afterCounts = {
    discoveredContent: await payload.count({ collection: 'discovered-content', overrideAccess: true }),
    articleFacts: await payload.count({ collection: 'article-facts', overrideAccess: true }),
  }

  console.log(
    JSON.stringify({
      dryRun: DRY,
      before: { dc: beforeCounts.discoveredContent.totalDocs, af: beforeCounts.articleFacts.totalDocs },
      after: { dc: afterCounts.discoveredContent.totalDocs, af: afterCounts.articleFacts.totalDocs },
      results,
    }),
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
