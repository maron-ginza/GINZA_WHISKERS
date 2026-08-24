# Project 02 運用ランブック集（付録A〜F）

このファイルは `CLAUDE.md` の付録A〜Fをそのまま移設したものである。
2026-08-21、CLAUDE.mdの肥大化（150,000文字上限超過）を解消するための
分割作業で作成した。原文は `CLAUDE.md.backup-20260821.md`（分割前の
全文バックアップ）からそのまま転記しており、内容の要約・書き換えは
行っていない。

- 付録A：セットアップ手順
- 付録B：Phase 1実装状況（2026-07-21時点）
- 付録C：既知のプレースホルダー・要確認事項
- 付録D：スキーマ関連トラブルシューティング手順（2026-07-22の事例より）
- 付録E：Instagram Meta App Review 申請ランブック（2026-07-28作成）
- 付録F：本番インフラ構築ランブック（2026-07-29作成）

現行の仕様・方針は `CLAUDE.md` 本体を参照。本ファイルは手順書・
トラブルシューティング資料であり、頻繁に更新される現行ルールの
正本ではない。

---

# 付録

## 付録A：セットアップ手順

**CMS（`cms/` — Payload CMS）**

```bash
cd 02-discover-ginza-media-system/cms
npm install
cp .env.example .env   # DATABASE_URI / PAYLOAD_SECRET 等を設定
npm run generate:importmap
npm run generate:types
npm run dev             # http://localhost:3000/admin
```

Postgres（`DATABASE_URI`）への接続が必要。ローカルはDocker Postgres、
本番はRailwayを想定（`TECH_SELECTION_DRAFT.md` 3節）。

**フロントエンド（`site/` — Astro）**

```bash
cd 02-discover-ginza-media-system/site
npm install
cp .env.example .env    # PAYLOAD_API_URL を設定
npm run dev
npm run build           # astro check + astro build。DB未起動でも空データで
                         # ビルドが通ることをこのサンドボックス環境で確認済み
```

## 付録B：Phase 1実装状況（2026-07-21時点）

`create-payload-app` / `npm create astro` の対話式CLIが、このワークスペースの
開発サンドボックス環境（非TTY・Docker/Postgresなし）では起動できなかった
（`@clack/prompts`が`uv_tty_init`で失敗）ため、両プロジェクトともPayload/Astro
公式のテンプレート構成に基づき手動でファイルを作成した。

検証できたこと：
- `cms/`：`npm install`成功、`tsc --noEmit`が型エラーなしで通過
- `site/`：`npm install`成功、`astro build`が3ページ（`/`, `/ja/`, `/en/`）を
  実際に生成することを確認（CMS未起動時はfetchエラーを握りつぶし空表示する
  フォールバックも動作確認済み）

2026-07-22のPhase 2セッションで検証済み：
- Payload管理画面の実際の起動・ログイン・コレクションの保存
  （Tags→Sources→Articlesの順で実データ登録）
- `historicalPeriod`自動分類・`accessionNumber`自動採番フックの実際の動作
  （詳細は第12章の意思決定ログ、手順は付録D）

まだ未検証：
- Astroサイトからのライブ疎通（`fetchPublishedArticles`の実データ取得）
- `ImageAssets`のアップロード動作（R2未設定時のローカルディスクフォールバック）

実装済みファイル：
- `cms/src/collections/{Articles,Sources,ImageAssets,Tags,Users}.ts`
  （`CONTENT_MODEL.md`のフィールド定義に対応）
- `cms/src/payload.config.ts`（Postgresアダプタ、R2ストレージプラグイン、
  ja/en localization設定）
- `cms/src/lib/ai/`（Claude Sonnet 5をtool-use経由で呼び出す記事下書き生成、
  Block→Lexical変換）、`cms/src/endpoints/generateDraft.ts`
  （`POST /api/ai/generate-draft`）
