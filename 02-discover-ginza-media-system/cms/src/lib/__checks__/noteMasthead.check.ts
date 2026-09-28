// GINZA WHISKERS / Project 02 — note 冒頭マストヘッド（2026-09-10 恒久ルール）の回帰テスト。
//
//   ・固定文は一字一句不変
//   ・18 カテゴリーアイコンの網羅・一意
//   ・記事分類 → アイコンの決定的解決（確定できないときだけ needs_human）
//   ・stripMasthead で記事本文にマストヘッドを混入させない
//   ・composeNoteBodyWithMasthead は冒頭へ前置し、二重付与しない
//   ・polishArticleDraft がマストヘッド行を本文ブロックから除去する

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  NOTE_MASTHEAD_TEXT,
  CATEGORY_ICONS,
  resolveCategoryIcon,
  bodyHasMasthead,
  stripMasthead,
  composeNoteBodyWithMasthead,
  type CategoryCode,
} from '../note/noteMasthead'
import { polishArticleDraft } from '../template/polishArticleDraft'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const EXPECTED_MASTHEAD = [
  'GINZA TIME EDIT',
  'by GINZA WHISKERS',
  '',
  '400年の銀座を、今日の私へ。',
  '',
  '新しい店、季節の味、アート、舞台、街に残る小さな物語。銀座の過去、現在、未来を紡ぎながら、「今、この銀座に出会う理由」をGINZA WHISKERSの編集視点で届けます。',
  '',
  '次の銀ブラに、私だけの銀座時間を。',
].join('\n')

// 2026-09-11：SWEETS 追加により実質19値（呼称「18カテゴリー」は歴史的名称として維持）。
const ALL_18: CategoryCode[] = [
  'FOOD', 'CAFE', 'SWEETS', 'SHOPPING', 'ARCHITECTURE', 'ART', 'EVENT', 'NIGHT', 'MUSIC', 'BEAUTY',
  'HOTEL', 'WELLNESS', 'EXPERIENCE', 'GIFT', 'WORKSHOP', 'PHOTO', 'FAMILY', 'NIGHT_VIEW', 'RAINY_DAY',
]

// 【2026-09-24改訂】完成版8アイコン（primaryCategory8.ts）が実際に用意されたため、
// 「SWEETSだけFOODを流用」という暫定措置は解消した。代わりに、18(+RAINY_DAY)カテゴリーは
// 8分類へ意図的に束ねられており、同じ8分類グループに属するものだけがファイルを共有する
// （primaryCategory8.ts の CATEGORY_TO_PRIMARY_8 を正として、このテストでも同じ
// グルーピングを検証する——値は複製せず期待値としてここに書き写す）。
const PRIMARY_8_GROUP: Record<CategoryCode, string> = {
  SWEETS: 'SWEETS',
  FOOD: 'GOURMET',
  CAFE: 'GOURMET',
  NIGHT: 'GOURMET',
  SHOPPING: 'SHOPPING',
  GIFT: 'SHOPPING',
  ART: 'ART_CULTURE',
  ARCHITECTURE: 'ART_CULTURE',
  PHOTO: 'ART_CULTURE',
  NIGHT_VIEW: 'ART_CULTURE',
  MUSIC: 'MUSIC_STAGE',
  BEAUTY: 'BEAUTY_WELLNESS',
  WELLNESS: 'BEAUTY_WELLNESS',
  WORKSHOP: 'LEARNING_EXPERIENCE',
  EXPERIENCE: 'LEARNING_EXPERIENCE',
  FAMILY: 'LEARNING_EXPERIENCE',
  EVENT: 'SEASONAL',
  HOTEL: 'SEASONAL',
  RAINY_DAY: 'SEASONAL',
}

