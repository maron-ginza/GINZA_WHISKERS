# Project 02-2「興味関心×収益性」エンジン — Phase A/B 引き継ぎメモ

本ファイルは、Project 02（AI GINZA EDITORIAL DESK）配下の新規サブプロジェクト
「Project 02-2」について、2026-08-27に実施した監査・設計・試験実装セッションの
状態を、次回セッションが迷わず再開できるように整理したものである。
CLAUDE.md本体には要点のみを1行で記録し、詳細は本ファイルに集約する
（TNS_SPEC.md・VISUAL_ASSET_LIBRARY.md等、既存の分割ドキュメントと同じ方針）。

**このドキュメント自体の位置づけ**：2026-08-27時点のスナップショット。以後の
決定・実装はこのファイルに追記していく「生きた文書」として扱う。

---

## 1. Project 02-2の目的・処理順序（固定）

note利用者・世の中の興味関心テーマを抽出し、そのうち実際に収益化に
つながっている／つながりやすいテーマを選別したうえで、「銀座×GINZA
WHISKERSの編集視点」へ変換し、1日最大5本の記事候補を生成する。

**処理順序は以下で固定し、逆転・省略しない**：

```
Phase A: Interest Discovery（興味関心テーマ抽出）
   ↓
Phase B: Monetization Scoring（収益性評価）
   ↓
Phase C: GINZA Transformation（銀座接続・編集変換）
   ↓
Phase D: Article Generation（記事候補生成）
   ↓
Phase E: Learning（反応学習、将来）
```

一般的な人気テーマをそのまま記事化しない（人気≠収益性、収益性≠銀座適合）。

---

## 2. Phase A「Interest Discovery」— 現在の実装状況

### 2.1 実装済みの3 Signal（`interest-themes` collectionへ保存）

| sourceType | 情報源 | 取得できる値 | confidence |
|---|---|---|---|
| `note_rising` | `note.com/trend`（サイト全体の急上昇タグ上位5件） | theme・明示的rank・URL | high（noteが番号を明示） |
| `note_official_topic` | `note.com/info/rss`（note公式お題・コンテスト告知） | theme（ハッシュタグ）・startDate（告知日）・officialCategory | low（「開催中」は消極的推定のため） |
| `note_hashtag_popular` | `note.com/hashtag/<tag>`（人気=既定ソート、シード＋関連タグ） | theme・articleCount（シード自身）・tagCount（関連タグ） | high（表示数値をそのまま転記） |

**共通collection**：`interest-themes`（`cms/src/collections/InterestThemes.ts`）。
フィールド：theme／sourcePlatform／sourceType／sourceURL／capturedAt／
rankPosition／startDate／endDate／officialCategory／campaignType（予約、未使用）／
articleCount／tagCount／freshness／confidence／status／humanReviewed。
`status`（inbox→approved/rejected）は既存DiscoveredContent等と同じ人間承認ゲート
（`beforeChange`フック、req.user必須）。

**現在のDB実データ**（2026-08-27、観測初日のみ）：21件
（note_rising 5／note_official_topic 9／note_hashtag_popular 7）。

### 2.2 重複防止方式（2種類、意図的に使い分け）

- `note_rising`・`note_hashtag_popular`：**当日のみ**の重複防止（`dedupHelpers.ts`の
  `findExistingTodayCapture`）——同じテーマが別日に再観測されることを許容する
  時系列ログとして扱う。
- `note_official_topic`：**恒久的な**重複防止（`captureNoteOfficialTopics.ts`の
  `findExistingByTheme`）——同一企画（ハッシュタグ）は一度保存したら再実行しても
  増えない。

### 2.3 Interest Score統合ロジック（承認済み、実装済み・読み取り専用）

`cms/src/lib/interestDiscovery/computeInterestScore.ts`＋
`normalizeThemeKey.ts`。CLIは`./p2 interest score`（読み取り専用、DB書き込みなし）。

**正式スコア式**：
```
confidenceWeight = { high: 1.0, medium: 0.6, low: 0.3 }
freshnessFactor(sourceType, daysSince(capturedAt)) = sourceTypeごとの減衰テーブル
recordContribution = confidenceWeight × freshnessFactor
rawScore(cluster) = Σ recordContribution（正規化テーマ単位で合算）
overlapBonus = { K=1:1.0, K=2:1.3, K=3:1.6 }  ※K=異なるsourceType数
persistenceBonus = 0（今回固定）
totalInterestScore = rawScore × overlapBonus + persistenceBonus
```

- **theme正規化**：NFKC・trim・ASCII大文字小文字統一のみ（`normalizeThemeKey.ts`）。
  同義語・意味的近似（例：「旅」「旅行」「旅行記」「海外旅行」）は**自動統合しない**。
  文字バイグラムJaccard類似度（閾値0.4、`lib/curation/textSimilarity.ts`を再利用）
  ＋文字列包含関係で近似候補を検出し、`nearDuplicateCandidates`として提示するのみ。
- **freshness減衰**：sourceTypeごとに速度を変えている——`note_rising`は急減衰
  （0日:1.0→8日+:0.1）、`note_hashtag_popular`はほぼ減衰なし（0-7日:1.0→31日+:0.7）、
  `note_official_topic`は中間（0-7日:1.0→46日+:0.4）。日数境界・係数は初期提案であり
  確定値ではない。
- **confidence（クラスタ単位）**：最低confidenceを基準に、独立sourceTypeがK≥2なら
  1段階引き上げ。
