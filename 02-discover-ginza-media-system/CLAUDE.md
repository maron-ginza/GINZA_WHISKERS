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
出版エンジン**である。01（ブランドサイト）がブランドの世界観発信・ハブと
して機能するのに対し、02は**AI編集部として銀座の「旬」を毎日発信する
情報メディア**であり、記事・ビジュアル・ニュースレター・SNS配信・
note・収益化の中心となる実働の中心である。

01は02への入り口としてリンクするが、コンテンツの厚みそのものは02側に
蓄積されていく。02はGINZA WHISKERSにとっての中心的な出版プラットフォーム
と位置づける。

**ワークスペース内の位置づけ（2026-07-28 Project Charter改訂）**：02の
2026年10月ローンチは、ワークスペース全体の直近最優先事項である（Root
CLAUDE.md第1章・第5.3節参照。以前は01の10月公開が最優先とされていたが、
本改訂により01から02へ移った）。

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
- **ワークスペース横断の優先順位**：2026-07-28のProject Charter改訂により
  Root第5.3節が変更され、**02（2026年10月ローンチ）がワークスペース直近
  最優先**となった（従来は01優先。第12章参照）。01は自身の残タスクを
  並行して進めるが、リソース・注意が競合する場合は02を優先する。
- **10月ローンチに向けたPhase実行計画（2026-07-28確定。次回以降のPMOは
  これを基準に進める）**：

  | Phase | 内容 | 優先度 |
  |---|---|---|
  | 11 | リリース前チェックリストの具体化 | 完了（本節・第11章） |
  | 12 | 本番インフラ確定（ドメイン／Railway／Cloudflare Pages／本番スキーマ移行手順） | **設計完了（2026-07-29）、実際の構築作業が残る** |
  | 13 | Phase 9 HEIC対応の実機エンドツーエンド検証 | **最優先** |
  | 14 | コンテンツ制作の本格開始（AI編集部パイプライン実運用） | Phase 12・13の後 |
  | 15 | SNS配信の本実装（Instagram App Review／X OAuth） | Instagram側はリードタイムを理由に**申請だけ先行着手**（付録E参照） |
  | 16 | ニュースレター機能 | 後続フェーズ（未着手） |
  | 17 | ギャラリー実装 | **予定どおり後続フェーズとして先送り**。実装タイミングは02の進捗を見て再判断する（スケジュール自体は今回変更しない） |

  Phase 12・13を最優先とする理由：Phase 12（本番インフラ）は実際に公開
  するための必須前提、Phase 13（HEIC実機検証）はPhase 14のコンテンツ量産
  前に画像パイプラインの信頼性を確認しておく必要があるため。Instagram
  Meta App Reviewはリードタイムが長い外部審査のため、実装の順番とは
  切り離して**今すぐ申請の前提整備に着手する**（詳細・前提条件は付録E）。

## 10. PMOの運用

- Root第5章の一般原則（セッション開始時のプロジェクト明示、設計優先、
  意思決定の記録、セッション終了時の次アクション提案）を02にもそのまま
  適用する。
- **Executive PMOフォーマット（2026-07-29確定）**：技術進捗だけでなく
  10月収益化までの全体像を可視化するため、以下5点を標準フォーマットと
  する。
  1. 現在地（全体進捗率／現在のPhase／現在取り組んでいる工程／次に
     着手する工程）
  2. Phase一覧（Phase 1〜17、目的・完了条件・現状・完了率）
  3. 4カテゴリ管理（①システム開発 ②コンテンツ設計 ③デザイン
     ④運用・収益化、各カテゴリの現在地・完了率・残タスク）
  4. ロードマップ（7月〜10月、ガントチャート形式）
  5. 次アクション提案（Root第5.6節に基づく）
- 全体進捗率の算出根拠は第11章のリリース前チェックリスト（必須・
  信頼性・発見可能性・コンテンツの4区分、後続フェーズは母数に含めない）
  とする。
- 4カテゴリの完了率は各カテゴリに属するPhase・タスクの状況からPMO
  実施者が都度見積もる目安値とし、チェックリストのような厳密な二値
  判定ではないことに留意する。

