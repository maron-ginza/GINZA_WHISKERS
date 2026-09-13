// GINZA WHISKERS / Project 02 — スウィーツ候補の安定収集（sweetsCandidateSelect）回帰テスト。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  selectSweetsCandidates,
  classifySweetsSourceFacilityType,
  evaluateSweetsGate,
  SWEETS_SOURCE_FACILITY_TYPES,
  type SweetsCandidateInput,
} from '../pipeline/sweetsCandidateSelect'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const NOW = new Date('2026-09-11T00:00:00+09:00')

function mk(over: Partial<SweetsCandidateInput> & { dcId: number }): SweetsCandidateInput {
  return {
    title: `スウィーツ候補 ${over.dcId}`,
    category: 'SWEETS',
    facilityKey: `fac-${over.dcId}`,
    facilityLabel: `施設${over.dcId}`,
    sourceName: 'テスト情報源',
    sourceUrl: `https://example.com/${over.dcId}`,
    officialCompletenessScore: 1,
    finalEligible: true,
    targetFit: 40,
    daysUntilEnd: 10,
    alreadyPublished: false,
    ...over,
  }
}

const cases: CheckCase[] = [
  {
    name: '非SWEETS候補（FOOD等）は対象外・最大3件まで返す',
    fn: () => {
      const list = [
        mk({ dcId: 1 }),
        mk({ dcId: 2, category: 'FOOD' }),
        mk({ dcId: 3 }),
        mk({ dcId: 4, facilityKey: 'fac-4' }),
        mk({ dcId: 5, facilityKey: 'fac-5' }),
      ]
      const r = selectSweetsCandidates(list, { now: NOW })
      assert(r.candidates.length === 3, `candidates.length=${r.candidates.length}`)
      assert(r.candidates.every((c) => c.dcId !== 2), 'FOODは含まれない')
      assert(r.summary.rawSweetsCount === 4, `rawSweetsCount=${r.summary.rawSweetsCount}`)
    },
  },
  {
    name: '既公開重複（alreadyPublished）は除外される',
    fn: () => {
      const list = [mk({ dcId: 1, alreadyPublished: true, publishedReason: 'DC#1と同一' }), mk({ dcId: 2 })]
      const r = selectSweetsCandidates(list, { now: NOW })
      assert(r.candidates.length === 1 && r.candidates[0].dcId === 2, JSON.stringify(r.candidates))
      assert(r.summary.excludedPublished === 1, `excludedPublished=${r.summary.excludedPublished}`)
      assert(r.excluded.some((e) => e.dcId === 1 && e.reason.includes('既公開')), '除外理由に既公開の言及')
    },
  },
  {
    name: '公式情報不完全（finalEligible=false）は最終候補に上げない',
    fn: () => {
      const list = [
        mk({ dcId: 1, finalEligible: false, officialMissing: ['開催・販売期間', '内容'] }),
        mk({ dcId: 2 }),
      ]
      const r = selectSweetsCandidates(list, { now: NOW })
      assert(r.candidates.length === 1 && r.candidates[0].dcId === 2, JSON.stringify(r.candidates))
      assert(r.summary.excludedIncomplete === 1, `excludedIncomplete=${r.summary.excludedIncomplete}`)
      assert(r.excluded.some((e) => e.dcId === 1 && e.reason.includes('開催・販売期間')), '除外理由に未確認項目を含む')
    },
  },
  {
    name: '同一施設は原則1候補まで（施設分散）：スコアが高い方だけ残る',
    fn: () => {
      const list = [
        mk({ dcId: 1, facilityKey: 'ginza-six', targetFit: 60, daysUntilEnd: 2 }), // 高スコア
        mk({ dcId: 2, facilityKey: 'ginza-six', targetFit: 10, daysUntilEnd: 60 }), // 低スコア・同一施設
        mk({ dcId: 3, facilityKey: 'other-shop' }),
      ]
      const r = selectSweetsCandidates(list, { now: NOW })
      const ids = r.candidates.map((c) => c.dcId)
      assert(ids.includes(1) && !ids.includes(2) && ids.includes(3), `ids=${ids}`)
      assert(r.summary.excludedFacilityCap === 1, `excludedFacilityCap=${r.summary.excludedFacilityCap}`)
    },
  },
  {
    name: '3件未満なら不足理由・次回探索すべき情報源種別を記録する（不完全な候補で埋めない）',
    fn: () => {
      const list = [mk({ dcId: 1, sourceName: '銀座千疋屋' })]
      const r = selectSweetsCandidates(list, { now: NOW })
      assert(r.candidates.length === 1, `candidates.length=${r.candidates.length}`)
      assert(r.shortfall === true, 'shortfall=true')
      assert(!!r.shortfallReason && r.shortfallReason.includes('確認候補は 1 件'), r.shortfallReason ?? 'null')
      assert(Array.isArray(r.nextSourceTypesToExplore) && r.nextSourceTypesToExplore!.length > 0, 'nextSourceTypesToExplore が空でない')
      // 千疋屋（路面洋菓子店）はカバー済みなので、次回探索の対象からは外れる
      assert(!r.nextSourceTypesToExplore!.includes('銀座の路面洋菓子店'), JSON.stringify(r.nextSourceTypesToExplore))
      assert(r.nextSourceTypesToExplore!.includes('ホテルの公式スイーツ情報'), JSON.stringify(r.nextSourceTypesToExplore))
    },
  },
  {
    name: '3件そろえば shortfall=false',
    fn: () => {
      const list = [mk({ dcId: 1, facilityKey: 'a' }), mk({ dcId: 2, facilityKey: 'b' }), mk({ dcId: 3, facilityKey: 'c' })]
      const r = selectSweetsCandidates(list, { now: NOW })
      assert(r.shortfall === false && r.shortfallReason === null, JSON.stringify(r))
    },
  },
  {
    name: 'classifySweetsSourceFacilityType：情報源名から施設種別を決定的に推定',
    fn: () => {
      assert(classifySweetsSourceFacilityType('銀座千疋屋') === '銀座の路面洋菓子店', 'sembikiya')
      assert(classifySweetsSourceFacilityType('とらや TORAYA GINZA') === '和菓子店', 'toraya')
      assert(classifySweetsSourceFacilityType('帝国ホテル東京') === 'ホテルの公式スイーツ情報', 'imperial hotel')
      assert(classifySweetsSourceFacilityType('銀座三越') === '百貨店の食品・催事公式情報', 'mitsukoshi')
      assert(classifySweetsSourceFacilityType('GINZA SIX') === '商業施設の公式情報', 'ginza six')
      assert(classifySweetsSourceFacilityType('GINZA OFFICIAL') === '銀座の季節イベント公式情報', 'ginza official')
      assert(classifySweetsSourceFacilityType('謎の情報源XYZ') === null, '未知の情報源は null（推測しない）')
      assert(SWEETS_SOURCE_FACILITY_TYPES.length === 9, `9種別のはず: ${SWEETS_SOURCE_FACILITY_TYPES.length}`)
    },
  },
  {
    // 2026-09-12「スウィーツ公式情報Discovery層改善」で拡張登録したデパ地下・
    // 全国ブランドが「ブランド公式サイト・公式ニュース」として認識されることの回帰。
    name: 'classifySweetsSourceFacilityType：新規登録ブランドは「ブランド公式サイト・公式ニュース」',
    fn: () => {
      const expected = 'ブランド公式サイト・公式ニュース'
      assert(classifySweetsSourceFacilityType('GODIVA（ゴディバ）') === expected, 'godiva')
      assert(classifySweetsSourceFacilityType('DALLOYAU（ダロワイヨ）') === expected, 'dalloyau')
      assert(classifySweetsSourceFacilityType('ピエール・エルメ・パリ（PIERRE HERMÉ PARIS）') === expected, 'pierre herme')
      assert(classifySweetsSourceFacilityType('ジャン＝ポール・エヴァン（JEAN-PAUL HÉVIN JAPON）') === expected, 'jean-paul hevin')
      assert(classifySweetsSourceFacilityType('フレデリック・カッセル（Frédéric Cassel）') === expected, 'frederic cassel')
      assert(classifySweetsSourceFacilityType('ルノートル（LENÔTRE）') === expected, 'lenotre')
      assert(classifySweetsSourceFacilityType('アンリ・シャルパンティエ（銀座メゾン）') === expected, 'henri charpentier')
      assert(classifySweetsSourceFacilityType('ブールミッシュ（銀座本店）') === '銀座の路面洋菓子店', 'boulmich')
      assert(classifySweetsSourceFacilityType('銀座コージーコーナー（銀座一丁目本店）') === '喫茶店・カフェの公式情報', 'cozycorner')
      assert(classifySweetsSourceFacilityType('銀座若菜（株式会社若菜）') === '和菓子店', 'ginza wakana')
    },
  },
  {
    // 2026-09-13：マロン指示「本日はGINZA SIXと銀座 蔦屋書店を除外」の再現。
    name: 'excludeFacilityKeys：固定要件の施設は完全除外される（Article #64/#65 型の再発防止）',
    fn: () => {
      const list = [
        mk({ dcId: 141, facilityKey: 'ginza-six', facilityLabel: 'GINZA SIX', targetFit: 90, daysUntilEnd: 1 }),
        mk({ dcId: 2, facilityKey: 'other-shop', targetFit: 20, daysUntilEnd: 60 }),
      ]
      const r = selectSweetsCandidates(list, { now: NOW, excludeFacilityKeys: ['ginza-six', 'ginza-tsutaya'] })
      const ids = r.candidates.map((c) => c.dcId)
      assert(!ids.includes(141), `GINZA SIXは除外されるはず: ${ids}`)
      assert(ids.includes(2), `other-shopは残るはず: ${ids}`)
      assert(r.summary.excludedFixedRule === 1, `excludedFixedRule=${r.summary.excludedFixedRule}`)
      assert(r.excluded.some((e) => e.dcId === 141 && e.reason.includes('固定要件')), JSON.stringify(r.excluded))
    },
  },
  {
    name: 'excludeFacilityKeysで唯一の完全候補が消えるとshortfall（0件）になり、埋め合わせない',
    fn: () => {
      const list = [mk({ dcId: 141, facilityKey: 'ginza-six', targetFit: 90 })]
      const r = selectSweetsCandidates(list, { now: NOW, excludeFacilityKeys: ['ginza-six'] })
      assert(r.candidates.length === 0, `candidates.length=${r.candidates.length}`)
      assert(r.shortfall === true, 'shortfall=true')
    },
  },
  {
    name: 'facilityCount7d：直近7日間の採用実績が多い施設ほどスコアが下がる（source diversity制御）',
    fn: () => {
      const list = [
        mk({ dcId: 1, facilityKey: 'a', facilityCount7d: 0, targetFit: 40, daysUntilEnd: 10 }),
        mk({ dcId: 2, facilityKey: 'b', facilityCount7d: 5, targetFit: 40, daysUntilEnd: 10 }),
      ]
      const r = selectSweetsCandidates(list, { now: NOW, maxCandidates: 2 })
      const c1 = r.candidates.find((c) => c.dcId === 1)!
      const c2 = r.candidates.find((c) => c.dcId === 2)!
      assert(c1.scoreParts.facilityDiversity === 1, `facilityCount7d=0はfacilityDiversity=1のはず: ${c1.scoreParts.facilityDiversity}`)
      assert(c2.scoreParts.facilityDiversity < c1.scoreParts.facilityDiversity, '直近採用が多い施設は facilityDiversity が低いはず')
      assert(c1.score > c2.score, `他条件が同じなら直近未採用の施設が上位に来るはず: ${c1.score} vs ${c2.score}`)
    },
  },
  {
    name: 'evaluateSweetsGate：確認候補0件は自動失敗（passed:false）と明示理由を返す',
    fn: () => {
      const list = [mk({ dcId: 1, finalEligible: false, officialMissing: ['開催・販売期間'] })]
      const r = selectSweetsCandidates(list, { now: NOW })
      const gate = evaluateSweetsGate(r)
      assert(gate.passed === false, 'passed=false のはず')
      assert(!!gate.reason && gate.reason.includes('0件'), gate.reason ?? 'null')
    },
  },
  {
    name: 'evaluateSweetsGate：確認候補が1件以上あればpassed:true',
    fn: () => {
      const list = [mk({ dcId: 1 })]
      const r = selectSweetsCandidates(list, { now: NOW })
      const gate = evaluateSweetsGate(r)
      assert(gate.passed === true && gate.reason === null, JSON.stringify(gate))
    },
  },
]

export const suite = () => runSuite('sweetsCandidateSelect', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
