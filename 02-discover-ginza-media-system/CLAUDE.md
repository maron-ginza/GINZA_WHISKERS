# GINZA WHISKERS — Discover GINZA Media System 開発憲章（Project 02）

このファイルは Project 02（Discover GINZA Media System）専用の開発憲章である。
ワークスペース全体の理念・PMO運用ルール・命名規則・ドキュメント基準・品質基準
は、リポジトリルートの `CLAUDE.md`（Root憲章）を参照すること。本ファイルは
Project 02固有の目的・仕様・優先順位・進捗のみを扱う。

このファイルの記述はデフォルトの振る舞いに優先する。内容は固定ではなく、
意思決定が起きるたびに更新していくべき「生きた文書」である。

---

## 0. この文書の位置づけ

- **扱う範囲**：Project 02固有の目的・コンテンツスコープ・デザイン方針・
  技術方針・優先順位・進捗ステータス。
- **扱わない範囲**：ワークスペース横断のビジョン・ブランド哲学の共通コア・
  命名規則・ドキュメント基準（→ Root CLAUDE.md）。ブランド理念の詳細本文
  （→ `00-shared-guidelines/`、現時点で未執筆）。
- 2026-07-20の要件定義セッションでの合意事項を土台に初版を策定する。

## 1. プロジェクトの目的

Discover GINZA Media System は、GINZA WHISKERSブランド傘下の**コンテンツ・
出版エンジン**である。01（ブランドサイト）がブランドの「顔」として最小限の
信頼性を伝える窓口であるのに対し、02は記事・ビジュアル・ニュースレター・
SNS配信を通じてブランドの物語を継続的に拡張・発信する実働の中心となる。

01は02への入り口としてリンクするが、コンテンツの厚みそのものは02側に
蓄積されていく。02はGINZA WHISKERSにとっての中心的な出版プラットフォーム
と位置づける。

## 2. Project 01・note.comとの関係性

- **01との関係**：01は02への窓口としてリンクする。02は実質的なコンテンツ
  アーカイブ・出版のハブとして機能する。
- **note.comとの関係**：note.comは廃止・移行の対象ではない。02と
  **並走する重要な外部発信チャネル**として維持する。両者は競合関係ではなく
  補完関係にある——note.comは既存読者へのリーチ、02はブランド自身が
  所有する中心的なプラットフォームという役割分担。
- note.comの段階的縮小・02への統合は、本憲章の現時点の方針としては
  **想定しない**。将来この方針を変える場合は、理由とともに第12章に
  意思決定として明記する。

## 3. コンテンツ・機能スコープ

02が扱う機能は以下の4本柱：

1. **長文記事**：6本柱（歴史・文化・アート・建築・人物・イベント）に
   紐づく記事アーカイブ。
2. **写真・ビジュアルギャラリー**：建築・人物・イベント記録などのビジュアル
   アーカイブ。
3. **ニュースレター・メール配信**：定期的なダイジェスト配信。
4. **AI支援SNS配信**：AIが下書き・素材の再構成を支援し、人間が承認して
   から配信する（詳細は第8章）。

**ビルド順序**：記事＋ギャラリーを先行して構築する。ニュースレター・SNS
配信は後続フェーズとする。この順序は本憲章の合意事項であり、変更する
場合は第12章に記録する。

## 4. ブランド哲学の適用

- Root憲章第2章の共通コア（昭和浪漫・6本柱）を02はそのまま継承する。
- 6本柱は02のコンテンツ分類の基本スキーマとして機能する（すべての記事・
  ギャラリーはいずれかの柱に接続する）。
- ブランドの事実関係（Root／`00`が定める内容）とは矛盾しない。トーンの
  適用は第5章（デザイン）・第8章（AI活用）で個別に定める。

## 5. デザイン方針（サブブランド）— 確定（2026-07-21）

- 02は01と**同一のデザインシステムを流用しない**。GINZA WHISKERSの
  傘下にありながら、独自のサブブランド的ビジュアルを持つ。
- **方向性の更新**：立ち上げ当初は「雑誌的・コンテンツ密度の高い見せ方」
  を想定していたが、2026-07-21のデザイン確認セッションを経て、
  「雑誌」ではなく**銀座の文化と季節の発見を収め続けるアーカイブ**という
  位置づけに更新した。号立て・特集ではなく、随時収蔵・随時公開を基本とする。
- **採用方向：台紙・アーカイブ**。3方向性（台紙・アーカイブ／夜の続章／
  現代のディスカバリー）を比較したうえで確定。暖色の台紙のような紙面に、
  銀座建築の緑青（copper patina）を単一アクセントとして用いる。
- **確定トークン**：
  - Ground（台紙）`#E7DED0` ／ Card（紙）`#F8F3E8`
  - Ink `#241F18` ／ Ink Muted `#786C58`
  - Accent（深い緑青）`#1F3F38` ／ Accent Tint（罫線用）`#4D7A70`
  - 見出し書体：Hiragino Mincho ProN 系（明朝）
  - 本文書体：Hiragino Kaku Gothic ProN 系（ゴシック）
  - 欧文・資料番号系の書体：Iowan Old Style ／ SF Mono
