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

**Tokyo Nostalgic Soundtrack（TNS、2026-08-21正式反映）**：上記4本柱の
うち主に1（長文記事）と4（AI支援SNS配信）を組み合わせた、週次シリーズ
形式のフォーマット。天気・曜日・季節・銀座イベント等のFactから、読者の
気分・生活テーマ・銀座での過ごし方・選曲までを一連のストーリーとして
構成し、AI 80％／マロン最終編集20％を目標とする自動制作フローを持つ。
マロンの週次必須入力は原則`maronWeeklyObservation`（今週の銀座を
一言でどう感じるか）の1項目のみとし、それ以外は全て任意入力とする
設計。詳細な制作フロー（STEP1〜6）・TNS Payload v1.0のデータ設計
（`TNSSettings`／`SoundtrackEditions`／`MusicTracks`／
`MusicUsageLedger`）・Human/AI責任分界は`TNS_SPEC.md`を参照。
**2026-08-27、この設計を実コード化した**（`cms/src/collections/`に上記
3コレクション、`cms/src/globals/TNSSettings.ts`、`cms/src/lib/tns/`、
`POST /api/ai/generate-tns-weekly-edition`、`./p2 tns next|status|
import-tracks` を追加。天気は課金不要の公開API Open-Meteoを採用、選曲は
AIの外の決定的スコアリング、生成物は既存`Articles.reviewStatus`ゲートを
通る`draft`）。ただし実`ANTHROPIC_API_KEY`でのTNS週次生成E2E・ローカル
DBへのスキーマ反映と候補曲の実投入・`./p2 tns approve`（final approval／
MusicUsageLedger本番登録）は未実施。詳細は`DECISION_LOG_02.md`
2026-08-27の該当エントリ参照。

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
- **Editorial Trust Layer（画像・出典ポリシー、2026-08-19確定）**：
  「旬の銀座」記事生成における画像利用・出典管理の正式方針。
  設計・Trial適用の経緯は第12章の該当セッション（2026-08-19、
  画像選定・利用可否Trial→Editorial Trust Layer設計）を参照。
  1. **外部サイト画像は原則転載しない**——公式サイト掲載画像・OGP
     画像・二次告知サイト画像を「取得可能」という理由だけでnote・X・
     LINE等へ転載しない。明示的な利用許諾・プレス素材利用条件等が
     確認できた場合のみ例外とする。**通常運用では「画像利用条件を
     毎回詳細調査して使用可能画像を探す」ことを必須工程にしない**
     ——確認コストを日常運用の前提にしない設計判断。
  2. **記事・SNS画像は原則GINZA WHISKERS独自素材を使用**——独自撮影・
     独自アイキャッチ・権利上問題のない独自生成画像・明示的に利用
     許諾された素材のいずれか。**外部画像が利用できないこと自体を
     公開のBLOCKERにはしない**——画像なし記事、または独自アイキャッチ
     での代替を正規の運用として許容する。
  3. **Source Provenance**：記事で使用する主要な事実には、可能な
     範囲で`fact`・`sourceName`・`sourceUrl`・`sourceType`
     （primary/official/secondary）・`verifiedAt`・
     `verificationStatus`（confirmed/unconfirmed/conflicting）・
     `factType`（date/venue/price/reservation/hours/access等）を
     対応づける。**「掲載サイト＝開催場所」と推定しない**
     （2026-08-19のnote記事生成Trialで発見した会場誤認を踏まえた
     明文化、詳細は`QUALITY_GATE_TRIAL.md`）。
  4. **Fact / Editorial Note / Quoted Materialの分離**：Confirmed
     Fact（出典から確認した事実）とEditorial Note（GINZA WHISKERS
     独自の選定・評価・おすすめ理由）を明確に分離する。原文の引用
     （Quoted Material）は原則使用せず、必要な場合のみ引用要件・
     出典を確認し最小限とする。
  5. **Quality Gate**：BLOCKER＝開催期間不明／開催場所不明／終了済み
     ／一次・公式情報間の重大な矛盾／出典URLが追跡できない重要事実。
     WARNING＝料金・予約要否・営業時間・アクセス・撮影可否のいずれか
     未確認。**画像が外部画像しか存在しないことはBLOCKER/WARNINGの
     いずれにもしない**（上記2の帰結）。
  詳細な設計根拠・Trial適用結果は`QUALITY_GATE_TRIAL.md`・
  `IMAGE_USAGE_TRIAL.md`・`NOTE_ARTICLE_TRIAL.md`（プロジェクト
  ルート）を参照。
