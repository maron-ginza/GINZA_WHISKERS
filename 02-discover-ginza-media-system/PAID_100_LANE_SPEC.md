# 100円note記事レーン 仕様（Project 02・2026-09-10）

10月運用に、100円 note 記事の**別レーン**を追加する。通常投稿（無料・1日3本）
とは完全に別枠で、**無料記事・収集済み Facts・既存候補を再利用**して追加調査と
手作業を最小化する。本仕様は `GINZA_JOHOKYOKU_SPEC.md`（① 旬の銀座／② 売れる
テーマ × 銀座、300円「私だけの銀座時間」等）を置き換えるものではなく、その上に
**再利用駆動の 100円レーンを1本追加する**もの。

---

## 1. 2レーンの本数

### 無料記事（通常投稿）

- Project 02 の通常投稿は **1日3本**、**月 約90本**。
- **18カテゴリー配分の集計対象**（`assessInboxPool` の category_diversity /
  venue_diversity 履歴、および週単位のカテゴリー補正）。
- すべて無料公開。
- **既存の1日3本実装は変更しない**（`./p2 draft-today` 等）。本レーン追加は
  無料側のコードに一切手を入れない。

### 100円記事（別レーン）

- 通常の1日3本とは **完全に別枠**。
- **週2本、月 8〜9本を初期目標**。公開目安は **水曜・土曜**（運用ガイド。
  コマンドは曜日を強制しない）。
- **通常記事の投稿数・カテゴリー配分・会場重複判定には加算しない**。
  - 構造的に加算されない：無料側の集計・重複判定はすべて
    `discovered-content`（`curationStatus=approved`）を対象にしており、
    100円レーンは DiscoveredContent を新規作成せず、`curationStatus` も
    変更しない（既存の無料記事を再利用するだけ）。
  - DB 上の識別：`Articles.lane`（`free` / `paid_100`）。既定 `free`。
    Articles を対象にした将来の集計・表示は `lane != 'paid_100'` で通常記事を
    絞る。
- シリーズ第一弾：**「AIで叶える、わたしだけの銀座」**。
- 価格：**100円**（`Articles.priceYen`。初期 100。note 上の実価格設定は
  マロンが手動）。

---

## 2. 記事の構成（無料エリア／有料エリア）

| エリア | 内容 |
|---|---|
| 無料エリア | **課題・変化・結果の概要**（読んで「自分ごと」と分かる範囲。薄くして誘導しない） |
| 有料エリア | **具体的な手順／AIへの指示文（コピペ可）／候補の比較／確認方法／再利用可能なテンプレート** |

冒頭のマストヘッド（カテゴリーアイコン → 固定文「GINZA TIME EDIT …」→ 本文）は
`PAID_100`／`FREE` とも共通で、note 転記時に付与する（`buildNoteDraftPackage` /
`noteMasthead.ts`。本文には保存しない）。

---

## 3. 有料判定（必須条件）

- **読者が実際に再現できることを有料判定の必須条件にする**。
- **単なる施設紹介や一般検索で分かる情報だけの記事は有料候補にしない**。
- 決定的な判定（`proposePaid100Candidates`・AI なし）：
  - **再現できる行動の語**（回り方・選び方・比較・段取り・準備・組み合わせ・
    ルート・時間の使い方・予約 等）が本文にある → OK。
  - または **比較できる候補が2件以上**（会場・料金・日程などの Fact）→ OK。
  - **告知・施設紹介だけ**（オープン／発売／リニューアル 等）で上記が無い → NG。
  - **本文が短く（<300字）出典も無い** → NG（一般検索の範囲を超えられない）。

---

## 4. 自動化

### 4.1 候補提示（毎週）

```
./p2 paid100 propose
```

- 無料記事（`lane != paid_100`・published / approved / draft）＋その
  `editorialProvenance`（収集済み Facts）を再利用。