- **overlap**：正規化後theme完全一致かつ**異なるsourceType**の場合のみ加点
  （同一sourceType内の複数観測は加点しない）。**実データでのK≥2の発生はまだ0件**
  （テスト用合成データでは動作確認済み）。
- **persistence**：観測初日のため今回は常に0（複数日蓄積後に有効化予定）。

### 2.4 外部トレンド（Priority 3）調査結果

- **Google Trends「Trending Now」(JP)**：`trends.google.com/trending?geo=JP`に
  人間可読なHTML表（トピック名＋「100K+ searches」等のバケット表示）が
  サーバー側に実在することを確認。robots.txtは`/trending`自体を禁止していない。
  **将来候補として設計メモのみ残す——今回は実装・sourceType追加・Interest Score
  接続はしていない**。カテゴリのみ内部コードで解読不能、ToS未確認、note利用者
  との母集団の距離が課題として残る。
- **TikTok Creative Center**：**見送り**。クライアントサイドレンダリングのみで
  サーバー側にデータが存在せず、ヘッドレスブラウザ等の新規インフラが必須なため
  現行の軽量クローラー方針と相容れない。
- **X（Twitter）**：**見送り**。robots.txtの`User-agent: *`が`Disallow: /`（全面禁止）。
  公開トレンド取得には有料APIティアが前提。

### 2.5 Phase Aで残る検証事項（次回以降）

1. 数日分の観測データ蓄積（現状は導入初日のみ）
2. persistence bonusの有効化・実データでの動作検証
3. cross-source overlap（K≥2）の実データ発生待ち・overlap乗数（1.3/1.6）の妥当性検証
4. `note_official_topic`のconfidence:low判定（開催中推定）の人間による実地サンプル確認
5. 近似テーマ候補（旅／旅行／旅行記／海外旅行等）を統合するかどうかの人間判断
6. Signal Weight・freshness減衰カーブ・overlap乗数の具体的な数値そのものの最終承認
   （仕組みは承認済みだが数値は初期提案のまま）

---

## 3. Phase B「Monetization Scoring」— 現在の調査結果

### 3.1 paidRatio（最初の試験Proxy）

**定義（重要、確定）**：paidRatioは「そのテーマで有料化がどの程度行われているか」
を示す**公開Proxy**であり、売上・購入率・収益性そのものではない。**paidRatio単独で
「儲かるテーマ」と判定しない。**

```
paidRatio = paidArticleCount / totalArticleCount
```

取得元：`note.com/hashtag/<tag>`（通常）と`?paid_only=true`（有料のみ）の
総記事数表示の差分。取得ロジックは既存`fetchNoteHashtagPage.ts`に
`paidOnly`引数を追加する形で最小拡張済み（`buildNoteHashtagPageUrl(tag, paidOnly)`）。

**2026-08-27試験結果（5テーマ、表示のみ・DB未保存）**：

| theme | totalArticleCount | paidArticleCount | paidRatio |
|---|---|---|---|
| 旅行記 | 99,858 | 2,668 | 2.67% |
| 海外旅行 | 188,207 | 6,762 | 3.59% |
| 旅 | 188,108 | 7,049 | 3.75% |
| 写真 | 1,695,838 | 約10,000（概数・下限） | 0.59%相当 |
| エッセイ | 2,660,922 | 約10,000（概数・下限） | 0.38%相当 |

**取得フィールド**：theme／hashtagURL／totalArticleCount／paidArticleCount／
paidRatio／capturedAt／confidence／sampleSize（＝totalArticleCount）。

**このセッションで発見・修正済みのバグ**：note側の件数表示は一定規模
（実地確認では10,000）を超えると「約10,000件」という概数表示になる。
`parseNoteHashtagPage.ts`の`TOTAL_COUNT_REGEX`が完全一致の数字のみを
想定していたため誤って「取得不能」と判定していた不具合を、正規表現に
「約」の任意許容を追加して修正済み（既存`note_hashtag_popular`キャプチャへの
影響なし、回帰テスト済み）。**この修正は既にコードへマージ済み**——
Phase B自体の実装ではなく、Phase A発見済みバグの最小修正という位置づけ。

### 3.2 paidRatioの制約（必ず踏まえること）

1. 「約10,000件」等は概数——写真・エッセイのpaidRatioは実際より**過小評価**
   されている可能性がある（真の値は不明、下限としてのみ扱える）
2. 有料記事の**価格差**を区別できない（100円の記事も高額記事も同じ「1件」）
3. **売上を示さない**——購入者数・実売上は非公開のまま
4. **時点のスナップショット**にすぎない（増減トレンドは今回未計測）
5. `note_official_topic`由来のタグ（`/contest/<tag>`にリダイレクトされる）には
   **一律適用できない**——有料フィルタUIが存在しないことを実地確認済み
6. `/search`（robots.txt禁止）経由の有料記事比率は取得不可

### 3.3 取得不可能と確認済みのSignal（推測しない）

実売上・CVR・購入率・個別記事購入数・購入者数・フォロワー数（note公式が
意図的に非公開）・コメント数（静的HTMLに数値なし）・有料記事ランキング
（公式ページ見当たらず）・検索結果内有料記事比率（`/search`がrobots.txt禁止）。

### 3.4 公開取得可能と確認済みのSignal

有料記事であることの判定（`?paid_only=true`）／同一テーマ内の有料記事数・比率／
記事価格（個別記事ページに表示、例「¥138」、**今回は価格分析未実施**）／
スキ数（個別記事ページに数値表示あり）。