- **レイアウト思想**：「収蔵室（6本柱）」「年代から辿る」「台帳
  インデックス」の3層のブラウズ構造を持つ。写真は台紙が重なる層状表現、
  資料番号（例：`GW・1923・014`）、フォルダタブ等でアーカイブ資料としての
  質感を出す。数百〜数千件規模に増えても同じ構造のまま拡張できることを
  前提に設計する（詳細は `CONTENT_MODEL.md`）。
- Root第2章のトーン原則（上品・記録的・非扇動的）と矛盾しない。
- **今後の運用**：実装段階での細部のブラッシュアップは許容するが、
  本節のデザイン思想（アーカイブとしての位置づけ・確定トークン・3層
  ブラウズ構造）自体を変更する場合は、独立した意思決定として第12章に
  記録する。

## 6. 開発方針（技術アプローチ）— 確定（2026-07-21）

- 01の「ビルドツール・フレームワークなし」の原則は**02には適用しない**。
  記事アーカイブ・ギャラリー・ニュースレター・SNS連携という機能要件を
  踏まえ、CMS・バックエンド・フレームワークを採用する。
- **確定スタック**：
  - コンテンツ基盤：**Payload CMS**（自己ホスト・TypeScript・Postgres）。
    `CONTENT_MODEL.md`のスキーマをコレクション定義として実装し、下書き→
    レビュー→承認→公開のワークフロー・承認ログ・アクセス制御は標準機能を
    利用する（承認キュー・編集長レビューUIを自作しない）
  - フロントエンド：**Astro**（多言語ルーティング対応、静的出力中心）
  - ホスティング：バックエンド＝Railway、画像ストレージ＝Cloudflare R2、
    フロントエンド配信＝Cloudflare Pages
  - AI記事生成：Anthropic API（Claude）
  - 選定の経緯・比較検討は `TECH_SELECTION_DRAFT.md` を参照
- 自己ホスト・オープンソースのCMSを選んだ理由：「数十年続く文化アーカイブ」
  （第5章）という位置づけ上、データをSaaSベンダーに依存させたくないため。
  依存を増やす判断は「なぜ自前で持たないのか」を一言で説明できることを
  条件とする（Root憲章の思想を踏襲）。

## 7. 多言語方針

- 日本語・英語のバイリンガルで**立ち上げ時点から**対応する（01の
  「多言語対応は未定」とは異なる方針）。
- **翻訳ワークフロー・公開条件（2026-07-23確定、Phase 6）**：
  - 記事は日本語が原文であり、`reviewStatus`が`published`になった時点で
    日本語版は必ず完全な内容を持つ（既存のレビューフローがそのまま
    日本語の公開ゲートを兼ねる）。
  - 英語版の公開可否は独立した第二のゲート`translationStatus.en`
    （Articlesコレクションに既存、Phase 1から未使用のまま残っていた
    フィールド）で判定する。値は`not_started` / `in_progress` /
    `complete`の3値。**`complete`かつ`title`・`body`の英語値が実際に
    入力されている場合のみ**、英語版は「翻訳済み」として扱う（ステータス
    だけ完了にして本文を空のまま残すヒューマンエラーを防ぐ二重チェック）。
  - 翻訳の実施・完了判定は当面すべて人力（管理画面での手動入力・手動
    ステータス変更）とする。AI支援翻訳の要否は将来の検討事項とし、
    導入する場合も第8章の「AI下書き＋人間レビュー」の考え方を踏襲する
    （自動公開はしない）。
  - **公開条件のまとめ**：

    | `reviewStatus` | `translationStatus.en` | `/ja/` | `/en/` |
    |---|---|---|---|
    | published以外 | 任意 | 非表示 | 非表示 |
    | published | complete未満、または本文欠落 | 完全表示 | ページ自体は表示するが、タイトル・本文はプレースホルダー（「Translation in progress」等）に置き換え、サイレントな日本語フォールバックはしない |
    | published | complete かつ タイトル・本文が実在 | 完全表示 | 完全表示 |

  - **実装方針**：Payloadの`locale`パラメータには既定でロケール間
    フォールバックがあり（`localization.fallback`既定値`true`）、英語
    未翻訳のフィールドが日本語の値をそのまま返ってしまう問題があった
    （サイレントフォールバック、Phase 6着手時に発覚）。これを避けるため、
    フロントエンド（`site/src/lib/payload.ts`）はPayloadのフォールバック
    機構を一切使わず、常に`locale=all`でロケールごとの生値を取得し、
    上記の判定ロジックを自前で適用する方式にした。**スキーマ変更は
    行っていない**（既存の`translationStatus`フィールドと`locale=all`の
    組み合わせのみで実現）。
  - **URLスラッグの扱い**：`slug`もロケール別フィールドだが、翻訳完了
    判定とは独立して扱うことを承認済み。英語スラッグが未入力でも日本語
    スラッグをそのまま英語URLに流用する（`/en/articles/<ja-slug>`）。
    翻訳が未完了でもページ自体は存在させプレースホルダーを表示する、
    という上記の公開条件と整合させるための意図的な設計判断。
  - **タグ名のロケール対応（2026-07-24確定、Phase 8）**：`Tags.name`を
    `localized: true`にし、収蔵室（6本柱）・自由タグとも英語ラベルを
    個別に持てるようにした。ただしタグ名は記事本文のような編集対象コンテンツ
    ではなく固定語彙（収蔵室は6値固定）のため、記事本文・タイトルに適用した
    「サイレントフォールバック禁止」ポリシー（第7章上部）とは**あえて別方針**
    とし、英語名が未入力の場合は日本語名へサイレントにフォールバック表示する
    （タグチップが欠落・空欄になるより自然、との判断でユーザー承認済み）。
    収蔵室の固定6値バリデーション（`Tags.ts`の`beforeValidate`フック）も
    ロケール別（`PILLAR_NAMES.ja` / `PILLAR_NAMES.en`）に対応させた。