- **Editorial Style Engine（note/X/LINE生成規則、2026-08-19確定）**：
  Human Editor Review（2026-08-19、note/X/LINE Trial成果物のマロン
  レビュー）を経て正式確定した、「旬の銀座」自動生成の文体・構成規則。
  **目的**：単に正確なイベント情報を生成するのではなく、「GINZA
  WHISKERSの視点で旬の銀座を選び、読まれ、行動につながり、見た目にも
  魅力的な記事・投稿へ変換する」こと。**今回のHuman Editor Reviewで
  確定したのは個別Trial文章そのものではなく、以下の生成ルールである**
  ——2026-08-19生成のTrial文章（`NOTE_ARTICLE_TRIAL.md`）自体は本番
  未採用のTrial記録として保持し、本項目の規則に置き換えて再生成する
  際の参考例とする。
  1. **タイトル**：毎回3〜5案生成する。イベント名の羅列にせず、
     「今週の銀座で何が体験できるか」が伝わる案にする。銀座・旬性・
     体験価値が自然に伝わること。過剰な煽り・クリックベイト、SEO目的の
     不自然なキーワード反復は避ける。
  2. **冒頭**：長い挨拶から始めない。最初の数行で「今週の銀座の
     特徴」（季節感・街の空気・今週性）を短く伝え、なぜ今回の
     Editor's Choiceなのかへ自然につなぐ。
  3. **本文の基本構造**：Hook→THIS WEEK IN GINZA→Editor's Choice
     3〜5件→各候補のEditor's Note→Source/Official Information→
     結び（今週の銀座をどう歩くか）。ただし毎回同一構造に固定せず、
     内容に応じた自然な変化を許容する。
  4. **Editor's Choice各項目の構成**：イベント／体験名・場所・開催
     期間・体験内容・Why Now?（なぜ今か）・Editor's Note・どんな人/
     どんな時間に向くか・Source・公式URL・情報確認日。FactとEditor's
     Noteは混同しない（Editorial Trust Layer項目4を踏襲）。
  5. **Visual Rhythm**（外部画像が使えない前提でも「文字の壁」に
     見せない）：大見出し・小見出し・短い英語ラベル（例：THIS WEEK IN
     GINZA / EDITOR'S CHOICE 01 / WHY NOW? / EDITOR'S NOTE / SOURCE）・
     適度な絵文字/アイコン・区切り線・余白・短い段落（原則2〜3文で
     改行）・箇条書き・太字・候補ごとのカード的な見せ方・Editor's
     Noteの視覚的区別、を使う。装飾過多にはせず、スマートフォンでの
     読みやすさを優先する。
  6. **独自アイキャッチ方針**：Editorial Trust Layer（項目1・2）を
     そのまま適用する——外部サイト画像・OGP画像・イベント公式画像は
     利用許諾が確認できない限り転載せず、記事冒頭画像は独自撮影・
     独自アイキャッチ・権利上問題のない独自生成画像・明示的に利用
     許諾された素材を原則とする。独自生成画像を使う場合はイベント
     固有の作品・商品・写真・キャラクター等を模倣せず、「今週の銀座の
     空気・季節・体験テーマ」を抽象的・編集的に表現する。外部画像が
     ないこと自体は記事公開のBLOCKER/WARNINGにしない。
  7. **X**：noteの要約版にしない——役割は「今週の銀座、少し気になる」
     と思わせてnoteへ誘導すること。短く、最初の1〜2行にHook、
     Editor's Choiceを全部説明しない、今週性・旬性を入れる、GINZA
     WHISKERS独自の視点を一言残す、noteへのURL導線を基本とする、
     ハッシュタグ1〜2個を基本とし必要最小限、未確認情報は書かない、
     外部画像利用を前提にしない。A/B案生成は状況に応じて行ってよいが、
     毎回2案生成を必須にはしない。
  8. **LINE**：長文記事にしない——役割は既存読者が短時間で「今週
     どこへ行くか」を判断できること。基本構造は、今週の銀座を1〜2文→
     Editor's Choice 3〜5件（各1〜2行）→短いEditor's Note→note誘導。
     Xより情報量は多く、noteより大幅に短くする。確認済みの重要情報
     のみ簡潔に記載し、公式URLを大量に並べず詳細はnote記事または
     必要な公式情報へ誘導する。
  9. **Editor's Noteの正式定義**：情報の要約ではなく、「なぜGINZA
     WHISKERSがこれを選んだか」を示し、読者に新しい銀座の見方を
     提示するもの。店舗・主催者の広告コピーをなぞらず、Factとは
     明確に分離する。媒体別の長さ：note＝詳細、X＝Hookまたは一言の
     選定理由、LINE＝今週全体の短い編集コメント。
  10. **Source / Editorial Trust Layerとの接続**：本項目はEditorial
      Trust Layer（画像・出典ポリシー）をそのまま維持し、その上に
      文体・構成規則を追加するものである。重要Factには可能な範囲で
      Trust Layer項目3のSource Provenance7項目を対応づけ、読者向け
      表示は「Source／出典名称／確認：YYYY.M.D／→ 公式情報を見る」の
      簡潔な形式を使う。「掲載サイト＝開催場所」と推定しない、
      未確認情報は推測で補完しない、という原則も維持する。
  11. **Performance Learning Layer（将来構想、現段階は未実装）**：
      将来的に、公開後の読者反応（note PV・スキ・読了傾向・X反応・
      noteへの遷移・LINE反応）を次回の生成条件へ反映できる構造を
      想定する。**現段階では外部API接続・自動取得は実装しない**。
      まず「どのタイトル案・構成パターン・Editor's Noteの書き方・
      候補数等が反応に影響したか」を後から分析できるよう、記事・
      投稿を生成する際は生成条件（採用したタイトル案・本文構造の
      バリエーション・候補数・使用したEditor's Noteの長さ等）を
      追跡可能な形で記録する方針とする——実際のデータモデル
      （Article/SocialPostコレクションへのメタデータ追加等）は、
      note記事生成が実コード実装される段階で改めて設計する。
  詳細なTrial例・Human Editor Reviewの経緯は第12章の該当セッション
  （2026-08-19）および`NOTE_ARTICLE_TRIAL.md`を参照。
  12. **note編集部ノウハウの正式反映（2026-08-26確定）**：note編集部の
      公式記事から抽出した10項目のノウハウを、実コード（`generateArticleDraft.ts`
      の単一Source・週次両方のプロンプト、`Articles.ts`スキーマ）へ正式反映
      した。追加・強化した点は以下：
      (a) **なぜ今読む価値があるか**：hookの冒頭で季節・旬性・今週性に基づく
      具体的な「今読む理由」を必須化（一般的な季節の挨拶で終わらせない）。
      (b) **スマホ前提の可読性**：段落2〜3文まで、前置き・冗長な接続表現の
      禁止をプロンプトへ明文化。
      (c) **見出しだけで内容が把握できる構造**：categoryLabel/name/period
      に「何が・どこで・いつ」の具体性を必須化。
      (d) **読者接続の編集ロジックの実運用反映**：2026-08-21確定済みだった
      「社会・季節・生活文脈→読者の気分→体験・発見」という接続を、実際の
      プロンプト文言として初めてコード化した。
      (e) **単一の結びのCTA**：新規`callToAction`フィールド（Articles
      スキーマ・AI出力スキーマ双方に追加）を新設し、closing（結びの短文）
      とは分離。記事末尾で重ねて依頼せず、次の行動を1つだけ示す設計にした。
      (f) **回遊導線（関連記事）**：新規`Articles.relatedArticles`
      （自己参照relationship）を新設。生成時に同じ収蔵室（pillar）を持つ
      公開済み記事をDBから機械的に検索して自動候補提示し、AIには関連記事を
      作文させない（存在しない記事タイトルの捏造を防ぐ、Editorial Trust
      Layerと同じ「推測で補完しない」原則の適用）。公開前に人間が確認・
      取捨選択する前提の自動候補である。
      (g) **noteクリエイターページ上のシリーズ性**：新規`Articles.series`
      （label/editionNumber）を新設。週次「旬の銀座」記事にのみ、既存の
      TNS（#32〜#34、`note.com/ginza_whiskers`で公開中）と同じ「#連番」
      形式のシリーズ番号を自動採番し、本文冒頭に「GINZA WHISKERS
      SERIES｜旬の銀座 #NNN」という目印を付与する（機械的な連番、AIには
      生成させない）。単発の単一Source記事にはこの番号を付与しない。
      (h) **ハッシュタグの絞り込み**：Xの1〜2個に加え、noteのハッシュタグも
      テーマに直接関係するもの3〜5個までに絞る指示をプロンプトへ追加
      （従来はnote側に上限の指定がなかった）。
      (i) **自動生成後もマロンが最終編集・承認できる構造**：新規追加した
      `callToAction`・`relatedArticles`・`series`のいずれも、既存の
      `reviewStatus`（draft→review→approved→published）人間承認ゲート
      （Articles.tsの`beforeChange`フック）の対象範囲内にそのまま含まれる
      ——新しいゲートやバイパス経路は作っていない。
      **今回の変更範囲**：`generateArticleDraft.ts`（単一Source・週次の
      両プロンプト、DRAFT_TOOL/WEEKLY_DRAFT_TOOLスキーマ、ブロック組み立て
      関数）・`Articles.ts`（`callToAction`/`relatedArticles`/`series`
      フィールド追加）・`createDraftFromSource.ts`・
      `createWeeklyDraftFromDiscoveredContent.ts`・新規
      `relatedArticles.ts`（回遊導線候補の決定的検索ロジック、AI呼び出し
      なし）。**今回は実際のAI呼び出し・実データでのE2E検証は行っていない**
      ——`ANTHROPIC_API_KEY`の有効性は本セッションで確認しておらず、
      `payload generate:types`・`tsc --noEmit`（cms、0エラー）による
      静的検証のみ。既存のSources/DiscoveredContent/Editorial Score等の
      データ・既存フローへの変更は一切行っていない。
- **Visual Asset Library（世界観挿絵・ジャンルアイコン、2026-08-19
  確定）**：Editorial Style Engine（項目5 Visual Rhythm）を実際の
  画像素材レベルで支える仕様。詳細は`VISUAL_ASSET_LIBRARY.md`
  （プロジェクトルート）を正本とし、本項目は要点のみ記す。
  1. ビジュアルを**世界観挿絵**（note冒頭等のアイキャッチ、銀座・
     四季・日本らしさを表現する入口ビジュアル、個別の催事・商品・
     作品は直接描かない）と**個別ジャンルアイコン**（各Editor's
     Choiceをスマホ上で一瞬で判別できる視覚記号）の2階層に分け、
     役割を混同しない。
  2. 世界観挿絵は季節に応じてSPRING/SUMMER/AUTUMN/CHRISTMAS/
     NEW YEAR/WINTERの6タイプを切り替える。**WAKOの建物は独自生成の
     抽象化した街並みモチーフとしてのみ使用し、公式写真・公式ロゴは
     使用せず、公式提携と誤認される表現は避ける**（Editorial Trust
     Layerの画像方針をそのまま適用）。
  3. 「GINZA WHISKERS」表記横の署名シルエットは**犬（マロン）**。
     ただしマロンを世界観挿絵の主役にはしない——位置付けはブランド
     署名・編集者人格・Editor's Note・記事末尾署名に限定する。
  4. 個別ジャンルアイコンはFOOD/CAFE/SHOPPING等18カテゴリを正式
     採用（円形バッジ基本、日英で図柄共通・ラベルのみ差し替え、
     訪日外国人利用を前提としたグローバルに理解しやすい図柄）。
     候補ごとにPrimary Categoryを1つ判定して自動選択するが、
     **自動判定に迷う場合はHuman Editorへ確認する**（推測しない
     原則の延長）。
  5. 外部イベント画像・OGP画像・商品写真・展示作品・外部ロゴの無断
     利用は禁止——Editorial Trust Layerの権利方針をそのまま適用し、
     新規の例外は設けていない。
  6. **今回は仕様統合・カテゴリマッピング・自動選択ロジック設計・
     ファイル命名・配置ルールの確定までであり、画像生成の自動実行・
     実コード実装はいずれも行っていない**——実装要否・範囲は別途
     Human Editor確認事項として残っている。