---

## 4. Phase B 次回候補（未実装、優先度未決定）

- 有料記事の価格帯（個別記事ページを開く必要があり取得コスト増）
- 同一テーマで継続的に有料発信するクリエイター数
- メンバーシップとの接続（存在有無の公開判定手段は未確立）
- note公式の収益化成功事例（`note.com/info`等のインタビュー記事）との一致
  ——定性的な参考情報にとどまり構造化データではない
- **GINZA WHISKERS自身の将来実績**：自社noteアカウントのクリエイター
  ダッシュボード（PV・スキ・保存・購入者数・売上等、第三者には非公開の
  一次データ）を将来Phase Bへ接続する構想。現状は自動API連携手段がなく、
  人間による手動転記運用を想定。CLAUDE.md第8章項目11「Performance Learning
  Layer」（未実装）が接続先になる見込み。

---

## 5. 禁止事項（Phase A/B共通、継続して守ること）

- 人気＝収益性とみなさない
- note内部ランキング・収益ロジックを推測しない（非公開の数字を推測で埋めない）
- paidRatio単独でテーマをランキング・順位付けしない
- Phase C（銀座変換）へまだ接続しない
- 記事生成へまだ接続しない
- Interest Score・Signal Weight・overlap乗数・freshness減衰カーブの数値は
  「初期提案」のままであり、人間承認なしに既定値として確定させない

---

## 6. 実装済みファイル一覧（技術リファレンス）

```
cms/src/collections/InterestThemes.ts
cms/src/lib/interestDiscovery/
  types.ts                        # sourceType/confidence/freshness等の型定義
  normalizeThemeKey.ts            # Interest Score用theme正規化
  computeInterestScore.ts         # Interest Score計算（読み取り専用）
  dedupHelpers.ts                 # 当日重複防止の共有ヘルパー
  parseNoteTrendHtml.ts / fetchNoteRisingTags.ts / captureNoteRisingTags.ts
  parseNoteInfoRss.ts / classifyNoteOfficialTopic.ts /
    fetchNoteOfficialTopics.ts / captureNoteOfficialTopics.ts
  parseNoteHashtagPage.ts / fetchNoteHashtagPage.ts /
    captureNoteHashtagPopular.ts   # paidOnly引数はPhase B試験で追加済み
cms/src/scripts/
  interestFetchNoteRising.ts / interestFetchNoteOfficial.ts /
  interestFetchNoteHashtag.ts / interestScore.ts
scripts/project02                 # interest_* bash関数・dispatch・usage
cms/src/payload.config.ts         # InterestThemes登録済み
```

**CLIコマンド一覧**：
```
./p2 interest fetch-note-rising [--dry-run]
./p2 interest fetch-note-official [--dry-run]
./p2 interest fetch-note-hashtag <tag> [--dry-run]
./p2 interest score          # 読み取り専用、Interest Score降順表示
```

Phase Bのpaidボリューム試験は`_tmp_trial_paid_ratio.ts`という一時スクリプトで
実施し、結果確認後に削除済み（session既存の使い捨てスクリプト規約）——
恒久的なCLIコマンドとしてはまだ存在しない。

---

## 7. 次回セッション最初にやること（提案、優先度はマロン判断）

1. **最も自然な次の一歩**：`./p2 interest fetch-note-rising`／
   `fetch-note-official`／`fetch-note-hashtag`を2〜3日連続で実行し、
   freshness減衰・persistence bonusを実データで検証できる材料を貯める
   （Interest Score側のコード変更は不要、既存CLIを日次実行するだけ）
2. Signal Weight／freshness減衰カーブ／overlap乗数の具体的数値について、
   最終承認をもらう
3. `note_official_topic`のconfidence:lowの数件を人間が実際にURLを開いて
   検証する
4. paidRatioを恒久的なCLIコマンド（例：`./p2 interest paid-ratio <tag>`）に
   昇格するか、追加proxy候補（本ファイル4節）を先に調査するかの方針決定

---

## 8. 収益化②「興味関心 × 銀座 × GINZA WHISKERS視点 最大5本/日」実装（2026-08-28）

マロン方針確定（B2採用／プレマッチはapproved DiscoveredContentのみ／
angles=interest+ginza_whiskers両方保持／最大5本/日／人間承認ゲート維持／
自動投稿なし／既存Phase A・B・draft生成を最大限再利用／新規AIスキーマ最小限／
W_PAID=8・C_MATCH=0.6をconfig化し9月Trialで調整）を受けて実装した。

### 8.1 処理順（spec固定、A→B→C→D→承認待ち）

