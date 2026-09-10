// GINZA WHISKERS / Project 02（2026-09-10）— 100円レーンの候補提案（決定的・AI なし）。
//
// 無料記事＋その editorialProvenance（収集済み Facts）を再利用し、
// 「AIで叶える、わたしだけの銀座」の 100円記事へ展開できる素材を抽出する。
// 毎週、最大3案だけを提示する。マロンは1案を選ぶだけ。
//
// 有料判定の必須条件：**読者が実際に再現できること**。
// 単なる施設紹介や一般検索で分かる情報だけの記事は候補にしない。

import {
  PAID100_SERIES_LABEL_V1,
  PAID100_TARGET_WEEKDAYS,
  type FreeArticleSummary,
  type Paid100Proposal,
  type Paid100ProposalResult,
} from './types'

// 読者タスク（AI が再現を助けられる行動）を示す語。
const READER_TASK_RE =
  /選び方|選ぶ|比べ|比較|どう過ごす|過ごし方|回り方|巡り方|巡る|ルート|コース|はしご|梯子|迷ったら|組み合わせ|段取り|準備|プラン|計画|時間の使い方|使い方|予約|チェックリスト|チェックポイント|見どころ|楽しみ方|おすすめの(?:順|回り方|過ごし方)|半日|一日|午前|午後|夕方/

// 施設紹介・告知だけで終わりがちな語（単独では有料にしない）。
const BARE_INTRO_RE = /オープン|開業|新店|新規出店|リニューアル|移転|発売|入荷|登場|開催のお知らせ/