- `cms/src/workers/{postToX,postToInstagram}.ts`（Instagram側はGraph APIの
  二段階呼び出しを実装済み、X側はOAuth署名が必要なため意図的に未実装スタブ）
- `site/`一式（`/ja/` `/en/`の台帳ページ骨格、Payload REST APIフェッチャー）

## 付録C：既知のプレースホルダー・要確認事項

- `postToX.ts`はスタブのまま（`twitter-api-v2`等の導入とOAuth認可実装が必要）
- `postToInstagram.ts`はMeta App Review通過・Instagramビジネスアカウント
  連携が完了するまで実際には送信できない
- Lexicalのノード形状（`cms/src/lib/ai/lexical.ts`）は実際のPayload管理画面で
  保存した内容と一度照合すること（バージョン依存のため）
- スラッグ整形（記号除去・ローマ字化）は`createDraftFromSource.ts`内でTODOの
  ままになっている
- Phase 9で`ImageAssets.ts`にHEIC→JPEG変換フックを実装。実機HEICファイル
  での検証は2026-07-29完了（Phase 13、第12章参照）

## 付録D：スキーマ関連トラブルシューティング手順（2026-07-22の事例より）

Payloadのコレクション定義を変更した際、管理画面で保存エラー（例：
「Something went wrong」）やPostgres側のenumエラーが出た場合の確認手順。

1. devサーバーのログで`caused by:`行を確認し、実際のPostgresエラー内容を
   特定する（例：`invalid input value for enum enum_articles_status: "approved"`）。
2. 該当テーブルのカラム定義を確認する。
   ```bash
   docker compose exec -T postgres psql -U discover_ginza -d discover_ginza -c "\d <table>"
   ```
   複数のカラムが同じenum型を指していないか確認する（指していれば
   フィールド名の命名衝突の疑い）。
3. enum型の実際の値一覧を、コレクション定義（`src/collections/*.ts`）の
   optionsと突き合わせる。
   ```sql
   SELECT enumlabel FROM pg_enum WHERE enumtypid = '<enum_type>'::regtype ORDER BY enumsortorder;
   ```
4. **既知の衝突パターン**：`versions: { drafts: true }`を有効にした
   コレクションで、カスタムフィールド名に`status`を使うと、Payloadが
   内部的に予約するバージョン管理用フィールド`_status`とPostgresの
   enum型名が衝突し、`_status`側の値セット（draft/published固定）しか
   反映されなくなる（2026-07-22にArticlesで実際に発生、詳細は第12章）。
   ステータス系フィールドは`status`そのものではなく`reviewStatus`等の
   別名にすることで回避する。
5. リネームなど破壊的なスキーマ変更を加えた場合、Payloadのdev push機構は
   既存カラム・enum型を安全に移行しない。ローカル検証環境であれば
   `docker compose down -v && docker compose up -d`でボリュームごと
   作り直すのが確実。本番（Railway想定）環境でのマイグレーション手順は
   未検討（第12章の未決事項）。
6. 管理画面上でフィールドが読み取り専用・入力不可に見えるなど、コード上の
   設定と実際の挙動が食い違う場合は、まずブラウザのハードリロード
   （Cmd+Shift+R）を試す。DBリセットやコレクション定義変更の直後は、
   管理画面JSバンドルとブラウザキャッシュの不整合が起きうる
   （2026-07-22のSlugフィールド入力不可事象はこれで解消した）。
