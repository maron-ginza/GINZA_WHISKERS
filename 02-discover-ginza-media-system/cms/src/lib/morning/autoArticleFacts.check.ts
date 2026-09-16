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
    name: 'title・URL・構造化期間が揃っていればeligible:true（推測なし）',
    fn: () => {
      const r = deriveAutoArticleFacts(wellFormed)
      assert(r.eligible === true, `eligible:true（実際 missing=${JSON.stringify(r.missing)}）`)
      assert(r.payload?.templateType === 'generic', 'generic テンプレートを使う')
      assert(r.payload?.hashtags.some((h) => h.tag === '#銀座'), '#銀座ハッシュタグを含む')
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
