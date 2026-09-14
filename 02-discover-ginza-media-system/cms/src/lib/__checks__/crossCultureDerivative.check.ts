// GINZA WHISKERS / Project 02 — CROSS CULTURE 派生記事プラン＋情報源 affinity の回帰テスト（2026-09-04）
//
//   ・score>=70 → selectedMarkets（派生候補）／50-69 → editorialOnly（保持・自動派生しない）／
//     <=49 → excluded（本文生成に使わない）
//   ・複数市場 >=70 でも maxMarkets=1 なら1件だけ（記事価値の高い順）
//   ・promptInjection に「断定禁止・別記事・複数国を混ぜない・確認済み事実のみ」を含む
//   ・confirmedFacts が空なら「断定させない」旨を注入
//   ・FILTER skipped → mode='none'（通常生成を継続）／例外時も throw しない
//   ・情報源 affinity（UAE/France 補強）は **本文語彙のヒットがある軸にしか効かない**
//     （ゼロから市場を作らない＝過剰派生・誤検出を防ぐ）
//   ・4シナリオ A 工芸素材 / B 高級ホテル静かな体験 / C 歴史文化建築 / D 一般新店

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { runCrossCultureFilter } from '../crossCulture'
import { buildCrossCultureDerivativePlan } from '../crossCulture/derivativeCandidate'
import type { CrossCultureThresholds } from '../crossCulture/marketAxes'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const T: CrossCultureThresholds = { enabled: true, minDerivative: 70, minEditorial: 50, disabledMarkets: [] }

function plan(input: Parameters<typeof runCrossCultureFilter>[0], opt: { maxMarkets?: number; onlyMarket?: string; confirmedFacts?: { fact: string }[] } = {}) {
  const cc = runCrossCultureFilter(input, { thresholds: T })
  return {
    cc,
    plan: buildCrossCultureDerivativePlan({
      discoveredContentId: 1,
      title: String(input.title ?? ''),
      ccResult: cc,
      confirmedFacts: opt.confirmedFacts,
      minDerivative: 70,
      minEditorial: 50,
      maxMarkets: opt.maxMarkets ?? 1,
      onlyMarket: opt.onlyMarket,
    }),
  }
}

