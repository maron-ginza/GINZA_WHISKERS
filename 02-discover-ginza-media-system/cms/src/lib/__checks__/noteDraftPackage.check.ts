// GINZA WHISKERS / Project 02 — note 転記パッケージ（buildNoteDraftPackage）の
// 2026-09-10 共通不具合 根本修正の回帰テスト。
//
//   修正1：ハッシュタグ重複 — body 本文にハッシュタグ行を入れない。同じタグが2回以上出ない。
//   修正2：挿絵注釈 — category_icon / hero の caption は記事本文の正式な挿絵注釈。
//          記事固有があれば優先。無ければ DEFAULT_ILLUSTRATION_CAPTION（汎用文へ巻き戻さない）。
//   修正3：出典 URL — confirmed の公式出典だけを links.sourceUrls に入れる。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  isHashtagOnlyText,
  isHashtagHeading,
  extractIllustrationCaption,
  confirmedSourceUrls,
  bodySourceUrls,
  DEFAULT_ILLUSTRATION_CAPTION,
  HERO_IMAGE_CAPTION,
  padNoteHashtagsTo4,
} from '../night/buildNoteDraftPackage'
import { composeNoteBodyWithMasthead } from '../note/noteMasthead'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const HASHTAG_TOKEN_RE = /#[^\s#、。，．,.]+/g

// 記事本文（見出し・段落テキストの配列）を模した入力から、
// buildNoteDraftPackage と同じルールでハッシュタグ関連ブロックを落とす。
function stripHashtagBlocks(blocks: { tag: string; text: string }[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    const t = b.text.trim()
    if (!t) continue
    if (isHashtagOnlyText(t) || isHashtagHeading(b.tag, t)) continue
    out.push(t)
  }
  return out
}

