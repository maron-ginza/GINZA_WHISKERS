# Project 02 意思決定ログ（1/2：過去分）

このファイルは `CLAUDE.md` 第12章の意思決定ログのうち、**古い方の期間
（2026-07-21〜2026-08-17）** を保持する。2026-08-21、CLAUDE.mdの肥大化
（150,000文字上限超過）を解消するための分割作業で作成した。原文は
`CLAUDE.md.backup-20260821.md`（分割前の全文バックアップ）からそのまま
転記しており、内容の要約・書き換えは行っていない。

- 新しい方の期間（2026-08-17〜2026-08-19、直近の重要決定を含む）は
  `DECISION_LOG_02.md` を参照。
- 現行の仕様・方針・未決事項・直近の重要決定の要約は `CLAUDE.md` 本体を
  参照（本ファイルは経緯の記録であり、現行ルールの正本ではない）。
- 各エントリの並び順は分割前の原文と同じ（新しい日付が先、古い日付が後）。

---

  - 2026-08-17（Sources（サイト単位）28件も実Claudeで全件採点完了）:
    直前の意思決定でDiscoveredContent 160件の実AI採点に成功したのに続き、
    `./p2 score --force`（`scoreSources.ts --force --limit 50`）を実行し、
    Sources（サイト単位のInbox候補）30件全件（前回セッションの
    heuristic-placeholder 28件＋未採点2件）を実際のClaudeで採点した。
    **30件全件成功・エラー0件**——直前の意思決定で修正した
    `sanitizeAudienceTags`／システムプロンプトの'all'誤用修正が正しく
    機能し、DiscoveredContentで発生した4件のバリデーションエラーは
    再発しなかった。`./p2 ranking`で確認したところ、歌舞伎座
    （Source #41・#29、66点・65点）・SHISEIDO GALLERY（Source #40・#48・
    #27）が上位を占める、編集的に妥当な結果が得られた（歌舞伎座は銀座を
    象徴する文化施設、資生堂ギャラリーも銀座の老舗文化拠点——いずれも
    ヒューリスティック仮採点時には他の候補と均質化されていたが、実AI
    採点では明確に差別化された）。**これにより、Sources（サイト単位）
    30件・DiscoveredContent（個別記事・イベント単位）160件の両方が
    全件`scoringMethod:'claude'`となり、本プロジェクトのEditorial Score/
    Audience Tagsパイプラインが実データ全件で本物のAI評価を持つ状態に
    到達した**。
    **検証**：`tsc --noEmit`（cms、0エラー）。ローカルDocker/Postgres
    環境で、採点前後にArticles 8件・SocialPosts 0件・DiscoveredContent
    160件が完全に不変であることを確認。`./p2 doctor`の回帰も確認し
    異常なし。検証後は`./p2 stop`で全サービスを安全に終了済み。秘密情報
    は一度も表示・記録していない。**今回は行っていない**：
    `curationStatus`／`editorialStatus`の承認・却下（Editor's Choice
    確定）。本番Railway・課金操作・権限設定・Git pushはいずれも一切
    行っていない。
  - 2026-08-17（**実AI E2E初成功**：DiscoveredContent 160件を実際の
    Claudeで全件採点）: ユーザーがAnthropicアカウントにクレジットを追加。
    `./p2 score-articles --force`を再実行したところ、**このプロジェクト
    史上初めて実際のClaude API呼び出しによるEditorial Score/Audience
    Tags採点が成功した**（2026-08-10以降、鍵未設定→無効→シェル
    コマンド断片混入→残高不足、と重ねてきた一連のブロッカーが全て解消）。
    **実装中に発見・修正した2件の実バグ**：①`scoreSource.ts`のシステム
    プロンプトが「判断がつかない場合はそれぞれ'all'を含めること」と
    3カテゴリ一律の指示をしていたが、`generation`には`'all'`という値が
    スキーマ上存在しない（next/core/mature/timelessのみ）ため、Claudeが
    `generation`に`'all'`を含めると`Payload`のselectフィールド
    バリデーションでEditorial Score全体（NOW〜DISCOVERYの正しい採点結果
    ごと）が書き込み失敗する事故が発生（2件で実際に発生を確認）。
    プロンプトを修正し「'all'はgenderAffinity/visitStyleのみ、generation
    で判断がつかない場合は'timeless'」と明示した。②加えて、無効な値が
    将来また混入しても採点結果全体を失わないよう、`lib/curation/
    types.ts`に`sanitizeAudienceTags`（許可値へのフィルタリング、配列で
    ない値も`Array.isArray`で防御）を新設し、`scoreSourceById.ts`・
    `scoreDiscoveredContentById.ts`の両方に適用した（AIの出力を鵜呑み
    にしない、という既存の`computeEditorialScoreTotal`と同じ設計思想を
    Audience Tagsにも拡張）。修正後、当初発生した計4件のエラー
    （id 149, 141: 'all'混入／id 64, 1: 配列でない値）は全て解消し
    再採点に成功した。
    **実行**：既に実Claudeで採点済みだった10件（前回セッションの動作
    確認分）への無駄な再課金を避けるため、`./p2 score-articles --force`
    の既定バッチ処理ではなく、`scoringMethod:'heuristic-placeholder'`の
    ものだけを狙い撃ちする使い捨てスクリプトで残り150件を処理した
    （バックグラウンド実行、約20分）。**最終結果：DiscoveredContent
    160件全件が`scoringMethod:'claude'`——このプロジェクトで初めて
    実データ全件が本物のAI評価を持つ状態に到達した**。`./p2 daily`で
    実際にTop10を確認したところ、ヒューリスティック仮採点時とは質的に
    異なる、編集的に妥当な結果が得られた（資生堂ギャラリーの展覧会関連
    トークイベント、銀座もとじの特別展示、歌舞伎座の限定メニュー等が
    上位——いずれも実際に「今日行く価値がある」銀座文化コンテンツとして
    妥当な選定）。
    **検証**：`tsc --noEmit`（cms、0エラー）・`astro check`（site、
    0エラー）。ローカルDocker/Postgres環境で、採点前後でSources 30件・
    Articles 8件・SocialPosts 0件が完全に不変であることを確認
    （スコアリングはeditorialScore/audienceTagsフィールドのみを書き換え、
    他のデータには一切影響しない設計どおり）。`./p2 editorial`・
    `./p2 articles`の回帰も確認し異常なし。検証後は`./p2 stop`で全
    サービスを安全に終了済み。秘密情報（APIキーの値）は本セッションでも
    一度も表示・記録していない。**今回は行っていない**：Sources（サイト
    単位）28件の実Claude再採点（`./p2 score --force`、次回以降の課題として
    残す。現状は前回セッションのheuristic-placeholderのまま）、
    `curationStatus`の承認・却下（Editor's Choice確定）。本番Railway・
    課金操作（クレジット追加自体はユーザーが実施）・権限設定・Git push
    はいずれも一切行っていない。
  - 2026-08-17（ANTHROPIC_API_KEY差し替え3回目：鍵は有効化・残高不足で
    ブロック）: 前回セッションの2回の失敗（値がシェルコマンド断片だった
    問題）を受け、ユーザーが`pbpaste`でクリップボードから鍵を読み取り
    `.env`の`ANTHROPIC_API_KEY=`行を置換するPythonコマンド（鍵の値を
    一切標準出力に出さない設計）を提示。Claude（実行環境がユーザーの
    実機であるため`pbpaste`が実際に機能する）がこれを実行し
    `cms/.env`を更新した。**形式チェックは今回初めて合格**（108文字、
    `sk-ant-`始まり、空白なし、ファイルの更新日時も実行直後に変化した
    ことを確認）。`./p2 score-articles --force`を実行したところ、
    **実際にAnthropic APIへ到達し、有効なリクエストとして認識された**
    （実在の`request_id`が返る）——鍵の形式・認証自体は前2回と異なり
    正常に機能している。ただし`Your credit balance is too low to
    access the Anthropic API`（400 invalid_request_error）で10件全て
    失敗——**Anthropicアカウントの請求残高不足**が原因であり、鍵の
    問題ではない。これは外部サービスの課金に関わる領域のため、Claudeが
    代行することはできず、ユーザー側でAnthropic Console→Plans &
    Billingでのクレジット追加が必要。**失敗した10件は書き込みが
    一切発生せず**（`scoreDiscoveredContentById`は`score()`が成功した
    場合のみDBに書き込む設計のため）、既存のheuristic-placeholder
    採点値・`scoredAt`タイムスタンプがそのまま保持されていることをDB
    直接確認で検証した（データ破損なし）。DiscoveredContent 160件・
    Sources 30件・Articles 8件、投入前と完全一致。検証後は`./p2 stop`
    で全サービスを安全に終了済み。秘密情報の値は一度も表示・記録して
    いない。
  - 2026-08-17（ANTHROPIC_API_KEY差し替え再試行・またも失敗）: ユーザーから
    「ANTHROPIC_API_KEYを差し替えた」との申告を受け`./p2 score-articles
    --force`を実行したが、鍵の形式チェックが引き続き異常を検出し
    ヒューリスティック仮採点にフォールバックした（実際のClaude API呼び
    出しは今回も1回も発生していない）。値は一切表示・記録せず、
    ①長さ16文字、②`sk-ant-`で始まらない、③空白を含む、④先頭8文字が
    `"python3 "`・末尾4文字が`"'PY'"`、という形状のみを確認した——鍵の値
    ではなく鍵を取得・生成する際に使ったシェルコマンドの断片が
    `.env`に誤って貼り付けられている可能性が高い（2026-08-10の実AI E2E
    再検証セッションで発生した事象と同じパターンが再発）。ユーザー側で
    `cms/.env`の`ANTHROPIC_API_KEY=`行を確認し、`sk-ant-`で始まる鍵の
    値のみが入っているか（コマンド文字列や引用符が混入していないか）を
    見直す対応が必要。`./p2 score-articles --force`は安全にフォールバック
    し害はなかった（10件を同じヒューリスティック手法で再採点しただけ、
    データ破損なし）。検証後は`./p2 stop`で全サービスを安全に終了済み。
  - 2026-08-17（トップページ更新検知 → 個別記事・イベント抽出）:
    これまでSOURCE LEDGERの巡回は「サイトのトップページ全体が変化したか」
    という粒度（サイト単位）に留まっていた。この工程で、トップページ上の
    リンクから個別記事・イベントURL単位のエンティティを抽出し、「何が
    新規または更新されたのか」を具体的に特定できるようにした。
    **設計方針（マロン指示を反映）**：①情報は収集段階で除外しない——
    Ginza関連らしいリンクを広く抽出したうえで、後段でEditorial Score/
    Audience Tagsを付与する構成は変えていない。②既存パイプライン
    （SOURCE LEDGER→Snapshot→Diff→Sources→Inbox→Editorial Score）は
    1行も変更していない——新しいレイヤーは完全に並行する形で追加した
    （後述の`fetchArticlePage.ts`を意図的にfetchSource.tsから複製した
    判断も同じ理由）。③公開日・開催期間は構造化データ（JSON-LD／
    article:*メタタグ／itemprop付きtimeタグ）からのみ取得し、本文中の
    自由テキストの日付表現からは絶対に推測しない——前回セッションの
    鮮度調査で「トップページ本文の日付を記事公開日と誤認しないこと」の
    重要性が実例で示されたため、個別記事ページでも同じ慎重さを踏襲した。
    不明な場合は一貫してnull。④最終承認は個別記事・イベント単位でも
    Maron Editor's Choiceが行う（`curationStatus`、Sources.editorialと
    同じ人間ゲートパターン）。⑤Editorial Score/Audience Tagsは既存の
    `scoreSource.ts`/`heuristicScore.ts`をそのまま再利用し、個別記事・
    イベント向けの重複実装はしていない。
    **新規コレクション`DiscoveredContent`（`discovered-content`）**：
    1URL＝1行の永続エンティティ（SourceLedgerと同じ設計、
    SourceSnapshotsのような追記ログではない）。`sourceSite`
    （SourceLedgerへの参照）・`articleUrl`（正規化後、重複判定キー、
    `(sourceSite, articleUrl)`にDB複合unique制約）・`rawUrl`（正規化前、
    将来の再正規化に備えた保持）・`title`・`publishedAt`・
    `contentUpdatedAt`（Payload標準の`updatedAt`＝DBレコード自体の更新
    時刻と意味が衝突するため別名にした）・`eventStartAt`／`eventEndAt`・
    `excerpt`・`detectedAt`（巡回のたび毎回更新）・`discoveryStatus`
    （first_seen/changed/unchanged）・`contentType`（event/news/
    exhibition/food/shopping/culture/other）・`linkFingerprint`
    （変化検知用）・`articleFetchStatus`（Stage 2取得の成否）・
    `lastCheckedAt`・`lastChangedAt`（後述）・`editorialScore`／
    `audienceTags`（Sources.tsと同一構成）・`curationStatus`＋人間ゲート
    フックを持つ。
    **抽出パイプライン（`cms/src/lib/crawler/`新規5ファイル）**：
    ①`extractLinks.ts`（`extractGinzaRelevantLinks`。フルHTMLパーサーは
    導入せず正規表現ベース——既存のnormalizeHtml.ts/fetchSource.tsと同じ
    方針。同一origin内部リンクのみ、記事/イベントらしいパスキーワード・
    日付様パス・アンカーテキスト長でスコアリングし上位15件に絞る、
    サイト固有ハードコードなしの汎用実装）、②`normalizeUrl.ts`
    （クエリパラメータ・フラグメント・末尾スラッシュ・大文字小文字host
    を正規化。将来の再正規化に備えrawUrlも別途保持）、
    ③`classifyContentType.ts`（URLパス・タイトル・JSON-LD @typeによる
    contentTypeの単純なキーワードヒューリスティック）、
    ④`extractStructuredDates.ts`（JSON-LD／article:*メタタグ／
    itemprop付きtimeタグのみを信頼し、本文自由テキストからの日付抽出は
    意図的に採用しない設計）、⑤`fetchArticlePage.ts`（個別記事ページの
    実HTTP取得、Stage 2。**fetchSource.tsとはロジックを共有せず意図的に
    複製した**——毎朝のPayload Jobs Queue cronが依存する既存のトップ
    ページ巡回に一切手を入れないための安全側の判断。robots.txtチェック
    とUser-Agent定数のみ共有）。オーケストレーター
    ⑥`processDiscoveredLinks.ts`（Stage 1：リンクごとにdiscoveryStatusを
    判定・反映、Stage 2：新規/更新候補のみ、1巡回あたりの合計予算内で
    実ページ取得——既定20件、コスト制御）。
    **既存コードへの結線（最小変更）**：`fetchSource.ts`の
    `FetchOutcome`に`links`（抽出済みリンク一覧）・
    `linksDuplicatesRemoved`（同一ページ内重複除外数）の2フィールドを
    追加しただけ（既存フィールド・ロジックは無変更、既存呼び出し元は
    新フィールドを単に無視するため非破壊）。`runCrawl.ts`は各サイトの
    トップページ取得成功後に`processDiscoveredLinks`を追加で呼ぶだけの
    末尾追記（Snapshot保存・diff判定ロジックには触れていない）。
    `BOT_TOKEN`/`USER_AGENT`を`fetchSource.ts`からexportに変更（可視性の
    みの変更、値は無変更）。
    **重要なバグ発見と修正（実地テストで発見）**：`detectedAt`
    （巡回のたび毎回更新）だけで「本日新規/更新」を判定する初期設計では、
    同日に2回以上巡回すると2回目の"unchanged"判定でdetectedAtが上書き
    され、当日1回目に発見した新着記事までDaily候補から漏れることが実地
    テストで発覚した（`./p2 crawl`を同日に3回実行し検証）。SourceLedgerの
    `lastCheckedAt`/`lastChangedAt`と同じ設計思想を踏襲していなかったのが
    原因——`DiscoveredContent`にも`lastChangedAt`（first_seen/changedの
    回のみ更新）を追加し、Daily判定・DB状態サマリーの両方をこちらに
    差し替えて修正した。同日3回巡回後も「本日新規/更新候補」が正しく
    160件のまま維持されることを再検証済み。
    **Daily Editorial Deskの母集団ロジック（`lib/curation/
    dailyRanking.ts`）**：A.`lastChangedAt`が本日の候補、B.
    `contentType:'event'`かつ`eventStartAt <= 現在 <= eventEndAt`の
    両方が判明している開催中候補、の和集合のみをTop10母集団とする——
    discoveryStatusが`unchanged`になった古いInbox残留候補は自動的に
    混入しない設計を、バックデートによる人工的な検証（1件の
    `lastChangedAt`を意図的に「昨日」へ書き換え→Daily候補から除外される
    ことを確認→復元→再度含まれることを確認）で実証した。
    **スコアリング接続（既存ロジックの再利用のみ）**：
    `scoreDiscoveredContentById.ts`／`scoreDiscoveredContentBatch.ts`は
    `scoreSourceById.ts`／`scoreInboxSources.ts`と全く同じ構造で、
    書き込み先のコレクションのみを差し替えている（AIロジックの
    重複実装はしていない）。エンドポイントは`POST /api/ai/
    score-discovered-content`・`/api/ai/score-discovered-inbox`
    （`/discovered-content/...`のような衝突しうるパスは使わず`/ai/...`
    名前空間——前回セッションで発見・修正したPayloadルーティングの罠を
    踏まえた設計）。
    **CLI**：`./p2 crawl`が個別記事・イベント抽出の集計（抽出総数・
    重複除外件数・初回検知/更新検知/変化なし・Stage 2試行/成功・公開日/
    開催期間取得件数）を自動的に表示するよう拡張。新規`./p2 articles`
    （DiscoveredContent現在状態の読み取り専用サマリー）・
    `./p2 score-articles [--force]`（`./p2 score`と同じ鍵形式自動判定・
    ヒューリスティックフォールバック）・`./p2 daily`（Daily Editorial
    Desk Top10、読み取り専用）を追加。
    **既知の制約（実装済みだが未対応、次回以降の課題）**：①`./p2 score`
    /`./p2 score-articles`のシェルラッパーは`--force`のみを転送し
    `--limit`を転送しない（Sources向け`score()`から踏襲した既存の制約、
    今回新規に生んだものではない。ローカル検証では基盤スクリプトを
    直接複数回呼んで160件を採点した）。②`./p2 daily`のCLI出力は
    Top30件に切り詰める（2026-08-17実地テストで発見——160件の全件を
    1行JSONとして`tail -1`パイプ越しに渡すと64KBのバッファ上限で
    JSONが破損することが判明したための対応。集計値〈総数・プール
    サイズ・除外数〉はフル計算のまま保持し、表示のみ切り詰める）。
    ③Stage 2の記事分類（contentType）はキーワードヒューリスティックの
    ため誤分類がある（実データで確認：サイト内検索リンクが
    「イベント」に誤分類される例あり）。④同一origin外部リンクは
    Stage 1の対象外（意図的なスコープ限定、Ginza公式サイトが他ドメインに
    委託している特集ページ等は拾えない）。
    **検証**：`tsc --noEmit`（cms、0エラー）・`astro check`（site、
    0エラー）。ローカルDocker/Postgres環境で実データを使った検証：
    ①CMS再起動時に新規テーブル・列（`discovered_content`本体＋
    Audience Tags用3つのjoinテーブル、`last_changed_at`列の追加を含む）が
    対話プロンプトなしで自動作成され、既存データ（Sources 28・
    Articles 8・SocialPosts 0・SourceSnapshots 98）が無傷であることを
    確認。②`./p2 crawl --dry-run`で実際に14サイトへ本物のHTTP取得を
    行い、160件のリンク抽出・344件の重複除外・Stage 2（20件試行・
    20件成功・公開日13件取得）を確認したうえで、DBへの書き込みが
    実際に0件（discovered_content件数が実行前後で不変）であることを
    確認。③実書き込みでの初回巡回で同じ160件が実際に作成されることを
    確認（dry-runと完全に同じ抽出結果——決定性の確認）。④2回目・3回目の
    同日巡回で、新規作成0件・全件`unchanged`判定・Stage 2再取得0件
    （コスト制御が機能）・DiscoveredContent総数が160件のまま変化しない
    ことを確認（冪等性）。⑤`./p2 score-articles`（ヒューリスティック
    モード）を実行し160件全件を採点、`./p2 daily`でTop10を実際に表示
    ——1位「2026中央区『わくわくツアー』参加者募集のお知らせ」80点
    （中央区観光関連、本日新規/更新）等、実データでの動作を確認。
    ⑥前述のバックデート検証でDaily除外ロジックの正しさを実証。
    ⑦`curl -X POST /api/ai/score-discovered-content`・
    `/score-discovered-inbox`が未認証で401を返すこと（ルーティングバグの
    再発がないこと）を確認。⑧`./p2 doctor`・`./p2 editorial`・
    `./p2 social`・`./p2 jobs`・`./p2 ranking`・`./p2 sources`・
    `./p2 morning`のフル回帰も確認し異常なし（Articles 8件・
    SocialPosts 0件は本セッション開始時点と完全一致。Sourcesは28→30件
    ——本セッション中の実クロールで検知した2件の正当な新規サイト単位
    changedによるもの、既存挙動どおり）。検証後は`./p2 stop`で全
    サービスを安全に終了済み。
    **今回は行っていない・意図的にスコープ外**：①実際のAnthropic API
    呼び出し——`ANTHROPIC_API_KEY`は変更しておらず、160件全件
    heuristic-placeholderで仮採点済みのまま（有効な鍵が用意でき次第
    `./p2 score-articles --force`でclaude採点へ切り替え可能）。
    ②`curationStatus`の承認・却下（Editor's Choice確定）・記事化への
    接続は今回行っていない——調査・表示・採点までがスコープ。
    ③Payload管理画面での`discovered-content`一覧の実ログイン後の目視
    確認は、既存の運用方針（管理画面ログインパスワード非保持）により
    今回も未実施。④外部サイトの個別記事URL（同一origin外）・robots.txt
    禁止パスへのアクセス試行は行っていない（robotsTxt.tsの既存チェックを
    そのまま踏襲）。本番Railway・秘密情報・課金操作・権限設定・
    Git pushはいずれも一切行っていない。
  - 2026-08-17（「旬の銀座」編集判断レイヤー：Editorial Score・Audience Tags）:
    SOURCE LEDGER→Snapshot→Diff→Sources候補→Inbox→morningまで完成したパイプ
    ラインに、Inbox候補を評価・順位付けする編集判断レイヤーを追加した
    （マロン指示：Editorial Score 100点満点5軸・Audience Tags・
    People×Culture×Commerce×Technology×Time交差性の将来拡張性）。
    **設計方針（マロン指示を忠実に反映）**：①Audience Tagsは収集段階で
    情報を除外するfilterではなく、複数選択可の付加情報として実装した
    （Sourcesの生成・巡回ロジックは一切変更していない——除外は一切発生
    しない）。②AIは「Editorial Desk」として評価・順位付けのみを行い、
    editorialStatus（承認・公開・却下の状態機械、Phase 14）には一切
    触れない設計にした——既存のevaluateSource.ts／evaluateSourceById.ts
    （記事化のproceed/reject判定、Phase 14）とは完全に独立した並行レイヤー
    として追加し、既存コードは1行も変更していない。③最終採用は人間
    （Maron Editor's Choice）が既存の承認フロー（editorialStatus→
    approved/published、人間ゲート）で行う——このレイヤー自体は状態を
    変更する権限を持たない。④交差性（People×Culture×Commerce×
    Technology×Time）は過剰実装を避け、フィールド（`intersectionality`、
    5値の複数選択、AI未算出のプレースホルダー）のみ準備した。
    **スキーマ変更（Sources.ts、非破壊的な追加のみ）**：
    `editorialScore`グループ（NOW/GINZA/UX/STORY/DISCOVERYの5軸スコア
    ＋各判定理由＋合計`total`＋`scoringMethod`＋`scoredAt`。配点は
    30/25/20/15/10の指示どおり固定）、`audienceTags`グループ
    （`genderAffinity`/`generation`/`visitStyle`、いずれも複数選択可の
    select、Familyはgenerationではなくvisit styleとして分離——マロン
    指示どおり）、`intersectionality`（将来用プレースホルダー、5値
    複数選択）。**総合点は AI/ヒューリスティックの自己申告を信用せず、
    書き込み時にサーバー側（`computeEditorialScoreTotal`）で5軸から
    再計算する**（AIの単純な計算ミスをスキーマレベルで無害化する防御的
    設計、evaluateSourceById.ts等の既存の「人間ゲート」思想と同じ
    「AIの出力を鵜呑みにしない」姿勢を踏襲）。
    **実装**：`cms/src/lib/curation/`配下に新規5ファイル——
    ①`types.ts`（Payloadに依存しない純粋な型定義。5軸・配点・
    Audience Tags・交差性の列挙値と日本語ラベル。
    lib/sourceLedger/types.tsと同じ設計方針）、②`scoreSource.ts`
    （本番のClaude実装。evaluateSource.tsと同じtool-use方式、
    システムプロンプトに「あなたは編集長ではない」「Editorial Score
    5軸の配点」「Audience Tagsは除外用ではない」を明記）、
    ③`heuristicScore.ts`（ANTHROPIC_API_KEY無効時のローカル検証用
    ヒューリスティック仮採点。キーワード・文字数等の単純なルールベース
    近似値で、`scoringMethod:'heuristic-placeholder'`として明示的に
    区別保存——本物のAI評価とは呼ばない誠実な設計とし、有効な鍵が
    用意でき次第これらだけをforce再採点する運用を想定）、
    ④`scoreSourceById.ts`（1件採点のオーケストレーション、
    evaluateSourceById.tsと同じ`options.evaluate`注入パターンを
    `options.score`として踏襲。既定では採点済み〈`scoredAt`存在〉は
    再採点しない、`force:true`で許可）、⑤`scoreInboxSources.ts`
    （Inbox候補のバッチ採点、evaluateInboxSources.tsと同じ設計、既定
    limit 5・上限50）、⑥`ranking.ts`（読み取り専用のEditorial Score順
    ランキング取得、AIは呼ばずcrawlOrigin同様Local API直読み）。
    **エンドポイント**：`POST /api/ai/score-source`・`/api/ai/score-inbox`
    （認証必須、generateDraft.ts等と同じパターン）。**パス設計の教訓を
    反映**：2026-08-17の前回セッションで発見した「エンドポイントパスの
    第一セグメントが既存コレクションslugと一致するとPayloadのルーティング
    がルート直下のconfig.endpointsを見なくなる」バグを踏まえ、
    `/source-ledger/...`のような衝突しうるパスは避け、`/ai/...`
    （collectionではない名前空間）を使った——実際にcurlで401（ルート
    到達・認証必須は機能）を確認済み。
    **CLI**：`./p2 score [--force]`（Inbox候補を採点。`cms/src/scripts/
    scoreSources.ts`＋`scripts/format_score_status.py`。既存の
    `check_anthropic_key_format`関数〈Phase 12 Preflightで実装済み〉を
    再利用し、鍵が無効な形式と判定された場合は**自動的に**
    `--heuristic`へフォールバックする——「外部APIキーは変更せず、
    使えない場合はローカルで検証可能な方法を使う」というマロン指示を
    スクリプトの標準動作として組み込んだ）、`./p2 ranking [--all]`
    （読み取り専用。既定はInbox候補のみ、Top5を「Maron Editor's Choiceの
    検討材料」として強調表示し、残りは全ランキング、未採点分は別途一覧
    表示。`cms/src/scripts/curationRanking.ts`＋
    `scripts/format_ranking_status.py`）。
    **検証**：`tsc --noEmit`（cms、0エラー）・`astro check`（site、
    0エラー）・`bash -n scripts/project02`。ローカルDocker/Postgres環境で
    ①CMS再起動時に新規列・3つの複数選択join table
    （`sources_audience_tags_*`・`sources_intersectionality`）が対話
    プロンプトなしで自動作成され、既存データ（Sources 28・Articles 8・
    SocialPosts 0）が無傷であることを確認。②`./p2 score --heuristic`を
    実際にInbox候補28件全件（既存の実データ、破棄していない）に対して
    実行し、既定limit 5での分割実行・`--force`での再採点・採点済み分の
    冪等スキップ（2回目実行で対象0件）を確認。③重要な事前検証として、
    「無関係なフィールド（`status`）だけを更新する部分更新で
    editorialScore/audienceTags/crawlOriginが消えないか」を使い捨て
    スクリプトで実地検証した——既存の`editorial`グループが過去に
    同種の問題（2026-08-10決定ログ参照）を持っていたための懸念だったが、
    実際には無傷で保持されることを確認し（Payloadの列レベル部分更新は
    正しく機能しており、過去の不具合は当時の自前フック実装側の問題
    だったと判断）、`beforeChange`フックへの変更は行わなかった
    （最小変更の原則を優先、テスト後は`status`を元の値に復元済み）。
    ④`./p2 ranking`でTop5候補・全28件のランキング・Audience Tagsが
    正しく表示されることを確認（1位はSource #28「ポーラ ミュージアム
    アネックス」84点）。⑤`curl -X POST /api/ai/score-source`・
    `/score-inbox`が未認証で401を返すこと（ルーティングバグの再発が
    ないこと）を確認。⑥`./p2 doctor`・`./p2 editorial`・`./p2 social`・
    `./p2 crawl --dry-run`・`./p2 jobs`・`./p2 morning`フル実行の回帰も
    確認し異常なし（Articles 8件・SocialPosts 0件・SourceLedger 14件・
    SourceSnapshots 98件・payload_jobs 2件、いずれも本セッション開始時点
    と一致）。検証後は`./p2 stop`で全サービスを安全に終了済み。
    **今回は行っていない・意図的にスコープ外**：①実際のAnthropic API
    呼び出し——`ANTHROPIC_API_KEY`は変更しておらず（引き続き無効な形式の
    まま）、実際のClaude評価は一度も行っていない（マロン指示どおり、
    外部API・課金には一切触れていない）。**現在の28件のInbox候補は
    すべてheuristic-placeholderで採点済み**——有効な鍵が用意でき次第
    `./p2 score --force`でclaudeへ再採点することを想定した状態のまま
    残している。②交差性（People×Culture×Commerce×Technology×Time）の
    実際の評価ロジックは未実装（フィールドのみ準備、値は常に空欄）。
    ③GINZA Conciergeパーソナライズへの実際の接続は将来のスコープ
    （データ構造のみ今回re-usable設計にした）。④Payload管理画面での
    `editorialScore`/`audienceTags`フィールドの実ログイン後の目視確認は、
    既存の運用方針（管理画面ログインパスワード非保持）により今回も
    未実施。本番Railway・秘密情報・課金操作・権限設定・Git pushはいずれも
    一切行っていない。
  - 2026-08-17（SOURCE LEDGER 定期実行：Payload Jobs Queueの採用と`./p2 morning`
    統合）: 前回セッションで残った未決事項「定期実行（cron等）の要否・頻度」
    「`./p2 morning`/`./p2 pmo`への統合要否」を解消した。
    **調査・技術選定**：OSレベルのcron/launchdではなく、インストール済みの
    Payload 3.86.0が標準搭載する**Jobs Queue（cron機能）**を採用した。
    理由：①ローカル開発機（`next dev`）とRailway本番（常駐Next.jsサーバー）の
    どちらでも追加インフラなしに同じコードパスで動く。②Payloadの
    `getPayload()`は`cron:true`付きで呼ばれるとcronを初期化するが、
    `@payloadcms/next`の`createPayloadRequest`/`initReq`
    （管理画面・全REST APIリクエストが必ず通る経路）が常にこれを渡す
    実装であることをnode_modules内のソースで確認したため、CMSサーバー
    プロセスが起動し最初のリクエストを1件でも処理すればcronが自動的に
    有効化される——既存の起動シーケンス（`./p2 start`等）を変更する必要が
    一切ない。③Payload公式ドキュメントは「autoRunはVercel等サーバーレス
    環境では使うべきでない」と明記しているが、Railwayは常駐コンテナで
    ありサーバーレスではないため抵触しない（本番導入時の制約なし）。
    ④「自前で持たない理由を説明できることを条件とする」という第6章の
    技術選定方針とも整合する（外部cronサービス・追加コンテナを増やさず
    既存スタックの標準機能で完結）。
    **実装**：①`cms/src/lib/jobs/sourceLedgerCrawlTask.ts`（新規）——
    `TaskConfig<'source-ledger-crawl'>`。ハンドラは既存の
    `runSourceLedgerCrawl`＋`generateSourceCandidatesFromSnapshots`
    （前回実装済み、変更なし）をそのまま呼ぶだけで、新規のHTTP/DB処理は
    一切書いていない——巡回ロジック自体は`./p2 crawl`と完全に同一。
    `schedule: [{ cron: '0 6 * * *', queue: 'source-ledger' }]`で毎朝6:00
    （サーバープロセスのローカルタイムゾーン基準、ローカル開発機は
    Asia/Tokyoで確認済み）に自動スケジュール。出力はscannedSources等の
    サマリをoutputSchemaに定義し構造化して残す。②`payload.config.ts`に
    `jobs: { tasks: [sourceLedgerCrawlTask], autoRun: [{ cron: '*/10 * * *
    *', queue: 'source-ledger' }], deleteJobOnComplete: false }`を追加
    （非破壊的スキーマ追加、`payload_jobs`/`payload_jobs_log`/
    `payload_jobs_stats`の3テーブルが自動作成された）。`autoRun`のcron
    （10分間隔）は「スケジュール判定・実行キューの確認」のポーリング
    間隔であり、日次1回のジョブに対して過剰な負荷にならない粒度として
    選定した。`deleteJobOnComplete`は既定値`true`から明示的に`false`へ
    変更——SourceSnapshots等と同じ「実行ログは残す」方針に合わせ、
    管理画面`payload-jobs`から巡回ジョブの実行履歴（成功・失敗・出力
    サマリ）を目視できるようにした。
    **`./p2 jobs`新設・`./p2 morning`/`./p2 pmo`への統合**：新規スクリプト
    `cms/src/scripts/jobsStatus.ts`（Local API、overrideAccess:true、
    読み取り専用）と`scripts/format_jobs_status.py`
    （UTC→JST変換して表示）で、次回実行予定時刻・直近の成功実行の
    サマリ・直近の失敗一覧を1コマンドで確認できる`./p2 jobs`を追加した。
    これを`./p2 morning`のステップ9（旧・欠番だった「巡回結果の
    `./p2 morning`統合」を解消）として組み込んだ——**ここが前回セッション
    からの設計転換点**：巡回の**実行**自体はもうJobs Queueが自動で
    行うため、`./p2 morning`は`./p2 crawl`を直接呼ばず、**状態を読むだけ**
    にした。これにより、前回セッションで統合を見送った理由（「外部14
    サイトへの実ネットワークアクセスを毎朝の起動シーケンスへ無条件で
    追加してしまう」）が構造的に解消された——`./p2 jobs`自体はHTTP巡回・
    DB書き込みを一切行わない。あわせて`recommend_next_step()`に
    「直近の実行に失敗が含まれる場合は`./p2 jobs`の確認を促す」分岐を
    追加した（優先順位はwrangler認証＞railway認証＞Anthropicキー＞
    SOURCE LEDGER巡回失敗＞本番インフラ構築の続き、という既存の
    「具体的な問題ほど優先」というポリシーを踏襲）。
    **検証**：`tsc --noEmit`（cms、0エラー）・`astro check`（site、
    0エラー）・`bash -n scripts/project02`（構文チェック）。ローカル
    Docker/Postgres環境で①CMS再起動時に3テーブルが対話プロンプトなしで
    自動作成されたこと、既存データ（Sources 28・Articles 8・
    SocialPosts 0・SourceSnapshots 84）が無傷であることを確認。②cron
    実行を1日待たずに検証するため、Payload Local APIの
    `payload.jobs.handleSchedules()`/`payload.jobs.run()`（`autoRun`の
    cronティックが内部で呼ぶのと同じ関数）を直接呼ぶ使い捨てスクリプトで
    実地検証した：(a) 初回`handleSchedules()`が現在時刻を基準に翌日6:00
    JSTを正しく計算しジョブをキューイングすること、(b) そのジョブの
    `waitUntil`を実行可能な時刻に書き換えて`payload.jobs.run()`を呼ぶと、
    Payload標準のタスクランナー経由でハンドラが実際に実行され（14サイト
    への実際のHTTP巡回、`unchanged:12`・`fetch_error:2`——東京メトロ・
    銀座三越の既知の制約と一致）、`payload-jobs`にstatus:success・
    構造化outputが記録されること、(c) 再度`handleSchedules()`を呼ぶと、
    既に翌日分がキュー済みのため重複スケジュールされず`skipped`になる
    こと（Payload標準の`defaultBeforeSchedule`ガードが正しく機能）、を
    確認した。この実地検証で実際に生成されたジョブ・Snapshotは
    使い捨てテストの副産物ではなく本物の巡回結果のため、削除せず
    そのまま残した（前回セッション同様の方針）。③`./p2 jobs`単体実行、
    ④`./p2 morning`フル実行（Docker/PostgreSQL/CMS/Astro起動→status→
    doctor→editorial→social→**jobs（新規）**→preflight→推奨工程提示まで
    完走、新規ステップ含め異常なし）、⑤`./p2 doctor`・
    `./p2 crawl --dry-run`・`./p2 sources`の回帰確認、いずれもSources
    28件・Articles 8件・SocialPosts 0件が`./p2 morning`/`./p2 jobs`の
    実行前後で完全一致すること（読み取り専用であることの実証）を確認
    した。検証後は`./p2 stop`で全サービスを安全に終了済み。
    **今回は行っていない・残る未決事項**：①Railway本番展開時、コンテナの
    `TZ`環境変数を`Asia/Tokyo`に設定する必要がある（未設定だとUTC基準に
    なり6時間ずれる。Payloadのスケジュール機能はcron文字列にタイムゾーン
    指定を持たず、サーバープロセスのローカルタイムゾームで評価する
    設計のため）——付録Fの本番インフラ構築時にRailwayの環境変数として
    追加する必要がある未実施タスクとして記録。②`payload-jobs`コレクション
    の管理画面での実ログイン後の目視確認は、既存の運用方針（管理画面
    ログインパスワード非保持）により今回も未実施。③Instagramの実装同様、
    ジョブが将来複数種類に増えた場合の`autoRun`ポーリング間隔（現在10分）
    の見直し要否は未検討（現状はSOURCE LEDGER巡回1種類のみのため
    問題なし）。④`jobs.access`（queue/run/cancel）は既定値のまま
    （ログイン済みユーザーなら誰でも実行可——既存の他エンドポイントと
    同じ「認証必須」水準で、追加の権限制限はしていない）。本番Railway・
    秘密情報・課金操作・Git pushはいずれも一切行っていない。
  - 2026-08-17（SOURCE LEDGER 巡回結果 → Sourcesコレクション接続）: 2026-08-15
    のSOURCE LEDGER v1設計時点で未設計のまま残っていた「巡回結果から既存
    `Sources`コレクションを自動生成するか」を実装した。
    **設計**：`source-snapshots`のうち`success:true`かつ`diffStatus`が
    `changed`（内容変化）または`first_seen`（初回取得成功）のSnapshotのみを
    対象に、`editorialStatus:inbox`の`Source`を1件生成する
    （`unchanged`・`fetch_error`は人間が見るべき新規内容が無いため対象外）。
    生成された`Source`は既存の編集パイプライン（Sources.ts、Phase 14の
    `evaluate-inbox`）にそのまま合流する設計にした——`evaluateInboxSources`は
    元々`editorial.editorialStatus === 'inbox'`のSourceを対象に動く実装
    だったため、`evaluateInboxSources`自体は一切変更せず、crawl由来の候補も
    自動的に拾われるようになった。`contentRef`（Sources必須フィールド）には
    URLだけでなくSnapshotの`title`・`excerpt`・出典URLを組み合わせたテキストを
    設定した——`evaluateSource.ts`が`contentRef`の文字列をそのままAIへの
    入力として使う設計（URLを渡すだけではAIが実際のページ内容を読めない）を
    踏まえた対応。
    **スキーマ変更**：`Sources`に新規`crawlOrigin`グループ（`sourceSnapshot`・
    `sourceLedger`のrelationship、生成時点の`diffStatus`、いずれも
    `admin.readOnly`）を追加した（非破壊的な列追加のみ、対話プロンプトなしで
    自動反映）。手動登録のSourceはこのグループが空欄のまま。
    **冪等性**：`SocialPosts.dedupeKey`のようなDB unique制約ではなく、
    生成前に`crawlOrigin.sourceSnapshot`が既存Sourceに存在するかを検索して
    判定する方式にした（`./p2 crawl`から単一プロセス・順次実行されるバッチで
    並行書き込みが無いため、検索してから作成する方式でも安全と判断）。
    **実装**：`cms/src/lib/sourceLedger/generateSourceCandidates.ts`
    （`generateSourceCandidatesFromSnapshots`、persist:falseでDry Run
    プレビュー可能）。`crawlSources.ts`（`./p2 crawl`のCLIエントリ）を、
    巡回後に本関数を呼ぶよう拡張し、出力JSONの形を`{crawl, candidates}`に
    変更した（`format_crawl_status.py`は新旧両形式を受け付けるよう後方互換
    対応）。`POST /api/source-ledger/generate-candidates { dryRun? }`
    エンドポイントも追加。
    **発見・修正したバグ（HTTPルーティング衝突）**：実装検証中に、
    2026-08-16に追加済みだった`POST /api/source-ledger/crawl`エンドポイントが
    ——そして今回追加した`generate-candidates`エンドポイントも同様に——
    実際のHTTPリクエストに対して常に404を返す不具合を発見した。原因は
    Payloadのルーティング（`handleEndpoints.js`）が、パスの第一セグメントが
    既存コレクションのslugと一致する場合、ルート直下の`config.endpoints`
    ではなくそのコレクション自身の`config.endpoints`だけを検索する仕様で
    あるため——`source-ledger`はコレクションslugでもあるので、
    `payload.config.ts`のルート`endpoints`にパス`/source-ledger/crawl`で
    登録していたこのエンドポイントは、SourceLedgerコレクション自身が
    `endpoints`を定義していない（＝空）ため常に到達不能だった。2026-08-16
    時点の検証はLocal API・`./p2 crawl`CLI経由のみで行われており、実際の
    HTTP疎通は未検証のまま見過ごされていた。**修正**：両エンドポイントを
    `payload.config.ts`のルート`endpoints`から`SourceLedger.ts`コレクション
    自身の`endpoints`配列へ移し、パスをコレクションslugを含まない相対パス
    （`/crawl`・`/generate-candidates`）に変更した。公開URL自体
    （`/api/source-ledger/crawl`・`/api/source-ledger/generate-candidates`）は
    変わらない。
    **検証**：`tsc --noEmit`（cms、0エラー）・`astro check`（site、0エラー）。
    ローカルDocker/Postgres環境で①スキーマの非破壊的自動反映を確認、
    ②Dry Run（`persist:false`）で対象24件・作成対象24件・実書き込み0件を
    確認、③実書き込みで実際に24件のSource（既存の巡回履歴に含まれる
    first_seen 23件・changed 1件）を生成——このうち複数は2026-08-16の
    正規化ハッシュ導入時の再基準化に由来する過去のfirst_seenで、実データ
    としてそのまま活用した、④再実行で0件生成・24件スキップ（冪等性）を
    確認、⑤`./p2 crawl`（実書き込み、実際に外部14サイトへ再巡回）を実行し、
    GO TOKYO・中央区観光関連・銀座蔦屋書店の3件で実際の内容変化を検知して
    3件の新規Source候補を自動生成、既存24件は正しくスキップされることを
    確認、⑥`./p2 crawl --dry-run`で新規生成0件・DBへの書き込みが実際に
    0件であることを確認、⑦HTTPルーティング修正後、
    `curl -X POST /api/source-ledger/crawl`・`/generate-candidates`が
    未認証で401（修正前は404）を返すこと、既存の`GET /api/source-ledger`
    等の通常のコレクションREST APIには影響がないことを確認した。
    `./p2 doctor`・`./p2 editorial`・`./p2 social`・`./p2 sources`の回帰も
    確認し異常なし（Articles 8件・SocialPosts 0件は投入前と完全一致、
    Sourcesは1件→28件に増加——うち27件が今回生成したcrawl由来のinbox候補、
    設計どおりの結果）。検証後は`./p2 stop`で全サービスを安全に終了済み。
    本番Railway・秘密情報・課金操作・Git pushはいずれも一切行っていない。
    **今回は行っていない・残る未決事項**：①生成された27件のinbox候補に
    対する実際のAI評価（`evaluate-inbox`、`ANTHROPIC_API_KEY`が無効な
    ままのため引き続き未検証、第12章直近の意思決定の該当項目を参照）。
    ②`contentRef`に埋め込むexcerpt（正規化前のテキスト抜粋）の質——
    ランキング・回転バナー等、要素の並び順に意味があるページのノイズを
    まだ除去していない（2026-08-16の正規化ハッシュ改善時に既知の制約として
    記録済みの論点と同根）。③定期実行（cron等）・`./p2 morning`/
    `./p2 pmo`への統合要否は引き続き未着手・未決定のまま（意図的な現状
    維持、外部14サイトへの実ネットワークアクセスを毎朝の起動シーケンスに
    無条件で追加することを避けるため）。④Payload管理画面での
    `crawlOrigin`グループ・生成されたSource一覧の実ログイン後の目視確認は、
    既存の運用方針（管理画面ログインパスワード非保持）により今回も未実施
    （REST/Local API・HTTPステータスコードでの疎通確認に留めた）。
  - 2026-08-15（SOURCE LEDGER v1：情報源台帳の新設）: 「毎朝AIが『旬の銀座』を
    自動収集する」ための情報源台帳を新設した。将来の自動巡回・差分検知・
    Morning Board・GINZA Conciergeが参照する基盤データという位置づけで、
    第9章のPhase 1〜17のどこにも明示的に計画されていなかった新規スコープ
    （どのPhase番号に位置づけるか、ロードマップへの反映は今回行っておらず
    次回以降の判断事項として残す）。
    **設計**：既存の`Sources`コレクション（記事化のために人間/AIが集めた
    個別コンテンツ片、`editorial`グループで管理）とは目的が異なる別物と
    整理した——SOURCE LEDGERは「どこを巡回対象にするか」のマスタ台帳、
    `Sources`は「集めた情報そのもの」。両者の接続方法（巡回結果から
    `Sources`を自動生成するか等）はv1では未設計（未決事項に追記）。
    **実装**：①`cms/src/lib/sourceLedger/types.ts`（Payloadに依存しない
    純粋な型定義。category 11値・tier 4値・language 3値・sourceType 6値・
    reliability 3値・crawlFrequency 4値の列挙と日本語ラベル）、
    ②`cms/src/lib/sourceLedger/seedData.ts`（初期Core Source候補14件、
    詳細は次段落）、③`cms/src/collections/SourceLedger.ts`（新規Payload
    コレクション`source-ledger`。`payload.config.ts`に登録。`sourceId`
    ——kebab-case安定ID、Payload内部の自動採番`id`とは別——をunique keyとし、
    Tags/ImageAssetsと同様に匿名読み取りを許可、書き込みはPayload標準の
    認証必須デフォルトのまま。`beforeValidate`フックで
    `enabled:true`には`http(s)://`で始まる`url`を必須とするガードを追加し、
    「urlが未確定な情報源をうっかり有効化しない」という安全側の設計を
    スキーマレベルで強制した）、④`cms/src/scripts/seedSourceLedger.ts`
    （seedData.tsをDBへ`sourceId`キーで冪等投入するLocal APIスクリプト。
    既存レコードは上書きしない——管理画面で調整した運用状態を壊さない
    ため。Docker/Postgres起動が前提）、⑤`cms/src/scripts/
    sourceLedgerStatus.ts`（seedData.tsを直接読み込むだけのDB非依存の
    確認スクリプト。総件数・enabled数・tier別・category別・Core Source
    一覧・TODO一覧を出力）、⑥`./p2 sources`（`scripts/project02`、
    `sourceLedgerStatus.ts`を呼ぶだけでDocker起動不要——既存の`editorial`/
    `social`コマンドとは異なりDB接続を要求しない設計にした）。
    **初期Core Source14件のURL確認方法**：「URLや取得方式が不確かなものを
    推測で埋めない」という要件のため、記憶に頼らずWebSearchで全14件を
    個別検索し、検索結果に直接リンクとして返ってきたURL（AIによる要約
    文中のURLではなく）を根拠として採用した（確認日をnotesフィールドに
    記録）。複数の候補URLが見つかったもの（銀座三越・松屋銀座・SEIKO
    HOUSE GINZA・Ginza Sony Park）は、タイトルとURLの対応が明確だった
    ものを選び、判断根拠と再確認の余地をnotesに残した——特にSEIKO HOUSE
    GINZAは確認できたのが英語版URL（`seiko.co.jp/en/seiko_house_ginza/`）
    のみで、日本語版URLの確定は次回人間の目視確認が必要な状態のまま残した。
    結果として14件全件のURLが確認でき、TODO/disabledとして残す情報源は
    今回は発生しなかった。ただし本セッションのWebSearch結果に基づく確認で
    あり、Payload管理画面での最終レビュー（特にSEIKO HOUSE GINZAの
    日本語版URL）は未実施。
    **検証**：`npm run generate:types`・`generate:importmap`
    （DB接続不要、新規`SourceLedger`型が追加されたことを確認）、
    `tsc --noEmit`（cms、0エラー）、`astro check`（site、15ファイル・
    0エラー、既存機能への影響なし）、`node --import=tsx/esm src/scripts/
    sourceLedgerStatus.ts`および`./p2 sources`の実行（総件数14・enabled
    14・tier別内訳・Core Source一覧・TODO一覧なし、を出力）で確認した。
    **このセッションのサンドボックス環境にはDockerが無く**、`seedSourceLedger.ts`
    による実際のDB投入・Payload管理画面での動作確認は実施できていない
    （Docker利用可能な環境で`./p2 start`後に`node --env-file=.env
    --import=tsx/esm src/scripts/seedSourceLedger.ts`を実行することで
    投入できる設計のみ済ませた状態）。秘密情報・Railway/R2環境変数・
    本番デプロイ・課金操作はいずれも一切行っていない。
  - 2026-08-16（本日の作業終了・引継ぎ整理）: 本日実装した「SOURCE LEDGER→
    Fetch→Snapshot→HTML Normalization→Diff」（本節直下の2件の意思決定
    ログ参照）を安全な状態で固定し、セッションを終了した。**最終確認内容**：
    ①コード全体を再レビュー（デバッグ用console.log・TODO・コメントアウトの
    残存なし、`/tmp`に作業中作成した診断用一時ファイル—robots.txt/UA比較・
    ginza.jp二重取得比較用のHTML等—は削除済み。プロジェクト直下には
    ローカル限定・gitignore対象の`.devlogs`/`.devpids`以外の一時ファイルは
    残っていない）。②`tsc --noEmit`（cms、0エラー）・`astro check`
    （site、15ファイル・0エラー）を再実行し合格。③`./p2 doctor`・
    `./p2 editorial`・`./p2 social`・`./p2 sources`を実行し、既存機能への
    Regressionがないことを再確認（Sources 1件・Articles 8件・
    SocialPosts 0件・SourceLedger 14件、いずれも本日開始時点と一致）。
    ④`./p2 crawl --dry-run`を最終実行し、14件中12件`unchanged`（前回までの
    永続化済みSnapshotを正しく安定的な基準として参照できている）・2件
    `fetch_error`（東京メトロ・銀座三越、既知の解消不能な制約）・DB書き込みが
    実際に0件であることを確認した。⑤`./p2 stop`で全ローカルサービスを
    安全に終了。**本日の変更範囲**：新規ファイル11件（`SourceLedger.ts`・
    `SourceSnapshots.ts`・`crawlSourceLedger.ts`・`lib/crawler/`4ファイル・
    `lib/sourceLedger/`2ファイル・`crawlSources.ts`・`seedSourceLedger.ts`・
    `sourceLedgerStatus.ts`・`format_crawl_status.py`）、変更ファイル3件
    （`payload.config.ts`・`scripts/project02`・本CLAUDE.md）。**コミットは
    行っていない**（ユーザーから明示的な指示がないため。Git安全プロトコルに
    従い、コミットが必要な場合は次回明示的に依頼を受けてから実施する）。
    git push・production deploy・git reset/clean・DBの破壊的変更・秘密情報の
    表示や変更は今回も一切行っていない。
  - 2026-08-16（SOURCE LEDGER 自動巡回：取得品質の改善）: 直前の自動巡回v1実装
    セッションで判明した3件の取得失敗（東京メトロ・POLA MUSEUM ANNEX・銀座三越）と
    GINZA OFFICIALの`changed`誤検知について、原因調査と改善を行った。
    **原因調査（アクセス制限の回避はしない前提で診断）**：curlで複数のUser-Agent
    （独自ボットUA／業界標準ボットUA形式／実ブラウザUA）を切り替えて比較した結果、
    ①**POLA MUSEUM ANNEX**：CloudFront WAFが独自フォーマットのUAを403で拒否する
    一方、`Mozilla/5.0 (compatible; <Bot名>/1.0; +URL)`という業界標準の自己申告
    フォーマット（Googlebot等と同型）では200が返ることを確認——UAの**内容**では
    なく**フォーマット**起因のブロックと判明。②**東京メトロ**：実ブラウザの
    フルUAで試しても同じくAkamai Edgeで403——UAに依存しないIP/ネットワーク層の
    ブロックと判明（本セッションの実行環境からは解消不可能。UA変更・リトライ
    いずれも無効であることを確認済み）。③**銀座三越**：実ブラウザUAでは
    約10秒で200が返る一方、ボット的なUA（独自形式・標準形式いずれも）では
    一貫して接続がタイムアウトする——ブラウザ限定の接続レベルの選別と判明。
    **改善方針（実ブラウザへのなりすましはしない）**：①・②・③いずれについても、
    ユーザー指示「アクセス制限を回避するような実装はしない」に従い、実ブラウザの
    UA詐称は行わなかった。実装した改善は次の3点のみ：
    (a) User-Agentを業界標準の自己申告フォーマット
    `Mozilla/5.0 (compatible; GinzaWhiskersDiscoverGinzaBot/1.0;
    +https://discover.ginzawhiskers.com)`に変更（ボットであることは明記したまま、
    広く認知された型に合わせただけで、なりすましには当たらないと判断）——
    **POLA MUSEUM ANNEXはこれで解消**。(b) 汎用のrobots.txt事前チェック
    （`cms/src/lib/crawler/robotsTxt.ts`新設。サイト固有ハードコードなしで
    Disallowルールをパースし、禁止パスには実際のHTTPリクエストを送信しない）。
    (c) タイムアウト・5xx等の一時的エラーに限定した最大1回のリトライ（403等の
    意図的アクセス拒否・robots.txt禁止はリトライしない）とタイムアウトの
    15秒→20秒への緩和。**東京メトロ・銀座三越は改善後も解消せず**——
    いずれもUA非依存またはブラウザ限定の意図的なアクセス制御であり、これ以上の
    対応（実ブラウザへのなりすまし、プロキシ経由での回避等）は行わない方針で
    確定。将来これらを重要な情報源として扱うなら、サイト運営者への問い合わせ・
    公式APIやRSSの有無の確認・手動巡回への切替、を人間が判断する事項として残す。
    **GINZA OFFICIALのchanged誤検知の原因**：`curl`で同一URLを2回取得し
    バイト単位でdiffした結果、協賛企業バナー（`<a><img/></a>`の集合）が
    **内容は同一のままリクエストごとに表示順序だけランダムにシャッフル**されて
    いることを実データで確認した（生バイト列は91302バイトで完全に同一長、
    要素の並びだけが異なる）。生バイト列のSHA-256は並び替えにも反応するため、
    実際にはコンテンツが変わっていないのに`changed`と誤判定していた。
    **正規化の設計（サイト固有ハードコードを避けた汎用実装）**：
    `cms/src/lib/crawler/normalizeHtml.ts`を新設。script/style/comment除去→
    a/li/div/tr/td/p/section/article/h1-6の開始位置での粗いブロック分割→
    各ブロックからhref/src/alt/titleの値と可視テキストのみを抽出→**ブロック集合を
    辞書順にソートしてから結合**、という汎用パイプラインで「要素の並び替えに
    対して不変なテキスト表現」を生成し、そのSHA-256を`normalizedContentHash`
    として新設した（ginza.jp固有の判定ロジックは一切含まない——同種の回転
    バナー・シャッフルされるスポンサー枠を持つ他サイトにも一般的に有効な設計）。
    保存済みのginza.jp 2回分のHTMLで検証し、生バイト列ハッシュは不一致
    （誤検知の再現）・正規化後ハッシュは完全一致（誤検知の解消）・他サイトの
    HTMLとは正規化後も別ハッシュになる（異なるコンテンツを同一と誤判定しない
    こと）、の3点をNode上のプロトタイプスクリプトで事前検証してから実装に
    反映した。トレードオフとして、要素の並び順「だけ」に意味があるコンテンツ
    （ランキング等）の変化は検知できなくなる（既知の制約としてコード内コメントに
    明記）。**diffStatusの判定は`normalizedContentHash`を使用するよう変更**し、
    生バイト列の`contentHash`は「完全一致検証用の参考値」として引き続き保存する
    （SourceSnapshots.tsのフィールド説明を更新）。**新旧Snapshotの整合性**：
    2026-08-16のアルゴリズム変更より前に作成されたSnapshotは
    `normalizedContentHash`を持たないため、比較対象の選定時に
    `normalizedContentHash: { exists: true }`で明示的に除外する設計にした
    ——古い生バイト列ハッシュと新しい正規化ハッシュを比較して誤って`changed`に
    ならないよう、新アルゴリズム導入後の最初の巡回は該当ソースについて
    `first_seen`（＝新基準での再基準化）として扱われる。
    **スキーマ変更**：`SourceSnapshots`に`normalizedContentHash`（差分判定に
    使用）・`blockedByRobots`（robots.txt禁止によりHTTPリクエスト自体を
    送信しなかったか）・`attemptCount`（リトライ込みの実際の試行回数）を追加
    （すべて新規列の追加のみの非破壊的変更、対話プロンプトなしで自動反映）。
    **検証**：`tsc --noEmit`（cms、0エラー）、`astro check`（site、0エラー）。
    ローカルDocker/Postgres環境で、①`--dry-run`実行によるDB非書き込みでの
    改善効果確認（14件中12件成功・2件失敗に改善、POLA MUSEUM ANNEXの解消・
    銀座三越のリトライ動作を確認）、②実書き込みでの新基準初回巡回（12件
    first_seen・2件fetch_error）、③2回目巡回（12件すべてunchanged、
    GINZA OFFICIALも含め誤検知が解消したことを確認）、④3回目巡回（同じく
    12件unchanged、安定性を再確認）、⑤DB直接確認でdiffStatus内訳
    （unchanged:34・changed:1〈前回セッションの誤検知1件のみ、以後は発生
    せず〉・first_seen:23・fetch_error:12、Snapshot総件数70件で計算上
    完全一致）・既存データ（sources 1件・articles 8件・social_posts 0件・
    source_ledger 14件）が投入前後で不変であることを確認した。
    `./p2 editorial`・`./p2 social`の回帰も異常なし。検証後は`./p2 stop`で
    全サービスを安全に終了済み。本番Railway・秘密情報・課金操作・Git pushは
    いずれも一切行っていない。
  - 2026-08-16（SOURCE LEDGER 自動巡回 v1：Fetcher→Snapshot→Diff実装）:
    SOURCE LEDGER v1（Core 14 sources）を基盤に、「自動取得→Snapshot保存→
    前回との差分検知」までを実装し、毎朝の銀座情報収集エンジンの基礎を
    完成させた。**設計方針**：14サイトを個別ハードコードせず、
    `source-ledger`コレクションの`enabled:true`な情報源を毎回動的に読み込む
    方式にした（tierでの絞り込みはせず`enabled`のみで判定——将来Core以外の
    情報源が有効化されても自動的に巡回対象へ含まれる）。
    **新設ライブラリ**（`cms/src/lib/crawler/`）：①`fetchSource.ts`
    （`fetchSourceContent(url)`。Node標準`fetch`＋`AbortController`で
    タイムアウト15秒、`redirect:'follow'`、識別可能な独自User-Agent
    （`GinzaWhiskersDiscoverGinzaBot/1.0`）を送信。HTTPエラー・タイムアウト・
    レスポンスサイズ超過（8MB上限、`Content-Length`ヘッダと実測の両方で
    ガード）を個別に検知し、生HTML全文は一切保持しない——`content`の
    SHA-256ハッシュ（差分判定用）と、タグ除去・空白正規化した簡易テキスト
    抜粋（先頭2000文字まで、将来の「旬の銀座候補抽出」向けの軽量素材）の
    みを返す。文字エンコーディングはUTF-8前提のベストエフォート
    （Shift_JIS等のサイトではtitle/excerptが文字化けしうるが、ハッシュは
    生バイト列に対して計算するため差分判定の正しさには影響しない、と
    設計上割り切った）。②`diff.ts`（`determineDiffStatus`。純粋関数、
    Payloadに非依存。`unchanged`/`changed`/`first_seen`/`fetch_error`の
    4値を返す。比較対象は「直近で取得に**成功**した回のcontentHash」——
    取得失敗を挟んでも意味のある比較ができるようにした）。③`runCrawl.ts`
    （`runSourceLedgerCrawl(payload, { persist })`。enabledな情報源を順に
    処理し、1件ごとに独立してtry/catchするため1サイトの失敗が全体を止め
    ない。`persist:false`（Dry Run）の場合は実際のHTTP取得・diff判定は
    行うが、Snapshot作成・`SourceLedger`更新を一切行わない）。
    **新設コレクション`SourceSnapshots`（`source-snapshots`）**：
    `sourceLedger`（relationship）・巡回時点の`sourceId`/`sourceName`の
    非正規化コピー・`fetchedAt`・`httpStatus`・`success`・`contentHash`・
    `contentLength`・`contentType`・`title`・`excerpt`（`maxLength`設定
    あり）・`errorMessage`・`diffStatus`・`previousSnapshot`
    （比較対象にした直近成功Snapshotへのself-relationship）を保持する
    実行ログ。**生HTML全文は保存しない設計をスキーマレベルで強制**
    （生HTMLを保持するフィールド自体を作っていない）。SourceLedgerと同様、
    機密性のないメタデータのため匿名読み取りを許可（`access.read: () =>
    true`）、書き込みはPayload標準の認証必須デフォルトのまま。
    **既存フィールドとの接続**：SourceLedger.ts作成時点で「将来の自動巡回
    ジョブが書き込む想定」とだけコメントされていた`lastCheckedAt`
    （巡回のたび常に更新）・`lastChangedAt`（`diffStatus:'changed'`の
    ときのみ更新、`first_seen`では更新しない——初回取得は「変化」ではなく
    基準点の確立とみなす設計判断）を、今回実装した`runCrawl.ts`が実際に
    書き込むようになった。
    **CLI/API**：`./p2 crawl [--dry-run]`（`scripts/project02`に
    `crawl()`関数を追加、`editorial`/`social`と同じ方式でDocker/Postgres
    起動を前提とし`node --env-file=.env --import=tsx/esm
    src/scripts/crawlSources.ts`を呼ぶ。結果は新設
    `scripts/format_crawl_status.py`で整形——差分ステータス集計・個別14件の
    結果・スキップ一覧を表示）。`POST /api/source-ledger/crawl { dryRun?
    }`エンドポイントも追加（認証必須、`generateSocialQueueEndpoint`等と
    同じ認証必須パターン）。**`./p2 morning`/`./p2 pmo`には today意図的に
    組み込んでいない**——外部14サイトへの実ネットワークアクセスを毎朝の
    起動シーケンスへ無条件に追加すると既存挙動が大きく変わるため
    （指示された「morning/pmoの既存挙動を壊さない」を、変更なしという
    形で満たした）。将来組み込むかは次回以降の判断事項として残す。
    **検証**：`tsc --noEmit`（cms、0エラー。`generate:types`実行後——
    新規`SourceSnapshot`型が必要で、実行前は型エラーが出ることを確認済み）、
    `astro check`（site、15ファイル・0エラー、既存機能への影響なし）。
    ローカルDocker/Postgres環境で実地検証：①CMS再起動時にスキーマが
    対話プロンプトなしで自動反映され`source_snapshots`テーブルが作成
    されたこと（新規テーブル追加のみの非破壊的変更）、②既存データ
    （source_ledger 14件・sources 1件・articles 8件・social_posts 0件）が
    投入前後で変化していないこと、③`--dry-run`実行が実際に0件のDB書き込み
    で終わること、④実書き込みでの初回巡回→11 first_seen／3 fetch_error、
    ⑤2回目の巡回で10件がunchanged・1件（GINZA OFFICIAL）がchangedと
    正しく判定され、`previousSnapshot`が1回目のSnapshotを指し、
    `lastChangedAt`がchangedの情報源だけに記録されること、⑥Snapshot
    総件数が14×2=28件と一致すること、をDB直接確認で検証した。
    `./p2 doctor`・`./p2 editorial`・`./p2 social`・`./p2 sources`の回帰も
    確認し異常なし（Sources/Articles/SocialPostsの件数・内容とも投入前と
    完全一致）。検証後は`./p2 stop`で全サービスを安全に終了済み。
    **14 Sourcesの実地結果**：11件成功（初回取得）、3件失敗——
    東京メトロ・POLA MUSEUM ANNEXがHTTP 403（自動化ボット対策と推測）、
    銀座三越がタイムアウト。実装のバグではなく先方サイトのアクセス制御・
    応答遅延によるものと判断。**判明した既知の制約・未決事項**（次回以降）：
    ①東京メトロ・POLA MUSEUM ANNEX・銀座三越の3件について、User-Agentの
    調整やリトライ、あるいは恒久的にアクセス制限がある場合の扱い
    （tier/crawlFrequency変更や手動確認への切替）を検討する必要がある。
    ②GINZA OFFICIALが2回連続の巡回間で`changed`判定になった——生バイト列の
    ハッシュ比較のため、実際のコンテンツ更新なのか、広告・時刻表示等の
    動的要素によるノイズなのかは今回切り分けていない（`excerpt`を人間が
    目視すれば判別可能だが未実施）。将来「旬の銀座候補抽出」に接続する際は、
    主要コンテンツ領域の抽出（ノイズ除去）を検討する必要がある。
    ③`source-ledger`と既存`Sources`コレクションの接続方法（巡回結果から
    `Sources`を自動生成するか等）は前回同様v1では未設計のまま。④定期実行
    （cron等によるスケジュール巡回）は今回スコープ外——手動実行
    （`./p2 crawl`）のみを実装した。⑤Payload管理画面での
    `source-snapshots`一覧・詳細表示の実ログイン後の目視確認は、既存の
    運用方針（管理画面ログインパスワード非保持）により今回も未実施。
    本番Railway・秘密情報・課金操作・Git pushはいずれも一切行っていない。
  - 2026-08-15（SOURCE LEDGER v1：ローカルDBへの実投入・動作確認）:
    前回セッションでDocker未起動のため未検証のまま残っていた
    `seedSourceLedger.ts`のDB実投入と、Payload CMSからの実際の動作確認を
    行った。**手順**：`./p2 start`でDocker Desktop→PostgreSQL→Payload
    CMS→Astroを起動（起動後のHealth Checkで既存データ——公開記事1件——が
    無傷であることを確認）→`node --env-file=.env --import=tsx/esm
    src/scripts/seedSourceLedger.ts`を実行。**結果**：
    `{"created":14,"skipped":0,"total":14}`——初期14件すべてが新規作成され、
    スキップ0件（初回投入のため冪等判定は今回は働いていないが、スキーマは
    対話プロンプトなしで自動反映された）。DB直接確認（`docker exec
    cms-postgres-1 psql`）で`source_ledger`テーブルの件数14・tier別内訳
    （core:14）・全14件のsource_id/name/enabledを目視確認し、既存の
    `sources`（1件）・`articles`（8件）・`social_posts`（0件）・`tags`
    （3件）のレコード数が投入前後で変化していないことも確認した
    （破壊的操作・既存データへの影響なし）。**Payload側からの確認**：
    `source-ledger`は匿名読み取りを許可する設計（`SourceLedger.ts`のaccess定義）のため、
    REST API（`GET /api/source-ledger?where[tier][equals]=core`）で
    Core Source 14件が正しく抽出できることを確認。加えて管理画面の
    `/admin/collections/source-ledger`・`/admin/login`がいずれもHTTP 200で
    到達可能であることを確認した（管理画面ログインパスワードは保持して
    いないため、認証後の画面表示そのものはこれまでの方針同様未検証のまま
    ——ログインを要するテストはユーザー側での確認が必要）。**回帰確認**：
    `tsc --noEmit`（cms、0エラー）、`astro check`（site、15ファイル・
    0エラー）、`./p2 editorial`（Sources 1件・Articles 8件、投入前と
    数値一致）、`./p2 social`（候補0件、投入前と一致）、`./p2 status`
    （Payload API・Astro・Live Dataいずれも正常）で既存機能への影響が
    ないことを確認した。検証後は`./p2 stop`でDocker/PostgreSQL/Payload/
    Astroをすべて安全に終了済み。**今回は行っていない**：本番Railway・
    Cloudflare/R2設定の変更、本番デプロイ、秘密情報・APIキーの変更や
    表示、課金につながる操作、既存データの削除——いずれも作業スコープ外
    として一切実施していない。これによりSOURCE LEDGER v1は「ローカルDBへ
    安全に投入し、Payload CMSから正常に扱える」状態まで到達した。
  - 2026-08-12（Railwayドメイン誤作成事故と再発防止：読み取り専用許可
    リスト方式の導入）: Railway CLI認証が有効化されたことを受け、Phase 12
    本番インフラ構築（Railway側）の実行前診断としてRailwayの状態を調査
    していたところ、`railway domain`を**サブコマンドなしで**実行した
    ことで、Postgresサービスに公開Railwayドメイン
    （`postgres-production-5c9fb.up.railway.app`）を意図せず作成して
    しまう事故が発生した。原因は`railway domain`のCLI仕様——サブコマンド
    省略時は「一覧表示」ではなく「新規ドメイン作成」がデフォルト動作に
    なる——を、実行前に`--help`で確認していなかったこと。
    **検知と復旧**：マロンからの指摘で発覚後、直ちに`railway domain
    list`・`railway domain status`・`railway deployment list`（いずれも
    読み取り専用）で影響範囲を調査し、①誤作成されたドメインはこの1件のみ
    （他のドメイン・サービスへの影響なし）、②ドメイン作成による新規
    デプロイ・Postgresの再起動は発生していない（デプロイIDは
    プロジェクト作成時の`86b1e280...`のまま不変）、③環境変数・DB内容にも
    変更なし、であることを確認したうえで、マロンの明示的な承認を得てから
    `railway domain delete`で削除し、削除後も同じ読み取り専用コマンドで
    「ドメイン0件・デプロイ履歴不変」を確認して復旧を確定させた。
    **再発防止（本件のメイン対応）**：本番構築の再開に先立ち、マロンの
    指示で「読み取り専用の診断・状態確認は一括自動実行できるようにする一方、
    作成・削除・デプロイ・環境変数変更・秘密情報操作・課金につながる操作・
    本番公開は絶対に自動承認せず、実行直前で必ず停止して承認を求める」
    安全な自動化層を最優先で構築した。`scripts/project02`に、Railway用・
    Cloudflare(wrangler)用それぞれの**許可リスト型ラッパー関数**
    （`railway_ro`／`wrangler_ro`）を新設し、以後Railway/Cloudflareの
    読み取り専用操作は必ずこの関数を経由する方式にした——各分岐は
    サブコマンドを省略しない完全な形でCLIを呼ぶため、`railway domain`の
    ような「省略時に何が起きるか不明瞭な呼び出し」がコード上そもそも
    作れない構造になっている。関数の直前には、許可リストに追加しては
    いけない操作（Railway：`domain`のcreate/update/delete、`variable
    set`/`delete`、`up`、`deploy`、`redeploy`、`restart`、`down`、
    `delete`、`init`、`service`、`environment`、`volume`、`scale`、
    `connect`/`ssh`、`config apply`。Cloudflare：`pages deploy`、`r2
    bucket create`/`delete`、`deploy`/`publish`、`kv:*`、`d1 *`、`secret
    put`、`login`/`logout`）を明記し、「新しい操作をここへ追加する前に、
    必ず`<cmd> --help`を読み、サブコマンド省略時に作成・変更が起きない
    ことを確認すること」を運用ルールとして固定した。**新コマンド**：
    `./p2 prod-status`（railway_ro/wrangler_ro経由でRailway/Cloudflareの
    本番リソース状態——プロジェクト/環境/サービス一覧・ドメイン一覧・
    デプロイ履歴・環境変数キー名一覧（値は非表示）・Cloudflare
    Pages/R2一覧——を読み取り専用で一括取得）、`./p2 pmo`
    （既存`./p2 morning`に`prod_status`を追記するだけの薄いラッパーで、
    PMOレポート作成に必要なローカル＋本番のデータを1コマンドで揃える。
    `morning`自体は変更せず、日々のローカル起動が毎回Railway/Cloudflareへの
    ネットワーク呼び出しで遅くならないようにした）。**検証**：
    `./p2 prod-status`・`./p2 pmo`を実際に実行し、出力が全てラッパー
    経由の読み取り専用呼び出しのみで秘密情報の値が一度も表示されない
    こと、実行前後で`railway status`（デプロイID・サービス・ドメイン数）
    が完全に不変であることを確認した。**運用ルール（今回確定、以後の
    セッションに適用）**：許可リストに無いRailway/Cloudflare操作を
    生成AIエージェントが実行する場合は自動実行せず、必ず実行直前で
    停止しマロンの承認を得ること。**このラッパーの限界も明記**：
    これは「スクリプト経由で実行する定型診断」を安全にする仕組みで
    あり、将来のセッションでエージェントが`railway`/`wrangler`を直接・
    生のコマンドで呼び出すこと自体を技術的に禁止するものではない。
    一次的な再発防止は、このCLAUDE.mdに明記した運用ルール（許可リスト
    外の操作は必ず`--help`で確認し、承認を得てから実行する）を各
    セッションで遵守することに依存する。今回のインシデントはローカル
    開発環境・Sources/Articles/SocialPostsの既存データには一切影響して
    いない（Railway Postgresサービスの公開ドメイン設定という本番インフラ
    面のみの事故と復旧）。
  - 2026-08-10（`./p2 morning`新設：作業開始準備のさらなる自動化）:
    マロンから「翌日以降、細かな起動確認・コマンド入力を繰り返さず
    1コマンドで作業開始準備を完了したい」という依頼を受け、既存の
    `./p2 start`（Docker Engine／PostgreSQL／Payload CMS／Astro起動）・
    `./p2 status`・`./p2 doctor`・`./p2 editorial`・`./p2 social`・
    `./p2 preflight`（本節直下、同日先行実装のPhase 12 Preflight）を
    1コマンドに束ねた`./p2 morning`（`scripts/project02`）を新設した。
    **既存コマンドの単純な直列実行に加えて追加した判定ロジック**：
    ①`preflight`の`ANTHROPIC_API_KEY`存在確認に、値を一切表示しない
    形式検証（`sk-ant-`プレフィックス・空白の有無・長さ）を追加
    （`check_anthropic_key_format`）——2026-08-10の実AI E2E再検証
    セッションで「キーの値ではなくシェルコマンドを誤って貼り付けていた」
    ような形式異常が発覚した経緯を踏まえ、実際のAPI呼び出しをせずに
    同種の異常を検出できるようにする狙い。②`preflight`のCLI検出
    セクションに`railway whoami`による認証状態の読み取り専用確認を追加
    （`wrangler whoami`は既存、`railway`側の同種チェックが抜けていた）。
    ③いずれも**警告表示のみ**とし、本コマンドから`wrangler login`・
    `railway login`等のログイン操作は一切実行しない（第13章の運用コスト
    方針・付録Fの「外部アカウント操作はユーザー側」という原則を踏襲）。
    ④起動系ステップ（Docker／PostgreSQL／CMS／Astro）のいずれかが失敗
    した場合、残りのステップ（editorial／social／preflight等）を実行
    せず即座に停止し、「次の1操作」を1行だけ提示する設計にした
    （マロンの要望「エラー時は人間に大量の確認を求めず、原因と次の1操作
    だけ表示」に対応）。⑤全ステップ完走後、`preflight`実行中に設定される
    `WRANGLER_AUTH_OK`／`RAILWAY_AUTH_OK`／`ANTHROPIC_KEY_OK`の3変数を
    見て「今日の次の推奨工程」を1行だけ提示する優先順位ロジック
    （wrangler認証復旧 > railway認証復旧 > APIキー差し替え > 本番インフラ
    構築の続き）を`recommend_next_step`として追加した。
    **検証**：実際に`./p2 morning`を実行し、Docker Engine起動→
    PostgreSQL起動→Payload CMS起動→Astro起動→Health Check→診断ログ→
    editorial（Sources inbox 1件・Articles published 1件、実行前の状態と
    一致）→social（走査1件・新規候補0件、実行前の状態と一致）→preflight
    まで完走することを確認した。この過程で新設の形式チェックが、
    `cms/.env`の`ANTHROPIC_API_KEY`が現在16文字・`sk-ant-`で始まらず
    空白を含む値であること（直近の意思決定に記録済みの383文字の異常値と
    もさらに異なる状態）を正しく検出した（値そのものは今回も一切表示・
    記録していない。有効な鍵への差し替えが引き続き必要という未決事項の
    状態そのものは変化なし）。実行前後でSources／Articles／SocialPosts
    の件数・内容に変更がないことも上記の出力で確認済み（削除・上書き
    操作は行っていない）。ログイン・課金・DNS変更・本番デプロイは今回も
    一切行っていない。
  - 2026-08-10（Phase 12 Preflight：本番インフラ構築の事前準備）: 外部
    アカウント作成・課金操作・DNS変更・本番公開・秘密情報の入力要求を
    一切行わない範囲で、次回の本番構築セッションを最小限の人間操作で
    開始できるようローカル側の準備を行った。詳細・変更内容は付録Fの
    「Preflight（2026-08-10実施）」節に集約して記録（本節では重複記載
    しない）。要点のみ：①`payload.config.ts`のDB接続文字列を
    `DATABASE_URI`/`DATABASE_URL`どちらでも動くようフォールバック化
    （Railwayが自動発行する変数名は`DATABASE_URL`であり、旧来の付録F
    手順の記述「`DATABASE_URI`が自動注入される」は誤りだったため訂正も
    兼ねる）、②`cms/railway.json`新設（Nixpacksビルドのbuild/start/
    healthcheck設定）、③`site/package.json`に`engines.node`追加、
    ④`./p2 preflight`コマンド新設（デプロイ関連ファイルの存在確認・
    env var名の設定有無チェック・railway/wrangler CLI検出＋認証状態確認・
    ローカルビルド確認を1コマンドで実行、値は一切表示しない）。**発見事項**：
    `wrangler` CLIはインストール済みだが既存の認証トークンが権限不足or
    期限切れで`wrangler whoami`が失敗する状態（再ログインはユーザー側の
    対応が必要、ブラウザ操作を伴うため今回は実行せず）。`railway` CLIは
    未インストール。`site`の`npm run build`はCMS未起動時に失敗すること
    （既知制約、付録B）を実地再確認し、CMS起動状態でのビルド成功も
    別途確認して今回のコード変更が原因でないことを切り分けた——本番でも
    Railwayデプロイ・疎通確認をCloudflare Pagesビルドより先に行う必要が
    あることが明確になった。実際のCloudflare Pages／R2プロジェクト作成・
    Railwayへのデプロイ・DNS変更はいずれもアカウント操作が必要なため
    今回は行っていない。既存データ・Phase 14/15の状態への変更はなし。
  - 2026-08-10（Phase 15：SNS配信キュー基盤、外部認証・実投稿を除く範囲）:
    ARCHITECTURE_DRAFT.md 2.5〜2.6節・CONTENT_MODEL.md 2.6節
    （PublishRecordによる二重配信防止思想）を土台に、published/approved
    記事からSNS配信候補を安全に生成しDry Runで内容確認できる自動化基盤を
    実装した。Phase 14の実AI E2E未検証状態（ANTHROPIC_API_KEY無効）には
    一切触れていない——本機能は新規のAI呼び出しを行わず、Article.
    socialCopy（記事生成時にAIが下書きし、記事承認時に編集長が既に
    レビュー済みのnote/x/instagram向けコピー、第8章）を正本として
    そのまま利用するため、Phase 14の状態に依存しない設計にした。
    **新設コレクション`SocialPosts`（`social-posts`）**：
    `article`（記事参照）・`channel`（note/x/instagram）・`copy`（生成時点の
    日本語・英語コピーのスナップショット）・`status`（pending→ready→sent、
    またはfailed）・`dedupeKey`（`{articleId}:{channel}`、unique制約による
    二重配信防止の第一防衛ライン）を保持する。人間ゲート（Sources.ts／
    Articles.tsと同じ考え方）として、ready・sentへの遷移はログイン済みの
    人間のみ実行可能とし、sent状態は不変（以後の変更を拒否）とした。
    **実装中に発見した既存Payloadの挙動**：SocialPosts.tsのbeforeChange
    フックで当初`const isCreate = !originalDoc`という、Sources.ts／
    Articles.tsと同じ判定方式を使ったところ、実際には create操作でも
    `originalDoc`が`undefined`ではなく`{ copy: {} }`のような空でない
    オブジェクト（group型フィールドのデフォルト展開に由来すると推測）に
    なることがあり、`!originalDoc`によるcreate判定が信頼できないことが
    判明した（型定義上のコメントは「originalDocはcreate時undefined」と
    なっているにもかかわらず）。Payloadが公式に提供する`operation`
    （'create'|'update'）引数を使う方式に変更して解決した。**この挙動が
    Sources.ts／Articles.tsの既存フックにも該当するかは今回調査していない
    ——両ファイルは変更しておらず、既存の動作実績（本章直近の意思決定に
    記録済みの回帰確認）を信頼して現状維持とした。将来これらのフックを
    変更する際は、同じ罠がある可能性を踏まえ`operation`引数の使用を
    検討すべき**（新しい既知の注意点として記録）。
    **ライブラリ構成**（`cms/src/lib/social/`）：`buildCandidates.ts`
    （Article.socialCopyから候補を組み立てる純粋関数、新規AI呼び出しなし）・
    `generateQueue.ts`（published/approved記事を走査し、dedupeKey未存在の
    候補のみpendingとして冪等に作成）・`dryRun.ts`（pending/ready項目を
    対象に、実配信を一切行わず内容・文字数超過・Instagramのヒーロー画像
    未設定等をプレビュー、lastDryRunAtのみ記録）・`dispatchSocialPost.ts`
    （人間がreadyへ承認した項目の最終配信ゲート。noteはconfirmManual:true
    による人間の手動投稿確認のみでsentへ、x/instagramは`postToX`／
    `postToInstagram`（Phase 1実装のスタブ、認証情報未設定のため即座に
    失敗する）を呼び出し、失敗時はstatus:failedへ落とす。テスト・将来の
    差し替えのため送信関数を注入可能にしている）。配信成功時は
    `Article.publishHistory`（第12章2.6節、既存フィールド）にも記録し、
    二重配信防止の第二防衛ラインとした。**エンドポイント**：
    `POST /api/social/generate-queue`・`/dry-run`・`/mark-ready`・
    `/dispatch`をgenerateDraft.ts等と同じ方式（認証済みユーザーのみ）で
    追加。**CLI**：`./p2 social`（`cms/src/scripts/socialStatus.ts`・
    `scripts/format_social_status.py`、editorialStatus.tsと同じ方式）で
    候補生成→Dry Run→ステータス別集計→人間の確認待ち（ready）一覧・
    失敗（failed）一覧・Dry Run警告一覧を1コマンドで確認できるようにした。
    **検証**：使い捨てスモークテスト（`[E2E-TEST-DELETE]`マーカー付きの
    テスト記事1件、テスト後に削除）で、候補生成の冪等性・dedupeKeyの
    一意性・人間ゲート（未認証拒否／認証成功）・note手動投稿確認ゲート・
    X/Instagramのfake sender注入によるsent/failed遷移（実際の`postToX`／
    `postToInstagram`は一度も呼んでいない。実ネットワーク呼び出しは
    このセッションを通じて一切発生していない）・sent状態の不変性・
    publishHistoryへの記録・失敗チャネルが再候補化されないこと、を確認し、
    テスト後にDB直接確認でSources／Articles／SocialPostsの件数・内容が
    テスト開始前と完全一致することを検証した（実記事id=2のsocialCopyは
    元々未入力のため候補が0件生成されることも合わせて確認、実データは
    今回一切変更されていない）。`tsc --noEmit`は既知の3件のみ、
    `generate:types`／`generate:importmap`は新規`SocialPost`型のみ追加
    （スキーマ形状は意図通り）。Docker／PostgreSQL／Payload API／
    Astro（`/ja/` `/en/` `/ja/privacy` `/en/privacy`
    `/articles/[slug]`日英）／`./p2 doctor`／`./p2 editorial`の回帰も
    確認し異常なし。**今回は行っていない・対象外とした範囲**：Instagram
    Meta App Review・X OAuth（外部認証、付録E参照、Phase 15の残タスク）、
    実際のX/Instagramへの投稿（認証情報が存在しないため技術的に不可能、
    かつ意図的に試みていない）、Phase 14のANTHROPIC_API_KEY無効状態への
    対応（範囲外、状態は変化なし）、Instagram実配信に必要なヒーロー画像
    URL解決ロジック（実投稿自体を行わないため未実装、コード内にコメントで
    明記）。
  - 2026-08-10（Phase 14実AI E2E再検証セッション・キー形式異常により
    API呼び出し未実施）: ユーザーから「`cms/.env`のANTHROPIC_API_KEYを
    新しいキーに差し替え済み」との申告を受け、前回セッション（本節直下の
    項目、401 `authentication_error`）に続く実AI E2E検証を試みた。
    **今回も値は一切表示・ログ出力せず**、①`.env`内の該当行の存在確認、
    ②`node --env-file=.env`経由での値の**形状**確認（文字数、
    `sk-ant-`プレフィックスの有無、空白・改行の有無）のみで検証した
    ところ、値が**正規のAnthropic APIキーの形式そのものになっていない**
    ことが判明した（`sk-ant-`で始まらない、長さ383文字と通常のキーより
    大幅に長い、値の中に半角スペースを含む）。値の形状（先頭・末尾数
    文字のみ、これもClaudeの応答には一切含めていない）から判断すると、
    **APIキーの値ではなく、キーを取得・生成する際に使ったシェル
    コマンド（`python3 ...`のような一行コマンド）自体を誤って`.env`に
    貼り付けてしまった可能性が高い**と推測される。
    **今回とった対応**：この形状異常は静的検査の時点で「APIキーとして
    成立しない」と判定できるため、指示された「API呼び出しは必要最小限の
    1件に限定」という制約を踏まえ、**実際のAnthropic API呼び出しは
    1回も行わずに検証を停止した**（失敗が確実な呼び出しに貴重な1件枠を
    費やすことを避けた）。そのためテスト用Source/Articleの作成も行って
    おらず、既存データへの影響は発生していない（そもそも触れていない）。
    `evaluate-source`の正常完了・AI評価スコア/理由の生成・Editor's
    Choice候補判定・人間承認ゲートの健在性の実地確認は、いずれも今回
    未実施のまま持ち越し。**ユーザー側の対応が必要**：`.env`の値を
    再確認し、Anthropicコンソールで発行された実際のAPIキーの文字列
    （`sk-ant-`で始まる）をそのまま貼り付け直すこと。
  - 2026-08-10（Phase 14実AI E2E検証セッション）: ユーザーから
    「`cms/.env`にANTHROPIC_API_KEYを設定済み」との申告を受け、実際の
    Claude APIを使ったPhase 14 AI編集機能のE2E検証を実施した。
    **重要な発見**：鍵の値を一切表示・ログ出力せず、①`.env`内の当該行の
    存在確認、②`Anthropic`クライアントによる最小限の実API呼び出し
    （`max_tokens: 8`のping）の2段階で確認したところ、鍵は**設定は
    されているが認証エラー（HTTPステータス401、`authentication_error`、
    メッセージ`invalid x-api-key`）で無効**と判明した。前回セッション
    （2026-08-10 Phase 14完成確認セッション、本節直下の項目）時点の
    「キー未設定（空文字）」とは異なる新しい状態——**未設定→無効な値が
    設定されている、へ変化**しているが、いずれにせよ実際のAI呼び出しは
    引き続き成功していない。値そのものの良否・入力ミスの有無は秘密情報の
    ため私（Claude）からは確認・訂正できず、ユーザー側での鍵の再確認・
    再発行が必要（新しい未決事項、本節下部参照）。
    **それでも検証できたこと**：認証エラー時のパイプライン挙動を、使い
    捨てのテスト用Source（内容に`[E2E-TEST-DELETE]`マーカー付き、実データ
    には一切触れず）に対して`evaluateSourceById`を実際に実行することで
    確認した。①実際のAnthropic APIへ到達し401で失敗する一連の流れが
    エンドツーエンドで動作すること、②評価が例外で失敗した場合でも
    `editorialStatus`は`inbox`のまま変化せず、部分書き込みによるデータ
    汚染が起きないこと、を実データに近い形で確認済み。あわせて人間承認
    ゲートも同じ使い捨てテストレコード（Sources・Articles各1件）で回帰
    確認した：Sourcesは(a)`overrideAccess:false`かつユーザーなしでの
    `approved`更新がコレクションのデフォルトアクセス制御で拒否、
    (b)`overrideAccess:true`かつユーザーなしでもフック自体の人間ゲートで
    拒否、(c)`overrideAccess:true`かつ認証ユーザーありでは成功し
    `decisionBy`/`decisionAt`が記録される、の3パターンいずれも想定通り。
    Articlesも同様に無認可拒否・認可成功時の`approvedBy`記録を確認した。
    **事故と復旧**：1回目のテストスクリプト実行がArticles作成時の必須
    フィールド（`pillars`）バリデーションで途中失敗し、その直前に作成した
    テスト用Source（id=18、承認済み状態まで進めていた）が後片付けされずに
    残る事象が発生した。DB直接確認で`content_ref`に
    `[E2E-TEST-DELETE]`マーカーが付いた自分のテストデータであることを
    確認したうえで手動削除し、Sources／Articles両テーブルの件数・内容が
    テスト開始前のスナップショットと完全一致することをDB直接確認で検証
    済み（2026-08-10 Phase 14完成確認セッションの教訓——バッチ処理事故の
    反省を踏まえ、今回もテスト前後のスナップショット比較を徹底した）。
    `tsc --noEmit`は既知の3件のみ、`generate:types`は差分なし。
    Docker／PostgreSQL／Payload API／Astro（`/ja/` `/en/` `/ja/privacy`
    `/en/privacy` `/articles/[slug]`日英）／Payload→Astro Live Dataの
    回帰も`./p2 doctor`・`./p2 editorial`・curlで確認し異常なし。
    **今回は行っていない・人間判断が必要な範囲**：有効なAPIキーへの
    差し替え（値の確認・再発行はユーザー側の対応が必要、Claudeは秘密情報
    を扱わない方針のため代行不可）、有効な鍵が用意され次第の本物のAI評価
    結果の質の検証（プロンプト・許容基準の妥当性は依然未検証）。
  - 2026-08-10（Phase 14完成確認セッション）: 前回セッションで実装した
    編集パイプライン基盤・AI評価・Editor's Choice選定・バッチ評価・人間
    承認ゲート・`evaluate-source`/`evaluate-inbox` APIを対象に、Phase 14の
    既存資料上の未完了項目を洗い出し、新規要件を追加せずに検証を最後まで
    行った。**Phase 14の完了条件の確認**：Phase実行計画（本章上部の表）は
    Phase 14を「コンテンツ制作の本格開始（AI編集部パイプライン実運用）」、
    第11章チェックリストは「『毎日発信』運用に足る記事の蓄積開始（最低
    掲載本数の基準は今後確定）」と定義している。前者（パイプラインの
    実装・動作保証）は本セッションで検証完了、後者（記事の蓄積）は
    エンジニアリング作業ではなく編集運用そのものであり、かつ基準値自体が
    未確定のため、今回の作業では完了させられない（推測で基準を設定
    しなかった）。**ANTHROPIC_API_KEYの確認**：値を画面に出さずに
    `.env`の当該行の長さのみで確認したところ空文字のままだった。秘密情報
    の入力は要求せず、実際のClaude API呼び出しを伴うE2E検証はスキップし、
    「実AI E2Eのみ未検証」として明確に残した（詳細は未決事項）。
    **再検証した項目**：①`evaluateSource()`はAPIキー未設定時に想定通り
    エラーになる、②AI評価→`editors-choice`／`review`への遷移とAI要約等の
    保存、③recommendation:'reject'でも`rejected`には遷移しない（最終却下は
    人間のみ）、④確定済み（approved等）ソースは再評価がガードされ
    AI呼び出し自体が発生しない、⑤Sourcesの人間承認ゲート（approved／
    published／rejectedいずれも無認可では拒否、人間による承認は成功し
    `decisionBy`が記録される）、⑥Articles側の人間承認ゲートの回帰
    （無認可拒否→人間承認で`approvedBy`・`accessionNumber`が記録される）、
    ⑦`evaluateInboxSources`のバッチ処理がinbox状態のソースのみを対象に
    する、⑧`POST /api/ai/evaluate-source`・`POST /api/ai/evaluate-inbox`
    エンドポイントが未認証リクエストを401で拒否する（HTTP層としての配線も
    実地確認、管理画面ログインパスワードは保持していないため認証済み
    経路はLocal APIでの検証に委ねる方針を踏襲）。すべてLocal API経由の
    使い捨てスモークテストで確認し、前回セッションの事故（バッチ処理が
    実在ソースを巻き込む）の教訓を踏まえてバッチテスト前に既存inbox
    ソースをスナップショットし、テスト後に完全復元した——実行後、
    Sources／Articlesの件数・内容（`銀座四丁目交差点の変遷`のeditorial値
    含む）が実行前と完全に一致することをDB直接確認で検証済み。`tsc
    --noEmit`は既知の3件のみ、`generate:types`/`generate:importmap`は
    差分なし。Docker／PostgreSQL／Payload API／Astro（`/ja/` `/en/`
    `/ja/privacy` `/en/privacy` `/articles/[slug]`）／Live Dataの回帰も
    `./p2 doctor`・`./p2 editorial`で確認し異常なし。**今回は行っていない
    ・人間判断が必要な範囲**（前回セッションから変更なし）：実際の
    `ANTHROPIC_API_KEY`を使ったAI評価結果の質の検証、Editor's Choice候補の
    確認・以後の扱いを専用UIで行うか既存管理画面で足りるとするかの判断、
    AI評価バッチの実行契機（手動のみか定期実行か）。加えて今回明確化した
    範囲：「毎日発信」に必要な最低掲載本数の基準確定（これが決まらない
    限りPhase 14の完了条件そのものが判定不能）。
  - 2026-08-10（Phase 14開始）: 編集パイプライン基盤（同日先行実装分）の
    上に、AIによるSources評価とEditor's Choice候補選定ロジックを実装した。
    **AIの権限範囲**：`evaluateSourceById`（`cms/src/lib/ai/
    evaluateSourceById.ts`）が到達させる`editorialStatus`は`review`と
    `editors-choice`の2つのみ——AIは評価・候補提示までで、`approved`
    （承認）・`published`（公開）はもちろん、`rejected`（却下の確定）も
    人間のみが行う（今回`HUMAN_GATED_STATES`に`rejected`を追加し、
    AI評価がrecommendation:'reject'と判断した場合でも状態は`review`に
    留め、否定的な最終判断すら自動化しないよう防御的に強化した）。
    **評価対象のガード**：`editorialStatus`が既に`editors-choice`／
    `approved`／`published`／`rejected`のSourceは再評価の対象外とし
    （`SourceNotEvaluatableError`）、AI呼び出し自体を発生させない
    （確定済み項目をAIが上書きしない）。**Claude呼び出し**
    （`cms/src/lib/ai/evaluateSource.ts`）：`generateArticleDraft.ts`と
    同じtool-use方式で、要約・評価理由・recommendation（proceed/reject）・
    Editor's Choice候補可否とその理由を構造化出力させる。**エンドポイント**：
    `POST /api/ai/evaluate-source`（単体、`sourceId`指定）と`POST /api/ai/
    evaluate-inbox`（バッチ、受信箱のSourcesをまとめて評価。コスト制御の
    ため1回あたり既定5件・上限20件）を追加し、`generateDraft.ts`と同様に
    認証済みユーザーのみ実行可とした（書き込み先の`review`/`editors-choice`
    自体は人間ゲート対象外だが、AI呼び出しの起点は人間が与える設計を踏襲）。
    **検証**：このサンドボックス環境の`ANTHROPIC_API_KEY`は空文字のため
    実際のAPI呼び出しは検証できず、evaluate関数を注入できる設計にした
    うえでLocal APIの使い捨てスモークテストにより、状態遷移・再評価
    ガード・人間ゲートの健在・バッチ処理の対象範囲を確認した。**事故と
    復旧（重要な教訓）**：1回目のスモークテストで、`evaluateInboxSources`
    （受信箱の全件を対象にする設計）がテスト用データだけでなく実在の
    Source（id=1、記事「銀座四丁目交差点の変遷」の元ソース）まで巻き込み、
    そのeditorialStatusとAI要約・評価理由をテスト用のダミー文字列で
    上書きしてしまう事象が発生した（データの削除はしていないが、実データを
    テスト内容で汚す事故）。原因はテストスクリプト側がバッチ呼び出しの
    対象範囲を試験データに限定していなかったこと。発覚後、直ちに同じ
    Local API経由で元の値（`inbox`・空欄）へ復元し、`./p2 editorial`と
    直接SQL確認の両方で復旧を確認した。再発防止のため、スモークテストは
    バッチ実行前に既存inboxソースをスナップショットし、実行後に必ず
    元の状態へ復元する手順に修正した（本番コード側の`evaluateInboxSources`
    自体は「受信箱の全件を対象にする」という設計を変更する必要はないと
    判断——問題はテスト方法にあった）。`tsc --noEmit`は既知の3件のみ、
    `generate:types`は差分なし（スキーマ形状は無変更）。Docker／
    PostgreSQL／Payload API／Astro（`/ja/` `/en/` `/ja/privacy`
    `/en/privacy` `/articles/[slug]`）／Live Dataの回帰も確認し異常なし。
    **今回は行っていない・人間判断が必要な範囲**：実際の`ANTHROPIC_API_KEY`
    を使った本物のAI評価結果の質の確認（プロンプト・許容基準の妥当性は
    未検証）、Editor's Choice候補になったSourcesを実際にどう画面上で
    確認・以後どう扱うか（管理画面の一覧・フィルタ導線は既存のPayload標準
    UIに委ねており専用ダッシュボードは未実装）、バッチ評価の実行契機
    （手動実行のみを想定、定期実行の要否は未検討）。
  - 2026-08-10: Phase 14（AI編集部パイプライン実運用）に先立つ「編集
    パイプライン基盤」の実装を完了した（前セッションで中断していた作業の
    続行）。**Sourcesコレクション**：既存の`status`（記事化進捗のみを表す
    別軸、温存）とは別に`editorial`グループを新設し、情報収集→AI整理・
    評価→Editor's Choice候補→人間の最終承認→公開の状態
    （`editorialStatus`：inbox/review/editors-choice/approved/published/
    rejected）とAI要約・AI評価理由・Editor's Choice理由・却下理由・決定者・
    決定日時を保持できるようにした。**人間承認ゲート**：`editorialStatus`
    が`approved`/`published`に遷移する際はログイン済みの人間
    （`req.user`）による操作を必須とするフックをSourcesに実装、同じ考え方を
    Articles（`reviewStatus`）にも拡張した——Articlesは`approvedBy`等の
    フィールド自体はPhase 1から存在していたが、承認時に自動記録する処理も
    人間ゲートの強制もこれまで無く、ARCHITECTURE_DRAFT.md 2.5節の「承認
    キュー」原則が未実装のまま残っていたギャップだった（今回`approvedBy`の
    自動記録も追加）。**バグ修正**：前セッションのSources実装では、
    editorialグループに触れない部分更新（他フィールドのみのAPI更新）が
    既存のeditorial値を丸ごと消してしまう不具合があったため、
    `originalDoc`とのマージ方式に修正した。**`./p2 editorial`コマンド**：
    Sources/Articlesの編集パイプライン集計（ステータス別件数、Editor's
    Choice承認待ち一覧）をCLIから確認できるようにした。Sourcesは匿名API
    読み取りを許可していない（2026-07-22決定のデフォルトアクセス制御）ため、
    Payload Local API経由の集計スクリプト（`cms/src/scripts/
    editorialStatus.ts`）を`node --env-file=.env --import=tsx/esm`で実行する
    方式にした（`payload run`はこの環境ではtsxワーカースレッド関連の
    問題で標準出力が失われる事象が発生したため不採用。原因はpayload本体の
    `bin.js`が参照しているNode/tsxの既知の相互作用と推測されるが、深追いは
    せず確実に動く経路に切り替えた）。**検証**：`tsc --noEmit`は既知の3件
    （`createDraftFromSource.ts`、Phase 8以前からの既知エラー、付録C参照）
    のみで新規エラーなし。`generate:types`は差分なし（フックのみの変更で
    スキーマ形状は無変更のため）。DBスキーマは前セッションで既に
    `editorial`列が反映済みであることを確認した（Payload起動時のスキーマ
    プルで対話プロンプトが出ないことで確認）。Local API経由の使い捨て
    スモークテスト（テスト用Source/Articleを作成→無認可承認が拒否される
    ことを確認→無関係フィールドの部分更新でeditorial値が保持されることを
    確認→認可済み承認が成功し decisionBy/approvedBy が記録されることを
    確認→いずれもテスト後に削除して件数を元に戻す）で、人間ゲートと
    マージ修正の両方を実データに近い形で確認した。Docker／PostgreSQL／
    Payload API／Astro（`/ja/` `/en/` `/ja/privacy` `/en/privacy`
    `/articles/[slug]`）／Payload→Astro Live Dataの回帰も`./p2 doctor`等で
    確認し異常なし。**あわせて**、`./p2`（`scripts/project02`）が生成する
    実行時ログ・PID（`.devlogs/`・`.devpids/`）をリポジトリ直下
    `.gitignore`に追加した（前セッションから追跡対象外のまま放置されて
    いたもの）。**今回は行っていない・人間判断が必要な範囲**：AIによる
    実際のSource評価・Editor's Choice選定ロジック自体（今回作ったのは状態
    管理の枠組みのみ）、Sourcesのアクセス制御方針（AI/自動化からの読み取り
    要否）の明文化——現状はデフォルトの認証必須のままで、これは人間ゲートの
    意図（AIが直接approved/publishedへ遷移できない）とは整合しているため
    急ぎの変更は不要と判断したが、方針として第12章に明記はしていない。
  - 2026-08-09: Phase 12（本番インフラ）の実際の構築に着手した。**ドメイン
    取得**：`ginzawhiskers.com`をCloudflare Registrarで取得した（ステータス
    「アクティブ」、有効期限2027-08-09、自動更新ON、ユーザー確認済み）。
    これにより01 CLAUDE.md付録Dで未定のまま残っていたレジストラが
    「Cloudflare Registrar」に確定した。Cloudflare Registrarでのドメイン
    取得は同一Cloudflareアカウント内にDNSゾーンが自動的に追加される仕様の
    ため、付録F手順4のDNSレコード追加に必要なゾーンも存在する状態になった
    と見込まれる（ダッシュボード上でのゾーン存在の明示確認はまだ行って
    いない）。**Railway**：新規アカウントを作成しログインを確認した。
    新規プロジェクトを作成し、PostgreSQLプラグインを追加した（現時点で
    テーブルが存在しない空のDB）。`cms/`のデプロイ・GitHub連携・環境変数
    設定・カスタムドメイン追加はまだ未実施。RailwayのPostgreSQLプラグインが
    `DATABASE_URL`を自動発行済みであることも確認した（値はユーザーが
    表示・コピー・共有しておらず、`cms/.env`やRailway環境変数への実際の
    設定はまだ行っていない）。**本番用`PAYLOAD_SECRET`**：`openssl rand
    -base64 32`で生成した値を、画面に表示させずmacOS標準キーチェーンへ
    直接保存する方式（`security add-generic-password`のコマンド置換）で
    生成・保管した（値は会話・CLAUDE.md・GitHub・スクリーンショットの
    いずれにも一切表示・記録していない）。Railway環境変数への実際の設定は
    まだ行っていない。**Cloudflare Pages・R2**：未着手のまま。
    付録Fの「未確認・要対応」のうちアカウント有無に関する項目は解消した
    （詳細は付録F参照）。第11章チェックリストの「実際の構築」項目は進行中
    のため引き続き未チェックのまま据え置く。
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
