// GINZA WHISKERS / Project 02（2026-09-10）— 選定後の 100円記事 CMS 下書きを組み立てる（決定的・AI なし）。
//
// マロンが1案を選んだあと、無料記事＋その editorialProvenance（収集済み Facts）を再利用して
// 「無料エリア（展覧会の概要＋この記事の価値）」＋「有料エリア（読者が自分の予定へ置き換えて
// 再現できる構成）」＋出典＋注意事項＋ハッシュタグ4個のスキャフォールドを作る。
//
// 有料エリアには次を必ず含める：
//   ・45分／90分／150分の3コース
//   ・予算別の調整
//   ・雨天時の変更
//   ・AIへそのまま渡せる指示文
//   ・別の展覧会にも再利用できる記入式テンプレート
//   ・公式情報の確認方法
//
// 一般的な銀座紹介・施設の羅列にしない。確定できない具体値は [マロン具体化] マーカーを残す
// （推測で断定しない）。note の有料設定・価格・公開はマロンが手動（自動公開しない）。

import { PAID100_PRICE_YEN } from './types'
import type { FreeArticleSummary, Paid100Draft, Paid100DraftSection, Paid100Proposal } from './types'

function factsBy(source: FreeArticleSummary, type: string) {
  return source.provenance.filter((p) => (p.factType ?? '') === type)
}
function factLike(source: FreeArticleSummary, re: RegExp) {
  return source.provenance.filter((p) => re.test(p.fact ?? ''))
}
function firstFactValue(facts: { fact: string }[], stripLabel = true): string | null {
  if (!facts.length) return null
  const f = facts[0].fact ?? ''
  return stripLabel ? f.replace(/^[^:：]{2,20}[:：]\s*/, '').trim() : f.trim()
}

const TOPIC_TAG_RULES: { re: RegExp; tag: string }[] = [
  { re: /更紗/, tag: '#更紗展' },
  { re: /きもの|着物|染織|帯|反物|呉服/, tag: '#きもの' },
  { re: /工芸|うつわ|陶|漆|木工|硝子/, tag: '#工芸' },
  { re: /アート|美術|個展|絵画|版画|展覧会/, tag: '#アート' },
  { re: /カフェ|喫茶|珈琲|コーヒー|アフタヌーンティー/, tag: '#カフェ' },
  { re: /コスメ|ビューティ|美容|ネイル|フレグランス|チーク|リップ/, tag: '#ビューティー' },
  { re: /スイーツ|ケーキ|菓子|パン|グルメ/, tag: '#グルメ' },
]

function venueTag(source: FreeArticleSummary): string | null {
  const v = `${firstFactValue(factsBy(source, 'venue')) ?? ''} ${source.title}`
  const m = v.match(/銀座もとじ|銀座 蔦屋書店|GINZA SIX|松屋銀座|銀座三越|和光|POLA MUSEUM ANNEX|資生堂/)
  if (!m) return null
  return '#' + m[0].replace(/\s+/g, '')
}