- 「AIで叶える、わたしだけの銀座」へ展開できる素材を抽出し、**最大3案だけ**を
  提示：**タイトル・無料部分（課題／変化／結果）・有料価値・再利用素材・
  制作見込み時間**。
- 再現性の必須条件を満たさないものは見送り（理由つき）。3案に満たなければ
  水増ししない。
- 読み取り専用。**AI・note・追加課金なし**。DB 書き込みなし。
- 出力：`.devlogs/paid100/<ISO週>/proposals.json`（gitignore 済み）。

### 4.2 選定後の下書き生成

```
./p2 paid100 draft <番号>     # マロンが選んだ 1〜3
```

- 選んだ1案から、再利用元記事＋Facts で **CMS 下書きを自動生成**：
  無料エリア（課題／変化／結果）＋有料エリア（手順／AI指示文／候補比較／
  確認方法／テンプレート）＋出典＋注意事項＋ハッシュタグ4個。
- 確定できない箇所は `[マロン具体化]` マーカーを残す（推測で断定しない）。
- 生成物：`Articles`（`lane='paid_100'`・`priceYen=100`・`reviewStatus='draft'`・
  `series.label='AIで叶える、わたしだけの銀座'`・出典は再利用元から引き継ぎ）。
- 既存の人間承認ゲート（`Articles.beforeChange`）は不変。同じ再利用元からの
  二重生成は `aiGeneratedBy` の `paid100 source=#<id>` で防ぐ。
- **note への自動ログイン・自動公開は実装しない**。マロンの最終承認後に
  note で公開し、有料設定・価格変更もマロンが手動で行う。

### 4.3 状況確認

```
./p2 paid100 status
```

- `lane='paid_100'` の記事一覧（id・reviewStatus・タイトル）と今週の提案数。
  読み取り専用。

---

## 5. DB

- **新規フィールド**（`Articles`。migration `20260910_120000_articles_paid_lane.ts`）：
  - `lane`：`enum('free','paid_100')`、既定 `free`（NOT NULL）。`_articles_v` にも
    `version_lane` を追加。
  - `priceYen`：`numeric`（paid_100 の想定価格）。`_articles_v` に
    `version_price_yen`。
  - **加算のみ・冪等**（`IF NOT EXISTS` / `DO` ガード）。既存 Article（#1〜#58）は
    全て `lane='free'` になるだけで挙動不変。
- 既存の `series`（label / editionNumber）を併用（シリーズ名の保持）。

---

## 6. 実装ファイル

| ファイル | 役割 |
|---|---|
| `cms/src/lib/paid100/types.ts` | 型・定数（`PAID100_SERIES_LABEL_V1` 等） |
| `cms/src/lib/paid100/proposePaid100Candidates.ts` | 候補提案（決定的・AI なし・再現性ゲート・最大3） |
| `cms/src/lib/paid100/buildPaid100Draft.ts` | 選定後の下書きスキャフォールド（決定的） |
| `cms/src/scripts/paid100.ts` | CLI（propose / draft / status） |
| `cms/src/collections/Articles.ts` | `lane` / `priceYen` フィールド |
| `cms/src/migrations/20260910_120000_articles_paid_lane.ts` | 本番用 migration |
| `cms/src/lib/__checks__/paid100.check.ts` | 回帰テスト |
| `scripts/project02` | `paid100)` dispatch（追記のみ・既存 case 無変更） |

---

## 7. 未確定・次工程

- 有料エリアの本文を AI で肉付けするか（現状は決定的スキャフォールド＋
  `[マロン具体化]`）。コスト方針（CLAUDE.md §13）の範囲で別途判断。
- 100円という価格・週2本という頻度・水/土という公開曜日は初期目標。
  購入率・満足度を見て 10〜12月に見直す（`GINZA_JOHOKYOKU_SPEC.md` §16 と
  同じ検証姿勢）。
- 公開後の反応（PV・スキ・購入・購入率）の記録は Performance Learning Layer と
  同様、現段階では追加 API 課金を要する自動取得を実装しない。
