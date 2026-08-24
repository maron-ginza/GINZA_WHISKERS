# TNS（Tokyo Nostalgic Soundtrack）自動制作フロー v1.1

Project 02「AI GINZA EDITORIAL DESK」における週次シリーズフォーマット
「Tokyo Nostalgic Soundtrack」の制作フロー仕様書。2026-08-21、正式反映
した。`CLAUDE.md`第3章（コンテンツ・機能スコープ）・第8章（AI活用
ポリシー、読者接続の編集ロジック／Music Provenance）の下で、
`CHARACTER_STANDARD.md`・`VISUAL_ASSET_LIBRARY.md`と並ぶ正式参照
ドキュメントとして位置づける。

**確定日**：2026-08-21（同日、制作フロー確定→TNS Payload v1.0の
データ設計・Human/AI責任分界の確定→Dry Run検証→TNS Music Selection
Logicの確定→**公開済み#32・#33・#34の3週比較→Payload v1.1への改訂**、
の順で進めた）
**今回の作業範囲**：制作フロー・原則・**TNS Payload v1.1**のデータ設計
（§6）・Human/AI責任分界・TNS Music Selection Logic（§3.1）・
**Adaptive Music Balance（§3.2）**の確定まで。**実コード実装・
Payloadスキーマの実装・外部天気APIの導入・実際の選曲やキャラクター
画像の生成、既存`_media_pipeline`・既存データへの変更はいずれも
行っていない。**
**v1.0からの主な変更点**：公開済み3週（#32〜#34）の事実比較により、
①`dailyScenes`の実在イベント非依存を強化、②TNS Editorial Codeを
`fixedMoodLabel`／`weeklyEnglishSubtitle`の2層構造へ整理、
③`selectionReason`を`internalReason`／`readerFacingComment`へ分離、
④`hook`／`afterglow`／`editorialPointOfView`を正式フィールド化、
⑤邦楽/洋楽比率を固定値ではなくAdaptive Music Balance（過去実績を
参考にしつつhard constraintにしない設計）へ変更した。詳細な根拠は
`DECISION_LOG_02.md`の該当エントリを参照。

---

## 0. 位置づけ・既存資産との関係

TNSはProject 02のCLAUDE.md・spec群には今回まで一度も登場していなかった
が、`_media_pipeline/projects.json`には既に独立プロジェクトキーとして
存在していることを2026-08-21に確認した。

- `week_pattern`（`^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$`）による週次バッチ
  運用が既に前提とされている
- 配信先フォルダ構造として`00_Originals`／`01_Selected`／`02_Note`／
  `03_X`／`04_Instagram`が既に用意されている
- `README.md`に「挿絵はサブフォルダ名をCode名にする。例：`TNS/Code8/`」
  という例示があったが、2026-08-21の調査で**現行の`explicit_week`
  仕様には追随していない旧い記述**と判明（README.md側で修正済み、
  §4参照）。物理フォルダ名にCodeを使う設計は採用しない

本仕様は、この既存の物理ファイル管理（`_media_pipeline`）とは独立した
**コンテンツ・編集ロジック側の仕様**であり、両者の役割分担は以下の
とおりとする。

| レイヤー | 担当 |
|---|---|
| 生の写真・生成画像ファイルの整理・命名・重複防止 | `_media_pipeline`（既存、変更なし） |
| 週次テーマ・情景・本文・選曲・承認フローの管理 | 本仕様（Project 02 CMS側、今回の設計対象） |

**コンテンツスコープ上の位置づけ**：`CLAUDE.md`第3章が定める4本柱の
うち、主に1（長文記事）と4（AI支援SNS配信）を組み合わせた週次シリーズ
フォーマットとして扱う。4本柱の再定義は行わない。

---

## 1. 目的・基本方針

- 毎週ゼロから制作する方式をやめ、**AI 80％／マロン最終編集20％**を
  目標とする
- 「天気×銀座×昭和の曲」という単純な組み合わせから、**「天気×気分×
  生活テーマ×銀座での過ごし方×音楽」**という多層的な編集ロジックへ
  発展させる（`CLAUDE.md`第8章「読者接続の編集ロジック」と同じ考え方の
  TNS版適用）
