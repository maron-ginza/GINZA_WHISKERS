// GINZA WHISKERS / Project 02（2026-09-16続き7）— ArticleFacts自動導出の回帰テスト。
//
//   node --import=tsx/esm src/lib/morning/autoArticleFacts.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { deriveAutoArticleFacts, type AutoArticleFactsInput } from './autoArticleFacts'
import { applyArticleFactsReadyGate } from '../../collections/ArticleFacts'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const wellFormed: AutoArticleFactsInput = {
  title: '銀茶会イベント申し込み | 公式イベント情報 | GINZA OFFICIAL',
  articleUrl: 'https://www.ginza.jp/event/35565',
  eventStartAt: '2026-10-25T00:00:00.000Z',
  eventEndAt: '2026-10-25T00:00:00.000Z',
  category: 'ART',
}

// 実データ（2026-09-16時点の現行A候補4件。venue列は全件nullのためcategoryのみ使用）
const REAL_A_CANDIDATES: Record<number, AutoArticleFactsInput> = {
  59: {
    title: 'ポーラ ミュージアム アネックス｜POLA MUSEUM ANNEX イベント',
    articleUrl: 'https://www.po-holdings.co.jp/m-annex/event/202110.html',
    eventStartAt: '2026-10-29T00:00:00.000Z',
    eventEndAt: '2026-10-30T00:00:00.000Z',
    category: null, // 実データは未分類
  },
  438: {
    title: '🍊9月の子どものためのおはなし会 | 子どものためのおはなし会 | 教文館ナルニア国 | 教文館公式サイト',
    articleUrl: 'https://www.kyobunkwan.co.jp/narnia/event-news/event-child/entry-45904.html',
    eventStartAt: '2026-09-26T00:00:00.000Z',
    eventEndAt: '2026-09-26T00:00:00.000Z',
    category: null, // 実データは未分類
  },
  441: {
    title: '10月19日開催「親子わらべうたひろば」🍊 | 子どものためのおはなし会 | 教文館ナルニア国 | 教文館公式サイト',
    articleUrl: 'https://www.kyobunkwan.co.jp/narnia/event-news/event-child/entry-45805.html',
    eventStartAt: '2026-10-19T00:00:00.000Z',
    eventEndAt: '2026-10-19T00:00:00.000Z',
    category: 'FAMILY',
  },
  779: {
    title: 'ご予約受付中｜10月1日（木）開催・「香りの起源を求めて」著者 ドミニーク・ローク氏来日記念講演 | NEWS & TOPICS | SHISEIDO THE STORE | 資生堂',
    articleUrl: 'https://thestore.shiseido.co.jp/article/10242',
    eventStartAt: '2026-10-01T00:00:00.000Z',
    eventEndAt: '2026-10-01T00:00:00.000Z',
    category: 'WORKSHOP',
  },
}