## 11. リリース前チェックリスト

*2026-07-28、デザイン・技術選定が確定済み（第5〜6章）であることを踏まえ、
01第9章と同様の形式で具体的な項目を初めて定義した。10月ローンチに向けて、
以下がすべて解消されている状態を「公開可能」の基準とする。*

**必須（公開ブロッカー）**
- [x] 本番ドメイン・ホスティングの**方針決定**（Phase 12。サブドメイン方式、
      `discover.ginzawhiskers.com`。2026-07-29確定、詳細は付録F）
- [ ] 上記方針に基づく**実際の構築**（Cloudflare Pagesプロジェクト作成、
      Railwayサービス作成、Cloudflare R2バケット作成、DNSレコード追加。
      Phase 12。手順は付録F、いずれも各サービスのアカウント操作が必要な
      ためユーザー側での実施が必要）
- [ ] 本番Postgres環境の構築＋スキーマ移行手順の本番検証（Phase 12。
      現状ローカルDocker環境での2通りの前例のみで、本番環境では未検証。
      手順の設計は付録F参照）
- [x] Phase 9 HEIC対応の実機（iPhone等）エンドツーエンドアップロード検証（Phase 13。
      2026-07-29完了、詳細は第12章）

**信頼性**
- [x] 02固有のプライバシーポリシーページ（`/ja/privacy` `/en/privacy`）を
      実装済み（2026-07-29。Instagram App Review申請の前提条件を解消）
- [ ] Instagram Meta App Reviewの申請（Phase 15。リードタイムを考慮し
      最優先で着手。プライバシーポリシーURLの前提条件は解消済み——残るは
      Business Verification状況の確認と実際の申請提出、詳細は付録E）
- [ ] X（Twitter）投稿のOAuth実装（`postToX.ts`、Phase 15）

**発見可能性**
- [x] canonical／hreflang／og:urlの絶対URL化（Phase 7の残課題。
      2026-07-29、ドメイン確定を受けて対応完了。詳細は付録F）

**インフラ**
- （本番インフラの内容は上記「必須」に集約。現時点で追加項目なし）

**コンテンツ**
- [ ] 「毎日発信」運用に足る記事の蓄積開始（Phase 14。最低掲載本数の
      基準は今後確定）

**後続フェーズ（10月ローンチの必須条件ではない）**
- ニュースレター機能（Phase 16、未着手）
- ギャラリー機能の実装（Phase 17。スコープは確定済みだが、実装タイミングは
  02の進捗を見て再判断——2026-07-28、スケジュール変更なしを確認済み）

## 12. 現在のステータス

- **フェーズ**：Phase 10（ギャラリー機能スコープ確定）完了——記事詳細
  ページ（Phase 4）・記事一覧カードデザイン刷新（Phase 5）・翻訳ワーク
  フロー確立（Phase 6）・SEOメタ対応（Phase 7）・タグ名ロケール対応
  （Phase 8）・HEIC対応（Phase 9）・ギャラリー機能スコープ確定
  （Phase 10）まで完了。**ギャラリーの実装自体は01公開後に先送り**
  （後述）