- 情報量の多さではなく、「これは今週の自分のための一曲・一週間だ」と
  感じられる編集を重視する

---

## 2. 制作フロー（STEP1〜6）

### STEP 1: Fact

事実・確定情報を収集する段階。

| 項目 | 取得方法 |
|---|---|
| 週間天気 | **新規API契約・課金を発生させない**。人間（マロン）が確認・入力する運用値、または既存の無料・契約不要な情報源を使う（§5参照） |
| 曜日 | 決定的に計算（自動） |
| 季節 | 決定的に計算、`VISUAL_ASSET_LIBRARY.md`§2.3の季節区分を参考にできる（自動） |
| 銀座イベント | **既存のdailyRanking／StoryClusters／Temporal Relevance
  （NOW/SOON/NEXT判定）をそのまま再利用**。新規クローラは追加しない。
  **（v1.1）dailyScenesの主要入力ではなく補助情報に格下げ**——3週
  比較（#32〜#34）で実在の店舗・イベント名への言及が3週とも皆無
  だったため、§6.2参照 |
| 過去使用曲 | 新規`MusicUsageLedger`（§7）で重複管理（自動） |
| TNS Editorial Code | 週内のCode1〜7の割り当て。詳細は§4「TNS Editorial Code」を参照 |

### STEP 2: Emotion

Factから今週の心理・感情面を組み立てる段階。

- 今週の気分
- 曜日ごとの心理
- 季節感
- 生活テーマ

AIが下書き提案を行い、採用可否は人間（マロン）が判断する（主観的判断の
ため自動確定はしない）。

### STEP 3: Ginza Experience

銀座での過ごし方を体験動詞で整理する段階。

- 歩く／見る／食べる／聴く／休む／発見する

**既存の`uxType`分類（participate_workshop/exhibition_viewing/
food_drink/shopping_discovery/live_performance/other）とは粒度・軸が
異なり、単純な1対1対応ではない**（`VISUAL_ASSET_LIBRARY.md`§4が
Icon LibraryとuxTypeの関係について既に記した「単純な1対1対応ではない」
という注記と同じ論点）。マッピングの正式設計は実コード実装時に改めて
行う。

### STEP 4: Music

選曲を行う段階。

- 昭和歌謡／City Pop／洋楽／映画音楽等から適合曲を選定
- 過去使用曲との重複を`MusicUsageLedger`で管理

**Music Provenance原則（`CLAUDE.md`第8章と同一）**：
- 曲名・アーティスト名・編集的紹介（Editor's Noteに準ずる紹介文）を
  基本とする
- **歌詞全文・長文引用・音源埋め込みは自動生成対象にしない**
- Editorial Trust Layーの画像方針（外部素材の無断使用禁止・独自性の
  重視）と同じ発想を、音楽という別メディアに拡張したものと位置づける

### STEP 5: Story

週間ストーリーとしてまとめる段階。AIが下書きを生成し、既存の「AI下書き」
ステージ（`ARCHITECTURE_DRAFT.md`§2.2）と同型のプロセスとする。

- 週間テーマ
- **HOOK**（冒頭導入文、v1.1で正式フィールド化）
- 7日分の情景（各日に**editorialPointOfView**＝GINZA WHISKERSの視点を
  情景・選曲コメントへ埋め込む、独立したEditor's Choice欄は設けない）
- note本文
- **AFTERGLOW**（週を閉じる結び、v1.1で正式フィールド化。定型文の
  再利用か週固有の書き下ろしかはHuman Editorial裁量、§4・§8参照）
- 冒頭ビジュアル方針（`VISUAL_ASSET_LIBRARY.md`の世界観挿絵、および
  `CHARACTER_STANDARD.md`のCharacter Layer/Scene Layerを踏まえる）
- 各TNS Editorial Code画像指示（§4）
- X代表曲候補

### STEP 6: Human Editorial

マロンが最終選択・修正・承認する段階。**新規の承認ゲートは作らず、
既存の編集長レビュー→承認キュー（`ARCHITECTURE_DRAFT.md`§2.2・2.5）を
そのまま転用する。**

