// GINZA WHISKERS / Project 02（2026-09-10）— 選定後の 100円記事 CMS 下書きを組み立てる（決定的・AI なし）。
//
// マロンが1案を選んだあと、無料記事＋その editorialProvenance を再利用して
// 「無料エリア（課題・変化・結果の概要）」＋「有料エリア（具体的手順・AI指示文・
// 候補比較・確認方法・再利用テンプレート）」＋出典＋注意事項＋ハッシュタグ4個の
// スキャフォールドを作る。確定できない箇所は [マロン具体化] マーカーを残す（推測で埋めない）。
// note の有料設定・価格・公開はマロンが手動（自動公開しない）。

import { PAID100_PRICE_YEN } from './types'
import type { FreeArticleSummary, Paid100Draft, Paid100DraftSection, Paid100Proposal } from './types'

const TOPIC_TAG_RULES: { re: RegExp; tag: string }[] = [
  { re: /更紗|きもの|着物|染織|工芸|アート|美術|個展|展/, tag: '#アート' },
  { re: /カフェ|喫茶|珈琲|コーヒー|アフタヌーンティー/, tag: '#カフェ' },
  { re: /スイーツ|ケーキ|菓子|パン|グルメ|レストラン/, tag: '#グルメ' },
  { re: /コスメ|ビューティ|美容|ネイル|フレグランス/, tag: '#ビューティー' },
  { re: /ショッピング|新作|POP\s?UP|ポップアップ|限定/i, tag: '#ショッピング' },
  { re: /建築|名所|街並み/, tag: '#銀座建築' },
]

function topicTags(text: string): string[] {
  const out: string[] = []
  for (const r of TOPIC_TAG_RULES) if (r.re.test(text) && !out.includes(r.tag)) out.push(r.tag)
  return out
}

