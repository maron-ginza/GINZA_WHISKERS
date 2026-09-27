// GINZA WHISKERS / Project 02 — extractStructuredDates の回帰テスト（2026-09-06）
//
// 根本改善：GINZA SIX 等の集約ページ（1ページに複数の商品・催事が並ぶ構成）で、
// Tier 3（本文ラベル「開催期間」等）が候補自身とは別の商品・催事の会期を
// 誤って拾う事故を防ぐ。ラベルの各出現位置について、直前 TITLE_PROXIMITY_WINDOW
// 文字以内に候補自身のタイトル（コア部分）が見つかる場合だけ採用し、
// 見つからなければ次の出現位置を試し、どの出現位置でも確認できなければ
// 抽出を諦める（null のまま＝推測しない）。
//
// DC#354・328・376・352（2026-09-06 実運用で「会期がbody_label由来・信頼度
// medium——別記事の会期を誤って拾っている疑い」と判定された4候補）の実際の
// タイトル・情報源を用いて、同種の集約ページ構造（GINZA SIX / GINZA OFFICIAL /
// 中央区観光協会）を再現する。実際に保存されている生HTMLそのものではなく、
// 各サイトの実観測パターン（同日に確認した DC#369/#370 の実excerptで見えた
// 「RECENT POSTS」的な別記事一覧の構成）に基づく再現である。
//
// あわせて DC#389・388（銀座 蔦屋書店の個別イベントページ、修正前から会期の
// 矛盾フラグが立っていなかった候補）が今回の変更で影響を受けない
// （＝自身の会期を変わらず正しく抽出できる）ことも確認する。