---

## 3. Music Provenance（詳細）

| 許可 | 不許可 |
|---|---|
| 曲名・アーティスト名の記載 | 歌詞全文の掲載 |
| 選曲理由の編集的紹介（Editor's Note相当） | 長文引用 |
| 楽曲の背景・時代性に関する客観的事実の要約 | 音源ファイルの埋め込み・配信 |

実際の著作権確認（JASRAC等の許諾状況、音源使用の可否）は本仕様のスコープ
外とし、上記の「紹介はするが音源・歌詞は扱わない」という原則自体で
リスクを回避する設計とした。

### 3.1 TNS Music Selection Logic（2026-08-21確定）

TNSで扱う音楽は「昭和歌謡」に限定せず、**「昭和浪漫の時代に銀座に
流れていた、または銀座の情景・空気に似合う音楽」**と定義する。対象は
日本の昭和歌謡・City Pop・日本映画音楽・Jazz・Standard・Oldies・
Pops・映画音楽・その他昭和期の銀座文化・都市文化と親和性の高い洋楽。
邦楽・洋楽を同じEditorial基準で評価し、単に「昭和の曲だから」という
理由だけでは選定しない。

**選曲は以下の順序で評価する**：

1. **Era Gate**：原則1926〜1989年に発表・流通した楽曲。1990年以降は
   通常候補から除外する。例外はHuman Editorialが明示承認した場合のみ。
   **（v1.1）1972〜1987年前後を過去実績上の参考中心帯とする**——
   #32〜#34の3週21曲すべてがこの範囲に収まっていたことが確認できた
   参考値であり、**hard constraintにはしない**（1926〜1989年の
   Era Gate自体は変更しない）
2. **Theme Fit**：週間テーマとの適合
3. **Emotion**：その日の感情・心理との適合
4. **Ginza Experience**：その日の銀座での過ごし方・体験との適合
5. **Ginza Affinity**：昭和期の銀座の都市文化・情景との親和性。
   「銀座で実際に流れていた」と事実主張する場合は出典必須。根拠が
   ない場合はcontextual affinityとして扱う
6. **Genre Diversity**：7曲全体のジャンル多様性を確認。同系統が過半数
   に偏る場合は警告する
7. **Japanese / International Balance**：**（v1.1で変更）** 固定比率
   ではなくAdaptive Music Balance（§3.2）を参照する。テーマ適合を
   優先し、Human Editorialで随時上書き可能

**Track候補の属性**：

| 属性 | 内容 |
|---|---|
| `releaseYear` | 発表年 |
| `eraEligibility` | `showa`（1926〜1989年内）／`exception`（Human Editorial明示承認による例外）／`out_of_scope`（対象外、候補から除外） |
| `origin` | `japanese` \| `international` |
| `genre` | 昭和歌謡／City Pop／日本映画音楽／Jazz／Standard／Oldies／Pops／映画音楽等 |
| `ginzaAffinity` | 昭和期の銀座の都市文化・情景との親和性の説明 |
| `ginzaAffinityEvidence` | `verified`（出典あり）／`contextual`（根拠不明・文脈的親和性）／`unknown` |
| `selectionReason` | 上記7段階評価を踏まえた選定理由 |

**検証実績**：2026-08-21、2026-08-17〜08-23（#34）を対象にDry Runで
本ロジックの実行可能性を検証済み（1990年以降0曲・邦楽4曲・洋楽3曲・
ジャンル6分散を達成）。さらに公開済み#32・#33・#34の3週を事実比較し、
本節の年代参考値（1972〜1987年）とEra Gate自体（1926〜1989年）の
妥当性を確認した。邦楽/洋楽比率については§3.2参照。詳細な比較根拠は
`DECISION_LOG_02.md`参照。

### 3.2 Adaptive Music Balance（2026-08-21確定）

**固定60/40（邦楽優勢）・固定43/57（洋楽優勢）のいずれも採用しない。**
公開済み#32・#33・#34の3週はいずれも「洋楽4曲：邦楽3曲」で完全一致
していたが、**3週というサンプル数では恒常ルールと断定するには不足
していると判断し**、比率を固定値としてハード反映することは保留した。

