// GINZA WHISKERS / Project 02 — 2026-09-10 100円 note 公開トライアル（Article #60）で
// 判明した課題の恒久反映：note 転記の共通クリーン化・検査の回帰テスト。
//
//  1. note 転記本文のクリーン化（sanitizeNoteBodyUnits）
//  3. 有料ライン設定支援（checkPaywallAnchor）
//  4. 表記統一（checkWording）
//  5. 有料記事の内容検査（checkPaidContent）
//  6. AI 指示文の標準化（checkAiPromptConstraints / AI_PROMPT_STANDARD_CONSTRAINTS）
//  9. Article #60 を回帰テストケースとして固定

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  sanitizeNoteBodyUnits,
  checkPaywallAnchor,
  paywallLine,
  checkWording,
  checkPaidContent,
  checkAiPromptConstraints,
  extractAiPromptBlock,
  AI_PROMPT_STANDARD_CONSTRAINTS,
  bodySourceUrls,
  type BodyBlock,
} from '../night/noteTransferChecks'
import { composeNoteBodyWithMasthead, NOTE_MASTHEAD_TEXT } from '../note/noteMasthead'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}
const codes = (fs: { code: string }[]) => fs.map((f) => f.code)

// ── Article #60（銀座もとじ「更紗展」100円プラン）を模した CMS 本文ブロック ──
// 実 #60 と同じ構造：無料エリア → 仮の有料マーカー（除去対象）→ 使い方（有料ライン直前）→
// コースA/B/C → 予算別 → 雨天 → AI指示文 → テンプレ → 公式確認 → 出典 → 注意事項 → 挿絵注釈 → ハッシュタグ
const ARTICLE_60_TITLE = 'AIでつくる、私だけの銀座時間｜銀座もとじ「更紗展」45・90・150分プラン'
const ARTICLE_60_BLOCKS: BodyBlock[] = [
  { tag: 'h2', text: 'この記事で扱う展覧会' },
  { tag: 'paragraph', text: '更紗展 ～インドから世界へ世界を魅了した染めの美～。会期：2026年9月25日（金）〜27日（日）。会場：銀座もとじ 和染。' },
  { tag: 'h2', text: '読者の悩みと、この記事でできること' },
  { tag: 'paragraph', text: '悩み：時間も予算も毎回ちがう。銀座での過ごし方をゼロから組み立てるのは手間。' },
  { tag: 'h2', text: '無料と有料の境界' },
  { tag: 'paragraph', text: 'ここまでで更紗展の概要が分かります。ここから先の有料部分（100円）に3コースと確認方法を収録。' },
  { tag: 'h2', text: '―――ここから有料エリア（100円）―――' },
  { tag: 'paragraph', text: '（note 上でこの位置に有料ラインを設定する。有料設定・価格はマロンが手動。自動公開しない）' },
  { tag: 'h2', text: '使い方（先に読む）' },
  { tag: 'paragraph', text: '・移動は銀座エリア内・徒歩圏でおさまる範囲に組んでいます（分数は断定しません）。' },
  { tag: 'h2', text: 'コースA：45分（展示に集中する）' },
  { tag: 'paragraph', text: '0〜40分：更紗展を見る。気になる帯・着尺を2〜3点に絞る。' },
  { tag: 'h2', text: '予算別の調整' },
  { tag: 'paragraph', text: '・〜0円：更紗展の観覧（観覧料は公式に記載がないため来店時に確認）＋街歩き。飲食はしない。' },
  { tag: 'paragraph', text: '・〜10,000円＋：手ぬぐいや図録などの小物を足す。作品を購入する場合、公式掲載価格は138,000円〜。' },
  { tag: 'h2', text: 'AIへそのまま渡せる指示文' },
  { tag: 'paragraph', text: '（下の「---」から「---」までをコピーし、空欄を埋めて AI に貼る）' },
  { tag: 'paragraph', text: '---' },
  { tag: 'paragraph', text: '対象の展覧会：更紗展 ～インドから世界へ世界を魅了した染めの美～' },
  { tag: 'paragraph', text: '注意：営業時間・観覧料・予約の要否は「公式で確認」とだけ書き、具体的な数値を断定しないでください。実在が確認できない施設や展示は加えないでください。' },
  { tag: 'paragraph', text: '---' },
  { tag: 'h2', text: '公式情報の確認方法' },
  { tag: 'paragraph', text: '・更紗展の開催時間：公式ページに各日の時間の記載がないため、会場（銀座もとじ 和染／電話 03-3538-7878・受付 11:00〜19:00）へ確認する。' },
  { tag: 'h2', text: '出典' },
  { tag: 'paragraph', text: 'https://www.motoji.co.jp/blogs/events/sarasa202609' },
  { tag: 'paragraph', text: 'https://www.motoji.co.jp/pages/shops' },
  { tag: 'h2', text: '注意事項' },
  { tag: 'paragraph', text: '・再利用元：無料記事 #58「インドから世界へ。9月最後の週末、銀座で出会う『更紗展』」（published）。' },
  { tag: 'paragraph', text: '・想定価格：100円。note 上の有料設定・価格・公開はマロンが手動で行う（自動公開しない）。' },
  { tag: 'paragraph', text: '・通常記事の投稿数・カテゴリー配分・会場重複判定には加算しない（lane=paid_100）。' },
  { tag: 'paragraph', text: 'マストヘッド固定文（GINZA TIME EDIT …）は note 転記時に冒頭へ付与する（本文には保存しない）。' },
  { tag: 'h2', text: '挿絵注釈' },
  { tag: 'paragraph', text: '※画像は記事内容をもとに生成したイメージです。実際の商品・展示作品・会場とは異なります。' },
  { tag: 'h2', text: 'ハッシュタグ' },
  { tag: 'paragraph', text: '#銀座 #銀座もとじ #AIで叶える私だけの銀座時間 #更紗展' },
]
const ARTICLE_60_META = {
  title: ARTICLE_60_TITLE,
  articleType: 'paid' as const,
  priceYen: 100,
  lane: 'paid_100',
  paywallAnchorHeading: '使い方（先に読む）',
  hashtags: ['#銀座', '#銀座もとじ', '#AIで叶える私だけの銀座時間', '#更紗展'],
  heroAsset: 12,
  ogImage: 12,
  sourceUrls: ['https://www.motoji.co.jp/blogs/events/sarasa202609', 'https://www.motoji.co.jp/pages/shops'],
}

