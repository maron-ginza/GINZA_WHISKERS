// GINZA WHISKERS / Project 02 — productSweetsTemplate / productSweetsEligibility の
// 回帰テスト（2026-09-14、マロン指示：「商品・スウィーツ専用の決定論的テンプレート」新設）
//
//   ・イベント専用項目（eventDate/eventTime/venues/editionLabel/theme/
//     whatHappens/areaLead/audienceNote/paid/applyDeadline/resultDate/
//     resultRule/applyRule/officialInfoNote）を一切要求しない
//   ・公式情報にない内容を補完・推測しない（欠落は「公式記載なし」）
//   ・AI・ネットワーク・DBに触れない（純粋関数であることをソース検査でも確認）
//   ・商品名・店舗・価格・販売期間・会場・公式URL・確認日を使う
//   ・「なぜ今、見に行くか／見どころ／会期・時間・会場／訪問前の注意／出典／
//     GINZA WHISKERSの視点」の体裁
//   ・ハッシュタグ4個
//   ・既存のイベント用テンプレート（renderArticleFromTemplate.ts /
//     saleTemplate.ts / readyGate.ts / templateCheck.ts）を変更していない

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { buildProductSweetsArticle, NOT_STATED } from '../template/productSweetsTemplate'
import { checkProductSweetsEligibility } from '../template/productSweetsEligibility'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const ROOT = resolve(process.cwd(), '..')

// DC #1152 実データ相当（マロン承認済み・松屋銀座「ジッカ 神紅と多伎いちじくのタルト」）
const DC_1152_LIKE = {
  discoveredContentId: 1152,
  sourceName: '松屋銀座',
  sourceUrl:
    'https://www.matsuyaginza.com/jp/ginza/events/food/sweets/20260909#vendor=ジッカ&product=神紅と多伎いちじくのタルト',
  verifiedAt: '2026-09-13T21:05:10.496Z',
  title: '松屋銀座 GINZAスイート｜ジッカ 神紅と多伎いちじくのタルト',
  venue: '松屋銀座 地下1F GINZAスイート',
  contentType: 'event',
  excerpt: '島根県の秋の味覚【神紅】と【多伎いちじく】の二つをトンカ豆の香りとカシスと共に贅沢に組み合わせたタルト。 831円',
  eventStartAtISO: '2026-09-09T00:00:00.000Z',
  eventEndAtISO: '2026-09-15T00:00:00.000Z',
}