- **`musicBalancePolicy: 'adaptive'`**：比率は過去実績を参考にしつつ
  週テーマに応じて変動してよい、という運用方針
- **`historicalReferenceJapaneseRatio: 0.43`／
  `historicalReferenceInternationalRatio: 0.57`**：#32〜#34の3週実績
  から得た初期シード値。**選曲を制約するhard targetではなく、参考値
  （Editorial Target）として選曲プロンプトに渡すのみ**
- **Rolling Historical Ratio（将来拡張）**：公開済み
  （`status: published`）の直近`rollingWindowWeeks`（設定可能、
  4〜8週を想定）分の`SoundtrackEditions`から、実際の`origin`比率を
  都度算出する設計余地を残す。**新規の集計専用テーブルは作らず、
  既存`SoundtrackEditions`を必要時にqueryして計算する**
  （`themeHistoryCheck`と同じ「都度計算・保存しない」パターンを踏襲）。
  公開済みeditionが`minSampleSizeForRolling`（初期値4週）未満の間は
  `historicalReferenceJapaneseRatio`／`historicalReferenceInternationalRatio`
  をそのまま使用する
- **週次上書き**：`weeklyOverrideJapaneseRatio`／
  `weeklyOverrideInternationalRatio`により、週テーマの都合でHuman
  Editorialが比率を上書き可能とする（§6.2参照）
- いずれの値も**選曲そのものをブロックするhard constraintにはしない**
  ——これはEra Gate（§3.1項目1）とは異なり、当初から参考値としての
  位置づけを崩さない

---

## 4. TNS Editorial Code

TNSの週次シーン管理は、Project 02 CMS全体の汎用分類（`Tags`／
`pillars`／`uxType`等）とは**独立した別レイヤー**として定義する。

- **正式名称**：TNS Editorial Code（2026-08-21確定）
- **定義**：Tokyo Nostalgic Soundtrackにおける週次のScene Layer／編集
  コード。現在のCode1〜7を管理するTNS固有概念とする
- **表記ルール**：
  - TNS仕様内では「GINZA CODE」という名称を使用しない
  - 「Weekly Scene Code」は説明用の補助表現としてのみ使用可能（例：
    「週内の各シーンを指すWeekly Scene Codeとして機能する」のような
    説明文での併記は許容するが、データ項目名・見出しでは使用しない）
  - データ項目名・仕様書・見出しでは「TNS Editorial Code」に統一する
- **統合しない対象**：既存の`Tags`（6本柱＋自由タグ）、`uxType`
  （STEP3の体験動詞とも別軸）、DiscoveredContentの`venue`
- **物理保存とは分離する（2026-08-21確定・最重要原則）**：**TNS
  Editorial CodeはPayload側の編集メタデータとしてのみ管理し、
  物理フォルダ名・ファイルパスには一切使用しない。** 物理保存
  （`_media_pipeline`側）は`YYYY-MM-DD_MM-DD`等、既存の週・日付
  ベースの構造（`explicit_week`／`week_pattern`）をそのまま維持する。
  理由：①`_media_pipeline`の`week_pattern`／`explicit_week`という
  既存の物理フォルダ構造を変更しない、②Code1〜7をフォルダ名に使うと
  既存の週単位処理と衝突する可能性がある、③TNS Editorial Codeは
  「どこに保存するか」ではなく「その日のScene Layer／編集上の意味が
  何か」を表す概念であり、保存場所の識別子ではないため
- **曜日↔Codeの対応**：Monday→Code1、Tuesday→Code2、…、Sunday→Code7
  を初期値とするが、**この対応表自体は固定ロジックにハードコードせず、
  将来変更可能なデータ設計（設定値・マッピングテーブル）とする**
  （実装時の設計方針、§6.1参照）