7. **既存データを保持したまま`localized: true`を追加する場合**
   （2026-07-24、Phase 8のTags.name対応より）：このサンドボックス環境は
   非TTYのため、Payloadのdev push機構が要求する削除確認の対話プロンプト
   （`Accept warnings and push schema to database? (y/N)`）に応答できず、
   スキーマ変更が止まる。`docker compose down -v`によるボリューム全体
   リセットは可能だが、他の既存データ（記事本文・画像等）まで失う
   コストが大きい場合は、以下の手順で対象フィールドだけを手動移行できる。
   1. 既存の`localized: true`+`unique: true`なフィールドを持つ別
      コレクションの実際のテーブル定義を確認し、命名規則を把握する。
      ```bash
      docker compose exec -T postgres psql -U discover_ginza -d discover_ginza -c "\d <table>_locales"
      ```
      Payloadの規則：`<collection>_locales`テーブル（`id`・元フィールド名の
      列・`_locale`（`_locales` enum型）・`_parent_id`）、
      `<collection>_locales_locale_parent_id_unique`（`_locale, _parent_id`の
      複合UNIQUE）、`unique: true`も設定している場合は
      `<collection>_<field>_idx`（`<field>, _locale`のUNIQUE）。
   2. 上記と同じ形で新しい`<collection>_locales`テーブルを手動作成し、
      既存の値を`_locale = <defaultLocale>`として移送、その後に元テーブルの
      非localizedカラムを削除する（トランザクション内で実施）。
      ```sql
      BEGIN;
      CREATE TABLE tags_locales (
        id serial PRIMARY KEY,
        name character varying,
        _locale _locales NOT NULL,
        _parent_id integer NOT NULL
      );
      INSERT INTO tags_locales (name, _locale, _parent_id)
        SELECT name, 'ja', id FROM tags;
      ALTER TABLE tags DROP COLUMN name;
      ALTER TABLE tags_locales
        ADD CONSTRAINT tags_locales_parent_id_fk
        FOREIGN KEY (_parent_id) REFERENCES tags(id) ON DELETE CASCADE;
      CREATE UNIQUE INDEX tags_locales_locale_parent_id_unique
        ON tags_locales (_locale, _parent_id);
      CREATE UNIQUE INDEX tags_name_idx ON tags_locales (name, _locale);
      COMMIT;
      ```
   3. Payload devサーバーを再起動し、対話プロンプトが出ないこと
      （＝スキーマが完全一致していること）を確認する。
   本番（Railway想定）でも同種の破壊的スキーマ変更が必要になった場合、
   この手順を土台にできる（ただしRailway環境での実施・検証はまだ未実施、
   第12章の未決事項）。

## 付録E：Instagram Meta App Review 申請ランブック（2026-07-28作成）

*2026-07-28、10月ローンチのPhase実行計画（第9章）でInstagram投稿の
実運用化（Phase 15）を、外部審査のリードタイムを理由に最優先で着手する
方針とした。以下は実際に申請するための前提条件と手順。本ランブック自体の
作成はコード変更を伴わない。申請の実行にはMeta Developer／Business
Managerアカウントでの操作が必要なため、私（Claude）が代行することはできず、
ユーザー自身の対応が必要。*

**前提条件（申請前に揃える必要があるもの）**：
1. Meta Developerアカウント、および同一Business Manager配下のMetaアプリ
   （新規作成、またはPhase 1の`postToInstagram.ts`実装時に想定していた
   アプリがあればそれを利用）。
2. Instagram Business（またはCreator）アカウントを、Facebookページに
   連携済みであること。
3. **Meta Business Managerのビジネス確認（Business Verification）** ——
   これ自体も審査を要し、App Reviewとは別のリードタイムが発生しうる。
   未実施であれば、App Review申請と並行して早めに着手する。
4. **公開済みのプライバシーポリシーURL** ——Meta App Reviewの申請フォームで
   必須項目となる。**2026-07-29に解消済み**：02固有のプライバシーポリシー
   ページ（`/ja/privacy` `/en/privacy`）を実装した。本番ドメイン確定
   （Phase 12）後、実際に公開されたURLを申請フォームに入力する。

**申請の手順（概略）**：
1. Meta for Developers管理画面で対象アプリの「App Review」→
   「Permissions and Features」から、必要な権限を申請する
   （`instagram_basic`、`instagram_content_publish`、および連携に必要な
   `pages_show_list`／`pages_read_engagement`等）。