## 8. AI活用ポリシー（記事生成・SNS配信）

- **記事生成**：AIが情報収集内容をもとに構成案・本文下書きを生成し、
  人間が編集長として全文レビュー・修正を行ったうえで承認・公開する
  （**AI下書き＋人間全面レビュー**）。2026-07-20のMVPアーキテクチャ
  設計セッションで、従来SNS配信のみを対象としていた本章のAI活用方針を
  記事生成にも同様の考え方で拡張することを確定した。
- **SNS配信（note／X／Instagram）・ニュースレター**：AIの役割は
  **AI支援・人間承認**とする。AIが投稿文・素材の再構成案（本文と同時に
  生成するチャネル別ソーシャルコピー）を生成し、人間が内容を確認・
  承認したうえで配信する。**自動投稿（人間の確認を経ない配信）は
  行わない**。X・Instagramは承認後にAPI経由で送信するが、これは
  「人間承認後の自動送信」であり「自動投稿」には当たらない。noteは
  公式の投稿APIが存在しないため、人間が手動投稿する（詳細は
  `ARCHITECTURE_DRAFT.md`）。
- AI生成物（記事・SNS投稿とも）は、Root第2章のトーン原則（上品・
  記録的・非扇動的）に沿っているかを人間が確認する。
- 承認済みのAI生成コンテンツは、チャネルごとに作り直さずContent Asset
  Repositoryに構造化保存し、各チャネルがそこから再利用する（詳細は
  `ARCHITECTURE_DRAFT.md` 第2.4節）。
- 翻訳（第7章）へのAI活用可否は、翻訳ワークフロー自体が未決事項のため
  別途決定する。決定時は本章を改めて見直す。

## 9. 優先順位の考え方

- **02内部の優先順位**：記事＋ギャラリー（コアのコンテンツ基盤）を
  ニュースレター・SNS配信より先に構築する（第3章）。
- **ワークスペース横断の優先順位**：Root第5.3節のとおり、01（2026年10月
  公開）がワークスペース最優先である。02は01と並行して進めるが、
  リソース・注意が競合する場合は01を優先する。

## 10. PMOの運用

- Root第5章の一般原則（セッション開始時のプロジェクト明示、設計優先、
  意思決定の記録、セッション終了時の次アクション提案）を02にもそのまま
  適用する。
- Daily PMO表示のフォーマットは、当面01のフォーマットを流用する
  （進捗率の算出根拠となる公開前チェックリストが02にはまだ存在しない
  ため、第11章のチェックリストが具体化次第、算出方法を確定する）。

## 11. リリース前チェックリスト

*デザイン・技術選定が未確定のため、現時点ではカテゴリの器のみを用意する。
決定が進み次第、01第9章と同様の形式で具体的な項目を追記する。*

- **必須（公開ブロッカー）**：未定（デザイン・技術選定後に確定）
- **信頼性**：未定
- **発見可能性**：未定
- **インフラ**：未定
- **コンテンツ**：未定（記事・ギャラリーの最低掲載本数など）

## 12. 現在のステータス

- **フェーズ**：Phase 10（ギャラリー機能スコープ確定）完了——記事詳細
  ページ（Phase 4）・記事一覧カードデザイン刷新（Phase 5）・翻訳ワーク
  フロー確立（Phase 6）・SEOメタ対応（Phase 7）・タグ名ロケール対応
  （Phase 8）・HEIC対応（Phase 9）・ギャラリー機能スコープ確定
  （Phase 10）まで完了。**ギャラリーの実装自体は01公開後に先送り**
  （後述）