- **読者接続の編集ロジック（2026-08-21確定）**：noteコンテストのテーマ
  研究を踏まえ、Editorial Style Engine（項目1〜4：タイトル・冒頭・本文
  構造・Editor's Choice構成）の生成ロジックを拡張する。従来の「旬の
  銀座情報を集めて記事化する」に加え、**社会・季節・生活文脈→読者の
  気分／潜在ニーズ→銀座でできる体験・発見→GINZA WHISKERS独自の
  Editor's Choice→記事タイトル・ストーリー**という接続を編集ロジックの
  基本形とする。情報量の多さではなく「これは今の自分のための記事だ」と
  感じられる編集を重視する。**Editorial Score（5軸・配点）自体は変更
  しない**——評価軸を増やすと既存採点済み候補（Sources/
  DiscoveredContent 300件超）の再評価が必要になり実AI課金が発生する
  ため、2026-08-18のUX Type軸追加時と同じ判断基準に従い、生成
  プロンプト・構成ロジックの拡張として位置づけた。
- **Character Standard／Character Dominance（マロン／コロン、
  2026-08-21確定）**：ブランドキャラクターの扱いを2つの独立した概念に
  分けて明文化する。**Character Standard**＝マロン／コロンの造形・
  外見・ブランド上の一貫性を固定する仕様（詳細は
  `CHARACTER_STANDARD.md`）。**Character Dominance**＝各挿絵・記事で
  何を主役にするかの判断軸——造形の固定とは独立しており、**「マロンを
  世界観挿絵の主役にしない」という既存原則（`VISUAL_ASSET_LIBRARY.md`
  §2.4）は維持する**。TNS・「旬の銀座」・GINZA Concierge等では、記事や
  情景に応じて人・街・建築・体験を主役とし、マロン／コロンは必要に
  応じて登場するブランドキャラクターとする。画像生成は「固定
  Character Layer」＋「可変Scene Layer」の2層構造とし、Character
  Layerでマロン／コロンの基本造形を固定、Scene Layerで季節・場所・
  時間帯・服装・情景を変更する。**今回はProject 02内での運用に留め、
  Root／`00-shared-guidelines`等の他プロジェクトへの一括変更は
  行っていない**（将来昇格可能な構造にはしておく、詳細は
  `CHARACTER_STANDARD.md`§6）。
- **Music Provenance（TNS、2026-08-21確定）**：Tokyo Nostalgic
  Soundtrack（TNS）で選曲を扱う際の原則。Editorial Trust Layerの画像
  方針と同じ発想を音楽にも適用し、**曲名・アーティスト名・編集的紹介
  （Editor's Noteに準ずる紹介文）を基本とし、歌詞全文・長文引用・
  音源埋め込みは自動生成対象にしない**。TNSの選曲思想は「昭和歌謡」に
  限定せず「昭和浪漫の時代に銀座に流れていた、または銀座の情景・空気に
  似合う音楽」（原則1926〜1989年、1972〜1987年前後は実績上の参考
  中心帯）と定義する（TNS Music Selection Logic）。邦楽／洋楽比率は
  固定値を採用せず、公開済み実績を参考値として随時上書き可能な
  **Adaptive Music Balance**とする（2026-08-21、#32〜#34の3週比較を
  経て確定。3週のみでは恒常ルールと断定せず、固定60/40・固定43/57の
  いずれも採用しなかった）。詳細フロー・TNS Payload v1.1のデータ構造・
  選曲評価の7段階順序は`TNS_SPEC.md`を参照。

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
  | 15 | SNS配信の本実装（Instagram App Review／X OAuth） | 外部認証・実投稿を除く配信キュー基盤（候補生成・Dry Run・人間承認ゲート・二重配信防止）は**2026-08-10完成**。Instagram App Review／X OAuthは引き続き未着手、Instagram側はリードタイムを理由に**申請だけ先行着手**（付録E参照） |
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

- **フェーズ**：Phase 1〜11・13完了、Phase 12は設計完了・実際の構築が残り
  進行中、Phase 14は**AI編集部パイプラインの実装・検証は完了、
  「毎日発信」運用に足る記事の蓄積という完了条件自体は最低掲載本数が
  未確定のため未達**（2026-08-10、詳細は本節直近の意思決定）。**さらに
  実際のANTHROPIC_API_KEYを使った本物のAI呼び出しは、鍵が無効
  （401 authentication_error）なため2026-08-10時点でも未検証のまま**
  （詳細は本節直近の意思決定の最新項目、この状態には本セッションでは
  一切手を入れていない）。Phase 15は**外部認証・実投稿を除く範囲
  （公開承認済み記事からのSNS配信候補生成・Dry Run・人間承認ゲート・
  二重配信防止）が2026-08-10完成**（詳細は本節直近の意思決定）。
  Instagram App Review／X OAuthは引き続き未着手。
  Phase 4（記事詳細ページ）・Phase 5（記事一覧カードデザイン刷新）・
  Phase 6（翻訳ワークフロー確立）・Phase 7（SEOメタ対応）・Phase 8
  （タグ名ロケール対応）・Phase 9（HEIC対応）・Phase 10（ギャラリー機能
  スコープ確定。**実装自体は02の進捗を見て再判断、Phase 17へ先送り**）・
  Phase 11（リリース前チェックリスト具体化）・Phase 13（HEIC実機検証）は
  いずれも完了。

- **意思決定ログ（一文要約、全文は分割ファイルを参照）**：本項目は
  2026-08-21、CLAUDE.mdの肥大化（150,000文字上限超過）を解消するため、
  Root憲章第4章の記法（「YYYY-MM-DD: 一文で結論のみ」）に統一して圧縮した。
  各エントリの詳細な実行ログ・検証手順・発見事象の経緯は、日付に応じて
  `DECISION_LOG_01.md`（2026-07-21〜2026-08-17）または
  `DECISION_LOG_02.md`（2026-08-17〜2026-08-19、直近の重要決定を含む）を
  参照すること。**情報は削除しておらず、両ファイルに原文をそのまま保持**
  している（分割前の全文バックアップは `CLAUDE.md.backup-20260821.md`）。