const cases: CheckCase[] = [
  {
    name: 'A 工芸・素材：九谷焼＋つくる → Singapore 等が派生候補、通常記事は別 / 上書きしない',
    fn: () => {
      const { plan: p } = plan({ title: '九谷焼をつくる／九谷焼から考える 上出長右衛門窯の仕事展', contentType: 'exhibition', factKind: 'event' })
      assert(p.mode === 'derivative', `mode=derivative（実際 ${p.mode} / ${p.reason}）`)
      assert(p.selectedMarkets.length === 1, `maxMarkets=1（実際 ${p.selectedMarkets.length}）`)
      const s = p.selectedMarkets[0]
      assert(['Singapore', 'Italy'].includes(s.market), `Singapore/Italy が候補（実際 ${s.market}）`)
      assert(s.score >= 70, `score>=70（実際 ${s.score}）`)
      assert(/別の「CROSS CULTURE 派生記事」|独立記事/.test(s.promptInjection), '注入に「別記事」の指示')
      assert(s.guardrails.some((g) => g.includes('上書きしない')), 'ガードレールに「上書きしない」')
    },
  },
  {
    name: 'B 高級ホテル・静かな体験：完全予約制＋個室＋上質＋設え → UAE が派生候補',
    fn: () => {
      const { plan: p } = plan({
        title: '完全予約制の個室で愉しむ、静けさと余白のための上質な設え ― プライベート空間のアフタヌーンティー',
        contentType: 'event',
        factKind: 'event',
        venue: '銀座',
      })
      assert(p.mode === 'derivative', `mode=derivative（実際 ${p.mode}）`)
      assert(p.selectedMarkets[0].market === 'UAE', `UAE が最優先候補（実際 ${p.selectedMarkets[0].market}）`)
      assert(p.selectedMarkets[0].score >= 70, `score>=70（実際 ${p.selectedMarkets[0].score}）`)
    },
  },
  {
    name: 'C 歴史・文化・建築：明治の近代建築＋文化財＋企画展 → France が派生候補（selectedMarkets）',
    fn: () => {
      const cc = runCrossCultureFilter(
        { title: '明治の近代建築を今に伝える銀座の歴史的建造物 ― 文化財の企画展', contentType: 'exhibition', sourceName: '中央区観光関連' },
        { thresholds: T },
      )
      const f = cc.markets.find((m) => m.market === 'France')!
      assert(f.score >= 70, `France score>=70（実際 ${f.score}）`)
      assert(f.matchedAxes.includes('Heritage') && f.matchedAxes.includes('Culture'), `Heritage/Culture 軸（実際 ${f.matchedAxes}）`)
      const p = buildCrossCultureDerivativePlan({ discoveredContentId: 1, title: 'x', ccResult: cc, maxMarkets: 1 })
      assert(p.mode === 'derivative' && p.selectedMarkets[0].market === 'France', `France が派生候補（実際 ${p.selectedMarkets[0]?.market}）`)
    },
  },
  {
    name: 'C-affinity：borderline な France 一致が中央区観光関連の affinity で 70 を超える',
    fn: () => {
      const input = { title: '銀座の歴史と文化をたどる、近代のよすが' }
      const noSrc = runCrossCultureFilter(input, { thresholds: T })
      const withSrc = runCrossCultureFilter({ ...input, sourceName: '中央区観光関連' }, { thresholds: T })
      const fNo = noSrc.markets.find((m) => m.market === 'France')!
      const fWith = withSrc.markets.find((m) => m.market === 'France')!
      assert(fNo.score < 70, `affinity なしでは <70（実際 ${fNo.score}）`)
      assert(fWith.score >= 70, `affinity ありで >=70（実際 ${fWith.score}）`)
      assert(fWith.score > fNo.score, `加点される（no ${fNo.score} → with ${fWith.score}）`)
      assert((fWith.sourceBoostedAxes ?? []).length > 0, `sourceBoostedAxes 記録（実際 ${fWith.sourceBoostedAxes}）`)
    },
  },
  {
    name: 'D 一般的新店情報：アプリ入会キャンペーン → 派生なし・mode=none（通常記事のみで正常）',
    fn: () => {
      const { cc, plan: p } = plan({ title: 'GINZA SIX アプリ 新規ご入会キャンペーン', contentType: 'news' })
      assert(cc.mode === 'normal_only', `FILTER: normal_only（実際 ${cc.mode}）`)
      assert(p.mode === 'none', `plan mode=none（実際 ${p.mode}）`)
      assert(p.selectedMarkets.length === 0, '派生候補ゼロ')
    },
  },
  {
    name: 'affinity は語彙ヒットのない軸には効かない（過剰派生・誤検出防止）',
    fn: () => {
      const r = runCrossCultureFilter(
        { title: 'コーポレートサイトをリニューアルいたしました', sourceName: '教文館' },
        { thresholds: T },
      )
      const f = r.markets.find((m) => m.market === 'France')!
      assert(f.score === 0, `France は 0 のまま（affinity で作らない・実際 ${f.score}）`)
      assert(r.mode === 'normal_only', `normal_only（実際 ${r.mode}）`)
    },
  },
  {
    name: '50-69 は editorialOnly（自動派生しない）／<=49 は excluded',
    fn: () => {
      const { plan: p } = plan({ title: 'インドから世界へ 更紗と染めの美', contentType: 'exhibition' })
      // Italy/Singapore ~62 想定：editorialOnly に入り selectedMarkets には入らない
      const hasEditorial = p.editorialOnlyMarkets.length > 0
      assert(hasEditorial, `editorialOnlyMarkets が非空（実際 ${JSON.stringify(p.editorialOnlyMarkets)}）`)
      assert(
        p.editorialOnlyMarkets.every((e) => e.score >= 50 && e.score < 70),
        'editorialOnly は 50-69',
      )
      assert(p.excludedMarkets.every((e) => e.score < 50), 'excluded は <50')
      assert(!p.editorialOnlyMarkets.some((e) => p.selectedMarkets.find((s) => s.market === e.market)), 'editorialOnly は派生に使わない')
    },
  },
  {
    name: '複数市場 >=70 でも maxMarkets=1 → 記事価値の高い1件のみ',
    fn: () => {
      const { plan: p } = plan(
        { title: '職人の手仕事と意匠・素材、東西の文化交流が生んだ染めと織りの工芸展', contentType: 'exhibition', factKind: 'event' },
        { maxMarkets: 1 },
      )
      assert(p.selectedMarkets.length === 1, `1件のみ（実際 ${p.selectedMarkets.length}）`)
      assert(/無理に増やさず記事価値順/.test(p.reason) || p.reason.includes('派生記事候補 1 件'), p.reason)
    },
  },
  {
    name: 'maxMarkets=2 を明示すれば2件まで取れる（既定は1・強制5カ国はしない）',
    fn: () => {
      const { plan: p } = plan(
        { title: '職人の手仕事と意匠・素材、東西の文化交流が生んだ染めと織りの工芸展', contentType: 'exhibition', factKind: 'event' },
        { maxMarkets: 2 },
      )
      assert(p.selectedMarkets.length <= 2, `2件以下（実際 ${p.selectedMarkets.length}）`)
      assert(p.selectedMarkets.length >= 1, '1件以上')
    },
  },
  {
    name: 'onlyMarket：指定市場が >=70 でなければ派生しない',
    fn: () => {
      const { plan: p } = plan(
        { title: '九谷焼をつくる 上出長右衛門窯の仕事展', contentType: 'exhibition', factKind: 'event' },
        { onlyMarket: 'France' },
      )
      assert(p.mode === 'none', `France は該当せず mode=none（実際 ${p.mode} / ${p.reason}）`)
    },
  },
  {
    name: 'confirmedFacts あり → 注入に「事実として断定してよい」列挙、なし → 「断定させない」',
    fn: () => {
      const withF = plan(
        { title: '明治の近代建築と文化財の企画展', contentType: 'exhibition', sourceName: '中央区観光関連' },
        { confirmedFacts: [{ fact: '会期 2026年10月1日〜10月20日' }, { fact: '会場 銀座◯◯ビル 3F' }] },
      ).plan
      const s1 = withF.selectedMarkets[0]
      assert(s1.confirmedForBody.length === 2, `confirmedForBody に2件（実際 ${s1.confirmedForBody.length}）`)
      assert(s1.promptInjection.includes('会期 2026年10月1日'), '注入に確認済み事実が入る')

      const noF = plan({ title: '明治の近代建築と文化財の企画展', contentType: 'exhibition', sourceName: '中央区観光関連' }).plan
      const s2 = noF.selectedMarkets[0]
      assert(s2.confirmedForBody.length === 0, 'confirmedForBody は空')
      assert(/確認済み事実が未取得|断定せず/.test(s2.promptInjection), '注入に「断定させない」旨')
    },
  },
  {
    name: '有料/無料が派生プランへ伝播（paid は根拠つき・単なるイベント紹介は free）',
    fn: () => {
      const paid = plan({ title: '明治から続く老舗が語る銀座の歴史と、東西の文化交流が生んだ意匠', venue: '銀座', contentType: 'event', factKind: 'event' }).plan
      if (paid.selectedMarkets.length) {
        const sm = paid.selectedMarkets[0]
        if (sm.articlePotential === 'paid') assert(sm.paidBasis.length > 0 && /成立/.test(sm.potentialReason), 'paid は根拠つき')
      }
      const free = plan({ title: '新作カシミヤニットのデザインをリリース', contentType: 'news' }).plan
      assert(free.mode === 'none' || free.selectedMarkets.every((s) => s.articlePotential === 'free'), '商品ニュースは paid にしない')
    },
  },
  {
    name: 'FILTER skipped（enabled=false）→ plan mode=none・filterUnavailable=true（通常生成を継続）',
    fn: () => {
      const cc = runCrossCultureFilter({ title: '職人の手仕事の工芸展' }, { thresholds: { ...T, enabled: false } })
      const p = buildCrossCultureDerivativePlan({ discoveredContentId: 1, title: 'x', ccResult: cc })
      assert(p.mode === 'none', `mode=none（実際 ${p.mode}）`)
      assert(p.filterUnavailable === true, 'filterUnavailable=true')
    },
  },
  {
    name: '例外安全：ccResult=null / undefined でも throw せず mode=none',
    fn: () => {
      const a = buildCrossCultureDerivativePlan({ discoveredContentId: 1, title: 'x', ccResult: null })
      const b = buildCrossCultureDerivativePlan({ discoveredContentId: 1, title: 'x', ccResult: undefined })
      assert(a.mode === 'none' && a.filterUnavailable, 'null → none')
      assert(b.mode === 'none' && b.filterUnavailable, 'undefined → none')
    },
  },
  {
    name: '全 selectedMarkets の promptInjection に必須ガード文言が入る',
    fn: () => {
      const { plan: p } = plan({ title: '職人の手仕事と意匠・素材、東西の文化交流の工芸展', contentType: 'exhibition', factKind: 'event' }, { maxMarkets: 3 })
      for (const s of p.selectedMarkets) {
        assert(s.promptInjection.includes('断定'), `${s.market}: 断定禁止`)
        assert(/複数国の視点を1記事に詰め込まない/.test(s.promptInjection), `${s.market}: 複数国混在禁止`)
        assert(s.promptInjection.includes('確認済み'), `${s.market}: 確認済み事実の限定`)
        assert(s.culturalHypotheses.length > 0, `${s.market}: culturalHypotheses あり`)
      }
    },
  },
]

export const suite = () => runSuite('crossCultureDerivative', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