- **2層構造（2026-08-21、3週比較により確定）**：公開済み#32・#33・
  #34を比較した結果、TNS Editorial Codeは単なる曜日連番ではなく、
  以下の2層構造を持つことが確認できた。
  1. **`fixedMoodLabel`**：Code1〜7それぞれに紐づく、週をまたいで
     概ね固定される短い気分ペアのラベル（例：Code1＝「リスタート／
     静かな決意」）。#32・#33間で7日中6日が完全一致または酷似して
     おり、特にCode5（金曜）は3週とも「夜が始まる」ニュアンス、
     Code7（日曜）は3週とも情景ラベルが「Soft-Cloud Ginza」で固定
     されていた。**初期値は#32〜#33実績から設定し、Human Editorialが
     上書き可能**とする
  2. **`weeklyEnglishSubtitle`**：週替わりで書き下ろされる英語の
     ナラティブ副題（例：#32のCode1＝「A New Discovery in Ginza」、
     #33のCode1＝「A Summer Stroll in Ginza」）。曲・情景描写ととも
     に毎週AIが生成し、Human Editorialが確認する
  - `fixedMoodLabel`は「型」、`weeklyEnglishSubtitle`はその型の上で
    毎週書き換わる「表現」——両者を混同しない
  - **留意点**：この2層構造は#32・#33の実績から強く裏付けられたが
    （7日中6日一致）、#34は本仕様の取得手法の限界により
    `fixedMoodLabel`の直接比較ができておらず「要再確認」のまま残る
    （詳細は`DECISION_LOG_02.md`参照）
- **Code8／Code9の扱い（2026-08-21確定）**：`_media_pipeline/
  README.md`の「Code8」は旧例示（現行の`explicit_week`仕様に追随
  していない過去の記述）として扱い、ログ上に見つかった「Code9」は
  別プロジェクト（05-2）のセッションによる過去の試験的設定の産物
  として扱う。**いずれも現行のTNS Editorial Code正式仕様（Code1〜7）
  には含めない。** 過去の履歴ログ（`_media_pipeline/logs/`）は削除
  しない
- **将来の統合余地**：Project 02 CMS全体で汎用的な場所・情景の分類
  体系が将来設計された場合に、TNS Editorial Codeから変換テーブルで
  対応づけられる余地は残すが、その分類体系の名称は現時点で未確定と
  する。**今回は統合を行わない、独立性を優先する**

---

## 5. 週間天気の扱い（2026-08-21確定）

- **Trial段階では新規有料API契約を前提にしない**（第13章「運用コスト
  方針」との整合を優先）
- **取得優先順位**：①AIによる既存手段（無料・契約不要な情報源）での
  自動取得 → ②取得できない場合のみマロンが手入力 → ③将来的な外部
  気象APIの導入（第13章の運用コスト方針に照らして別途意思決定）
- **`weatherSource`フィールド**：`ai_retrieved` / `manual` / `api`の
  3値を持たせ、実際にどの経路で取得したかを都度記録する。将来①→③へ
  切り替える場合も既存データ・スキーマ形状を変えずに移行できる設計
  とする（詳細は§6.2）
- ①の具体的な取得手段（どの無料情報源を使うか）は未確定のまま
  次工程に残す（§8）

---

## 6. TNS Payload v1.1（確定仕様、2026-08-21確定）

既存のPayloadコレクション（Articles/Sources/DiscoveredContent/
StoryClusters/SocialPosts/SourceLedger/SourceSnapshots/Tags/
ImageAssets）には**一切変更を加えない**前提での新規コレクション・
Global案。**AI 80％／Maron Human Editorial 20％**を目標とし、
Fact→Emotion→Life Context→Ginza Experience→Music→Storyの編集順序
（§2）をそのままデータ構造にも反映する。

### 6.1 `TNSSettings`（Payload Global、シングルトン設定）