const cases: CheckCase[] = [
  {
    name: '固定マストヘッド文は指定どおり一字一句不変',
    fn: () => {
      assert(NOTE_MASTHEAD_TEXT === EXPECTED_MASTHEAD, `不一致:\n${JSON.stringify(NOTE_MASTHEAD_TEXT)}`)
      assert(NOTE_MASTHEAD_TEXT.startsWith('GINZA TIME EDIT\nby GINZA WHISKERS\n'), '冒頭2行')
      assert(NOTE_MASTHEAD_TEXT.endsWith('次の銀ブラに、私だけの銀座時間を。'), '末尾')
    },
  },
  {
    name: '18(+RAINY_DAY)カテゴリーアイコンをすべて持ち、同一8分類グループのみファイルを共有する（2026-09-24：完成版8アイコン反映）',
    fn: () => {
      const keys = Object.keys(CATEGORY_ICONS)
      assert(keys.length === ALL_18.length, `件数: ${keys.length}（期待 ${ALL_18.length}）`)
      for (const c of ALL_18) assert(!!CATEGORY_ICONS[c], `${c} が無い`)
      const fileToGroups = new Map<string, Set<string>>()
      for (const c of ALL_18) {
        const ic = CATEGORY_ICONS[c]
        assert(/^icon_[a-z_]+$/.test(ic.iconSlug), `slug 形式: ${ic.iconSlug}`)
        assert(/^\d{2}_[a-z_]+\.png$/.test(ic.iconFile), `file 形式: ${ic.iconFile}`)
        const group = PRIMARY_8_GROUP[c]
        if (!fileToGroups.has(ic.iconFile)) fileToGroups.set(ic.iconFile, new Set())
        fileToGroups.get(ic.iconFile)!.add(group)
      }
      // 1ファイルにつき8分類グループは必ず1つだけ（別グループが同じ画像を指していないこと）
      for (const [file, groups] of fileToGroups) {
        assert(groups.size === 1, `${file} が複数グループから参照されている: ${[...groups].join(',')}`)
      }
      assert(fileToGroups.size === 8, `使用ファイル数は8種のはず（実際 ${fileToGroups.size}）`)
      assert(CATEGORY_ICONS.SWEETS.iconFile === '01_sweets.png', `SWEETS専用アイコン: ${CATEGORY_ICONS.SWEETS.iconFile}`)
      assert(CATEGORY_ICONS.SWEETS.labelJa === 'スイーツ', `SWEETS labelJa: ${CATEGORY_ICONS.SWEETS.labelJa}`)
    },
  },
  {
    name: 'resolveCategoryIcon: 「更紗展」＋「銀座もとじ」→ ART / icon_art_culture / 04_art_culture.png（DC#549 / article 58 と同じ判定）',
    fn: () => {
      const r = resolveCategoryIcon({
        title: 'インドから世界へ。9月最後の週末、銀座で出会う『更紗展』',
        venue: '銀座もとじ 和染、男のきもの、オンラインショップ',
        pillarJa: '文化',
      })
      assert(r.status === 'resolved', `status: ${r.status}`)
      assert(r.category === 'ART' && r.iconSlug === 'icon_art_culture', `${r.category}/${r.iconSlug}`)
      assert(r.iconFile === '04_art_culture.png', `file: ${r.iconFile}`)
    },
  },
  {
    name: 'resolveCategoryIcon: 明記語で BEAUTY / CAFE / SHOPPING を確定',
    fn: () => {
      assert(resolveCategoryIcon({ title: '新作チークとリップが登場' }).category === 'BEAUTY', 'BEAUTY')
      assert(resolveCategoryIcon({ title: '銀座に新しい珈琲専門店がオープン' }).category === 'CAFE', 'CAFE')
      assert(resolveCategoryIcon({ title: 'デニムの POP UP STORE' }).category === 'SHOPPING', 'SHOPPING')
    },
  },
  {
    name: 'resolveCategoryIcon: 2026-09-11追加 SWEETS（アフタヌーンティー含む）は2026-09-24追加のSWEETS専用アイコンで解決',
    fn: () => {
      const r1 = resolveCategoryIcon({ title: '秋のアフタヌーンティー' })
      assert(r1.status === 'resolved' && r1.category === 'SWEETS', `アフタヌーンティー: ${JSON.stringify(r1)}`)
      assert(r1.iconFile === '01_sweets.png', `SWEETS専用アイコン: ${r1.iconFile}`)
      assert(r1.labelJa === 'スイーツ', `labelJa: ${r1.labelJa}`)

      const r2 = resolveCategoryIcon({ title: '新作パウンドケーキが登場' })
      assert(r2.category === 'SWEETS', `pound cake: ${r2.category}`)

      // 単なる飲食店情報はFOODのまま（SWEETSに寄せない）
      const r3 = resolveCategoryIcon({ title: '銀座グルメ ビストロ新規オープン' })
      assert(r3.category === 'FOOD', `bistro: ${r3.category}`)
    },
  },
  {
    name: 'resolveCategoryIcon: 明記語なし＋収蔵室のみ → pillar フォールバックで resolved',
    fn: () => {
      const r = resolveCategoryIcon({ title: '銀座の週末に', venue: '', pillarJa: '文化' })
      assert(r.status === 'resolved' && r.category === 'ART' && r.basis === 'pillar', `${r.status}/${r.category}/${r.basis}`)
      const r2 = resolveCategoryIcon({ title: 'とある一日', pillarJa: '建築' })
      assert(r2.category === 'ARCHITECTURE', `建築→${r2.category}`)
    },
  },
  {
    name: 'resolveCategoryIcon: どれも当たらなければ needs_human（推測で埋めない）',
    fn: () => {
      const r = resolveCategoryIcon({ title: 'こんにちは銀座', venue: '', pillarJa: '人物' })
      assert(r.status === 'needs_human', `status: ${r.status}`)
      assert(r.iconSlug === null && r.category === null, 'null のまま')
      assert(/マロン|指定|推測で埋めない/.test(r.reason), `reason: ${r.reason}`)
    },
  },
  {
    name: 'bodyHasMasthead / stripMasthead',
    fn: () => {
      assert(bodyHasMasthead(NOTE_MASTHEAD_TEXT) === true, '全文を検出')
      assert(bodyHasMasthead('ふつうの本文です。') === false, '通常本文は false')
      const withMh = `${NOTE_MASTHEAD_TEXT}\n\n本文の1段落目。\n\n本文の2段落目。`
      const stripped = stripMasthead(withMh)
      assert(!bodyHasMasthead(stripped), 'マストヘッドが消えている')
      assert(stripped.includes('本文の1段落目。') && stripped.includes('本文の2段落目。'), '本文は残る')
      assert(stripMasthead('ここは普通の文。') === 'ここは普通の文。', '無関係な文は不変')
    },
  },
  {
    name: 'composeNoteBodyWithMasthead: 冒頭へ前置し、本文にハッシュタグ行は入れない、二重付与しない',
    fn: () => {
      const out = composeNoteBodyWithMasthead(['見出し', '本文段落。'])
      assert(out.startsWith('GINZA TIME EDIT\nby GINZA WHISKERS'), `冒頭: ${out.slice(0, 30)}`)
      assert(out.includes('次の銀ブラに、私だけの銀座時間を。'), '固定文末尾')
      assert(out.includes('本文段落。'), '本文')
      assert(!/#[^\s#]/.test(out), `本文にハッシュタグを含まない: ${out}`)
      const mhCount = out.split('GINZA TIME EDIT').length - 1
      // 既にマストヘッドを含む入力なら二重付与しない
      const out2 = composeNoteBodyWithMasthead([NOTE_MASTHEAD_TEXT, '本文。'])
      assert(out2.split('GINZA TIME EDIT').length - 1 === 1, `二重付与: ${out2.split('GINZA TIME EDIT').length - 1}`)
      assert(mhCount === 1, `1回だけ: ${mhCount}`)
    },
  },
  {
    name: 'polishArticleDraft はマストヘッド行を CMS 本文ブロックから除去する',
    fn: () => {
      const res = polishArticleDraft(
        {
          titleCandidates: ['秋の銀座で更紗展'],
          blocks: [
            { type: 'paragraph', text: 'GINZA TIME EDIT' },
            { type: 'paragraph', text: 'by GINZA WHISKERS' },
            { type: 'paragraph', text: '次の銀ブラに、私だけの銀座時間を。' },
            { type: 'heading', text: '展示の見どころ' },
            { type: 'paragraph', text: '更紗は、インドを代表する染織品です。' },
          ],
          hashtags: ['#銀座', '#更紗'],
        },
        { sourceUrl: 'https://www.motoji.co.jp/blogs/events/sarasa202609', category: 'ART' },
      )
      const joined = res.blocks.map((b) => b.text ?? '').join('\n')
      assert(!bodyHasMasthead(joined), 'マストヘッド行が残っていない')
      assert(!joined.includes('GINZA TIME EDIT'), 'GINZA TIME EDIT 行が消えている')
      assert(joined.includes('展示の見どころ') && joined.includes('更紗は、インドを代表する'), '本文は残る')
    },
  },
]

export const suite = () => runSuite('noteMasthead', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
