# Project 02 意思決定ログ（2/2：直近分）

このファイルは `CLAUDE.md` 第12章の意思決定ログのうち、**新しい方の期間
（2026-08-17〜、直近の重要決定を含む）** を保持する。2026-08-21、
CLAUDE.mdの肥大化（150,000文字上限超過）を解消するための分割作業で作成した。
2026-08-21分までの原文は `CLAUDE.md.backup-20260821.md`（分割前の全文
バックアップ）からそのまま転記しており、内容の要約・書き換えは行っていない。
2026-08-24以降のエントリは分割後にこのファイルへ直接追記したもの。

- 古い方の期間（2026-07-21〜2026-08-17）は `DECISION_LOG_01.md` を参照。
- 現行の仕様・方針・未決事項・直近の重要決定の要約は `CLAUDE.md` 本体を
  参照（本ファイルは経緯の記録であり、現行ルールの正本ではない）。
- 各エントリの並び順は分割前の原文と同じ（新しい日付が先、古い日付が後）。

---

  - 2026-08-28（🌈TNS #32 の historical_import）:
    #33〜#35 の重複排除台帳が完了扱いである一方、その前週の **#32
    （2026-08-03〜08-09、CMS 運用開始前に note.com で公開済み）が CMS に
    一切登録されていない**ことが 2026-08-28 の #32〜#34 台帳確認で判明した
    （edition 行なし・ledger 行なし・専用 MusicTracks なし）。これにより、
    クレジット回復後の #36 本文再生成時に #32 の使用曲が「未使用」扱いで
    再選曲される（気づかれない #32↔#36 重複）リスクがあったため、
    #33〜#35 と同型の historical_import を実施した。
    **7曲の確認**：ローカル資料は皆無（DECISION_LOG 2026-08-21 も同旨を
    記録）。同エントリに記録済みの note #32 URL
    `https://note.com/ginza_whiskers/n/n0136ca15976d` を WebFetch し
    DAILY SOUNDTRACK を抽出：月 Babe / Styx、火 白いパラソル / 松田聖子、
    水 Lotta Love / Nicolette Larson、木 タッチ / 岩崎良美、
    金 This Time I'm in It for Love / Player、土 LOVELAND, ISLAND / 山下達郎、
    日 Hard to Say I'm Sorry / Chicago。洋楽4：邦楽3、発表年 1978〜1985——
    DECISION_LOG 2026-08-21 が記録する「#32 洋楽4曲：邦楽3曲」「全21曲
    1972〜1987」と一致し、抽出の裏付けとした。
    **照合（import 前）**：既存 `music_tracks`（id 12〜65）全件を importer と
    同一の `computeTrackFingerprint`（NFKC → 記号除去 → lowercase）で照合。
    日曜「Hard to Say I'm Sorry / Chicago」のみ既存 **id=54**（release_year
    1982 / international / verified=true）と fingerprint 完全一致 → 再利用。
    残り6曲は exact / 正規化タイトル / 部分一致すべて 0 件 → 新規。
    表記ゆれ懸念曲も個別確認：「LOVELAND, ISLAND」正規化 fp
    `lovelandisland::山下達郎`（山下達郎のレコードが DB に 0 件）、
    「タッチ」正規化 fp `タッチ::岩崎良美`（"Touch"/"TOUCH"/長音表記ゆれ
    含め該当 0）、「This Time I'm in It for Love / Player」はアポストロフィ
    が正規化 regex の除去対象外で両側一貫、同一アーティストの既存 id=58
    「Baby Come Back」は別曲 → いずれも衝突なし・新規で問題なし。
    **実行**：①`./p2 tns import-tracks _imports/tns_edition_32_tracks_import.csv`
    → dry-run（6 would_create / 1 skipped_duplicate / 0 invalid）確認 →
    live 実行で MusicTracks id 66〜71 を作成（`verified=false`、eraEligibility
    は release_year 1978〜1985 から `showa` 自動付与、genre/tags は未設定）。
    Chicago 行は fingerprint 一致で `skipped_duplicate`。②一回限りスクリプト
    `cms/src/scripts/tnsHistoricalImportEdition32.ts`（`getPayload` 直呼び、
    `--dry-run` 対応、abort guard：#32 未登録・参照 track 実在・当該週 ledger
    0 件を確認、ledger 作成は (musicTrack, edition) 重複チェック付き）で
    `soundtrack-editions` id=9（editionNumber 32 / weekStart 2026-08-03 /
    weekEnd 2026-08-09 / status `historical_import`、他フィールドは #33 に
    合わせ未設定）＋`music-usage-ledger` id 29〜35（musicTrack=66,67,68,69,70,71,54
    を月〜日、`reuseAllowed=false`、`dayOfWeek` セット、`ginzaCode` は
    #33〜#35 に合わせ null）を作成。
    **検証（独立 SQL 再照会）**：Ledger 総数 21 → **28**（#32=7 / #33=7 /
    #34=7 / #35=7）。#32 の 7 行すべて track/artist が `music_tracks` に解決
    （NULL 0・orphan 0）、`day_of_week` = `used_date` の実曜日 7/7 一致、
    `reuse_allowed=false` 7/7。重複登録 0（track 単位・(track, edition) 単位
    とも）。`computeNextEditionNumber` 相当（`max(editionNumber)+1`、全 status
    対象）は **37**（#36 が最大で不変）。
    **`findExistingEditionForWeek('2026-08-03')` は null を返す——これは
    正しい挙動**。同関数は `status='historical_import'` を明示除外する仕様で
    （関数内コメント：「historical_import…は『これから生成しようとしている
    週』との重複判定には関係しない」）、#33/#34/#35 も自週で null を返す
    （2026-08-10・08-24 とも null、article_generated の #36 のみ 08-31 で
    自身を返す）。#32 historical_import の目的は週ロックではなく
    MusicUsageLedger による選曲重複排除であり、`reuseAllowed=false` の
    台帳曲が distinct 21 → 28 に増えたことで、クレジット回復後の #36 本文
    再生成時に #32 の 7 曲も除外対象に入る。#32 Edition の存在は直接クエリ
    （`where editionNumber=32` → id=9）で担保。
    **スコープ外（未実施）**：releaseYear / genre / mood / weather / season /
    ginzaCode の確定、MusicTracks の `verified=true` 化、approve・自動投稿・
    AI 生成、#36 への変更、本番 push / DNS / Cloudflare 設定。DB 書き込みは
    ローカル開発（`cms-postgres-1`）のみで、ローカル DB の実データ本体（行
    ダンプ）はリポジトリにコミットしない。
    **成果物**：`_imports/tns_edition_32_tracks_import.csv`、
    `_imports/tns_edition_32_historical_import.json`（edition＋ledger の
    マッピングと手順）、`cms/src/scripts/tnsHistoricalImportEdition32.ts`。

  - 2026-08-28（🌈TNS 2026-08-31週の重複 SoundtrackEditions 整理）:
    次週号（2026-08-31〜09-06）の実運用確認を進める過程で、対象週の
    `SoundtrackEditions` が **3件重複生成**されていることを発見した
    （2026-08-27 のTNSエンジンE2E由来。id=1/#0〈`editionNumber` が壊れた
    初期成果物〉、id=2/#36、id=3/#37）。3件とも `weekStart=2026-08-31`・
    `status=article_generated` のため、`findExistingEditionForWeek` が
    live `./p2 tns next --yes` を必ずブロックし、かつ残存最大 `editionNumber`
    が 37 のため次回採番が #38 になる状態だった。**依存関係の事前確認**
    （読み取りのみ）：3件のいずれも MusicUsageLedger 参照 0 件（既存台帳
    21件はすべて historical `#33`/`#34`/`#35` 由来）、`SocialPosts` 0件、
    他Articleの `relatedArticles` からの参照なし、note公開実績なし
    （3件の紐づく Article 30/31/32 はすべて `reviewStatus=draft`・
    `publishHistory:[]`）。**判断**：id=2/#36 のみ7日分の選曲が完成
    （`pendingDays=0`、trackRefs=[64,47,38,36,61,50,52]）し `editionNumber`
    も Article 31 の `series.editionNumber=36` と整合、かつ note.com の
    historical `#35` の次番号として正しいため、**id=2/#36 を正本として
    そのまま保持**（マロン確定：既存ドラフトを作り直さず正本とする）。
    id=1/#0・id=3/#37 とそれらの空生成 Article 30・32 を削除。**実施**：
    ①削除前に SoundtrackEditions id 1/2/3・Articles 30/31/32 の全文を
    `locale:'all'` で JSON 退避（`_backups/tns_edition_cleanup_backup_
    20260828.json`、167KB。Article 31 本文63ブロックも含む）→ ②依存
    ゼロを再確認（abort guard 付き）→ ③`payload.delete` で
    soundtrack-editions id 1,3 と articles id 30,32 を削除 → ④再確認
    （`_backups/tns_edition_cleanup_verify_20260828.json`）。**削除後の
    状態**：残存 editions は `#33`/`#34`/`#35`（historical_import）＋
    `#36`（id=2, article_generated）のみ。`findExistingEditionForWeek
    ('2026-08-31')` は id=2/#36 単独を返す。`computeNextEditionNumber` は
    37 を返す（次の新規週が #37）。MusicUsageLedger は 21件のまま不変。
    Article 31（#36 正本）は `reviewStatus=draft`・`series #36`・本文63
    ブロック・slug「雨音の境目に」で（整理作業による）破損なし。
    **ただし #36 の本文自体はドラフトとして未完成であり、Anthropic の
    クレジット回復後に AI 再生成で本文を作り直す必要がある**（正本として
    の号数 #36・週 2026-08-31・7日分の選曲 trackRefs・series は確定済みで、
    要再構築なのは本文プローズのみ。既存 Edition/Article レコードは破棄せず
    保持したまま本文だけ差し替える方針）。**未実施**：live 生成・
    approve・自動投稿。号数の付け替えは id=2 が元々 #36 のため不要だった。
    既知の軽微な不整合として id=2 の `music.musicBalance` サマリカウンタ
    （`effectiveJapaneseCount:0` 等）が dailyScenes の実選曲7件と乖離した
    ままだが、選曲実体は `dailyScenes[].musicSelected.trackRef` に正しく
    保持されており表示用集計値のみの問題。整理用スクリプト
    `cms/src/scripts/tnsCleanupDupEditions.ts` はこの1回限りの作業用で、
    冪等ではない（削除済みIDの再 findByID で STEP1 エラー）。

  - 2026-08-28（`./p2 draft-interest`（収益化②）を `./p2 morning` へ接続）:
    要件（既存 draft-today 接続維持／処理順の明示／通常実行は①②とも `--dry-run`／
    実生成は人間の `--yes` のみ／自動投稿しない／同日再実行で重複生成なし／
    ①②間の同一・近似テーマ重複防止／合計最大10本/日〈①5＋②5〉／W_PAID=8・
    C_MATCH=0.6 は config 取得／本番 Railway は `TZ=Asia/Tokyo` 前提）に基づき実装。
    **morning への配線**：step 13 の `draft_today --dry-run` の直後に step 14
    `draft_interest --dry-run` を追加。morning 関数冒頭のコメントを処理順
    （情報収集 → 抽出・採点 → curation〈DiscoveredContent と interest-themes の
    両方〉→ approved判定 → 収益化① draft-today〈最大5本〉→ 収益化②
    draft-interest〈最大5本〉→ 承認待ち一覧〈合計 最大10本/日〉）へ書き換え。
    **①②間の重複防止（要件7）**：`createInterestDrivenDraftsFromThemes.ts` の
    プレマッチ対象プールから、既に何らかの Article が
    `editorialProvenance.discoveredContentSource` で参照している承認済み DC を
    除外（`crossFlowExcludedDiscoveredContent` として dry-run 出力に件数表示）。
    処理順が「①→②」なので、②は「①がまだ CORE 記事化していない承認済み
    Ginza コンテンツ」に対してのみ関心テーマを接続する。①=CORE のみ／
    ②=interest・ginza_whiskers のみと角度が排他のため「同じ角度の重複記事」は
    構造的に発生しない。②内のテーマ近似束ね・同一 DC 先着 deferred は従来どおり。
    **RUNBOOKS 付録F**：`TZ=Asia/Tokyo` 必須の記述に、②の Interest Score
    freshness（`daysSince(capturedAt, now)`）も `now`＝サーバーローカル時刻
    依存で TZ ずれによりスコアが変動しうる旨を追記。
    **実データ検証（ローカル Docker/Postgres）**：`tsc --noEmit`（cms、0エラー）・
    `bash -n`・`./p2 doctor` 全緑。`./p2 morning` で step 13・14 がどちらも
    `--dry-run` で動作・副作用なしを確認。cross-flow 除外の実証——検収用に
    interest-themes「旅行」「写真」＋ DiscoveredContent #217（未記事化）を承認し
    `./p2 draft-interest --dry-run` を実行すると、プレマッチ対象は「1件
    （収益化①で記事化済みのため #97/#100/#150 の3件を除外後）」と表示され、
    旅行→#217 selected／写真→#217 は先着 deferred（写真の自然な接続先 #97 は
    ①系で記事化済みのため除外）。`--yes` で旅行×#217 の Article #47（interest）・
    #48（ginza_whiskers）を reviewStatus:draft で生成、両者に editorialProvenance
    2件ずつ（source #217、verification_status: unconfirmed で正直表示）付与。
    直後の `--dry-run` 再実行で、旅行が `already_generated`、かつ #217 が
    「記事化済み4件を除外」に含まれ写真も `no_ginza_match`（冪等＋②が生成した
    DC も次回以降 ②のプレマッチから自動除外される）。検収用の承認・生成物
    （Article #47/#48）はすべて inbox へ戻し／削除、`articles` 19・承認済み
    テーマ0・承認済み DC 3・rel 0 の投入前状態を確認。使い捨てスクリプトは削除済み。
    **git push なし。W_PAID/C_MATCH の実データ調整は初期値のまま（9月Trial）。**

  - 2026-08-28（収益化② E2E検収 → Trust Layer 修正2件 → morning接続可判定）:
    前エントリで接続した `./p2 draft-interest` を実データ E2E 検収し、
    **1点のみ 要修正**（interest/ginza_whiskers の sourceProvenance 空許容が
    Editorial Trust Layer の「使った事実を検証記録に残す」forcing function を
    外していた——緩和後の実 E2E 4本が `editorialProvenance` 0 件のまま承認
    された）。**修正2件を反映**：
    ① `generateMultiAngleArticleDrafts.ts` の provenance ゲートを **全5角度で
    必須へ戻す**（前日入れた `provenanceRequired = angle !== 'interest' &&
    angle !== 'ginza_whiskers'` 分岐を削除）。`MULTI_ANGLE_SYSTEM_PROMPT` の
    Editorial Trust Layer 節に「include:true のすべての角度は sourceProvenance
    最低1件必須。編集的視点の角度でも会場・日付・人物・歴史・商品・サービス
    等の事実記述を最低1件記録。検証可能な事実がなければ include:false」を追記。
    ② `draftInterest.ts` の CLI 引数検証（`--w-paid ≥ 0`、`--c-match` 0〜1、
    不正値は明示エラー）。
    **再E2E（修正後）**：関心「旅行」× DC #217（蔦屋重三郎「耕書堂跡」、
    中央区観光協会）／「写真」× DC #97（南方書局フェア）で Article #43〜46 を
    reviewStatus:draft で生成。**interest・ginza_whiskers の4本すべてに
    `editorialProvenance` 2件ずつ**付与（source は承認済み #217/#97 のみ、
    source_url 一致、verification_status は confirmed 中心・未確認は
    unconfirmed で正直表示、fact は excerpt に接地）。`--dry-run` 候補順位
    （旅行 final 1.237 / 写真 1.0472 / 日記 1.0 / 読書感想文 0.3、W_PAID=8 は
    順位を跳ねさせず）、`--yes` 実生成4本、同日 `--dry-run` 再実行で
    旅行・写真が `already_generated` スキップ・日記が繰り上がり（冪等）を確認。
    近似テーマ束ね（旅/旅行記/海外旅行 → 旅行）、同一 DC 先着による deferred、
    生成記事の相互 Jaccard（interest×ginza_whiskers 同一テーマで 0.27〜0.32、
    ゲート 0.6 未満で通過するが素材の重なりは残る＝両角度保持方針の帰結）も
    確認。CLI 引数検証（`--w-paid=-3`／`--c-match=1.5`／`--c-match=abc`）が
    明示エラーになることを確認。`tsc --noEmit`（cms、0エラー）・`bash -n`・
    `./p2 doctor` 全緑。検収用の承認（interest-themes・DiscoveredContent #217）
    と生成物（Article #37〜46）はすべて inbox へ戻し／削除、generatedArticles
    rel クリア、`articles` 19・承認済みテーマ0・承認済み DC 3・rel 0 の投入前
    状態を確認。旅行・写真・エッセイの monetization（実 note.com データ）のみ
    保持。使い捨てスクリプトは削除済み。
    **判定：morning 接続可**（要修正なし）。ただし本セッションでは **morning
    へは接続していない**（ユーザー指示）。git push なし。

  - 2026-08-28（Project 02-2 収益化②「興味関心 × 銀座 × GINZA WHISKERS視点 最大5本/日」接続）:
    マロン確定方針（W_PAID=8／C_MATCH=0.6／Phase B は B2〈monetization グループ〉／
    プレマッチは approved DiscoveredContent のみ／angles は interest と
    ginza_whiskers の両方保持／最大5本/日／人間承認ゲート維持／自動投稿なし／
    既存 Phase A・B・draft 生成を最大限再利用／新規 AI スキーマ最小限／
    W_PAID・C_MATCH は config 化し9月Trialで調整）に基づき実装。
    詳細仕様（処理順・スコア式・config・5本選定ロジック・変更ファイル）は
    `PROJECT_02_2_INTEREST_MONETIZATION_SPEC.md` §8 を正本とする。ここでは
    決定と実E2E結果の要点のみ記す。
    **処理順**：Phase A（承認済み interest-themes ＋ 既存 computeInterestScore、
    式・weight・decay 無変更 → topicInterestScore）→ Phase B（
    interest-themes.monetization.paidRatio → monetizationMultiplier =
    clamp(1 + 8×paidRatio, 1.0, 1.6)、paidRatio 未取得/サンプル過小は 1.0 →
    finalRankScore = topicInterestScore × multiplier）→ Phase C 段1（承認済み
    DiscoveredContent への決定的プレマッチ：包含／
    computeThemeBigramContainment ≥ 0.6／pillar hint）→ Phase C 段2（
    multi-angle の interest/ginza_whiskers 角度の include が銀座接続の最終判定）
    → Phase D（同 multi-angle 呼び出しが Article(reviewStatus: draft) を作成）
    → 既存 Articles.ts 人間承認ゲート。
    **新規 AI ツールスキーマは追加していない**——`readerInterestTheme` は
    generateMultiAngleArticleDrafts の user メッセージへ注入する1文字列のみ。
    **新規ファイル**：`lib/interestDiscovery/config.ts`（`INTEREST_W_PAID`
    既定8／`INTEREST_C_MATCH` 既定0.6／`INTEREST_MAX_DAILY_DRAFTS` 5／
    `INTEREST_MIN_PAID_SAMPLE` 500／`INTEREST_MAX_MON_MULT` 1.6、すべて
    env 上書き可）、`monetizationScore.ts`、`pillarHint.ts`（keyword→収蔵室の
    exact 部分一致、類似度なし）、`capturePaidRatio.ts`（note.com/hashtag/<tag>
    と ?paid_only=true の差分、非AI）、`lib/ai/createInterestDrivenDraftsFromThemes.ts`
    （オーケストレーター本体）、`scripts/interestPaidRatio.ts`／`draftInterest.ts`、
    `scripts/format_draft_interest_status.py`。
    **既存への変更（最小・後方互換）**：`collections/InterestThemes.ts` に
    `monetization` group（totalArticleCount/paidArticleCount/paidRatio/
    sampleSize/isApproximate/capturedAt、全 readOnly、非AI）＋
    `generatedArticles` relationship（hasMany、冪等キー兼トレーサビリティ）。
    `createMultiAngleDraftsFromDiscoveredContent` に `readerInterestTheme`/
    `interestThemeKey` option（`aiGeneratedBy` へ `|interestTheme=<正規化テーマ>`
    付与）。`textSimilarity.ts` に `computeThemeBigramContainment`（テーマ側
    bigram の被覆率＝非対称。既存の対称 Jaccard は短語×長文で0に潰れるため新設）。
    `parseNoteHashtagPage.ts` が「約N件」概数を `totalArticleCountIsApproximate`
    で返すよう拡張。`scripts/project02` に `interest paid-ratio` ／
    `draft-interest` を配線（`--dry-run`／live は `--yes` 必須／`--limit`／
    `--strict`／`--w-paid=`／`--c-match=`）。**`./p2 morning` へは未接続**
    （ユーザー指示）。
    **実データ検証（ローカル Docker/Postgres）**：`payload generate:types`・
    `npx tsc --noEmit`（cms、0エラー）・`bash -n`。schema push で
    `monetization_*` カラム・`interest_themes_rels` テーブル生成を確認。
    承認済みテーマ 0 の状態で `--dry-run` が「0クラスタ」を正しく返すことを確認。
    検収用に interest-themes 5件（旅行/日記/読書感想文/コミティア157/
    飲み物のある時間）を user id=1（editor）名義で承認（beforeChange 人間ゲートを
    req.user 付きで通過。AI バイパスではない）。`./p2 interest paid-ratio 旅行`
    ＝実 note.com 取得で total 337,601／paid 約10,000（概数）／paidRatio ≈ 2.96%
    を monetization へ保存。`./p2 draft-interest --dry-run` で
    旅行 topic 1.0 × mon 1.237 = final 1.237（先頭）、日記/コミティア157 = 1.0、
    読書感想文/飲み物のある時間 = 0.3（official_topic confidence low）の順位、
    および `--w-paid=20 --c-match=0.3` での乗数変化（旅行 → 1.5924、上限1.6の
    手前）を確認。承認済み DC（当時3件、niche 美術/イベント展示）とは
    どのテーマも接点なく全 `no_ginza_match`。
    **実 E2E と修正**：検収用に DiscoveredContent #217「蔦屋重三郎『耕書堂跡』」
    （中央区観光協会、other→文化、score 43）を同名義で承認。`--dry-run` で
    旅行 → #217（inclusion）が `selected`、日記/読書感想文 → #217（pillar_hint）が
    同一DC先着で `deferred` になることを確認。`--yes` 実行時、interest/
    ginza_whiskers の両角度が **sourceProvenance 空**により multi-angle の
    検証で全落ちする不具合を発見。core/need/experience（事実主体の角度）では
    provenance ≥ 1 必須が妥当だが、interest/ginza_whiskers は編集的視点が主体で
    元情報の facts を直接列挙しない書き方が正しいことも多いため、
    **この2角度に限り sourceProvenance 空を許容へ緩和**（Editorial Trust Layer は
    プロンプトの「元情報にない事実を作らない」で担保）。再実行で Article #37
    （interest/medium「大河ドラマの舞台を歩く旅——…耕書堂跡から中央区の版元
    めぐりへ」、provenance 5件）・#38（ginza_whiskers/medium「銀座から日本橋へ
    ——江戸の出版文化が結ぶ、旅する街の記憶」、provenance 3件）を
    reviewStatus:draft で生成。`aiGeneratedBy` に `interestTheme=旅行` 付与、
    `interest-themes.generatedArticles` に #37/#38 紐付け、`--dry-run` 再実行で
    旅行が `already_generated` スキップされることを確認（冪等）。
    **検収後、検収用の承認（interest-themes 5件・DiscoveredContent #217）は
    すべて inbox へ戻し、Article #37/#38 は削除、generatedArticles rel も
    クリアした**——旅行の monetization（実 note.com データ）のみ意図的に保持。
    使い捨てスクリプト（`_tmpApproveDemoThemes.ts`／`_tmpApproveDemoDc.ts`／
    `_tmpCleanup.ts`）は削除済み。`articles` 19件・承認済みテーマ0・承認済み
    DC 3件・theme_article_rels 0 の投入前状態を確認。
    **今回行っていないもの**：`./p2 morning` への接続、W_PAID/C_MATCH の
    実データ調整（初期値のまま）、pillarHint 表の拡充、テーマ近似束ね・上限
    スライスの実データ発火確認（承認済みテーマ不足）、git push。

  - 2026-08-28（`./p2 draft-today` 品質検収 → 本番運用可判定 → `./p2 morning` 接続）:
    前エントリで実装した `./p2 draft-today` の品質検収を実データ
    （ローカルDocker/Postgres）で実施し、**本番運用可**と判定した。
    **検収結果の要点**：(1) 本セッションで `draft-today` が生成したのは
    Article #35（DiscoveredContent #100「EXHIBITION LEAK ASSEMBLY」、
    core/medium）・#36（#150「赤地陶房のうつわ」、core/short）の2本
    （※Article #25〜29 は 2026-08-27 の multi-angle エンドポイントE2E由来で
    別コードパス）。(2) 最大5本ルール：approved 3件 → 既ドラフト化除外1件
    （#97）→ pending 2件 → 類似統合0件 → distinct 2件 → 上限5未満のため
    全2件採用・繰り越し0。Editorial Score降順（#100=51点 > #150=33点）。
    (3) ドラフト相互の実質重複なし（別イベント・別会場・別出典）。
    (4) Editorial Trust Layer：#35/#36 とも provenance 全4件が
    `verificationStatus=confirmed`・`sourceType=official`、会期・会場・
    営業時間は出典excerptと逐語一致、出典URLは本文SOURCE行＋provenance
    双方に保持、推定はヘッジ表現（#36「親子とみられる」「個別に確認する
    ことが望ましい」）。(5) 鮮度：#35 は 8/28 開幕・開催中、#36 は
    8/19〜9/7 開催中——終了済み情報なし、開催中候補を優先できている。
    (6) `tsc --noEmit`（cms、0エラー）・`bash -n`・`./p2 doctor` 全緑。
    冪等性：`--yes` 再実行で #97/#100/#150 すべて除外・0件生成を確認。
    (7) 副作用なし：DiscoveredContent #100/#150 の `curationStatus`・
    `decisionAt` 不変、`social_posts` 0件のまま。
    **検収で確認した既知の限界（ブロッカーではない、今回は変更しない）**：
    ①類似統合（Jaccard≥0.6）・上限スライス（5）は承認候補が2件のため
    実データE2E未発火（型検査・コードレビューのみ）。②`〈LEAK〉`等の記号
    入りタイトル・`slug`・英語固有名詞ハッシュタグ（`#LEAK`）の自動整形は
    未処理——RUNBOOKS付録Cへ既知TODOとして追記（既存のスラッグ整形TODOと
    同じ扱い、公開前に編集長が手動整形する前提）。③#36本文の「2026年7月
    27日付で公開」は出典excerpt内の「2026.07.27」に基づくが構造化
    provenance未登録の軽い解釈——編集長レビューでの一瞥推奨。
    **`./p2 morning` 接続**：morning の既存方針（外部ログイン・課金操作・
    自動投稿・本番デプロイを一切行わない、ローカル起動＋診断のみ）を
    崩さないため、morning は手順13で **`draft_today --dry-run`**
    （当日approved → 本日ドラフト化予定の確認まで。AI呼び出し・DB書き込み
    なし）を実行する。実生成は人間が別途 **`./p2 draft-today --yes`** を
    明示実行する——`--yes` 必須＝Claude API課金の明示確認、という既存方針
    （`./p2 tns next` と同型）をそのまま維持。morning 関数冒頭に日次
    パイプラインの処理順（情報収集 = SOURCE LEDGER Jobs Queue → 抽出・採点
    = `./p2 crawl`/`score`/`score-articles`〈morning外・課金あり〉→
    curation = 人間の Maron Editor's Choice → approved判定 = 人間承認ゲート
    `DiscoveredContent.curationStatus=approved`〈req.user必須〉→ draft-today
    → 最大5本が reviewStatus:draft の承認待ちへ）をコメントで明示した。
    フォーマッタ（`format_draft_today_status.py`）の dry-run 末尾ヒントを、
    採用トピックがある時のみ `./p2 draft-today --yes` を案内し、0件時は
    「対象なし」と表示するよう小改修。
    **Railway本番の `TZ=Asia/Tokyo`（RUNBOOKS付録F追記）**：`draft-today`
    の「当日」判定（`decisionAt >= その日の0時`）の0時は
    `Date.setHours(0,0,0,0)` ＝サーバープロセスのローカルTZ基準のため、
    UTCのRailwayでは日境界が9時間ずれる。SOURCE LEDGER cron と同じく
    `TZ=Asia/Tokyo` の設定でまとめて解消する（`draft-today` 側の追加設定は
    不要、`--since=YYYY-MM-DD` の解釈も同じローカルTZ基準）。
    **今回行っていないもの**：新規機能追加、`draft-today --yes` の再実行
    （#35/#36 は `draft` のまま）、「興味関心×銀座 5本/日」（Project 02-2
    Phase C以降）への接続、`recommend_next_step` の変更、git push。

  - 2026-08-28（「旬の銀座」日次オーケストレーション `./p2 draft-today` の実装）:
    これまで手作業でエンドポイント/スクリプトを個別に叩いていた「Maron
    Editor's Choiceで承認 → 記事ドラフト生成」を1つの日次ルーチンへまとめ、
    「旬の銀座 最大5本/日」を実運用可能にした。**方針（マロン確定：トピック
    優先）**：当日 `curationStatus=approved` になった DiscoveredContent
    （`decisionAt` が当日以降、`--since=YYYY-MM-DD` で遡り可）を取得 →
    既にドラフト化済み（`Articles.editorialProvenance.discoveredContentSource`
    から逆引き）を除外して冪等化 → 類似テーマ（title+excerpt の文字バイグラム
    Jaccard類似度 ≥ 0.6、`lib/curation/textSimilarity.ts` 再利用）で束ねて
    distinct トピック化（代表は Editorial Score が高い方）→ Editorial Score
    降順で上位 `maxDrafts`（既定5、`--limit=N` で上書き）を選抜 → 各トピック
    1本ずつ、既存 `createMultiAngleDraftsFromDiscoveredContent` を
    **CORE 角度のみ**で再利用して `Article(reviewStatus: draft)` を作成。
    上限超過分は「翌日以降へ繰り越し」として報告する。**新規ファイル**：
    `cms/src/lib/ai/createDailyDraftsFromApproved.ts`（オーケストレーション
    本体）、`cms/src/scripts/draftToday.ts`（CLIエントリ）、
    `scripts/format_draft_today_status.py`（結果フォーマッタ）。
    `scripts/project02` に `draft_today()` 関数・`draft-today)` dispatch・
    usage行を追加。**既存コードへの変更（最小・後方互換）**：
    `createMultiAngleDraftsFromDiscoveredContent` に第3引数
    `options?: { angles?: MultiAngleKey[] }`、`generateMultiAngleArticleDrafts`
    の入力に `angles?` を追加——**AIツールスキーマ（`MULTI_ANGLE_DRAFT_TOOL`、
    常に5候補・全フィールドrequired）は一切変更せず**、指定外角度は
    プロンプトで「include:false・skipReasonのみで可（本文生成不要）」と伝え
    保存ループでも対象外にするだけ。既定（引数なし）は5角度すべてで従来
    どおり——既存エンドポイント `POST /api/ai/generate-multi-angle-draft`・
    手動スクリプトの挙動は不変。**承認フロー・recap方針**：生成物はすべて
    `reviewStatus: draft` で既存 `Articles.ts` beforeChange 人間承認ゲートを
    そのまま通る（新しいゲート・バイパスなし）。コスト発生処理は既存
    `./p2 tns next` と同じく実行時 `--yes` を必須、`--dry-run` は選定計画のみ
    （AI呼び出し・DB書き込みなし、`--yes` 不要）。
    **検証（ローカルDocker/Postgres実データ）**：`npx tsc --noEmit`（cms、
    0エラー）。`./p2 draft-today --dry-run`＝当日approved 0件（正常、当日分の
    承認なし）。`./p2 draft-today --dry-run --since=2026-08-01`＝approved 3件
    のうち #97 は既ドラフト化のため除外、distinct 2件（#100=51点／#150=33点、
    類似統合は該当なし）。`./p2 draft-today --yes --since=2026-08-01`＝実
    Claude API 2回で Article #35（#100「EXHIBITION LEAK ASSEMBLY」core/
    medium）・#36（#150「赤地陶房のうつわ」core/short）を `draft` で生成。
    両ドラフトとも `editorialProvenance` に date/venue/hours 等の fact が
    `verificationStatus: confirmed`・`sourceType: official`・元
    discoveredContentSource 紐付きで保存されることを DB で確認。直後に
    `--yes` を再実行し、#100/#150/#97 すべてが「既にドラフト化済み」で
    除外され 0件生成・API呼び出し0（冪等性）を確認。**今回行っていない
    もの**：本番Railwayへの反映、git push（※本セッションでローカルコミット
    は行う）、生成した #35/#36 の承認遷移（`draft` のまま）、`./p2 morning`
    への組み込み、TZ を跨ぐ環境での `decisionAt` 当日判定の検証
    （ローカルは JST、Railwーは `TZ=Asia/Tokyo` 設定が別途必要——付録F既知
    事項と同じ）。

  - 2026-08-28（2026-08-27未コミット変更の整理・型検証・単一コミット化）:
    2026-08-27セッションで実装されながらコミット・文書化されていなかった
    3系統の変更（下記の同日3エントリ——Project 02-1 multi-angle／TNSエンジン
    実コード化／Project 02-2 Interest Discovery Phase A・B）を、今日の新規
    実装（`./p2 draft-today`）に着手する前に安全に整理した。**実施内容**：
    ①`git diff`・未追跡ファイル62点（うち `CLAUDE.md.backup-20260821.md`
    は2026-08-21分の既存バックアップのため対象外）を全件確認し、変更が
    Project 02配下（`02-discover-ginza-media-system/`）に限定されること、
    ワークスペースルート `CLAUDE.md`・`01-ginza-whiskers-brand-site/CLAUDE.md`
    の未コミット変更はProject 01の2026-08-19 PMO整合性更新であり本コミット
    対象外であることを確認した。②`npx tsc --noEmit`（cms）を実行し **0
    エラー**を確認（`payload-types.ts` は `.gitignore` 対象＝ローカル再生成
    物で、新規4コレクション〈interest-themes／music-tracks／
    music-usage-ledger／soundtrack-editions〉＋global〈tns-settings〉を
    含む状態で型が通ることを確認）。③残存する使い捨てスクリプト
    （`_tmp*`）・`FIXME`/`BROKEN`/`@ts-ignore` 等の問題マーカーがない
    ことを確認。**型修正・コード修正は不要だった**（2026-08-27の実装が
    そのまま型健全）。④`CLAUDE.md` 第3章のTNS記述（「実コード実装・実
    コレクション作成・外部天気API導入は行っていない」）が実態と乖離して
    いたため更新、第12章の意思決定ログ一文要約にmulti-angle・TNSエンジンの
    2件を追加、最終更新日を2026-08-28へ。⑤上記すべてを**1コミット**
    （日本語・命令形要約）にまとめた。**今回行っていないもの**：実
    `ANTHROPIC_API_KEY` を使ったAI呼び出し（multi-angle／TNS／interestの
    いずれのAI経路も未実行）、ローカルDBへのスキーマ反映・実データ投入、
    Railway本番展開、git push、Project 01側変更のコミット。

  - 2026-08-27（Project 02-1「核情報→最大5記事」multi-angle記事生成の実装）:
    Maron Editor's Choiceで `curationStatus: approved` 済みの
    DiscoveredContent **1件**（核となる旬の銀座情報）を入力に、性質の異なる
    最大5角度——CORE（核記事）／NEED（読者ニーズ）／EXPERIENCE（体験提案）
    ／INTEREST（関心接続）／GINZA_WHISKERS（編集視点）——の記事候補を生成
    する第3の並行エントリーポイントを追加した。既存の
    `createDraftFromSource.ts`（Source単体）・
    `createWeeklyDraftFromDiscoveredContent.ts`（複数DiscoveredContent→1
    記事）は挙動を一切変更していない。**新規ファイル**：
    `lib/ai/generateMultiAngleArticleDrafts.ts`（TNS専用システムプロンプト
    ＋`emit_multi_angle_article_candidates`ツールスキーマ。candidatesは
    常に5件・各角度の `include`/`skipReason` はAIの品質判断）、
    `lib/ai/createMultiAngleDraftsFromDiscoveredContent.ts`（1
    DiscoveredContent→最大5 Article〈`reviewStatus: draft`〉のオーケスト
    レーション）、`endpoints/generateMultiAngleDraft.ts`（`POST
    /api/ai/generate-multi-angle-draft`、認証必須）、
    `scripts/generateMultiAngleDraft.ts`（手動テスト用CLI、`./p2` 未統合）、
    `lib/curation/multiAngleQualityGate.ts`（AIの自己申告に依存しない
    コード側の二重チェック——`assessContentRichness` で boilerplate 相当を
    除外＋文字バイグラムJaccard類似度≥0.6 の重複角度を先勝ちで除外）、
    `lib/curation/textSimilarity.ts`（`computeCharBigramJaccardSimilarity`、
    決定的・AI呼び出しなし）、`lib/curation/contentTypeToPillar.ts`
    （既存 `createWeeklyDraftFromDiscoveredContent.ts` 内にあった
    `CONTENT_TYPE_TO_PILLAR_NAME` を共有モジュールへ抽出、対応関係は不変）。
    **既存ファイルの変更**：`generateArticleDraft.ts` は
    `formatEditorsChoiceHeading`・`buildRelatedArticlesBlocks`・
    `WEEKLY_SOURCE_PROVENANCE_SCHEMA`・`formatVerifiedAtForDisplay` の
    可視性を `export` にしただけ（挙動不変）、
    `createWeeklyDraftFromDiscoveredContent.ts` は抽出した共有モジュールを
    import する差分のみ。**Editorial Trust Layer準拠**：元情報にない事実を
    生成させない、`sourceName`/`sourceUrl`/確認日時はシステムが機械的に
    付与（AIに生成させない）、`verifiedAt` は `lastCheckedAt ?? detectedAt`
    の実クロール記録のみ、回遊導線（関連記事）は `findRelatedArticles` で
    DBから機械的に取得。生成物は全て `reviewStatus: draft` で、既存
    `Articles.ts` の `beforeChange` 人間承認ゲートをそのまま通る（新しい
    ゲート・バイパスなし）。`volume`（short/medium/long）は専用スキーマを
    増やさず `aiGeneratedBy` へ角度と共に記録。**実AI E2E**：2026-08-27に
    DiscoveredContent id=97 で1回実行し、`include:true` の候補で
    `metaTitle`/`metaDescription` が省略される事象（4/5候補）を発見、
    ツールスキーマの `required` を全フィールドへ拡張して修正済み——
    **修正後の再検証は未実施**。`./p2` への統合も未実施。

  - 2026-08-27（🌈Tokyo Nostalgic Soundtrack〈TNS〉エンジンの実コード化・
    楽曲データ基盤・7曲選定ロジック）: `TNS_SPEC.md` で設計のみ確定して
    いたTNS週次生成フローを実コードとして実装した（`CLAUDE.md` 第3章の
    「実コード実装・実コレクション作成・外部天気API導入は行っていない」
    という記述は本実装で解消、同章を更新済み）。**新規コレクション**：
    `MusicTracks`（楽曲マスタ、`verified` 既定 false＝候補、
    `eraEligibility` 自動判定）、`MusicUsageLedger`（過去使用曲の重複防止
    台帳）、`SoundtrackEditions`（週次エディション、`editionNumber` は
    既存最新+1の自動採番）。**新規global**：`TNSSettings`（曜日→TNS
    Editorial Codeマッピング、Code別固定ムードラベル、
    `historicalReferenceJapaneseRatio` 等）。**新規ライブラリ**
    （`lib/tns/`）：`createWeeklySoundtrackEdition.ts`（オーケスト
    レーション、既存の generate→`payload.create`〈`reviewStatus: draft`〉
    パターンを踏襲——TNS固有の承認フローは作らず既存 `Articles.reviewStatus`
    を承認ゲートに使う）、`selectWeeklyTracks.ts`＋`musicScoring.ts`
    （**選曲はAIの外**——天気・気分・曜日特性・季節・GINZA CODE適合度の
    決定的スコアリング＋週全体の邦楽/洋楽比率最適化。「実在しない曲・
    歌手・年を生成しない」を候補プール制限だけでなく選定プロセス自体から
    構造的に担保）、`generateTnsWeeklyEditionDraft.ts`（AIは確定済み曲への
    詩的な編集コメント〈`readerFacingComment`〉の執筆のみ担当。曲未確定日は
    強制空文字、`weeklyEnglishSubtitle` の7日重複はコード側で類似度検証し
    重複時は記事化中止）、`fetchWeeklyWeather.ts`（**Open-Meteo**——APIキー
    登録・契約・課金不要の公開天気API、実装前にユーザー承認済み。取得失敗
    時は `weatherSource: 'manual'` フォールバック）、`weekDates.ts`／
    `findExistingEditionForWeek.ts`（同一対象週の二重生成を天気取得・AI
    呼び出しより前にブロック＝重複時のAPI課金ゼロ）、`buildTnsArticleBlocks.ts`
    ／`seasonVisualBrief.ts`／`importMusicTracksCandidates.ts`／
    `parseMusicTracksImportFile.ts`／`trackIdentity.ts`（title×artist
    正規化フィンガープリントで重複スキップ）／`musicCandidates.ts`／
    `testWeeklySoundtrackSelection.ts` 等。**新規エンドポイント**：`POST
    /api/ai/generate-tns-weekly-edition`。**新規スクリプト**：`./p2 tns
    next --yes [--dry-run]`（次週Draft生成、`--yes` 必須＝Claude API課金の
    明示確認）、`./p2 tns status`（読み取り専用）、`./p2 tns import-tracks
    <file> [--dry-run]`（CSV/JSON一括インポート、`verified=false` 既定）、
    `./p2 tns approve` は**設計のみ・未実装**（final approval／
    MusicUsageLedger本番登録を将来担当）。**MusicUsageLedgerへの本番使用
    登録は `createWeeklySoundtrackEdition` から削除**——最終承認後に別
    コマンドが担当する責務へ切り出し（承認前は「使用済み」を確定させない）。
    **import-templates/**：`music_tracks_candidates_template.csv`/`.json`/
    `README.md` と、マロンが2026-08-27に承認した候補曲30件の
    `tns_candidate_pool_v1_review.csv`（未DB投入）。**今回行っていない
    もの**：実 `ANTHROPIC_API_KEY` を使ったTNS週次生成のE2E、ローカルDBへの
    スキーマ反映・候補曲の実投入、`note.com/ginza_whiskers` で公開中の実
    TNS（#32〜#34）との連番整合の実確認。

  - 2026-08-27（Project 02-2「興味関心×収益性」エンジン Phase A/B）:
    詳細は `PROJECT_02_2_INTEREST_MONETIZATION_SPEC.md`（新規、生きた文書
    として以後追記）を正本とする。要点のみ：処理順 A（Interest Discovery）
    →B（Monetization Scoring）→C（GINZA変換）→D（記事生成）→E（学習）を
    固定し、**今回はA実装＋B調査まで、C以降は未接続**。**Phase A**：新規
    `interest-themes` コレクション＋`lib/interestDiscovery/`（13ファイル）。
    3シグナル——`note_rising`（`note.com/trend` 急上昇タグ上位5件、
    confidence high）／`note_official_topic`（`note.com/info/rss` の開催中
    推定お題、confidence low）／`note_hashtag_popular`（`note.com/hashtag/
    <tag>` の総記事数・関連タグ、confidence high）。Interest Score統合
    （`computeInterestScore.ts`、confidence比例配分×sourceType別freshness
    減衰×cross-source overlap乗数、読み取り専用）。CLI：`./p2 interest
    fetch-note-rising|fetch-note-official|fetch-note-hashtag <tag> [--dry-run]`
    ／`./p2 interest score`。既存Sources/DiscoveredContent/Editorial Score
    のスキーマ・フックは無変更、`beforeChange` 人間ゲート（inbox→approved/
    rejected）は既存パターンを踏襲。実データ21件（観測初日のみ）。
    **Phase B**：paidRatio（`?paid_only=true` の記事数比率）を試験Proxyと
    して5テーマで計測（DB未保存・恒久コマンド化せず）。「約10,000件」概数
    表示のパース不具合（`parseNoteHashtagPage.ts`）は修正済み。売上・CVR・
    購入者数等は公開取得不可と確認。**Claude API・有料API呼び出しは一切
    なし**（全てnote公開ページ/RSSのGETのみ）。数値（Signal Weight・
    freshness減衰カーブ・overlap乗数）は「初期提案」で人間の最終承認待ち。

  - 2026-08-26（note編集部ノウハウのEditorial Style Engineへの正式反映）:
    ユーザーが確認した「note編集部の公式記事」から抽出した10項目のノウハウを、
    Project 02の記事生成・編集ロジック（`generateArticleDraft.ts`・
    `Articles.ts`・`createDraftFromSource.ts`・
    `createWeeklyDraftFromDiscoveredContent.ts`）へ正式反映した。作業着手前に
    まず現状の実装状況を確認したところ、2026-08-25（直後のエントリ参照）の
    Editorial Style Engine週次生成実装が既にHook/THIS WEEK IN GINZA/Editor's
    Choice/Source Provenance/結びという構造・Editorial Trust Layer・タイトル
    体験型優先まで実装済みであることが判明し、今回はその土台の上に10項目を
    差分反映する形で進めた。
    **反映した10項目とコード上の対応**：①「なぜ今読む価値があるか」が短く
    伝わる冒頭構成→hookプロンプトへ「今読む理由」の明示を必須化。②スマホ
    閲覧前提で長すぎる段落・冗長な説明を避ける→段落2〜3文・前置き禁止を
    プロンプトへ明文化。③見出しだけで内容把握できる構造→categoryLabel/
    name/periodの具体性を必須化。④単なる情報羅列ではなく独自の編集視点→
    既存editorsNote要件を維持・強化。⑤読者の気分・体験・発見への接続→
    2026-08-21にCLAUDE.md上で確定していた「読者接続の編集ロジック」（社会・
    季節・生活文脈→気分→体験・発見→Editor's Choice）を、今回初めて実際の
    プロンプト文言としてコード化した（従来は方針のみでコード未反映だった）。
    ⑥関連記事・シリーズ・プロフィール等の回遊導線→新規
    `Articles.relatedArticles`（自己参照relationship）と新規
    `cms/src/lib/ai/relatedArticles.ts`（`findRelatedArticles`）を追加。
    同じ収蔵室（pillar）を持つ公開済み記事をDBから機械的に検索して自動候補
    提示する決定的ロジックとし、AIには関連記事のタイトルを一切作文させない
    （存在しない記事の捏造を防ぐ、Editorial Trust Layerの「推測で補完しない」
    原則をそのまま踏襲した設計判断）。⑦noteクリエイターページ上でのシリーズ
    性→新規`Articles.series`（`label`/`editionNumber`）を追加。既存のTNS
    （Tokyo Nostalgic Soundtrack、#32〜#34が`note.com/ginza_whiskers`で
    公開済みと確認済み——本セッションで本ファイル内の直前のTNS関連エントリを
    確認して存在を把握した）と同じ「#連番」形式の慣例を「旬の銀座」週次記事
    にも適用し、`createWeeklyDraftFromDiscoveredContent.ts`が既存の週次記事数
    （`aiGeneratedBy`が`claude-sonnet-5 (weekly-digest)`の件数）から機械的に
    連番を算出、本文冒頭に「GINZA WHISKERS SERIES｜旬の銀座 #NNN」という
    目印ブロックを追加する。単発の単一Source記事にはこの番号を付与しない
    （既存の6本柱タクソノミー記事とは性質が異なるため）。⑧記事末尾は説明を
    重ねすぎず次の行動を1つ→新規`callToAction`フィールド（Articles
    スキーマ・AI出力スキーマ双方）を追加し、既存のclosing（結びの短文）とは
    分離。生成ブロック内では「→ 次に：{callToAction}」という1行として本文
    末尾に配置し、closingとの内容重複・複数依頼の並列を構造的に避けた。
    ⑨ハッシュタグは多用せずテーマに絞る→従来Xのみだった「1〜2個まで」の
    制約に加え、note本文のハッシュタグにも「3〜5個まで」の上限をプロンプト
    へ新規追加した（従来note側には上限の指定がなかった）。⑩自動生成後も
    マロンが最終編集・承認できる構造→新規追加したcallToAction/
    relatedArticles/seriesのいずれも、既存の`reviewStatus`人間承認ゲート
    （`Articles.ts`の`beforeChange`フック、draft→review→approved→published）
    の対象範囲にそのまま含まれることを確認した——新しい承認バイパス経路は
    作っていない。
    **スキーマ変更の詳細**：`Articles.ts`に`callToAction`（text,
    localized）・`relatedArticles`（relationship, hasMany, relationTo:
    'articles'、自己参照）・`series`（group: `label` text / `editionNumber`
    number readOnly）を追加した。2026-08-25の`editorialProvenance`追加時に
    発生したPostgres識別子長制限（63文字）の教訓を踏まえ、新規追加した
    select/relationshipフィールドで同種の衝突が起きないことを
    `payload generate:types`の正常終了で確認した。
    **検証内容**：`payload generate:types`実行（`payload-types.ts`に
    `callToAction`/`relatedArticles`/`series.editionNumber`が正しく反映
    されたことを確認）、`tsc --noEmit`（cms、0エラー）。
    **今回行っていないもの**：実際の`ANTHROPIC_API_KEY`呼び出しによる
    E2E検証（本セッションでは鍵の有効性を確認していない）、ローカル
    Postgres環境への実際のスキーマ反映・実データでの動作確認、`./p2`
    CLIへの週次生成コマンドの追加、note・X・LINEへの実配信、Sources/
    DiscoveredContent/Editorial Score等の既存データ・既存フローの変更。

  - 2026-08-25（週次「旬の銀座」記事生成の実装、Human Editor Review
    P0〜P2反映）: 既存の単一Source（Source 1件→Article 1件）記事生成フロー
    とは独立した並行フローとして、複数DiscoveredContent（Maron Editor's
    Choiceで`curationStatus: approved`済み）を入力に取る週次「旬の銀座」
    記事生成を追加した。新規`generateWeeklyArticleDraft`
    （`generateArticleDraft.ts`）・新規
    `createWeeklyDraftFromDiscoveredContent.ts`・新規`POST
    /api/ai/generate-weekly-draft`エンドポイント（`generateWeeklyDraft.ts`）
    を実装し、`payload.config.ts`へ配線した。直前に行われたHuman Editor
    Reviewの指摘（P0〜P2優先度）を設計へ反映済み：P0-1（sourceName/
    sourceUrl/確認日時をAIに生成させず、システム側の実データ
    〈`WeeklyCandidateInput`〉から機械的に付与——確認日の捏造を防ぐ）、
    P0-2（fact単位のSource Provenanceを`Articles.editorialProvenance`
    〈新規フィールド〉へ保存し追跡可能にする）、P0-3（生成された
    editorsChoiceItems件数が入力候補数と一致しない場合は承認済み候補の
    欠落・統合を疑い記事化を中止する防衛ライン）、P1-3（公開本文の
    SOURCE表示は候補ごとに1ブロックへ集約、fact単位の詳細は本文に出さず
    内部保存のみ）、P1-4（editorsNoteに「なぜ銀座で体験する価値があるか」
    等の観点を最低1つ含めることを必須化）、P1-5（タイトルをカテゴリー
    列挙型ではなく体験型優先にする指示を追加）、P2-6（DiscoveredContentの
    contentTypeから収蔵室を自動推定し明示指定分と合算する仕組み）。
    `Articles.ts`に`editorialProvenance`（array、fact/sourceName/
    sourceUrl/verifiedAt/sourceType/factType/verificationStatus）を新設。
    実装中、Postgres識別子長制限（63文字）——versions機能のプレフィックスと
    組み合わさると既定の自動生成enum型名が63文字を超えてPayload起動時
    エラーになる——を実機で確認し、配下のselectフィールドに短い`dbName`
    （`ep_source_type`等）を明示して回避した。**今回も実際のAI呼び出し・
    ローカルDBへの実データ投入・note等への実配信は行っていない**（実装・
    静的検証のみ）。

  - 2026-08-24（Maron Editor's Choice候補選定の実運用確認・外部確認中の記録）:
    Sources／DiscoveredContentのEditorial Score・evaluate-inboxの実運用検証
    セッションの一環として、DiscoveredContent id:97「南方書局のハッピーサマー
    ミニミニ大百貨店」（銀座 蔦屋書店、2026年8月16日〜9月4日開催、
    Editorial Score 47点）をMaron Editor's Choice候補として選定した。
    **対象・案件名**：DiscoveredContent id:97「南方書局のハッピーサマー
    ミニミニ大百貨店」。
    **現在の状態**：`curationStatus`は`inbox`のまま変更していない
    （approved/rejectedへの遷移はコード上ログイン済み人間のみ実行可能な
    設計、AI・自動化からは今回も一切遷移させていない）。**状態：外部確認中**
    （後述の問い合わせ文案はMaron確認済みだが、本セッションでは実際の送信は
    行っていない）。
    **未確認項目（4件）**：①入場条件、②予約要否、③限定特典の具体的内容、
    ④店内・展示・書籍の撮影可否——公式サイト（イベントページ・アクセス
    ページ）・公式Instagram（`ginza_tsutayabooks`）を一次情報として確認
    したが、いずれも記載が見つからなかった。
    **画像方針**：公式サイト利用規約（`store.tsite.jp/ginza/sitepolicy/`）を
    確認したところ「当社の書面による事前の承諾を得ずに...使用または複製
    することはできません」と明記されており、公式画像はNOT_USABLE（転載不可）
    と判定した（IMAGE_USAGE_TRIAL.mdの4区分に基づく）。**公式画像は使用せず、
    GINZA WHISKERS独自撮影または独自生成画像で代替する**方針とした（画像の
    取得・生成自体は未実施）。
    **問い合わせ文案**：公式取材窓口（`pr_cccal@ccc.co.jp`、公式サイト記載の
    メディア・報道関係者向け窓口）宛に、上記4項目を確認する事実確認メール
    文案（件名・本文）を作成し、Maron確認済み。
    **今後の運用**：実際に問い合わせを送信し回答を受領した後、その内容を
    踏まえて**Maronがapproved可否を最終判断する**。
    **今回行っていないもの**：実際の問い合わせ送信（電話・メール・フォーム
    いずれも）、記事生成、SNS投稿、外部公開、コード・DBスキーマの変更、
    `curationStatus`の値変更（`inbox`のまま）。
---

  - 2026-08-21（#32〜#34の3週比較＋TNS Payload v1.1への改訂）: 直前の
    TNS Music Selection Logic確定＋#34 Dry Run検証（本節直下の
    エントリ）を受け、ユーザー指示により「#34一週間だけへの過学習を
    避ける」目的で、公開済みnote記事3週分（#32：2026-08-03〜08-09、
    #33：2026-08-10〜08-16、#34：2026-08-17〜08-23）を比較し、
    TNS Payloadをv1.0からv1.1へ改訂した。**今回もTypeScript実装・
    DB/collection作成・既存pipeline変更・既存データ変更・天気API
    実装はいずれも行っていない。**
    **調査手順**：まずProject内探索で#32・#33のローカルデータ有無を
    確認したところ皆無と判明（`_media_pipeline`ログにも該当週フォルダ
    なし）。ユーザーから#32
    （https://note.com/ginza_whiskers/n/n0136ca15976d）・#33
    （https://note.com/ginza_whiskers/n/nce78284fc51e）の公開URLを
    提供され、WebFetchで事実抽出した。#34
    （https://note.com/ginza_whiskers/n/n1c46bbbb53e1）は同条件での
    再取得も行った（1回目の取得ではCode表記の有無を明示的に確認して
    おらず、2回目で確認事項を追加した）。**データ信頼性の懸念**：
    #34の2回目取得で提示された「Code1｜A New Discovery in Ginza」と
    いう具体例が#32のCode1と偶然一致しており、WebFetch内部処理
    （キャッシュ・小型モデルによる要約）による汚染の可能性を否定
    できないため、#34の`fixedMoodLabel`詳細は「要再確認」のまま
    保留した。#32・#33同士のデータ、および#34の他の抽出項目
    （HOOK・AFTERGLOW・選曲・構造等）は独立した内容で相互汚染の兆候
    なしと判断した。
    **3週比較で判明した主要事実**：
    ①**邦楽/洋楽比率**：#32・#33・#34とも**洋楽4曲：邦楽3曲で完全
    一致**（洋楽57%／邦楽43%）——事前の「邦楽60%／洋楽40%」という
    仮説とは逆方向だった。②**発表年代**：全21曲が1972〜1987年に
    収束（中心は1976〜1982年）——「1975〜1987年AOR/City Pop中心」
    という仮説はおおむね支持された。③**ジャンル**：AOR／Yacht Rock
    （洋楽）＋City Pop／ニューミュージック（邦楽）という一貫した
    音世界で3週とも共通、伝統的な演歌・歌謡曲的な「昭和歌謡」は
    ほぼ含まれなかった。④**実在イベント依存度**：3週とも特定の
    店舗・イベント名への言及は皆無——`dailyScenes`の実在イベント
    非依存方針（前回セッションでv1.1改善案として提示済み）が3週の
    実績で裏付けられた。⑤**Code1〜7の役割**：単なる曜日連番ではなく
    「週をまたいで概ね固定される短い気分ラベル」＋「週替わりの英語
    ナラティブ副題」の**2層構造**であることを発見した——#32・#33間で
    7日中6日の気分ラベルが完全一致または酷似（特にCode5＝金曜は
    3週とも「夜が始まる」ニュアンス、Code7＝日曜は3週とも「Soft-Cloud
    Ginza」で固定）。⑥**AFTERGLOW／結び**：#32・#33は一字一句同一の
    定型文を再利用していたが、#34では週固有の書き下ろしへ変化して
    おり、**編集慣行が#34にかけて進化した可能性**を示す証拠を発見
    した。⑦**選曲理由の文体**：3週とも条件説明を一切含まない純粋に
    詩的な一文で完全一致——`internalReason`／`readerFacingComment`
    分離の必要性が3週で裏付けられた。⑧**note記事構造**：3週共通の
    骨格（導入→DAILY SOUNDTRACK 7日→まとめ/結び→GINZA WHISKERS
    導線）を確認したが、「週間昭和歌謡予報」「AFTERGLOW」という
    正式なセクション名は#34のみで確認され、#32・#33には見られな
    かった（#34時点での新機軸である可能性）。
    **ユーザーの最終判断（Payload v1.1確定方針）**：3週比較の結果を
    踏まえ、①邦楽/洋楽比率は「3週のみでは恒常ルールと断定するには
    不足」と判断し、**邦楽43%／洋楽57%・邦楽60%／洋楽40%のいずれも
    固定値として反映しない**方針を確定。代わりに`musicBalancePolicy:
    'adaptive'`として、#32〜34実績（Japanese 0.43／International
    0.57）を`historicalReference*Ratio`という参考シード値に留め、
    将来的に直近4〜8週の公開済み`SoundtrackEditions`から`rolling
    historical ratio`を算出できる設計余地を残すことを確定した
    （新規集計テーブルは作らず、既存`SoundtrackEditions`を都度query
    する設計）。②年代ガイダンスは1972〜1987年前後を参考中心帯として
    保持するが、Era Gate（1926〜1989年）自体・hard constraintでは
    ない位置づけは変更しない。③`dailyScenes`の実在イベント依存を
    弱める方針を正式採用。④TNS Editorial Codeを`fixedMoodLabel`／
    `weeklyEnglishSubtitle`の2層構造として正式整理、既存の曜日対応は
    維持。⑤`readerFacingComment`を条件説明ではなく詩的編集コメントに
    限定する方針を正式採用。⑥HOOK・AFTERGLOW・最終選曲・選曲理由の
    磨きはHuman Editorial対象として明確に残した（AFTERGLOWの定型／
    週固有どちらを取るかの判断も含む）。
    **成果物**：`TNS_SPEC.md`をv1.0からv1.1へ改訂——タイトル・冒頭の
    確定日/作業範囲、§2 STEP1（銀座イベントの補助情報化）・STEP5
    （HOOK/AFTERGLOW/editorialPointOfViewの追加）、§3.1（年代参考値・
    Japanese/International Balance評価軸の変更）、新設§3.2
    （Adaptive Music Balance）、§4（TNS Editorial Codeの2層構造）、
    §6（TNS Payload v1.1へ改称、`TNSSettings`にmusicBalancePolicy等
    追加、`SoundtrackEditions`にhook/afterglow/editorialPointOfView/
    musicBalance/qualityCheck等追加）、§7・§8を更新した。`CLAUDE.md`
    第8章へ最小限の要約追記は別途行う。
    **今回は行っていない**：TypeScript実装、`TNSSettings`／
    `SoundtrackEditions`／`MusicTracks`／`MusicUsageLedger`の実
    コレクション作成、外部天気API契約、既存`_media_pipeline`・既存
    プロジェクト・既存データへの変更、DB書き込み、本番デプロイ。
    **次工程**：①#35以降の公開週があれば追加Dry Run（AFTERGLOWの
    定型/週固有どちらが直近標準かの見極め）、②可能であれば#31以前も
    収集し`fixedMoodLabel`の長期安定性を確認、③4週分のデータが揃い
    次第rolling historical ratio設計の検証、④実コレクション実装
    （TypeScript、別セッション・ユーザー承認後）。
  - 2026-08-21（TNS Music Selection Logic確定＋Dry Run検証記録）:
    直前のTNS Payload v1.0確定（本節直下のエントリ）を受け、ユーザー
    指示によりTNS Payload v1.0だけを使った初のDry Runを実施し、その
    結果を踏まえてTNS Music Selection Logicを正式確定した。**今回も
    TypeScript実装・DB書き込みはいずれも行っていない。**
    **Dry Runの実施内容**：対象はTokyo Nostalgic Soundtrack #34
    （2026-08-17〜08-23）——既に人間が制作した完成版が存在する週を
    選び、maronWeeklyObservation1件のみ（「お盆が明け、銀座に日常の
    リズムが戻る一方、夕暮れや風には少しずつ夏の終わりの気配を感じる」）
    を入力に、既存完成版のテーマ実績「夏の余韻／Late-Summer Afterglow
    in Ginza」は参照せずAIのみで独立生成した。edition/context・
    editorialTheme・dailyScenes 7日分・7曲のmusicCandidate・
    heroVisualBrief・dailyVisualBriefs・note構成案・X投稿案・週代表曲
    候補・Human Approval対象一覧まで一通り生成できることを確認した。
    **不明なFactは推測で埋めず「要確認」とする運用が機能することも
    実証**——天気は`weatherSource:manual_required`として全7日を明示、
    銀座イベントは本セッション内の既存確認済みデータ（2026-08-19
    Editor's Choice Trial記録）を出典明記のうえ再利用し、ライブ
    クロールは行っていない。
    **選曲で発覚した問題と2回の修正サイクル**：①初回選曲は7曲中6曲が
    邦楽（TNS Music Selection Philosophyが定める邦楽60％／洋楽40％
    目標に対し偏りすぎ）と判明し、ユーザー指示で4曲：3曲へ修正した。
    ②修正後もCode1「少年時代」（井上陽水、1990年）・Code6「さよなら
    夏の日」（山下達郎、1991年）の2曲が1990年以降の発表であることが
    ユーザー指摘で発覚——TNSの選曲思想が「昭和浪漫の時代に銀座に
    流れていた、または銀座の情景・空気に似合う音楽」である以上、
    1990年以降の楽曲が紛れ込んでいたのは設計原則からの逸脱だった。
    この発覚を受け、7曲全てをゼロベースで再検証し、全曲が1926〜1989年
    （昭和期）の発表であることを個別に確認したうえで再選定した
    （最終選定：Nat King Cole「Autumn Leaves」〈1955年頃〉、加山雄三
    「君といつまでも」〈1965年〉、尾崎紀世彦「また逢う日まで」
    〈1971年〉、Henry Mancini「Moon River」〈1961年〉、松原みき
    「真夜中のドア〜Stay With Me」〈1979年〉、五輪真弓「恋人よ」
    〈1980年〉、The Beach Boys「Warmth of the Sun」〈1964年〉）。
    **検証実績（2026-08-21、2026-08-17〜08-23対象Dry Run）**：
    1990年以降の曲＝0曲、邦楽＝4曲、洋楽＝3曲、City Pop＝1曲のみ
    （偏り解消）、ジャンル構成＝昭和歌謡2／City Pop1／フォーク・
    ニューミュージック1／Jazz・Standard1／映画音楽・Standard1／
    Oldies・Pops1の6ジャンルに分散。「銀座で実際に流れていた」と
    事実主張した曲は0曲——根拠不明な場合は全て「昭和期の銀座の都市
    文化・情景との親和性（contextual affinity）」として評価する運用
    を徹底した。
    **確定したTNS Music Selection Logic**：選曲評価を①Era Gate
    （原則1926〜1989年、1990年以降は通常除外・例外はHuman Editorial
    明示承認のみ）→②Theme Fit→③Emotion→④Ginza Experience→
    ⑤Ginza Affinity（事実主張には出典必須、根拠なしはcontextual
    affinity）→⑥Genre Diversity（同系統過半数偏重は警告）→
    ⑦Japanese/International Balance（Editorial Target邦楽60％／
    洋楽40％、ハード制約ではない）の7段階順で行う設計とした。Track
    候補属性として`releaseYear`／`eraEligibility`
    （`showa`/`exception`/`out_of_scope`）／`origin`／`genre`／
    `ginzaAffinity`／`ginzaAffinityEvidence`
    （`verified`/`contextual`/`unknown`）／`selectionReason`を定義した。
    **成果物**：`TNS_SPEC.md`§3に新規§3.1「TNS Music Selection Logic」
    を追加（既存§4〜§8の章番号は変更せず、複数ファイルからの既存の
    章番号参照——CHARACTER_STANDARD.md・本ログの過去エントリ含む——を
    壊さないよう、挿入位置を§3内の追記に限定した）。§6.2の`music`
    グループへTrack属性参照とEditorial Target（比率はハード制約では
    ない旨）を追記。冒頭の確定日・作業範囲も更新した。`CLAUDE.md`第8章
    のMusic Provenance項目へ、選曲思想の要点と`TNS_SPEC.md`§3.1への
    参照を最小限追記した。
    **今回は行っていない**：TypeScript実装、DB書き込み、実際の楽曲・
    音源の取得や配信、note/X/Instagramへの公開、既存完成版との比較
    （ユーザーの次回指示待ち）、Payloadコレクションの実装、既存CMS・
    既存`_media_pipeline`・既存データへの変更。
    **次工程**：①既存完成版（Tokyo Nostalgic Soundtrack #34、テーマ
    「夏の余韻／Late-Summer Afterglow in Ginza」）とのDry Run結果比較
    （ユーザーの次回指示待ち）、②比較結果を踏まえたTNS Music
    Selection Logic・Payload設計のさらなる調整要否の判断、③実
    コレクション実装（TypeScript、別セッション・ユーザー承認後）。
  - 2026-08-21（TNS Payload v1.0確定：データ設計・Human/AI責任分界）:
    直前のTNS Editorial Code物理／メタデータ分離確定（本節直下の
    エントリ）に続き、ユーザー指示によりTNS Payload v1.0のデータ設計
    ・Human/AI責任分界を確定した。**目的**：Tokyo Nostalgic
    Soundtrackの毎週制作を、AI 80％／Maron Human Editorial 20％を
    目標に省力化すること。**今回はPayloadのデータ設計・責任分界の
    確定のみで、TypeScript実装・実コレクション作成はいずれも行って
    いない。**
    **確定した設計の要点**：①Input Sourceを4分類
    （AI AUTO INPUT／MARON INPUT／AI EDITORIAL GENERATION／
    HUMAN EDITORIAL APPROVAL）し、`TNS_SPEC.md`§6の全フィールドに
    担当を明記した。②マロンの週次必須入力を`maronWeeklyObservation`
    （「今週の銀座を一言でどう感じるか」）**1項目のみ**に絞り込み、
    必ず扱いたいイベント・使用したい曲候補・避けたい曲/表現・
    フィールドワーク情報は全て任意とし、**任意項目が全て未入力でも
    AIのみで完成案を1本生成できる構造**とした。③週間天気は
    `weatherSource`フィールド（`ai_retrieved`/`manual`/`api`の3値）で
    取得経路を記録する設計とし、取得優先順位を①AI自動取得→②取得
    不可時のみマロン手入力→③将来の外部API、の順に確定した。**Trial
    段階では新規有料API契約を前提にしない**という既存方針（第13章
    運用コスト方針）を踏襲した。④TNS Editorial Codeの初期値
    （Monday=Code1〜Sunday=Code7）を確定し、`TNSSettings`という
    新規Payload Global（シングルトン設定）で保持する設計とした——
    個々のeditionではなく全edition共通の1箇所に持たせることで、
    将来マッピングを変更する場合も一度の変更で反映できる。前回確定
    済みの「TNS Editorial CodeはPayloadメタデータであり物理フォルダ
    名には使用しない」という原則（本節直下のエントリ）もそのまま
    維持した。⑤Human Approvalは「Approve All（1クリック一括承認）＋
    必要な項目だけ個別修正」を基本UXとし、Payload上は
    theme/tracks/article/visuals/publishの5フラグを維持しつつ、
    UI側で一括操作と個別操作の両方を提供する設計とした。
    ⑥Character Layer／Scene Layerの分離（`CHARACTER_STANDARD.md`
    準拠）をvisualグループに反映した。⑦編集ロジックの順序を
    Fact→Emotion→Life Context→Ginza Experience→Music→Storyに
    確定し、データ構造（context→editorialTheme→dailyScenes→music→
    outputs）にもこの順序をそのまま反映した。
    **後回しにした項目（Payload設計をブロックしないと判断）**：
    uxTypeとの正式マッピング、`MusicTracks`初期データ投入方法、
    Character/Scene画像生成パイプライン接続、既存`ImageAssets`との
    関連付け、`englishSubtitle`の正式翻訳ゲート。
    **成果物**：`TNS_SPEC.md`§5（週間天気の扱い、weatherSource設計を
    反映）・§6（旧「データ構造案」を「TNS Payload v1.0（確定仕様）」
    として全面更新、新規`TNSSettings`Global・`SoundtrackEditions`の
    全フィールド表・責任分界を追加）・§7（自動化対象／人間判断対象を
    確定版へ更新）・§8（未確定事項を後回し項目のリストへ更新）を
    改訂。冒頭の確定日・作業範囲の記述も更新した。`CLAUDE.md`第3章の
    TNS紹介段落に、`maronWeeklyObservation`1項目という要点と
    `TNS_SPEC.md`への参照を追記した（最小限、既存の分量を大きく
    増やさない範囲）。
    **今回は行っていない**：TypeScript実装、`TNSSettings`／
    `SoundtrackEditions`／`MusicTracks`／`MusicUsageLedger`の実
    コレクション作成、外部天気API契約、uxType正式マッピング、
    MusicTracks初期投入、画像生成パイプライン接続、既存ImageAssets
    関連付け、englishSubtitle正式翻訳ゲート、DB書き込み、本番
    デプロイ、既存CMS・既存`_media_pipeline`・既存データへの変更。
    **次工程**：①`weatherSource:ai_retrieved`の具体的な取得手段の
    選定、②後回しにした5項目の個別確定、③実コレクション実装
    （TypeScript、別セッション・ユーザー承認後）、④実データ1週分
    でのTrial運用。
  - 2026-08-21（TNS Editorial Codeの物理／メタデータ分離確定：
    `_media_pipeline`調査に基づく最終方針）: 直前のCLAUDE.md軽量化・
    TNS/Character Standard正式統合・用語不整合修正（本節直下の各
    エントリ）に続き、Payload設計に進む前段として`_media_pipeline`側の
    Code1〜8の実態をユーザー指示で調査した（読み取り専用、ファイル
    変更なし）。**調査で判明した事実**：①`import_media.py`にCodeNを
    解釈・処理するロジックは一切存在しない。②`README.md`の
    「挿絵はサブフォルダ名をCode名にする。例：`TNS/Code8/`」という
    案内は、現行の`explicit_week`設定（`week_pattern`必須）には追随
    していない旧い記述で、これに従って人間が`TNS/Code8/`のような
    フォルダを作ると`week_pattern`不一致により中身が丸ごと保留
    （HOLD）される実害があることを確認した。③ログ調査で見つかった
    唯一の`Code9`実例は、Project 05-2側の別セッションによる過去の
    試験実行（当時のTNS設定は現行と異なる`01_Illustrations/`を含む
    旧構造）の産物であり、現行の実運用データではないことを確認した。
    この調査結果を受け、ユーザーが正式方針を確定した。
    **確定方針**：TNS Editorial Code（Code1〜7）は**物理フォルダ名・
    ファイルパスには一切使用せず、Project 02 CMS（Payload）側の
    編集メタデータとしてのみ管理する**。理由は①`_media_pipeline`の
    `week_pattern`／`explicit_week`という既存の物理フォルダ構造を
    変更しない、②Code1〜7をフォルダ名に使うと既存の週単位処理と
    衝突する可能性がある、③TNS Editorial Codeは保存場所ではなく
    各日のScene Layer／編集上の意味を表す概念である、の3点。物理
    保存は`YYYY-MM-DD`等、既存の週・日付ベース構造をそのまま維持する。
    曜日↔Codeの対応はMonday→Code1〜Sunday→Code7を初期値とするが、
    **固定ロジックにハードコードせず将来変更可能なデータ設計とする**
    ことも合わせて確定した。**Code8／Code9の扱い**：Code8はREADME上の
    旧例示、Code9は過去の試験的設定として扱い、いずれも現行のTNS
    Editorial Code正式仕様（Code1〜7）には含めない。過去の履歴ログ
    （`_media_pipeline/logs/`）は削除していない。
    **今回行った変更**：①`_media_pipeline/README.md`のCode8例示を、
    現行の`explicit_week`仕様（週フォルダ`YYYY-MM-DD_MM-DD`）と、
    TNS Editorial CodeがPayloadメタデータでありフォルダ名に使わない
    ことを明記する表現へ最小限修正した。②`TNS_SPEC.md`§4を全面更新
    し、「物理保存とは分離する」原則・曜日↔Codeの初期対応・Code8/
    Code9の扱いを明記、§0の既存資産記述・§6.1の`dailyScenes`
    フィールド説明・§8の未確定事項一覧も整合するよう更新した（Code8
    対応関係に関する「未解決」項目は今回の方針確定により解消したため
    削除）。③本エントリとしてDECISION_LOG_02.mdへ記録。
    **検証**：`_media_pipeline/import_media.py`・`projects.json`は
    無変更（CodeNロジックが元々存在しないため、影響は原理的にゼロ）。
    `_media_pipeline`の既存フォルダ構造・既存データの移動・リネームは
    一切行っていない。
    **今回は行っていない**：`import_media.py`等の実コード変更、
    Payloadコレクション設計・実装、既存データの移動・リネーム、DB
    書き込み、本番デプロイ。**次工程**：TNS Editorial Codeの曜日↔Code
    初期対応・データ設計方針が確定したため、`TNS_SPEC.md`§6の
    データ構造案をもとにしたPayloadコレクションの実設計に進める状態と
    判断した（詳細判定は本節下部の判定結果を参照）。
  - 2026-08-21（noteコンテストテーマ研究・Character Standard・TNS自動
    制作フローの正式統合）: 同日先行実施したCLAUDE.md軽量化（150,000
    文字上限超過の解消、DECISION_LOG_01/02.md・RUNBOOKS.md分割）に
    続き、ユーザー指示で3件の重要改善事項をProject 02へ正式反映した。
    **実装は仕様統合・原則明文化のみに限定し、実コード実装・Payload
    設計・外部天気API導入はいずれも行っていない。**
    **①noteコンテストテーマ研究を受けた編集設計改善**：Editorial
    Style Engine（第8章）に「読者接続の編集ロジック」を新規項目として
    追加した。社会・季節・生活文脈→読者の気分／潜在ニーズ→銀座で
    できる体験・発見→Editor's Choice→タイトル・ストーリーという編集
    ロジックの流れを明文化した。**Editorial Score（5軸・配点）自体は
    変更していない**——評価軸を増やすと既存採点済み候補
    （Sources/DiscoveredContent 300件超）の再評価が必要になり実AI
    課金が発生するため、意図的にスコアリング体系には手を加えず、
    生成プロンプト・構成ロジックの拡張として位置づけた（2026-08-18の
    UX Type軸追加時と同じ判断基準を踏襲）。
    **②マロン／コロンのCharacter Standard確定**：新規
    `CHARACTER_STANDARD.md`を作成し、ブランドキャラクターの扱いを
    「Character Standard（造形・外見・ブランド一貫性の固定）」と
    「Character Dominance（主役にするかどうかの判断軸）」という独立
    した2概念に整理した。**既存の`VISUAL_ASSET_LIBRARY.md`§2.4が定める
    「マロンを世界観挿絵の主役にしない」という原則はそのまま維持**——
    Character Standardの新設はこの原則を変更するものではなく、造形の
    一貫性を固定するだけであることを明記した。TNS・「旬の銀座」・
    GINZA Concierge等では記事や情景に応じて人・街・建築・体験を主役と
    し、マロン／コロンは必要に応じて登場するブランドキャラクターと
    する方針を確認した。画像生成は「固定Character Layer」＋「可変
    Scene Layer」の2層構造とし、Character Layerでマロン／コロンの
    基本造形を固定、Scene Layerで季節・場所・時間帯・服装・情景を
    変更する設計とした。コロン（真っ白な猫、リアル寄り、マロンを
    補完する控えめな存在）はProject 02の文書に今回初めて登場する
    新規キャラクターであることを、ワークスペース全体を横断検索した
    うえで確認した。**ガバナンス面**：マロン／コロンはGINZA WHISKERS
    ブランド共通のマスコット候補だが、Root憲章第1章は「ブランド定義は
    常にRoot／00が正」と定めている。今回は2026-08-19の先例（マロンを
    Project 02のCLAUDE.mdへ初めて明文化した際の扱い）を踏襲し、
    **Project 02内での運用に留め、Root・01・03・04・05・05-2等の
    既存プロジェクトへの一括変更は行っていない**。
    `CHARACTER_STANDARD.md`は将来Root／`00-shared-guidelines`へ昇格
    可能な構造（Project 02固有ルールとGINZA WHISKERS共通化候補の記述を
    分離）にした。
    **③Tokyo Nostalgic Soundtrack（TNS）自動制作フローv1.0の正式
    反映**：新規`TNS_SPEC.md`を作成し、STEP1 Fact→STEP2 Emotion→
    STEP3 Ginza Experience→STEP4 Music→STEP5 Story→STEP6 Human
    Editorialの6段階フローを明文化した。AI 80％／マロン最終編集20％を
    目標とする。**重要な発見**：TNSはProject 02のCLAUDE.md・spec群には
    一度も登場していなかったが、`_media_pipeline/projects.json`には
    既に独立プロジェクトキーとして存在し（`week_pattern`による週次
    バッチ運用、`00_Originals/01_Selected/02_Note/03_X/04_Instagram`
    という配信先フォルダ構造、`TNS/Code8`という既存Code命名例）、
    実体として先行していたことを確認した。この既存資産と整合させる
    設計とした。STEP1 Factでは、銀座イベントは既存のdailyRanking／
    StoryClusters／Temporal Relevance（NOW/SOON/NEXT判定）をそのまま
    再利用し新規クローラは追加しない設計とした一方、**週間天気は新規
    API契約・課金を発生させず**、人間が確認・入力する運用値、または
    既存の無料・契約不要な情報源を使う設計とした（この項目のみ自動化
    度を意図的に低く据え置く）。STEP4 Musicでは、Editorial Trust
    Layerの画像方針と同じ発想を音楽にも適用し、**曲名・アーティスト
    名・編集的紹介を基本とし、歌詞全文・長文引用・音源埋め込みは
    自動生成対象にしない**というMusic Provenance原則を新設し、第8章・
    `TNS_SPEC.md`双方に明文化した。過去使用曲との重複管理は、既存
    SOURCE LEDGERの「台帳＋履歴＋重複防止」という設計パターン
    （first_seen/changed判定と同型）を踏襲する設計とした（提案のみ、
    未実装）。**コード体系**：`_media_pipeline`が既に使用している
    `TNS/Code8`等のCode命名を踏まえ、TNS側の週次シーン管理は「TNS
    Editorial Code」という独立レイヤーとして定義し（「Weekly Scene
    Code」は説明用の補助表現に限定）、Project 02 CMS全体の汎用分類
    （Tags／pillars／uxType等）とは**統合しない・衝突しない**命名・
    データ構造にする方針を確定した。将来的にProject 02 CMS全体で
    汎用的な分類体系が生まれた場合に統合できる余地（変換テーブルを
    後付けできる設計）は残した（その分類体系の名称は現時点で未確定）。
    データ構造（`SoundtrackEditions`／`MusicTracks`／
    `MusicUsageLedger`等の新規Payloadコレクション案）・自動化対象／
    人間判断対象の詳細な割り当ては`TNS_SPEC.md`に記載——**いずれも
    提案のみで、実コード実装・Payloadスキーマの実装は行っていない**。
    **成果物**：新規`CHARACTER_STANDARD.md`・`TNS_SPEC.md`の2ファイル
    を作成。既存`VISUAL_ASSET_LIBRARY.md`へは相互参照・既存原則の
    再確認を軽微に追記（既存の確定トークン・6タイプ・18アイコン等の
    内容は無変更）。`CLAUDE.md`第3章（TNSの位置づけ）・第8章（読者
    接続の編集ロジック・Character Standard/Dominance・Music
    Provenance）へ要約と参照先のみを追記し、詳細は上記2新規ファイルへ
    分離した。**今回は行っていない**：実コード実装（Payloadコレクション
    設計・TypeScript実装を含む）、外部天気APIの契約・導入、既存
    プロジェクト（Root／01／03／04／05／05-2）への変更、既存
    Editorial Score配点の変更、既存295件超のDiscoveredContent／
    Sourcesへの再採点、`_media_pipeline`側の設定変更、実際の
    キャラクター画像・世界観挿絵の生成、DB書き込み、本番デプロイ、
    外部公開。**次工程**：①TNS Editorial Codeの実際のコード値・命名
    規則の確定、②Character Standardのモデル
    シート（実際の参考画像・プロンプトセット）の制作、③TNS_SPEC.mdの
    データ構造案をもとにしたPayloadコレクション設計（別セッション）、
    ④週間天気の具体的な取得方法（人間入力の運用手順、または既存無料
    情報源の選定）の確定。
  - 2026-08-19（Visual Asset Library確定：世界観挿絵6タイプ・18
    ジャンルアイコン仕様の正式統合）: 本日のHuman Editor Reviewで
    確定した「旬の銀座」世界観挿絵6タイプと個別ネタ用18ジャンル
    アイコンの基本方針を、Project 02の正式仕様へ統合した。**画像
    生成の自動実行・外部画像取得・note投稿・X投稿・LINE送信・実
    コード実装はいずれも行っていない**——仕様統合・カテゴリ
    マッピング・自動選択ロジック設計・ファイル命名・配置ルールの
    確定までを行った。
    **ファイル構成の判断（ユーザー指示「分離が必要な場合は提案してから
    実施」に対応）**：分量・詳細度がEditorial Style Engineに匹敵する
    ため、`CLAUDE.md`第8章への直接統合ではなく、新規
    `VISUAL_ASSET_LIBRARY.md`（プロジェクトルート）を作成し正本と
    した——本日確定した既存のTrial記録群（`NOTE_ARTICLE_TRIAL*.md`・
    `QUALITY_GATE_TRIAL.md`・`IMAGE_USAGE_TRIAL.md`）とは異なり、
    「Trial」ではなく確定仕様のため、`CONTENT_MODEL.md`・
    `ARCHITECTURE_DRAFT.md`と同格の永続参照ドキュメントと位置づけた。
    `CLAUDE.md`第8章には要点＋参照ポインタのみを追記し、肥大化を
    避けた。
    **世界観挿絵**：2階層構造（世界観挿絵／個別ジャンルアイコン、
    役割混同禁止）を採用。6タイプ（SPRING/SUMMER/AUTUMN/CHRISTMAS/
    NEW YEAR/WINTER）を季節に応じて切り替える設計とし、各タイプの
    モチーフ・基調色を記録した。**WAKOの建物は独自生成の抽象化した
    街並みモチーフとしてのみ使用し、公式写真・公式ロゴは使用せず、
    公式提携・監修と誤認される表現を避ける**という制約を明記した
    （実在店舗の意匠を扱う上でのブランド上の慎重な線引き）。
    「GINZA WHISKERS」署名横のシルエットは猫ではなく犬（瓦版記者
    マロン）とし、世界観挿絵の主役にはしない（ブランド署名・編集者
    人格・Editor's Note・記事末尾署名に用途を限定）——マロンという
    ブランドマスコットがProject 02のCLAUDE.mdに明文化されたのは
    今回が初めて。
    **ジャンルアイコン**：FOOD/CAFE/SHOPPING等18カテゴリを正式採用
    （円形バッジ基本、日英で図柄共通・ラベルのみ差し替え）。ISO等の
    公共情報シンボル設計思想を参考にしつつ完全な公共サインとはせず
    「GINZA WHISKERS独自のEditorial Icon」として設計する方針を明記
    した。
    **自動選択ロジック**：候補ごとにPrimary Categoryを1つ判定し
    対応アイコンを自動選択する設計としたが、**自動判定に迷う場合は
    Human Editorへ確認する**という「推測しない」原則を踏襲した。
    既存の`uxType`（18分類より粒度が異なる6分類）・`contentType`
    分類との正式なマッピングテーブルは、今回はスコープ外とし
    「まだ確定していない事項」として`VISUAL_ASSET_LIBRARY.md`§9に
    明記した（実コード実装着手時に改めて設計する）。
    **季節挿絵の自動選択**：月日ベースの目安表（SPRING=3〜5月等）を
    定めたが、**固定日付だけで完全自動決定せず、季節感・記事テーマ・
    Human Editor判断を優先できる設計**とした。
    **権利・安全ルール**：新規の画像権利方針は追加せず、既存の
    Editorial Trust Layer（画像・出典ポリシー）をそのまま適用する
    設計とした——外部イベント画像・OGP画像・商品写真・展示作品・
    外部ロゴの無断利用禁止、WAKO等の実在施設は独自生成での抽象化
    のみ許容、という既存原則と矛盾しないことを確認した。
    **ファイル命名規則**：世界観挿絵（`world_spring`等6件）・
    ジャンルアイコン（`icon_food`等18件）の命名規則を確定した。
    日英差分がある場合は`_ja`/`_en`サフィックスを付与する。
    **今回は行っていない**：実際のアセット生成、画像生成の自動実行、
    外部画像取得、note/X/LINEへの投稿・送信、コード実装
    （DiscoveredContentへのPrimary Categoryフィールド追加等を含む）、
    DB書き込み、実AI呼び出し、課金、本番デプロイ。ローカル環境の
    起動も行っていない（ドキュメント作成のみのセッションのため）。
    **まだHuman Editor判断として残る項目**：①実際のアセット生成
    方法・制作フローの決定、②Icon Libraryと既存`uxType`/
    `contentType`分類の正式マッピングテーブル、③Visual Asset
    Libraryの実際の保存先・配信方法（第6章の技術選定＝Cloudflare
    R2との接続）、④実コード実装の要否・範囲（ユーザー自身が「実装
    が必要な場合はどこまで実装するかHuman Editorへ確認してほしい」
    と明示しており、今回は仕様確定のみに留め実装には着手していない）。
    **次工程**：①上記4項目のHuman Editor判断、②判断が済み次第の
    実コード実装（Primary Category自動選択ロジック・季節挿絵自動
    選択ロジックのTypeScript化等）、③実際のビジュアルアセット
    制作、④note記事生成の実コード実装（Editorial Style Engineと
    合わせて、引き続き手動執筆段階のまま）。
  - 2026-08-19（新ルール準拠note記事Trial：Editorial Style Engine
    適用版の生成）: 直前に確定したEditorial Trust Layer・Editorial
    Style Engine（本節直下の項目）が実際の記事品質にどう反映される
    かをHuman Editorが確認できるよう、同じEditor's Choice候補4件
    （curationStatus尊重、重複統合済み、未確認情報は推測補完せず）を
    入力に、新ルール準拠のnote記事Trialを再生成した。**外部公開・
    note投稿・X投稿・LINE送信・課金・本番デプロイはいずれも行って
    いない**。
    **成果物の保存方針**：ユーザー指示「既存Trial記事を上書きせず、
    比較できる形で保持してください」を受け、新規ファイル
    `NOTE_ARTICLE_TRIAL_STYLE_ENGINE.md`を作成した——今回は前回まで
    の「新規ファイルを作らない」方針から意図的に外れた。理由は
    Style Engine適用前後の記事を並べて比較するという目的自体が
    新規ファイルを要求しているため（重複仕様の量産ではなく、
    明示的に要求された比較用の別成果物）。既存の
    `NOTE_ARTICLE_TRIAL.md`（初版）は一切書き換えていない。
    **タイトル5案**：①「旬の銀座、8月のおわりに ── 選ぶ、刷る、
    たたずむ」（動詞の並列で4候補を代表、初版と構造的に近く比較
    しやすい）、②「今週の銀座、何して過ごす？」（問いかけ型）、
    ③「銀座で、手を動かす夏の終わり」（MAKE系候補を代表）、
    ④「8月後半の銀座を、GINZA WHISKERSが選びました」（キュレー
    ション性を前面に）、⑤「革靴、活版印刷、個展、写真集 ──
    銀座の8月後半」（モチーフ列挙、イベント名そのものではないが
    列挙的な印象が残るため今回は推奨案としなかった）。**①を推奨**
    として選定し、本文を生成した。
    **本文の構成**：Hook（2文）→THIS WEEK IN GINZA→EDITOR'S CHOICE
    01〜04（各：カテゴリラベル〈PARTICIPATE/MAKE/ART/DISCOVER〉・
    タイトル・場所/開催期間・WHY NOW?・EDITOR'S NOTE・SOURCE）→
    結び、というEditorial Style Engineの基本構造に準拠した。
    Visual Rhythmとして見出し階層・短い英語ラベル・区切り線・太字・
    短段落（2〜3文）を使用したが、**絵文字はほぼ意図的に不使用**とした
    （ブランドトーン＝上品・記録的・非扇動的を優先する判断、
    Human Editorへの確認事項として明記）。
    **自己評価（PASS/WARNING/BLOCKER）**：9項目中PASS7・WARNING2・
    BLOCKER0。WARNINGは「絵文字使用量」（意図的に抑制、方針確認が
    必要）と「20〜30代女性への行動喚起」（③④の料金・予約要否等が
    未確認のまま、`NOTE_ARTICLE_TRIAL.md`初版と同一の既知課題で
    新規に発見された問題ではない）の2点。
    **今回は行っていない**：外部公開・投稿・送信、外部画像の使用・
    転載・ダウンロード、独自アイキャッチの制作（Visual Rhythmのみで
    成立するかを確認する回のため意図的に見送り）、DB書き込み、実AI
    呼び出し、課金、本番デプロイ。ローカル環境の起動も行っていない
    （ドキュメント生成のみのセッションのため）。
    **次工程**：①Human Editorによる初版・新版の比較評価、②絵文字
    使用量の方針確定、③未確認の実用情報（③④の料金・予約要否等）の
    追加取材要否判断、④採用が決まった版の独自アイキャッチ制作、
    ⑤note記事生成の実コード実装（現状は引き続きClaude Codeエー
    ジェントによる手動執筆のみ）。
  - 2026-08-19（Editorial Style Engine確定：Human Editor Reviewを
    経た正式な文体・構成規則の第8章統合）: マロンによるHuman Editor
    Review（本節直下の項目群で生成したnote/X/LINE Trial成果物の
    内容確認）を経て、**個別Trial文章そのものではなく、今後の自動
    生成に使う文体・構成規則を「Editorial Style Engine」として正式
    確定**した。第8章「AI活用ポリシー」のEditorial Trust Layer
    （2026-08-19先行確定）に続く形で、同章内の新規項目として追加
    した——新規ファイルは作成せず、既存のEditorial Trust Layer・
    Quality Gate・画像無断使用禁止方針はいずれも変更せず維持した
    （ユーザー指示どおり）。
    **確定した規則の要点**（詳細は第8章本文）：①タイトル
    （毎回3〜5案、イベント名羅列禁止、クリックベイト・SEOキーワード
    反復回避）、②冒頭（長い挨拶禁止、季節感・今週性を数行で）、
    ③本文構造（Hook→THIS WEEK IN GINZA→Editor's Choice 3〜5件→
    各Editor's Note→Source→結び、ただし固定構造ではなく自然な変化を
    許容）、④Editor's Choice各項目の10要素構成、⑤Visual Rhythm
    （見出し階層・短い英語ラベル・適度な絵文字/アイコン・区切り線・
    余白・短段落2〜3文・箇条書き・太字・カード的見せ方、装飾過多は
    避けスマートフォン可読性優先）、⑥独自アイキャッチ方針
    （Editorial Trust Layer項目1・2をそのまま踏襲、新規ルールなし）、
    ⑦X（noteの要約版にしない、Hook重視、A/B案は任意で毎回必須では
    ない）、⑧LINE（既存読者が短時間で判断できる構造、Xより多く
    noteより大幅に短く）、⑨Editor's Noteの正式定義（要約ではなく
    選定理由・新しい銀座の見方の提示、広告コピーをなぞらない、
    媒体別の長さガイド）、⑩Source/Editorial Trust Layerとの接続
    （Trust Layerを維持したうえに文体規則を追加する構成）、
    ⑪Performance Learning Layer（将来構想、現段階では外部API接続・
    自動取得は実装しない——生成条件を将来分析できるよう記録する方針
    のみ定義、実際のデータモデルは自動生成のコード実装段階で設計）。
    **成果物**：`CLAUDE.md`第8章への追記のみ（新規ファイルなし）。
    `NOTE_ARTICLE_TRIAL.md`冒頭に、本ファイルのTrial文章が
    Editorial Style Engine確定の入力として使われたこと・Trial文章
    自体は本番未採用のまま記録として保持されることを示す追記を
    1段落加えた（A〜G本体の文章は一切書き換えていない——ユーザー
    指示「今回生成したnote/X/LINEの個別文章はTrial記録として保持」
    「本番公開はしない」「確定したのは文章そのものではなく編集
    ルール」を反映）。
    **今回は行っていない**：外部公開・note投稿・X投稿・LINE送信、
    外部画像転載・ダウンロード、コード実装（Performance Learning
    Layerのデータモデル含む）、DB書き込み、実AI呼び出し、課金、
    本番デプロイ。ローカル環境（Docker/Postgres）の起動も行って
    いない（ドキュメント更新のみのセッションのため）。
    **まだHuman Editor判断として残る項目**：①実際のnote記事公開の
    可否判断、②X A案/B案のうちどちらを実際に採用するか（前回
    Trialでは推奨のみ提示）、③独自アイキャッチの具体的なデザイン、
    ④Performance Learning Layerの実装タイミング（note記事生成自体が
    まだ実コード化されていないため）。
    **次工程**：①Editorial Style Engineに準拠した新しいnote記事
    Trialの再生成（前回Trial文章の単純な修正ではなく、規則に基づく
    新規生成として実施するかは次回判断）、②note記事生成の実コード
    実装（現状はClaude Codeエージェントによる手動執筆のみ、
    Sources.tsの`generateArticleDraft.ts`のような自動生成パスは
    DiscoveredContent側にはまだ存在しない）、③独自アイキャッチの
    実制作。
  - 2026-08-19（X／LINE展開Trial：媒体別変換ロジック設計・原稿生成）:
    直前のEditorial Trust Layer確定（本節直下の項目）を受け、note記事
    Trial（`NOTE_ARTICLE_TRIAL.md`）を入力に、X・LINEそれぞれの役割
    （X＝発見・興味喚起・note誘導、LINE＝既存読者への通知・再訪・
    行動導線）に合わせた展開Trialを実施した。**実際のX投稿・LINE
    送信・note投稿・外部公開・本番API接続・課金はいずれも行って
    いない**。新規ファイルは作成せず、既存`NOTE_ARTICLE_TRIAL.md`に
    新規セクションG「X／LINE展開Trial」を追記した（重複ファイルを
    作らないというユーザー指示を反映）。
    **入力の扱い**：Editor's Choice選定済み4候補のみを使用し、
    Section F（Source Provenance詳細、2026-08-19実装）のConfirmed
    Factのみを根拠とした——未確認情報（価格・予約要否等）は一切
    含めていない。外部画像は使用せず、独自アイキャッチまたは画像
    なし前提とした。
    **X投稿Trial**：A案（体験の対比型：「革靴の色を選ぶか、活版
    印刷機で名前を刷るか」という具体的行為の対比でフック）・B案
    （旬性・期限訴求型：「今しかない」という緊急度訴求）の2案を
    作成し、**A案を推奨**とした——B案の「今しかない」という言い回し
    がRoot第2章のトーン原則（上品・記録的・非扇動的）との整合性で
    やや煽り寄りと判断したため。B案はエンゲージメント重視の配信
    タイミング実験用の代替案として残した。
    **LINE配信Trial**：簡潔版（3-4行×4候補の要約列挙）・情報量多め版
    （施設・会期・1-2文説明×4候補＋Editorial Note）の2案を作成し、
    **情報量多め版を推奨**とした——LINEの役割（既存読者への通知・
    再訪）にはXより情報量を持たせるべきという前提により合致する
    ため。
    **Source表示ルール**：X／LINEでは個別候補ごとのSourceボックスを
    省略し、note記事への単一リンクに集約する設計とした（本文を出典
    情報で過密にしない、というユーザー指示に対応）。事実情報自体は
    Section Fで追跡可能な状態を維持する。
    **媒体別変換ルール**：note→X（対比要素を最大2件抽出→動詞ベースの
    短文化→今週性を1つ添える→note誘導文→URL単独行→ハッシュタグ
    1〜2個→未確認情報・詳細出典は含めない）、note→LINE（リード文の
    1-2文要約→各候補3行構成に圧縮、3〜5件→個別Editor's Noteは省略し
    全体コメント1つに集約→未確認情報は含めない→公式URLは個別候補に
    付けずnote単一リンクに集約）の2種を明文化した。
    **Quality Gate適用結果**：X・LINE Trial原稿とも
    **PASS（WARNING1件）**。重要Fact確認済み・終了イベントなし
    （2026-08-19時点で①NOW残り4日／②SOON3日後／③NEXT10日後／
    ④NOW残り16日、いずれも有効）・note本文との矛盾なし・未確認情報の
    断定なし・外部画像の無断利用前提なし、を確認した。WARNING1件は
    「本文中の[note記事URL]がプレースホルダーであり、note記事自体が
    未公開のため実際に機能するリンクが存在しない」——note記事の
    実公開時に実URLへの差し替えが必須という運用上の注意点として記録
    した（コンテンツの品質自体の問題ではない）。
    **今回は行っていない**：実際のX投稿・LINE送信・note投稿・外部
    公開、本番API接続、DB書き込み、実AI呼び出し、課金、本番デプロイ。
    ローカル環境（Docker/Postgres）の起動も行っていない
    （ドキュメント更新のみのセッションのため）。
    **次工程**：①note記事本体の実際の公開判断（人間Editorの最終
    レビュー待ち）、②公開後の実URL反映、③GINZA WHISKERS独自
    アイキャッチの実制作、④実際のX/LINE配信を行う場合のAPI接続・
    認証（Phase 15の既存未着手課題、Instagram Meta App Review・
    X OAuthと合わせて本番運用時に着手）。
  - 2026-08-19（Editorial Trust Layer確定：画像・出典の正式方針、
    note記事Trialへ適用）: 直前の画像選定・利用可否Trial（本節直下の
    項目）を踏まえ、ユーザー指示により「正式方針」として画像利用・
    出典管理のポリシーを確定し、第8章「AI活用ポリシー」に恒久的な
    項目として追加した（従来の意思決定ログのみへの記録とは異なり、
    今後のセッションが必ず参照する章本文に組み込んだ）。あわせて
    `NOTE_ARTICLE_TRIAL.md`へ実際に適用するTrial実装を行った。
    **正式方針の要点（詳細は第8章参照）**：①外部サイト画像
    （公式サイト掲載画像・OGP画像・二次告知サイト画像）は原則転載
    しない、明示的な利用許諾がある場合のみ例外。**「画像利用条件を
    毎回詳細調査する」ことを通常運用の必須工程にしない**——2026-08-19
    昼の画像選定Trialが導いた「規約確認が次工程」という結論を
    ユーザー判断で覆し、確認コストを運用の前提にしない設計へ転換
    した。②記事・SNS画像はGINZA WHISKERS独自素材を原則とし、外部
    画像が使えないこと自体を公開のBLOCKERにしない（画像なし記事・
    独自アイキャッチで代替）。③Source Provenance
    （fact/sourceName/sourceUrl/sourceType/verifiedAt/
    verificationStatus/factTypeの7項目）を事実単位で保持し、
    「掲載サイト＝開催場所」と推定しない原則を明文化。④Confirmed
    Fact／Editorial Note／Quoted Materialの3分類（Quoted Materialは
    原則使用しない）。⑤Quality Gateを更新——BLOCKER/WARNINGの条件は
    `QUALITY_GATE_TRIAL.md`初版からおおむね踏襲しつつ、**「画像未
    選定」をWARNINGから削除し、画像有無をGate判定と独立させた**。
    **note記事Trialへの適用（`NOTE_ARTICLE_TRIAL.md`更新）**：
    4候補すべての出典表記を、読者向けSourceボックス形式
    （出典名称／確認日／公式URLリンク、ユーザー提示の表示例に準拠）
    へ更新した。③（回帰線）は実会場（銀座 蔦屋書店、primary）と
    二次告知（GINZA SIX、secondary）を明確に分離して表示するよう
    修正——`QUALITY_GATE_TRIAL.md`で発見した会場誤認の教訓を実際の
    記事表記に反映した。新規セクションF「Source Provenance詳細」を
    追加し、4候補・計27件のfact（うち7件はunconfirmedとして明示、
    推測補完はしていない）をfactType別に構造化した表として記録した。
    **`QUALITY_GATE_TRIAL.md`・`IMAGE_USAGE_TRIAL.md`の追記更新**：
    前者はWARNING条件から「画像未選定」を削除し変更履歴として記録。
    後者は末尾に「Editorial Trust Layer確定による方針更新」を追記し、
    「規約確認が次工程」という当初の結論を「通常運用では規約確認を
    必須工程にしない」へ上書きした（判定フレーム自体は将来の独自
    素材管理台帳として存置）。
    **成果物**：新規ファイルは作成せず、既存の`CLAUDE.md`（第8章）・
    `NOTE_ARTICLE_TRIAL.md`・`QUALITY_GATE_TRIAL.md`・
    `IMAGE_USAGE_TRIAL.md`の4ファイルを更新するのみに留めた
    （「重複ファイルを増やさない」というユーザー指示を反映）。
    コード実装（TypeScript型定義等）は行っていない——Source
    Provenance構造は現時点でMarkdown文書上の構造化データとして
    実装し、これを消費する自動化コードパスがまだ存在しないため、
    実装済みコードから参照されない型定義を新設することを避けた
    （既存構造を優先する指示に基づく判断）。
    **今回は行っていない**：外部画像の転載・ダウンロード、
    note/X/LINEへの公開・送信、DB書き込み、実際の利用規約ページへの
    アクセス、本番デプロイ、実AI呼び出し、課金。ローカル環境
    （Docker/Postgres）の起動も行っていない——ドキュメント更新のみの
    セッションのため。
    **次工程**：①GINZA WHISKERS独自アイキャッチのデザイン検討、
    ②Source Provenance構造を将来的に自動記事生成コードへ組み込む
    際のTypeScript型定義化（実際の消費コードパスができた時点）、
    ③画像なし・公式リンクのみの形でのX／LINE展開Trial。
  - 2026-08-19（画像選定・利用可否Trial：仕様設計、コード実装なし）:
    直前の記事品質Gate Trial（本節直下の項目）に続き、note記事・
    将来のX／LINE展開で使用する画像の「どれを選び、どの用途で利用
    可能か」を安全に判定する仕様をユーザー指示により設計した。
    **今回もロジック・仕様のTrialとして扱い、コード実装・画像の
    ダウンロード・転載はいずれも行っていない**——既存の
    `DiscoveredContent.imageUrl`（2026-08-18実装、OGP画像URLのみ
    保持しダウンロードしない設計）の値をそのまま参照した。
    **利用可否ステータス**：USABLE／REVIEW／NOT_USABLE／UNKNOWNの
    4区分を定義し、**「公式サイト掲載」「OGP画像として取得できる」
    という事実だけではUSABLEにしない**という原則を明記した
    （ユーザー指示を文字どおり反映）。
    **著作権・利用条件確認**：著作権表記・利用規約・プレス素材・
    メディア掲載条件・SNSシェア可否・クレジット表記要否・改変可否・
    トリミング可否の8項目を確認対象としたが、**今回のクロールデータ
    （トップページ・個別記事ページ本文）の範囲では全項目が未確認**
    だった（利用規約ページ自体が巡回対象外のため）。
    **Trial適用結果（note記事Trial4候補・画像レコード5件——③回帰線
    のみGINZA SIX版／蔦屋書店版の2枚）**：**全5件をREVIEW**と判定した
    （USABLE 0・NOT_USABLE 0・UNKNOWN 0）。特に③のGINZA SIX版は
    「実会場ではなく二次告知サイト経由」（`QUALITY_GATE_TRIAL.md`の
    会場誤認の発見と接続）かつ「個人アーティストの美術作品という
    著作権感度が高いコンテンツ」という二重の理由で、REVIEWの中でも
    優先度を下げ、独自画像への差し替えを優先候補とした。
    **Quality Gateとの接続設計**：画像の利用可否をテキストの品質Gate
    （BLOCKER/WARNING/PASS）とは独立した別軸として設計し、
    「画像REVIEWでもテキストGateがPASSなら画像なし記事として公開
    可能」「ただしX/LINE等のSNS投稿は画像USABLEが確認できるまで
    Gateを通過しない」という非対称なルールを定めた（note埋め込みと
    SNS投稿はいずれも画像USABLE必須、テキスト単体公開とは独立）。
    **代替方針**：画像なし記事／GINZA WHISKERS独自アイキャッチ／AI
    生成の抽象的挿絵／現地自撮り／公式ページへのリンクのみ、の
    5案を整理し、**AI生成挿絵を使う場合はイベント固有の作品・商品を
    模倣しない範囲に限定する**（パク・ヨンジェの画風を模したイラスト
    や実物ブーツを再現した画像等は、AI生成であってもイベント固有の
    著作物の模倣に該当しうるため避ける）という注意点を明記した。
    **成果物**：新規`IMAGE_USAGE_TRIAL.md`（プロジェクトルート、
    `QUALITY_GATE_TRIAL.md`等と同階層）を1ファイル作成。
    **今回は行っていない**：画像の転載・ダウンロード・外部公開・
    SNS投稿・note投稿、コード実装、DB書き込み、実際の利用規約
    ページへのアクセス・確認、本番デプロイ、外部送信、実AI呼び出し、
    課金。
    **次工程**：①各サイトの利用規約ページの実際の確認（次工程の
    優先タスク、REVIEW→USABLE/NOT_USABLE確定のために必須）、
    ②画像なし・公式リンクのみの形でのX／LINE展開Trial（画像USABLEを
    前提としない縮小版として着手可能）、③GINZA WHISKERS独自
    アイキャッチのデザイン検討。
  - 2026-08-19（記事品質Gate Trial：仕様設計、コード実装なし）:
    直前のnote記事生成Trial（本節直下の項目）で発見した会場誤認
    （パク・ヨンジェ個展「回帰線」、GINZA SIXが実会場だと誤認しかけた
    問題）を踏まえ、将来の自動記事生成で事前検出するための品質
    チェック仕様をユーザー指示により設計した。**今回は「ロジック・
    仕様のTrial」と明示され、コード実装・パイプラインへの組み込みは
    行っていない**——`QUALITY_GATE_TRIAL.md`として仕様書のみを作成し、
    既存のnote記事Trial原稿へ手動で適用した。DB操作・環境起動も
    行っていない（ドキュメント作成のみのセッション）。
    **会場判定ロジック改善案**：「実開催会場／主催者／二次告知
    サイト／商業施設内テナント／クロスサイト告知／同一イベントの
    別会場開催」の6概念を区別する用語整理と、判定ルール
    （複数サイトの会場記述を比較し、一致すれば1会場、矛盾すれば
    両論併記、判定不能なら会場未確認とする）を明文化した。
    「掲載サイト＝開催会場」という短絡判断を明示的に禁止する原則を
    記録。あわせて、フジサキタクマ「MOLnarrative」（GINZA SIX本会場＋
    銀座 蔦屋書店内GINZA ART SQUARE＋スターバックス前の計3箇所での
    サテライト展示、excerptで確認済み）を「本当に複数会場開催の
    実例」として対比させ、表面上似た「複数サイト掲載」でも実態が
    異なることを整理した。
    **Fact/Editorial分離**：Confirmed Fact／Unconfirmed／Editorial
    Noteの3分類と、1文中で事実と編集評価を混在させない等の混同
    防止ルールを定義。既存のnote記事Trial原稿が既にこの形式に
    準拠していたことを確認した。
    **実用情報チェック**：開催日・会場・時間・料金・予約要否・
    所要時間・アクセス・撮影可否・限定特典の9項目について、
    UX Type（participate_workshop/exhibition_viewing/food_drink/
    shopping_discovery/live_performance）ごとに必須/推奨/任意の
    重要度マトリクスを設計した（全項目一律必須にはしない）。
    **Quality Gate仕様**：BLOCKER 6種
    （開催日不明・会場不明or矛盾未解決・終了済み・情報源矛盾未解決・
    重複未処理・Content Richness=boilerplateで例外理由なし）、
    WARNING 7種（料金/予約要否/所要時間/アクセス/撮影可否未確認・
    画像未選定・Content Richness=thin）で定義。ユーザー提示の
    「同一イベント重複」を単純BLOCKERとする案は「統合・両論併記の
    いずれかで処理済みなら重複の存在自体はBLOCKERにしない」という
    条件付きに修正し、代わりに今回発見した実際の問題そのもの
    （「会場記述の矛盾が未解決」）を新規のBLOCKER条件として明示的に
    追加した。
    **Trial記事への適用結果**：note記事生成Trialの4候補すべてを
    実際に判定し、**4件ともWARNING（BLOCKERなし）**——料金・予約
    要否・所要時間・アクセス・撮影可否が広く未確認である一方、
    開催日・会場（回帰線は執筆時の訂正後基準）はいずれもFact
    確認済みと判定した。**重要な自己検証**：現在の記事は執筆時の
    手動訂正により会場がFact判定されているが、「もしEditor's
    Choice Trial直後（執筆前）に本Gateを適用していたら、当時の
    会場記述の矛盾は自動判定だけではBLOCKERとして停止していた
    可能性が高い」ことを明記し、Quality Gateが本来検出すべき
    タイミング（記事執筆前）で今回は検出できていなかったという
    限界を正直に記録した。
    **画像選定Trial準備仕様**：画像候補レコードの必須項目
    （imageUrl・対応イベント・取得元・公式画像か・サイズ/比率
    〈本プロジェクトの設計上取得不可〉・記事冒頭候補・各イベント
    候補・SNS転用可否確認状態）を定義した。**SNS転用可否の既定値を
    「未確認＝転用不可として扱う」**とし、og:image取得がページ表示
    目的の埋め込みであってSNS二次利用の許諾を意味しないことを明記
    した（著作権上の利用可否を推測しない原則の徹底）。note記事
    Trial4候補すべての画像URL・取得元（いずれもog_image）を一覧化
    したが、SNS転用可否はいずれも未確認のまま。
    **成果物**：新規`QUALITY_GATE_TRIAL.md`（プロジェクトルート、
    `ARCHITECTURE_DRAFT.md`等と同階層）を1ファイル作成。
    `NOTE_ARTICLE_TRIAL.md`とは性格の異なる別種の文書
    （記事原稿ではなく品質仕様書）のため別ファイルとした——新規
    ディレクトリは作成していない。
    **今回は行っていない**：コード実装（`cms/src/lib/curation/`への
    組み込み）、DB操作、画像の外部取得・転載・公開、note/X/LINEへの
    投稿、本番デプロイ、外部送信、実AI呼び出し、課金。
    **次工程**：①§1.3の会場判定ルールの実コード化（本文中の会場
    ラベル抽出ロジックの新規実装が必要、既存のJSON-LD限定venue
    抽出では対応不可）、②Quality Gateの記事執筆前フェーズへの
    組み込み（Editor's Choice Trial→記事執筆の間に自動チェックを
    挟む設計）、③画像のSNS転用可否の実際の確認方法の検討、
    ④画像選定Trial本体（記事冒頭候補・各イベント候補の実際の決定）。
  - 2026-08-19（note記事生成Trial：初のTrial原稿生成）: 直前の
    Editor's Choice Trial（本節直下の項目）で選定した4件を入力に、
    「旬の銀座」note記事Trial原稿を初めて生成した。**新規Anthropic
    API呼び出しは行っていない**——Claude Codeエージェント（本セッション）
    自身が編集執筆を行い、DiscoveredContentコレクション実データ
    （記事本文・タイトル・URL）のみを事実の根拠とした。noteへの
    自動投稿・外部公開・本番デプロイはいずれも行っていない。
    **入力の扱い**：Editor's Choice Trialの選定結果（4件、うち
    パク・ヨンジェ個展はGINZA SIX/銀座 蔦屋書店の2ソースを統合）を
    そのまま使用し、却下・保留候補（EXHIBITION LEAK ASSEMBLY・
    molnarrative・piece of heart・NUEF POP UP STORE・赤地陶房の
    うつわ）は本文に含めなかった。
    **執筆で実際に確認した元データ**：4候補それぞれのexcerpt全文を
    DB直接確認し、本文中の具体的な事実（オーダー会の色数・製法、
    活版印刷機の製造年・体験時間・料金、個展の開催場所・アーティスト
    経歴、写真集の判型・ページ数・価格）はすべて元データから確認
    できた範囲のみを使用した。確認できなかった項目
    （オーダー価格・入場料・限定特典の中身等）は本文に含めず、
    別途「未確認情報一覧」として記録した。
    **執筆段階で発見した重要な訂正（Editor's Choice Trial時点の
    判定の見直し）**：パク・ヨンジェ個展について、Editor's Choice
    Trialでは「GINZA SIXと銀座 蔦屋書店の双方で開催」という前提で
    クロスサイト重複統合を行ったが、両ソースの本文を実際に確認した
    結果、**実際の開催場所は銀座 蔦屋書店内「FOAM CONTEMPORARY」
    1箇所のみ**で、GINZA SIX側の記事はそれを紹介する告知記事
    （二次告知）だと判明した。「同一施設内の複数媒体による告知」と
    「複数施設での同時開催」は意味が異なるため、記事本文では正確な
    表現（開催場所は蔦屋書店内FOAM CONTEMPORARY、GINZA SIXは
    告知媒体）に訂正して執筆した——**Editor's Choice Trial段階の
    重複判定ロジックでは、開催場所が実際に複数か単一かまでは
    区別できていなかったことが分かった**（次工程の改善点として記録）。
    **著作物転載への配慮**：南方書局のハッピーサマーの情報源には
    写真家本人による詩的なステートメント文がそのまま掲載されていたが、
    そのまま転載すると広告コピーの転載に該当するため、装丁・構成と
    いった客観的事実の要約に留めた（執筆ルール「広告コピーをそのまま
    転載しない」を実際に適用した最初の事例）。
    **成果物の保存**：既存のプロジェクトルート直下（`ARCHITECTURE_
    DRAFT.md`・`CONTENT_MODEL.md`等と同じ階層）に新規
    `NOTE_ARTICLE_TRIAL.md`を1ファイルのみ作成した——新規ディレクトリは
    作らず、要求された5点（記事原稿・使用候補一覧・元SOURCE対応表・
    未確認情報一覧・問題点／改善候補）を1ファイルに集約した。将来の
    note記事Trialではこのファイルを上書き更新する方針とし、日付違いの
    重複ファイルは作らない。
    **検証**：DB直接確認でTrial前後にsources 36件・discovered_content
    300件・articles 8件・social_posts 0件・curationStatus（全300件
    inbox、変更なし）が完全に不変であることを確認した。検証後は
    `./p2 stop`で全サービスを安全に終了した。
    **今回は行っていない**：noteへの投稿、外部公開、本番デプロイ、
    Article/SocialPostsコレクションへのDB書き込み、画像選定・埋め込み、
    実際のAnthropic API呼び出し、課金。
    **次工程**：①画像選定Trial（4候補ともimageUrlは確認済み、未活用）、
    ②クロスサイト重複判定ロジックの改善（開催場所が単一か複数かを
    本文レベルで判定する仕組み、今回は執筆段階での人力確認で代替）、
    ③未確認情報の記事内表記方針の確立、④X/LINE等への展開Trial
    （ユーザーの次回指示を待って着手）。
  - 2026-08-19（Editor's Choice Trial：Top10→4件への絞り込み、
    読み取り専用）: 前日（2026-08-18）の統合Trial・最終検収に続き、
    ユーザー指示により実際にEditor's Choice判断を模擬するTrialを
    実施した。目的はSOURCE LEDGER上の候補を「旬の銀座」で実際に
    紹介する価値がある3〜5件へ絞り込むこと。**新規機能実装・
    ランキングロジック変更・DB書き込みは一切行っていない**——
    既存の`./p2 daily`出力とDB直接参照（読み取り専用）のみで
    編集判断を行った。
    **日付更新に伴う重要な発見**：基準日が2026-08-19に更新された
    直後に`./p2 daily`を再実行したところ、**前日Top10の#1〜#3
    （能面体験・雲の物語・no side by side）が軒並みTop10から消失**
    していることを発見した。原因を確認した結果、3件とも
    `eventEndAt`が「2026-08-19T00:00:00Z」ちょうどで、日付が
    変わった瞬間に`deriveEventStatus`が`ended`と判定する仕様
    （`nowMs > validEnd.getTime()`）のためと判明した——ロジックの
    バグではなく既存仕様どおりの動作だが、「終了日当日も実際には
    開催されているケースが多い」という実態とはズレがあり得る、
    今回初めて実データで顕在化した境界条件の論点として記録した
    （対応は見送り、次工程候補）。この結果、本Trialは前日のTop10
    ではなく**当日（2026-08-19）実際に生成された新しいTop10**を
    対象に実施した。
    **評価軸**：ユーザー指定のA〜F軸
    （A旬性=NOW/NEXT/SOON、B銀座らしさ、C UX価値、D情報充足度
    〈rich優先・boilerplate/thin原則降格〉、E施設多様性、
    F体験多様性）を適用し、当日Top10の10候補を評価した。
    **重複処理**：#3/#5（パク・ヨンジェ個展「回帰線：永遠が留まる
    場所」、GINZA SIX id=144と銀座 蔦屋書店 id=98、会期完全一致）を
    1候補に統合——DB上は削除せず、両方のURLを統合元として明記した
    Trial内の表示上の統合に留めた（永続的なマージ処理は実装して
    いない）。
    **情報不足処理**：#10（赤地陶房のうつわ、Content Richness=
    boilerplate、素点51点）はEditor's Choice掲載不可と判定した。
    推測での情報補完は行わず、「陶芸家名以外に作品の特徴・鑑賞体験の
    魅力を語れる情報がない」ことを理由に見送りとした。
    **選定結果（4件）**：①REGAL×SOMÈS ホースライディングブーツ
    オーダー会（GINZA SIX、NOW）、②活版印刷体験（中央区観光関連、
    SOON——GINZA SIX/蔦屋書店以外の施設多様性確保のため選定、
    Editorial Score自体は36点とTop10中最低だが施設・体験タイプの
    多様性を優先）、③回帰線：永遠が留まる場所（統合候補、NEXT）、
    ④南方書局のハッピーサマー（銀座 蔦屋書店、NOW、ショッピング枠）。
    除外6件の内訳：UX偏重回避3件（EXHIBITION LEAK ASSEMBLY・
    molnarrative・piece of heart——展覧会枠の重複回避）、旬性が低い
    1件（NUEF POP UP STORE——7週間継続中で終了間際、訴求困難）、
    情報不足1件（赤地陶房のうつわ）。
    **実データで新たに発見した誤分類（改善点として記録）**：
    #8「piece of heart」（mak!garc!a個展、切り絵アーティストの
    個展であることをexcerptで実際に確認済み）のUX Typeが
    「グルメ・飲食」と誤判定されていることを発見した。原因は
    未調査のまま次回の精査課題として記録するに留めた（今回は
    「大規模な構造変更は行わない」というユーザー指示のためロジック
    修正はせず）。
    **検証**：DB直接確認でTrial前後にsources 36件・discovered_content
    300件・articles 8件・social_posts 0件・curationStatus
    （全300件inbox、変更なし）が完全に不変であることを確認した。
    検証後は`./p2 stop`で全サービスを安全に終了した。
    **今回は行っていない**：Article生成、note/SNS投稿、新規AI API
    呼び出し、課金、本番Railway操作、公開、外部送信、DB書き込み
    （curationStatusの承認/却下含む）、クロスサイトStory Clustering
    の恒久実装、UX Type誤分類の修正。
    **次工程**：①note記事生成Trial（ユーザーの明示的な指示を待って
    着手、#1・#2・#4は記事化材料として十分、③統合候補は「2会場
    同時開催」の文脈明記が必要と判断済み）、②eventEndAt当日境界
    条件の扱い見直し、③piece of heartのUX Type誤分類の原因調査、
    ④クロスサイトStory Clustering、⑤Editor's Choice実運用
    （curationStatus承認/却下）の試行。
  - 2026-08-18（本日の統合Trial最終検収、読み取り専用）: 本日実装した
    7機能（SOURCE LEDGER巡回／変化検知→Sources接続→Editorial Score→
    施設多様性抑制→Content Richness→UX Type→Temporal Relevance→
    画像URL取得）を通しで最終検収した。**新規機能実装・ランキング
    ロジック変更・DB書き込みは一切行っていない**——既存の
    `getDailyEditorialDeskRanking`/`./p2 daily`の出力に、CLI未表示の
    imageUrl有無・重複／情報欠落／期限切れの最終チェックのみを
    読み取り専用の使い捨てスクリプトで補完した（実行後削除）。
    **検収結果（実データ、採点済み295件・Story Cluster 288件・
    Daily候補46件、施設多様性適用後Top10）**：本日中の複数回の
    実行（統合Trial・模擬Editor's Choice運用・Temporal Relevance
    実装検証・今回の最終検収）を通じて**Top10の内容・スコア・
    各種分類が完全に安定して再現**されることを確認した（データに
    変化がないため当然だが、パイプライン全体が決定的・再現性を
    持って動作することの実証でもある）。画像URL取得率10/10
    （100%）、開催期間欠落0件、期限切れ混入0件を維持。
    **既知の問題として引き続き残るもの**：#6/#8のタイトル重複
    （パク・ヨンジェ個展「回帰線：永遠が留まる場所」がGINZA SIXと
    銀座 蔦屋書店の双方から独立に告知されている、クロスサイトStory
    Clustering未対応という既知の設計上の限界）、#10のContent
    Richness＝boilerplate（素点51→total33）。新規の問題は発見
    されなかった。
    **検証**：DB直接確認で検収前後にsources 36件・discovered_content
    300件・articles 8件・social_posts 0件・dc_curation_inbox 300件
    （全件inbox）が完全に不変であることを確認した。検証後は
    `./p2 stop`で全サービスを安全に終了した。
    **今回は行っていない**：新規機能実装、ランキングロジック変更、
    DB書き込み、Article生成、note/SNS投稿、新規AI API呼び出し、
    課金、本番Railway操作、公開、外部送信。
    **9月Trialへの持ち越し課題**：①クロスサイトStory Clustering
    （同一イベントの複数サイト告知の統合）、②Maron Editor's Choice
    実運用の試行（curationStatus承認/却下）、③Sourcesコレクションへの
    UX Type/Temporal Relevance適用、④歌舞伎座の構造的UX Type誤分類
    対応、⑤NOWタイア内の「終了間近」サブ分類、⑥excerptノイズ除去。
  - 2026-08-18（Temporal Relevance実装：Editor's Choice支援指標）:
    直前の模擬Editor's Choice運用（本節直下の項目）に続くシミュレーション
    分析（Top10をNOW/SOON/NEXT/LATER/EXPIRED/unknownに分類し、マロンの
    模擬判断#1採用〜#10却下との相関を検証）で「NOWタイア＝採用判断
    5/5一致」という強い相関を確認できたことを受け、ユーザー指示により
    正式に実装した。**新規のAnthropic API呼び出しは一切行っていない**
    ——`eventStartAt`/`eventEndAt`から決定的に計算する純粋関数。
    **重要な設計原則（シミュレーション結果とマロン指示を反映）**：
    Editorial Scoreへの加点/減点は一切行わない——ランキングの並び順
    （スコア降順→施設多様性調整）には全く関与しない、後段で計算する
    参考情報としてのみ提供する。将来イベント（NEXT/LATER）を低品質とは
    判定しない。シミュレーションで判明した「#10はSOON（開始まで1日）
    でも却下された」という反例を踏まえ、Temporal Relevance単体では
    採否を予測できないことを設計にも明記し、スコアリングへの組み込みは
    見送った。
    **設計**：新規`cms/src/lib/curation/temporalRelevance.ts`
    （`deriveTemporalRelevance(eventStartAt, eventEndAt, now)`、
    Payload非依存の純粋関数）。既存の`deriveEventStatus`
    （eventStatus.ts）の判定結果を再利用し重複実装を避けた——
    ongoing→NOW、ended→EXPIRED、upcoming→開始日までの日数で
    SOON(1〜7日)/NEXT(8〜14日)/LATER(15日以上)に細分化、
    unknown→unknown（日付情報が不十分な場合は推測しない）。単日
    イベントは開始日までの日数をそのまま使う（マロン指示どおり）。
    **DBには保存しない**——`now`に対する相対値のため毎回その場で
    計算する設計とした（`eventStatus`/`isUpcomingSoon`と同じ「都度
    計算」方式、facilityDiversity/contentRichness/uxTypeとは異なり
    スキーマ変更なし）。
    **統合**：`dailyRanking.ts`の候補生成ループ内で
    （既存の`eventStatus`計算のすぐ後、スコア降順ソート・施設多様性
    調整より前段の情報として）計算し、`DailyRankingEntry`に
    `temporalRelevanceTier`/`daysUntilStart`/`daysUntilEnd`を追加
    （ランキングの並び順ロジック自体には一切手を加えていない）。
    `format_daily_desk_status.py`に各候補の表示行
    （「参考情報——ランキングには影響しません」と明記）と
    「Top{N}のTemporal Relevance構成」サマリー行を追加。
    **実データ検証（2026-08-18、ローカルDocker/Postgres環境）**：
    ①`tsc --noEmit`（cms、0エラー）・`npm run build`（成功）・
    `bash -n scripts/project02`・Python構文チェック、いずれも合格。
    ②スキーマ変更を伴わないため、既存データ（discovered_content
    300件・sources 36件・articles 8件・social_posts 0件）への
    影響は原理的に発生しない設計だが、`./p2 daily`実行前後でDB件数を
    直接確認し完全に不変であることを検証した。③`./p2 daily`で
    実際のTop10を再表示し、**シミュレーション分析（前回セッション）と
    完全に一致する結果**（Top10のTemporal Relevance構成：NOW 5件・
    NEXT 3件・SOON 2件）を確認——#1〜#4・#7がNOW、#5・#6・#8がNEXT、
    #9・#10がSOONと、手動分析時の分類と1件も違わず一致した。
    ④`./p2 doctor`・`./p2 editorial`（Sources 36件全件inbox・
    Articles 8件/Published 1件、不変）・`./p2 social`（候補0件、
    不変）の回帰も確認し異常なし。検証後は`./p2 stop`で全サービスを
    安全に終了した。
    **今回は行っていない**：実際のAnthropic API呼び出し、Editor's
    Choice承認、DB破壊的変更、本番Railway操作、Temporal Relevanceの
    ランキングへの加点/減点実装（意図的に見送り、参考表示のみ）。
    **残課題・次工程**：①NOWタイア内での「終了間近」サブ分類
    （例：終了まで1〜2日を強調表示する「まもなく終了」ラベル）は
    シミュレーション分析で着想のみ記録し未実装——次候補として残す。
    ②クロスサイトStory Clustering・Sourcesコレクションへの各種指標
    適用・歌舞伎座の構造的UX Type誤分類対応等、これまでの残課題は
    引き続き未着手。
  - 2026-08-18（統合Trial：Daily Editorial Desk本日版候補表の生成、
    読み取り専用）: 本日実装した7機能（SOURCE LEDGER巡回／変化検知・
    Sources接続・Editorial Score・施設多様性抑制・Content Richness・
    UX Type・画像URL取得）を統合し、実際にマロンがEditor's Choiceを
    行える候補一覧を生成した。**新規AI呼び出し・DB書き込みは一切
    行っていない**——既存の`getDailyEditorialDeskRanking`
    （施設多様性・Content Richness・UX Typeを全て内包済み）の出力と
    DiscoveredContentの直接参照だけを組み合わせた使い捨てスクリプトで
    表示のみ行った（実行後削除）。
    **生成結果（実データ、採点済み295件・Story Cluster 288件・Daily
    候補プール46件、施設多様性適用後Top10）**：GINZA SIX 4件・
    銀座 蔦屋書店 4件・中央区観光関連 1件・GINZA OFFICIAL 1件。
    UXタイプ構成：exhibition_viewing 5件・participate_workshop 4件・
    shopping_discovery 1件。画像URL取得率10/10（100%）。
    **最終チェックで発見した問題（実データ、1件）**：Top10内に
    **タイトル重複「回帰線：永遠が留まる場所」**を発見（#6 GINZA SIX
    id=144と#8 銀座 蔦屋書店 id=98）。実データを追跡した結果、
    これはバグではなく**同一の実イベント（パク・ヨンジェ個展、
    会期2026-08-29〜09-16が完全一致）がGINZA SIXと銀座 蔦屋書店の
    双方で独立に告知されている**実例だった。Story
    Clustering（storyClustering.ts）は意図的に「同一サイト内でのみ
    探索」する設計（2026-08-17の設計判断）のため、サイトをまたぐ
    同一イベントは統合されず別々のStory Clusterとして扱われる——
    今回初めてTop10という実運用に近い文脈でこの既知の設計上の限界が
    可視化された。他の問題（開催期間不明・期限切れ混入・URL重複）は
    0件だった。
    **今回の判断（ユーザー指示「新規機能追加を一旦停止」を遵守）**：
    このクロスサイト重複への対処（サイトをまたぐStory Clustering拡張）
    は実装せず、次工程の検討課題として記録するに留めた。
    **検証**：DB直接確認で本セッションの操作前後にsources 36件・
    discovered_content 300件・articles 8件・social_posts 0件・
    source_ledger 14件・source_snapshots 252件が完全に不変であることを
    確認（読み取り専用の実証）。curationStatus（DiscoveredContent
    全300件inbox）も不変——Editor's Choiceの承認・却下は一切行って
    いない。使い捨てスクリプト（`_tmpIntegratedTrial.ts`）は実行後
    削除済み。検証後は`./p2 stop`で全サービスを安全に終了した。
    **今回は行っていない**：ランキング結果のDB書き込み（Editor's
    Choiceとしての永続化）、Article生成、note/SNS投稿、本番Railway
    操作、外部送信、実AI呼び出し、既存データの変更。
    **自動選定の完成度**：SOURCE LEDGER巡回からEditorial Score・
    施設多様性・Content Richness・UX Type・画像URLまでの一連の
    パイプラインは実データで安定動作することを確認済み。ただし
    「自動選定だけでそのまま公開できる」段階には至っておらず、
    人間（Maron）による最終確認が前提——特にクロスサイト重複の
    ような自動検知できない編集判断が残る。
    **次工程候補**：①クロスサイトStory Clustering（同一イベントの
    サイトをまたぐ統合）の検討、②Maron Editor's Choiceの実運用
    （curationStatusの承認/却下）の試行、③Sourcesコレクションへの
    UX Type適用、④前回セッションまでに記録済みの残課題
    （歌舞伎座の構造的UX Type誤分類、excerptノイズ除去等）。
  - 2026-08-18（参加／体験型UXタイプの設計・シミュレーション・実装）:
    前回セッションで優先順位4位とした「参加/体験型UX軸の新設」に、
    ユーザー指示（「まず既存データのみで設計・分類可能性・シミュレーション
    まで」「課金なし」）に従い着手した。**新規のAnthropic API呼び出しは
    一切行っていない**——ルールベースのキーワード分類として実装し、
    既存335件（実際には300件、DiscoveredContent全件）へ課金なしで
    適用できた。
    **重要な設計原則（マロン指示を反映）**：「体験型だから自動的に
    高得点」にはしない——本分類はEditorial Score（5軸・合計・
    rawTotal）には一切影響しない。Audience Tagsと同じ「除外用フィルタ
    ではなく付加情報」という位置づけの**補助的な分類ラベル**として
    設計した（展示鑑賞・買い物・グルメも銀座の重要な体験であり優劣は
    つけない、という指示を文字どおり反映）。
    **分類taxonomy**：ユーザー提示の6分類
    （participate_workshop/food_drink/live_performance/
    exhibition_viewing/shopping_discovery/other）をそのまま採用した。
    **設計**：新規`cms/src/lib/curation/uxType.ts`
    （`classifyUxType(title, excerpt, contentType, contentRichnessTier?)`、
    Payload非依存の純粋関数）。優先順位付きキーワードマッチ
    （「体験」「ワークショップ」等の参加・体験系語彙を最優先、以下
    グルメ→ライブ・公演→展覧会→ショッピングの順）をタイトルに対して
    まず試し、マッチしなければexcerptも確認、それでも不明なら既存の
    `contentType`（classifyContentType.ts）からの緩やかなフォールバック、
    最終的に'other'とする（推測で埋めない原則）。特定施設名は一切
    ハードコードしていない。英語キーワード（workshop/exhibition/
    restaurant等）も主要カテゴリに用意し、将来の英語コンテンツ拡張を
    考慮した設計にした。
    **実データシミュレーションで発見・修正した誤分類パターン
    （2件、実データ検証で判明）**：①ナビゲーションメニュー文言による
    誤爆——「ニュース」「アート」等、サイト共通ナビに頻出する一般語を
    キーワードから意図的に除外。②**歌舞伎座サイトの構造的な誤分類**
    （実データで発見）：「株主優待」「最新情報」等の管理的ページが
    軒並みlive_performance（ライブ・公演・観覧）に誤分類される事象を
    発見し、原因を実データで追跡した結果、歌舞伎座は劇場サイトのため
    「公演」という語がページ本来の主題とは無関係にサイト全体
    （過去のお知らせ一覧等のサイドバー的な関連リンク集）で頻出する
    構造的ノイズ語になっていることが判明した。対策として、
    2026-08-18に本文情報量ペナルティ用に導入済みの
    `contentRichnessTier`（本文情報量の判定、同日先行実装）を再利用し、
    boilerplate/thin判定のページはexcerptキーワードマッチをスキップする
    設計にした——実際に「最新情報 | 歌舞伎座」（tier:thin）等の誤分類が
    解消することを確認。**ただし'rich'判定のページでも一部（歌舞伎座の
    「木挽町広場」「お土産処かおみせ」等、tier:richだが本文の大部分が
    同じサイドバー的な関連お知らせ一覧で占められているケース）は
    今回のガードでは解決しなかった**——これは既知の残存リスクとして
    正直に記録し、無理な追加ヒューリスティックでの深追いはしなかった
    （施設固有の構造的クセをキーワード側で個別に潰すことは事実上の
    施設名ハードコードに近づくため、既存のsiteAdapters/拡張フレーム
    ワーク〈日付抽出で採用済み〉に委ねるのが筋という判断、詳細は
    「誤分類リスク」の項）。
    **スキーマ変更**：`DiscoveredContent`に`uxType`（select、6値、
    非readOnly——contentTypeと同じくAdmin画面から人間が上書き可能）を
    非破壊的に追加。
    **パイプライン統合**：①`processDiscoveredLinks.ts`
    （新規発見・更新検知時、Stage 2直後）——この時点ではcontentRichness
    Tierがまだ存在しないため暫定判定（richness未考慮）。②
    `refreshDiscoveredContentDates.ts`（個別ページ再確認時）——既存の
    contentRichnessTierがあれば考慮。③`scoreDiscoveredContentById.ts`
    （採点時、contentRichnessTier確定直後）——**最も精度の高い最終判定**。
    採点のたびに自動的に最新化される。
    **既存300件への遡及反映**：新規
    `cms/src/lib/curation/recomputeUxType.ts`
    （`./p2 recompute-ux-type [--dry-run]`）——新規AI呼び出しなし、
    contentRichnessTierを含む既存データのみで再計算、冪等（同じ値なら
    書き込みスキップ）。
    **透明性**：`dailyRanking.ts`の出力に`uxType`を追加し、
    `format_daily_desk_status.py`に各候補の「体験タイプ」表示と
    「Top{N}の体験タイプ構成」サマリー行（「参考情報——ランキング
    自体には影響しません」と明記）を追加した——facilityDiversityの
    施設構成サマリーと同じ位置づけの、Editor's Choice向け参考情報。
    **実データ検証（2026-08-18、ローカルDocker/Postgres環境）**：
    ①新規列（`ux_type`）が対話プロンプトなしで自動作成され、既存
    データ（discovered_content 300件・sources 36件・articles 8件・
    social_posts 0件）が無傷であることを確認。②シミュレーション
    （使い捨てスクリプト、実行後削除）で全300件を分類、歌舞伎座の
    誤分類発見・ガード実装・再検証まで実施。③`./p2 recompute-ux-type
    --dry-run`で対象300件を判定、DB書き込み0件を確認。④実書き込みで
    300件全件を更新。**最終分類分布**：participate_workshop 83件
    （27.7%）・food_drink 37件（12.3%）・live_performance 21件
    （7.0%）・exhibition_viewing 40件（13.3%）・shopping_discovery
    44件（14.7%）・other 75件（25.0%）。⑤`./p2 daily`で実際の
    Daily Top10を確認——**Top10の体験タイプ構成：展覧会・鑑賞5件・
    参加・体験・ワークショップ4件・ショッピング・新商品発見1件**
    （施設多様性抑制・本文情報量ペナルティと合わせて3機能が矛盾なく
    共存することを実データで確認）。
    **回帰確認**：`tsc --noEmit`（cms、0エラー）・`npm run build`
    （成功）・`bash -n scripts/project02`・Python構文チェック、
    いずれも合格。`./p2 doctor`・`./p2 editorial`（Sources 36件全件
    inbox・Articles 8件/Published 1件、不変）・`./p2 social`
    （候補0件、不変）の回帰も確認し異常なし。DB直接確認で
    curationStatus（DiscoveredContent全300件inbox）・editorialStatus
    （Sources全36件inbox）とも変更前と完全一致——今回の変更は`uxType`
    フィールドのみに限定されていることを確認した。検証後は
    `./p2 stop`で全サービスを安全に終了した。
    **今回は行っていない**：実際のAnthropic API呼び出し（設計・実装・
    遡及反映のすべてが決定的な再計算のみで完結、課金は一切発生して
    いない）、Sourcesコレクションへの同様の分類適用（ユーザー指示が
    DiscoveredContent範囲だったため今回は対象外、次工程候補として
    記録）、Editor's Choice承認、DB破壊的変更、本番Railway操作。
    **残課題・次工程**：①歌舞伎座の「tier:richだが構造的にサイドバー
    お知らせ一覧が主題語彙を汚染する」ケースは未解決のまま残る
    （既知の限界として記録、siteAdapters/拡張が本命の解決策）。
    ②キーワードリスト自体はv1の初期値であり、運用しながら調整が必要
    （UPCOMING_WINDOW_DAYS等、本プロジェクトの他の定数と同じ位置づけ）。
    ③Sourcesコレクションへの拡張、④UXタイプに基づくDaily Rankingでの
    多様性抑制（facilityDiversity.tsと同種の機構）は、今回は「体験型
    だから自動的に高得点にはしない」という指示を踏まえ実装せず、
    参考情報表示のみに留めた——実施する場合はユーザーとの追加合意が
    必要。
  - 2026-08-18（本文情報量のEditorial Scoreへの反映）: 2026-08-17の
    「旬の銀座」記事化Trialで判明した課題「#6（赤地陶房のうつわ、
    GINZA OFFICIAL経由）はEditorial Score 51点だったが実際は本文の
    大半がサイト共通ナビゲーション文言で記事化に使える実質的情報が
    ほぼ無かった」を解消する実装を、ユーザー指示（優先度3位を先行実施）
    により行った。**新規のAnthropic API呼び出しは一切行っていない**——
    既存の採点済みcontentRef/excerptテキストから決定的に判定する
    純粋関数で、課金なしに既存335件（Sources 31件・DiscoveredContent
    295件、いずれも当時の採点済み件数）へ遡及反映できた。
    **設計**：新規`cms/src/lib/curation/contentRichness.ts`
    （`assessContentRichness(contentRef)`、Payload非依存の純粋関数）。
    実データで赤地陶房のうつわ（id=150、文末句点「。」の出現数0）と、
    Trialで実際に記事化できた5件（能面体験・REGAL×SOMÈS・雲の物語・
    no side by side・南方書局のハッピーサマー、いずれも文末句点12〜18回）
    を比較した結果、「。！？の出現数」が本文の実質性を判別する妥当な
    代理指標であることを確認し、これを主指標として採用した
    （tier: rich[3件以上]/thin[1〜2件]/boilerplate[0件、または文字数
    120未満]、ペナルティ係数1.0/0.85/0.65）。ペナルティは合計スコアに
    乗算する形で作用し、facilityDiversity.tsと同じ「過度なハード除外を
    避ける」原則により、どれだけ本文が薄くても係数0.65が下限
    （スコアが0になることはない）。**既知の制約**：日本語の句点のみを
    対象とし英語の"."は数えない（実データで英語ページ（GO TOKYO等）も
    同じ理由でboilerplate判定になったため今回は誤検知なしと確認したが、
    将来英語の実質的な記事本文が増えた場合は再検証が必要）。
    **透明性の設計**：Editorial Score本体（5軸の値・reason文）は一切
    書き換えない。`Sources`/`DiscoveredContent`両方のeditorialScore
    グループに`rawTotal`（ペナルティ適用前の合計、readOnly）・
    `contentRichnessTier`（rich/thin/boilerplate、readOnly）・
    `contentRichnessPenaltyFactor`（readOnly）を追加。ランキングが
    実際に使う`total`はペナルティ適用後の値——`rawTotal`との差分から
    「何が調整されたか」を常に遡って確認できる（facilityDiversity.tsの
    pureScoreRank/diversityAdjustedと同じ設計思想）。`scoreSourceById.ts`・
    `scoreDiscoveredContentById.ts`（Sources/DiscoveredContent双方の
    採点オーケストレーション）に統合し、**今後の新規採点（実Claude・
    heuristic-placeholderいずれも）に自動適用される**ようにした。
    **既存335件への遡及反映**：新規`cms/src/lib/curation/
    recomputeContentRichness.ts`（`./p2 recompute-richness [--dry-run]`）——
    既存の採点済みSources/DiscoveredContentを走査し、5軸の値・reason文・
    scoringMethod・scoredAtには一切触れず、rawTotal/total/
    contentRichnessTier/contentRichnessPenaltyFactorのみを列単位で
    部分更新する（2026-08-10の実地検証で確認済みのPayload group型
    フィールドの列単位部分更新挙動を踏襲）。`ranking.ts`
    （Sources向け）・`dailyRanking.ts`（DiscoveredContent向け）双方の
    出力に`rawTotal`/`contentRichnessTier`を追加し、
    `format_ranking_status.py`・`format_daily_desk_status.py`に
    「本文情報量ペナルティ適用: 素点XX点 → tier」という注記を追加した
    （ペナルティが働いた候補が一目でわかるようにする、Editor's Choice
    支援の狙い）。
    **実データ検証（2026-08-18、ローカルDocker/Postgres環境）**：
    ①新規列（`editorial_score_raw_total`・
    `editorial_score_content_richness_tier`・
    `editorial_score_content_richness_penalty_factor`、Sources・
    DiscoveredContent両テーブル）が対話プロンプトなしで自動作成され、
    既存データ（sources 36件・discovered_content 300件・articles 8件・
    social_posts 0件）が無傷であることを確認。②キャリブレーション
    確認（`_tmpCheckRichnessCalibration.ts`、実行後削除）：id=150
    （赤地陶房）→`boilerplate`（文末句点0・文字数968）、id=139/142/251/
    91/97（Trialで記事化した5件）→全件`rich`（文末句点12〜18）と、
    期待どおりの分類を確認。③`./p2 recompute-richness --dry-run`で
    対象Sources 31件・DiscoveredContent 295件（いずれも当時の採点済み
    件数）を判定、DBへの書き込みが実際に0件であることを確認。
    ④実書き込みで31件・295件全件を更新——**tier内訳（Sources+
    DiscoveredContent合計）：rich 210件・thin 24件・boilerplate 92件**。
    ⑤DB直接確認でid=150が`rawTotal:51 → total:33`
    （51×0.65=33.15→33、`contentRichnessTier:boilerplate`）、id=139が
    `rawTotal:61 = total:61`（`contentRichnessTier:rich`、ペナルティ
    なし）と、設計どおりの結果を確認。⑥`./p2 daily`で実際にTop10を
    再生成したところ、**赤地陶房のうつわが素点51点のまま（施設多様性
    抑制の効果と合わせ、以前は#6付近だったところ）本文情報量ペナルティ
    適用で33点に下がり、Top10の最下位（#10）へ後退**——CLI出力にも
    「本文情報量ペナルティ適用: 素点51点 → boilerplate」という注記が
    正しく表示されることを確認した（施設多様性の「繰り下げ」注記との
    併記も正しく機能、両機能が競合せず共存することを実データで確認）。
    **回帰確認**：`tsc --noEmit`（cms、0エラー）・`npm run build`
    （成功）・`bash -n scripts/project02`・Python構文チェック、いずれも
    合格。`./p2 doctor`・`./p2 editorial`（Sources 36件全件inbox・
    Articles 8件/Published 1件、不変）・`./p2 social`（候補0件、不変）の
    回帰も確認し異常なし。DB直接確認でcurationStatus（DiscoveredContent
    全300件inbox）・editorialStatus（Sources全36件inbox）とも変更前と
    完全一致——今回の変更はeditorialScoreグループのフィールドのみに
    限定されていることを確認した。検証後は`./p2 stop`で全サービスを
    安全に終了した。
    **今回は行っていない**：実際のAnthropic API呼び出し（既存候補への
    適用は決定的な再計算のみで完結、課金は一切発生していない）、
    Editor's Choice承認、DB破壊的変更、本番Railway操作。前回セッションで
    優先順位4位とした「参加/体験型UX軸の新設」は、既存採点済み候補への
    実際の意味的な再評価（AIによる軸の再判定）を伴うため実AI呼び出しが
    必要になる可能性が高く、今回は着手していない。
    **残課題・次工程**：①`MIN_MEANINGFUL_LENGTH`（120）・
    `RICH_MIN_SENTENCE_ENDINGS`（3）・`THIN_MIN_SENTENCE_ENDINGS`（1）・
    ペナルティ係数（1.0/0.85/0.65）はいずれも実データ観察に基づく
    初期値であり、固定の正解ではない——本プロジェクトの他の定数と同じ
    位置づけで運用しながら調整の余地がある。②英語コンテンツの文末
    判定（"."）は今回未対応——現時点のCore Source群では誤検知が
    確認されていないため優先度は高くないが、将来の拡張候補として記録。
    ③`./p2 score`/`./p2 score-articles`が今後新規候補を採点する際は
    自動的にcontentRichnessが適用されるため、`./p2 recompute-richness`は
    「過去に採点済みだが本機能導入前だった候補」への一度きりの遡及
    適用という位置づけ——今後は基本的に再実行不要（ただし
    `assessContentRichness`のロジック自体を将来調整した場合は、
    再度`./p2 recompute-richness`で全件に反映し直せる）。
  - 2026-08-18（OGP等の画像URL取得の実装）: 前段の施設偏り抑制実装
    （本節直下の項目）で優先度2位と判定した「OGP等の画像URL取得」を
    ユーザー指示により実装した。目的は、DiscoveredContentのStage 2
    個別ページ取得時に記事・イベントを代表する画像候補を構造的に取得し、
    将来のEditor's Choice・note記事生成・SNS展開で利用できるようにする
    こと。ユーザーの基本方針（非破壊的optional field追加・og:image最優先・
    twitter:imageをfallback・相対URL絶対化・失敗時も既存処理を止めない・
    画像ファイル自体はダウンロードしない・著作権判断は範囲外・サイト
    固有ハードコード回避）をすべて反映した。
    **実装**：新規`cms/src/lib/crawler/extractImageUrl.ts`
    （`extractRepresentativeImageUrl(html, pageUrl)`、Payload非依存の
    純粋関数）。extractStructuredDates.tsの`findMetaContent`と同じ
    パターン（property/nameがcontentより前後どちらに来ても対応する
    正規表現ペア）でog:image（og:image:url／og:image:secure_urlの別名も
    許容）を最優先取得し、見つからない場合のみtwitter:image
    （twitter:image:srcの別名、一部サイトがproperty属性で誤記する
    ケースも許容）をfallbackとして試す。取得したURLは`new URL(candidate,
    pageUrl)`で記事ページ自身を基準に絶対URL化し、http(s)以外の
    スキーム（data:等）や空文字は除外してnullを返す——例外を投げず、
    呼び出し元の処理全体を失敗させない設計（他の抽出関数と同じ
    「推測しない・失敗させない」原則）。サイト固有のハードコードは
    一切なし。
    **スキーマ変更**：`DiscoveredContent`に`imageUrl`（text、optional、
    「取得できない場合はnullのまま」と明記）・`imageUrlSource`
    （select: og_image/twitter_image、readOnly、取得元の透明性確保）の
    2フィールドを非破壊的に追加。画像ファイル自体を保持するフィールドは
    作っていない（URLのみ）。
    **既存パイプラインへの結線**：`fetchArticlePage.ts`
    （`ArticleFetchOutcome`に`imageUrl`追加、Stage 2成功時に
    `extractRepresentativeImageUrl`を呼ぶ）→`processDiscoveredLinks.ts`
    （Stage 2成功時のみimageUrl/imageUrlSourceを更新、Stage 2未実行時は
    既存値を保持——他の日付フィールドと同じ差分更新パターン）→
    `refreshDiscoveredContentDates.ts`（既存の`resolve()`非破壊マージ
    ヘルパーにimageUrl/imageUrlSourceも追加、日付のバックフィルと同じ
    枠組みで画像URLもバックフィル可能にした）。新規のHTTP取得ロジックは
    一切追加していない——既存のStage 2フェッチ（fetchArticleMetadata）が
    既に取得しているHTMLから追加の情報を抽出するのみ。
    **実データ検証（2026-08-18、ローカルDocker/Postgres環境）**：
    ①新規列（`image_url`・`image_url_source`）が対話プロンプトなしで
    自動作成され、既存データ（discovered_content 300件・sources 35件・
    articles 8件・social_posts 0件）が無傷であることを確認。
    ②`./p2 refresh-dates --all --limit=300`で全300件を実際に再取得
    （270件フェッチ成功、エラー0件）。**画像URL取得**：フェッチ成功
    270件中229件（84.8%）で取得に成功、全件og:image由来（twitter:image
    フォールバックは今回のCore Source群では発火せず——全サイトが
    og:imageで対応できていたため。ただしコードとしては存在し、将来
    サイトが追加された際のfallbackとして機能する）。
    **サイト別取得状況**：GO TOKYO 50/50(100%)・中央区観光関連
    45/45(100%)・GINZA SIX 37/37(100%)・GINZA OFFICIAL 32/32(100%)・
    SEIKO HOUSE GINZA 28/28(100%)・資生堂ギャラリー 14/14(100%)・
    銀座 蔦屋書店 13/13(100%)・Sony Park 10/10(100%)・
    **歌舞伎座 0/23(0%)・POLA MUSEUM ANNEX 0/15(0%)・和光 0/3(0%)**。
    **取得できなかった主な理由**：0%だった3サイトについて、実際に
    curlで生HTMLの`<meta>`タグ一覧を目視確認したところ、いずれも
    og:image／twitter:image系のメタタグ自体がページに存在しない
    ことを確認した（抽出ロジックの不具合ではなく、サイト側が元々OGPに
    対応していないという事実——3サイトとも`<meta>`はcontent-type・
    keywords・description・viewport等のみで、og:/twitter:系は皆無）。
    抽出できた画像URLの目視確認では、絶対URL（`https://ginza6.tokyo/
    theme/g6/files/news/...`等）が正しく格納されていること、
    GINZA OFFICIALの一部ページでは記事固有の画像がなくサイト共通の
    デフォルトOGP画像（`ogp.png`）にフォールバックしていること
    （サイト側の実装がそうなっているだけで、こちらの抽出ロジックの
    誤りではない）を確認した。
    **合成HTMLによる単体検証**（`_tmpTestImageExtraction.ts`、実行後
    削除）：実データだけでは網羅できないエッジケース9パターン
    （og:image絶対URL・ルート相対URL正規化・ページ相対URL正規化・
    content属性が先に来る並び順・twitter:imageのみでのfallback・
    og:image優先の確認・メタタグなし→null・data:スキームの不正URL除外・
    空文字content→null）をすべてPASSで確認した——相対URLの絶対化・
    例外を投げない設計の両方を実データに依存せず直接検証できた。
    **検証・回帰確認**：`tsc --noEmit`（cms、0エラー）・`npm run build`
    （成功）・`bash -n scripts/project02`、いずれも合格。`generate:types`
    を再実行し新規フィールドの型を反映させたうえでの再typecheckも合格。
    `./p2 doctor`・`./p2 editorial`（Sources 35件inbox・Articles 8件/
    Published 1件、不変）・`./p2 social`（候補0件、不変）の回帰も確認し
    異常なし。**なお検証中、既存のPayload Jobs Queue日次cron
    （sourceLedgerCrawlTask.ts、2026-08-17実装済み・本セッションでは
    一切変更していない）がローカルサーバー起動中に自律的に1回実行され、
    実際のサイト変化を検知してSource #54（SHISEIDO GALLERY、
    `diffStatus:changed`、`editorialStatus:inbox`）を1件自動生成した
    （sources 35→36）——これは本セッションの操作によるものではなく、
    既存の自動巡回システムの正常な既定動作であり、内容を確認し正当な
    実データと判断したため削除・変更していない**。検証後は`./p2 stop`で
    全サービスを安全に終了した。
    **今回は行っていない**：画像ファイル自体のダウンロード・保存
    （URL取得のみ、ユーザー指示どおり）、著作権上の利用可否判定
    （範囲外として分離）、JSON-LD `image`フィールドからの追加fallback
    抽出（og:image/twitter:imageの2段のみに意図的に限定）、
    Editor's Choice承認、DB破壊的変更、実AI呼び出し（課金）、本番
    Railway操作。
    **残課題・次工程**：①歌舞伎座・POLA MUSEUM ANNEX・和光の3サイトは
    OGP自体を持たないため、今回のfallback段（og:image→twitter:image）
    では原理的に取得不能——将来これらのサイトの代表画像が必要になった
    場合は、本文中の最初の`<img>`タグ等の追加fallback、またはサイト固有
    アダプタ（`siteAdapters/`、既存の日付抽出用フレームワークと同じ
    枠組み）での対応が選択肢になる。②GINZA OFFICIALで観測された
    「サイト共通のデフォルトOGP画像」はEditor's Choice等での実利用時に
    「記事固有の画像ではない」ことを人間が判別できる表示上の配慮が
    あると望ましい（今回のスコープ外、次回以降の検討事項）。
    ③前回セッションで優先順位3位・4位とした「本文情報量をEditorial
    Scoreへ反映」「参加/体験型UX軸の新設」は、既存採点済み候補への
    再評価を伴い実AI呼び出し（課金）が発生しうるため、着手前にユーザー
    確認が必要になる可能性が高い。
  - 2026-08-18（Daily Rankingにおける施設偏り抑制の実装）: 前段の
    SOURCE LEDGER→Sources接続再検証（本節直下の項目）で優先度1位と
    判定した「施設偏りをDaily Rankingで抑制」をユーザー指示により実装
    した。目的は、GINZA SIX等の特定施設のイベントが多数取得された場合
    でもTop候補が同一施設に偏りすぎないようにすること——ただし
    Editorial Score自体は変更せず、「良い情報を機械的に除外しない」
    「多様性を考慮したランキング」としてEditor's Choiceを支援する設計
    とした（ユーザー指示を忠実に反映）。
    **設計**：新規`cms/src/lib/curation/facilityDiversity.ts`
    （`applyFacilityDiversity`、Payload・DB・特定施設名に一切依存しない
    純粋関数、汎用的な`facilityKey: string | null`のみを扱うため
    百貨店・ギャラリー・ホテル・飲食店等どの施設種別にも等しく適用
    される——GINZA SIX等のハードコードなし）。スコア降順の候補列に対し
    貪欲法で1件ずつ確定し、次点候補が①直近と同一施設が
    `maxConsecutiveSameFacility`（既定2）件連続、または②直近
    `shareWindowSize`（既定10件、Top10相当）件の窓内で同一施設が
    `maxPerShareWindow`（既定4件＝40%）を超える、のいずれかに抵触する
    場合のみ、`lookaheadWindow`（既定20件）先までの範囲で抵触しない
    代替候補を探して先に採用する。窓内に代替が見つからない場合は
    無理に除外せず本来の最高スコア候補をそのまま採用する
    （ハード除外を避ける設計）。
    **`dailyRanking.ts`への統合**：Editorial Score降順ソート後にこの
    関数を適用する後処理として追加（採点ロジック自体は無変更）。
    `DailyRankingEntry`に`sourceSiteId`（施設多様性判定用の内部キー、
    sourceSiteの id——name の同名衝突を避けるためidを正とする）・
    `pureScoreRank`（スコア純粋降順での順位、参考値として常に保持）・
    `diversityAdjusted`（施設多様性により順位が繰り下げられたか）を
    追加。`getDailyEditorialDeskRanking`に`diversify`
    （既定true、falseで従来のスコア純粋降順に戻せる——前後比較・検証用）
    ・`diversityOptions`（パラメータ上書き）を追加。戻り値に
    `diversified: boolean`を追加。`format_daily_desk_status.py`に
    施設多様性適用有無の表示、各エントリの「施設多様性のため繰り下げ・
    本来のスコア順位: #N」注記、Top10の施設構成サマリー行を追加した
    （Editor's Choiceの判断材料として透明性を確保する狙い）。
    **実データ検証（2026-08-18、ローカルDocker/Postgres環境、Daily候補
    プール46件）**：①`diversify:false`（従来のスコア純粋降順）と
    `diversify:true`（施設多様性考慮）を同一DB状態に対し実行し比較。
    ②`lookaheadWindow`の既定値は当初6を想定していたが、実データで
    Top10圏内に同程度スコアの他施設候補が見つからず多様性調整が
    実質的に働かないことが判明した（本プロジェクトはSourceLedgerが
    14件と少なく上位が2〜3施設に集中しやすいデータ特性のため）ため、
    `shareWindowSize`の約2倍にあたる20へ調整した（プール全体を無制限に
    掘り下げて極端に低スコアの候補まで引き上げることは避けつつ、
    「Top候補内」というユーザー意図に届く範囲まで代替候補を探す
    バランス）。③調整後、Top10の施設構成は**GINZA SIX 5件・
    銀座 蔦屋書店 4件・GINZA OFFICIAL 1件**（調整前）→**GINZA SIX 4件・
    銀座 蔦屋書店 4件・GINZA OFFICIAL 1件・中央区観光関連 1件**
    （調整後）に変化した。具体的には10位が「molnarrative」
    （GINZA SIX、47点）から「活版印刷体験」（中央区観光関連、36点、
    本来の順位#19から繰り上げ）に入れ替わり、molnarrativeは11位へ
    繰り下げ（除外はされていない）。全46件中の並び順調整は29件に及んだ
    （Top10圏外を含む全体では、中央区観光関連・GINZA OFFICIAL・
    Sony Parkの候補が広く繰り上がった）。1位〜9位は変化なし（元々
    3件連続・40%超の抵触が発生していなかったため）。**Editorial
    Score自体（NOW/GINZA/UX/STORY/DISCOVERYの各値・total）はどの候補も
    一切変更されていないことをDB直接確認・出力比較の両方で検証済み**。
    **回帰確認**：`tsc --noEmit`（cms、0エラー）・`npm run build`
    （0エラー）・`bash -n scripts/project02`・Python構文チェック、
    いずれも合格。ローカルDocker/Postgres環境で`./p2 doctor`・
    `./p2 editorial`（Sources 35件全件inbox・Articles 8件/Published 1件、
    不変）・`./p2 social`（候補0件、不変）の回帰も確認し異常なし。
    DB件数（sources 35・discovered_content 300・articles 8・
    social_posts 0）も本作業の前後で完全に不変であることを確認した
    （このセッションはロジックの並び順のみを変更するものであり、DB
    書き込みは一切発生しない設計）。検証用の使い捨てスクリプト
    （`_tmpCompareDiversity.ts`）は検証後に削除済み。検証後は
    `./p2 stop`で全サービスを安全に終了した。
    **今回は行っていない**：Editorial Scoreの採点ロジック自体の変更
    （本文情報量反映等、別候補）、画像URL取得、参加/体験型UX軸の新設
    （いずれも前回セッションで優先順位を再評価した残り3候補、今回は
    同時実装しない方針どおり着手せず）、Editor's Choice承認、DB破壊的
    変更、実AI呼び出し（課金）、本番Railway操作。
    **残課題・次工程**：①`maxConsecutiveSameFacility`（2）・
    `shareWindowSize`（10）・`maxPerShareWindow`（4）・
    `lookaheadWindow`（20）はいずれも実データ観察に基づく編集判断上の
    初期値であり、固定の正解ではない——運用しながら調整の余地がある
    （UPCOMING_WINDOW_DAYS等、本プロジェクトの他の定数と同じ位置づけ）。
    ②今回はDaily Ranking（個別記事・イベント単位）のみを対象とし、
    Sources側のランキング（`ranking.ts`、サイト単位の別ランキング）には
    適用していない——用途・データ形状が異なるため、要否は別途判断が
    必要。③前回セッションで優先順位2位とした「OGP等の画像URL取得」が
    次の実装候補として残る。
  - 2026-08-18（SOURCE LEDGER→Sources接続の再確認・実データ検証、
    Trial由来の改善候補4点の優先順位再評価）: ユーザー指示により
    「SOURCE LEDGER巡回結果をSourcesコレクションへ接続する」工程から
    再開しようとしたところ、**この接続は2026-08-17に既に実装済み**
    であることをコード実査（`generateSourceCandidates.ts`・
    `Sources.ts`の`crawlOrigin`グループ・`crawlSourceLedger.ts`の
    `generate-candidates`エンドポイント・`crawlSources.ts`）で確認した
    （CLAUDE.md記載を鵜呑みにせず、ファイル内容を直接読んで実装の
    実在を検証済み）。そのため本セッションの実質的な作業は「新規実装」
    ではなく、**実データによる動作再検証**に切り替えた。
    **検証内容**：①`tsc --noEmit`（cms、0エラー）・`bash -n
    scripts/project02`（構文チェック）を実行し合格。②`./p2 start`で
    ローカル環境起動、Health Check正常。③実行前DB状態を記録
    （sources 31・discovered_content 295・source_snapshots 210・
    articles 8・social_posts 0）。④`./p2 crawl`を実際に実行し、
    14サイト中4件（GINZA SIX・銀座 蔦屋書店・中央区観光関連・
    GO TOKYO）で実際の内容変化を検知、そこから**Source候補が実際に
    4件新規生成される**（Source #50〜53、`editorialStatus:inbox`・
    `crawlOrigin.diffStatus:changed`が正しく設定されていることをDB
    直接確認）ことを実データで確認した。⑤直後に同一条件で`./p2 crawl`
    を再実行し、対象Snapshot34件に対し**新規生成0件・全件スキップ**
    （冪等性）を確認、Sources総数も35件のまま不変であることをDB
    直接確認で検証した。⑥`./p2 doctor`・`./p2 editorial`
    （Sources 35件全件inbox、Articles 8件・Published 1件で不変）・
    `./p2 social`（候補0件、不変）の回帰も確認し異常なし。検証後は
    `./p2 stop`で全サービスを安全に終了した。**今回はSourcesの新規
    生成（4件）以外、DB破壊的変更・Editor's Choice承認・実AI評価
    呼び出し（課金）・本番Railway操作はいずれも行っていない**——
    生成された4件は実際のクロール結果を反映した正規のInbox候補であり、
    削除・巻き戻しは行っていない。
    **付随して確認できたこと**：同一巡回内で「個別記事・イベント抽出
    （DiscoveredContent）」パイプラインも正常動作しており
    （295件→300件、5件新規・8件更新検知）、SOURCE LEDGER→Sources
    （サイト単位）とSOURCE LEDGER→DiscoveredContent（個別記事単位）の
    2系統が独立して問題なく機能していることを合わせて確認した。
    **Trial由来の改善候補4点の優先順位再評価**（前回セッションの
    「旬の銀座」記事化Trialで判明した課題、実装は今回見送り・
    次回以降の判断事項として保持）：
    1. **施設偏りをDaily Rankingで抑制**：今回の実クロールでも新規
       Source候補4件中1件（GINZA SIX）が既に目立ち、Trial時に確認した
       「同一施設への集中」が単発の偶然ではなく構造的傾向である可能性を
       追加で示唆する実例が今回も観測された。純粋にアルゴリズム内部
       （`dailyRanking.ts`）で完結し、AI呼び出し・課金・スキーマ変更を
       伴わないため、4点の中で最も低リスク・低コストに着手できると
       判断——**次に着手する候補として優先度を最も高く見積もる**。
    2. **OGP等の画像URL取得**：`fetchArticlePage.ts`/
       `extractStructuredDates.ts`の拡張のみで完結し、DiscoveredContentへ
       非破壊的なフィールド追加で対応可能。AI呼び出し・課金を伴わない。
       次点の優先度。
    3. **本文情報量をEditorial Scoreへ反映**：スコアリングロジック
       （`heuristicScore.ts`/`scoreSource.ts`のプロンプト）に手を
       入れる必要があり、既存Inbox候補への再採点を伴う場合は実際の
       Claude API呼び出し（課金）が発生しうる——着手する場合は再採点の
       要否・範囲について事前確認が必要になる可能性が高い。
    4. **「参加／体験型」を明示的に評価するUX軸**：5軸評価の配点・
       プロンプト自体の変更を伴い、既存採点済み候補（Sources 35件・
       DiscoveredContent 300件）の再評価が必要になる——4点の中で
       最もスコープが大きく、実AI再呼び出し（課金）を伴う可能性が
       最も高いため、優先度は最も低いと判断。
    今回はユーザー指示（「上記4点を同時に大規模実装しないでください」
    「接続完了後に優先順位を再評価してください」）に従い、上記の
    優先順位再評価の提示に留め、実装には着手していない。
  - 2026-08-17（Event Date Extraction誤判定・Story Clustering過剰統合の
    修正）: 直前のレビュー表示セッションで確認された2つの誤判定
    （POLA MUSEUM ANNEX「connect connect」の会期誤抽出・10件の過剰統合）を
    ユーザー指示により修正した。
    **①Event Date Extraction誤判定の修正**
    （`cms/src/lib/crawler/extractStructuredDates.ts`）：
    (a) `EVENT_RANGE_LABELS`に単独の「期間」を追加（「会期」「開催期間」
    「期間」を最優先ラベルとするマロン指示）。(b) 新設
    `SESSION_INDICATOR_PATTERNS`（トーク／ギャラリートーク／ワークショップ／
    セミナー／講演／各回／予約／定員／回目／①②③④⑤）——「日時」「開催日」
    「開催概要」ラベル近傍にこれらが見つかった場合、そのラベルからの日付
    抽出を一切行わない（複数セッションの日時を展覧会全体の会期と誤認
    しない）。(c) `findLabeledRange`/`findLabeledEventDate`から自動年
    ロールオーバー（終了日が開始日より前の場合に自動+1年する処理）を完全に
    削除し、2トークンが同一範囲を構成しない（終了<開始になる）場合は
    その抽出自体を諦める（continueして次のラベルを試す、フォールバックで
    1トークンだけの単日採用もしない）——「開始日＞終了日の場合に自動的に
    翌年へ補正しない」「年をまたぐことが明示されている場合のみ年跨ぎを
    認める」というマロン指示に対応（年が明示された全形式トークン同士なら
    end<startにそもそもならないため、この変更は正当な年跨ぎ表現には
    影響しない）。合成テキストでの単体検証（5パターン：セッション文脈の
    誤爆防止・正規の会期ラベル・セッション語なしの単日日時・短縮形での
    降順ペア拒否・年をまたぐ明示的範囲）を実装直後に実施し、いずれも
    期待どおりの挙動を確認済み。
    **②Story Clustering過剰統合の修正**
    （`cms/src/lib/curation/storyClustering.ts`）：
    (a) `normalizeTitleForClustering`のサイト名区切りセグメント除去を、
    「区切り文字で2分割し長い方を残す」長さヒューリスティックから、
    「同一サイト内の複数ページにまたがって同一文字列で繰り返し出現する
    区切りセグメントをボイラープレートとみなし除去する」コーパスベースの
    判定（新設`computeBoilerplateSegmentsBySite`）へ全面変更した。実装の
    過程で、長さヒューリスティックがPOLA MUSEUM ANNEXの誤結合は解決する
    一方、SHISEIDO GALLERY（サイト名が英語で長く、実タイトルが短い
    日本語のケース）で逆方向に新規の誤結合を生むことを実データで発見し、
    コーパスベース判定への切り替えで解決した。(b) 区切り文字に
    EN DASH/EM DASH（"–"/"—"、HTML実体参照&#8211;/&#8212;）を追加
    ——GINZA SIXの「タイトル &#8211; GINZA SIX | GSIX | ...」規約で
    サイト名接尾辞がパイプではなくダッシュの直前にあり区切りセグメントとして
    単離されず、無関係な2商品（PIERRE HARDY靴/バッグ、CFCL/999.9等）が
    共通のダッシュ接尾辞だけでbigram類似度の閾値を超えて誤結合する事象を
    実データで発見し修正した。意図的にU+2015（HORIZONTAL BAR「―」）・
    U+FF0D（全角ハイフン「－」）は区切り文字に含めていない——展覧会名内部の
    装飾的区切りとして使われる実例（「うたう仲條 おどる仲條 ―文字と画と、
    資生堂と」等）を壊さないため。(c) 正規化後の値がそのサイトの既知
    ボイラープレートと完全一致する場合（区切り文字を含まないタイトルが
    丸ごとサイト名そのものであるケース、例：id=61「SHISEIDO GALLERY」）も
    forced singleton扱いにする分岐を追加。(d) 新設
    `ADMINISTRATIVE_PAGE_TITLE_PATTERNS`（ご協力のお願い／ご報告／寄付／
    感謝状／サイトマップ／プライバシーポリシー／アクセス／営業時間／
    よくある質問／ご利用案内）と`isIndexPageUrl`（`/index(.html)?`・
    ルートパス、および`/category/`・`/categories/`・`/tag/`・`/tags/`・
    `/news_category/`——GINZA SIXの実データでカテゴリー一覧ページの誤結合を
    発見し追加）を判定基準として、該当するアイテムは常に単独クラスタとして
    扱う`isForcedSingleton`フラグを導入し、`WorkingGroup`にも同フラグを
    持たせて双方向（forced itemが他へ統合されない・他がforced itemへ
    統合されない）に隔離した。(e) `ClusterableItem`に`articleUrl`
    （省略可、既存呼び出し元との互換性維持）を追加し、
    `dailyRanking.ts`・`discoveredContentSummary.ts`・
    `persistStoryClusters.ts`の3呼び出し元すべてから実際の値を渡すよう
    更新した。
    **`refreshDiscoveredContentDates.ts`の拡張**：抽出ロジック自体を
    修正した際、「既にDBに（誤って）値が入っている行」（例：POLA
    MUSEUM ANNEX id=47）は既存の「日付未取得の行のみ対象」フィルタでは
    再取得対象にならないため、`all:true`オプション（`./p2 refresh-dates
    --all`）を新設した。all:trueモードでは新しい抽出結果を（nullへの
    補正も含め）そのまま採用する——doc側の既存値へフォールバックしない
    （修正の効果が実際にDBへ反映されることを優先する設計）。
    **実データ検証結果（2026-08-17、ローカルDocker/Postgres環境、
    実HTTP再取得295件）**：①POLA MUSEUM ANNEX id=47の
    eventStartAt/eventEndAtは、誤り（2026-05-20〜2027-05-13、ギャラリー
    トーク各回の日時を誤って範囲採用）から、正しい抽出元テキスト
    「期間：2026年4月28日（火）～5月31日（日）」に基づく
    2026-04-28〜2026-05-31（body_label、confidence:medium）へ訂正された
    ことを実データで確認した。②「connect connect」の10件過剰統合は
    完全に解消——10件全件が個別の単独クラスタに分離され、id=49
    （中村萌「connect connect」本体）が正しく単独のconnect connect
    クラスタとして残った。③修正過程で追加発見・修正した2件の新規
    誤結合（SHISEIDO GALLERY・GINZA SIXカテゴリーページ/ダッシュ接尾辞）
    も解消し、最終的な複数メンバークラスタは全295件中6件・13件統合のみ
    （いずれも同一キャンペーン・同一プログラムに関する複数記事という
    妥当な統合と目視確認済み：ポストカード写真コンクール2件、
    shiseido art egg賞2件、第18回中央区観光検定2件、迷宮いろは47
    3件、北海道物産展2件、PIERRE HARDY 2026フォール2件——最後の1件
    〈靴コレクション／バッグコレクション〉は同一ブランド・同一シーズンの
    別製品ラインという境界的なケースだが、明確な誤りとは言えず許容範囲と
    判断した）。
    **改善前後の比較**（before：直前セッション終了時点の報告値、
    after：本セッションの修正・全件再取得後）：

    | 指標 | before | after |
    |---|---|---|
    | DiscoveredContent総数 | 295件 | 295件（不変） |
    | 日付取得件数／率 | 144件(48.8%) | 148件(50.2%) |
    | ongoing | 23件 | 23件 |
    | upcoming（全体） | 26件 | 28件（うち近日開催24件） |
    | ended | 31件 | 39件 |
    | unknown | 215件 | 205件 |
    | Story Cluster総数 | 269件 | 288件 |
    | 統合されたコンテンツ数 | 33件（複数メンバー7クラスタ） | 13件（複数メンバー6クラスタ） |
    | Daily候補数 | 37件 | 46件 |

    Story Cluster総数の増加・統合コンテンツ数の減少は、過剰統合が解消され
    実際には無関係だった大量のコンテンツが正しく個別クラスタへ分離された
    結果であり、想定どおりの改善（精度向上に伴う自然な変化であって後退
    ではない）。
    **Daily Top10の再生成**：「connect connect」（誤って#1になっていた）は
    姿を消し、GINZA SIX「能面体験＆ワークショップ」（61点、開催中）が
    新しい#1になった。以降のTop10もGINZA SIX・銀座 蔦屋書店・
    GINZA OFFICIALの実際の開催中/近日開催コンテンツで構成されている。
    **検証・回帰確認**：`tsc --noEmit`（cms、0エラー）・`bash -n
    scripts/project02`。DB直接確認でdiscovered_content総数295件
    （不変、新規行なし）・curationStatus（全295件inbox、Editor's Choice
    未変更）・editorialStatus（全31件inbox、未変更）を確認した。
    `./p2 doctor`・`./p2 editorial`（Sources 31件・Articles 8件、不変）・
    `./p2 social`（候補0件、不変）の回帰も確認し異常なし。検証後は
    `./p2 stop`で全ローカルサービスを安全に終了済み。**今回は行って
    いない**：Editor's Choiceの承認・変更、実データ削除、本番Railway・
    課金アカウント操作・権限設定・公開処理。
    **既知の留意点として残るもの**：①GO TOKYOの月次おすすめ記事のような
    「同一シリーズだが期間ごとに内容は別」というケースの扱いは、
    前回同様、実データで該当ケースが混入しなかったため実地未検証のまま。
    ②PIERRE HARDY靴/バッグコレクションのような「同一ブランド・同一
    シーズンの別製品ライン」を1つのStoryとして扱うべきかどうかは編集判断の
    余地があり、今回は許容範囲として残した。③一部の管理的ページ
    （寄付受付期間等）が新設の「期間」ラベルにより意図せずeventStartAt/
    eventEndAtを取得するケースが実データで確認されたが（例：POLA MUSEUM
    ANNEXの寄付報告ページ）、これらは`isForcedSingleton`によりStory
    Clusteringへの悪影響はブロック済み。ただし個々のDiscoveredContent単体
    としてのeventStatus（ongoing/upcoming判定）が意味的に正しくない
    可能性は残る——「寄付受付期間」を「イベント開催期間」と同一視する
    ラベルの意味的な誤用であり、次回以降、寄付・募集系ページを
    Event Date Extraction自体の対象から除外するかどうかの検討余地として
    記録する。
  - 2026-08-17（Daily Top10レビュー表示：重大なStory Clustering誤結合を
    発見、実装変更なし）: ユーザー指示によりDaily候補37件のTop10を
    Maron Editor's Choice用のレビュー表として表示する読み取り専用セッション
    を実施（DB変更・再クロール・再採点・承認はいずれも行っていない）。
    表示過程で、Top1「connect connect」（POLA MUSEUM ANNEX、開催期間
    2026-05-20〜2027-05-13、関連10件統合）について元データを確認した
    結果、**2点とも実際に問題があることを確認した（推測ではなく実データ
    追跡による確認）**。
    **①開催期間が約1年になっている原因**：代表コンテンツ（id=47
    「トークイベント 鈴木のぞみ×伊藤俊治」）の`dateExtraction.rawMatch`
    を直接確認したところ、"日時：5月20日（水）18:30～19:30
    【ギャラリートーク】...開催日時：①5月13日（水）18:30～19:00／
    ②5月24日（日）11"という、**複数の異なるギャラリートーク回の日時が
    並記されたテキスト**だった。抽出ロジックがこの中の最初の2つの日付
    トークン（5月20日・5月13日）を「開始日・終了日」のペアとして誤って
    採用し、5月13日が5月20日より前（＝年をまたぐ）と判定したため
    year-rollover処理が働き翌年（2027年）と誤認識——実際の展覧会の
    会期ではなく、無関係な複数セッションの日付を範囲として誤結合した
    ものと確認した。
    **②10件の統合が不適切であることの確認**：10件のタイトル・URLを
    個別に確認した結果、少なくとも5〜6件が明らかに無関係な内容だった
    ——中村萌「connect connect」本体（id=49）以外に、Ryu Itadani
    「Everyday Life "THERE"」という**別の作家の別展覧会**（id=51）、
    木村英輝の**別の展覧会**（id=56）、「開催中の企画展」という
    **一覧ページ自体**（id=46、`/exhibition/index.html`）、
    「ご来館のお客様へご協力のお願い」という**来館案内ページ**
    （id=54）、日本赤十字社への寄付報告という**展覧会と無関係な
    お知らせ**が2件（id=57, 58）、タイトルが文字通り「タイトル」という
    **プレースホルダー**のページ（id=55）が含まれていた。
    **根本原因を`normalizeTitleForClustering`のコードで特定**：
    サイト名サフィックス除去ロジック（`t.replace(/[／/｜|].*$/, '')`、
    「最初の／/｜|以降を全て切り捨てる」）は「タイトル／サイト名」という
    サイト名が後置される規約を前提にしているが、POLA MUSEUM ANNEXの
    タイトルは逆に「ポーラ ミュージアム アネックス｜実際のタイトル」と
    **サイト名が前置**される規約のため、全ページが最初の「｜」で
    切り捨てられ「ポーラ ミュージアム アネックス」という同一の短い
    文字列に正規化されてしまう。この結果、Tier
    3（フルタイトル類似度、完全一致で類似度1.0）が無関係な10件を
    まとめて誤結合した。`hasDateCorroboration`ガード（前回セッションで
    POLA MUSEUM ANNEXの別の誤結合を防ぐために導入済み）はこのケースを
    防げなかった——id=47自身が（誤抽出とはいえ）日付を持っていたため
    「どちらか一方に日付があればブロックしない」という緩い条件を
    通過してしまうため。2026-08-17の最初のStory Clustering実装セッションで
    「FOAM CONTEMPORARY」について記録した「サイト名前置規約での
    過剰ストリップ」という既知の制約が、今回実データ・大きな規模
    （10件統合）で実際に顕在化した具体例として確認された。
    **今回は実装変更を行っていない**（ユーザー指示により表示・確認のみに
    限定）。次回、`normalizeTitleForClustering`のサイト名サフィックス
    除去ロジックの修正（サイト名前置/後置いずれの規約にも対応できる
    設計、またはサイト固有設定での無効化）を検討する必要がある——
    この#1エントリはMaron Editor's Choiceでの承認対象として**現状のまま
    使うべきではない**。
  - 2026-08-17（ongoing/upcoming捕捉率改善：Event Date Extraction拡張＋
    site-specific adapter）: 直前の実運用テストでDaily候補が0件だった
    根本原因を実データで分析したうえで、①個別ページの安全な再確認
    （新規発見パイプラインとは独立、既存行の更新のみ）、②日付抽出ロジック
    の拡張（単日イベントラベル・タイトル隣接日付・ドット区切り日付形式）、
    ③site-specific adapter拡張フレームワーク、を実装した。
    **前段：story_clusters 290/287差の原因調査（推測せず実データで確認）**：
    ユーザー指示によりDB実数と集計ロジックを確認した結果、**287が正しい**
    （Daily Ranking・`./p2 articles`が使う`computeStoryClusters`の
    ライブ計算結果と完全一致）。290はstory_clustersテーブルの物理行数で、
    3件の孤立行（clusterKey: `1::街からのお知らせ`・
    `11::お土産処かおみせ`・`12::ポストカード`）を含んでいた。実データで
    追跡した結果、これら3件のコンテンツ自体は削除されておらず、
    Source Coverage拡張で新規発見された同名タイトルの別コンテンツと
    衝突検知ロジック（前々回セッションで実装済みのclusterKey衝突
    disambiguation）が働き、`::157`等のsuffix付き新clusterKeyへ正しく
    移行した結果、旧clusterKeyの行が「persistStoryClusters.tsが
    stale rowを自動削除しない」という既存の意図的な設計により孤立行として
    残っていたことを確認した——バグではなく、既知の設計どおりの挙動が
    実際に発生した実例。
    **原因分析（推測せず実データで分類）**：295件中、日付未取得の
    実態を`article_fetch_status`別に分類：①`not_fetched`139件
    （47%、複数回の巡回でStage 2予算上限に達し個別ページ取得自体が
    行われていない——最大の要因）、②`fetched`だが日付なし94件
    （32%）、③`fetch_error`7件。②の94件について実際に個別ページを
    再取得しHTML構造を分類した結果：ボイラープレート/常設施設案内ページ
    （売店・アクセス案内・株主優待等、構造的に日付を持たない）が多数、
    JSON-LD/metaタグは概ね存在しない、ラベル語（開催期間等）はあっても
    日付トークンが60文字ウィンドウ外にあるケースが12件、GINZA OFFICIALの
    告知タイトルに「8月1日（土）開催」のような日付が直接埋め込まれて
    いるが本文ラベルとしては抽出できないケースを複数件確認、
    SEIKO HOUSE GINZAのイベントページURLに日付が直接埋め込まれている
    （`/event/20260512.html`→2026-05-12）ことを実データで確認。
    **実装**：①`cms/src/lib/crawler/extractStructuredDates.ts`を拡張——
    (a) 新規ラベル群`EVENT_SINGLE_OR_RANGE_LABELS`（日時/開催日/開催概要）
    向けの`findLabeledEventDate`を追加：ラベル近傍に日付トークンが2つなら
    範囲、1つだけなら単日イベント（start=end）として扱う（0個ならnull、
    推測しない）。(b) `DATE_TOKEN`にドット区切り形式
    （`2026.8.5`）を追加。(c) `LABEL_WINDOW_CHARS`を60→100に拡大
    （実データで確認した「ラベルと日付の間に他項目が挟まる」ケースに
    対応、拡大しすぎない範囲に留めた）。(d) 新規Tier
    3b`findTitleAdjacentEventDate`：タイトル中の日付トークンに直接隣接
    （前方20文字以内）する「開催」を対象にする——「開催」という動詞への
    隣接自体を明示的な文脈手がかりとみなす、Tier 3の「ラベル必須」原則の
    延長として設計（confidence: 'low'、他のTierより低く設定）。
    ②`cms/src/lib/crawler/siteAdapters/`（新設ディレクトリ）——
    `types.ts`（`SiteDateAdapter`インターフェース、まだnullのフィールド
    のみ埋める設計）、`seikoHouseGinza.ts`（実データで確認した
    URLパス日付パターンのみを対象、confidence: 'low'、記事IDと日付の
    区別が構造的に保証できないことを踏まえた低信頼度設定）、
    `registry.ts`（SourceLedger.sourceIdをキーとするレジストリ、
    実データで確認できたサイトのみ追加——憶測でアダプタを増やさない
    方針を明記）。`fetchArticlePage.ts`にsourceId引数を追加し
    （`processDiscoveredLinks.ts`→`runCrawl.ts`まで配線）、Tier 1〜3bで
    見つからなかったフィールドのみアダプタで補完する設計にした。
    ③`cms/src/lib/curation/refreshDiscoveredContentDates.ts`
    （新設）＋`./p2 refresh-dates [--dry-run] [--limit=N]`（新設CLI）——
    新規発見パイプライン（runCrawl.ts/processDiscoveredLinks.ts）とは
    独立に、日付未取得の既存DiscoveredContent行だけを対象に個別ページを
    安全に再確認する。**新規行は一切作成しない**（既存idのみ
    `payload.update`）。discoveryStatus・lastChangedAt・linkFingerprint・
    curationStatusはここでは一切変更しない（ページ内容の再確認であって
    「新規発見/更新検知」ではないため——この2つを混同すると「本日new/
    updated」の意味が壊れる）。
    **発見・修正した副次的なバグ（discoveredContentSummary.ts）**：
    ongoing/upcoming/ended/unknownの4分類が総数と一致しない
    （23+23+31+241=318≠295）ことに気づき調査した結果、`deriveEventStatus`
    が独自に返す'upcoming'（開始日が未来と確定できるが14日超先も含む
    全体）が、if/else-ifの分岐漏れにより誤って`unknownEventStatusCount`
    に計上されていた実装ミスを発見・修正した。`upcomingCount`
    （deriveEventStatus基準、全体）と`upcomingSoonCount`
    （`isUpcomingSoon`基準、14日以内、Daily候補Dの母集団と一致）を
    分離し、4分類が相互排他的に総数と一致するよう修正した
    （修正後：23+26+31+215=295で一致確認済み）。
    **実データ検証結果（ローカルDocker/Postgres環境）**：
    `./p2 refresh-dates --limit=300`を実行し、対象240件（not_fetched
    139・fetch_error 7・fetched-but-no-date 94の合計）中209件の再取得に
    成功、87件で新たに日付フィールドが埋まった。取得元の内訳
    （event_start_atのsource別）：body_label 71件（新設の単日ラベル
    対応が主因）・json_ld 8件（未取得だった行が今回初めて取得できた分）・
    url_path 1件（SEIKO HOUSE GINZAアダプタが実際に機能）・
    title_label 1件（タイトル隣接抽出が実際に機能）。
    **改善前後の日付取得率**：いずれか1つでも取得済み 57件(19.3%)→
    **144件(48.8%)**。ongoing 0件→**23件**、upcoming（全体）0件→
    **26件**（うち近日開催14日以内23件）、ended 5件→31件、
    unknown 290件→215件。Story Cluster数は287件→269件に減少
    （新規の日付情報により、以前は日付なしで統合を見送っていた候補が
    正しく統合されるようになったため——精度向上に伴う自然な減少であり
    後退ではない、単独281→262・複数メンバー6→7・統合された重複
    14→33件）。**Daily候補プールは0件→37件**（Story Cluster単位）。
    Top10はPOLA MUSEUM ANNEXの常設展「connect connect」（開催中、
    関連10件統合）を筆頭に、GINZA SIX・銀座 蔦屋書店・GINZA OFFICIALの
    実際の開催中/近日開催コンテンツで構成された。
    **今回追加で判明した留意点（次回以降の検討事項）**：①
    story_clustersテーブルの孤立行（stale row）が3件→76件に増加した
    （269クラスタに対し345物理行）——今回の大規模な再クラスタリングにより
    多数のclusterKeyが変化した結果、既存の「stale rowを自動削除しない」
    設計の副作用が拡大した。Daily Ranking・`./p2 articles`はライブ計算
    （269件が正）を使うため運用上の実害はないが、管理画面でstory-clusters
    一覧を直接閲覧する場合は孤立行が混在して見える点に注意が必要。
    実データ削除は今回のスコープ外のため対応していない——次回、
    クリーンアップ処理（例：N日以上再計算で出現しないクラスタを削除）の
    要否を検討する余地として記録するに留める。②POLA MUSEUM ANNEXの
    「connect connect」クラスタの開催期間が2026-05-20〜2027-05-13と
    約1年間にわたる——関連10件の統合により`mergeDateRange`
    （Math.min(start)/Math.max(end)）で範囲が引き伸ばされた結果であり、
    常設・年間を通じたシリーズ展示である可能性が高いが、今回は実際の
    ページ内容までは深追いして確認していない。
    **検証・回帰確認**：`tsc --noEmit`（cms、0エラー）・`bash -n
    scripts/project02`・Python構文チェック、いずれも合格。DB直接確認で
    `refresh-dates`実行前後にdiscovered_content総数295件（不変、新規行
    なし）・discoveryStatus（全295件unchanged、再発見扱いになっていない）・
    curationStatus（全295件inbox、Editor's Choice未変更）を確認した。
    `./p2 doctor`・`./p2 editorial`（Sources 31件・Articles 8件、不変）・
    `./p2 social`（候補0件、不変）の回帰も確認し異常なし。検証後は
    `./p2 stop`で全ローカルサービスを安全に終了済み。**今回は行って
    いない**：Editor's Choiceの承認・変更、実データ削除（story_clusters
    孤立行76件を含め一切削除していない）、本番Railway・課金アカウント
    操作・権限設定・公開処理。
  - 2026-08-17（Source Coverage拡張：差分検知の再巡回検証・冪等性確認）:
    直前のSource Coverage拡張セッションで生成されたDaily候補17件が
    「一覧ページを初めて巡回したことによるBootstrap候補」である可能性を
    踏まえ、ユーザー指示により全く同じ条件（`./p2 crawl --budget=200`）で
    2回目の巡回を実行し、差分検知が正しく機能する（＝2回目は本物の変化が
    ない限りnew/updated 0件になる）ことを実データで検証した。コード変更は
    一切行っていない（検証のみのセッション）。
    **検証手順**：①巡回前にDB件数（discovered_content 295・
    story_clusters 290・sources 31等）と、前回first_seenだった17件
    （id 279〜295、全て歌舞伎座）のdiscoveryStatus/lastChangedAtを記録。
    ②前回と全く同じコマンドで再巡回。③discoveryStatus内訳・DB件数・
    Story Cluster数を再確認。④`./p2 clusters`でStory Clustering再計算。
    ⑤`./p2 daily`でDaily候補プールを再確認。
    **結果（全項目で期待どおりの冪等性を確認）**：①前回の17件は全件
    `discoveryStatus: unchanged`に正しく遷移し、`lastChangedAt`も
    前回巡回時のタイムスタンプのまま変化なし（＝2回目の巡回でfirst_seen/
    changedとして重複生成されなかったことを1件ずつID指定で確認）。
    ②個別記事・イベント抽出は294件走査・初回検知0/更新検知0/変化なし294、
    Stage 2試行0件（新規/更新が無いため実ページ再取得も発生せず、コスト
    制御が正しく機能）。③DiscoveredContent総数は295件のまま完全に不変
    （重複行が一切作られていないことをDB件数で確認）。④Story Cluster数も
    287件（単独281・複数メンバー6・統合14）で前回と完全一致、
    `persistStoryClusters`の新規作成は0件・更新287件（全クラスタが
    既存のclusterKeyと一致し上書き更新のみ、増殖なし）。DB行数も290件
    （前回同様、単独baseKeyが複数グループに分裂した際の既知の孤立行3件を
    含む、既存の「stale rowは自動削除しない」設計どおり変化なし）。
    ⑤Daily候補プールは**0件**（new/updated/ongoing/upcomingいずれも
    0件——本日2回目の巡回では新規・更新・開催中・近日開催のいずれの
    条件も満たすコンテンツが存在しなかったための、正直な結果）。
    **総括**：今回新規発見件数0件・updated件数0件・重複抑止件数294件
    （＝前回発見済みの294件全てが正しくunchangedとして重複生成を
    抑止された）・DiscoveredContent総数295件（不変）・Story Cluster総数
    287件（不変）・Daily候補数0件。差分検知ロジック（linkFingerprintに
    基づくfirst_seen/changed/unchanged判定、Story Clusteringの
    clusterKeyベースのfind-or-create、Daily RankingのlastChangedAt＋
    discoveryStatusに基づく母集団選定）が実データで期待どおり冪等に
    動作することを確認した。
    **検証・回帰確認**：`./p2 doctor`・`./p2 editorial`（Sources 31件・
    Articles 8件、不変）・`./p2 social`（候補0件、不変）の回帰も確認し
    異常なし。DB直接確認でcuration_status（全295件inbox）・
    editorial_editorial_status（全31件inbox）とも前回から変化なし
    （Editor's Choice承認は今回も一切実施していない）。
    source_snapshots は196件→210件（+14、今回巡回分の実行ログとして
    正しく追記、これは意図した追記式ログのため増加して当然）。検証後は
    `./p2 stop`で全ローカルサービスを安全に終了済み。**今回は行って
    いない**：Editor's Choiceの承認・変更、実データ削除（前回セッションの
    StoryClusters孤立行3件も含め一切削除していない）、本番Railway・
    課金アカウント操作・権限設定・公開処理、コード変更（今回は検証のみ）。
  - 2026-08-17（Source Coverage拡張：一覧ページ発見・追加巡回）: 直前の
    実運用テストでDaily候補が0件だった原因（個別記事・イベントをトップ
    ページ上のリンクからしか発見できておらず、一覧ページ配下の個別記事が
    構造的に取得漏れになっていた）を踏まえ、ユーザー指示により各サイトの
    NEWS/EVENT/EXHIBITION/TOPICS/WHAT'S ON/INFORMATION/PRESS/CALENDAR・
    お知らせ/イベント/展覧会/催事/新着情報という「一覧ページ」を自動発見・
    追加巡回する機能を実装した。既存のSOURCE LEDGER、DiscoveredContent、
    Story Cluster、Editorial Score、Audience Tags、Daily Editorial Deskの
    スキーマ・ロジックは変更せず、非破壊的な拡張として追加した。
    **実装**：①`cms/src/lib/crawler/discoverListingPages.ts`（新設）——
    トップページHTML上のリンクを、URLパスセグメント・アンカーテキストの
    両方でキーワード照合し（日付を含むパスは個別記事とみなし除外）、
    一覧ページ候補（url/anchorText/matchedKeyword）を最大8件返す純粋関数。
    サイト固有ハードコードなし。②`cms/src/lib/crawler/
    fetchListingPage.ts`（新設）——一覧ページの実HTTP取得。
    fetchArticlePage.ts（Stage 2）と意図的に別実装にした（既存の巡回・
    個別記事取得ロジックに一切手を入れないための安全側の設計、既存の
    複製方針を踏襲）。取得したHTMLに対しては`extractGinzaRelevantLinks`
    （トップページと全く同じ抽出ロジック）を再利用し、個別記事・イベント
    リンクを得る——一覧ページ向けの重複実装はしていない。③`cms/src/lib/
    crawler/mergeDiscoveredLinks.ts`（新設）——トップページ由来・複数の
    一覧ページ由来のリンクを、既に正規化済み（normalizeUrl.ts）のURLで
    重複除去し1つに統合する。同一記事がトップページと一覧ページの両方から
    見つかっても、DiscoveredContentには1行しか作られない（canonical/
    normalized URLを重複判定キーとする既存設計を変更せず、そのまま活用）。
    ④`cms/src/lib/crawler/fetchSource.ts`——`FetchOutcome`に
    `listingPageCandidates`フィールドを追加（既存の`links`/
    `linksDuplicatesRemoved`追加と同じ非破壊パターン）。トップページ取得
    成功時、同一HTMLに対し`discoverListingPageCandidates`も実行し、
    追加のHTTP取得なしで一覧ページ候補を得る。⑤`cms/src/lib/crawler/
    runCrawl.ts`——トップページ取得成功後、自動発見済み候補と
    `SourceLedger.listingPageOverrides`（サイト固有の手動override、
    後述）を合算・重複除去し、1サイトあたりの予算
    （`listingPagesPerSiteBudget`、既定3件、コスト制御）まで実際に
    一覧ページを取得、そこから得た個別記事・イベントリンクをトップページ
    由来のリンクと統合してから既存の`processDiscoveredLinks`（Stage 1/2）
    へ渡す——既存のStage 1/2ロジック自体は1行も変更していない。新規の
    集計`ListingPageDiscoveryStats`（対象サイト数・一覧ページを発見できた
    サイト数・発見した一覧ページ候補数・実取得試行/成功数）を`CrawlResult`
    に追加。⑥`SourceLedger.ts`に`listingPageOverrides`（サイト固有の
    手動一覧ページURL、拡張ポイント、自動発見への追加分として合算）と
    `discoveredListingPages`（直近巡回で自動発見された候補、readOnly、
    監査用）の2フィールドを追加（非破壊的スキーマ追加）。⑦`venue`
    （会場名）を新規追加——`extractStructuredDates.ts`にJSON-LD
    `Event.location.name`からの抽出のみを実装（日付と同じ「推測しない」
    原則を適用、本文からの推測はしない）、`DiscoveredContent.venue`
    フィールド（非破壊的追加）へ保存。⑧CLI：`./p2 crawl`に`--budget=N`
    （Stage 2予算の既定20を上書き、検証用。日次cronは既定値のまま
    影響なし）を追加、`format_crawl_status.py`に一覧ページ発見・追加巡回の
    集計表示を追加。
    **実データ検証で発見・修正した重大バグ**：実運用テスト中、一覧ページが
    PDF（IR資料・ニュースリリース）やPNG（イベントフライヤー画像）へ
    直接リンクしているケースが複数サイト（歌舞伎座・資生堂ギャラリー・
    Sony Park・SEIKO HOUSE GINZA）で見つかり、これをHTMLとして
    UTF-8デコードしようとした結果、不正なバイト列がPostgresへの
    DiscoveredContent書き込みで例外を発生させた。この例外が
    `processDiscoveredLinks`のループ全体を中断させ、上位の`runCrawl.ts`の
    try/catchまで伝播した結果、**トップページ取得自体は成功していた
    4サイトが誤って`fetch_error`として扱われ、summary集計が二重カウント
    される**（12 unchanged + 6 fetch_error = 18 > 対象14件、という
    矛盾した集計になっていたことで発覚）事故が発生した。**修正**：
    (1) `cms/src/lib/crawler/normalizeUrl.ts`に`isNonHtmlResourcePath`を
    新設し、既知の非HTML拡張子（.pdf/.png/.jpg/.jpeg/.gif/.svg/.webp/
    .zip/.doc(x)/.xls(x)/.ppt(x)/.mp4/.mp3/.csv）を持つURLを
    `extractLinks.ts`・`discoverListingPages.ts`の抽出段階で除外。
    (2) `fetchArticlePage.ts`・`fetchListingPage.ts`にレスポンスの
    Content-Typeガードを追加（`text/html`/`application/xhtml+xml`以外は
    非対象として即座に失敗扱い、拡張子フィルタで拾いきれないケースの
    二重防御）。(3) `processDiscoveredLinks.ts`を全面的にリファクタリング
    し、1件のリンク処理を独立した関数（`processOneLink`）に切り出したうえで
    呼び出し元のループを個別try/catchで分離した——1件の異常（想定外の
    バイナリ、DB書き込みエラー等）がサイト全体の処理を中断させない構造に
    し、新規`errors`カウントで可視化するようにした（このカウントは
    「サイト全体の失敗」ではなく「1リンク単位の失敗」を表す、既存の
    `fetch_error`とは独立した指標）。修正後、同一条件で再実行し
    エラー0件・summary集計の矛盾解消（12 unchanged + 2 fetch_error =
    14件で一致）を確認した。DB破損は発生していなかった（該当リンクの
    INSERT自体が失敗しトランザクションが成立しなかっただけで、それ以前に
    成功していたSnapshot保存・他のDiscoveredContent行には影響なし）が、
    バグ修正前に4サイトぶんの一覧ページ経由コンテンツの取り込みが今回の
    巡回では一部未完了のまま終わっていたため、修正後に同条件で再巡回し
    残りを正常に取り込んだ。
    **さらに発見した既知の限界（v1のヒューリスティックの限界として記録、
    緊急の追加修正はしていない）**：歌舞伎座の`/news_archive`・
    `/news_archives/annai`・`/news_archives/info`の3URLが、いずれも
    同一タイトル「最新情報 | 歌舞伎座」を持つ**個別記事ではなく
    カテゴリ別の一覧ページそのもの**であることが判明した——単純な
    パスキーワード・アンカーテキストベースの抽出ロジックでは、
    「個別記事」と「もう一段階深いカテゴリ別一覧ページ」を完全には
    区別できない（ページ内のリンク密度等を見るより高度な判定が必要）。
    日付・引用符いずれの裏付けもないため2026-08-17の前回セッションで
    導入した`hasDateCorroboration`によりStory Clusteringでは統合されず、
    Daily Top10に3件（もしくはそれ以上）別々に現れる形で実害が見える化
    した。次回以降、実データ量が増えた際に再検討が必要な既知の制約として
    残す（詳細・該当URLは本セッションの実行ログ参照）。
    **実データ検証結果（2026-08-17午後、ローカルDocker/Postgres環境、
    実HTTP巡回・実Claude採点）**：①一覧ページ発見：対象14サイト中
    11サイトで1件以上の一覧ページ候補を発見（合計74件、うち予算内で
    実際に取得したのは31件・成功25件）。②個別記事・イベント抽出：
    DiscoveredContent総数が160件→295件（135件純増、うち一部は前回の
    バグにより中断された巡回を今回のバグ修正後の再巡回で正常に取り込んだ
    分を含む）。公開日/開催期間いずれか1つでも取得済みは16件（10.0%）→
    57件（19.3%）に改善。開催期間（eventStartAt/eventEndAt）取得済みは
    1件→5件に増加（いずれも中央区観光協会の実イベント、実データで
    確認済み）。ただし5件全て現在時刻〈2026-08-17〉基準では終了済み
    （ended）のため、ongoing/upcomingは引き続き0件——「一覧ページ発見に
    よるカバレッジ拡大」自体は機能したが、「ちょうど今開催中/近日開催の
    イベント」が現在の巡回対象14サイトのデータに実在しなかったことによる
    正直な結果であり、作為的に0件を埋める操作は行っていない。
    ③Story Clustering：287クラスタ（単独281・複数メンバー6・統合された
    重複14件）。④Editorial Score/Audience Tags：新規135件を含む
    DiscoveredContent全295件を実際のClaude APIで採点（`scoringMethod:
    'claude'`、エラー0件、`./p2 score-articles`をバッチ制限〈内部上限
    50件〉に応じて複数回実行）。⑤Daily Editorial Desk：**候補プールが
    0件→17件（Story Cluster単位）に到達**——全17件が歌舞伎座
    （本日はじめて一覧ページ経由で発見したため`discoveryStatus:
    first_seen`、displayStatus: new）。Top10は「1階お土産処「木挽町」の
    おすすめ品」（59点）を筆頭に、歌舞伎座の売店・催事・最新情報系
    コンテンツで占められた。**重要な留意点**：今回の「本日新規検知」は
    厳密には「本日はじめて我々のシステムが発見した」という意味であり、
    実世界での本当の公開日を表すものではない——新しいサイト・新しい
    一覧ページを初めて巡回する際に構造的に発生する「初回ブートストラップ
    効果」であり、次回以降の巡回では同じページは`unchanged`となるため
    自然に解消される（バグではないが、Top10の解釈上マロンに正直に
    伝えるべき前提条件として記録）。
    **検証・回帰確認**：`tsc --noEmit`（cms、0エラー）・`bash -n
    scripts/project02`（構文チェック）。CMS再起動時に新規列・テーブル
    （`discovered_content.venue`、`source_ledger.discovered_listing_pages`・
    `source_ledger_listing_page_overrides`）が対話プロンプトなしで自動
    作成され、既存データ（Sources 31・Articles 8・SocialPosts 0・
    SourceLedger 14）が無傷であることを確認。`./p2 doctor`・
    `./p2 editorial`・`./p2 social`・`./p2 sources`・`./p2 jobs`の回帰も
    確認し異常なし（Sources 31件・Articles 8件・SocialPosts 0件、
    いずれも投入前と完全一致）。DB直接確認で全295件のDiscoveredContentが
    `curationStatus: inbox`のまま（Editor's Choice承認は一切実施して
    いない）、全31件のSourcesが`editorialStatus: inbox`のまま
    （同様に未承認）であることを確認した。検証後は`./p2 stop`で全
    ローカルサービスを安全に終了済み。**今回は行っていない・意図的に
    スコープ外**：①Editor's Choiceの承認・変更（Sources/
    DiscoveredContentいずれのcurationStatus/editorialStatusも変更して
    いない）。②実データ削除——バグ修正前に一部作成された
    DiscoveredContent行も含め、何も削除していない（StoryClustersの
    孤立行3件も既存の「stale rowは自動削除しない」設計方針どおり削除
    せず残置）。③本番Railway・課金アカウント操作・権限設定・公開処理は
    いずれも一切行っていない（実行したのはAnthropic APIへの採点呼び出し
    のみで、これはユーザーの明示的指示範囲内）。④「同一タイトルの
    カテゴリ別一覧ページ」問題への追加のロジック改善は今回のスコープ外
    とし、既知の限界として記録するに留めた。
  - 2026-08-17（Daily Editorial Desk 実運用テスト、2026-08-17午後実施）:
    直前の意思決定（Event Date Extraction／Story Clustering実装）で完成した
    パイプライン全体を、ユーザー指示によりSOURCE LEDGER巡回から
    Daily Rankingまで実際に通しで実行する実運用テストを行った
    （2026-08-17 13:30 JST、システム時計そのままで実施——時刻の
    オーバーライドは行っていない）。**実行順序**：①`./p2 crawl`
    （実HTTP巡回、14サイト対象）→②`./p2 score`（Sources新規候補の
    実Claude採点）→③`./p2 score-articles`（DiscoveredContent新規候補の
    実Claude採点、対象0件のため呼び出しなし）→④`./p2 clusters`
    （Story Clustering再計算・StoryClustersへ反映）→⑤`./p2 daily`
    （Daily Editorial Desk）→⑥`./p2 ranking`（Sourcesの全体ランキング、
    Maronの判断材料として補助的に取得）。
    **①巡回結果**：14件中、変化あり1件（銀座 蔦屋書店）・変化なし11件・
    取得失敗2件（東京メトロHTTP 403、銀座三越fetch failed——いずれも
    2026-08-16に「実ブラウザへのなりすましをしない」方針のもとで
    解消不可能と確定済みの既知の制約、今回も同じ症状で新規異常ではない）。
    変化あり1件からSource候補が1件新規生成された（Source #49、
    冪等性ガードにより既存29件はスキップ）。個別記事・イベント抽出
    （Stage 1）は160件のリンクを再走査したが、初回検知・更新検知とも
    0件（全件discoveryStatus:unchanged）——トップページの変化は
    バナー等の周辺要素によるものでDiscoveredContent側の実質的な追加・
    更新は無かったことを意味する（バグではなく実際のサイト側の変化が
    その程度だったという結果）。DiscoveredContent総数は160件のまま不変。
    **②実Claude採点**：新規生成されたSource #49のみが未採点だったため
    対象1件、実際にAnthropic APIへ到達し成功（`scoringMethod: 'claude'`、
    合計34点、内訳NOW:10/GINZA:10/UX:8/STORY:3/DISCOVERY:3、DB直接確認で
    breakdown合計とtotalの一致を検証）。既存30件は採点済みのため
    再課金は発生していない（`./p2 score`の既定動作＝未採点のみ対象、
    今回`--force`は使用していない）。**③個別記事・イベント側の採点**：
    新規DiscoveredContentが0件だったため対象0件、実際のAPI呼び出しは
    一切発生していない（課金なし）。**④Story Clustering再計算**：
    DiscoveredContent自体に変化が無かったため、クラスタ構成
    （156クラスタ＝153単独＋3複数メンバー＋7統合、直前の意思決定と
    完全一致）に変化はなく、156件全件のlastComputedAtのみ更新された
    （新規作成0件）。**⑤Daily Editorial Desk（2026-08-17 13:30 JST
    時点の実結果）**：Daily候補プールは**0件**——これはバグではなく
    正しい結果。理由は2点：(a)本日の巡回でdiscoveryStatusが
    first_seen/changedになった個別コンテンツが0件（トップページの
    変化が個別記事・イベントの追加/更新には至らなかったため）、
    (b)DiscoveredContent 160件中、開催期間（eventStartAt/eventEndAt）が
    判明しているのは依然として1件のみ（id=29、2026-07-25〜26の
    中央区観光協会イベント）で、これは現在時刻（2026-08-17）基準では
    既にended（終了済み）——ongoing/upcomingいずれにも該当しない。
    Top10として提示できる内容が無いこと自体が、現在のデータセットの
    実態（個別記事・イベント160件のうち構造化された開催日付を持つのは
    0.6%＝1件のみ）を正直に反映した結果であり、今回この状態を
    人為的に埋める・別の定義にすり替える等の操作は行っていない。
    **参考情報としてMaronへ提示**：Daily（Story Cluster単位）はゼロ件
    だったため、判断材料としてSources（サイト単位のInbox候補）の
    全体ランキング（`./p2 ranking`、31件全件採点済み・未採点0件）を
    別途取得し提示した——歌舞伎座（Source #41・#29、66点・65点）・
    SHISEIDO GALLERY（#40・#48・#27）が上位、新規生成されたSource #49
    （銀座 蔦屋書店）は34点で#20。これはDaily Editorial Deskの代替では
    なく、あくまで「今回Dailyが空だった際の補助的な状況提示」という
    位置づけ。**検証・回帰確認**：`./p2 doctor`異常なし。DB直接確認で
    sources 30→31件（+1、Source #49のみ、新規Source生成の設計どおり）・
    articles 8件（不変）・social_posts 0件（不変）・source_ledger 14件
    （不変）・discovered_content 160件（不変）・story_clusters 156件
    （件数不変、内容は再計算で更新）・source_snapshots 154→168件
    （+14、本日巡回14サイト分、想定どおり）を確認した。**今回は
    行っていない**：Editor's Choiceの承認・変更（Sources/
    DiscoveredContentいずれのcurationStatus/editorialStatusも今回一切
    変更していない）、本番Railway設定、課金アカウント操作・権限設定、
    公開処理（Articlesの`reviewStatus`等は無変更）。検証後は`./p2 stop`で
    全サービスを安全に終了済み。
  - 2026-08-17（Event Date Extraction／Story Clustering実装）: 直前の
    意思決定（`./p2 daily`実データ検証、Editorial Score/Audience Tags
    実AI採点完了）を踏まえ、ユーザー指示により①イベント日付抽出の精度
    向上、②同一イベント・企画の複数URLがDaily Top10を占有しないための
    Story Clusteringの2点を実装した。既存のSOURCE LEDGER、
    DiscoveredContent、Editorial Score、Audience Tags、Editor's Choiceの
    仕組みは一切変更していない。Editor's Choiceの承認・変更、実データ削除、
    本番Railway設定、課金・権限変更はいずれも行っていない。
    **①Event Date Extraction**：`cms/src/lib/crawler/
    extractStructuredDates.ts`を全面書き換えし、publishedAt/updatedAt/
    eventStartAt/eventEndAtそれぞれについて3段階の優先順位
    （1. JSON-LD/schema.org、2. meta/timeタグ、3. 個別ページ本文中の
    明示的なラベル付き日付表現——「開催期間」「会期」「イベント期間」
    「催事期間」「開催日程」等のラベルから60文字以内の範囲を探索する
    新設Tier 3）で抽出し、値だけでなく抽出元（source）・信頼度
    （confidence：high/medium）・Tier 3の場合は根拠となった生テキスト
    （rawMatch）を`DateFieldResult`として保持する設計にした
    （「推測しない」「他記事の日付と混同しない」というユーザー指示を
    踏まえ、確信が持てない場合はnullのまま——未確定を未確定のまま保持する）。
    DiscoveredContentに読み取り専用の新フィールド`dateExtraction`
    （json型、フィールドごとのsource/confidence/rawMatchを保持）を追加した
    （非破壊的なスキーマ追加のみ）。あわせて`cms/src/lib/curation/
    eventStatus.ts`を新設し、`deriveEventStatus`（ongoing/upcoming/ended/
    unknown、部分的な日付情報からしか判定できない場合は無理に
    upcoming/endedと断定せずunknownに倒す設計）と`isUpcomingSoon`
    （既定14日以内、コード内コメントで「固定された正解ではなく編集判断上の
    既定値」と明記）を実装した。**実データでの検証**：実際にStage 2
    フェッチ済みの20件へ改善版extractorを再適用するバックフィル
    （使い捝てスクリプト、実行後削除）で0エラーを確認し、さらに
    中央区観光協会の実ページ（`chuo-kanko.or.jp/blogs/event/2607031729`）を
    対象に実際にフェッチ・保存させたところ、Tier 3（body_label）で
    `eventStartAt: 2026-07-25`／`eventEndAt: 2026-07-26`
    （rawMatch："開催期間 2026年07月25日(土) 〜2026年07月26日(日) ..."）が
    正しく抽出・永続化されることを実データで確認した（DiscoveredContent
    id=29）。
    **②Story Clustering**：`cms/src/lib/curation/storyClustering.ts`を
    新設。フルNLP・外部ライブラリは使わず、(a)同一サイト（sourceSiteId）
    内でのみ探索、(b)「」『』引用スパンの完全一致、(c)引用スパン同士の
    bigram類似度、(d)フルタイトルのbigram類似度（10文字未満の汎用
    ボイラープレートタイトルは対象外とするガード付き）、(e)開催日程が
    両者に判明している場合のみ重なり・近接を判定材料に加える（片方でも
    不明なら日付を理由にブロックしない＝「推測しない」原則の延長）、を
    段階的に組み合わせる決定的（同一入力に対し常に同じ結果を返す）な
    グリーディ1パスアルゴリズムとして実装した。管理画面からの閲覧性の
    ために`StoryClusters`コレクション（`story-clusters`、
    representativeContent/relatedContentsのrelationship、承認フック等の
    人間ゲートは持たない——編集判断ではなく機械的な導出結果のため）と
    `persistStoryClusters.ts`（`./p2 clusters [--dry-run]`から呼ばれる、
    毎回DiscoveredContent全件から完全再計算しclusterKeyでfind-or-create）
    を新設した。Daily Ranking（`dailyRanking.ts`）はこの永続化結果には
    依存せず、都度`computeStoryClusters`を直接呼んで鮮度を保つ設計にした。
    **実データ検証で発見・修正した2件の不具合（ユーザー要求どおり
    「ローカルテストまで」実施して判明したもの、仕様通りの実装だけでは
    気づけなかった）**：(1) ユーザーが実例として挙げた資生堂ギャラリー
    「うたう仲條 おどる仲條」の3URL（開始告知・トークイベント告知・
    別URL）が、引用符内のダッシュ文字表記ゆれ（全角ハイフン"－"と
    水平線"―"）だけで完全一致に失敗し、フルタイトル類似度フォールバックも
    周辺ノイズテキストで閾値未満となり、クラスタリングされない事象を発見。
    引用スパン同士を直接比較する第2の判定ティアを追加して解決し、3件が
    正しく1つのStory Clusterにまとまることを確認した。(2)
    POLA MUSEUM ANNEXの3件（`m-annex/event/202110.html`／
    `20230629.html`／`20231110.html`、明らかに別年・別イベント）が、
    ボイラープレートの同一タイトル「イベント情報を更新いたしました。」
    （日付・引用符いずれの裏付けもなし）だけでtier 3の類似度1.0（完全
    一致）となり誤クラスタリングされる事象を発見。tier
    3のフルタイトル一致には最低限どちらか一方に実際の開催日情報がある
    ことを追加で要求する`hasDateCorroboration`を導入して解決した
    （タイトル文字列だけでは区別できない汎用告知文は、日付等の裏付けが
    ない限りクラスタリングしない＝precisionを優先する設計判断）。
    **さらに副次的に発見・修正した設計上の不具合**：上記(2)の修正により
    「同一タイトル文字列だが別グループ」という状態が意図的に発生する
    ようになったため、`clusterKey`を`sourceSiteId::タイトル文字列`のみで
    生成する従来設計だと、別々のグループが同一clusterKeyに衝突し、
    `persistStoryClusters`のfindOrCreateが後発グループのデータで先発
    グループのDBレコードを無言で上書きしてしまう不具合を発見した
    （Daily Ranking側はグループ配列を直接使うため実害はなかったが、
    StoryClusters永続化ビューは壊れていた）。同一baseKeyが複数グループに
    現れる場合のみ、各グループの最小memberId（決定的・再計算しても安定）を
    suffixとして付与し一意性を確保する修正を行った。加えて、この不具合の
    影響で作成された衝突済みの古いレコード6件（本セッション内で自分の
    バグにより作られた検証用の中間生成物であり、編集判断を経た実データでは
    ない）をLocal API経由で削除し、DBを正しい状態（156クラスタ＝156行）に
    修復した。もう1件、`discoveredContentSummary.ts`の
    `todayNewOrChangedCount`が`lastChangedAt`が本日であることだけを見て
    `discoveryStatus`（first_seen/changed）を見ていなかったため、
    `./p2 articles`が「本日新規/更新候補: 160件」（実際には全件
    discoveryStatus='unchanged'）という`./p2 daily`（0件、正しい）と
    矛盾する数値を表示していた不整合も発見・修正した（`dailyRanking.ts`の
    判定ロジックと完全に一致させた）。
    **Daily Ranking（`dailyRanking.ts`）の拡張**：ランキング単位を個別
    DiscoveredContentからStory Cluster単位に変更し、クラスタ内の
    いずれかのメンバーが「本日新規/更新検知（lastChangedAtが本日かつ
    discoveryStatusがfirst_seen/changed）」「現在開催中
    （deriveEventStatus）」「近日開催（isUpcomingSoon）」のいずれかを
    満たせばそのStory全体を候補に含める設計にした。表示用ステータスは
    優先度 ongoing > upcoming > new > updated > unchangedで解決する。
    **最終検証結果**（ローカルDocker/Postgres環境、実データ）：
    DiscoveredContent総数160件（不変）、日付いずれか1つでも取得済み16件
    （10.0%、うちpublishedAt 14件・eventStartAt/EndAt 1件）、
    ongoing 0件・upcoming 0件・ended 1件・unknown 159件（2026-08-17現在
    時刻基準、実データに含まれる唯一の実イベント日付は2026-07-25〜26で
    既に終了済みのため）、Story Cluster数156件（単独153件・複数メンバー
    3件・統合された重複コンテンツ7件——うたう仲條3件・Plastic Revives 2件・
    this is not a samurai 2件、いずれも実データ目視で正当な同一企画と
    確認済み）、`./p2 daily`実行時のDaily候補プールは0件（本日クロール
    なし・現在時刻基準でongoing/upcomingいずれも該当なしのため、これは
    バグではなく正しい結果）。`now`を2026-07-25にオーバーライドした
    使い捨て検証スクリプト（実行後削除）で、唯一の実イベントデータが
    正しくDaily候補プールに入り（displayStatus: ongoing、
    inclusionReasons: [ongoing, upcoming_soon]）、`format_daily_desk_status.py`
    がRank・Editorial Score・Story title・Venue・開催期間・状態・
    Audience Tags・代表URL・選定理由をすべて正しく表示することも確認した
    （関連コンテンツ件数の注記ロジックもコード上確認済み、実データでは
    複数メンバークラスタが本日時点でDaily候補に入らなかったため表示自体は
    未検証）。`tsc --noEmit`（cms、0エラー）。回帰確認：`./p2 doctor`・
    `./p2 editorial`（Sources 30件・Articles 8件、不変）・`./p2 social`
    （候補0件、不変）・`./p2 sources`（Core Source 14件、不変）・
    `./p2 jobs`（累計完了1回、不変）、DB直接確認（sources 30・articles 8・
    social_posts 0・source_ledger 14・source_snapshots 154、いずれも
    投入前と完全一致）。使い捨て検証スクリプト（`_tmpTestDateExtraction.ts`・
    `_tmpBackfillDates.ts`・`_tmpFetchOne.ts`・`_tmpInspectClusters.ts`・
    `_tmpCheckKeyCollisions.ts`・`_tmpCleanupOrphans.ts`・
    `_tmpTestDailyDisplay.ts`）はすべて使用後に削除済み。検証後は
    `./p2 stop`で全ローカルサービスを安全に終了予定。本番Railway・
    秘密情報・課金操作・Git push・Editor's Choiceの承認/変更はいずれも
    一切行っていない。
    **未決事項として残したもの**：(a)
    「${formatDate(startdate)} ～ ${formatDate(enddate)} ${eachPage.Title}」
    のような、テンプレート変数が壊れたまま出力されているページが2件存在し
    同一の壊れ方をしていたため今回の修正後もクラスタリング対象外
    （単独クラスタ）のまま残っている——発信元サイト側のページ生成バグが
    原因と推測されるが、今回は深追いしていない。(b) GO TOKYOの月次
    おすすめ記事（8月/9月号等）のように「同一シリーズだが月ごとに内容は
    別」なコンテンツをStoryとして束ねるべきかどうかは、今回の実データでは
    該当ケースが混入しなかったため実地未検証のまま。(c)
    `MIN_TITLE_LENGTH_FOR_FUZZY_MATCH`（10文字）・
    `TITLE_SIMILARITY_THRESHOLD`（0.5）・`UPCOMING_WINDOW_DAYS`（14日）は
    いずれも実データ観察に基づく初期値であり、コンテンツ量が増えた際に
    再調整が必要になる可能性がある。(d)
    `persistStoryClusters.ts`は「clusterKeyが再計算で二度と出現しなくなった
    行を自動削除しない」設計のまま（意図的な既知の制約、コード内コメントに
    明記済み）——将来的なクリーンアップ処理の要否は未検討。