const cases: CheckCase[] = [
  {
    name: '修正1: isHashtagOnlyText / isHashtagHeading の判定',
    fn: () => {
      assert(isHashtagOnlyText('#銀座 #AIで叶えるわたしだけの銀座 #銀座もとじ #更紗展'), 'ハッシュタグ行')
      assert(isHashtagOnlyText('#銀座'), '単一タグ行')
      assert(!isHashtagOnlyText('料金は #500 円です。'), '文中の#は対象外')
      assert(!isHashtagOnlyText('ふつうの本文です。'), '通常本文は対象外')
      assert(isHashtagHeading('h2', 'ハッシュタグ'), '見出し「ハッシュタグ」')
      assert(!isHashtagHeading('h2', '出典'), '別の見出しは対象外')
      assert(!isHashtagHeading('paragraph', 'ハッシュタグ'), '段落は見出し扱いしない')
    },
  },
  {
    name: '修正1: body からハッシュタグ行・「ハッシュタグ」見出しを除去 → 同じタグが2回以上出ない',
    fn: () => {
      const blocks = [
        { tag: 'h2', text: 'この記事で扱う展覧会' },
        { tag: 'paragraph', text: '更紗展の概要。' },
        { tag: 'h2', text: 'ハッシュタグ' },
        { tag: 'paragraph', text: '#銀座 #AIで叶えるわたしだけの銀座 #銀座もとじ #更紗展' },
      ]
      const units = stripHashtagBlocks(blocks)
      const body = composeNoteBodyWithMasthead(units)
      const tags = body.match(HASHTAG_TOKEN_RE) ?? []
      assert(tags.length === 0, `本文にハッシュタグが残っている: ${tags.join(' ')}`)
      assert(!body.includes('ハッシュタグ'), '「ハッシュタグ」見出しが残っている')
      assert(body.includes('更紗展の概要。'), '本文は残る')
      // どのタグも2回以上出ない（0回も条件を満たす）
      for (const tag of ['#銀座', '#AIで叶えるわたしだけの銀座', '#銀座もとじ', '#更紗展']) {
        const n = body.split(tag).length - 1
        assert(n < 2, `${tag} が ${n} 回出現`)
      }
    },
  },
  {
    name: '修正1: 転記パッケージ本文合成は再実行しても同一（ハッシュタグ重複しない）',
    fn: () => {
      const blocks = [
        { tag: 'h2', text: '見出し' },
        { tag: 'paragraph', text: '本文。' },
        { tag: 'h2', text: 'ハッシュタグ' },
        { tag: 'paragraph', text: '#銀座 #更紗展' },
      ]
      const a = composeNoteBodyWithMasthead(stripHashtagBlocks(blocks))
      const b = composeNoteBodyWithMasthead(stripHashtagBlocks(blocks))
      assert(a === b, '再実行で不一致')
      assert((a.match(HASHTAG_TOKEN_RE) ?? []).length === 0, 'ハッシュタグが本文に混入')
    },
  },
  {
    name: '修正2: DEFAULT_ILLUSTRATION_CAPTION は「商品・展示作品・会場」の統一文（2026-09-11・汎用文へ巻き戻さない）',
    fn: () => {
      assert(
        DEFAULT_ILLUSTRATION_CAPTION ===
          '※画像は記事内容をもとに生成したイメージです。実際の商品・展示作品・会場とは異なります。',
        `既定文: ${DEFAULT_ILLUSTRATION_CAPTION}`,
      )
      assert((DEFAULT_ILLUSTRATION_CAPTION as string) !== (HERO_IMAGE_CAPTION as string), '旧・汎用文と別物であること')
      assert(!DEFAULT_ILLUSTRATION_CAPTION.includes('商品・店舗'), '旧・汎用文（商品・店舗）へ巻き戻していない')
      assert(DEFAULT_ILLUSTRATION_CAPTION.includes('商品・展示作品・会場'), '商品記事も含む統一表現')
      assert(HERO_IMAGE_CAPTION.includes('商品・店舗'), '旧・汎用文は「商品・店舗」を含む（後方互換の確認）')
    },
  },
  {
    name: '修正2: extractIllustrationCaption — 記事固有の挿絵注釈を優先、無ければ null',
    fn: () => {
      const withCaption = [
        '本文。',
        '挿絵注釈',
        '※画像は記事内容をもとに生成したイメージです。実際の商品・展示作品・会場とは異なります。',
        '#銀座',
      ]
      assert(
        extractIllustrationCaption(withCaption) ===
          '※画像は記事内容をもとに生成したイメージです。実際の商品・展示作品・会場とは異なります。',
        `抽出結果: ${extractIllustrationCaption(withCaption)}`,
      )
      // 「※画像は記事内容をもとに生成した」で始まる行を直接拾う（見出しが無くても）
      const inlineOnly = ['本文。', '※画像は記事内容をもとに生成したイメージです。実際の作品とは異なります。']
      assert(extractIllustrationCaption(inlineOnly)?.startsWith('※画像は記事内容をもとに生成した'), '行頭一致で抽出')
      // 無ければ null（呼び出し側で DEFAULT にフォールバック）
      assert(extractIllustrationCaption(['本文だけ。', 'もう一段落。']) === null, '注釈なし→null')
    },
  },
  {
    name: '修正3: bodySourceUrls — 本文に載っている出典 URL だけを出現順・重複排除で返す',
    fn: () => {
      const body = [
        'GINZA TIME EDIT',
        '本文。詳細は下記。',
        '出典',
        'https://www.motoji.co.jp/blogs/events/sarasa202609',
        'https://www.motoji.co.jp/pages/shops',
        'https://www.motoji.co.jp/blogs/events/sarasa202609', // 重複
      ].join('\n\n')
      const urls = bodySourceUrls(body)
      assert(urls.length === 2, `件数: ${urls.length} (${urls.join(', ')})`)
      assert(urls[0] === 'https://www.motoji.co.jp/blogs/events/sarasa202609', `1件目: ${urls[0]}`)
      assert(urls[1] === 'https://www.motoji.co.jp/pages/shops', `2件目: ${urls[1]}`)
      // 本文に載っていない confirmed 社内確認用 URL（営業時間ページ）は返さない
      assert(!urls.some((u) => u.includes('information/openinghours')), '営業時間ページ URL が混入していない')
      // 末尾の句読点・括弧を URL に含めない
      assert(bodySourceUrls('参考（https://example.com/a）と、https://example.com/b。')[0] === 'https://example.com/a', 'カッコ除去')
      // URL の無い本文は空配列（呼び出し側が confirmedSourceUrls にフォールバックする）
      assert(bodySourceUrls('URLのない本文。段落2。').length === 0, 'URLなし→空配列')
    },
  },
  {
    name: '修正3: confirmedSourceUrls — confirmed だけ・重複排除・unconfirmed 除外',
    fn: () => {
      const prov = [
        { sourceUrl: 'https://www.motoji.co.jp/blogs/events/sarasa202609', verificationStatus: 'confirmed' },
        { sourceUrl: 'https://www.motoji.co.jp/pages/shops', verificationStatus: 'confirmed' },
        { sourceUrl: 'https://www.motoji.co.jp/pages/shops', verificationStatus: 'confirmed' }, // 重複
        { sourceUrl: 'https://gallery.shiseido.com/jp/exhibition/', verificationStatus: 'unconfirmed' }, // 除外
        { sourceUrl: 'https://example.com/x', verificationStatus: 'conflicting' }, // 除外
        { sourceUrl: 'https://example.com/y', verificationStatus: null }, // 明示 confirmed でない → 除外
        { sourceUrl: '', verificationStatus: 'confirmed' }, // 空URL → 除外
      ]
      const urls = confirmedSourceUrls(prov)
      assert(urls.length === 2, `件数: ${urls.length} (${urls.join(', ')})`)
      assert(urls[0] === 'https://www.motoji.co.jp/blogs/events/sarasa202609', `1件目: ${urls[0]}`)
      assert(urls[1] === 'https://www.motoji.co.jp/pages/shops', `2件目: ${urls[1]}`)
      assert(!urls.some((u) => u.includes('gallery.shiseido.com')), 'unconfirmed の 資生堂ギャラリー URL が除外されている')
    },
  },
  {
    // 2026-09-14追加：note用ハッシュタグは4個へ統一する（Editorial Style Engine・
    // マロン確定運用）。実データ（Article #66「松屋銀座しろたえ」）で生成時3個
    // だったケースの再発防止。
    name: 'padNoteHashtagsTo4：4個未満は汎用タグで補い、5個以上は先頭4個へ絞る',
    fn: () => {
      const three = padNoteHashtagsTo4(['#松屋銀座', '#しろたえ', '#レアチーズケーキ'])
      assert(three.length === 4, JSON.stringify(three))
      assert(three[3] === '#銀座', JSON.stringify(three))

      const four = padNoteHashtagsTo4(['#a', '#b', '#c', '#d'])
      assert(four.length === 4 && four.join(',') === '#a,#b,#c,#d', JSON.stringify(four))

      const five = padNoteHashtagsTo4(['#a', '#b', '#c', '#d', '#e'])
      assert(five.length === 4 && five.join(',') === '#a,#b,#c,#d', JSON.stringify(five))

      const zero = padNoteHashtagsTo4([])
      assert(zero.length === 2 && zero[0] === '#銀座' && zero[1] === '#GINZAWHISKERS', JSON.stringify(zero))

      const alreadyHasBrand = padNoteHashtagsTo4(['#GINZAWHISKERS'])
      assert(alreadyHasBrand.length === 2 && alreadyHasBrand[0] === '#GINZAWHISKERS' && alreadyHasBrand[1] === '#銀座', JSON.stringify(alreadyHasBrand))
    },
  },
]

export const suite = () => runSuite('noteDraftPackage', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