- 2026-08-28: 🌈TNS 2026-08-31週の重複`SoundtrackEditions`3件（id1/#0・id2/#36・id3/#37、2026-08-27のE2E由来）を整理——id2/#36のみ7日選曲完成・号数整合（Article31 series#36、note historical#35の次）のため**正本として保持**（マロン確定：既存draftを作り直さない）、空生成のid1/#0・id3/#37と紐づくdraft Article30・32を削除。事前確認で3件ともMusicUsageLedger参照0・SocialPosts0・relatedArticles参照なし・note公開実績なし。削除前に6ドキュメント全文を`locale:'all'`でJSON退避（`_backups/tns_edition_cleanup_backup_20260828.json`）。削除後：`findExistingEditionForWeek('2026-08-31')`はid2/#36単独を返し、`computeNextEditionNumber`は37、MusicUsageLedgerは21件のまま不変、Article31は`reviewStatus=draft`/`series#36`/本文63ブロックで整理作業による破損なし。**ただし#36本文（Article31）自体はドラフトとして未完成であり、Anthropicクレジット回復後にAI再生成で本文を作り直す必要がある（正本としての号数#36・週2026-08-31・7日分の選曲・seriesは確定済みで、要再構築なのは本文プローズのみ）。** live生成・approve・自動投稿は未実施。詳細は`DECISION_LOG_02.md`
- 2026-08-28: Project 01母艦「最新のジャーナル」向けの疎結合フィード`GET /ja/latest.json`をAstroに新設（`site/src/pages/ja/latest.json.ts`）——published限定（既存`fetchPublishedArticleDetails('ja')`再利用＝`reviewStatus=published`必須＋`Articles.access.read`の匿名published制限で二重担保、draft/review/approvedは出さない）、新しい順・最大10件、DTOは`title/url/excerpt/publishedAt/pillar/image`のみ（本文Lexical・内部ID非出力）。`excerpt`=`seo.metaDescription`or本文先頭120字、`publishedAt`=`publishHistory[channel=site]`優先→`updatedAt`（`site/src/lib/payload.ts`に`ArticleSummary.publishedAt`追加）、`image`はhero無しで`null`。記事URLの絶対化ベースは`PUBLIC_FEED_BASE_URL`→`astro.config`の`site`→ローカル既定で解決し本番ドメインを直書きしない。CORSは`site/public/_headers`で`/ja/latest.json`に付与（`*`）。CMS未起動時は`{count:0,items:[]}`を返しビルドを止めない。`astro check`/`tsc --noEmit`0エラー、`astro dev`で200・CORS・空フィードを確認。実DB・push・本番設定はなし。Project 01側の実装・切り替え状況は`01-ginza-whiskers-brand-site/CLAUDE.md`第10章参照。詳細は`DECISION_LOG_02.md`
- 2026-08-28: `./p2 draft-interest`（収益化②）を`./p2 morning`へ接続——step 14に`draft_interest --dry-run`を追加（step 13の`draft_today --dry-run`直後）。morning通常実行は①②とも`--dry-run`（AI呼び出し・DB書き込み・自動投稿なし）、実生成は人間の`--yes`のみ。morning内コメントの処理順を「情報収集→抽出・採点→curation→approved判定→収益化① draft-today（最大5本）→収益化② draft-interest（最大5本）→承認待ち一覧（合計最大10本/日）」へ更新。**①②間の重複防止**：draft-interestのプレマッチ対象から、既にArticleが`editorialProvenance`で参照している承認済みDCを除外（②は①が未記事化のGinzaコンテンツにのみ関心テーマを接続。①=CORE／②=interest+ginza_whiskersと角度排他で同角度重複は構造上不可）。RUNBOOKS付録FのTZ=Asia/Tokyo必須記述に②のInterest Score freshness依存を追記。実データでcross-flow除外・冪等・morning両step動作を確認。詳細は`PROJECT_02_2_INTEREST_MONETIZATION_SPEC.md`§8.8・`DECISION_LOG_02.md`
- 2026-08-28: `./p2 draft-today`の品質検収（本番運用可判定）と`./p2 morning`への接続——morningは手順13で`draft-today --dry-run`（当日ドラフト化予定の確認のみ、AI呼び出し・DB書き込みなし）を実行、実生成は人間が`./p2 draft-today --yes`を明示実行（morningの「課金・自動投稿しない」方針を維持）。日次パイプラインの処理順（情報収集→抽出・採点→curation→approved判定→draft-today→最大5本を承認待ちへ）をmorning内コメントに明示。Railway本番の`TZ=Asia/Tokyo`必須範囲に`draft-today`の当日判定を追記（RUNBOOKS付録F）。`〈LEAK〉`等の記号入りタイトル・slug・`#LEAK`ハッシュタグの整形は既知TODOとして記録（RUNBOOKS付録C、今回未変更）。詳細は`DECISION_LOG_02.md`
- 2026-08-28: Project 02-2 収益化②「興味関心×銀座×GINZA WHISKERS視点 最大5本/日」を接続——`./p2 draft-interest`（承認済みinterest-themes→topicInterestScore〈既存Phase A無変更〉× monetizationMultiplier〈Phase B/B2、`clamp(1+W_PAID×paidRatio,1.0,1.6)`、W_PAID=8〉= finalRankScore で順位付け → 承認済みDiscoveredContentへプレマッチ〈包含／テーマ側bigram被覆率≥C_MATCH=0.6／pillar hint〉→ multi-angleのinterest+ginza_whiskers角度で`Article(draft)`生成）。`./p2 interest paid-ratio`（Phase B、非AI）新設。W_PAID/C_MATCHはconfig化（`INTEREST_W_PAID`/`INTEREST_C_MATCH`、9月Trial調整用）。新規AIツールスキーマなし（`readerInterestTheme`はuserメッセージ注入のみ）。E2E検収でsourceProvenance空許容がEditorial Trust Layerを弱めると判定し取り消し——`hasProvenance`を全5角度で必須へ戻し、システムプロンプトに「編集的視点の角度も会場/日付/人物/歴史/商品等の事実を最低1件sourceProvenanceに記録、無ければ記事化しない」を追記。`draftInterest.ts`にCLI引数検証（`--w-paid≥0`／`--c-match`0〜1）。再E2E（旅行×耕書堂跡・写真×南方書局フェア）でArticle 4本を`draft`生成、interest/ginza_whiskers全4本にeditorialProvenance 2件ずつ付与を確認。検収用承認・生成物は復元済み。**morning接続可と判定（本セッションでは未接続）**。詳細は`PROJECT_02_2_INTEREST_MONETIZATION_SPEC.md`§8・`DECISION_LOG_02.md`
- 2026-08-28: 「旬の銀座」日次オーケストレーション`./p2 draft-today`を実装——当日approved DiscoveredContentを類似テーマで束ね、上位トピック（既定最大5、`--limit`可）を各1本ずつmulti-angleのCORE角度で`Article(draft)`化。冪等（editorialProvenance逆引きで既ドラフト化を除外）、`--dry-run`は計画のみ、live実行は`--yes`必須、生成物は既存reviewStatus人間承認ゲートを通る。AIツールスキーマは不変（`angles`絞り込みはプロンプト＋保存ループのみ）。実Claude API 2回でArticle #35/#36を生成しローカルDBでE2E確認。詳細は`DECISION_LOG_02.md`
- 2026-08-28: 2026-08-27の未コミット変更（下記multi-angle・TNSエンジン・02-2 Phase A/B）を整理——`tsc --noEmit`（cms、0エラー）で型健全性を確認し修正不要、CLAUDE.md/DECISION_LOG_02へ反映、Project 02配下のみを1コミット化（Project 01の未コミット分は対象外）。実AI呼び出し・DB反映・push はなし
- 2026-08-27: 「旬の銀座」multi-angle記事生成（Project 02-1）を実装——approved DiscoveredContent 1件→CORE/NEED/EXPERIENCE/INTEREST/GINZA_WHISKERSの最大5記事（`draft`）。品質Gate（薄さ・重複除外、決定的・AI非依存）付き。`POST /api/ai/generate-multi-angle-draft`＋手動CLI。既存2系統の下書き生成は無変更。実AI E2Eは id=97 で1回のみ（metaTitle欠落バグ修正後の再検証・`./p2`統合は未）。詳細は`DECISION_LOG_02.md`
- 2026-08-27: 🌈Tokyo Nostalgic Soundtrack（TNS）エンジンを実コード化——`MusicTracks`/`MusicUsageLedger`/`SoundtrackEditions`コレクション＋`TNSSettings`global＋`lib/tns/`＋`POST /api/ai/generate-tns-weekly-edition`＋`./p2 tns next|status|import-tracks`。天気=Open-Meteo（課金不要）、選曲=AIの外の決定的スコアリング、生成物は既存`Articles.reviewStatus`ゲートの`draft`。実AI E2E・DB反映・候補曲投入・`./p2 tns approve`は未。詳細は`DECISION_LOG_02.md`
- 2026-08-27: Project 02-2「興味関心×収益性」エンジンのPhase A（Interest Discovery：note_rising/note_official_topic/note_hashtag_popular＋Interest Score統合ロジック）・Phase B（Monetization Scoring：paidRatio試験Proxy）を実装・調査——Phase C以降（銀座変換・記事生成）へは未接続、Claude API呼び出しなし。詳細・次回再開手順は`PROJECT_02_2_INTEREST_MONETIZATION_SPEC.md`参照
- 2026-08-26: note編集部ノウハウ（10項目）をEditorial Style Engineへ正式反映——`callToAction`（単一CTA）・`relatedArticles`（回遊導線、自動候補）・`series`（noteシリーズ連番）をArticlesスキーマ・生成プロンプト双方に追加（実AI呼び出し・DB実データ検証は未実施、詳細は第8章項目12・`DECISION_LOG_02.md`参照）
- 2026-08-25: 週次「旬の銀座」記事生成（複数DiscoveredContent入力）を実装——Human Editor Review P0〜P2の指摘（出典捏造防止・Source Provenance保存・タイトル体験型優先等）を反映し`generateWeeklyDraft`エンドポイントを新設（詳細は`DECISION_LOG_02.md`参照）
- 2026-08-24: Maron Editor's Choice候補選定の実運用確認——DiscoveredContent id:97「南方書局のハッピーサマー ミニミニ大百貨店」を候補として選定し、未確認4項目（入場条件・予約要否・限定特典内容・撮影可否）の公式取材窓口宛て問い合わせ文案を作成（送信は未実施・外部確認中、curationStatusはinboxのまま変更なし、詳細は`DECISION_LOG_02.md`参照）
- 2026-08-19: Visual Asset Library確定——世界観挿絵6タイプ・18ジャンルアイコン仕様を第8章へ正式統合（画像生成の実行・コード実装は未着手）
- 2026-08-19: 新ルール準拠note記事Trial——Editorial Style Engine適用版の記事原稿を再生成（比較用に新規ファイル`NOTE_ARTICLE_TRIAL_STYLE_ENGINE.md`として保存、外部公開なし）
- 2026-08-19: Editorial Style Engine確定——Human Editor Reviewを経た文体・構成規則を第8章へ正式統合
- 2026-08-19: X／LINE展開Trial——note記事からの媒体別変換ロジックを設計し原稿を生成（Quality Gate PASS、実配信なし）
- 2026-08-19: Editorial Trust Layer確定——画像・出典の正式方針を第8章へ統合し、note記事Trialへ適用
- 2026-08-19: 画像選定・利用可否Trial——USABLE/REVIEW/NOT_USABLE/UNKNOWNの4区分を設計し試験候補5件を判定（全件REVIEW、コード実装なし）
- 2026-08-19: 記事品質Gate Trial——会場誤認の教訓を踏まえたBLOCKER/WARNING判定仕様を設計（コード実装なし）
- 2026-08-19: note記事生成Trial——Editor's Choice 4件を入力に初のnote記事Trial原稿を生成（`NOTE_ARTICLE_TRIAL.md`作成、外部公開なし）
- 2026-08-19: Editor's Choice Trial——当日Top10を4件へ絞り込み（読み取り専用、DB書き込みなし）
- 2026-08-18: 本日の統合Trial最終検収——7機能を通しで検証し安定動作・再現性を確認（読み取り専用）
- 2026-08-18: Temporal Relevance実装——NOW/SOON/NEXT/LATER/EXPIREDを算出する参考指標を追加（Editorial Scoreへの加減点なし）
- 2026-08-18: 統合Trial——Daily Editorial Desk本日版候補表を初めて生成（読み取り専用、クロスサイト重複を発見）
- 2026-08-18: 参加／体験型UXタイプを設計・実装——6分類のuxTypeフィールドを追加し既存300件へ遡及適用（実AI呼び出しなし）
- 2026-08-18: 本文情報量をEditorial Scoreへ反映——contentRichness（rich/thin/boilerplate）判定を実装しSources/DiscoveredContent既存335件へ遡及適用
- 2026-08-18: OGP等の画像URL取得を実装——og:image/twitter:imageからimageUrlを抽出（画像ファイル自体はダウンロードしない設計）
- 2026-08-18: Daily Rankingにおける施設偏り抑制を実装——同一施設の連続・偏重を緩和する多様性調整ロジックを追加
- 2026-08-18: SOURCE LEDGER→Sources接続の再確認・実データ検証——既に実装済みと判明、Trial由来の改善候補4点の優先順位を再評価
- 2026-08-17: Event Date Extraction誤判定・Story Clustering過剰統合を修正——複数セッション日時の誤抽出、10件の過剰統合を解消
- 2026-08-17: Daily Top10レビュー表示——「connect connect」の重大なStory Clustering誤結合を発見（実装変更は次回、読み取り専用）
- 2026-08-17: ongoing/upcoming捕捉率改善——Event Date Extraction拡張とsite-specific adapterを実装、日付取得率10%→48.8%
- 2026-08-17: Source Coverage拡張の再巡回検証——差分検知の冪等性（重複生成なし）を実データで確認
- 2026-08-17: Source Coverage拡張——一覧ページの自動発見・追加巡回を実装（PDF/画像への誤アクセスバグを発見・修正）
- 2026-08-17: Daily Editorial Desk 実運用テストを実施（初回はDaily候補0件、原因はデータ実態の反映と判明）
- 2026-08-17: Event Date Extraction／Story Clustering実装——JSON-LD優先の日付抽出とサイト内同一イベント統合ロジックを新設
- 2026-08-17: Sources（サイト単位）28件も実Claudeで全件採点完了
- 2026-08-17: 実AI E2E初成功——DiscoveredContent 160件を実際のClaudeで全件採点（Anthropicクレジット追加により解消）
- 2026-08-17: ANTHROPIC_API_KEY差し替え3回目——鍵は有効化されたが残高不足でブロック（外部課金問題と特定）
- 2026-08-17: ANTHROPIC_API_KEY差し替え再試行——またもシェルコマンド断片混入で失敗
- 2026-08-17: トップページ更新検知→個別記事・イベント抽出を実装——新規`DiscoveredContent`コレクションを新設
- 2026-08-17: 「旬の銀座」編集判断レイヤーを実装——Editorial Score（5軸100点）・Audience Tagsを新設
- 2026-08-17: SOURCE LEDGER 定期実行——Payload Jobs Queue（毎朝6:00）を採用し`./p2 morning`へ統合
- 2026-08-17: SOURCE LEDGER 巡回結果→Sourcesコレクション接続を実装（HTTPルーティング衝突バグも発見・修正）
- 2026-08-16: 本日の作業終了・引継ぎ整理（コミットは行わず、回帰確認のみ）
- 2026-08-16: SOURCE LEDGER 自動巡回の取得品質を改善——UA形式調整・robots.txt対応・HTML正規化でGINZA OFFICIAL誤検知を解消
- 2026-08-16: SOURCE LEDGER 自動巡回 v1——Fetcher→Snapshot→Diff判定を実装
- 2026-08-15: SOURCE LEDGER v1をローカルDBへ実投入し動作確認
- 2026-08-15: SOURCE LEDGER v1——情報源台帳（Core 14サイト）を新設
- 2026-08-12: Railwayドメイン誤作成事故が発生——読み取り専用許可リスト方式（railway_ro/wrangler_ro）を導入し再発防止
- 2026-08-10: `./p2 morning`を新設——作業開始準備を1コマンドに自動化
- 2026-08-10: Phase 12 Preflight——本番インフラ構築の事前準備（DB接続フォールバック化、railway.json追加等）
- 2026-08-10: Phase 15——SNS配信キュー基盤を実装（外部認証・実投稿を除く範囲、人間承認ゲート・二重配信防止込み）
- 2026-08-10: Phase 14実AI E2E再検証——APIキーがシェルコマンド断片混入という形式異常と判明し呼び出しを見送り
- 2026-08-10: Phase 14実AI E2E検証——鍵は設定されているが401 authentication_errorで無効と判明
- 2026-08-10: Phase 14完成確認セッション——パイプライン実装面は完了、記事蓄積の基準（最低掲載本数）は未確定のまま
- 2026-08-10: Phase 14開始——AIによるSources評価・Editor's Choice候補選定ロジックを実装（バッチ処理事故と復旧を含む）
- 2026-08-10: 編集パイプライン基盤の実装を完了（Sources/Articlesの人間承認ゲート、editorialStatus状態機械）
- 2026-08-09: Phase 12（本番インフラ）の実際の構築に着手——ドメイン取得（Cloudflare Registrar）、Railwayプロジェクト・PostgreSQL作成
- 2026-07-29: 02のPMO運用フォーマットを「Executive PMO」形式に刷新（第10章反映）
- 2026-07-29: Phase 13（HEIC対応の実機エンドツーエンド検証）を完了
- 2026-07-29: Phase 12のドメイン・ホスティング方針を決定——サブドメイン方式、`discover.ginzawhiskers.com`
- 2026-07-29: 02固有のプライバシーポリシーページを実装
- 2026-07-28: 10月ローンチに向けたPhase実行計画（第9章）を承認、以後のPMO基準に確定
- 2026-07-28: Root CLAUDE.mdの「Project Charter」改訂を受け本ファイルへカスケード反映（優先順位を01→02へ変更）
- 2026-07-26: Phase 10としてギャラリー機能のスコープを確定（実装は01公開後へ先送り、方針のみ）
- 2026-07-26: Phase 9としてHEIC画像アップロードの恒久対応を実装
- 2026-07-24: Phase 8として`Tags.name`をロケール別対応化
- 2026-07-24: Phase 7としてSEOメタ対応を実装
- 2026-07-23: Phase 6として翻訳ワークフローを確立（サイレントフォールバック問題を発見・解消）
- 2026-07-23: Phase 5として記事一覧ページのデザインを改善（カード型グリッドレイアウト化）
- 2026-07-23: Phase 4として記事詳細ページを実装
- 2026-07-23: 画像紐付けの「完了済み」申告が実際は未保存だった事象を検知——以後サーバーログとupdatedAtを一次情報とする運用を確立
- 2026-07-22: Phase 3としてAstroからPayload CMS REST APIへのライブ疎通を実地検証
- 2026-07-22: 匿名リクエストが全件403エラーとなる事象を発見——Payload既定アクセス制御（未ログイン全拒否）の仕様と判明
- 2026-07-22: 匿名読み取りの公開方針を「published限定で開放」に決定（全面公開ではなく）
- 2026-07-22: Docker/Postgres/Payload/Astroを起動し、Astroで実データ記事一覧の表示を確認（本日のゴール達成）
- 2026-07-22: Phase 2としてローカル実行環境を構築し、Tags→Sources→Articlesのサンプルデータ登録を実地検証
- 2026-07-22: Articlesのカスタムフィールド`status`を`reviewStatus`にリネーム——Payload予約フィールド`_status`とのenum型衝突を解消
- 2026-07-22: 上記リネームにより非互換なスキーマ変更が発生、ローカルPostgresをボリュームごと再作成
- 2026-07-22: Slugフィールドが入力不可に見える事象が発生——原因はブラウザキャッシュと判明しハードリロードで解消
- 2026-07-20: Project 02の要件を定義——01が窓口、02が中心的出版プラットフォーム、note.comは廃止せず並走
- 2026-07-20: コンテンツスコープを4本柱（記事・ギャラリー・ニュースレター・AI支援SNS配信）に確定、記事＋ギャラリーを先行
- 2026-07-20: ビジュアルは01と別のサブブランド的デザインとする方針を確定
- 2026-07-20: 技術方針として01と異なりCMS・バックエンド・フレームワークの採用を許容する方針を確定
- 2026-07-20: 日英バイリンガルでの立ち上げを確定（翻訳ワークフローは未定のまま）
- 2026-07-20: SNS配信のAI活用は「AI支援・人間承認」とし自動投稿は行わない方針を確定
- 2026-07-20: ワークスペース優先順位に従い、02は01と並行するが01優先という位置づけを確認（後日02優先へ改訂）
- 2026-07-21: MVPシステムアーキテクチャ設計セッションを実施し承認
- 2026-07-21: 記事生成のAI活用ポリシーを「AI下書き＋人間が編集長として全面レビュー」に確定
- 2026-07-21: Content Asset Repositoryを採用——承認済みコンテンツをチャネル横断で一元管理
- 2026-07-21: note投稿は公式APIが存在しないため人間が手動投稿する方式に確定（X・Instagramは承認後API自動送信）
- 2026-07-21: デザイン確認セッションを実施——「台紙・アーカイブ」方向性を正式採用
- 2026-07-21: 技術選定セッションを実施し確定——Payload CMS（自己ホスト）＋Astro＋Railway／Cloudflare R2／Pages
- 2026-07-21: Phase 1実装に着手——`cms/`・`site/`の手動セットアップ、AI記事生成パイプラインの土台を作成

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
  決定が必要）。**2026-08-10追加**：Sourcesへの AI/自動化からの読み取り
  アクセス方針の明文化（現状はデフォルトの認証必須のまま運用しているが、
  方針として第12章に未記載）。**2026-08-10 Phase 14開始で追加**：実際の
  `ANTHROPIC_API_KEY`を使ったAI評価結果の質の検証（プロンプト・許容基準の
  妥当性は未検証のまま、このサンドボックス環境ではキー未設定のためAI呼び
  出し自体が試せない。2026-08-10の完成確認セッションでも状況変わらず）、
  Editor's Choice候補の確認・以後の扱いを専用UIで行うか既存のPayload
  管理画面一覧で足りるとするかの判断、AI評価バッチ（`evaluate-inbox`）の
  実行契機（手動実行のみを想定。定期実行の要否・実行頻度は未検討）。
  **2026-08-10 Phase 14完成確認セッションで明確化**：第11章チェックリスト
  「『毎日発信』運用に足る記事の蓄積開始」の基準となる**最低掲載本数
  そのものが未確定**——これが決まらない限り、Phase 14はエンジニアリング
  面（パイプライン実装・検証）が完了していても、公開基準としては完了
  判定ができない。
  **2026-08-10 実AI E2E検証セッションで更新**：`cms/.env`の
  `ANTHROPIC_API_KEY`は空文字ではなく値が設定されているが、実際のAPI
  呼び出しに対し401 `authentication_error`（`invalid x-api-key`）を返す
  ——**有効な鍵ではない**。実AI E2Eが未検証のままである理由が「未設定」
  から「設定されているが無効」に変わった。ユーザー側で鍵の値を再確認
  （タイポ・失効・別環境用の鍵の誤コピー等の可能性）し、有効な鍵に
  差し替える対応が必要（値そのものはClaudeからは確認・訂正できない）。
  これが解消されない限り、実際のAI評価結果の質の検証（直前の項目）にも
  進めない。
  **2026-08-10 実AI E2E再検証セッションで更新**：ユーザーが`.env`の
  `ANTHROPIC_API_KEY`を新しい値に差し替えたが、値の**形状**を確認した
  ところ`sk-ant-`で始まらず・383文字と異常に長く・空白を含むという、
  正規のAnthropic APIキー形式とはまったく異なる状態だった。前回の
  「設定されているが認証エラーで無効」（値の形式は一応キーらしい）から、
  今回は「値そのものがAPIキーの形式になっていない（キー取得用のシェル
  コマンドを誤って貼り付けた可能性）」へ症状が変化している。この状態は
  静的検査だけで判定でき実際のAPI呼び出しをするまでもないため、今回は
  実際のAnthropic API呼び出しを1回も行わずに停止した。ユーザー側で
  Anthropicコンソールから発行された実際のキー文字列（`sk-ant-`で始まる
  もの）を`.env`に貼り付け直す対応が必要。
  **2026-08-15 SOURCE LEDGER v1実装で追加**：①（2026-08-15、DB実投入
  セッションで解消——`seedSourceLedger.ts`によるDB実投入・REST API/管理画面
  URLでの疎通確認は完了。ただし管理画面への実ログイン後の画面表示は
  ログインパスワード非保持のため引き続き未検証、ユーザー側での確認が
  必要）。②SOURCE LEDGERと既存`Sources`コレクションの接続方法
  （巡回結果から`Sources`を自動生成するかどうか等）は未設計。③SEIKO
  HOUSE GINZAの日本語版URL（`seiko.co.jp/ginza2020`）は確認が取れず、
  英語版URLを暫定採用した状態のまま——次回人間の目視確認が必要。
  ④SOURCE LEDGERをどのPhase番号・ロードマップに位置づけるか（第9章の
  Phase 1〜17は今回更新していない）は未決定。⑤自動巡回・差分検知の
  実装自体（enabledな情報源を巡回しlastCheckedAt/lastChangedAtを更新する
  ジョブ）は2026-08-16に実装済み（本節直近の意思決定参照）。
  **2026-08-16 取得品質改善セッションで更新**：POLA MUSEUM ANNEXはUA
  フォーマット改善で解消済み。**東京メトロ（IP/ネットワーク層のブロック）・
  銀座三越（ブラウザ限定の接続レベルの選別）の2件は、実ブラウザへの
  なりすましをしない方針のもとでは解消不可能と判断し確定**——重要な情報源
  として扱うなら、サイト運営者への問い合わせ・公式API/RSSの有無確認・
  手動巡回への切替、を人間が判断する事項として残す。GINZA OFFICIALの
  `changed`誤検知は原因（協賛バナーの表示順ランダムシャッフル）を特定し
  正規化ハッシュ（normalizedContentHash）で解消済み。巡回結果から
  既存`Sources`コレクションへ接続する設計、定期実行（cron等）の要否・
  頻度、`./p2 morning`/`./p2 pmo`への統合要否、いずれも未着手・未決定
  のまま。
  **2026-08-17 巡回結果→Sources接続実装で更新**：上記「巡回結果から
  既存`Sources`コレクションへ接続する設計」は解消した（本節直近の
  意思決定「SOURCE LEDGER 巡回結果 → Sourcesコレクション接続」参照。
  `success:true`かつ`diffStatus`が`changed`/`first_seen`のSnapshotから
  `editorialStatus:inbox`のSourceを冪等に生成し、既存のPhase 14
  `evaluate-inbox`にそのまま合流する設計で実装・ローカル実データで検証
  済み）。**2026-08-17 定期実行実装で更新**：「定期実行（cron等）・
  `./p2 morning`/`./p2 pmo`への統合」も解消した（本節直近の意思決定
  「SOURCE LEDGER 定期実行：Payload Jobs Queueの採用と`./p2 morning`
  統合」参照）。OSレベルのcronではなくPayload純正のJobs Queueを採用し、
  毎朝6:00（サーバーローカルタイム基準）に自動巡回、`./p2 morning`/
  `./p2 pmo`には新設`./p2 jobs`（次回実行予定・直近成功/失敗を表示する
  読み取り専用コマンド）を統合した——巡回の**実行**自体はJobs Queueが
  担うため、`./p2 morning`が`./p2 crawl`を直接呼ぶ必要がなくなり、
  従来の統合見送り理由（外部14サイトへの実ネットワークアクセスを毎朝の
  起動シーケンスへ無条件追加）が構造的に解消された。残る新しい未決事項：
  Railway本番展開時の`TZ=Asia/Tokyo`環境変数設定（付録F、未実施）。
  加えて2026-08-17時点で、生成された27件のinbox候補に対する実際の
  AI評価（`ANTHROPIC_API_KEY`無効のため未検証）、`contentRef`に埋め込む
  excerptのノイズ除去（回転バナー・ランキング等）、も未解決のまま
  残っている（詳細は本節直近の意思決定参照）。
  **2026-08-17 編集判断レイヤー実装で更新**：Editorial Score・
  Audience Tags・Score順ランキング・Top候補までのパイプラインを追加した
  （本節直近の意思決定「「旬の銀座」編集判断レイヤー」参照）。**現在の
  28件のInbox候補は全件heuristic-placeholderで仮採点済み**——本物の
  AI評価ではなく、`ANTHROPIC_API_KEY`が有効になり次第`./p2 score --force`
  でclaude採点へ切り替える必要がある未解決事項として残る。交差性
  （People×Culture×Commerce×Technology×Time）は評価ロジック未実装
  （フィールドのみ、空欄運用）。
  **2026-08-17 個別記事・イベント抽出実装で更新**：トップページ検知
  （サイト単位）だけでなく、個別URL単位で「何が新規/更新されたか」を
  特定できるようになった（本節直近の意思決定「トップページ更新検知 →
  個別記事・イベント抽出」参照）。新規`DiscoveredContent`コレクション
  （1URL＝1行）・`./p2 daily`（Daily Editorial Desk）を追加。**現在の
  160件のDiscoveredContentも全件heuristic-placeholderで仮採点済み**——
  Sources同様、有効な鍵が用意でき次第`./p2 score-articles --force`で
  claude採点へ切り替えが必要。公開日13件・開催期間0件が構造化データから
  取得できている（本文自由テキストからの推測は行っていない、既知の
  限界として本文がJSON-LD/メタタグを持たないページでは日付が
  取得できない）。
  **2026-08-28 `draft-today`検収で追加**：①`draft-today`の類似テーマ統合
  （バイグラムJaccard≥0.6）と上限スライス（最大5）は、承認候補が2件
  （かつ非類似）のため実データE2E未発火——型検査・コードレビューのみ。
  distinctトピック>5、または類似2件、の状況が来たら一度`--dry-run`で
  発火を実確認する。②AI生成ドラフトの記号入りタイトル・`slug`・英語
  固有名詞ハッシュタグ（例：`〈LEAK〉`／`#LEAK`）の自動整形は未処理
  （RUNBOOKS付録C、既知TODO、公開前に編集長が手動整形する前提）。
  ③`draft-today`の「当日」判定はサーバープロセスのローカルTZ依存——
  本番Railwayは`TZ=Asia/Tokyo`必須（RUNBOOKS付録F、SOURCE LEDGER cronと
  同じ設定でまとめて解消）。