const cases: CheckCase[] = [
  {
    name: '【イベント専用項目を要求しない】eligibility判定はsourceName/sourceUrl/titleのみ必須で、eventDate等のイベント専用項目を一切参照しない',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/lib/template/productSweetsEligibility.ts'), 'utf8')
      for (const forbidden of [
        'eventDate',
        'eventTime',
        'editionLabel',
        'theme',
        'whatHappens',
        'areaLead',
        'audienceNote',
        'applyDeadline',
        'resultDate',
        'resultRule',
        'applyRule',
        'officialInfoNote',
      ]) {
        assert(!src.includes(forbidden), `イベント専用項目「${forbidden}」を参照している`)
      }
    },
  },
  {
    name: '【必須項目の欠落でhuman_review】title/sourceName/sourceUrlのいずれかが無いとtemplateEligible:falseになる',
    fn: () => {
      const r1 = checkProductSweetsEligibility({ discoveredContentId: 1, title: null, sourceName: 'X', sourceUrl: 'https://x' })
      assert(r1.templateEligible === false && r1.route === 'human_review', 'title欠落でeligibleになっている')
      assert(r1.missing.some((m) => m.includes('title')), 'missingにtitleが含まれない')

      const r2 = checkProductSweetsEligibility({ discoveredContentId: 2, title: 'T', sourceName: null, sourceUrl: 'https://x' })
      assert(r2.templateEligible === false, 'sourceName欠落でeligibleになっている')

      const r3 = checkProductSweetsEligibility({ discoveredContentId: 3, title: 'T', sourceName: 'X', sourceUrl: null })
      assert(r3.templateEligible === false, 'sourceUrl欠落でeligibleになっている')
    },
  },
  {
    name: '【任意項目はブロックしない】venue/excerpt/販売期間/verifiedAtが無くてもtemplateEligible:trueのまま、optionalNotStatedへ記録される',
    fn: () => {
      const r = checkProductSweetsEligibility({
        discoveredContentId: 4,
        title: 'T',
        sourceName: 'X',
        sourceUrl: 'https://x',
        venue: null,
        excerpt: null,
        eventStartAtISO: null,
        eventEndAtISO: null,
        verifiedAt: null,
      })
      assert(r.templateEligible === true, '任意項目欠落でeligibleがfalseになっている（イベント専用項目並みに必須化してしまっている）')
      assert(r.optionalNotStated.length >= 3, 'optionalNotStatedに記録されていない')
    },
  },
  {
    name: '【DC #1152相当】eligibility判定：templateEligible:true・route:product_sweets_template',
    fn: () => {
      const r = checkProductSweetsEligibility(DC_1152_LIKE)
      assert(r.templateEligible === true, `templateEligible=falseになっている: ${JSON.stringify(r.missing)}`)
      assert(r.route === 'product_sweets_template', `route=${r.route}`)
    },
  },
  {
    name: '【本文の体裁】6ブロック構成（なぜ今、見に行くか／見どころ／会期・時間・会場／訪問前の注意／GINZA WHISKERSの視点／SOURCE）',
    fn: () => {
      const r = buildProductSweetsArticle(DC_1152_LIKE)
      const headings = r.blocks.filter((b) => b.type === 'heading').map((b) => b.text)
      assert(headings.includes('なぜ今、見に行くか'), '「なぜ今、見に行くか」見出しが無い')
      assert(headings.includes('見どころ'), '「見どころ」見出しが無い')
      assert(headings.includes('会期・時間・会場'), '「会期・時間・会場」見出しが無い')
      assert(headings.includes('訪問前の注意'), '「訪問前の注意」見出しが無い')
      assert(headings.includes('GINZA WHISKERSの視点'), '「GINZA WHISKERSの視点」見出しが無い')
      assert(r.blocks.some((b) => b.type === 'quote' && b.text.startsWith('SOURCE:')), 'SOURCE行が無い')
    },
  },
  {
    name: '【見どころは公式抜粋そのまま】excerptを書き換えず本文へそのまま使う（新たな文章生成をしない）',
    fn: () => {
      const r = buildProductSweetsArticle(DC_1152_LIKE)
      const highlight = r.blocks.find((b, i) => b.type === 'paragraph' && r.blocks[i - 1]?.text === '見どころ')
      assert(!!highlight && highlight.text === DC_1152_LIKE.excerpt, `見どころが公式抜粋と一致しない: ${highlight?.text}`)
    },
  },
  {
    name: '【会期・会場・出典の使用】会期・時間・会場ブロックに販売期間・会場・価格が含まれる',
    fn: () => {
      const r = buildProductSweetsArticle(DC_1152_LIKE)
      const info = r.blocks.find((b, i) => b.type === 'paragraph' && r.blocks[i - 1]?.text === '会期・時間・会場')
      assert(!!info, '会期・時間・会場の本文ブロックが無い')
      assert(info!.text.includes('2026年9月9日〜2026年9月15日'), `会期の表示が想定と異なる: ${info!.text}`)
      assert(info!.text.includes('松屋銀座 地下1F GINZAスイート'), '会場が本文に含まれない')
      // 価格はラベル近傍でない「831円」のみのため、既存extractPriceHintの基準どおり
      // 公式記載なし（推測補完しない）のままであることを確認する。
      assert(info!.text.includes(`価格：${NOT_STATED}`), `価格の扱いが想定と異なる: ${info!.text}`)
      assert(r.priceConfirmed === false, 'ラベル近傍でない金額を確認済み価格として扱ってしまっている')
      assert(r.salesPeriodConfirmed === true, '構造化されたeventStartAt/eventEndAtがあるのに会期が未確認扱いになっている')
    },
  },
  {
    name: '【出典行】SOURCEに公式URL・出典名・確認日（YYYY-MM-DD）が含まれる',
    fn: () => {
      const r = buildProductSweetsArticle(DC_1152_LIKE)
      const source = r.blocks.find((b) => b.type === 'quote')
      assert(!!source, 'SOURCE行が無い')
      assert(source!.text.includes('松屋銀座'), '出典名が含まれない')
      assert(source!.text.includes('2026-09-13'), '確認日が含まれない')
      assert(source!.text.includes(DC_1152_LIKE.sourceUrl), '公式URLが含まれない')
    },
  },
  {
    name: '【ハッシュタグ4個・DC#1152相当】既定ルールで #旬の銀座 #銀座スイーツ #松屋銀座 #GINZATIMEEDIT になる',
    fn: () => {
      const r = buildProductSweetsArticle(DC_1152_LIKE)
      assert(r.hashtags.length === 4, `ハッシュタグが4個でない: ${r.hashtags.length}`)
      assert(r.hashtags[0] === '#旬の銀座', `1つ目が#旬の銀座でない: ${r.hashtags[0]}`)
      assert(r.hashtags.includes('#銀座スイーツ'), `#銀座スイーツが含まれない: ${JSON.stringify(r.hashtags)}`)
      assert(r.hashtags.includes('#松屋銀座'), `#松屋銀座が含まれない: ${JSON.stringify(r.hashtags)}`)
      assert(r.hashtags[3] === '#GINZATIMEEDIT', `4つ目が#GINZATIMEEDITでない: ${r.hashtags[3]}`)
    },
  },
  {
    name: '【呼び出し元指定のハッシュタグを優先】4個以上指定されたら既定ルールより優先し、先頭4個をそのまま使う',
    fn: () => {
      const r = buildProductSweetsArticle({ ...DC_1152_LIKE, hashtags: ['旬の銀座', '銀座スイーツ', '松屋銀座', 'GINZATIMEEDIT'] })
      assert(
        JSON.stringify(r.hashtags) === JSON.stringify(['#旬の銀座', '#銀座スイーツ', '#松屋銀座', '#GINZATIMEEDIT']),
        `指定ハッシュタグが反映されない: ${JSON.stringify(r.hashtags)}`,
      )
    },
  },
  {
    name: '【欠落フィールドは公式記載なし・捏造しない】venue/excerpt/販売期間/価格がすべて無い場合、本文はいずれも「公式記載なし」になり空文字や推測値を入れない',
    fn: () => {
      const r = buildProductSweetsArticle({
        discoveredContentId: 999,
        sourceName: 'テスト出典',
        sourceUrl: 'https://example.com/test',
        verifiedAt: null,
        title: 'テスト商品',
        venue: null,
        contentType: null,
        excerpt: null,
        eventStartAtISO: null,
        eventEndAtISO: null,
      })
      const info = r.blocks.find((b, i) => b.type === 'paragraph' && r.blocks[i - 1]?.text === '会期・時間・会場')
      assert(info!.text.includes(`会期：${NOT_STATED}`), '会期欠落時に公式記載なしになっていない')
      assert(info!.text.includes(`会場：${NOT_STATED}`), '会場欠落時に公式記載なしになっていない')
      assert(info!.text.includes(`価格：${NOT_STATED}`), '価格欠落時に公式記載なしになっていない')
      assert(r.provenance.length === 0, '確認できていない事実がprovenanceに紛れ込んでいる（捏造防止の破れ）')
    },
  },
  {
    name: '【provenanceは確認済み事実のみ】sourceProvenanceの各factは実際の値を含み、確認できていない項目は含まれない',
    fn: () => {
      const r = buildProductSweetsArticle(DC_1152_LIKE)
      assert(r.provenance.length === 2, `provenance件数が想定と異なる（会場・会期の2件のみのはず）: ${r.provenance.length}`)
      assert(r.provenance.every((p) => p.verificationStatus === 'confirmed'), 'confirmed以外のprovenanceが混入している')
      assert(r.provenance.every((p) => p.sourceUrl === DC_1152_LIKE.sourceUrl), 'sourceUrlが一致しないprovenanceがある')
      assert(!r.provenance.some((p) => p.factType === 'price'), '未確認の価格がprovenanceに含まれている')
    },
  },
  {
    name: '【純粋関数・AI/ネットワーク非依存】productSweetsTemplate.tsはfetch/anthropic/claude/process.envを参照しない',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/lib/template/productSweetsTemplate.ts'), 'utf8')
      assert(!/\bfetch\s*\(/.test(src), 'fetch呼び出しが含まれている')
      assert(!/anthropic|claude/i.test(src), 'Anthropic/Claude参照が含まれている')
      assert(!/process\.env/.test(src), 'process.env参照が含まれている（環境変数依存）')
      assert(!/payload\./.test(src), 'Payload（DB）呼び出しが含まれている')
    },
  },
  {
    name: '【既存のイベント用テンプレートを変更していない】renderArticleFromTemplate.ts / saleTemplate.ts / readyGate.ts / templateCheck.ts はこのタスクで無変更（新規ファイルのみ追加）',
    fn: () => {
      for (const f of [
        'cms/src/lib/template/renderArticleFromTemplate.ts',
        'cms/src/lib/template/saleTemplate.ts',
        'cms/src/lib/template/readyGate.ts',
        'cms/src/scripts/templateCheck.ts',
      ]) {
        assert(!/productSweets/i.test(readFileSync(resolve(ROOT, f), 'utf8')), `${f} が新モジュールを参照/変更している`)
      }
    },
  },
  {
    name: '【決定的】同一入力から常に同一出力（タイトル・本文・ハッシュタグ・provenanceすべて一致）',
    fn: () => {
      const a = buildProductSweetsArticle(DC_1152_LIKE)
      const b = buildProductSweetsArticle(DC_1152_LIKE)
      assert(JSON.stringify(a) === JSON.stringify(b), '同一入力で出力が変化している（決定的でない）')
    },
  },
]

export const suite = () => runSuite('productSweetsTemplate', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