const cases: CheckCase[] = [
  {
    // 【2026-09-22実装→2026-09-23 revert・マロン指示】field_material
    // （マロン現地収集資料）をURL不要でStage 0自動ready化の対象にしていたが、
    // AUTUMN GINZA 2026冊子の実運用で「冊子記載の個別日程が発行組織自身の
    // 公式サイトでまだ確認できない」ケース（銀茶会の開催日が公式サイトで
    // 「準備中」だった等）が見つかり、独立した裏どり無しに自動でA候補へ
    // 昇格する実害を確認したため元に戻した。field_materialでもStage 0の
    // 自動ready化はせず、常にarticleUrlが無ければeligible:falseのまま
    // （＝B判定で人間確認待ち）とする。
    name: 'field_material: articleUrlが無ければcollectionMethodに関わらずeligible:false（2026-09-23revert・人間確認を必須化）',
    fn: () => {
      const r = deriveAutoArticleFacts({
        title: '幸稲荷神社（銀座八丁神社めぐり2026 対象社）',
        articleUrl: null,
        eventStartAt: '2026-10-30T00:00:00.000Z',
        eventEndAt: '2026-10-31T00:00:00.000Z',
        category: 'ART',
        collectionMethod: 'field_material',
      })
      assert(r.eligible === false, `eligible:falseのはず（現地収集資料は人間確認必須。実際 missing=${JSON.stringify(r.missing)}）`)
      assert(r.missing.some((m) => m.includes('公式URL')), '公式URL不足の理由が含まれるはず（現地収集資料でも同様）')
    },
  },
  {
    name: 'articleUrlが無ければ従来どおりeligible:false（collectionMethodの値に関わらず・回帰確認）',
    fn: () => {
      const r1 = deriveAutoArticleFacts({
        title: 'X', articleUrl: null, eventStartAt: '2026-10-30T00:00:00.000Z', eventEndAt: null,
        collectionMethod: 'web_crawl',
      })
      const r2 = deriveAutoArticleFacts({
        title: 'X', articleUrl: null, eventStartAt: '2026-10-30T00:00:00.000Z', eventEndAt: null,
      })
      assert(r1.eligible === false, 'web_crawlはURL無しならeligible:falseのまま')
      assert(r2.eligible === false, 'collectionMethod未指定はURL無しならeligible:falseのまま（既存挙動を壊さない）')
    },
  },
  {
    name: 'title・URL・構造化期間が揃っていればeligible:true（推測なし）',
    fn: () => {
      const r = deriveAutoArticleFacts(wellFormed)
      assert(r.eligible === true, `eligible:true（実際 missing=${JSON.stringify(r.missing)}）`)
      assert(r.payload?.templateType === 'generic', 'generic テンプレートを使う')
      assert(r.payload?.hashtags.some((h) => h.tag === '#銀座'), '#銀座ハッシュタグを含む')
    },
  },
  {
    // 2026-09-17回帰：eventDateISOに開始日を使っていた旧実装は、開始済み・終了前の
    // 継続中の催事（例：昨日開始・明日終了）を readyGate.ts のisPastEventEndが
    // 「過去」と誤判定していた（実データDC#1190〜1193、松屋銀座GINZAスイートで発覚）。
    // 終了日を優先することで、開始済みでも終了前ならreadyになることを確認する。
    name: '【回帰・不具合修正】開始済み・終了前（現在進行中）の期間はreadyGateで「過去」と誤判定されない',
    fn: () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      const r = deriveAutoArticleFacts({
        title: '松屋銀座 GINZAスイート｜テスト店舗 テスト商品',
        articleUrl: 'https://www.matsuyaginza.com/jp/ginza/events/food/sweets/test',
        eventStartAt: yesterday,
        eventEndAt: tomorrow,
        category: 'SWEETS',
      })
      assert(r.eligible === true, `eligible:true（実際 missing=${JSON.stringify(r.missing)}）`)
      const gateResult = applyArticleFactsReadyGate({
        data: { ...r.payload },
        operation: 'create',
        userId: null,
        context: { autoReadyFromSavedDcFacts: true },
      })
      assert(gateResult.enrichmentStatus === 'ready', `継続中の期間はready化できる（実際 ${JSON.stringify(gateResult)}）`)
    },
  },
  {
    name: 'titleが空ならeligible:false',
    fn: () => {
      const r = deriveAutoArticleFacts({ ...wellFormed, title: '' })
      assert(r.eligible === false, 'eligible:false')
      assert(r.missing.some((m) => m.includes('contentTitle')), 'title不足の理由が明記される')
    },
  },
  {
    name: '公式URLが無ければeligible:false',
    fn: () => {
      const r = deriveAutoArticleFacts({ ...wellFormed, articleUrl: null })
      assert(r.eligible === false, 'eligible:false')
      assert(r.missing.some((m) => m.includes('sourceProvenanceFacts')), 'URL不足の理由が明記される')
    },
  },
  {
    name: '構造化開催期間（eventStartAt/eventEndAt）が両方無ければeligible:false',
    fn: () => {
      const r = deriveAutoArticleFacts({ ...wellFormed, eventStartAt: null, eventEndAt: null })
      assert(r.eligible === false, 'eligible:false')
      assert(r.missing.some((m) => m.includes('availablePeriod')), '期間不足の理由が明記される')
    },
  },
  {
    // 2026-09-27追加（マロン指示：DC#1526実データ再判定対応）。GIN NO MORI
    // 「秋限定┃栗とはちみつのパウンドケーキ」（販売開始2026-08-29のみ確認済み・
    // 終了日は「10月末頃」で公式記載として確認できず未確認のまま）で、開始日を
    // 終了日の代用にしてreadyGateが「会期・有効期間が過去」と誤判定していた
    // バグの回帰テスト。
    name: '【回帰・不具合修正（2026-09-27）】DC#1526実データ再現：開始日のみ確認済み・終了日未確認（過去日）は、開始日を終了日の代用にして「過去」と誤判定しない——eligible:falseのまま「要確認」の理由を明示する',
    fn: () => {
      const r = deriveAutoArticleFacts({
        title: '秋限定┃栗とはちみつのパウンドケーキ | パティスリー GIN NO MORI',
        articleUrl: 'https://ginnomori.info/patisserie/news/202608/1432',
        eventStartAt: '2026-08-29T00:00:00.000Z',
        eventEndAt: null,
        category: 'SWEETS',
      })
      assert(r.eligible === false, `終了日未確認のためeligible:falseのはず（実際 ${JSON.stringify(r)}）`)
      assert(
        !r.missing.some((m) => m.includes('会期・有効期間が過去')),
        `「会期・有効期間が過去」と確定的に誤判定するmissing理由が含まれないはず（実際 missing=${JSON.stringify(r.missing)}）`,
      )
      assert(
        r.missing.some((m) => m.includes('終了日は公式記載で確認できず') && m.includes('要確認')),
        `終了日未確認・要確認の理由が明記されるはず（実際 missing=${JSON.stringify(r.missing)}）`,
      )
    },
  },
  {
    name: 'eligible:trueのpayloadは、自動導出経路（context.autoReadyFromSavedDcFacts）でapplyArticleFactsReadyGateを通過する（推測ロジックを追加せず既存gateで検証）',
    fn: () => {
      const r = deriveAutoArticleFacts(wellFormed)
      assert(r.eligible === true, '前提：eligible:true')
      const result = applyArticleFactsReadyGate({
        data: { ...r.payload },
        operation: 'create',
        userId: null,
        context: { autoReadyFromSavedDcFacts: true },
      })
      assert(result.enrichmentStatus === 'ready', 'ready化される')
      assert(result.humanReviewedBy == null, '自動導出経路ではhumanReviewedByを設定しない')
      assert(typeof result.notes === 'string' && (result.notes as string).includes('[auto:readyFromSavedDcFacts]'), '監査用のnotesが記録される')
    },
  },
  {
    name: '自動導出フラグが無く、かつログインユーザーも無い場合はready遷移が拒否される（既存の安全設計は無変更）',
    fn: () => {
      const r = deriveAutoArticleFacts(wellFormed)
      let threw = false
      try {
        applyArticleFactsReadyGate({ data: { ...r.payload }, operation: 'create', userId: null, context: null })
      } catch {
        threw = true
      }
      assert(threw, '拒否される（req.user/context いずれも無い場合はready化不可）')
    },
  },
  {
    name: '人間経路（userId指定）は従来どおりhumanReviewedBy/Atが設定される（既存動作の回帰確認）',
    fn: () => {
      const r = deriveAutoArticleFacts(wellFormed)
      const result = applyArticleFactsReadyGate({
        data: { ...r.payload },
        operation: 'create',
        userId: 1,
        context: null,
      })
      assert(result.humanReviewedBy === 1, '人間経路ではhumanReviewedByが設定される')
      assert(!!result.humanReviewedAt, 'humanReviewedAtが設定される')
    },
  },
  {
    name: '不完全なpayloadは自動導出フラグがあってもready化を拒否される（完全性チェックは人間経路と同一）',
    fn: () => {
      let threw = false
      try {
        applyArticleFactsReadyGate({
          data: { enrichmentStatus: 'ready', templateType: 'generic' }, // 必須項目が空
          operation: 'create',
          userId: null,
          context: { autoReadyFromSavedDcFacts: true },
        })
      } catch {
        threw = true
      }
      assert(threw, '不完全なfactsは自動導出経路でも拒否される')
    },
  },

  // ---------- 実データ確認（2026-09-16時点の現行A候補4件） ----------
  {
    name: '実データ確認: DC#59（venue未確認・未分類）は保存済みDB情報だけで自動ready化できるか',
    fn: () => {
      const r = deriveAutoArticleFacts(REAL_A_CANDIDATES[59])
      console.log(`    DC#59: eligible=${r.eligible}${r.eligible ? '' : ` missing=${JSON.stringify(r.missing)}`}`)
      // 結果を記録するのみ（成功/失敗いずれも正しい可能性があるため assert では縛らない）
      assert(typeof r.eligible === 'boolean', '判定結果を取得できる')
    },
  },
  {
    name: '実データ確認: DC#438（未分類）は保存済みDB情報だけで自動ready化できるか',
    fn: () => {
      const r = deriveAutoArticleFacts(REAL_A_CANDIDATES[438])
      console.log(`    DC#438: eligible=${r.eligible}${r.eligible ? '' : ` missing=${JSON.stringify(r.missing)}`}`)
      assert(typeof r.eligible === 'boolean', '判定結果を取得できる')
    },
  },
  {
    name: '実データ確認: DC#441（FAMILY）は保存済みDB情報だけで自動ready化できるか',
    fn: () => {
      const r = deriveAutoArticleFacts(REAL_A_CANDIDATES[441])
      console.log(`    DC#441: eligible=${r.eligible}${r.eligible ? '' : ` missing=${JSON.stringify(r.missing)}`}`)
      assert(typeof r.eligible === 'boolean', '判定結果を取得できる')
    },
  },
  {
    name: '実データ確認: DC#779（WORKSHOP）は保存済みDB情報だけで自動ready化できるか',
    fn: () => {
      const r = deriveAutoArticleFacts(REAL_A_CANDIDATES[779])
      console.log(`    DC#779: eligible=${r.eligible}${r.eligible ? '' : ` missing=${JSON.stringify(r.missing)}`}`)
      assert(typeof r.eligible === 'boolean', '判定結果を取得できる')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('autoArticleFacts', cases)