- **次回セッション最初に行うべき作業（2026-08-17時点）**：SOURCE LEDGERの
  「巡回→Snapshot→Diff→Sources接続→定期実行（Payload Jobs Queue）→
  個別記事・イベント抽出（DiscoveredContent）→Editorial Score/
  Audience Tags→ランキング（サイト単位・個別記事単位）→Daily Editorial
  Desk」までの一連のパイプラインはローカル環境で安定動作を確認済みの
  状態でセッションを終了した。次回は以下のいずれかから着手するとよい——
  優先度の指定はなく、ユーザーの判断に委ねる。①**ANTHROPIC_API_KEYは
  有効化済み**（2026-08-17、本節直近の意思決定参照）。**Sources
  （サイト単位）30件・DiscoveredContent（個別記事・イベント単位）160件の
  両方が全件実Claudeで採点済み**——Editorial Score/Audience Tagsの
  仮採点は残っていない。あわせて既存Phase 14の`evaluate-inbox`（要約・
  Editor's Choice候補判定、承認proceed/reject）も同じ鍵で動くはずだが、
  こちらはまだ実際に試していない（次回の候補）。②**Maron
  Editor's Choiceの実運用**：`./p2 ranking`のTop候補を見て、
  実際にeditorialStatusをapproved等へ進める運用フローを試す（人間承認
  ゲートは既存のまま、今回変更なし）。③**Railway本番展開時のTZ設定**：
  付録Fの本番構築手順に`TZ=Asia/Tokyo`環境変数の追加を反映する（本番展開
  自体はまだ先だが、手順書への反映は今のうちに行ってもよい）。
  ④**excerptのノイズ除去**：ランキング・回転要素等、並び順に意味がある
  ページのcontentRef品質改善（現状は2026-08-16の正規化はdiffStatus判定に
  のみ使用、Source生成時の`contentRef`は正規化前のexcerptをそのまま
  使っている——ヒューリスティック採点のUXスコアがこのノイズの影響を
  受ける可能性がある）。⑤**交差性（People×Culture×Commerce×Technology×
  Time）の実評価ロジック**：今回はフィールドのみ準備、値は空欄のまま。
  ⑥**Maron Editor's Choiceの個別記事単位での実運用**：`./p2 daily`の
  Daily Top10を見て、実際に`DiscoveredContent.curationStatus`を
  approved/rejectedへ進める運用フローを試す（人間承認ゲートは実装済み・
  今回は使っていない）。⑦**個別記事抽出の質の改善**：contentType
  ヒューリスティックの誤分類（サイト内検索リンクが「イベント」に
  誤分類される例を実データで確認済み）の改善、外部origin（他ドメインに
  委託されたイベントページ等）への対応要否の検討。⑧それ以外に、
  Root第5.3節に基づき10月ローンチ最優先の観点では、本項目直下の
  「Phase 13が完了したため、残る公開ブロッカーは付録Fの本番インフラ構築」
  の記述が引き続き有効——SOURCE LEDGER・編集判断レイヤー・個別記事抽出
  関連作業は第9章のPhase 1〜17・第11章チェックリストの対象外（未計画の
  新規スコープ）のため、10月ローンチの進捗そのものには影響していない。