```
Phase A  承認済み interest-themes ＋ 既存 computeInterestScore（式・weight・decay 無変更）
         → topicInterestScore（= 既存 totalInterestScore）
Phase B  interest-themes.monetization.paidRatio（B2、新規groupフィールド、非AI）
         → monetizationMultiplier = clamp(1 + W_PAID × paidRatio, 1.0, MAX_MON_MULT)
         → finalRankScore = topicInterestScore × monetizationMultiplier
         paidRatio 未取得 / サンプル過小（totalArticleCount < MIN_PAID_SAMPLE）→ 乗数 1.0
         （導入初期に finalRankScore が topicInterestScore と一致し暴れない fallback）
Phase C  段1 決定的プレマッチ（承認済み DiscoveredContent のみ）：
           (1) 包含（normalizeThemeKey(theme) が title/excerpt に含まれる）
           (2) computeThemeBigramContainment(theme, title) ≥ C_MATCH
               （非対称メトリクス = テーマ側bigramの被覆率。既存の対称Jaccardは
                短語×長文で0に潰れるため新設、textSimilarity.ts）
           (3) pillar hint（keyword→収蔵室 exact一致、pillarHint.ts、類似度なし）
           → editorialScore.total 最大の DC を採用。候補ゼロ → no_ginza_match（正常）
         段2 AI最終判定：createMultiAngleDraftsFromDiscoveredContent を
           angles:['interest','ginza_whiskers'] ＋ readerInterestTheme で呼ぶ。
           両角度が include:false（関心テーマと元情報に自然な接点なし）
           → 生成されず failure として報告（＝Phase C の最終判定）
Phase D  上記 AI 呼び出しがそのまま Article(reviewStatus: draft) を作る。
         新規 AI ツールスキーマは追加なし（readerInterestTheme は user メッセージ注入のみ）。
承認待ち  既存 Articles.ts beforeChange 人間承認ゲートをそのまま通る（変更なし）。
```

### 8.2 スコア計算式（確定）

```
topicInterestScore(theme)      = 既存 computeInterestScore の totalInterestScore
                                 = rawScore × overlapBonus + persistenceBonus
                                 （CONFIDENCE_WEIGHT high1.0/med0.6/low0.3、
                                   overlap K=1:1.0/K=2:1.3/K=3:1.6、persistence=0固定、
                                   sourceType別freshness減衰 — すべて既存・無変更）

paidRatio(theme)               = monetization.paidArticleCount / monetization.totalArticleCount
                                 （note.com/hashtag/<tag> と ?paid_only=true の差分。
                                   「約N件」概数表示は isApproximate=true、下限扱い）

monetizationMultiplier(theme)  = 1.0                       （paidRatio 未取得
                                                            / totalArticleCount < 500）
                               = clamp(1 + 8 × paidRatio, 1.0, 1.6)   （それ以外）

finalRankScore(theme)          = topicInterestScore × monetizationMultiplier
```

### 8.3 config（環境変数で上書き、9月Trial調整用。`lib/interestDiscovery/config.ts`）

| 変数 | 既定 | 意味 |
|---|---|---|
| `INTEREST_W_PAID` | **8** | monetization 補正の強さ。observed paidRatio帯(0.38〜3.75%)で乗数1.03〜1.30。overlap 1段(1.3×)を超えさせない上限＝12、day-0タイブレークが効く下限＝6 |
| `INTEREST_C_MATCH` | **0.6** | テーマ側bigram被覆率のしきい値。「テーマの語幹の6割がタイトルに現れる」。AI include が本判定なので再現重視。ノイズ(~0.3)と本物(0.5+)の境界 |
| `INTEREST_MAX_DAILY_DRAFTS` | 5 | 1日あたり生成上限（`--limit=N` でも上書き） |
| `INTEREST_MIN_PAID_SAMPLE` | 500 | paidRatio を信頼する最小 totalArticleCount。未満は乗数1.0（暴れ防止） |
| `INTEREST_MAX_MON_MULT` | 1.6 | 乗数の上限（overlap K=3 と同値。異常paidRatioでも興味最強シグナルを超えない） |

CLI では `--w-paid=N` `--c-match=N` で単発上書き可（`./p2 draft-interest --dry-run --w-paid=6 --c-match=0.5`）。

### 8.4 5本選定ロジック

1. 承認済み interest-themes → `computeInterestScoreFromRecords`（承認サブセットのみ）で topicInterestScore クラスタ化。
2. クラスタごとに monetization（同一 normalizeThemeKey の最新 capturedAt 行から）→ multiplier → finalRankScore。
3. finalRankScore 降順ソート。
4. テーマ近似クラスタ（既存 `nearDuplicateCandidates`、旅/旅行/旅行記等）を先勝ちで束ね、finalRankScore 上位を代表に。
5. 冪等除外：`interest-themes.generatedArticles` が非空、または既存 Article の `aiGeneratedBy` に `interestTheme=<key>` を含むテーマ → `already_generated`。
6. `--strict` 指定時は paidRatio 未取得テーマを `strict_skipped`。
7. 各テーマを承認済み DiscoveredContent へプレマッチ（8.1 段1）。候補ゼロ → `no_ginza_match`。
8. 同一 DiscoveredContent へ複数テーマがマッチ → finalRankScore 上位のみ `selected`、他は `deferred`。
9. `selected` は最大 `maxDrafts` 件。超過分は `deferred`。
10. live 実行時、`selected` を finalRankScore 順に multi-angle（interest+ginza_whiskers）で生成。作成ドラフト総数が `maxDrafts` に達したら打ち切り（soft cap、1テーマ最大2本のため 5〜6 で止まる）。

### 8.5 変更ファイル