| フィールド | 型・内容 |
|---|---|
| `weekdayCodeMapping` | 曜日→TNS Editorial Codeの対応表。初期値 Monday=Code1／Tuesday=Code2／Wednesday=Code3／Thursday=Code4／Friday=Code5／Saturday=Code6／Sunday=Code7。**コードへハードコードせず、管理画面から変更可能な設定データとして保持する** |
| `codeFixedMoodLabels[7]` | **（v1.1新規）** Code1〜7それぞれの`fixedMoodLabel`初期値（§4参照）。#32〜#33実績から設定し、管理画面から変更可能 |
| `musicBalancePolicy` | **（v1.1新規）** `'adaptive'`（固定値ではなく実績参考型、§3.2参照） |
| `historicalReferenceJapaneseRatio` | **（v1.1新規）** `0.43`（#32〜#34の3週実績、初期シード値） |
| `historicalReferenceInternationalRatio` | **（v1.1新規）** `0.57`（同上） |
| `rollingWindowWeeks` | **（v1.1新規）** rolling historical ratio算出に使う直近週数。初期値は4〜8の範囲で設定可能とする想定（具体値は実装時に確定） |
| `minSampleSizeForRolling` | **（v1.1新規）** 公開済みeditionがこの週数未満の間は`historicalReference*Ratio`を使用。初期値4 |

TNS Editorial Codeを個々のeditionではなくGlobal設定として1箇所に
持つことで、将来マッピングを変更する場合も全edition共通で一度に
切り替えられる。**TNS Editorial CodeはPayloadメタデータであり、
物理フォルダ名・ファイルパスには使用しない**（`_media_pipeline`の
既存`week_pattern`／`explicit_week`構造は無変更のまま維持、§4参照）。

### 6.2 `SoundtrackEditions`（週次エディション本体）

| グループ | フィールド | 必須／任意 | 担当 |
|---|---|---|---|
| edition | weekStart／weekEnd／editionNumber／status | 必須（自動） | A |
| context | season／musicHistoryCheck／themeHistoryCheck | 必須（自動） | A |
| context | weather { weekSummary, daily[7], **weatherSource**（`ai_retrieved`/`manual`/`api`） } | 必須（①AI取得→②manualフォールバック→③将来api） | A |
| context | ginzaEvents（**v1.1：主要入力ではなく補助参考情報に格下げ**、既存dailyRanking参照は維持するが`dailyScenes`生成の必須材料にはしない） | 任意（参考情報） | A |
| context | **maronWeeklyObservation**（「今週の銀座を一言でどう感じるか」） | **必須・週次唯一の手入力** | B |
| context | maronOptional { mustIncludeEvent, preferredTracks, excludedTracks, fieldworkNotes } | 任意（全項目、未入力でもAIのみで完成案を生成可能） | B |
| editorialTheme | coreTheme／emotion／lifeTheme／ginzaExperience／japaneseTitleCandidates[]／englishSubtitle | 必須（AI生成） | C |
| editorialTheme | **hook**（v1.1正式フィールド化。短い情景描写の連続→週全体を総括する一文、という型を踏まえて生成） | 必須（AI生成、最終文言はD） | C／D |
| editorialTheme | **afterglow**（v1.1正式フィールド化。週を閉じる結び。定型文の再利用か週固有の書き下ろしかはHuman Editorial裁量、§8） | 必須（AI生成、方針判断はD） | C／D |
| dailyScenes[7] | date／weekday／emotion／ginzaExperience／sceneDescription（**v1.1：季節・天気・曜日心理・時間帯・街の空気を主要材料とし、実在イベントは適合する場合のみ補助的に触れる**） | 必須（AI生成） | C |
| dailyScenes[7] | tnsEditorialCode { **fixedMoodLabel**（`TNSSettings.codeFixedMoodLabels`参照、上書き可）, **weeklyEnglishSubtitle**（週替わり生成） }（v1.1で2層構造化、§4参照） | 必須（fixedMoodLabelは自動参照、weeklyEnglishSubtitleはAI生成） | A／C |
| dailyScenes[7] | **editorialPointOfView**（v1.1新規。独立Editor's Choice欄ではなく情景・選曲コメントに埋め込むGINZA WHISKERSの視点） | 必須（AI生成） | C |
| dailyScenes[7] | musicSelected | 必須（Approve All時に自動確定、個別差替え時のみ人間操作） | D |
| music | candidateTracks［`MusicTracks`参照、各`releaseYear`/`eraEligibility`/`origin`/`genre`/`ginzaAffinity`/`ginzaAffinityEvidence`を保持、§3.1参照］／usageHistoryCheck［`MusicUsageLedger`参照］ | 必須（自動／AI） | A／C |
| music | selectionReason { **internalReason**（v1.1新規、AI内部の選定根拠、非公開）, **readerFacingComment**（v1.1新規、note本文用の短い詩的編集コメントのみ、条件説明を含めない） } | 必須（AI生成、readerFacingCommentの最終磨き上げはD） | C／D |
| music | selectedTracks | 必須（承認後確定） | D |
| music | **musicBalance** { policy（`TNSSettings.musicBalancePolicy`継承）, effectiveJapaneseRatio／effectiveInternationalRatio（生成時算出、§3.2）, weeklyOverrideJapaneseRatio／weeklyOverrideInternationalRatio（任意） }（v1.1新規） | 必須（自動算出、上書きは任意） | A／D |
| visual | heroVisualBrief／characterLayerRef／maronUsed／colonUsed | 必須（AI生成、`CHARACTER_STANDARD.md`のCharacter Layer/Scene Layer分離を踏襲） | C |
| visual | heroImageAsset／weeklyRepresentativeImageAsset | 必須（AIが候補提示、人間が最終選定） | D |
| outputs | note{title,body,structure: THIS WEEK IN GINZA→週間昭和歌謡予報→DAILY SOUNDTRACK→AFTERGLOW→GINZA WHISKERS導線（v1.1でTNS固有テンプレートへ変更）}／xMain／xRepresentativeTrack／instagram（下書き）／publishHistory（既存`PublishRecord`パターン踏襲） | 必須（AI生成、最終確定は承認後） | C／D |
| humanApproval | themeApproved／tracksApproved／articleApproved／visualsApproved／publishApproved（各approvedBy/At） | 必須（**Approve All一括、または個別**） | D |
| **qualityCheck** | **（v1.1新規）** feelsPersonal（「今の自分のための銀座」と感じられるか）／notJustFactListing（Factの羅列になっていないか）／selectionReasonNotFormulaic（選曲理由が条件説明だけになっていないか）／weeklyEmotionalArc（7日を通じて感情曲線があるか） | 必須（AI自己採点→D最終判断） | C／D |