- **次のマイルストーン**：Phase 13（HEIC実機検証）が完了したため、残る
  公開ブロッカーは付録Fの手順に沿った本番インフラの実際の構築
  （Cloudflare Pages／Railway／R2のアカウント設定・DNS追加、本番Postgres
  スキーマ移行の実地検証）に絞られた——いずれも各サービスのダッシュボード
  操作が必要なためユーザー側の対応が前提。**2026-08-09時点でドメイン取得
  （Cloudflare Registrar）とRailwayプロジェクト作成＋PostgreSQLプラグイン
  追加（空DB）まで完了**（詳細は本章2026-08-09の決定ログ）。続く工程は
  付録Fの記載順・既知の制約（付録B：CMS未起動時のAstroビルド失敗）を
  踏まえて個別に判断する。あわせてInstagram Meta App Review申請の前提
  整備（Business Verification状況の確認）に着手する。ギャラリー機能の
  実装は02の進捗を見て再判断する方針のため、当面の次のマイルストーンから
  は外れる。SNS配信キュー基盤（Phase 15、外部認証・実投稿を除く範囲）は
  2026-08-10完成済みのため、Instagram Meta App Review／X OAuthが揃い次第
  `./p2 social`で候補生成→人間承認→実配信まで運用開始できる状態にある。
  **本番インフラ構築の事前準備（Preflight）も2026-08-10完了**（付録F
  「Preflight」節）。次回は`./p2 preflight`を実行して現状（env var名の
  設定有無・CLI認証状態・ローカルビルド）を再確認したうえで、付録Fの
  手順どおりCloudflare Pages／Railway／R2の実アカウント操作に進める。
  **日次の作業開始準備も2026-08-10自動化済み**：`./p2 morning`
  （本節直近の意思決定）を実行すれば、ローカル環境起動→`status`／
  `doctor`／`editorial`／`social`／`preflight`の一括確認→今日の推奨
  工程の提示までを1コマンドで行える（外部ログイン・課金・本番デプロイは
  行わない）。次回セッションはまずこれを実行してから本項目の続きに
  進んでよい。