2. 各権限について、実際の利用方法を示すスクリーンキャスト（画面録画）と
   利用目的の説明文を提出する（`postToInstagram.ts`の二段階Graph API
   呼び出しフローを実演する想定）。
3. プライバシーポリシーURL、データ削除手順URL、アプリアイコン等の
   基本情報を入力する。
4. 審査に提出する。**審査期間は数日〜数週間と変動する**ため、Phase 15の
   実装完了を待たずに提出だけ先行させることが今回のPhase実行計画の意図。
5. 承認後、本番用の長期アクセストークン（long-lived access token）を
   取得し、`postToInstagram.ts`の環境変数に設定する。実装自体は
   Phase 1で完了済みのため、承認後は疎通確認のみで運用開始できる想定。

**未確認・要対応（2026-07-29時点）**：
- Meta Business Managerのビジネス確認が完了しているかどうか未確認。
- 02固有のプライバシーポリシーページは実装済み（2026-07-29、上記参照）。
  本番ドメイン`discover.ginzawhiskers.com`も確定済み（付録F）——実際に
  Cloudflare Pagesへデプロイし公開URLが到達可能になった時点で、その
  URLを申請フォームに入力する（デプロイ自体は付録F、まだ未実施）。
- 実際の申請提出・審査結果の待ち状況は、次回セッション以降、ユーザーからの
  報告を受けて第12章に記録する。

## 付録F：本番インフラ構築ランブック（2026-07-29作成）

*2026-07-29、Phase 12（本番インフラ）のドメイン・ホスティング方針を確定
した（第12章参照）。以下は実際に構築するための設計・手順。本ランブック
作成時点でコード側の対応（`site: 'https://discover.ginzawhiskers.com'`の
設定、canonical/hreflang/og:urlの絶対URL化）は完了済みだが、各サービスの
アカウント作成・実際の設定投入にはCloudflare／Railwayのダッシュボード
操作が必要なため、私（Claude）が代行することはできず、ユーザー自身の
対応が必要。*

**採用したドメイン方針**：サブドメイン方式。`ginzawhiskers.com`
（01が既に取得予定のドメイン、付録D参照）の配下に02用のサブドメインを
切る。独立ドメインの新規購入は行わない（比較検討は第12章の決定ログ参照）。

**構成**：

| コンポーネント | サービス | ドメイン |
|---|---|---|
| フロントエンド（`site/`） | Cloudflare Pages | `discover.ginzawhiskers.com` |
| バックエンド（`cms/`、Payload CMS） | Railway | `api.discover.ginzawhiskers.com` |
| 画像ストレージ | Cloudflare R2 | （任意）`images.discover.ginzawhiskers.com` |
| データベース | Railway Postgresプラグイン | （外部公開ドメイン不要） |

**手順（概略）**：

1. **Cloudflare Pages（フロントエンド）**
   - Cloudflare Pagesで新規プロジェクトを作成し、本リポジトリの
     `02-discover-ginza-media-system/site/`をビルド対象に設定する
     （ビルドコマンド`npm run build`、出力ディレクトリ`dist/`）。
   - ビルド時の環境変数`PAYLOAD_API_URL=https://api.discover.
     ginzawhiskers.com`を設定する。
   - カスタムドメインとして`discover.ginzawhiskers.com`を追加する。