（担当欄のA/B/C/Dは前段で確定した責任分界——A:AI AUTO INPUT、
B:MARON INPUT、C:AI EDITORIAL GENERATION、D:HUMAN EDITORIAL APPROVAL）

**Human Approval方式**：UI既定操作は「Approve All」（5フラグ一括
true・`edition.status`を`approved`へ遷移）。特定項目のみ差し戻したい
場合は該当フラグのみ個別にfalseへ戻し再承認する経路も用意する
（Payload上は5フラグを維持、UI側で一括／個別を選べる設計）。

### 6.3 `MusicTracks`（楽曲マスタ）

| フィールド | 型・内容 |
|---|---|
| `title` / `artist` | 曲名・アーティスト名 |
| `genre` | 昭和歌謡／City Pop／洋楽／映画音楽等 |
| `era` | 時代性 |
| `moodTags` | 気分・情景との対応タグ |

既存`Tags`マスタと同じ「マスタ管理・表記ゆれ防止」の設計パターンを
踏襲する。歌詞・音源は保持しない（Music Provenance原則、§3）。

### 6.4 `MusicUsageLedger`（重複管理台帳）

| フィールド | 型・内容 |
|---|---|
| `trackRef` | `MusicTracks`への参照 |
| `usedInEdition` | `SoundtrackEditions`への参照 |
| `usedAt` | 使用週・使用日時 |

**既存SOURCE LEDGERの「台帳＋履歴＋重複防止」という設計パターン
（`first_seen`/`changed`判定と同型の考え方）を踏襲する**——新規の
設計思想を持ち込まず、実績のあるパターンを再利用することでリスクを
下げる。**Rolling Historical Ratio（§3.2）の算出には本台帳を使わず、
`SoundtrackEditions`を直接queryする**——本台帳は「同じ曲を使い回して
いないか」の重複防止に特化し、比率集計とは責務を分離する。

---

## 7. 自動化対象／人間判断対象（2026-08-21確定）