**新規**：`cms/src/lib/interestDiscovery/config.ts`／`monetizationScore.ts`／
`pillarHint.ts`／`capturePaidRatio.ts`、`cms/src/lib/ai/createInterestDrivenDraftsFromThemes.ts`、
`cms/src/scripts/interestPaidRatio.ts`／`draftInterest.ts`、
`scripts/format_draft_interest_status.py`。
**変更（最小・後方互換）**：`collections/InterestThemes.ts`（`monetization` group ＋
`generatedArticles` relationship を追加、いずれも非AI・readOnly）、
`lib/ai/generateMultiAngleArticleDrafts.ts`（`readerInterestTheme?` を入力に追加＝
user メッセージ注入のみ。ツールスキーマ不変。**sourceProvenance は全角度で必須
——下記 8.6 で 2026-08-28 の一時緩和を取り消し、システムプロンプトを補強**）、
`lib/ai/createMultiAngleDraftsFromDiscoveredContent.ts`（`readerInterestTheme`/
`interestThemeKey` を options に追加、`aiGeneratedBy` に `|interestTheme=<key>` を付与）、
`lib/curation/textSimilarity.ts`（`computeThemeBigramContainment` 追加）、
`lib/interestDiscovery/parseNoteHashtagPage.ts`（`totalArticleCountIsApproximate` を返す）、
`scripts/project02`（`interest paid-ratio` ／ `draft-interest` を配線。**morning へは未接続**）。

### 8.6 実E2E検収と Trust Layer の再修正（2026-08-28）

**第1E2E（関心「旅行」× 蔦屋重三郎「耕書堂跡」記事）**：include:true 角度の
sourceProvenance ≥ 1 件必須という multi-angle の検証で、interest/ginza_whiskers の
両角度が provenance 空により全落ち。いったん **interest/ginza_whiskers に限り
sourceProvenance 空を許容へ緩和**して Article 2本を生成した。

**E2E検収でこの緩和が Editorial Trust Layer を弱めると判定 → 取り消し**：
緩和後の第2E2E（関心「旅行」「写真」の4本）で、生成4本すべてが
`editorialProvenance` 0 件のまま承認された（本文は出典 excerpt に接地して
いたが、日付・地名・外部媒体名など構造化すべき事実の検証記録が空）。
`sourceProvenance` 必須は単なる記録項目ではなく「AI に使った事実を列挙させる
forcing function」であり、これを外すと検証台帳が空の記事が通ってしまう。
**対応（確定）**：
1. `hasProvenance` を **全5角度で必須へ戻す**（interest/ginza_whiskers も
   例外にしない）。
2. `MULTI_ANGLE_SYSTEM_PROMPT` の Editorial Trust Layer 節を補強——
   「include:true のすべての角度は sourceProvenance を最低1件必ず出力する。
   編集的視点の角度であっても、会場・日付・人物・歴史・商品・サービス等の
   事実記述を最低1件は sourceProvenance に記録する。**検証可能な事実が
   1件も無い角度は記事化せず include:false とする**」。
3. `draftInterest.ts` の CLI 引数検証を追加（`--w-paid ≥ 0`、`--c-match` は
   0〜1、不正値は明示エラー）。

**再E2E（修正後、関心「旅行」× #217／「写真」× #97）**：Article #43〜46 を
reviewStatus:draft で生成。**interest・ginza_whiskers の4本すべてに
`editorialProvenance` 2件ずつ**が付与され（`discovered_content_source` は
承認済み #217/#97、`source_url` 一致、`verification_status` は confirmed 中心・
未確認は unconfirmed で正直に表示、fact は excerpt に接地）、
`aiGeneratedBy` に `interestTheme=<テーマ>` 付与、再実行で `already_generated`
スキップを確認。`tsc --noEmit`（cms、0エラー）・`./p2 doctor` 全緑。
検収用の承認（interest-themes・DiscoveredContent #217）と生成物（Article
#37〜46）はすべて元へ戻した／削除した（旅行・写真・エッセイの monetization
実データのみ意図的に保持）。

### 8.7 実運用上の現実（設計に織り込み済み）

現在 承認済みテーマ 0 件・承認済み DiscoveredContent 3 件（いずれも niche な
美術/イベント展示）。検収時の実データでも、汎用的な note 関心テーマ
（日記・読書感想文・コミティア157 等）は承認済み DC と接点がなく `no_ginza_match`
になった。**5本/日は上限であって、当面の現実的スループットは 0〜1 本/日**。
承認済み DC の拡充（特に 文化/歴史/建築/人物 系）と、銀座親和性のある関心テーマ
（旅行・写真・カフェ・建築・読書等）の承認蓄積で伸びる。

### 8.8 `./p2 morning` 接続（2026-08-28完了）＋ 収益化①②間の重複防止

- **morning step 14 に `draft_interest --dry-run` を追加**（step 13 の
  `draft_today --dry-run` の直後）。morning 通常実行では ①② とも `--dry-run`
  ——AI 呼び出し・DB 書き込み・自動投稿なし。実生成は人間が
  `./p2 draft-today --yes` ／ `./p2 draft-interest --yes` を明示実行した場合のみ。
- **収益化①②間の重複防止（要件7）**：`createInterestDrivenDraftsFromThemes.ts`
  のプレマッチ対象プールから、**既に何らかの Article が
  `editorialProvenance.discoveredContentSource` で参照している承認済み DC を
  除外**する。処理順が「① draft-today → ② draft-interest」なので、②は
  「①がまだ記事化していない承認済み Ginza コンテンツ」に対してのみ関心テーマを
  接続する。同一ソースを CORE（①）と interest/ginza_whiskers（②）で
  同日二重に記事化しない。除外件数は dry-run 出力に表示
  （「収益化①で記事化済みのため N件を除外後」）。
  - ①②とも同一の multi-angle 生成基盤を使い、①=CORE のみ、②=interest/
    ginza_whiskers のみと角度が排他のため、「同じ角度の重複記事」は構造的に
    発生しない。②内のテーマ近似束ね（旅/旅行/旅行記 → 旅行）・同一 DC 先着
    deferred も従来どおり。