- **直近の意思決定**：
  - 2026-07-26: Phase 10としてギャラリー機能（第3章4本柱の2番目）の
    スコープを確定した（実装はまだ行わない、設計・意思決定のみのフェーズ）。
    **性格**：新規エンティティを作らず、既存`Article.images`（hero/inline/
    gallery役割）を記事横断で集約する閲覧ビューとする。単独の（記事に
    紐づかない）ビジュアル資料はスコープ外。**ブラウズ構造**：記事一覧と
    同じ3層（収蔵室・年代・台帳）を踏襲するが、`ImageAsset`自体は年代・
    収蔵室を持たないため画像が属する記事側の値を継承する方式とし、同一
    画像が複数記事から参照される場合の解決規則は実装時の未決事項として
    `CONTENT_MODEL.md`第7章に明記した。**MVPスコープ**：一覧グリッド＋
    個別画像詳細表示（`rights.requiresAttribution`に基づく権利者表記を
    含む）。**着手時期**：Root第5.3節のワークスペース横断優先順位に従い、
    01（2026年10月公開）を優先し、ギャラリーの実装フェーズは01公開後に
    先送りすることを確定した。詳細は`CONTENT_MODEL.md`第6章に反映。
  - 2026-07-26: Phase 9としてHEIC画像アップロードの恒久対応を実装した。
    **原因確認**：このプロジェクトの`sharp`ビルド（`sharp.format.heif`を
    実機確認）はHEIF入出力の対応が`fileSuffix: ['.avif']`/
    `alias: ['avif']`のみで、実際のiPhone撮影HEIC（HEVCコーデック）の
    デコードには非対応と判明（libvipsのプリビルドバイナリがpatentライセンス
    の都合でHEVCデコーダを含んでいないため）。さらにPayload本体の
    `canResizeImage()`/`isImage()`（`node_modules/payload/dist/uploads/
    canResizeImage.js`等）のホワイトリストにも`image/heic`/`image/heif`が
    含まれておらず、現状HEICアップロードはエラーにはならず**サイレントに
    リサイズされないまま原本だけ保存される**（`imageSizes`が生成されない）
    ことをソース確認した。
    **対応方針**：`heic-convert`（pure-JS、`libheif-js`のWASMビルド経由で
    HEVCデコードに対応）を追加し、`cms/src/collections/ImageAssets.ts`の
    `hooks.beforeOperation`でPayload標準のアップロード処理
    （`generateFileData`、Sharpのリサイズより前）が走る前にHEICを検出して
    JPEGへ変換する方式にした。Payloadのソース
    （`collections/operations/create.js`）を確認し、`beforeOperation`が
    `generateFileData`より確実に先に実行される順序であることを検証済み。
    HEIC判定は拡張子やクライアント送信の`mimetype`ではなく、`file-type`
    パッケージによる実バイト列（ftypボックスのブランド）判定を用いる
    （iOS/ブラウザ側で`mimetype`が不正確になるケースがあるため。同じHEIF
    コンテナだが既にsharpが扱えるAVIFは誤検出しないことも確認済み）。
    **保持される情報／不可避な変化**：ファイル名は拡張子を除く部分を保持し
    `.jpg`に置き換える（例：`IMG_1234.HEIC` → `IMG_1234.jpg`）。
    `rights`・`altText`・`pillars`等のCMS側メタデータフィールドは無変更。
    一方、デコード→JPEG再エンコードの過程でHEIC内部のEXIF（撮影日時・
    GPS位置情報・カメラ機種等）は失われる（`heic-convert`が使う
    `jpeg-js`エンコーダがEXIFセグメントを書き出さないため）。回転情報のみ
    `heic-decode`がデコード時に画素へ反映済みのため、見た目の向きのズレは
    生じない。
    **検証状況**：`tsc --noEmit`が新規エラーなしで通過（既存の
    `createDraftFromSource.ts`の3件は無関係の既知エラー、Phase 8以前から
    存在）。Payloadソースの追跡によるフック順序の確認、`file-type`による
    HEIC系ブランド（heic/heix/hevc/hevx/mif1/msf1）判定とAVIF除外の
    smokeテスト、`heic-convert`（WASM libheif）がこのサンドボックス環境で
    問題なくロードされ不正入力に対して正しくエラーを返すことは確認済み。
    **ただし実際のiPhone撮影HEICファイルを用いた管理画面での
    エンドツーエンドアップロード検証は未実施**（このサンドボックス環境に
    実機HEICのテストファイルが存在しないため）。次回、実ファイルでの検証が
    取れ次第この項目を更新する。
  - 2026-07-24: Phase 8として`Tags.name`をロケール別対応にした。
    `cms/src/collections/Tags.ts`の`name`フィールドに`localized: true`を
    追加し、収蔵室（固定6値）バリデーションの`beforeValidate`フックも
    `req.locale`に応じて`PILLAR_NAMES.ja`/`PILLAR_NAMES.en`のいずれかで
    判定するよう変更（英語ラベルは History / Culture / Art /
    Architecture / People / Events に確定）。**フォールバック方針**：
    記事本文とは異なりタグ名は固定語彙のため、英語名未入力時は日本語名へ
    サイレントにフォールバック表示する方針をユーザーに確認のうえ確定
    （第7章に詳細）。フロントエンドは`site/src/lib/payload.ts`の
    `ArticleRaw.pillars[].name`を`Localized<string>`型に変更し、
    `resolveSummary`内で`pillar.name[locale] || pillar.name.ja`により
    解決するようにした。
    **スキーマ変更の適用方法**：`name`フィールドへの`localized: true`追加は
    既存データ（タグ1件「歴史」）を伴う破壊的変更で、Payloadのdev
    push機構が対話式の削除確認プロンプト（`accept warnings and push
    schema? (y/N)`）を要求したが、このサンドボックス環境は非TTYのため
    対話入力ができず（付録Bに記載の`create-payload-app`と同種の制約）、
    かつPhase 2のような`docker compose down -v`によるボリューム全体リセット
    は既存記事データ（ヒーロー画像・ja/en本文入りのサンプル記事）を失う
    コストが大きいと判断し、今回は**手動SQLマイグレーション**で対応した。
    既存の`articles_locales`テーブル（`slug`が同じ`localized: true`+
    `unique: true`の組み合わせ）の実際の列・インデックス命名規則
    （`<table>_locales`テーブル、`_locale`/`_parent_id`列、
    `<table>_locales_locale_parent_id_unique`、`<table>_<field>_idx`）を
    確認したうえで`tags_locales`テーブルを手動作成・データ移送・旧
    `tags.name`列削除を行い、Payloadが期待する形と完全一致させることで、
    次回起動時に対話プロンプトなしでスキーマ検証を通過することを確認した。
    本番（Railway想定）でも同種の破壊的スキーマ変更時はこの手動移行手順が
    再利用できる（手順は付録Dに追記）。
    **検証**：管理画面でタグ「歴史」の英語名を`History`に設定 →
    サーバーログでPATCH確認 → `/en/`一覧・詳細ページとも「History」表示、
    `/ja/`は「歴史」のまま影響なしを確認。`astro check`・`astro build`
    とも無エラー。
  - 2026-07-24: Phase 7としてSEOメタ対応を実装した。`BaseLayout.astro`に
    `description`・`robots`・`canonicalPath`・`alternatePath`・`ogImage`の
    Propsを追加し、`<meta name="description">`・`<meta name="robots">`・
    `<link rel="canonical">`・`<link rel="alternate" hreflang="ja|en|
    x-default">`・OGPタグ（`og:type`/`og:title`/`og:description`/
    `og:locale`/`og:image`）を出力するようにした。`robots`は
    `index,follow` / `noindex,follow` / `noindex,nofollow`
    の3値から呼び出し側が選べる型（`RobotsDirective`）とし、用途を
    翻訳未完了ページのnoindexに限定しない汎用設計にした。記事詳細ページは
    `article.seo.metaTitle`/`metaDescription`が未入力の場合、本文冒頭を
    プレーンテキスト化したもの（`lexical.ts`に`lexicalToPlainText`を
    新規追加）→それも無ければ既定文へとフォールバックする。**翻訳未完了の
    英語記事（`isTranslated: false`）は`noindex,follow`を出す**——
    プレースホルダー本文しかないページを検索エンジンに索引させないための
    意図的な設計（ユーザー承認済み）。hreflang相互参照のため、`payload.ts`
    の`ArticleSummary`に`slugs: Record<Locale, string>`（ja/en両方の
    スラッグ）を追加し、追加フェッチなしで相手ロケールのURLを解決できる
    ようにした。本番ドメイン（Cloudflare Pages想定）が未確定のため、
    `canonical`・`hreflang`・`og:image`以外は当面サイトルート相対パスの
    まま（`og:image`はPayloadの絶対URLをそのまま使用）。ドメイン確定時に
    絶対URL化する対応が残課題（第12章未決事項に記載）。`astro check`・
    `astro build`とも無エラーで通過、ローカルの実データ
    （`ginza-4-chome-crossing`、ja/en両方翻訳済み）でメタタグ出力を
    curl・distファイルの両方で確認した。翻訳未完了記事でのnoindex出力は
    現在データセットに未翻訳記事が存在しないため実データでは未検証
    （ロジックはPhase 6で検証済みの`isTranslated`フラグをそのまま再利用す
    るのみで型チェックも通過済みのため、リスクは低いと判断）。
  - 2026-07-23: Phase 6として翻訳ワークフローを確立した。着手前の調査で、
    `payload.config.ts`の`localization`に`fallback: false`が未設定のため
    既定値`true`が適用され、英語未翻訳のフィールド（`title`・`body`・
    `seo.*`・`socialCopy.*`）がリクエスト時に日本語の値をそのまま返す
    サイレントフォールバックが発生していたことを特定（`curl`で
    `locale=en`と`locale=all`の応答差分を比較して確認）。設計案を
    ユーザーに提示し承認を得たうえで実装：`site/src/lib/payload.ts`を
    Payloadのフォールバック機構に依存しない方式へ全面書き換えし、常に
    `locale=all`でロケールごとの生値を取得、Phase 1から未使用のまま
    残っていた`translationStatus.en`フィールド（`not_started`/
    `in_progress`/`complete`）と実際のフィールド非空チェックの両方を
    満たす場合のみ「翻訳済み」とみなすロジックを自前実装した。未翻訳の
    記事は一覧・詳細ページとも表示はするが、タイトル・本文をプレース
    ホルダー（「Translation in progress」等）に置き換える。英語スラッグ
    未入力時は日本語スラッグをURLに流用する（翻訳完了判定とは独立）。
    **スキーマ変更は行っていない**。合わせて詳細ページの
    `getStaticPaths`をN+1フェッチ（`fetchArticleBySlug`を記事ごとに
    個別呼び出し）から一括フェッチ＋JS側解決（`fetchPublishedArticleDetails`）
    に整理した。管理画面で実際に英語のtitle/bodyを入力し
    `translationStatus.en`を`complete`に変更 → 一覧・詳細ページとも
    プレースホルダーから実翻訳表示に切り替わることを実地検証済み。
    詳細・公開条件表は第7章を参照。既知の残課題：`Tags.name`が
    ロケール別フィールドではないため、収蔵室タグ（例：「歴史」）は
    英語ページでも日本語表示のまま（対応する場合は`Tags.name`への
    `localized: true`追加が必要、未着手）。
  - 2026-07-23: Phase 5として記事一覧ページ（`/ja/` `/en/`）のデザインを
    改善した。単純なリンクリストから、カード型グリッドレイアウト
    （`repeat(auto-fill, minmax(260px, 1fr))`、640px以下で1カラムに
    折り返し）へ刷新。`ArticleSummary`型に`images`を追加し
    `payload.ts`の`getHeroImageUrl()`で各記事のヒーロー画像サムネイルを
    解決、未設定の記事はタイトル頭文字のモノグラムをプレースホルダー
    表示する。資料番号・年代表示用に、第5章で定義済みだが未実装だった
    書体トークン`--font-mono`（SF Mono／Iowan Old Style）を新規追加し、
    見出し・本文の書体も`Hiragino Mincho ProN`／`Hiragino Kaku Gothic
    ProN`（第5章の確定書体）へ是正した（Webフォールバックとして既存の
    Noto Serif/Sans JPを残置）。ライブAPIデータ（`GW・1923・001`）で
    表示確認済み。
  - 2026-07-23: Phase 4として記事詳細ページ（`/ja/articles/[slug]`
    `/en/articles/[slug]`）を実装した。`site/src/lib/lexical.ts`に
    PayloadのrichText（Lexical JSON）を最小限のHTMLへ変換するレンダラー
    を新規作成（見出し/段落/引用/リスト/リンク/文字装飾に対応、未対応の
    ノード種別は子要素を展開し内容を失わない設計）。`payload.ts`に
    `fetchArticleBySlug`・`resolveImageUrl`を追加。Astroの出力モードが
    `static`のため`[slug].astro`は`getStaticPaths()`が必須（devモードでも
    SSRフォールバックが無い）点に留意。画像URLはPayloadが相対パス
    （例：`/api/image-assets/file/...`）で返すため、`resolveImageUrl`で
    ビルド時の`PAYLOAD_API_URL`を基準に絶対URL化する処理を追加した。
  - 2026-07-23: 画像紐付けの確認中、ユーザーが「紐付け完了済み」と申告
    した内容が実際にはDBへ未保存だった事象が発生（該当記事の`updatedAt`
    が前日のまま、`/tmp/payload-dev.log`にPATCH/POSTが記録されていない
    ことで検出）。コード側の原因を推測して修正するのではなく、ユーザーに
    管理画面での再保存を依頼して解決した。今後、管理画面での保存有無を
    確認する際はサーバーログのPATCH/POST有無と`updatedAt`のタイムスタンプ
    を一次情報とする。
  - 2026-07-22: Phase 3としてAstro（`site/`）からPayload CMS REST APIへの
    ライブ疎通を実地検証した。着手前に`site/src/lib/payload.ts`の
    `fetchPublishedArticles`が旧フィールド名`status`のままクエリして
    いたことが発覚（Phase 2の`reviewStatus`リネームの反映漏れ）。
    `where[status][equals]`を`where[reviewStatus][equals]`に修正。
  - 2026-07-22: 上記修正後もAPIが匿名リクエストに対し全件`403 You are not
    allowed to perform this action`を返す事象が発生。原因はPayload 3.xの
    既定アクセス制御`defaultAccess = ({ req }) => Boolean(req.user)`——
    未ログインの匿名リクエストはデフォルトで全拒否という仕様であり、
    Articles/Tags/ImageAssetsのいずれにも`access`が明示されていなかった
    ため適用されていた（`node_modules/payload/dist/auth/defaultAccess.js`
    で確認）。ビルド時にAstroが未ログインでfetchする以上、これは静的サイト
    連携において必ず踏む設計判断点であり、単純なバグではなく方針決定が
    必要と判断しユーザーに確認した。
  - 2026-07-22: 匿名読み取りの公開方針を「published限定で開放」に決定
    （全面公開ではなく）。`Articles.ts`に
    `access.read: ({ req }) => req.user ? true : { reviewStatus: { equals:
    'published' } }`を追加し、匿名はpublished記事のみ、ログイン済み編集者は
    draft含む全件を閲覧可能とした。`Tags.ts`・`ImageAssets.ts`は機密性の
    ない付随データのため`access.read: () => true`で全面公開とした。この
    設計はRailway本番環境でも同一のまま踏襲する想定（本番用の`access`
    上書きは不要）。
  - 2026-07-22: 上記修正後、Docker Desktop／Postgres／Payload devサーバー
    ／Astro devサーバーを起動し、`http://localhost:4321/ja/`で実データ
    （「銀座四丁目交差点の変遷」、`GW・1923・001`）が一覧表示されることを
    確認した。本日のゴール「CMSの記事一覧がAstroで表示されること」を達成。
    記事詳細ページ（`/articles/[slug]`）は未実装のまま次回以降に持ち越し。
  - 2026-07-22: Phase 2としてローカル実行環境（Docker Desktop／Postgres
    コンテナ／Payload devサーバー）を構築し、管理画面からTags→Sources→
    Articlesの順でサンプルデータ登録を実地検証した。`historicalPeriod`
    自動分類（`representedYear: 1923` → `明治・大正`）・`accessionNumber`
    自動採番（`status`が`approved`に変わった際に`GW・1923・001`を採番）の
    両フックとも、実データ・実DBで動作することを確認した。
  - 2026-07-22: Articlesのカスタムフィールド`status`を`reviewStatus`に
    リネームした。原因はPayloadの`versions.drafts`機能が内部で予約する
    バージョン管理用フィールド`_status`（値はdraft/publishedの2値固定）と、
    こちらが定義した4値（draft/review/approved/published）のカスタム
    `status`フィールドが、Postgresのenum型命名時に同名`enum_articles_status`
    へ衝突し、`_status`側の2値しか反映されない状態になっていたため
    （`status`を`approved`に更新しようとして
    `invalid input value for enum enum_articles_status: "approved"`が
    発生し発覚）。`\d articles`で両カラムが同一enum型を指していることを
    確認して特定した。リネーム後は`enum_articles_review_status`（4値）と
    `enum_articles_status`（`_status`専用、2値）が独立した型として生成
    されることを確認済み。今後、`versions.drafts`を使うコレクションで
    ステータス系フィールドを追加する場合は、フィールド名を`status`その
    ものにせず`reviewStatus`等の別名にすることで同種の衝突を避ける
    （手順は付録D参照）。
  - 2026-07-22: 上記リネームは列・enum型の非互換な変更を伴うため、
    ローカルPostgresコンテナをボリュームごと削除・再作成した
    （`docker compose down -v` → `up -d`）。検証用のダミーデータ
    （Tags/Sources/Articles各1件、管理者アカウント）は破棄し、リセット後に
    作り直した。ローカル検証環境のみの対応であり、本番（Railway想定）での
    スキーマ移行手順は別途検討が必要（未決事項）。
  - 2026-07-22: Articles新規作成画面でSlugフィールドが読み取り専用・
    入力不可に見える事象が発生したが、コード上`slug`フィールドに
    `readOnly`・`disabled`・カスタムコンポーネントは設定されておらず、
    サーバーログにもエラーは無かった。DBリセット＋フィールド名変更に伴う
    管理画面JSバンドル更新後のブラウザ側キャッシュが原因と推測され、
    ハードリロード（Cmd+Shift+R）とドキュメントの再作成により解消し、
    Slug入力・Article保存とも正常動作を確認した。恒久的なコード修正は
    行っていない（＝再発時はまずブラウザキャッシュを疑う。付録D参照）。
  - 2026-07-20: Project 02の要件を定義。サイト＋配信システムの両輪、
    01は窓口・02が中心的出版プラットフォームという位置づけ、note.comは
    廃止せず並走する外部チャネルとして維持、と確定。
  - 2026-07-20: コンテンツスコープを4本柱（記事・ギャラリー・
    ニュースレター・AI支援SNS配信）に確定。ビルド順序は記事＋ギャラリー
    を先行、ニュースレター・SNSを後続フェーズとした。
  - 2026-07-20: ビジュアルは01と別のサブブランド的デザインとする方針を
    確定（詳細は別途デザインセッションで決定）。
  - 2026-07-20: 技術方針として、01と異なりCMS・バックエンド・
    フレームワークの採用を許容する方針を確定（具体的な技術選定は未定）。
  - 2026-07-20: 日英バイリンガルでの立ち上げを確定（翻訳ワークフローは
    未定）。
  - 2026-07-20: SNS配信のAI活用は「AI支援・人間承認」とし、自動投稿は
    行わない方針を確定。
  - 2026-07-20: ワークスペース優先順位（Root第5.3節）に従い、02は01と
    並行するが01優先という位置づけを確認。
  - 2026-07-21: MVPシステムアーキテクチャ設計セッションを実施し承認。
    AI編集部パイプライン（情報収集→AI記事下書き→編集長レビュー→承認
    キュー→Content Asset Repository→各チャネル配信）を確定。詳細は
    `ARCHITECTURE_DRAFT.md`。
  - 2026-07-21: 記事生成のAI活用ポリシーを「AI下書き＋人間が編集長として
    全面レビュー」に確定し、第8章に反映（従来SNS配信のみが対象だった
    AI活用ポリシーを記事生成にも拡張）。
  - 2026-07-21: Content Asset Repositoryを採用。承認済みコンテンツは
    チャネルごとに作り直さず構造化データとして一元管理し、02サイト・
    note・X・Instagram・ニュースレターが共通して参照する設計とした。
  - 2026-07-21: note投稿は公式APIが存在しないため、AIが下書き・画像
    パッケージを生成し人間が手動投稿する方式に確定。X・Instagramは
    承認後のAPI自動送信とする。
  - 2026-07-21: デザイン確認セッションを実施。3方向性（台紙・アーカイブ／
    夜の続章／現代のディスカバリー）を比較したうえで「台紙・アーカイブ」を
    選定し、余白拡大・アクセント深化・アーカイブ性強化の微調整を経て
    **正式採用として確定**。方向性の位置づけも「雑誌」から「銀座の文化と
    季節の発見を収め続けるアーカイブ」に更新した。詳細・確定トークンは
    第5章を参照。今後は実装段階の細部ブラッシュアップのみとし、デザイン
    思想自体は変更しない。
  - 2026-07-21: 技術選定セッションを実施し確定。コンテンツ基盤＝Payload
    CMS（自己ホスト）、フロントエンド＝Astro、ホスティング＝Railway／
    Cloudflare R2／Cloudflare Pages、AI記事生成＝Anthropic API。自己
    ホストを選んだ理由は、長期文化アーカイブという位置づけ上データを
    自前で所有するため。詳細は `TECH_SELECTION_DRAFT.md`。
  - 2026-07-21: Phase 1実装に着手。`create-payload-app`/`npm create astro`の
    対話式CLIが開発サンドボックス環境（非TTY）で起動できなかったため、
    公式テンプレート構成に基づき`cms/`（Payload：Articles/Sources/
    ImageAssets/Tags/Usersコレクション、Postgres＋R2アダプタ、ja/en
    localization）と`site/`（Astro：`/ja/` `/en/`台帳ページ骨格）を手動で
    作成。AI記事生成パイプラインの土台（Claude tool-use経由の下書き生成、
    `POST /api/ai/generate-draft`）とX/Instagram配信ワーカー（Instagram
    はGraph API二段階呼び出しを実装、Xは認可実装が必要なため意図的に
    未実装スタブ）も作成。`cms`は`tsc --noEmit`が無エラーで通過、`site`は
    `astro build`で実際に3ページ生成を確認（いずれもこのサンドボックス内で
    検証済み）。Docker Postgresでの実起動・管理画面疎通は未検証。詳細は
    付録A・B。