- **最終更新日**：2026-08-28

## 13. 運用コスト方針（2026-08-09確定）

Project 02の本番運用（トライアル運用）にあたり、以下のコスト上限を定める。
実装・インフラ構築（第6章・付録F）はこの方針の範囲内で行う。

- **月額運営コスト上限**：5,000円。到達が見込まれた時点で、追加のリソース
  利用（新規サービスの有効化、ストレージ・処理量が増加する操作等）を
  停止し、ユーザーに確認する。
- **通常運用の目標水準**：月額3,000円以内。
- **警戒水準**：月額3,000円を超過した時点で警戒とし、コスト増加要因を
  確認する。
- **Cloudflare R2（画像ストレージ）**：無料枠内での運用を原則とする。
  無料枠超過を防ぐため、使用量（ストレージ容量、Class A/B operationsの
  回数等）を監視する設計を、R2の実装に含めること。
- 本方針は付録Fの本番インフラ構築（特にRailway・Cloudflare R2）に適用
  される。R2バケットの実際の作成・有効化は、この使用量監視の設計を伴った
  上で行う（付録F第3節に注記済み）。

**R2料金体系・無料枠の確認結果（2026-08-09、Cloudflare公式ドキュメント
retrieval確認）**：
- 無料枠：ストレージ月10GB（Standard storageのみ対象、Infrequent Access
  storageは対象外）、Class A operations月100万回、Class B operations月
  1,000万回、エグレスはR2純正の経路経由であれば無料。超過分は使用量に
  応じて課金（端数は切り上げ）。