2. **Railway（バックエンド＋Postgres）**
   - 新規プロジェクトを作成し、Postgresプラグインを追加する
     （Railwayは接続文字列を`DATABASE_URL`という変数名で自動発行する。
     `payload.config.ts`は2026-08-10のPreflightで`DATABASE_URI`→
     `DATABASE_URL`の順にフォールバックする実装へ変更済みのため、
     `cms`サービスの環境変数にPostgresプラグインの`DATABASE_URL`を
     参照させる形でそのまま設定してよい——変数名をリネームする必要はない）。
   - `02-discover-ginza-media-system/cms/`をサービスとしてデプロイする
     （`cms/railway.json`にbuild/start/healthcheck設定を用意済み、
     2026-08-10追加。Nixpacksビルダーがこれを自動的に読む）。
   - 環境変数を設定する：`PAYLOAD_SECRET`（新規生成の長いランダム文字列）、
     `R2_BUCKET`／`R2_ENDPOINT`／`R2_ACCESS_KEY_ID`／
     `R2_SECRET_ACCESS_KEY`（下記3）、`ANTHROPIC_API_KEY`、
     `IG_BUSINESS_ACCOUNT_ID`／`IG_PAGE_ACCESS_TOKEN`（Meta App Review
     承認後、付録E）、`X_API_BEARER_TOKEN`（Phase 15実装後）、
     **`TZ=Asia/Tokyo`**（2026-08-17追加。SOURCE LEDGER自動巡回
     ——`cms/src/lib/jobs/sourceLedgerCrawlTask.ts`——のcronスケジュール
     `0 6 * * *`はサーバープロセスのローカルタイムゾーンで評価されるため、
     未設定だとRailwayコンテナの既定タイムゾーン〈通常UTC〉基準になり
     実行時刻が6時間ずれる。ローカル開発機はAsia/Tokyoのため未設定でも
     正しく動くが、本番では明示設定が必須）。
   - カスタムドメインとして`api.discover.ginzawhiskers.com`を追加する。
   - **Cloudflare Pagesより先にRailwayをデプロイし、疎通確認まで済ませる
     こと**（2026-08-10のPreflightで確認：Astroの`getStaticPaths`が
     ビルド時にPayload APIへfetchするため、CMS未起動・未疎通の状態では
     `npm run build`が失敗する。付録Bに記載のローカル既知制約と同じ現象が
     本番ビルドでも起こりうる）。
3. **Cloudflare R2（画像ストレージ）**
   - **着手前に第13章「運用コスト方針」を確認すること**：無料枠内運用が
     原則であり、無料枠超過を防ぐ使用量監視の設計を伴った上でバケットを
     有効化する（2026-08-09追記、監視方法自体は未確定）。
   - バケットを新規作成する（例：`discover-ginza-images`）。
   - APIトークン（アクセスキーID・シークレットキー）を発行し、Railway側の
     環境変数に設定する。
   - パブリック配信用のカスタムドメイン（`images.discover.ginzawhiskers.
     com`）を設定するかは任意——設定しない場合はR2のデフォルト公開URLを
     使う。
4. **DNS（`ginzawhiskers.com`ゾーン）**

   | レコード | 種別 | 向き先 |
   |---|---|---|
   | `discover.ginzawhiskers.com` | CNAME | Cloudflare Pages |
   | `api.discover.ginzawhiskers.com` | CNAME | Railway |
   | `images.discover.ginzawhiskers.com`（任意） | CNAME | Cloudflare R2 |

   01のドメイン設定（付録D、Aレコード4件＋`www`のCNAME）とは独立した
   レコード追加のみで完結し、01側の設定に影響しない。

5. **本番スキーマ移行**：付録Dの「7. 既存データを保持したまま
   `localized: true`を追加する場合」の手動SQL手順をベースに、Railway
   Postgresへの接続情報を使い同様の手動移行を行う想定。本番では
   `docker compose down -v`のようなボリューム全リセットは実データ保護の
   観点から選択肢に入らないため、**手動SQLマイグレーションが本番での
   唯一の現実的な手段**になる見込み。実行前にRailway側のバックアップ
   機能（自動バックアップの有無・保持期間）を確認すること。
6. 完了後、第11章のチェックリスト該当項目にチェックを入れ、第12章に
   実施日と結果を記録する。

**未確認・要対応（2026-08-09更新）**：
- ~~Cloudflare Pages／Railwayのアカウント作成状況~~ → 解消。Cloudflare
  アカウントはドメイン取得（Registrar）時点で存在確認済み、Railway
  アカウントも新規作成・ログイン確認済み（第12章2026-08-09の決定ログ参照）。