import { runSuite, reportAndExit, type CheckCase } from './../__checks__/_harness'
import { extractStructuredDates, coreTitleAnchor } from './extractStructuredDates'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${bodyHtml}</body></html>`
}

// GINZA SIX（ginza6.tokyo）のページ共通テンプレート（2026-09-05 に実際に取得した
// DC#369「花西子 FLORASIS」の excerpt をそのまま流用した、実観測のナビ・メニュー・
// カテゴリー一覧・RECENT POSTS 構成。productBlock だけを各候補の実際の商品情報に
// 差し替える——ナビ部分の分量（menu・カテゴリー一覧）が実際に400字を超えるため、
// 「別商品の会期を誤って拾わない」ことを実データに近い分量で検証できる。
function ginzaSixPage(titleCore: string, productBlock: string): string {
  return page(
    `${titleCore} – GINZA SIX | GSIX | ギンザ シックス | 銀座シックス`,
    `
    --> ${titleCore} – GINZA SIX | GSIX | ギンザ シックス | 銀座シックス -->
    日 日本語 English 简体中文 繁體中文 한국어 ホーム --> ニュース ショップガイド アート マガジン サービス 会員案内 施設案内 アクセス
    Welcome to GINZA SIX --> ホーム ニュース ショップガイド アート マガジン ポッドキャスト サービス 会員案内 施設案内 アクセス
    営業時間 お問い合わせ 会社概要 プレスルーム 利用規約 サイトマップ Instagram Instagram Facebook Twitter -->
    日本語 English 简体中文 繁體中文 한국어 HOME > ニュース > ${titleCore}
    <h1>${titleCore}</h1>
    ${productBlock}
    カテゴリー All Art Beauty Events Fashion Food Gallery Lifestyle Limited Edition Others Show Window The Pop Up
    Fashion Lifestyle Art Food More magazine (4) Events (86) Gallery (40) Limited Edition (39) Others (16)
    Show Window (50) The Pop Up (30) --> GINZA SIX カード さらに詳しく GINZA SIX アプリ さらに詳しく
    <h2>RECENT POSTS</h2>
    <p>Art 百世個展『めぐり はじまる』 銀座 蔦屋書店 銀座 蔦屋書店 SHARE LOUNGE 開催期間: 2026.08.28 - 2026.09.06</p>
    <p>Art UNO YOSHIHIKO個展「The Ghosts' Party」 銀座 蔦屋書店 銀座 蔦屋書店 SHARE LOUNGE 開催期間: 2026.09.11 - 2026.09.13</p>
    `,
  )
}

const cases: CheckCase[] = [
  {
    name: 'coreTitleAnchor：サイト名区切り（|）の前半のみを抽出する',
    fn: () => {
      assert(
        coreTitleAnchor('AMBUSH® x New Era® – GINZA SIX | GSIX | ギンザ シックス | 銀座シックス') === 'AMBUSH® x New Era®',
        `実際: ${coreTitleAnchor('AMBUSH® x New Era® – GINZA SIX | GSIX | ギンザ シックス | 銀座シックス')}`,
      )
    },
  },
  {
    name: 'coreTitleAnchor：短すぎるタイトルは null（誤マッチ防止）',
    fn: () => {
      assert(coreTitleAnchor('展') === null, '1文字はアンカーにしない')
      assert(coreTitleAnchor(null) === null, 'null入力もnull')
    },
  },
  {
    name: 'DC#354 再現：GINZA SIX集約ページ（実観測のナビ構成）で、自身に会期ラベルが無く、後続の別商品の「開催期間」を誤って拾わない',
    fn: () => {
      const html = ginzaSixPage(
        'ピーナッツコラボデザインのカシミアニットとスウェットシャツをリリース',
        `
        <p>PEANUTS Fashion GINZA</p>
        <p>スヌーピーをあしらったカシミアニットとスウェットシャツを発売中。</p>
        <p>価格：38,500円(税込)</p>
        <p>フロア: 2F</p>
        <p>2026.09.02 UP</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value === null, `別商品の会期を拾わない（実際: ${r.eventStartAt.value}）`)
      assert(r.eventEndAt.value === null, `別商品の会期を拾わない（実際: ${r.eventEndAt.value}）`)
    },
  },
  {
    name: 'DC#352 再現：GINZA SIX集約ページ（実観測のナビ構成）で、秋季限定パウンドケーキ自身に会期ラベルが無く、別商品の会期を拾わない',
    fn: () => {
      const html = ginzaSixPage(
        '【秋季限定】栗とはちみつのパウンドケーキ',
        `
        <p>Sweets GINZA</p>
        <p>栗とはちみつを使った秋季限定のパウンドケーキを発売中。</p>
        <p>価格：2,700円(税込)</p>
        <p>フロア: B1F</p>
        <p>2026.09.01 UP</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value === null, `別商品の会期を拾わない（実際: ${r.eventStartAt.value}）`)
      assert(r.eventEndAt.value === null, `別商品の会期を拾わない（実際: ${r.eventEndAt.value}）`)
    },
  },
  {
    name: 'DC#328 再現：GINZA OFFICIALのおすすめイベント一覧ページで、自身の直後にある会期だけを正しく採用する',
    fn: () => {
      const html = page(
        'アニメ天官賜福展 -天地流光- | おすすめイベント・新着情報 | 銀座のイベント情報 | GINZA OFFICIAL',
        `
        <h1>アニメ天官賜福展 -天地流光-</h1>
        <p>会場: 松屋銀座</p>
        <p>開催期間: 2026.09.06</p>
        <h2>他のおすすめイベント</h2>
        <p>銀茶会の茶席 作品募集 2026 開催期間: 2026.10.01 - 2026.10.31</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value !== null, `自身の直後の会期は採用できる（実際: ${r.eventStartAt.value}）`)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 8, 6)).toISOString(),
        `2026-09-06 を採用（実際: ${r.eventStartAt.value}）`,
      )
      assert(r.eventStartAt.confidence === 'medium', `body_label は medium のまま（実際: ${r.eventStartAt.confidence}）`)
      assert(
        r.eventStartAt.value !== new Date(Date.UTC(2026, 9, 1)).toISOString(),
        '別イベント（銀茶会）の10月開催期間を誤って採用していない',
      )
    },
  },
  {
    name: 'DC#376 再現：中央区観光協会の個別イベントページで、自身の会期を正しく採用する（会場不明でも会期は取れる）',
    fn: () => {
      const html = page(
        '第16回 中央区・銀座シャンソン＆ミュージックフェスティバル | 一般社団法人中央区観光協会',
        `
        <h1>第16回 中央区・銀座シャンソン＆ミュージックフェスティバル</h1>
        <p>会場: 東京ブロッサム 中央会館</p>
        <p>開催期間: 2026.09.27 - 2026.09.27</p>
        <p>料金: S席7,000円 A席6,000円</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value !== null, `自身の会期を採用できる（実際: ${r.eventStartAt.value}）`)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 8, 27)).toISOString(),
        `2026-09-27 を採用（実際: ${r.eventStartAt.value}）`,
      )
      assert(r.eventStartAt.confidence === 'medium', `body_label は medium のまま——正しくても自動推薦しない対象（実際: ${r.eventStartAt.confidence}）`)
    },
  },
  {
    name: 'DC#389 再現：銀座 蔦屋書店の個別イベントページ（自身の直後に会期）は今回の変更で影響を受けない',
    fn: () => {
      const html = page(
        '【トークイベント＆サイン本お渡し会】写真集「HAMLET」発売記念 八代目市川染五郎×中里唯馬トークイベント | イベント | 銀座 蔦屋書店',
        `
        <h1>【トークイベント＆サイン本お渡し会】写真集「HAMLET」発売記念</h1>
        <p>会場: 銀座 蔦屋書店 SHARE LOUNGE</p>
        <p>開催期間: 2026.10.20 - 2026.10.20</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value !== null, `自身の会期を採用できる（実際: ${r.eventStartAt.value}）`)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 9, 20)).toISOString(),
        `2026-10-20 を採用（実際: ${r.eventStartAt.value}）`,
      )
    },
  },
  {
    name: 'DC#388 再現：銀座 蔦屋書店の個別イベントページ（会期の範囲表記）は今回の変更で影響を受けない',
    fn: () => {
      const html = page(
        '【フェア】写真集「HAMLET」発売記念 八代目市川染五郎写真展 | イベント | 銀座 蔦屋書店',
        `
        <h1>【フェア】写真集「HAMLET」発売記念 八代目市川染五郎写真展</h1>
        <p>会場: 銀座 蔦屋書店</p>
        <p>開催期間: 2026.10.02 - 2026.10.25</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value !== null, `自身の会期を採用できる（実際: ${r.eventStartAt.value}）`)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 9, 2)).toISOString(),
        `開始日 2026-10-02（実際: ${r.eventStartAt.value}）`,
      )
      assert(
        r.eventEndAt.value === new Date(Date.UTC(2026, 9, 25)).toISOString(),
        `終了日 2026-10-25（実際: ${r.eventEndAt.value}）`,
      )
    },
  },
  {
    name: 'タイトルが取得できない（<title>なし）場合は従来どおり最初の出現位置を使う（後方互換）',
    fn: () => {
      const html = `<html><body><p>開催期間: 2026.09.10 - 2026.09.20</p></body></html>`
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value !== null, `titleAnchorが無くても従来どおり抽出する（実際: ${r.eventStartAt.value}）`)
    },
  },
  {
    name: '複数出現のうち2番目のラベルが自身のタイトル近傍なら、2番目を採用する（実データ相当の分量で、離れた1番目は誤って拾わない）',
    fn: () => {
      // <title> タグ自身も bodyText の探索対象に含まれる（先頭付近にタイトルが
      // 常に存在する）ため、「離れている」ことを正しく検証するには、1番目の
      // ラベルまでの距離が TITLE_PROXIMITY_WINDOW（400字）を十分に超える
      // 分量の本文が必要——実ページ相当のフィラー文で再現する。
      const filler = Array(6)
        .fill(
          '無関係な見出しナビゲーション項目 カテゴリー一覧 お知らせ 新着情報 会員案内 施設案内 アクセス 営業時間 お問い合わせ サイトマップ',
        )
        .join(' ')
      const html = page(
        '自分の企画展',
        `
        <p>${filler}</p>
        <p>他社イベント 開催期間: 2020.01.01 - 2020.01.10</p>
        <p>${filler}</p>
        <h1>自分の企画展</h1>
        <p>開催期間: 2026.11.01 - 2026.11.10</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 10, 1)).toISOString(),
        `2番目（自身近傍）の開始日を採用（実際: ${r.eventStartAt.value}）`,
      )
      assert(
        r.eventStartAt.value !== new Date(Date.UTC(2020, 0, 1)).toISOString(),
        '離れた無関係イベントの開始日を誤って採用していない',
      )
    },
  },
  // ─────────────────────────────────────────────────────────────────
  // 2026-09-27追加（マロン指示）：販売期間が本文に人が読める形で書かれている
  // のに構造化日付を一切取得できなかった実データ（パティスリー GIN NO MORI
  // 「秋限定┃栗とはちみつのパウンドケーキ」）を起点とした回帰テスト。
  // ─────────────────────────────────────────────────────────────────
  {
    name: 'GIN NO MORI実データ再現：「販売日:2026年8月29日(土)～2026年11月末頃」は開始日だけを採用し、終了日は推測せずnull（要確認）のまま',
    fn: () => {
      const html = page(
        '秋限定┃栗とはちみつのパウンドケーキ | パティスリー GIN NO MORI',
        `
        <h1>秋限定┃栗とはちみつのパウンドケーキ</h1>
        <p>栗とはちみつが織りなす、実りの秋感じる贅沢な味わい</p>
        ■商品概要
        栗とはちみつのパウンドケーキ
        販売日:2026年8月29日(土)～2026年11月末頃
        ※各店舗数量限定/完売次第終了
        販売店舗：恵那本店/銀座店/名古屋店/麻布台ヒルズ店/グランスタ東京店/グランフロント大阪店価格：2,138円(税込)
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 7, 29)).toISOString(),
        `開始日 2026-08-29 を採用（実際: ${r.eventStartAt.value}）`,
      )
      assert(r.eventStartAt.source === 'body_label', `販売日ラベルから採用（実際: ${r.eventStartAt.source}）`)
      assert(
        r.eventEndAt.value === null,
        `"11月末頃"は日番号を持たずDATE_TOKENに一致しないため、終了日を推測で確定しない（実際: ${r.eventEndAt.value}）`,
      )
    },
  },
  {
    name: '「発売日：2026年10月1日」のような終了日の概念が無い単発の発売日は、開始日のみ採用し終了日はnullのまま（推測しない）',
    fn: () => {
      const html = page(
        '新フレーバー登場 | Mr. CHEESECAKE',
        `
        <h1>新フレーバー登場</h1>
        <p>発売日：2026年10月1日（木）より常設ストアにて数量限定で販売します。</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 9, 1)).toISOString(),
        `開始日 2026-10-01 を採用（実際: ${r.eventStartAt.value}）`,
      )
      assert(r.eventEndAt.value === null, `発売日には終了日の概念が無いため null のまま（実際: ${r.eventEndAt.value}）`)
    },
  },
  {
    name: '「販売期間：2026年9月1日～2026年9月30日」のように終了日も明確な日付トークンで書かれている場合は、従来どおり範囲として両方採用する',
    fn: () => {
      const html = page(
        '9月限定商品 | サブレミシェル',
        `
        <h1>9月限定商品</h1>
        <p>販売期間：2026年9月1日～2026年9月30日</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 8, 1)).toISOString(),
        `開始日 2026-09-01（実際: ${r.eventStartAt.value}）`,
      )
      assert(
        r.eventEndAt.value === new Date(Date.UTC(2026, 8, 30)).toISOString(),
        `終了日が明確な日付なら従来どおり採用する（実際: ${r.eventEndAt.value}）`,
      )
    },
  },
  {
    name: '「販売期間」ラベルの近傍に日付トークンが一切無い場合は、開始日・終了日とも null のまま（推測しない）',
    fn: () => {
      const html = page(
        '販売期間未定商品 | ホレンディッシェ・カカオシュトゥーべ',
        `
        <h1>販売期間未定商品</h1>
        <p>販売期間：詳細は追ってお知らせいたします。</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value === null, `日付トークンが無ければ推測しない（実際: ${r.eventStartAt.value}）`)
      assert(r.eventEndAt.value === null, `日付トークンが無ければ推測しない（実際: ${r.eventEndAt.value}）`)
    },
  },
  {
    name: '「開催期間」ラベルが既に会期を確定できている場合は、後続の「販売期間」ラベルで上書きしない（優先度・既存挙動を維持）',
    fn: () => {
      const html = page(
        '展覧会と限定グッズ販売 | 銀座 蔦屋書店',
        `
        <h1>展覧会と限定グッズ販売</h1>
        <p>開催期間: 2026.10.02 - 2026.10.25</p>
        <p>販売期間：2026年10月2日～2026年11月末頃</p>
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 9, 2)).toISOString(),
        `開催期間ラベルの開始日を優先（実際: ${r.eventStartAt.value}）`,
      )
      assert(
        r.eventEndAt.value === new Date(Date.UTC(2026, 9, 25)).toISOString(),
        `開催期間ラベルの終了日を優先——販売期間ラベルで上書きしない（実際: ${r.eventEndAt.value}）`,
      )
    },
  },
  {
    name: 'Mr. CHEESECAKE実データ再現：ラベルの無い自然文「2026年10月1日（木）より…販売開始します」から発売日を採用し、終了日は概念が無いためnullのまま',
    fn: () => {
      const html = page(
        '【プレスリリース】新フレーバー登場 | Mr. CHEESECAKE',
        `
        2026.09.25
        【プレスリリース】発売半年で累計販売数20万個を突破したひとくちチーズケーキ「CREAMY BAKED CHEESECAKE」から新フレーバー「Milk Tea」が登場！
        株式会社Mr. CHEESECAKEは、新フレーバー「Milk Tea」を開発しました。
        2026年10月1日（木）より「Milk Tea」と「Original（オリジナル）」の2種を楽しめるアソートを、国内の常設ストア5店舗で販売開始します。
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === new Date(Date.UTC(2026, 9, 1)).toISOString(),
        `発売日 2026-10-01 を採用（実際: ${r.eventStartAt.value}）`,
      )
      assert(
        r.eventStartAt.value !== new Date(Date.UTC(2026, 8, 25)).toISOString(),
        '記事投稿日（2026.09.25）や見出し中の"発売半年で"を誤って採用していない',
      )
      assert(r.eventEndAt.value === null, `発売には終了日の概念が無いため null のまま（実際: ${r.eventEndAt.value}）`)
    },
  },
  {
    name: '「発売半年で累計販売数20万個を突破」のような過去の実績言及（単独の"発売"）は、新規の発売告知として誤検出しない',
    fn: () => {
      const html = page(
        '実績のお知らせ | Mr. CHEESECAKE',
        `
        2026.09.25 発売半年で累計販売数20万個を突破したチーズケーキについてのお知らせです。
        `,
      )
      const r = extractStructuredDates(html)
      assert(
        r.eventStartAt.value === null,
        `単独の"発売"（複合語でない）への隣接では採用しない（実際: ${r.eventStartAt.value}）`,
      )
    },
  },
  {
    name: '配送遅延等の事務告知ページ（日付＋無関係な文脈）では、Tier 3cが誤って発売日を作り出さない',
    fn: () => {
      const html = page(
        '大雨に伴うお荷物のお届けへの影響について | beillevaire',
        `
        2025/09/04
        大雨に伴うお荷物のお届けへの影響について
        大雨の影響により、一部地域でお届けに遅延が発生しております。ご了承ください。
        `,
      )
      const r = extractStructuredDates(html)
      assert(r.eventStartAt.value === null, `事務告知の日付を発売日として誤採用しない（実際: ${r.eventStartAt.value}）`)
    },
  },
]

export const suite = () => runSuite('extractStructuredDates', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