- **合計上限 最大10本/日**：① `INTEREST_MAX_DAILY_DRAFTS` 相当の
  `DEFAULT_MAX_DRAFTS=5`（draft-today）＋ ② `maxDailyDrafts=5`（config、
  `--limit` で上書き可）。
- **同日再実行**：morning の `--dry-run` は何も生成しない。`--yes` 実行も
  ①=`editorialProvenance` 逆引き、②=`interest-themes.generatedArticles` ＋
  `aiGeneratedBy` の `interestTheme=<key>` で二重生成しない。加えて②が生成した
  DC は次回以降 ②のプレマッチ対象からも自動除外される（上記重複防止の帰結）。
- **本番 Railway**：`TZ=Asia/Tokyo` 前提（①の当日 `decisionAt` 判定、②の
  Interest Score freshness `daysSince(capturedAt)`。RUNBOOKS 付録F）。

**残タスク**：W_PAID / C_MATCH の 9月Trial 調整、pillarHint 表の拡充、
テーマ近似束ね・上限スライスの実データ発火確認（承認済みテーマ6件以上待ち）。

---

## 9. Tier 1：ginza_whiskers 主稿化 ＋ 記事生成前後の4品質ゲート（2026-08-30 確定・実装）

8/30 の記事生成 Trial（Article #51＝interest 型／#52＝ginza_whiskers 型）評価を
受けたマロン方針：**#52 型「GINZA WHISKERS 独自の編集視点で再解釈した記事」を
主稿にする。#51 型の一般的な関心接続記事は常時生成せず、必要な場合のみ補助稿**。
あわせて「記事生成前の4品質ゲート（銀座固有性／今行く理由／読者が銀座でできる
こと・体験価値／GINZA WHISKERS 独自の編集視点）」を pre-gate＋post-gate＋人間
レビューの3層で実効化。実装範囲は Tier 1 のみ（`titleShape.ts`・`titleOptions`
スキーマ追加は Tier 2 送り）。

### 9.1 主稿／補助稿

- 主稿＝`config.primaryAngle`（env `INTEREST_PRIMARY_ANGLE`、既定 `ginza_whiskers`）。
  既定は 1テーマ＝Claude 1回＝draft 1本。
- interest 補助稿は `./p2 draft-interest --with-interest` ／
  `INTEREST_INCLUDE_INTEREST_ANGLE=true` 指定時のみ。かつ **同テーマの主稿
  （ginza_whiskers）が生成成立した場合のみ保存**（`createMultiAngleDraftsFrom
  DiscoveredContent` の `requirePrimaryAngle`。主稿が included に無ければその DC
  からは一切生成しない＝補助稿も抑止）。

### 9.2 生成前 pre-gate（`cms/src/lib/curation/interestArticlePreGate.ts`、AI呼び出しなし）

`(theme, matchedDc)` に対し、いずれか不成立なら `plan.status='gate_failed'`
（`gateReasons` 付き）とし **Claude を一切呼ばない**。

| gate | pass 条件（OR） | 対応 |
|---|---|---|
| `ginzaSignal` | DC の title/excerpt/venue に「銀座｜GINZA｜中央区」／`editorialScore.ginza ≥ INTEREST_GATE_GINZA_MIN`（既定13、最大25）／`resolvePillarHints(theme)` が `CONTENT_TYPE_TO_PILLAR_NAME[dc.contentType]` と一致 | 銀座固有性（下限） |
| `timelyReason` | `deriveEventStatus ∈ {ongoing}`／`isUpcomingSoon`（`INTEREST_GATE_UPCOMING_DAYS` 既定14日）／`deriveTemporalRelevance ∈ {now,soon,next}`／`publishedAt` が `INTEREST_GATE_PUBLISHED_RECENCY_DAYS`（既定21）以内 | 今行く理由（**HARD**） |
| `experienceCategory` | `dc.uxType`（設定済みかつ ≠ other）／`classifyUxType` が other 以外／`dc.contentType ∈ INTEREST_EXPERIENCE_CONTENT_TYPES`（既定 event/exhibition/food/shopping） | 体験価値（下限） |
| `materialSufficiency` | `assessContentRichness(dc.excerpt).tier ≠ 'boilerplate'` | 素材充足 |

`timelyReason` が「日付根拠のない『今行く理由』は生成しない」の実効化——
`eventStartAt`/`eventEndAt`/`publishedAt` のどれも無い DC は必ず落ちる。

### 9.3 生成後 post-gate（`interestArticlePostGate.ts`＋`unsourcedHistoryGuard.ts`＋`factNoteSeparation.ts`、AI呼び出しなし）

主稿候補の本文に対し以下を検出。**9月Trial は hard drop せず WARNING 記録のみ**
（`config.warnObserveMode` 既定 true）。`aiGeneratedBy` 末尾の `|warnings=<csv>`
と `format_draft_interest_status.py` の `⚠ post-gate WARNING` に表示し、編集長
レビューで採否判断。Trial で誤検知率を観測してから hard drop 化（Tier 1.5）。

- `weakGinzaSpecificity`：会場/日付の sourceProvenance も、銀座での具体的行為の
  記述も無い。
- `noConcreteGinzaExperience`：本文に「銀座で見る/歩く/訪れる/体験する具体対象」
  が無い（応募・告知のみの可能性）。