function build60() {
  const { kept, removed } = sanitizeNoteBodyUnits(ARTICLE_60_BLOCKS, { articleTitle: ARTICLE_60_TITLE })
  const units = kept.map((b) => b.text)
  const headings = kept.filter((b) => b.tag === 'h2' || b.tag === 'h3').map((b) => b.text)
  const body = composeNoteBodyWithMasthead(units)
  return { kept, removed, units, headings, body }
}

const cases: CheckCase[] = [
  // ───────────── 1. クリーン化 ─────────────
  {
    name: '1: sanitizeNoteBodyUnits — 仮表示・内部メモ・画像マーカー・タイトル・ハッシュタグ・注意事項を除去',
    fn: () => {
      const blocks: BodyBlock[] = [
        { tag: 'h2', text: 'テスト記事のタイトル' }, // = articleTitle → 除去
        { tag: 'paragraph', text: '[IMAGE: アイキャッチ]' },
        { tag: 'paragraph', text: 'media/image-assets/foo.jpg' },
        { tag: 'h2', text: '本編の見出し' },
        { tag: 'paragraph', text: '本文の段落。' },
        { tag: 'h2', text: '―――ここから有料エリア（100円）―――' },
        { tag: 'paragraph', text: '（note 上でこの位置に有料ラインを設定する。自動公開しない）' },
        { tag: 'paragraph', text: '[マロン具体化] ここを埋める' },
        { tag: 'h2', text: '注意事項' },
        { tag: 'paragraph', text: '・再利用元：無料記事 #58。' },
        { tag: 'paragraph', text: '・想定価格：100円。' },
        { tag: 'paragraph', text: '・加算しない（lane=paid_100）。' },
        { tag: 'h2', text: '挿絵注釈' }, // 注意事項の次の見出しでセクション解除
        { tag: 'paragraph', text: '※画像は記事内容をもとに生成したイメージです。実際の商品・展示作品・会場とは異なります。' },
        { tag: 'h2', text: 'ハッシュタグ' },
        { tag: 'paragraph', text: '#銀座 #テスト' },
      ]
      const { kept, removed } = sanitizeNoteBodyUnits(blocks, { articleTitle: 'テスト記事のタイトル' })
      const keptText = kept.map((b) => b.text)
      assert(!keptText.includes('テスト記事のタイトル'), 'タイトル行が残っている')
      assert(!keptText.some((t) => /\[IMAGE:/.test(t)), '画像マーカーが残っている')
      assert(!keptText.some((t) => /foo\.jpg/.test(t)), '画像パスが残っている')
      assert(!keptText.some((t) => /ここから有料エリア/.test(t)), '仮の有料マーカーが残っている')
      assert(!keptText.some((t) => /自動公開しない/.test(t)), '内部メモ（自動公開しない）が残っている')
      assert(!keptText.some((t) => /\[マロン具体化\]/.test(t)), '[マロン具体化] が残っている')
      assert(!keptText.includes('注意事項'), '注意事項見出しが残っている')
      assert(!keptText.some((t) => /再利用元|想定価格|lane=paid_100/.test(t)), '注意事項の内部行が残っている')
      assert(!keptText.includes('ハッシュタグ'), 'ハッシュタグ見出しが残っている')
      assert(!keptText.some((t) => /^#/.test(t)), 'ハッシュタグ行が残っている')
      // 残すべきもの
      assert(keptText.includes('本編の見出し') && keptText.includes('本文の段落。'), '本文が消えている')
      assert(keptText.includes('挿絵注釈') && keptText.some((t) => t.startsWith('※画像は記事内容をもとに生成した')), '挿絵注釈は残す')
      assert(removed.length >= 10, `除去件数: ${removed.length}`)
      assert(removed.every((r) => r.reason && r.text), '除去記録に理由/本文がある')
    },
  },
  {
    name: '1: ASCII の "---"（AI指示文・テンプレのコピペ境界）は除去しない',
    fn: () => {
      const blocks: BodyBlock[] = [
        { tag: 'h2', text: 'AIへそのまま渡せる指示文' },
        { tag: 'paragraph', text: '---' },
        { tag: 'paragraph', text: '対象の展覧会：更紗展' },
        { tag: 'paragraph', text: '----' },
        { tag: 'h2', text: '―――ここから有料エリア（100円）―――' }, // これは除去する
        { tag: 'paragraph', text: '＝＝＝＝' }, // 全角の飾りは除去
      ]
      const { kept, removed } = sanitizeNoteBodyUnits(blocks)
      const keptText = kept.map((b) => b.text)
      assert(keptText.filter((t) => /^-{3,}$/.test(t)).length === 2, 'ASCII の --- が2つ残る')
      assert(!keptText.some((t) => /ここから有料エリア/.test(t)), '仮の有料マーカーは除去')
      assert(removed.some((r) => r.reason === 'fake-paywall-marker'), 'fake-paywall-marker を記録')
      assert(removed.some((r) => r.reason === 'divider' && /＝/.test(r.text)), '全角飾りを divider として記録')
      assert(!removed.some((r) => r.reason === 'divider' && /^-{3,}$/.test(r.text)), 'ASCII --- を divider にしない')
    },
  },
  {
    name: '1: マストヘッド行は sanitize で落ち、compose が冒頭に1回だけ戻す',
    fn: () => {
      const blocks: BodyBlock[] = [
        { tag: 'paragraph', text: 'GINZA TIME EDIT' },
        { tag: 'paragraph', text: 'by GINZA WHISKERS' },
        { tag: 'paragraph', text: '次の銀ブラに、私だけの銀座時間を。' },
        { tag: 'h2', text: '見出し' },
        { tag: 'paragraph', text: '本文。' },
      ]
      const { kept } = sanitizeNoteBodyUnits(blocks)
      const body = composeNoteBodyWithMasthead(kept.map((b) => b.text))
      assert(body.split('GINZA TIME EDIT').length - 1 === 1, 'マストヘッドが1回でない')
      assert(body.startsWith(NOTE_MASTHEAD_TEXT), 'マストヘッドが冒頭でない')
      assert(body.includes('見出し') && body.includes('本文。'), '本文が消えた')
    },
  },

  // ───────────── 3. 有料ライン ─────────────
  {
    name: '3: checkPaywallAnchor — 1件=OK / 0件・複数件・未設定=BLOCKER / 無料=対象外',
    fn: () => {
      assert(checkPaywallAnchor(['A', '使い方（先に読む）', 'B'], '使い方（先に読む）', true).length === 0, '1件は通す')
      assert(codes(checkPaywallAnchor(['A', 'B'], '使い方（先に読む）', true)).includes('paywallAnchorMissing'), '0件は BLOCKER')
      assert(
        codes(checkPaywallAnchor(['x', 'x'], 'x', true)).includes('paywallAnchorAmbiguous'),
        '複数件は BLOCKER',
      )
      assert(codes(checkPaywallAnchor(['A'], null, true)).includes('paywallAnchorNotSet'), '未設定は BLOCKER')
      assert(checkPaywallAnchor(['A'], null, false).length === 0, '無料記事は対象外')
      assert(/使い方（先に読む）/.test(paywallLine('使い方（先に読む）', true)), 'paywallLine 表示')
      assert(/無料記事/.test(paywallLine(null, false)), 'paywallLine 無料表示')
    },
  },

  // ───────────── 4. 表記統一 ─────────────
  {
    name: '4: checkWording — ChatGPT一般表記 / 私・わたし不一致 / ブランド名',
    fn: () => {
      assert(
        codes(checkWording({ title: 't', hashtags: [], body: 'ChatGPTへそのまま渡せる指示文です。' })).includes(
          'wordingChatGptGeneric',
        ),
        'ChatGPT一般表記の警告',
      )
      assert(
        checkWording({ title: 't', hashtags: [], body: '生成AI（ChatGPTなど）へそのまま渡せる指示文です。' }).length === 0,
        '正しい表記なら警告なし',
      )
      assert(
        codes(
          checkWording({
            title: 'AIでつくる、私だけの銀座時間',
            hashtags: ['#AIで叶えるわたしだけの銀座'],
            body: '本文',
          }),
        ).includes('wordingWatashiMismatch'),
        'タイトル私 × タグわたし の不一致',
      )
      assert(
        checkWording({
          title: 'AIでつくる、私だけの銀座時間',
          hashtags: ['#AIで叶える私だけの銀座時間'],
          body: '本文',
        }).length === 0,
        '私で統一されていれば警告なし',
      )
      assert(
        codes(checkWording({ title: 't', hashtags: [], body: '私だけの銀座と、わたしだけの銀座が混在' })).includes(
          'wordingWatashiMixedInBody',
        ),
        '本文内の私/わたし混在',
      )
      assert(
        codes(checkWording({ title: 'Ginza Time Edit 特集', hashtags: [], body: 'x' })).includes('wordingBrandName'),
        'ブランド名の表記ゆれ',
      )
    },
  },

  // ───────────── 5. 有料記事の内容検査 ─────────────
  {
    name: '5: checkPaidContent — 未確認0円・移動時間断定・確認導線なし・出典不一致',
    fn: () => {
      const base = { provenance: [], sourceUrls: [] as string[] }
      // 観覧料 0円 を確認留保なしで断定
      assert(
        codes(checkPaidContent({ ...base, body: '観覧料は0円です。' })).includes('unverifiedFreeAdmission'),
        '未確認0円の警告',
      )
      // 同じ行に確認留保があれば警告しない
      assert(
        !codes(
          checkPaidContent({ ...base, body: '・〜0円：観覧（観覧料は公式に記載がないため来店時に確認）。' }),
        ).includes('unverifiedFreeAdmission'),
        '確認留保つき0円は許容',
      )
      // 移動時間の断定
      assert(
        codes(checkPaidContent({ ...base, body: '銀座もとじから資生堂まで徒歩8分です。' })).includes('guessedTravelTime'),
        '移動時間断定の警告',
      )
      assert(
        !codes(checkPaidContent({ ...base, body: '移動は銀座エリア内・徒歩圏でおさまります。' })).includes(
          'guessedTravelTime',
        ),
        '徒歩圏表現は許容',
      )
      // 料金に触れるのに公式確認導線がない
      assert(
        codes(checkPaidContent({ ...base, body: '観覧料と営業時間はこちら。' })).includes('missingConfirmDisclaimer'),
        '確認導線なしの警告',
      )
      assert(
        !codes(
          checkPaidContent({ ...base, body: '観覧料は公式サイトで確認してください。営業時間も同様。' }),
        ).includes('missingConfirmDisclaimer'),
        '確認導線ありなら警告なし',
      )
      // 出典URLの本文 vs links 不一致
      assert(
        codes(
          checkPaidContent({
            ...base,
            body: '出典 https://a.example/x https://a.example/y',
            sourceUrls: ['https://a.example/x'],
          }),
        ).includes('sourceUrlBodyMismatch'),
        '出典不一致の警告',
      )
      assert(
        !codes(
          checkPaidContent({
            ...base,
            body: '出典 https://a.example/x https://a.example/y',
            sourceUrls: ['https://a.example/y', 'https://a.example/x'],
          }),
        ).includes('sourceUrlBodyMismatch'),
        '順不同で一致なら警告なし',
      )
    },
  },

  // ───────────── 6. AI 指示文の標準化 ─────────────
  {
    name: '6: AI_PROMPT_STANDARD_CONSTRAINTS を含む指示文は checkAiPromptConstraints を通る',
    fn: () => {
      const body = [
        '生成AI（ChatGPTなど）へそのまま渡せる指示文',
        '---',
        '対象の展覧会：更紗展',
        ...AI_PROMPT_STANDARD_CONSTRAINTS,
        '---',
        '別の展覧会にも使えるテンプレート',
      ].join('\n')
      assert(extractAiPromptBlock(body) !== null, 'AI指示文ブロックを抽出できる')
      assert(checkAiPromptConstraints(body, true).length === 0, `制約が揃っていれば警告なし: ${JSON.stringify(checkAiPromptConstraints(body, true))}`)
    },
  },
  {
    name: '6: 制約が欠けた指示文は不足を列挙 / ブロックが無ければ paid で aiPromptMissing',
    fn: () => {
      const weak = ['AIへそのまま渡せる指示文', '---', '対象：更紗展', '注意：公式で確認。', '---', '出典'].join('\n')
      const f = checkAiPromptConstraints(weak, true)
      assert(codes(f).includes('aiPromptMissingConstraints'), '不足を検出')
      assert(/確認済み|推測しない|実在|条件に合わない/.test(f[0].message), `不足内容を列挙: ${f[0]?.message}`)
      assert(codes(checkAiPromptConstraints('AI指示文なし本文。', true)).includes('aiPromptMissing'), 'paidでブロック無し→警告')
      assert(checkAiPromptConstraints('AI指示文なし本文。', false).length === 0, '無料記事は対象外')
    },
  },

  // ───────────── 9. Article #60 回帰 ─────────────
  {
    name: '9: Article #60 — note-body に不要文字列が残らない / 有料ライン1件 / タグ4 / 出典一致 / 未確認0円なし / AI指示文に推測禁止',
    fn: () => {
      const { removed, headings, body } = build60()

      // 本文にハッシュタグ行がない
      assert(!/(^|\n)\s*#[^\s#]/.test(body), 'note-body にハッシュタグ行が残っている')
      // 仮の有料エリア文字列がない
      assert(!/ここから有料エリア/.test(body), '仮の有料エリア文字列が残っている')
      assert(removed.some((r) => r.reason === 'fake-paywall-marker'), '仮マーカーを除去記録')
      // マストヘッドが1件
      assert(body.split('GINZA TIME EDIT').length - 1 === 1, `マストヘッド出現: ${body.split('GINZA TIME EDIT').length - 1}`)
      // 有料ライン対象見出しが本文にちょうど1件
      const anchorHits = headings.filter((h) => h === ARTICLE_60_META.paywallAnchorHeading).length
      assert(anchorHits === 1, `有料ライン見出し出現: ${anchorHits}`)
      assert(checkPaywallAnchor(headings, ARTICLE_60_META.paywallAnchorHeading, true).length === 0, '有料ライン検証を通る')
      // ハッシュタグが4個
      assert(ARTICLE_60_META.hashtags.length === 4, `タグ数: ${ARTICLE_60_META.hashtags.length}`)
      // title / price / lane / hero / OG が保持される
      assert(ARTICLE_60_META.title === ARTICLE_60_TITLE, 'title 保持')
      assert(ARTICLE_60_META.priceYen === 100 && ARTICLE_60_META.lane === 'paid_100', 'price/lane 保持')
      assert(ARTICLE_60_META.heroAsset === 12 && ARTICLE_60_META.ogImage === 12, 'hero/OG 保持')
      // sourceUrls が本文掲載URLと一致
      const inBody = bodySourceUrls(body)
      assert(
        inBody.length === ARTICLE_60_META.sourceUrls.length && inBody.every((u) => ARTICLE_60_META.sourceUrls.includes(u)),
        `出典不一致: body=${inBody.join(',')} meta=${ARTICLE_60_META.sourceUrls.join(',')}`,
      )
      // 未確認の観覧料を「0円」と断定していない（確認留保つきは可）
      const paidFindings = checkPaidContent({ body, provenance: [], sourceUrls: ARTICLE_60_META.sourceUrls })
      assert(!codes(paidFindings).includes('unverifiedFreeAdmission'), `未確認0円の断定が残っている: ${JSON.stringify(paidFindings)}`)
      // AI指示文に推測禁止（断定しない）条件がある
      const ai = extractAiPromptBlock(body)
      assert(ai !== null && /断定しない|推測しない/.test(ai), 'AI指示文に推測禁止条件がない')
      // 表記統一（私で統一されている）
      assert(checkWording({ title: ARTICLE_60_META.title, hashtags: ARTICLE_60_META.hashtags, body }).filter((f) => f.code === 'wordingWatashiMismatch').length === 0, '私/わたし不一致が残っている')
    },
  },
]

export const suite = () => runSuite('noteTransferChecks', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