| STEP | AI／自動化 | マロン（人間）判断 |
|---|---|---|
| STEP1 Fact | 曜日・季節（決定的計算）、銀座イベント（既存dailyRanking再利用、v1.1で補助情報化）、過去使用曲チェック（`MusicUsageLedger`で自動）、週間天気（`weatherSource:ai_retrieved`優先） | `maronWeeklyObservation`の入力（週次唯一の必須手入力）、天気自動取得失敗時のみ手入力（`weatherSource:manual`） |
| STEP2 Emotion | `maronWeeklyObservation`とFactから気分・生活テーマを生成、`hook`の下書き | HOOK最終文の確定（D） |
| STEP3 Experience | 候補への体験動詞の自動タグ付け提案、`editorialPointOfView`の下書き | 既存`uxType`との正式マッピングは次工程（§8） |
| STEP4 Music | 楽曲候補提案＋重複チェック（自動）、`internalReason`／`readerFacingComment`の下書き、`musicBalance.effective*Ratio`の自動算出 | 最終選曲の承認（Approve All）、または個別差替え。`readerFacingComment`の最終磨き上げ。`weeklyOverride*Ratio`の判断 |
| STEP5 Story | note本文・画像指示・X候補の下書き生成、`afterglow`の下書き | 全文レビュー、AFTERGLOWの方針判断（定型／週固有）と最終文の確定、画像2点（冒頭／週代表）の最終選定 |
| STEP6 Human Editorial | `qualityCheck`4項目のAI自己採点 | Approve All（一括承認）または個別承認・修正、`qualityCheck`の最終判断 |

マロンの任意入力（必ず扱いたいイベント／使用したい曲候補／避けたい
曲・表現／フィールドワーク情報）は**すべて未入力でも、AIのみで
完成案を1本生成できる**設計とした。

---

## 8. まだ確定していない事項（次工程、2026-08-21時点）

Payload設計（§6）はこれらの解決を待たずに実装着手可能なものとして
切り分け済み。

**v1.0から持ち越し**：
- STEP3の体験動詞と既存`uxType`分類との正式なマッピング
- `weatherSource:ai_retrieved`の具体的な取得手段（既存の無料・契約
  不要な情報源の選定）
- 実際の選曲候補プール（`MusicTracks`の初期データ）の作成方法
- Character Layer/Scene Layerの実際の画像生成パイプラインへの組み込み
  （`CHARACTER_STANDARD.md`側の次工程と連動）
- 既存`ImageAssets`と`heroImageAsset`/`weeklyRepresentativeImageAsset`
  の関連付け方法（既存`purpose`バリアント体系との整合）
- `englishSubtitle`の正式翻訳ゲート（既存Article.translationStatusの
  ような正式ゲート対象にするか、翻訳ワークフロー対象外の創作的副題と
  するか）

**v1.1で新たに保留・確認事項化**：
- 邦楽43%／洋楽57%、邦楽60%／洋楽40%のいずれも固定比率としては
  採用しない（§3.2、3週のみでは恒常ルールと断定不可のため）
- AFTERGLOWを「定型文の再利用」に統一するか「週固有の書き下ろし」に
  統一するかの最終方針（#32・#33は定型、#34は週固有——#35以降の
  データで再評価）
- 「週間昭和歌謡予報」コーナーの正式標準化可否（現時点でサンプル1）
- Soft-Cloud／Sunlitラベルの割り当てロジック（Fri・Sun以外は規則性
  未確認）
- `fixedMoodLabel`の#34における正確な値（データ取得の信頼性問題で
  「要再確認」のまま）
- `rollingWindowWeeks`／`minSampleSizeForRolling`の具体的な数値確定
  （4〜8週の範囲内でどこに設定するかは、実際に4週以上のデータが
  揃ってから再検討）

**共通（v1.0/v1.1とも）**：
- `TNSSettings`・`SoundtrackEditions`・`MusicTracks`・
  `MusicUsageLedger`の実コレクション実装（TypeScript、別セッション・
  ユーザー承認後）

**次にDry Runすべき週**：#35以降の最新公開週（AFTERGLOWの定型／週
固有どちらが直近標準かの見極め）、可能であれば#31以前も1〜2週分
（`fixedMoodLabel`がより長期に安定しているかの確認）。