- **未決事項**：AI支援翻訳の要否、リリース前チェックリストの具体項目、
  02固有のDaily PMO進捗率算出方法、本番（Railway想定）環境での破壊的
  スキーマ変更のマイグレーション手順（ローカルはPhase 2でDBボリューム
  再作成、Phase 8で手動SQLマイグレーションの2通りの前例ができたが、
  本番Railway環境での実際の手順としてはまだ確定・検証していない）。
  本番ドメイン（Cloudflare Pages想定）確定後、`canonical`/`hreflang`を
  絶対URL化する対応（Phase 7、`astro.config.mjs`の`site`未設定が前提）。
  Phase 9のHEIC変換フックについて、実機（iPhone等）撮影のHEICファイルを
  用いた管理画面でのエンドツーエンドアップロード検証がまだ取れていない。
  ギャラリー機能（Phase 10でスコープ確定）における、複数記事から参照
  される同一画像アセットの年代・収蔵室の解決規則（実装フェーズで確定、
  `CONTENT_MODEL.md`第7章）。付録Cに実装レベルの既知の未完了事項を記載。
- **次のマイルストーン**：Phase 9のHEIC対応を実ファイルで最終検証する。
  ギャラリー機能の実装は01（2026年10月公開）後に着手する方針のため、
  当面の次のマイルストーンからは外れる（着手時期が来たら別フェーズとして
  計画する）。
- **最終更新日**：2026-07-26

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
- Phase 9で`ImageAssets.ts`にHEIC→JPEG変換フックを実装したが、実機HEIC
  ファイルでの管理画面アップロード検証は未実施（第12章参照）

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