function normalize(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

function countComparableFacts(a: FreeArticleSummary): number {
  return a.provenance.filter((p) => ['venue', 'price', 'date', 'reservation', 'hours', 'access'].includes(p.factType ?? ''))
    .length
}

function pillarLean(pillar: string | null): number {
  // 「私だけの銀座時間」を設計しやすい収蔵室に軽く加点
  if (!pillar) return 0
  if (['文化', 'アート'].includes(pillar)) return 1
  return 0
}

function firstSentence(text: string): string {
  const t = normalize(text)
  const m = t.match(/^[^。！？!?]{4,80}[。！？!?]/)
  return m ? m[0] : t.slice(0, 60)
}

/** 記事タイトルからトピック語（「」内 or 先頭名詞句）をざっくり取り出す */
function topicOf(title: string): string {
  const q = title.match(/[「『]([^」』]{2,30})[」』]/)
  if (q) return q[1]
  const seg = normalize(title).split(/[——…\-。、／\/|｜]/)[0]
  return seg.slice(0, 24) || normalize(title).slice(0, 24)
}

function assessReproducibility(a: FreeArticleSummary): { reproducible: boolean; reason: string } {
  const text = `${a.title} ${a.bodyText}`
  const hasTask = READER_TASK_RE.test(text)
  const comparable = countComparableFacts(a)
  const bareIntro = BARE_INTRO_RE.test(a.title) && !hasTask && comparable < 2
  const generalOnly = normalize(a.bodyText).length < 300 && a.provenance.length === 0

  if (bareIntro) {
    return {
      reproducible: false,
      reason: '施設紹介・告知が中心で、読者が再現できる行動（選ぶ・比べる・回る・準備する）が示されていない',
    }
  }
  if (generalOnly) {
    return {
      reproducible: false,
      reason: '本文が短く出典も無い。一般検索で分かる範囲を超える「再現できる段取り」が作れない',
    }
  }
  if (hasTask || comparable >= 2) {
    return {
      reproducible: true,
      reason: hasTask
        ? '読者が再現できる行動（回り方・選び方・段取り等）が本文にあり、AI 指示文＋手順に展開できる'
        : `比較できる候補が ${comparable} 件（会場・料金・日程など）あり、候補比較＋選び方の手順に展開できる`,
    }
  }
  return {
    reproducible: false,
    reason: '読者タスクの語も、比較できる候補（2件以上）も見当たらない。再現性を有料の必須条件にできない',
  }
}

export function proposePaid100Candidates(
  freeArticles: FreeArticleSummary[],
  opts: { weekLabel: string; now?: Date; maxProposals?: number } = { weekLabel: 'unknown' },
): Paid100ProposalResult {
  const maxProposals = opts.maxProposals ?? 3
  const now = opts.now ?? new Date()

  // 無料レーンのみ対象（paid_100 は再利用元にしない）
  const pool = freeArticles.filter((a) => a.lane !== 'paid_100')

  const rejected: Paid100ProposalResult['rejected'] = []
  const scored: Paid100Proposal[] = []

  for (const a of pool) {
    const repro = assessReproducibility(a)
    if (!repro.reproducible) {
      rejected.push({ sourceArticleId: a.id, title: a.title, reason: repro.reason })
      continue
    }

    const topic = topicOf(a.title)
    const comparable = countComparableFacts(a)
    const provCount = a.provenance.length
    const score =
      3 +
      (READER_TASK_RE.test(`${a.title} ${a.bodyText}`) ? 2 : 0) +
      (comparable >= 2 ? 2 : 0) +
      Math.min(provCount, 4) +
      pillarLean(a.pillar) +
      (a.reviewStatus === 'published' ? 1 : 0)

    const estimatedMinutes = Math.min(45, 20 + 5 * Math.min(provCount, 4) + (comparable >= 2 ? 5 : 0))

    const sourceNames = [...new Set(a.provenance.map((p) => p.sourceName).filter(Boolean))]
    const venueFacts = a.provenance.filter((p) => p.factType === 'venue').map((p) => p.fact)
    const priceFacts = a.provenance.filter((p) => p.factType === 'price').map((p) => p.fact)
    const dateFacts = a.provenance.filter((p) => p.factType === 'date').map((p) => p.fact)

    scored.push({
      rank: 0,
      sourceArticleId: a.id,
      seriesLabel: PAID100_SERIES_LABEL_V1,
      title: `AIで叶える、わたしだけの銀座 — 「${topic}」を自分の時間に合わせて`,
      freePortion: {
        challenge:
          `「${topic}」について、自分の状況（滞在時間・予算・一緒に行く人・その日の気分）に` +
          'あわせて銀座での過ごし方を毎回ゼロから考えるのは手間がかかる。',
        change:
          `無料記事『${a.title}』で整理した情報を土台に、記事内の AI 指示文と手順を使って、` +
          '自分向けの銀座プラン（回り方・選び方）へ具体化する。',
        result:
          '自分の条件に合わせた回り方・選択が、公式での確認方法つきで手に入る。' +
          '次回も使える記入式テンプレートが残る（再現可能）。',
      },
      paidValue:
        '有料エリアに、① 具体的な手順 ② AI へのコピペ用指示文 ③ 候補' +
        `${Math.max(comparable, venueFacts.length, 1)} 件の比較 ④ 公式での確認方法 ⑤ 次回も使える記入式テンプレート を収録。` +
        `施設紹介や一般検索では得られない「自分で再現できる段取り」が中心。${repro.reason}。`,
      reusableMaterials: [
        `無料記事 #${a.id}「${a.title}」（${a.reviewStatus}）`,
        provCount > 0 ? `出典 ${provCount} 件（${sourceNames.join('・') || '—'}）` : '出典なし（本文の構成のみ再利用）',
        a.pillar ? `収蔵室「${a.pillar}」` : '収蔵室 未設定',
        ...venueFacts.slice(0, 3).map((f) => `会場fact: ${f}`),
        ...priceFacts.slice(0, 2).map((f) => `料金fact: ${f}`),
        ...dateFacts.slice(0, 2).map((f) => `日程fact: ${f}`),
      ],
      estimatedMinutes,
      reproducibility: repro,
      score,
    })
  }

  scored.sort((x, y) => y.score - x.score || x.sourceArticleId - y.sourceArticleId)
  const proposals = scored.slice(0, maxProposals).map((p, i) => ({ ...p, rank: i + 1 }))

  return {
    weekLabel: opts.weekLabel,
    targetWeekdays: [...PAID100_TARGET_WEEKDAYS],
    proposals,
    rejected,
    meta: { freeArticlesConsidered: pool.length, generatedAt: now.toISOString() },
  }
}