- `weakEditorialViewpoint`：editorsNote が空・`INTEREST_POSTGATE_EDNOTE_MIN_CHARS`
  （既定60）未満・content+whyNow との char-bigram 類似度 ≥
  `INTEREST_POSTGATE_RESTATE_SIM`（既定0.5）・選定理由の語が無い。
- `whyNowNotDateBacked`：whyNow が空、または日付/会期に接地していない。
- `unsourcedHistory`：明治/大正/昭和/かつて/創業N年/N年代/「日本人は昔から」等が
  sourceProvenance の fact・DC excerpt に現れない。
- `factLeakInEditorsNote` / `editorsNoteRestatesContent`：editorsNote に日付/
  料金/時刻/会期の混入、または content の言い換え。

### 9.4 影響範囲

- **スキーマ変更・migration なし**（`payload generate:types` 差分ゼロ）。WARNING は
  `aiGeneratedBy` 文字列に載せるのみ（`Articles` テーブル不変）。
- 冪等キー抽出の正規表現を `interestTheme=([^)]+)\)?$` → `interestTheme=([^|)]+)` へ
  （`|warnings=` 追加への対応）。
- `draft-today`（CORE 生成、`createDailyDraftsFromApproved.ts`）は `angles:['core']`
  のみで `requirePrimaryAngle`／`enableInterestPostGate` を渡さず**完全に無影響**。

### 9.5 実AI E2E（after 比較 Trial、2026-08-30）

`interest_themes` id31「アート」＋ DiscoveredContent #324「永井博『Now and Then』
刊行記念 ＠銀座 蔦屋書店」（event、会期 2026-09-02〜09-30、venue 明示）を承認 →
`time ./p2 draft-interest --yes --limit=1` で **Article #53**（ginza_whiskers/
medium、`reviewStatus=draft`、**post-gate WARNING 0件**、`editorialProvenance`
2件〈venue＋会期／エディション数、いずれも confirmed〉、本文 3,310字）を生成。
所要 57.1秒。`interest_themes` id31 の `generatedArticles=[53]`。`./p2 editorial`
Draft 18→19（ginza_whiskers 1本のみ＝従来 #51+#52 の2本から半減）。既存 #51/#52
は before 比較用に保持（無変更）。

**コスト訂正（重要）**：設計時「output トークン約半減」の見積もりは誤りで実測は
増加——8/30 Trial（2角度）は input 5,828 / output 3,618、今回（単角度）は
input 6,766 / **output 4,556（＋26%）**。5候補スキーマ不変＋プロンプト強化で
主稿が厚く書かれたため。**真のコスト削減は per-call output ではなく、
(i) 1テーマ＝1 draft（従来2）、(ii) pre-gate で弱いテーマは Claude を呼ばない
（gate_failed は 0 API コスト）、の2点**。

### 9.6 config（`cms/src/lib/interestDiscovery/config.ts`、すべて env 上書き可）

`INTEREST_PRIMARY_ANGLE`(ginza_whiskers) / `INTEREST_INCLUDE_INTEREST_ANGLE`(false) /
`INTEREST_GATE_UPCOMING_DAYS`(14) / `INTEREST_GATE_PUBLISHED_RECENCY_DAYS`(21) /
`INTEREST_GATE_GINZA_MIN`(13) / `INTEREST_EXPERIENCE_CONTENT_TYPES`
(event,exhibition,food,shopping) / `INTEREST_POSTGATE_RESTATE_SIM`(0.5) /
`INTEREST_POSTGATE_EDNOTE_MIN_CHARS`(60) / `INTEREST_WARN_OBSERVE_MODE`(true)

### 9.7 変更ファイル

**新規**：`interestArticlePreGate.ts` / `interestArticlePostGate.ts` /
`unsourcedHistoryGuard.ts` / `factNoteSeparation.ts` / `normalizeSocialCopy.ts`。
**変更**：`config.ts` / `createInterestDrivenDraftsFromThemes.ts` /
`createMultiAngleDraftsFromDiscoveredContent.ts` / `generateMultiAngleArticleDrafts.ts` /
`draftInterest.ts` / `scripts/project02`（`--with-interest`）/
`format_draft_interest_status.py`。

### 9.8 Tier 1 の残タスク

- WARNING 群の誤検知率・分布を1〜2週観測 → 閾値調整 → 確定した項目から hard drop 化
  （Tier 1.5）。
- `titleShape.ts`（タイトル構文型の重複検出）・`titleOptions` スキーマ追加（Tier 2）。
- `pillarHint.ts` キーワード表の拡充。

---

## 10. Tier S1／S2：Social Copy 媒体別最適化（2026-08-30 確定・実装）

Tier 1 で生成した #53 の Social Copy を評価したところ、note と X がほぼ同文で、
X が「ある画家」と固有名詞をぼかしていた。3媒体の役割差を強めるための最小変更。
実装範囲は S1／S2 のみ（media別スキーマ化・媒体別の追加 Claude 呼び出し・A/B
2案生成は Tier 2 送り）。

### 10.1 媒体別の役割（Tier S1、`generateMultiAngleArticleDrafts.ts` の system プロンプト「## SNS用コピー」節を全面差し替え）

- **note**：記事の要約（何が書かれているか）＋今読む理由をそれぞれ1文。事実は
  簡潔に1〜2文。editorsNote の核を一言。ハッシュタグ **3個まで**。定型の書き出し
  （「話題の」「〜をご紹介します」）禁止。