export function buildPaid100Draft(
  proposal: Paid100Proposal,
  source: FreeArticleSummary,
  opts: { titleOverride?: string } = {},
): Paid100Draft {
  const title = (opts.titleOverride ?? '').trim() || proposal.title

  const nameFact = firstFactValue(factLike(source, /催事名|展覧会名|イベント名/), true)
  const periodFact = firstFactValue(factLike(source, /会期|開催期間|販売期間/), true)
  const venueFact = firstFactValue(factLike(source, /会場|開催場所/), true)
  const addressFact = firstFactValue(factLike(source, /所在地|住所/), true)
  const talkFact = firstFactValue(factLike(source, /トーク|講演|ワークショップ|実演/), false)
  const contactFact = firstFactValue(factLike(source, /問い合わせ|予約|申込|電話/), false)

  const exhibitionName = nameFact || source.title
  const venueLabel = venueFact || '[マロン具体化] 会場名（無料記事から）'
  const periodLabel = periodFact || '[マロン具体化] 会期（無料記事から）'

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

  // ── 無料エリア（更紗展の概要＋この記事の価値だけで完結） ──
  const freeSections: Paid100DraftSection[] = [
    {
      heading: 'この記事で扱う展覧会',
      lines: [
        `${exhibitionName}。会期：${periodLabel}。会場：${venueLabel}${addressFact ? `（${addressFact}）` : ''}。`,
        talkFact ? `関連：${talkFact}` : '',
        '[マロン具体化] 展示の見どころ（出品作家・作品）を無料記事から2〜3文で。施設や街の一般紹介にしない。',
      ].filter(Boolean),
    },
    {
      heading: '読者の悩みと、この記事でできること',
      lines: [
        `悩み：${proposal.freePortion.challenge}`,
        `変化：${proposal.freePortion.change}`,
        `結果：${proposal.freePortion.result}`,
        'この無料部分だけで、展覧会の概要とこの記事の価値が分かるように書く。',
      ],
    },
    {
      heading: '有料エリアで読めること',
      lines: [
        '・45分／90分／150分の3コース（時間別の回り方）',
        '・予算別の調整（かける金額を変えたいとき）',
        '・雨天時の変更（当日の天気で組み替える）',
        '・AIへそのまま渡せる指示文（自分の予定に置き換える）',
        '・別の展覧会にも再利用できる記入式テンプレート',
        '・公式情報の確認方法',
      ],
    },
  ]

  // ── 有料エリア（読者が自分の予定へ置き換えて再現できる） ──
  const courseBase = (mins: number, aim: string, spine: string[]): string[] => [
    `ねらい：${aim}`,
    ...spine.map((s, i) => `${i + 1}. ${s}`),
    `所要の目安：約${mins}分（移動・待ち時間を含む。時間が押したら後半を削る）`,
    '[マロン具体化] 具体的な立ち寄り先・順番を1案（更紗展の見どころ＋落ち着ける場所。施設の羅列にしない）',
  ]

  const paidSections: Paid100DraftSection[] = [
    {
      heading: '1. 時間別の3コース（45分／90分／150分）',
      lines: [
        `どのコースも「${exhibitionName}」を軸にする。まず展示、余った時間で余韻をつくる順。`,
        '',
        '■ 45分コース（展示に集中）',
        ...courseBase(45, `${venueLabel}で更紗展をしっかり見る。寄り道はしない。`, [
          `${venueLabel}へ入り、更紗展を見る（気になる帯・着尺を2〜3点に絞る）`,
          '会場の人に一言質問できれば、和更紗と木版摺更紗の違いを聞く',
        ]),
        '',
        '■ 90分コース（展示＋余韻）',
        ...courseBase(90, '更紗展のあと、座って余韻を残す。可能なら関連トークを軸に。', [
          talkFact ? `関連トークがある日は時間を先に確認（${talkFact}）` : '会場でその日の実演・解説の有無を確認',
          `${venueLabel}で更紗展をゆっくり見る`,
          '[マロン具体化] 近くで一息つける場所を1つ（喫茶・ラウンジ等。名称は無料記事か公式で確認）',
        ]),
        '',
        '■ 150分コース（展示＋トーク＋手に取る）',
        ...courseBase(150, '更紗展をじっくり見て、実物を手に取り、相談もする。半日の予定向け。', [
          talkFact ? `関連トーク（${talkFact}）に合わせて訪問時間を決める・要予約なら先に申し込む` : '実演・解説の時間を先に確認',
          `${venueLabel}で更紗展を見る（作家ごとに分けて見る）`,
          '気になった帯・着尺を実際に手に取り、合わせ方や手入れを相談する',
          '[マロン具体化] 締めに立ち寄る場所を1つ（食事・喫茶。街歩きの羅列にしない）',
        ]),
      ],
    },
    {
      heading: '2. 予算別の調整',
      lines: [
        'かけたい金額でコースを微調整する。観覧料は公式に記載がないので、来店時に確認する前提。',
        '・〜0円：更紗展の観覧のみ。関連トークが無料予約制ならそれだけ押さえる。飲食はしない。',
        '・〜3,000円：観覧＋お茶を1回（90分コースの余韻に充てる）。',
        '・〜10,000円＋：観覧＋お茶＋小物や書籍（手ぬぐい・図録など）。相談だけなら無料。',
        '[マロン具体化] 各予算帯で「何に使うか」を1行ずつ（金額は幅で。断定しない）。',
      ],
    },
    {
      heading: '3. 雨天時の変更',
      lines: [
        `${venueLabel}は屋内で、移動を最小にすれば雨でも回りやすい。`,
        '・屋外の立ち寄り（街歩き・写真）は外し、屋内（書店・喫茶・ギャラリー）へ振り替える。',
        '・傘の持ち込み・預け方を入店時に確認。濡れた荷物は袋に。',
        '・90分／150分コースは「近くの屋内で一息」に置き換え、移動距離を短くする。',
        '[マロン具体化] 雨の日に振り替えられる屋内の候補を1〜2つ（無料記事・公式で確認できる範囲）。',
      ],
    },
    {
      heading: '4. AIへそのまま渡せる指示文',
      lines: [
        '（下の「---」から「---」までをコピーし、空欄を埋めて AI に貼る）',
        '---',
        'あなたは銀座に詳しい編集者です。次の条件で、指定の展覧会を中心にした銀座の回り方を1案作ってください。',
        `対象の展覧会：${exhibitionName}`,
        `会場：${venueLabel}`,
        `会期：${periodLabel}`,
        talkFact ? `関連：${talkFact}` : '',
        contactFact ? `問い合わせ：${contactFact}` : '',
        '訪問予定日：（例：9月26日 土曜）',
        '滞在できる時間：（45分 / 90分 / 150分 のいずれか、または具体的な時刻帯）',
        '予算：（例：3,000円まで）',
        '一緒に行く人：（例：ひとり / 友人と）',
        'その日の気分：（例：静かに過ごしたい / じっくり見たい）',
        '天気：（晴れ / 雨）',
        '出力してほしいもの：',
        '- 立ち寄り順と各所の所要時間の目安',
        '- 移動の目安（徒歩何分か）',
        '- 出かける前に公式で確認しておくこと',
        '- 天気が変わった場合の差し替え案',
        '注意：営業時間・観覧料・予約の要否は「公式で確認」とだけ書き、具体的な数値を断定しないでください。',
        '一般的な銀座観光の紹介や、店の羅列にはしないでください。',
        '---',
        '[マロン具体化] 上の「対象の展覧会」欄の下に、無料記事の見どころ（出品作家・作品）を2〜3行足す。',
      ].filter(Boolean),
    },
    {
      heading: '5. 別の展覧会にも再利用できる記入式テンプレート',
      lines: [
        '別の展覧会に行くときは、次の欄を書き換えれば同じ手順（3コース・予算・雨天・AI指示文）が使えます。',
        '---',
        '【展覧会名】＿＿＿＿',
        '【会場】＿＿＿＿　【会期】＿＿＿＿　【観覧料】＿＿（公式で確認）',
        '【関連イベント】＿＿（トーク・実演・要予約など）',
        '【公式URL】＿＿＿＿',
        '【今回の条件】訪問日：＿＿ ／ 時間：45・90・150分から＿＿ ／ 予算：＿＿ ／ 同行者：＿＿ ／ 気分：＿＿ ／ 天気：＿＿',
        '【AIに出してもらった案】立ち寄り順：＿＿ → ＿＿ → ＿＿ ／ 所要：＿＿',
        '【公式で確認した点】開催時間：＿＿ ／ 予約：＿＿ ／ 料金：＿＿',
        '【次回への申し送り】よかった点：＿＿ ／ 変えたい点：＿＿',
        '---',
      ],
    },
    {
      heading: '6. 公式情報の確認方法',
      lines: [
        '出かける前に、次を公式で確認する（本文では断定しない）：',
        '・開催時間（会期中の各日の時間。公式に記載が無ければ会場へ電話 or 申込フォームで確認）',
        '・観覧料の有無',
        '・関連トーク／実演の日時と、予約の要否・申込方法',
        ...(sources.length ? sources.map((s) => `・${s.sourceName}：${s.sourceUrl}`) : ['・[マロン具体化] 確認先の公式URLを1〜2件']),
        ...(contactFact ? [`・電話での確認先：${contactFact}`] : []),
      ],
    },
  ]

  const notes = [
    `再利用元：無料記事 #${source.id}「${source.title}」（${source.reviewStatus}）。追加調査はしていない。`,
    '[マロン具体化] の箇所は、無料記事と収集済み Facts の範囲で具体化する（推測で断定しない）。',
    '一般的な銀座紹介・施設の羅列にしない。この記事は「読者が自分の予定へ置き換えて再現できる」ことが目的。',
    `想定価格：${PAID100_PRICE_YEN}円。note 上の有料設定・価格・公開はマロンが手動で行う（自動公開しない）。`,
    '通常記事の投稿数・カテゴリー配分・会場重複判定には加算しない（lane=paid_100）。',
    'マストヘッド固定文（GINZA TIME EDIT …）は note 転記時に冒頭へ付与する（本文には保存しない）。',
  ]

  const baseTags = ['#銀座', '#AIで叶えるわたしだけの銀座']
  const vt = venueTag(source)
  const extra: string[] = []
  if (vt && !baseTags.includes(vt)) extra.push(vt)
  for (const r of TOPIC_TAG_RULES) {
    if (extra.length + baseTags.length >= 4) break
    if (r.re.test(`${source.title} ${exhibitionName}`) && !extra.includes(r.tag) && !baseTags.includes(r.tag)) extra.push(r.tag)
  }
  const hashtags = [...baseTags, ...extra].slice(0, 4)
  while (hashtags.length < 4) hashtags.push('#わたしだけの銀座時間')

  return {
    sourceArticleId: source.id,
    title,
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