- **直近の意思決定**：
  - 2026-07-29: 02のPMO運用フォーマットを「Executive PMO」形式に刷新した
    （ユーザー依頼、第10章に反映）。従来のDaily PMO（01フォーマットの
    流用）に代えて、①現在地②Phase一覧（Phase 1〜17）③4カテゴリ管理
    （システム開発／コンテンツ設計／デザイン／運用・収益化）④7〜10月
    ロードマップ（ガントチャート形式）⑤次アクション提案、の5点構成を
    今後の標準とする。**副産物として判明した重要なギャップ**：④運用・
    収益化カテゴリの整理中に、収益化の具体的な方法（広告／アフィリエイト
    ／有料会員等）自体が本CLAUDE.mdにまだ一度も明記されていないことが
    判明した。10月ローンチまでに意思決定が必要な未決事項として扱う
    （本項目下部の未決事項欄には未収録のため、次回PMOで正式に追加する）。
    なお初回提示はHTML Artifactとして作成したが、Safari上で空白表示になる
    不具合が発生したため、Markdown形式でチャットへ直接表示する方式に
    切り替えた（Artifactツールのレンダリング起因の問題であり、内容自体の
    問題ではない）。
  - 2026-07-29: Phase 13（HEIC対応の実機エンドツーエンド検証）を完了した。
    **発端**：本セッションでリポジトリの`media/image-assets/`配下
    （Payloadのローカルアップロード領域、gitignore対象）に既存の
    `IMG_8401.HEIC`を発見。`mdls`でEXIF由来のメタデータを確認したところ
    `kMDItemAcquisitionMake=Apple`／`kMDItemAcquisitionModel=iPhone 14
    Plus`／撮影日2026-06-26・4032×3024pxで、実機iPhone撮影の正真の
    HEVCコーデックHEICファイル（`file`コマンドでも`HEIF Image HEVC Main
    or Main Still Picture Profile`と確認）であることを確定した。同じ
    ディレクトリに`IMG_8401_test-*.jpg`という命名の変換済みJPEG群も
    存在したが、コレクション定義（`ImageAssets.ts`のimageSizes名は
    `gallery`/`instagram_square`等）ともファイル命名規則（Payloadは
    `_test`を挿入しない）とも一致せず、リポジトリ内のどのコードからも
    参照されていないことを確認——実際のPayloadアップロードフローを
    経たものではなく、由来不明の過去のアドホックな検証物と判断し、
    今回の検証根拠には使わなかった。
    **検証方法**：Docker Desktop起動→ローカルPostgresコンテナ起動→
    Payload Local API（`getPayload()`経由、REST/管理画面と同一の
    コレクション設定・フックを通る）を使った一回限りの検証スクリプトで、
    `IMG_8401.HEIC`を実際に`image-assets`コレクションへ`create`し、
    結果を確認後にレコードを`delete`して後片付けする方式にした
    （REST経由も検討したが、既存の管理画面ログインパスワードを私は
    保持しておらず、ローカル開発用とはいえ推測でのログイン試行は
    行わないと判断し、Local API方式を採用）。
    **結果**：`beforeOperation`フックがHEICを正しく検出し
    `heic-convert`でJPEG変換（`IMG_8401.jpg`、4032×3024、元HEICと
    同一解像度を維持）、Payload標準のリサイズも正常に動作し
    `imageSizes`5種（`gallery` 1600×1200／`instagram_square`
    1080×1080／`instagram_portrait` 1080×1350／`x_landscape`
    1600×900／`note_header` 1280×670）すべてが生成されることを実データで
    確認した。検証後、生成されたDBレコード・派生ファイルは削除して
    環境を元の状態に戻し、検証用スクリプトもリポジトリから削除した
    （コミット対象には含めていない）。Docker／Postgresコンテナ・Payload
    devサーバーも検証後に停止済み。これによりPhase 9で未検証のまま
    残っていた「実機HEICでのエンドツーエンドアップロード検証」が解消した。
    第11章のチェックリストを更新した。
  - 2026-07-29: Phase 12（本番インフラ）のドメイン・ホスティング方針を
    決定した。**ドメイン**：サブドメイン方式を採用し`discover.ginzawhiskers.
    com`を02のフロントエンドドメインとする（独立ドメインの新規購入は
    見送り）。理由：02はビジュアル上は01と別のサブブランドだが（第5章）、
    ブランド構造上はGINZA WHISKERS傘下であり（Root第1章のツリー構造）、
    01が「各プロジェクトへのハブ」を担うという役割定義（Root第1章、01
    CLAUDE.md第1章）とも整合するため。追加のドメイン購入・DNS検証・SEO
    立ち上げコストも回避できる。**構成**：フロントエンド（`site/`）＝
    Cloudflare Pages・`discover.ginzawhiskers.com`、バックエンド
    （`cms/`）＝Railway・`api.discover.ginzawhiskers.com`、画像ストレージ
    ＝Cloudflare R2（第6章の技術選定どおり）。詳細な構築手順・DNS設計・
    環境変数一覧は付録Fにランブックとして記録した。**コード変更**：
    `site/astro.config.mjs`に`site: 'https://discover.ginzawhiskers.com'`
    を追加し、これに伴いPhase 7の残課題だった`canonical`/`hreflang`の
    絶対URL化に対応した——`BaseLayout.astro`の`canonicalPath`/
    `alternatePath`をこれまでの相対パスそのまま出力から、`Astro.site`を
    基準に絶対URL化する処理（`toAbsolute`ヘルパー）に変更し、あわせて
    従来出力していなかった`og:url`メタタグも新規追加した。`og:image`は
    元々Payloadの絶対URLをそのまま使う設計のため変更なし。**検証**：
    `astro check`は12ファイル・0エラー。`astro dev`を起動し
    `/ja/privacy`で`canonical`が`https://discover.ginzawhiskers.com/ja/
    privacy`、`hreflang`が日英とも絶対URL、`og:url`が新規出力されている
    ことをcurlで確認済み。**今回は方針決定・コード対応のみ**——Cloudflare
    Pages／Railway／R2の実際のアカウント作成・DNSレコード追加は未実施
    （各サービスのダッシュボード操作が必要なため、私からは代行できず
    ユーザー側の対応が必要。付録F参照）。
  - 2026-07-29: 02固有のプライバシーポリシーページを実装した
    （`site/src/pages/{ja,en}/privacy.astro`、`/ja/privacy` `/en/privacy`）。
    01の`privacy.html`を土台にしつつ、02固有の実態に合わせて内容を調整：
    ①お問い合わせ窓口は現状01に集約（02自体にフォーム・メール掲載なし）
    である旨を明記、②ニュースレター機能（Phase 16未着手）は「現時点で
    未実装・メールアドレス収集なし、導入時に本ポリシーを改定」と将来時制で
    記述（GA4セクションと同じ「未実装は未実装と書く」方針）、③新規に
    「SNS連携（Instagram等）について」の章を追加し、Meta Graph API連携は
    当会が管理する公式アカウントへの投稿のみを目的とし訪問者個人のSNS
    アカウント情報は取得・保存しないこと、人間承認を経ない自動投稿は
    行わないことを明記（Instagram Meta App Review申請時の説明と整合させる
    意図）。あわせて`BaseLayout.astro`にサイト共通のフッター（プライバシー
    ポリシーへのリンク、コピーライト）を新規追加した（従来02にはフッター
    自体が存在しなかった）。`astro check`は12ファイル・0エラーで通過。
    `astro dev`を起動し`/ja/privacy`・`/en/privacy`・フッターリンクとも
    200 OK・想定どおりの内容で表示されることをcurlで確認済み（`astro build`
    のフルビルドはCMS未起動時`[slug].astro`側の`getStaticPaths`が
    フェッチ例外で失敗する既知の制約——付録B「まだ未検証」参照——があり、
    このサンドボックス環境では以前から未検証のまま。今回の変更による新規
    問題ではない）。この実装により、付録Eに記載していたInstagram App Review
    申請の前提条件（プライバシーポリシーURL）は解消した。
  - 2026-07-28: 10月ローンチに向けたPhase実行計画（第9章）をユーザーが
    承認し、今後のPMOの基準とすることを確定した。**確定事項**：
    ①Phase 12（本番インフラ）・Phase 13（HEIC実機検証）を最優先とする。
    ②Instagram Meta App Reviewは外部審査のリードタイムを考慮し、実装の
    順番とは切り離して申請の前提整備に最優先で着手する（手順は付録E。
    申請の実行自体はMeta Developer/Business Managerアカウントでの
    ユーザー操作が必要なため、私からは代行できない）。③ギャラリー機能
    （Phase 17）は予定どおり後続フェーズとして先送りを継続し、実装
    タイミングは02の進捗を見て再判断する（スケジュール変更なし）。
    第11章のリリース前チェックリストを、01第9章と同形式で初めて具体化
    した。付録E作成時に、Instagram申請の前提条件として**02固有の
    プライバシーポリシーページが未作成**であることが判明し、第11章
    「信頼性」に追加した。
  - 2026-07-28: Root CLAUDE.mdの「Project Charter」改訂（ユーザーが
    ChatGPTと整理した設計方針に基づく）を受け、本ファイルへカスケード
    反映した。**変更点**：①第1章に「AI編集部として銀座の旬を毎日発信」
    「10月ローンチがワークスペース直近最優先」という位置づけを明記。
    ②第9章のワークスペース横断優先順位を「01優先」から「02優先」へ
    修正。**ギャラリー機能スケジュールの扱い（同日、ユーザー確認済み）**：
    下記のPhase 10決定（ギャラリー実装を「01公開後」に先送り）は当時の
    「01がワークスペース最優先」という前提に基づいていたが、**今回の
    優先順位反転（02が最優先）を受けても、ギャラリーのスケジュール自体は
    変更しない**。02優先で進めつつ、ギャラリーの実装タイミングは今後の
    02計画の中で改めて判断する。
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
- **未決事項**：AI支援翻訳の要否、02固有のDaily PMO進捗率算出方法
  （第11章のチェックリストが具体化したため、今後算出方法を確定する）、
  本番（Railway想定）環境での破壊的スキーマ変更のマイグレーション手順の
  **実地**検証（手順の設計自体は2026-07-29に付録Fへ記録したが、ローカル
  2前例〈Phase 2のDBボリューム再作成、Phase 8の手動SQLマイグレーション〉
  を踏まえた設計段階に留まり、Railway環境での実施はまだ行っていない）。
  ギャラリー機能（Phase 10でスコープ確定）における、複数記事から参照
  される同一画像アセットの年代・収蔵室の解決規則（実装フェーズで確定、
  `CONTENT_MODEL.md`第7章）。付録Cに実装レベルの既知の未完了事項を記載。
  **2026-07-29追加**：Cloudflare Pages・Railway・Cloudflare R2の実際の
  アカウント設定・DNSレコード追加（方針は確定済み、付録F。各サービスの
  ダッシュボード操作が必要なためユーザー側の対応が必要）、Meta Business
  Managerのビジネス確認状況の確認。**収益化モデル自体の具体化**（広告／
  アフィリエイト／有料会員等、どの方式を採るかが本ファイルに一度も
  明記されていないことがExecutive PMO整理中に判明。10月ローンチまでに
  決定が必要）。