- **X**：1行目に短いフック（施設名・イベント名を主語にしない）。**誰（固有名詞を
  明示、「ある画家」等のぼかし禁止）／どこ（銀座の具体的な場所）／いつ（確認済みの
  会期）／何ができるか** を全部そろえる。**「今行く理由」を必ず入れる**（確認済み
  の会期・季節文脈に接地）。2〜3文・おおむね120字以内。ハッシュタグ **2〜3個**。
- **Instagram**：情景・体験価値を主に。「銀座を歩く途中で立ち寄る」導線のイメージ。
  説明しすぎない。**余韻の一文で締める**（断定・呼びかけで終わらせない）。
  ハッシュタグ **1〜2個**。誇張・断定禁止。
- **3媒体共通**：Fact にないことを足さない／日付根拠のない「今だけ・旬・話題の」
  禁止／GINZA WHISKERS の視点を各媒体に1要素・ただし自然に／**3媒体で同一文・
  同一語順を横展開しない**／AIっぽい定型表現を避ける。

### 10.2 決定的正規化（Tier S1、`normalizeSocialCopy.ts`、AI呼び出しなし）

- ハッシュタグ重複除去（先勝ち）。
- 上限を関数引数（caps）へ切り出し、既定 **note 3 / X 3 / Instagram 2**。
- **Instagram も `normalizeOne` に通す**（従来は素通しだった）——3媒体すべてに
  重複除去・上限・`#銀座` 保証を適用。`#銀座` は上限に関わらず1枠を必ず残す。

### 10.3 媒体別 WARNING（Tier S2、新規 `cms/src/lib/curation/socialCopyGate.ts`、AI呼び出しなし）

`normalizeSocialCopy` 適用後の最終テキストに対し検出。`interestArticlePostGate`
の WARNING と同じ配列へ合流（`aiGeneratedBy` の `|warnings=` と CLI 出力）。
9月Trial は hard drop せず WARNING 記録のみ。

- `xMissingWhoWhereWhen`：X本文に「誰＝sourceProvenance の fact から抽出した固有
  名詞候補（『』「」内・カタカナ連続・英字連続）のいずれか／どこ＝銀座 or
  DC.venue（またはその語片）／いつ＝実日付語」のいずれかが欠落。固有名詞候補が
  fact に1つも無ければ「誰」は不問。
- `socialCopyCrossMediaDuplicate`：note/X/IG の任意2媒体間の char-bigram Jaccard
  類似度 ≥ `SOCIALCOPY_DUP_SIM`（既定 0.65）。
- `aiBoilerplatePhrase`：`SOCIALCOPY_BOILERPLATE`（既定16語 CSV、env 上書き可）の
  部分文字列がいずれかの媒体にヒット。
- `recencyClaimUnbacked`：「今だけ／今しか／いま話題／旬／待望の／ついに解禁／
  急げ／見逃すな」等が、provenance の実日付・会期語にもその媒体自身の日付語にも
  接地せず出現。実日付判定は月/日/年・明示会期語（会期／開催期間／開催中）・
  具体的な時期語のみ（「開催」「まで」「から」単体は根拠にしない）。

### 10.4 config（`cms/src/lib/interestDiscovery/config.ts`、すべて env 上書き可）

`SOCIALCOPY_NOTE_MAX_TAGS`(3) / `SOCIALCOPY_X_MAX_TAGS`(3) /
`SOCIALCOPY_INSTAGRAM_MAX_TAGS`(2) / `SOCIALCOPY_DUP_SIM`(0.65) /
`SOCIALCOPY_BOILERPLATE`（CSV、既定：いかがでしょうか／してみてはいかが／
ぜひチェック／ぜひ足を運／ぜひご覧／ぜひお立ち寄り／おすすめです／おすすめの一／
方におすすめ／話題の／話題沸騰／必見／見逃せない／要チェック／マストバイ／大注目）

### 10.5 影響範囲・検証

- **スキーマ変更・migration なし**（`generate:types` 差分ゼロ）。
- `draft-today`（CORE）は `socialCopyGate`／媒体別 caps を通さず**無影響**。
- `npx tsc --noEmit`（cms）0エラー。使い捨てユニットで socialCopyGate の4 WARNING
  の発火・非発火（役割差のある健全な3媒体＝warnings 0、過検知なし）と新 caps を
  確認。誤検知修正1件：`recencyClaimUnbacked` の日付根拠判定が provenance の
  「開催」単体を日付とみなしていたため `DATE_HINT_RE` を厳格化。
- 回帰：`./p2 draft-interest --dry-run` 正常、`./p2 doctor` 全緑、`./p2 editorial`
  不変、`./p2 draft-today --dry-run` 正常。
- **実AI E2E は未実施**——現在の承認済みテーマ（アート id31／写真 id29）は生成済み
  で枯渇。live には新テーマ＋DC の承認が必要。

### 10.6 変更ファイル

**新規**：`cms/src/lib/curation/socialCopyGate.ts`。**変更**：
`generateMultiAngleArticleDrafts.ts`（プロンプト差し替え＋`socialCopyGate` 呼び出し）／
`normalizeSocialCopy.ts`（caps 引数化・Instagram 対応）／
`createMultiAngleDraftsFromDiscoveredContent.ts`（options 拡張・伝搬）／
`createInterestDrivenDraftsFromThemes.ts`（config→options）／`config.ts`。