- Railwayプロジェクト・PostgreSQLプラグインの作成は完了（空DB、テーブル
  未作成）。`DATABASE_URL`の自動発行も確認済み（値は未取得・未設定）。
  `cms/`のデプロイ・環境変数設定・カスタムドメイン追加は未実施。
- ~~Cloudflare Pagesプロジェクト・R2バケットは未着手。~~ →
  **2026-08-10、`wrangler`（OAuth再ログイン後）での読み取り専用確認で
  実態を確定**：Cloudflare Pagesプロジェクトは0件（`wrangler pages
  project list`が空リストを返却）。R2は**バケット作成以前に、アカウント
  レベルでR2自体が未有効化**（`wrangler r2 bucket list`が`Please enable
  R2 through the Cloudflare Dashboard`, code 10042で失敗）——付録F手順3
  「バケットを新規作成する」に進む前に、まずCloudflareダッシュボードで
  R2を有効化する工程が必要であることが判明した（第13章のコスト方針
  確認と合わせてユーザー側の対応が必要）。作成・変更・削除は一切行って
  いない（読み取り専用コマンドのみ実行）。
- Railway Postgresの自動バックアップ機能の有無・保持期間は引き続き未確認
  （Railway CLIは未インストールのため`wrangler`のような読み取り確認が
  できておらず、ダッシュボードでの目視確認が必要）。
- Cloudflareゾーン（`ginzawhiskers.com`）がDNSレコード追加に使える状態か
  どうかの明示確認はまだ行っていない（Registrar取得により自動追加されて
  いる可能性が高いが未検証。`wrangler`で読み取り可能なはずだが今回は
  Pages/R2の確認のみに限定したため未実施）。
- 以降の実際の構築作業は次回以降、ユーザーからの実施報告を受けて本章に
  記録する。

**Preflight（2026-08-10実施）**：外部アカウント作成・課金操作・DNS変更・
本番公開を一切行わない範囲で、次回の本番構築を最小限の人間操作で開始
できるようローカル側の準備を行った。

- **コード・設定変更**（いずれも非破壊、ローカル検証済み）：
  - `cms/src/payload.config.ts`：接続文字列を`DATABASE_URI`→
    `DATABASE_URL`の順にフォールバックするよう変更（上記手順2の背景）。
  - `cms/railway.json`：新規追加。builder=NIXPACKS、
    buildCommand=`npm run build`、startCommand=`npm run start`、
    healthcheckPath=`/api/articles`（匿名でも200を返す既存の公開エンド
    ポイントを流用、`./p2`のHealth Checkと同じ考え方）。
  - `site/package.json`：`engines.node >=20`を追加（`cms/package.json`
    は既に指定済みだったが`site/`側に抜けがあった。Cloudflare Pagesの
    Node自動検出のズレを防ぐ）。
  - `cms/.env.example`：上記`DATABASE_URL`フォールバックの注記を追加。
- **`./p2 preflight`コマンドを新設**：次回セッションはこれを実行するだけで、
  ①デプロイ関連ファイルの存在確認、②`cms/.env`・`site/.env`の必須環境変数
  「名前」の設定有無（値は一切表示・ログ出力しない）、③`railway`／
  `wrangler` CLIの検出と`wrangler whoami`による認証状態の読み取り専用確認
  （ログイン等の操作はコードから一切実行しない）、④`tsc --noEmit`・
  `astro check`のローカルビルド確認、を1コマンドで確認できる。
