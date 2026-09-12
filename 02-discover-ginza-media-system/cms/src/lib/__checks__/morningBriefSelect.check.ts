// GINZA WHISKERS / Project 02 — 朝刊ブリーフ選定・整形（morningBriefSelect）の回帰テスト。
//
//  ・3領域（ビューティー／グルメ・スイーツ／文化・アート）各1本の選定
//  ・既記事化・重複・施設集中の除外
//  ・必須 ArticleFacts 12項目：無い項目は「公式記載なし」（推測補完なし）
//  ・Editorial Compass の加重（20/30/25/15/10）

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  buildMorningBrief,
  assembleBriefFacts,
  formatEditorialCompass,
  buildSelectionReason,
  FACT_NOT_STATED,
  FACT_UNVERIFIED,
  type BriefCandidateInput,
} from '../pipeline/morningBriefSelect'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

function cand(over: Partial<BriefCandidateInput>): BriefCandidateInput {
  return {
    dcId: 1,
    title: 't',
    scoreTotal: 1,
    categoryKey: 'ART',
    facilityKey: 'fac-a',
    facilityLabel: '施設A',
    sourceName: '情報源A',
    sourceUrl: 'https://example.com/a',
    readiness: 'needs-facts',
    ...over,
  }
}

const cases: CheckCase[] = [
  {
    name: '3領域 各1本：BEAUTY / FOOD / ART で1本ずつ選ばれる',
    fn: () => {
      const inp = [
        cand({ dcId: 10, categoryKey: 'BEAUTY', facilityKey: 'f1', facilityLabel: '資生堂', scoreTotal: 0.9 }),
        cand({ dcId: 11, categoryKey: 'CAFE', facilityKey: 'f2', facilityLabel: '歌舞伎座', scoreTotal: 0.8 }),
        cand({ dcId: 12, categoryKey: 'ART', facilityKey: 'f3', facilityLabel: '画廊', scoreTotal: 0.7 }),
        cand({ dcId: 13, categoryKey: 'SHOPPING', facilityKey: 'f4', facilityLabel: 'その他', scoreTotal: 1.0 }),
      ]
      const r = buildMorningBrief(inp)
      assert(r.filledCount === 3, `filled: ${r.filledCount}`)
      const byBucket = Object.fromEntries(r.buckets.map((b) => [b.bucketKey, b.pick?.dcId ?? null]))
      assert(byBucket.BEAUTY === 10, `BEAUTY: ${byBucket.BEAUTY}`)
      assert(byBucket.FOOD_SWEETS === 11, `FOOD: ${byBucket.FOOD_SWEETS}`)
      assert(byBucket.CULTURE_ART === 12, `ART: ${byBucket.CULTURE_ART}`)
      assert(r.pickedDcIds.length === 3, 'pickedDcIds 3')
      // SHOPPING(#13) はコア3領域外なので選ばれない
      assert(!r.pickedDcIds.includes(13), 'コア3外は選ばない')
    },
  },
  {
    name: '該当なし：候補が無い領域は pick=null＋理由（推測でカテゴリーを付けない）',
    fn: () => {
      const r = buildMorningBrief([
        cand({ dcId: 20, categoryKey: 'ART', facilityKey: 'x', facilityLabel: 'X', scoreTotal: 1 }),
      ])
      const beauty = r.buckets.find((b) => b.bucketKey === 'BEAUTY')!
      assert(beauty.pick === null, 'BEAUTY pick null')
      assert(!!beauty.reasonIfEmpty && /該当なし/.test(beauty.reasonIfEmpty), `理由: ${beauty.reasonIfEmpty}`)
      assert(r.filledCount === 1, `filled: ${r.filledCount}`)
      assert(r.warnings.some((w) => /1／3/.test(w)), '3未満の警告')
    },
  },
  {
    name: '除外：既記事化 alreadyDrafted / 重複 duplicate / 未確定カテゴリー',
    fn: () => {
      const r = buildMorningBrief([
        cand({ dcId: 30, categoryKey: 'BEAUTY', facilityKey: 'a', facilityLabel: 'A', scoreTotal: 1.0, alreadyDrafted: true }),
        cand({ dcId: 31, categoryKey: 'BEAUTY', facilityKey: 'b', facilityLabel: 'B', scoreTotal: 0.9, duplicate: true }),
        cand({ dcId: 32, categoryKey: 'BEAUTY', facilityKey: 'c', facilityLabel: 'C', scoreTotal: 0.5 }),
        cand({ dcId: 33, categoryKey: '未確定', facilityKey: 'd', facilityLabel: 'D', scoreTotal: 2.0 }),
      ])
      const beauty = r.buckets.find((b) => b.bucketKey === 'BEAUTY')!
      assert(beauty.pick?.dcId === 32, `pick: ${beauty.pick?.dcId}`)
      assert(beauty.considered.some((c) => c.dcId === 30 && /既に Article/.test(c.skipped)), '既記事化を除外記録')
      assert(beauty.considered.some((c) => c.dcId === 31 && /重複/.test(c.skipped)), '重複を除外記録')
      // #33（未確定）は BEAUTY バケットにそもそも入らない
      assert(!r.pickedDcIds.includes(33), '未確定カテゴリーは推測で入れない')
    },
  },
  {
    name: '施設集中回避：同一施設は2枠に跨がせない／GINZA SIX が既に1枠なら次点',
    fn: () => {
      const r = buildMorningBrief([
        cand({ dcId: 40, categoryKey: 'BEAUTY', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', sourceName: 'GINZA SIX', scoreTotal: 1.0 }),
        cand({ dcId: 41, categoryKey: 'CAFE', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', sourceName: 'GINZA SIX', scoreTotal: 1.0 }),
        cand({ dcId: 42, categoryKey: 'CAFE', facilityKey: 'kabukiza', facilityLabel: '歌舞伎座', sourceName: '歌舞伎座', scoreTotal: 0.3 }),
      ])
      const food = r.buckets.find((b) => b.bucketKey === 'FOOD_SWEETS')!
      assert(food.pick?.dcId === 42, `FOOD pick: ${food.pick?.dcId}（GINZA SIX 連続を避け歌舞伎座へ）`)
      assert(food.considered.some((c) => c.dcId === 41 && /(施設|GINZA SIX)/.test(c.skipped)), '#41 を集中回避で除外記録')
    },
  },
  {
    name: '直近採用施設との連続回避：recentFacilities に一致すると次点へ',
    fn: () => {
      const r = buildMorningBrief(
        [
          cand({ dcId: 50, categoryKey: 'ART', facilityKey: 'tsutaya', facilityLabel: '銀座 蔦屋書店', scoreTotal: 1.0 }),
          cand({ dcId: 51, categoryKey: 'ART', facilityKey: 'yanagi', facilityLabel: '銀座柳画廊', scoreTotal: 0.4 }),
        ],
        { recentFacilities: ['tsutaya', 'tsutaya'] },
      )
      const art = r.buckets.find((b) => b.bucketKey === 'CULTURE_ART')!
      assert(art.pick?.dcId === 51, `ART pick: ${art.pick?.dcId}（直近が蔦屋なので画廊へ）`)
    },
  },
  {
    name: '必須ArticleFacts 12項目：ArticleFacts が無い候補は主要項目が「公式記載なし／未確認」',
    fn: () => {
      const f = assembleBriefFacts(
        cand({ dcId: 60, title: 'イベントX', categoryKey: 'ART', sourceName: '情報源A', sourceUrl: 'https://example.com/x' }),
      )
      assert(f.正式名称 === 'イベントX', `正式名称: ${f.正式名称}`)
      assert(f.概要 === FACT_NOT_STATED, `概要は excerpt を使わず公式記載なし: ${f.概要}`)
      assert(f.価格 === FACT_NOT_STATED, `価格: ${f.価格}`)
      assert(f['開催／販売期間'] === FACT_NOT_STATED, `期間: ${f['開催／販売期間']}`)
      assert(f['購入／参加条件'] === FACT_NOT_STATED, `条件: ${f['購入／参加条件']}`)
      assert(f.場所 === FACT_NOT_STATED, `場所: ${f.場所}`)
      assert(f.出典確認日 === FACT_UNVERIFIED, `確認日: ${f.出典確認日}`)
      assert(f.公式URL === 'https://example.com/x', 'URLは埋まる')
      assert(f['18カテゴリー'] === 'ART', 'カテゴリーは確定分を使う')
      assert(f.notStatedFields.includes('価格') && f.notStatedFields.includes('開催／販売期間'), '不足項目を列挙')
    },
  },
  {
    name: '必須ArticleFacts 12項目：ArticleFacts がある候補は値を採用（推測しない）',
    fn: () => {
      const f = assembleBriefFacts(
        cand({
          dcId: 61,
          categoryKey: 'BEAUTY',
          venue: 'GINZA SIX 2F',
          facts: {
            enrichmentStatus: 'ready',
            primaryCategory: 'BEAUTY',
            templateType: 'sale',
            eventName: '洛花飛霞チーク 14 パープルロータス',
            whatHappens: '新作チークの発売',
            priceText: '3,190円（税込）',
            areaLead: 'GINZA SIX 2F 花西子',
            applyRequired: false,
            saleAvailability: '販売中',
            officialInfoNote: '販売終了日の記載なし。詳細は店舗へ。',
            humanReviewedAt: '2026-09-07T01:26:46.772Z',
          },
        }),
      )
      assert(f.正式名称 === '洛花飛霞チーク 14 パープルロータス', `名称: ${f.正式名称}`)
      assert(f.概要 === '新作チークの発売', `概要: ${f.概要}`)
      assert(f.価格 === '3,190円（税込）', `価格: ${f.価格}`)
      assert(f.場所 === 'GINZA SIX 2F 花西子', `場所: ${f.場所}`)
      assert(/不要/.test(f['購入／参加条件']) && /販売中/.test(f['購入／参加条件']), `条件: ${f['購入／参加条件']}`)
      assert(f.出典確認日 === '2026-09-07', `確認日: ${f.出典確認日}`)
      assert(f.notStatedFields.length <= 2, `不足少なめ: ${f.notStatedFields.join(',')}`)
    },
  },
  {
    name: 'Editorial Compass：加重 20/30/25/15/10 で整形・主軸を出す',
    fn: () => {
      const s = formatEditorialCompass({ kawaii: 1, joshitsu: 0, totonoeru: 0, hakken: 0, senobi: 0 })
      assert(/かわいい20/.test(s), `かわいい: ${s}`)
      assert(/主軸 かわいい/.test(s), `主軸: ${s}`)
      const s2 = formatEditorialCompass({ kawaii: 0, joshitsu: 1, totonoeru: 1, hakken: 0, senobi: 0 })
      assert(/上質30/.test(s2) && /自分を整える25/.test(s2), `s2: ${s2}`)
      assert(/主軸 上質/.test(s2), `s2 主軸: ${s2}`)
      assert(formatEditorialCompass(null).includes(FACT_NOT_STATED), 'compass 無し')
    },
  },
  {
    name: '選定理由：カテゴリー・target_fit・偏り補正・情報源の観点を含む（推測なし）',
    fn: () => {
      const r = buildSelectionReason(
        cand({ dcId: 70, categoryKey: 'BEAUTY', categoryBasis: 'primaryCategory', targetFit: 42, targetFitReason: '適合＝自分を整える', scoreTotal: 0.815, sourceName: 'GINZA SIX', readiness: 'ready' }),
        'ビューティー',
      )
      assert(/ビューティー/.test(r), 'バケット名')
      assert(/18カテゴリー＝BEAUTY/.test(r), 'カテゴリー')
      assert(/コアターゲット適合 42/.test(r), 'target_fit 数値')
      assert(/偏り補正込み/.test(r), '偏り補正の明示')
      assert(/GINZA SIX/.test(r) && /連続集中/.test(r), '情報源と集中回避の明示')
    },
  },
  {
    name: '2026-09-12：グルメ・スイーツ枠はSWEETSをFOOD/CAFE/GIFTより優先する（スコアが低くても）',
    fn: () => {
      const list: BriefCandidateInput[] = [
        cand({ dcId: 10, categoryKey: 'FOOD', facilityKey: 'fac-food', facilityLabel: '食品店', scoreTotal: 0.9 }),
        cand({ dcId: 11, categoryKey: 'SWEETS', facilityKey: 'fac-sweets', facilityLabel: '菓子店', scoreTotal: 0.3 }),
        cand({ dcId: 12, categoryKey: 'ART', facilityKey: 'fac-art', facilityLabel: 'ギャラリー', scoreTotal: 0.8 }),
      ]
      const r = buildMorningBrief(list)
      const gourmet = r.buckets.find((b) => b.bucketKey === 'FOOD_SWEETS')!
      assert(gourmet.pick?.dcId === 11, `スコアが低くてもSWEETS(#11)が選ばれるべき（実際: #${gourmet.pick?.dcId}）`)
    },
  },
]

export const suite = () => runSuite('morningBriefSelect', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
