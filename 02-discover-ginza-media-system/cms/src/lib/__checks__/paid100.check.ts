// GINZA WHISKERS / Project 02 — 100円レーン（PAID_100_LANE_SPEC.md）の回帰テスト。
//
//   ・再現性（読者が実際に再現できること）を有料判定の必須条件にする
//   ・単なる施設紹介／一般検索で分かるだけの記事は候補にしない
//   ・毎週 最大3案
//   ・選定後の下書きは 無料エリア（課題・変化・結果）＋有料エリア（手順・AI指示文・
//     候補比較・確認方法・テンプレート）＋出典＋注意事項＋ハッシュタグ4個

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { proposePaid100Candidates } from '../paid100/proposePaid100Candidates'
import { buildPaid100Draft } from '../paid100/buildPaid100Draft'
import { PAID100_PRICE_YEN, PAID100_SERIES_LABEL_V1, type FreeArticleSummary } from '../paid100/types'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

function art(over: Partial<FreeArticleSummary> & { id: number }): FreeArticleSummary {
  return {
    id: over.id,
    title: over.title ?? `記事#${over.id}`,
    bodyText: over.bodyText ?? '',
    pillar: over.pillar ?? null,
    reviewStatus: over.reviewStatus ?? 'published',
    lane: over.lane ?? 'free',
    provenance: over.provenance ?? [],
  }
}

const reproducibleArticle = art({
  id: 101,
  title: '秋の銀座、半日の回り方——更紗展とカフェの組み合わせ',
  bodyText:
    '更紗展を見たあと、どのカフェに寄るか、時間の使い方をどう組み立てるかで満足度が変わります。' +
    '滞在できる時間と気分に合わせた過ごし方を考えます。予約が要る店もあるので順番が大事です。',
  pillar: '文化',
  provenance: [
    { fact: '会場: 銀座もとじ 和染（中央区銀座4-8-12）', factType: 'venue', sourceName: '銀座もとじ', sourceUrl: 'https://www.motoji.co.jp/blogs/events/sarasa202609', verificationStatus: 'confirmed' },
    { fact: '会期: 2026年9月25日〜27日', factType: 'date', sourceName: '銀座もとじ', sourceUrl: 'https://www.motoji.co.jp/blogs/events/sarasa202609', verificationStatus: 'confirmed' },
    { fact: '併設カフェ: 11:00〜19:00', factType: 'hours', sourceName: '銀座もとじ', sourceUrl: 'https://www.motoji.co.jp/pages/shops', verificationStatus: 'confirmed' },
  ],
})

const bareIntroArticle = art({
  id: 102,
  title: '銀座に新店オープンのお知らせ',
  bodyText: '銀座に新しいお店がオープンしました。場所は中央区銀座。営業時間などは公式でご確認ください。',
  pillar: null,
  provenance: [],
})

const comparableButNoTaskWords = art({
  id: 103,
  title: '銀座の展示3つ',
  bodyText: '銀座でいくつかの展示があります。',
  pillar: 'アート',
  provenance: [
    { fact: '会場A', factType: 'venue', sourceName: 'X', sourceUrl: 'https://a.example/1', verificationStatus: 'confirmed' },
    { fact: '会場B', factType: 'venue', sourceName: 'X', sourceUrl: 'https://a.example/2', verificationStatus: 'confirmed' },
  ],
})