- Railwayの具体的な料金体系・無料枠は本ファイル内で未確認のまま
  （実装時に確認する）。

**監視手段の確認結果（同日確認）**：
- Cloudflareには2026-04-13導入の「Budget alerts（予算アラート）」機能が
  存在し、2026-06-15からPay-as-you-goアカウントでデフォルトON（$10の
  アカウント全体閾値）になっている。米ドル建てのアカウント全体の従量課金
  合計額に対する閾値超過をメール通知する機能で、R2はドキュメント内で
  対象例として明示されている（「R2 spend warning」）。判定はリアルタイム
  ではなく1日1回の集計で、閾値到達の**翌日**に通知される。
- **重要な制約（公式ドキュメントで明記）**：Budget alertsは通知のみで、
  利用の一時停止や上限キャップは行わない（原文：「Budget alerts do not
  pause or cap usage.」）。無料枠超過による課金を自動的に止める仕組みは
  Cloudflare側には存在しないことを確認した。
- R2有効化時の支払い方法登録の要否、支払い方法未登録時に無料枠超過が
  どう扱われるかは、公式ドキュメントからは確認できなかった。

**二段階監視方針（2026-08-09確定、上記確認結果を踏まえた設計）**：
- Cloudflareの仕組みだけでは自動停止が実現できないため、「Budget
  alertsによる通知」と「通知を受けた後の人力での利用停止判断」を組み
  合わせた運用とする。
- Budget alertsを2本設定する：警戒ライン（3,000円相当）と上限ライン
  （5,000円相当）。Budget alertsは米ドル建てのため、設定時点の為替
  レートで変換し、変動幅を見込んでやや低め（安全側）の金額に丸めて
  設定する（2026-08-09時点の参考レート：1USD≈158円。実際の設定は
  その時点のレートで確認すること）。
- 上限ラインのアラートを受信した場合、Railway・Cloudflare双方の追加
  利用（新規リソース作成、ストレージ・処理量が増加する操作等）を人力で
  停止し、ユーザーに確認する（第13章冒頭の「月額運営コスト上限」の運用
  ルールと同一）。
- Budget alertsが1日1回集計・翌日通知という遅延特性を持つため、R2
  ダッシュボードでの使用量の定期的な目視確認を補完手段として併用する。
- R2バケットの実際の作成・有効化時に、この二段階アラート設定を先に
  行うこと（付録F第3節に注記済み）。

---

# 付録

付録A〜F（セットアップ手順、Phase 1実装状況、既知のプレースホルダー、
スキーマ関連トラブルシューティング手順、Instagram Meta App Review
申請ランブック、本番インフラ構築ランブック）は、2026-08-21、CLAUDE.mdの
肥大化（150,000文字上限超過）を解消するための分割作業で `RUNBOOKS.md`
（プロジェクトルート）へ移設した。**内容はそのまま全文を保持しており、
削除・要約は行っていない**。本番インフラ構築・Instagram申請・スキーマ
移行トラブル対応が必要な際は `RUNBOOKS.md` を参照すること。
