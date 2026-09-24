// GINZA WHISKERS / Project 02 — 朝刊ブリーフ選定・整形（morningBriefSelect）の回帰テスト。
//
//  ・2026-09-24改訂：3枠（①スイーツ必須1本／②③スイーツ以外の8分類からスコア上位2本）
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
    // 2026-09-24改訂：固定4バケット（①スイーツ・和菓子②グルメ③ビューティー④文化・アート）
    // をやめ、「①スイーツ必須1本＋②③スイーツ以外の8分類からスコア上位2本」へ変更。
    name: '3枠：SWEETS必須＋その他8分類からスコア上位2本（多様性優先で異なるグループから選ぶ）',
    fn: () => {
      const inp = [
        cand({ dcId: 9, categoryKey: 'SWEETS', facilityKey: 'f0', facilityLabel: '和菓子店', scoreTotal: 0.6 }),
        cand({ dcId: 10, categoryKey: 'BEAUTY', facilityKey: 'f1', facilityLabel: '資生堂', scoreTotal: 0.9 }),
        cand({ dcId: 11, categoryKey: 'CAFE', facilityKey: 'f2', facilityLabel: '歌舞伎座', scoreTotal: 0.8 }),
        cand({ dcId: 12, categoryKey: 'ART', facilityKey: 'f3', facilityLabel: '画廊', scoreTotal: 0.7 }),
        cand({ dcId: 13, categoryKey: 'SHOPPING', facilityKey: 'f4', facilityLabel: 'その他', scoreTotal: 1.0 }),
      ]
      const r = buildMorningBrief(inp)
      assert(r.filledCount === 3, `filled: ${r.filledCount}`)
      const byBucket = Object.fromEntries(r.buckets.map((b) => [b.bucketKey, b.pick?.dcId ?? null]))
      assert(byBucket.SWEETS === 9, `SWEETS: ${byBucket.SWEETS}`)
      // その他枠：スコア最上位はSHOPPING(#13,1.0)→1枠目。2枠目は異なるグループを優先する
      // ため、同率2位のBEAUTY(#10,0.9)が選ばれる（旧システムではSHOPPINGは
      // どの固定バケットにも属さず永久に選ばれなかった——これが今回の改善点）。
      assert(byBucket.OTHER_1 === 13, `OTHER_1: ${byBucket.OTHER_1}`)
      assert(byBucket.OTHER_2 === 10, `OTHER_2: ${byBucket.OTHER_2}`)
      assert(r.pickedDcIds.length === 3, 'pickedDcIds 3')
      assert(!r.pickedDcIds.includes(11) && !r.pickedDcIds.includes(12), '3本を超える分は選ばない')
      assert(r.buckets[0].bucketKey === 'SWEETS', `最優先枠: ${r.buckets[0].bucketKey}`)
    },
  },
  {
    name: '該当なし：候補が無い枠は pick=null＋理由（推測でカテゴリーを付けない）',
    fn: () => {
      const r = buildMorningBrief([
        cand({ dcId: 20, categoryKey: 'ART', facilityKey: 'x', facilityLabel: 'X', scoreTotal: 1 }),
      ])
      const sweets = r.buckets.find((b) => b.bucketKey === 'SWEETS')!
      const other2 = r.buckets.find((b) => b.bucketKey === 'OTHER_2')!
      assert(sweets.pick === null, 'SWEETS pick null（候補なし）')
      assert(!!sweets.reasonIfEmpty && /該当なし/.test(sweets.reasonIfEmpty), `理由: ${sweets.reasonIfEmpty}`)
      assert(other2.pick === null, 'OTHER_2 pick null（候補が1件しかなくOTHER_1が使用済み）')
      assert(!!other2.reasonIfEmpty && /該当なし/.test(other2.reasonIfEmpty), `理由: ${other2.reasonIfEmpty}`)
      assert(r.filledCount === 1, `filled: ${r.filledCount}`)
      assert(r.warnings.some((w) => /1／3/.test(w)), '3未満の警告')
    },
  },
  {
    name: '除外：既記事化 alreadyDrafted / 重複 duplicate / 未確定カテゴリー',
    fn: () => {
      const r = buildMorningBrief([
        cand({ dcId: 30, categoryKey: 'ART', facilityKey: 'a', facilityLabel: 'A', scoreTotal: 1.0, alreadyDrafted: true }),
        cand({ dcId: 31, categoryKey: 'ART', facilityKey: 'b', facilityLabel: 'B', scoreTotal: 0.9, duplicate: true }),
        cand({ dcId: 32, categoryKey: 'ART', facilityKey: 'c', facilityLabel: 'C', scoreTotal: 0.5 }),
        cand({ dcId: 33, categoryKey: '未確定', facilityKey: 'd', facilityLabel: 'D', scoreTotal: 2.0 }),
      ])
      const other1 = r.buckets.find((b) => b.bucketKey === 'OTHER_1')!
      assert(other1.pick?.dcId === 32, `pick: ${other1.pick?.dcId}`)
      assert(other1.considered.some((c) => c.dcId === 30 && /既に Article/.test(c.skipped)), '既記事化を除外記録')
      assert(other1.considered.some((c) => c.dcId === 31 && /重複/.test(c.skipped)), '重複を除外記録')
      // #33（未確定＝primaryCategory8マッピングが無い）はそもそもプールに入らない
      assert(!r.pickedDcIds.includes(33), '未確定カテゴリーは推測で入れない')
    },
  },
  {
    name: '施設集中回避：同一施設は2枠に跨がせない（1枠目がGINZA SIXを確保→2枠目は他施設へ）',
    fn: () => {
      const r = buildMorningBrief([
        cand({ dcId: 40, categoryKey: 'BEAUTY', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', sourceName: 'GINZA SIX', scoreTotal: 1.0 }),
        cand({ dcId: 43, categoryKey: 'BEAUTY', facilityKey: 'wako', facilityLabel: '和光', sourceName: '和光', scoreTotal: 0.5 }),
        cand({ dcId: 41, categoryKey: 'CAFE', facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', sourceName: 'GINZA SIX', scoreTotal: 1.0 }),
      ])
      const other1 = r.buckets.find((b) => b.bucketKey === 'OTHER_1')!
      const other2 = r.buckets.find((b) => b.bucketKey === 'OTHER_2')!
      assert(other1.pick?.dcId === 40, `OTHER_1 pick: ${other1.pick?.dcId}（同率1位のうち先着でGINZA SIXを確保）`)
      assert(other2.pick?.dcId === 43, `OTHER_2 pick: ${other2.pick?.dcId}（#41はGINZA SIX施設重複のため除外され和光へ）`)
      assert(other2.considered.some((c) => c.dcId === 41 && /施設/.test(c.skipped)), '#41 を施設重複で除外記録')
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
      const other1 = r.buckets.find((b) => b.bucketKey === 'OTHER_1')!
      assert(other1.pick?.dcId === 51, `OTHER_1 pick: ${other1.pick?.dcId}（直近が蔦屋なので画廊へ）`)
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
    // 2026-09-13：SWEETSはスイーツ専用枠。2026-09-24：その他枠は固定カテゴリーでは
    // なくスイーツ以外の8分類プールから選ぶ。SWEETSとFOOD（GOURMET分類）が
    // それぞれ独立に振り分けられ、残りのART（ART_CULTURE分類）も
    // OTHER_2で拾われることを確認する。
    name: 'SWEETSは独立に選ばれ、FOOD/ARTはその他8分類プールからスコア順に2本とも選ばれる',
    fn: () => {
      const list: BriefCandidateInput[] = [
        cand({ dcId: 10, categoryKey: 'FOOD', facilityKey: 'fac-food', facilityLabel: '食品店', scoreTotal: 0.9 }),
        cand({ dcId: 11, categoryKey: 'SWEETS', facilityKey: 'fac-sweets', facilityLabel: '菓子店', scoreTotal: 0.3 }),
        cand({ dcId: 12, categoryKey: 'ART', facilityKey: 'fac-art', facilityLabel: 'ギャラリー', scoreTotal: 0.8 }),
      ]
      const r = buildMorningBrief(list)
      const sweets = r.buckets.find((b) => b.bucketKey === 'SWEETS')!
      const other1 = r.buckets.find((b) => b.bucketKey === 'OTHER_1')!
      const other2 = r.buckets.find((b) => b.bucketKey === 'OTHER_2')!
      assert(sweets.pick?.dcId === 11, `SWEETSはSWEETS(#11)を選ぶべき（実際: #${sweets.pick?.dcId}）`)
      assert(other1.pick?.dcId === 10, `OTHER_1はスコア最上位のFOOD(#10)を選ぶべき（実際: #${other1.pick?.dcId}）`)
      assert(other2.pick?.dcId === 12, `OTHER_2は異なるグループのART(#12)を選ぶべき（実際: #${other2.pick?.dcId}）`)
      assert(r.filledCount === 3, `filled: ${r.filledCount}（3件とも公式確認可能なため全枠充足）`)
    },
  },
]

export const suite = () => runSuite('morningBriefSelect', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