- **今回判明した事実**：
  - `wrangler` CLI（v4.118.0）はインストール済みで既存の認証トークンが
    存在するが、`wrangler whoami`が「Failed to automatically retrieve
    account IDs」で失敗する状態だった（権限不足または期限切れ）。
    再ログイン（`wrangler login`）はブラウザでのアカウント操作を伴うため
    今回は実行していない——次回ユーザー側の対応が必要。
  - `railway` CLIは未インストール。Railway側は現状ダッシュボード操作が
    前提（CLIを使う場合は別途インストール・ログインが必要）。
  - `site/`の`npm run build`（`astro check && astro build`）は、CMSが
    起動していない状態では`getStaticPaths`のfetchが失敗しビルドが通らない
    ことを実地確認した（付録Bに既存の既知制約として記載済みのものと同一
    現象。今回のコード変更が原因ではないことも、CMS起動状態でのビルド
    成功を別途確認し切り分け済み）。本番でも同じ制約が働くため、Railway
    デプロイ→疎通確認→Cloudflare Pagesビルド、の順序が重要（上記手順2に
    追記）。
- 実際のCloudflare Pages／R2プロジェクト作成、Railwayへの`cms`デプロイ、
  DNSレコード追加は、いずれも各サービスのアカウント操作が必要なため
  今回は行っていない（第12章の次アクションに引き続き記録）。

**Preflight フォローアップ（同日2026-08-10、追加セッション）**：
- ユーザーの依頼により`wrangler login`（OAuth）を実行し再認証に成功
  （アカウント：`your-email@example.com`）。ただし`~/.zshrc`が
  export する`CLOUDFLARE_API_TOKEN`（権限不足または期限切れ）がAPIトークン
  認証として優先されるため、`wrangler`を素の状態で呼ぶと再び認証エラーに
  戻る。以後の`wrangler`呼び出しはこのトークンをコマンド単位で
  unsetして回避する運用とした（`~/.zshrc`自体は変更していない——原因・
  用途不明の既存設定のため、ユーザーの判断を要する）。
- 上記の有効なOAuthセッションを使い、読み取り専用でCloudflareの実態を
  確認：**Cloudflare Pagesプロジェクトは0件**（`wrangler pages project
  list`）。**R2はバケット以前にアカウントレベルで未有効化**
  （`wrangler r2 bucket list`が`Please enable R2 through the Cloudflare
  Dashboard`, code 10042で失敗）——付録F手順3「バケットを新規作成する」
  より前に、まずダッシュボードでR2自体を有効化する工程が必要と判明した。
  作成・変更・削除は一切行っていない。
- 続けてユーザーの依頼により`railway` CLIを`npm install -g @railway/cli`
  でインストール（v5.35.0、ローカル環境の変更のみ）。ログイン・
  アカウント操作は行っていない（`~/.railway/`にはバージョン情報のみで
  認証情報は含まれない状態を確認済み）。
- `railway login`（OAuth）を試みたが、ブラウザでのサインインが5分以内に
  完了せずタイムアウトした。ユーザーからの指示によりこの時点で
  Railwayへのログイン・認証・Authorizeの試行を停止し、以後は行わない
  方針とした。`railway whoami`で未認証状態のままであることを確認済み。
  これにより**Railway側の実アカウント状態（プロジェクト・サービス・
  Postgresバックアップ設定等）は今回も確認できていない**——CLIは使える
  状態になったが認証情報がないため、次回ユーザー自身がブラウザで
  `railway login`を完了させるか、状態を教えてもらう必要がある。
- 上記に続き、ローカル環境のみで完結する範囲のPreflightを再実施：
  `cms/railway.json`のJSON構文検証、`tsc --noEmit`（既知の3件のみ）、
  `astro check`（0エラー）、CMS起動状態での`npm run build`（7ページ
  正常生成、Railway/Cloudflare未接続でも本番相当のビルドがローカルで
  再現できることを再確認）、`./p2 doctor`／`./p2 editorial`／`./p2 social`
  の回帰確認（Sources/Articles/SocialPostsの件数・内容とも前回セッション
  終了時点と完全一致、既存データへの変更なし）。Docker／PostgreSQL／
  Payload CMS／Astro devサーバーはいずれも検証後に`./p2 stop`で安全に
  終了済み。