export function buildPaid100Draft(proposal: Paid100Proposal, source: FreeArticleSummary): Paid100Draft {
  const venueFacts = source.provenance.filter((p) => p.factType === 'venue')
  const priceFacts = source.provenance.filter((p) => p.factType === 'price')
  const dateFacts = source.provenance.filter((p) => p.factType === 'date')
  const reservationFacts = source.provenance.filter((p) => ['reservation', 'hours', 'access'].includes(p.factType ?? ''))

  const sources = (() => {
    const seen = new Set<string>()
    const out: Paid100Draft['sources'] = []
    for (const p of source.provenance) {
      const url = (p.sourceUrl ?? '').trim()
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ sourceName: p.sourceName, sourceUrl: url, fact: p.fact, verificationStatus: p.verificationStatus })
    }
    return out
  })()

  const freeSections: Paid100DraftSection[] = [
    {
      heading: 'この記事でできること（課題）',
      lines: [proposal.freePortion.challenge],
    },
    {
      heading: 'AIでどう変わるか（変化）',
      lines: [proposal.freePortion.change],
    },
    {
      heading: '得られるもの（結果）',
      lines: [
        proposal.freePortion.result,
        'この先の有料エリアで、具体的な手順・AIへの指示文（コピペ可）・候補の比較・公式での確認方法・次回も使える記入式テンプレートを読めます。',
      ],
    },
  ]

  const paidSections: Paid100DraftSection[] = [
    {
      heading: '1. 具体的な手順',
      lines: [
        '① 今日の自分の条件を書き出す（滞在できる時間／予算／一緒に行く人／その日の気分）。',
        `② 無料記事『${source.title}』の候補・情報を、下の「AIへの指示文」に貼り付ける。`,
        '③ AIに、自分の条件に合わせた回り方・立ち寄り順・所要時間の目安を出してもらう。',
        '④ 出てきたプランを「候補の比較」と照らして、外せない1〜2か所に絞る。',
        '⑤ 「確認方法」で営業時間・予約要否・料金を公式で確認してから出かける。',
        '⑥ 「再利用できるテンプレート」に今回の条件と結果を記入して保存し、次回に使い回す。',
        '（各ステップの銀座固有の具体値は [マロン具体化]：ルート・所要時間・立ち寄り順の目安を1案入れる）',
      ],
    },
    {
      heading: '2. AIへの指示文（そのままコピーして使えます）',
      lines: [
        '---',
        'あなたは銀座に詳しい編集者です。次の条件に合わせて、半日で回れる銀座の過ごし方を1案作ってください。',
        `テーマ：${proposal.title.replace(/^AIで叶える、わたしだけの銀座 — /, '')}`,
        '滞在できる時間：（例：13:00〜17:00）',
        '予算：（例：5,000円まで）',
        '一緒に行く人：（例：ひとり／友人と）',
        'その日の気分：（例：静かに過ごしたい／新しいものを見たい）',
        '前提にしてよい候補・情報：',
        ...(venueFacts.length
          ? venueFacts.map((p) => `- ${p.fact}`)
          : [`- 無料記事『${source.title}』の内容（会場・見どころ・注意点）`]),
        ...priceFacts.map((p) => `- ${p.fact}`),
        ...dateFacts.map((p) => `- ${p.fact}`),
        '出力：立ち寄り順／各所の所要時間の目安／移動の目安／確認しておくこと。',
        '注意：営業時間・予約要否・料金は「公式で確認」とだけ書き、断定しないでください。',
        '---',
        '（[マロン具体化]：上の候補リストに、無料記事の固有名詞・見どころを2〜3行足す）',
      ],
    },
    {
      heading: '3. 候補の比較',
      lines:
        venueFacts.length || priceFacts.length
          ? [
              '無料記事で確認済みの候補・条件（再利用）：',
              ...venueFacts.map((p) => `・会場：${p.fact}`),
              ...priceFacts.map((p) => `・料金：${p.fact}`),
              ...dateFacts.map((p) => `・日程：${p.fact}`),
              '（[マロン具体化]：各候補の「向いている人／向いていない時間帯」を1行ずつ。'
                + '施設紹介ではなく“選ぶための違い”を書く）',
            ]
          : [
              `[マロン具体化]：無料記事『${source.title}』から比較できる候補を2件以上取り出し、`
                + '「向いている人／所要時間／混みやすい時間」で並べる（一般検索で分かるだけの情報にしない）。',
            ],
    },
    {
      heading: '4. 確認方法',
      lines: [
        '出かける前に、次を公式ページで確認する（本文の断定はしない）：',
        '・営業時間／会期（日によって変わることがある）',
        '・予約の要否と方法',
        '・料金（税・サービス料込みか）',
        ...(reservationFacts.length ? reservationFacts.map((p) => `・記事で確認済み：${p.fact}`) : []),
        ...(sources.length
          ? sources.map((s) => `・${s.sourceName}：${s.sourceUrl}`)
          : ['・[マロン具体化]：確認先の公式URLを1〜2件入れる']),
      ],
    },
    {
      heading: '5. 再利用できるテンプレート',
      lines: [
        '---',
        '【今回の条件】時間：___ ／ 予算：___ ／ 同行者：___ ／ 気分：___',
        '【AIに出してもらったプラン】立ち寄り順：___ → ___ → ___',
        '【公式で確認した点】営業時間：___ ／ 予約：___ ／ 料金：___',
        '【次回への申し送り】よかった点：___ ／ 変えたい点：___',
        '---',
        '（このブロックをコピーして保存すれば、別のテーマでも同じ手順で使い回せます）',
      ],
    },
  ]

  const notes = [
    `再利用元：無料記事 #${source.id}「${source.title}」（${source.reviewStatus}）。追加調査はしていない。`,
    '[マロン具体化] の箇所は、無料記事と収集済み Facts の範囲で具体化する（推測で断定しない）。',
    `想定価格：${PAID100_PRICE_YEN}円。note 上の有料設定・価格・公開はマロンが手動で行う（自動公開しない）。`,
    '通常記事の投稿数・カテゴリー配分・会場重複判定には加算しない（lane=paid_100）。',
    'マストヘッド固定文（GINZA TIME EDIT …）は note 転記時に冒頭へ付与する（本文には保存しない）。',
  ]

  const baseTags = ['#銀座', '#AIで叶えるわたしだけの銀座']
  const extra = topicTags(`${source.title} ${source.bodyText}`).filter((t) => !baseTags.includes(t))
  const hashtags = [...baseTags, ...extra].slice(0, 4)
  while (hashtags.length < 4) hashtags.push('#わたしだけの銀座時間')

  return {
    sourceArticleId: source.id,
    title: proposal.title,
    seriesLabel: proposal.seriesLabel,
    lane: 'paid_100',
    priceYen: PAID100_PRICE_YEN,
    freeSections,
    paidSections,
    sources,
    notes,
    hashtags: [...new Set(hashtags)].slice(0, 4),
  }
}
