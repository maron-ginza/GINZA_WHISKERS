// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：候補抽出の根本原因対応）
//
// DiscoveredContent.excerpt が「個別記事の本文」ではなく、サイト共通の
// ナビゲーション・ヘッダー・フッター・共通メニュー・関連記事・パンくずの
// 寄せ集めになっていないかを決定的に判定する。
//
// 【背景】classifySourcePageType（URL構造＋タイトル明記）は index/article を高精度で
// 判別できるが、ホスト別ルールが無い情報源や、article と誤判定される余地が残る場合、
// excerpt 自体がナビ文言のみで実際の本文情報が一切含まれないケースがある
// （2026-09-14 実データ調査で確認：GINZA OFFICIAL・SHISEIDO GALLERY 等、既存の
// 帝国ホテル向け NAV_RE/MENU_RE では捕捉できないサイト固有メニュー語の並びが
// 個別記事のexcerptを埋め尽くす事故）。この関数は excerpt を「情報源」として使わず、
// 「情報源として使うに値するか」だけを判定する（本文推測・欠落補完はしない）。
//
// 【安全条件】AIを使わない／HTMLを解釈・実行しない（渡された文字列のみを見る）／
// 判定材料が無ければ usable=true 側に倒す（過剰除外で正常候補を落とさない。
// 「除外する」と確信が持てるときだけ false を返す）。

export interface UsableBodyContentResult {
  usable: boolean
  reason: string
  /** ヒットしたナビ語（監査ログ用） */
  matchedTokens: string[]
}

// 銀座公式サイト・百貨店・美術館・ホテル系サイトで頻出する「共通メニュー語」。
// 個別記事の本文プローズにはまず出現しない短い名詞句のみを収録する
// （逆に「イベント」「開催」等の一般語は本文にも出るため含めない＝過剰除外を避ける）。
const NAV_MENU_TOKENS: RegExp[] = [
  /食べる\s*買う/, // GINZA OFFICIAL 系トップナビ
  /美と健康/,
  /大型専門店/,
  /百貨店・モール/,
  /タウンガイド・観光案内/,
  /バリアフリートイレ/,
  /喫煙所マップ/,
  /街歩きマップ/,
  /歩行者天国/,
  /銀ぶら百年/,
  /オンラインで楽しむ/, // 資生堂ギャラリー系トップナビ
  /360°VR/,
  /展示風景/,
  /アーティスト・トーク/,
  /来館のご案内/,
  /フロアガイド/,
  /開催中の展覧会/,
  /次回の展覧会/,
  /過去の展覧会/,
  /応募要項／応募用紙／会場図面/,
  /カタログなど出版物/,
  /展覧会カタログ/,
  /日本語\s*(?:ENGLISH|English|中文)/,
  /ホテルを選ぶ/,
  /チェックイン\s*チェックアウト/,
  /会社概要/,
  /採用情報/,
  /プライバシーポリシー/,
  /利用規約/,
  /サイトマップ/,
  /個人情報保護方針/,
  /特定商取引法/,
  /運営会社/,
  /関連記事/,
  /おすすめ記事/,
  /こちらもおすすめ/,
  /合わせて読みたい/,
  /新着記事一覧/,
  /ログイン/,
  /会員登録/,
  /マイページ/,
  /カートを見る/,
  /ショッピングカート/,
]

/**
 * excerpt の冒頭付近（デフォルト先頭400文字）を見て、共通メニュー語が
 * 一定数（既定4件）以上ヒットしたら「本文として使用できない」と判定する。
 * 1〜3件のヒットは正常な本文にサイト名等が混じっただけの可能性があるため
 * usable=true のまま（過剰除外しない）。
 */
export function hasUsableBodyContent(
  excerpt: string | null | undefined,
  opts: { headChars?: number; navTokenThreshold?: number } = {},
): UsableBodyContentResult {
  const headChars = opts.headChars ?? 400
  const threshold = opts.navTokenThreshold ?? 4

  // excerptが未取得・極端に短い場合は「汚染の証拠」ではなく「判定材料が無い」だけなので、
  // usable=true（除外しない）側に倒す——excerptが無くてもtitle/URLだけで個別記事として
  // 確定できる候補（既存 classifySourcePageType の設計）を過剰除外しないため。
  // 「本文が確認できないので除外する」と言えるのは、excerptが実在しナビ語で
  // 占められている等の積極的な証拠があるときだけ。
  const text = (excerpt ?? '').trim()
  if (text.length < 20) {
    return { usable: true, reason: 'excerptが未取得・短いため判定材料なし（除外の根拠にしない）', matchedTokens: [] }
  }

  const head = text.slice(0, headChars)
  const matched: string[] = []
  for (const re of NAV_MENU_TOKENS) {
    const m = head.match(re)
    if (m) matched.push(m[0])
  }

  if (matched.length >= threshold) {
    return {
      usable: false,
      reason: `本文冒頭${headChars}文字が共通メニュー・ナビゲーション語で占められ、個別記事の内容が確認できない（一致${matched.length}件: ${matched.slice(0, 6).join('／')}）`,
      matchedTokens: matched,
    }
  }

  // 円マーク・パイプ記号が異常に多い（一覧・価格表の断片が excerpt へ紛れ込んでいる）
  const yenCount = (head.match(/円/g) ?? []).length
  const pipeCount = (head.match(/\|/g) ?? []).length
  if (yenCount >= 3 || pipeCount >= 6) {
    return {
      usable: false,
      reason: `本文冒頭に「円」表記${yenCount}件・区切り記号「|」${pipeCount}件と多く、一覧ページの断片の可能性が高い`,
      matchedTokens: matched,
    }
  }

  return { usable: true, reason: '本文に共通メニュー語の過度な集中は無い', matchedTokens: matched }
}