const cases: CheckCase[] = [
  {
    name: '再現性のある記事は候補になる（読者タスクの語＋出典あり）',
    fn: () => {
      const r = proposePaid100Candidates([reproducibleArticle], { weekLabel: '2026-W37' })
      assert(r.proposals.length === 1, `件数: ${r.proposals.length}`)
      const p = r.proposals[0]
      assert(p.reproducibility.reproducible === true, '再現性 OK')
      assert(p.seriesLabel === PAID100_SERIES_LABEL_V1, `series: ${p.seriesLabel}`)
      assert(p.rank === 1, `rank: ${p.rank}`)
      assert(!!p.freePortion.challenge && !!p.freePortion.change && !!p.freePortion.result, '課題・変化・結果')
      assert(/手順|指示文|比較|確認|テンプレート/.test(p.paidValue), `paidValue: ${p.paidValue}`)
      assert(p.reusableMaterials.some((m) => m.includes('#101')), '再利用素材に元記事ID')
      assert(p.estimatedMinutes >= 20 && p.estimatedMinutes <= 45, `見込み時間: ${p.estimatedMinutes}`)
    },
  },
  {
    name: '施設紹介・告知だけの記事は候補にしない（再現できる行動が無い）',
    fn: () => {
      const r = proposePaid100Candidates([bareIntroArticle], { weekLabel: '2026-W37' })
      assert(r.proposals.length === 0, `件数: ${r.proposals.length}`)
      assert(r.rejected.some((x) => x.sourceArticleId === 102 && /施設紹介|再現/.test(x.reason)), `理由: ${JSON.stringify(r.rejected)}`)
    },
  },
  {
    name: '比較できる候補が2件以上あれば、読者タスクの語が無くても候補になる',
    fn: () => {
      const r = proposePaid100Candidates([comparableButNoTaskWords], { weekLabel: '2026-W37' })
      assert(r.proposals.length === 1, `件数: ${r.proposals.length}`)
      assert(/比較できる候補/.test(r.proposals[0].reproducibility.reason), r.proposals[0].reproducibility.reason)
    },
  },
  {
    name: '毎週 最大3案（4件以上の適格記事があっても3案に絞る）',
    fn: () => {
      const many = [1, 2, 3, 4, 5].map((i) =>
        art({
          id: 200 + i,
          title: `銀座の回り方その${i}——選び方と組み合わせ`,
          bodyText: '時間と気分に合わせて回り方を選ぶ。予約や順番も考える。',
          pillar: i % 2 ? '文化' : null,
          provenance: [
            { fact: `会場${i}`, factType: 'venue', sourceName: 'S', sourceUrl: `https://e.example/${i}`, verificationStatus: 'confirmed' },
          ],
        }),
      )
      const r = proposePaid100Candidates(many, { weekLabel: '2026-W37' })
      assert(r.proposals.length === 3, `件数: ${r.proposals.length}`)
      assert(r.proposals.map((p) => p.rank).join(',') === '1,2,3', 'rank 連番')
      assert(r.meta.freeArticlesConsidered === 5, `考慮数: ${r.meta.freeArticlesConsidered}`)
    },
  },
  {
    name: 'paid_100 レーンの記事は再利用元にしない',
    fn: () => {
      const r = proposePaid100Candidates([{ ...reproducibleArticle, lane: 'paid_100' }], { weekLabel: '2026-W37' })
      assert(r.proposals.length === 0 && r.meta.freeArticlesConsidered === 0, `考慮数: ${r.meta.freeArticlesConsidered}`)
    },
  },
  {
    name: 'buildPaid100Draft: 無料3節＋有料6節（3コース45/90/150・予算別・雨天・AI指示文・再利用テンプレ・確認方法）＋出典再利用＋タグ4',
    fn: () => {
      const r = proposePaid100Candidates([reproducibleArticle], { weekLabel: '2026-W37' })
      const d = buildPaid100Draft(r.proposals[0], reproducibleArticle)
      assert(d.lane === 'paid_100' && d.priceYen === PAID100_PRICE_YEN, `lane/price: ${d.lane}/${d.priceYen}`)
      assert(d.seriesLabel === PAID100_SERIES_LABEL_V1, `series: ${d.seriesLabel}`)
      assert(d.freeSections.length === 3, `無料節: ${d.freeSections.length}`)
      const paidHeads = d.paidSections.map((s) => s.heading).join(' / ')
      assert(/45分／90分／150分/.test(paidHeads), `3コース見出し: ${paidHeads}`)
      assert(/予算別/.test(paidHeads), `予算別: ${paidHeads}`)
      assert(/雨天時/.test(paidHeads), `雨天時: ${paidHeads}`)
      assert(/AIへそのまま渡せる指示文/.test(paidHeads), `AI指示文: ${paidHeads}`)
      assert(/再利用できる記入式テンプレート/.test(paidHeads), `再利用テンプレ: ${paidHeads}`)
      assert(/公式情報の確認方法/.test(paidHeads), `確認方法: ${paidHeads}`)
      // 3コース節に 45/90/150 分すべてが登場する
      const courses = d.paidSections.find((s) => /時間別の3コース/.test(s.heading))!
      const cjoin = courses.lines.join('\n')
      assert(/45分コース/.test(cjoin) && /90分コース/.test(cjoin) && /150分コース/.test(cjoin), `3コース本文: ${cjoin.slice(0, 120)}`)
      // AI指示文にコピペ用の --- 区切りが2つ以上
      const aiPrompt = d.paidSections.find((s) => /AIへそのまま渡せる指示文/.test(s.heading))!
      assert(aiPrompt.lines.filter((l) => l === '---').length >= 2, 'コピペ用の区切り')
      // 再利用テンプレートに記入欄（＿）がある
      const tmpl = d.paidSections.find((s) => /再利用できる記入式テンプレート/.test(s.heading))!
      assert(tmpl.lines.some((l) => l.includes('＿')), '記入欄')
      assert(d.sources.some((s) => s.sourceUrl.includes('motoji.co.jp')), '出典を再利用')
      assert(d.hashtags.length === 4, `ハッシュタグ数: ${d.hashtags.length}`)
      assert(d.hashtags.includes('#銀座') && d.hashtags.includes('#AIで叶えるわたしだけの銀座'), `タグ: ${d.hashtags.join(' ')}`)
      assert(d.notes.some((n) => /自動公開しない/.test(n)), `注意: ${d.notes.join(' / ')}`)
      assert(d.notes.some((n) => /施設の羅列にしない/.test(n)), `施設羅列禁止: ${d.notes.join(' / ')}`)
    },
  },
  {
    name: 'buildPaid100Draft: --title 相当の titleOverride が第一タイトルになる',
    fn: () => {
      const r = proposePaid100Candidates([reproducibleArticle], { weekLabel: '2026-W37' })
      const custom = '90分でも楽しめる。銀座もとじ『更紗展』から始める、私だけの銀座時間'
      const d = buildPaid100Draft(r.proposals[0], reproducibleArticle, { titleOverride: custom })
      assert(d.title === custom, `title: ${d.title}`)
      // override 無しなら proposal.title
      const d2 = buildPaid100Draft(r.proposals[0], reproducibleArticle)
      assert(d2.title === r.proposals[0].title, `default title: ${d2.title}`)
    },
  },
  {
    name: 'buildPaid100Draft: 出典が無い記事（本文は十分）は各所に [マロン具体化] マーカーで穴埋めを促す',
    fn: () => {
      const src = art({
        id: 301,
        title: '銀座の半日、静かに過ごす回り方',
        bodyText:
          '静かに過ごしたい日の回り方を、時間の使い方に合わせて考えます。'.repeat(3) +
          '午前と午後で混み具合が変わるので、立ち寄る順番と所要時間の見当をつけておくと、'.repeat(3) +
          '当日あわてずに済みます。予約が要る場所は先に押さえ、雨の日の代替も一つ用意しておきます。'.repeat(3),
        pillar: '文化',
        provenance: [],
      })
      assert(src.bodyText.length >= 300, `本文長: ${src.bodyText.length}`)
      const r = proposePaid100Candidates([src], { weekLabel: '2026-W37' })
      assert(r.proposals.length === 1, `件数: ${r.proposals.length}`)
      const d = buildPaid100Draft(r.proposals[0], src)
      const allLines = [...d.freeSections, ...d.paidSections].flatMap((s) => s.lines).join('\n')
      assert(/\[マロン具体化\]/.test(allLines), 'マロン具体化マーカーあり')
      assert(d.sources.length === 0, '出典なし')
    },
  },
  {
    name: '本文が短く出典も無い記事は候補にしない（一般検索の範囲を超えられない）',
    fn: () => {
      const thin = art({ id: 302, title: '銀座の回り方メモ', bodyText: '回り方を考える。', provenance: [] })
      const r = proposePaid100Candidates([thin], { weekLabel: '2026-W37' })
      assert(r.proposals.length === 0, `件数: ${r.proposals.length}`)
      assert(r.rejected.some((x) => x.sourceArticleId === 302 && /本文が短く|一般検索/.test(x.reason)), `理由: ${JSON.stringify(r.rejected)}`)
    },
  },
]

export const suite = () => runSuite('paid100', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