- **次のマイルストーン**：Phase 13（HEIC実機検証）が完了したため、残る
  公開ブロッカーは付録Fの手順に沿った本番インフラの実際の構築
  （Cloudflare Pages／Railway／R2のアカウント設定・DNS追加、本番Postgres
  スキーマ移行の実地検証）に絞られた——いずれも各サービスのダッシュボード
  操作が必要なためユーザー側の対応が前提。あわせてInstagram Meta App
  Review申請の前提整備（Business Verification状況の確認）に着手する。
  ギャラリー機能の実装は02の進捗を見て再判断する方針のため、当面の次の
  マイルストーンからは外れる。
- **最終更新日**：2026-07-29

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
     （`DATABASE_URI`は自動注入される）。
   - `02-discover-ginza-media-system/cms/`をサービスとしてデプロイする。
   - 環境変数を設定する：`PAYLOAD_SECRET`（新規生成の長いランダム文字列）、
     `R2_BUCKET`／`R2_ENDPOINT`／`R2_ACCESS_KEY_ID`／
     `R2_SECRET_ACCESS_KEY`（下記3）、`ANTHROPIC_API_KEY`、
     `IG_BUSINESS_ACCOUNT_ID`／`IG_PAGE_ACCESS_TOKEN`（Meta App Review
     承認後、付録E）、`X_API_BEARER_TOKEN`（Phase 15実装後）。
   - カスタムドメインとして`api.discover.ginzawhiskers.com`を追加する。
3. **Cloudflare R2（画像ストレージ）**
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

**未確認・要対応**：
- Cloudflare Pages／Railwayのアカウント作成状況（既存アカウントの有無）。
- Railway Postgresの自動バックアップ機能の有無・保持期間。
- 実際の構築作業は次回セッション以降、ユーザーからの実施報告を受けて
  本章に記録する。
