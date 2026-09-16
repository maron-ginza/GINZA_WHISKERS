# 朝処理パイプライン V1 確定仕様（Project 02）

2026-09-16、マロン指示により、朝の候補処理を5段階の責任分離へ再整理し、本日を
Project 02・V1プログラミング改善の最終日として判定ロジックを固定した。本ファイルは
その確定仕様（正本）。個別の意思決定の経緯・過去の試行錯誤は `DECISION_LOG_02.md`・
`CLAUDE.md` 第12章を参照。

---

## 0. 目的

朝の一連処理（収集後〜note原稿作成前）を、責任がコード上ではっきり分かる5段階へ
分離する。**「今日3本に選ばれなかった」という理由でA判定・候補ボードから消える
候補があってはならない**——A/B/C判定は独立した事実判定であり、日々の選定結果に
左右されない。

## 1. 5段階の構成

| Stage | 名称 | 実装 | 責務 |
|---|---|---|---|
| 0 | ArticleFacts自動導出 | `autoArticleFacts.ts`（新規）＋ `morningRun.ts`（DC保存済み公式情報からの自動書き込み） | Stage 1より前に、保存済みDC公式情報だけからArticleFactsを決定論的に導出しready化する。人間の追加入力は前提にしない |
| 1 | A/B/Cスクリーニング | `assessCandidate.ts` / `targetOrDiscoveryEligibility.ts`（2026-09-16続き7でArticleFacts readyを必須条件に追加） | 記事化に必要な公式情報の裏どりとArticleFacts保存（ready）が完了した候補をAとする |
| 2 | 18カテゴリー分類 | `targetOrDiscoveryEligibility.ts`（無変更、`deriveProvisionalCategory`） | A候補を18カテゴリーへ分類する。A/B/Cとは独立 |
| 3 | A候補ボード作成 | `candidateBoard.ts`（新規） | Aかつ未選定の候補をSWEETS独立枠＋その他カテゴリー別＋未分類、に整理して表示する。最終3本は確定しない |
| 4 | マロンによる3本選定 | `selectionRecord.ts`（新規）＋ `./p2 morning-select` | 候補ボードから人間が3本を選ぶ。A/B/Cとは別の記録として保存する |
| 5 | 選定後のnote原稿作成 | `./p2 morning-draft-selected` | 選定済みの3本だけを対象に、保存済み情報だけで原稿を作る。再裏どりはしない |

いずれの段階も、**後段の都合で前段の判定結果（A/B/C・カテゴリー）を書き換えない**。
これが V1 の中核原則。

## 2. Stage 0：ArticleFacts自動導出（`autoArticleFacts.ts`）

**2026-09-16続き7・マロン指示で新設**：「A候補をマロンが選定した後に、ArticleFactsを
人間が追加入力する運用は禁止」——admin画面での手入力・ready化は運用前提に**しない**。
Stage 1（A/B/C判定）より前に、DC保存済みの公式情報だけからArticleFactsを決定論的に
導出し、可能ならその場でready化する。

- 対象：`enrichmentStatus`が`ready`でなく、かつ人間が触れていない
  （`enteredBy`・`humanReviewedAt`のいずれも未設定の）候補。既に人間が入力・レビュー
  したArticleFactsは一切上書きしない
- 使うのは `DiscoveredContent.title` / `articleUrl` / `eventStartAt` / `eventEndAt` /
  Stage 2で確定済みの18カテゴリー、のみ（外部fetch・再クロール・AIは使わない）
- `templateType:'generic'`（専用テンプレのない種別向けの最小フォールバック。
  `venues`/`eventTime`/`areaLead`/`audienceNote`/`paid`を要求しない）に固定して導出——
  DiscoveredContentには`venue`等の構造化フィールドが無いため、これらを必須とする
  他テンプレート種別（exhibition/recurring_event等）では自動導出できない
- 導出する値は「既に確認済みの値の言い換え」のみ（新しい事実を主張しない）：
  `eventName`/`whatHappens`はDC.titleの整形版を再利用、`eventDate`はDC.eventStartAt/
  eventEndAtから整形、`sourceProvenanceFacts`は同じ日付を`confirmed`な出典事実として
  1件記録、`hashtags`は`#銀座`＋18カテゴリー、`officialInfoNote`は個別事実を含まない
  固定の定型文（「詳細・最新情報は公式サイトでご確認ください。」）
- タイトルが空・公式URLが無い・構造化開催期間（eventStartAt/eventEndAt）が無い、の
  いずれかに該当する場合は導出不能——**推測で埋めず**、不足項目を記録してStage 1へ渡す
  （Stage 1側は`articleFactsNotReady`としてB判定にする）
- 書き込みは `ArticleFacts.beforeChange`（`collections/ArticleFacts.ts`）の
  `applyArticleFactsReadyGate` を、`req.context.autoReadyFromSavedDcFacts:true` 経由で
  通す——この経路は Payload の Local API からサーバー側コードだけが設定できる
  `req.context` を使うため、admin画面・REST/GraphQL等の外部リクエストからは到達
  できない（「AI・自動化スクリプトからの直接遷移は不可」という既存の安全設計は
  外部経路に対しては無変更のまま）。ready化に必要な完全性チェック
  （`evaluateReadyGate`）自体は人間経路と完全に同一——チェックを緩めてはいない
- 自動導出でready化した行は `humanReviewedBy`/`humanReviewedAt` を設定しない
  （人間レビュー済みを装わない）。かわりに `notes` へ
  `[auto:readyFromSavedDcFacts] <日時> ...` と機械記録する（監査可能にする）
- `./p2 am-run`（Stage 1〜3の一括実行）の中で自動的に実行される（`--no-write`指定時は
  書き込まない＝読み取り専用実行を維持）

## 3. Stage 1：A/B/Cスクリーニング

**Aの必須条件**（すべて満たす）：
1. 公式情報である
2. 公式URLが保存されている（`hasTraceableSource`）
3. 銀座で利用・参加・購入できる（`ginzaRelevant`）
4. 開催・販売・提供の現在性が確認できる（構造化期間、またはタイトルに明示された
   具体的な年月日。「開催中」等の語だけでは現在性を認めない）
5. 終了済みではない（`expired`）
6. **ArticleFacts.enrichmentStatus==='ready'**（2026-09-16続き7追加。Stage 0の自動導出、
   または人間によるレビューのいずれかで到達した状態。「記事に必要な事実がDBへ保存
   されている」をArticleFactsという実体を伴う条件として明確化した）
7. 近似重複ではない（`recentBrandVenueDuplicate`）
8. 施設・親施設クールダウン（14日間）に該当しない

**B**：現在性不明・開催期間不明・近似重複・施設/親施設クールダウン・
**ArticleFacts未ready**（`articleFactsNotReady`）など、「現段階では安全に記事候補
として提示できない」状態。**削除しない**——条件を満たせば次回の再判定で自動的に
Aへ戻る（ArticleFacts未readyも同様——翌日以降のStage 0再実行で自動導出が成功すれば
Aに昇格しうる）。

**C**：終了済み・銀座対象外・公式情報なし・明確に古い情報・記事候補として利用不可。

**恒久ルール**：
- 本日の3本に選ばれなかったことを理由にAからBへ変更しない
- 本日選ばれなかったAは、翌日も有効条件を満たす限りAのまま保持する
- A/B/Cを目標件数へ合わせない・DC番号や件数をハードコードしない
- 不明点を推測で補完しない・不明な候補を追加調査で追い続けずBとして次へ進める
- **ArticleFactsのready化はStage 0の自動導出（またはStage 0以前に人間が済ませていた
  レビュー）に限る——A候補をマロンが選定した「後」に、admin画面で人間がArticleFacts
  を追加入力する運用は行わない**

## 4. Stage 2：18カテゴリー分類

`targetOrDiscoveryEligibility.ts` 内で `deriveProvisionalCategory` により算出する。
**A/B/Cが確定した後の付随情報**であり、分類結果によってA/B/Cを書き換えない。
分類できない候補は推測せず `category: null`（未分類）のまま返す——未分類であること
だけを理由にAからBへ変更することもしない（2026-09-16続き4で確定済み）。

## 5. Stage 3：A候補ボード（`candidateBoard.ts`）

```ts
buildCandidateBoard(assessments: CandidateAssessment[], usedDcIds: ReadonlySet<number>): CandidateBoard
```

- 対象はAかつ `usedDcIds` に含まれない候補のみ（未使用のA）
- `sweets`：SWEETSカテゴリーの候補（先頭の独立枠）
- `byCategory`：SWEETS以外のカテゴリー別（キー＝カテゴリー名）
- `unclassified`：未分類（Stage 4の選定対象外——カテゴリーを示せない候補は選ばない）
- 各候補は DC番号・タイトル・施設・開催/販売期間・カテゴリー・公式URL・A判定理由を持つ
- 並び順は `selectMorningThreeSlots.rankCandidatesByPriority`（優先順位の参考表示のみ、
  最終選定はマロンが行う）を再利用
- **読み取り専用**——A/B/C・カテゴリー・DBデータは一切変更しない

`usedDcIds` は「過去にマロンが実際に選定したDC」の集合であり、
`selectionRecord.collectUsedDcIds(records)` で選定記録から作る。**単に過去の候補
ボードに表示されただけの候補は使用済みにしない**——これが「本日選ばれなかったAが
翌日以降も候補ボードへ残る」ことを担保する仕組み。

`selectMorningThreeSlots.ts`（旧・自動3本確定）は削除せず残置したが、通常経路
（`buildMorningReport.ts`）からは外した。後方互換・単体テスト・将来の再利用のために
保持する。

## 6. Stage 4：マロンによる3本選定（`selectionRecord.ts` / `./p2 morning-select`）

```
./p2 morning-select <date> <dc1> <dc2> <dc3> [--by=<名前>] [--force]
```

- 入力：`.devlogs/morning/<date>/report.json` の `report.candidateBoard`（Stage 3の
  保存済み出力）。DBへの再クエリ・再取得はしない
- 出力：`.devlogs/morning/<date>/selection.json`（`MorningSelectionRecord`）。
  書き込みは **atomic write**（`atomicWriteFileSync`：一時ファイル書き込み→rename。
  途中経過の壊れたファイルを読み手が見ることはない）
- **2026-09-16続き6・厳格ゲート**（`validateSelectionForCommit`）：次のいずれか
  1つでも満たさない場合は**警告を表示して停止し、selection.json を一切保存しない**
  （自動代替もしない）——
  1. DC番号がちょうど3件指定されている
  2. 指定した3件がすべて当日の候補ボードに実在する（未分類・使用済み・B/C相当・
     存在しないDC番号はすべて拒否）
  3. 3件の中にSWEETSカテゴリーが最低1件含まれる
- 選定記録はA/B/C・カテゴリー・DiscoveredContent等のDBデータを一切変更しない
- 既存の選定記録がある日付への再選定は `--force` が無い限り拒否する（誤上書き防止。
  atomic write は書き込み直前にも再度存在確認し、他プロセスとの競合窓を狭める）
- 選定済み（過去のいずれかの `selection.json` の `picks` に含まれる）DCは、以後
  `collectUsedDcIds` により恒久的に候補ボードから除外される（時間窓なし）
- 低レベルの `buildSelectionRecord`（警告つきで記録だけを組み立てる。厳格ゲート無し）
  は既存の単体テストが検証する後方互換の挙動のまま残している。CLI
  （`./p2 morning-select`）は必ず `validateSelectionForCommit` 経由で呼ぶため、
  この緩い経路が実運用のファイル保存に使われることはない

## 7. Stage 5：選定後のnote原稿作成（`./p2 morning-draft-selected`）

```
./p2 morning-draft-selected <date> [--force]
```

**2026-09-16続き6改訂：追加費用0円の決定論的生成へ全面置き換え。** 旧実装
（Claude APIを呼ぶ `createMultiAngleDraftsFromDiscoveredContent`）は使用しない。
代わりに、以前から存在する「追加API課金0円で生成する純粋関数」群
（`mapDiscoveredContentToEventFields` → `buildTemplateArticleInput` →
`renderArticleFromTemplate`、いずれも2026-09-02〜の既存実装・新しい生成ロジックは
追加していない）を、新規の薄いラッパー `noteDraftFromSelection.
prepareNoteDraftFromSelection`（純粋関数・AI/DB/外部fetchなし）経由で呼ぶ。

- 対象：`.devlogs/morning/<date>/selection.json` の `picks` のみ（Stage 4で選定済みの
  3DCだけ）
- **URL再取得・再検索・再クロール・再裏どりを一切行わない**——DiscoveredContent /
  ArticleFacts の DB 読み取りのみ（外部ネットワークへは一切アクセスしない）
- **フェーズ1（検証）**：3件それぞれについて①選定時に記録した `sourceUrl` と現在の
  DBの `DiscoveredContent.articleUrl` を突合（不一致は「データ不整合」）②
  `mapDiscoveredContentToEventFields` の `templateEligible`（タイトル・開催期間・
  施設・公式URL等の必須項目が揃い、かつ `ArticleFacts.enrichmentStatus==='ready'`
  であること）を確認。どちらかに該当すれば「停止」対象とし、理由を記録する
  （推測で埋めない）
- **all-or-nothing**：3件のうち1件でも停止対象があれば、**どの件も保存しない**
  （途中までの原稿・不完全なデータを保存しない）。全3件が検証を通過した場合のみ
  フェーズ2（生成・保存）へ進む
- **フェーズ2（生成・保存）**：`renderArticleFromTemplate` でタイトル・note本文・
  ハッシュタグ・出典・CTAを決定的に生成し、3件まとめて
  `.devlogs/morning/<date>/note-drafts.json` へ atomic write する
- 公式情報に記載がない任意項目は既存テンプレート（`readyGate.ts` / 
  `renderArticleFromTemplate.ts`）の方針どおり「公式記載なし」相当で扱う（新しい
  推測ロジックは追加していない）
- **二重生成防止**：`note-drafts.json` が既に存在する場合は `--force` が無い限り
  拒否する
- **費用**：Claude API・OpenAI API・その他有料APIを一切呼ばない。追加費用0円
  （フラグ不要——コストゲートとしての `--yes` は廃止した。`--force` は「二重生成の
  上書き許可」のみを意味する）

## 8. データ形式

- `.devlogs/morning/<date>/report.json`：`report.candidateBoard` に Stage 3 の
  ボードを保持（既存の `report.json` 保存処理は変更していない・追加のみ）
- `.devlogs/morning/<date>/selection.json`：Stage 4 の選定記録（atomic write）
  （`MorningSelectionRecord`：`date` / `selectedAt` / `selectedBy` / `picks[]`
  （`discoveredContentId` / `title` / `category` / `facilityLabel` / `sourceUrl` /
  `rank`）/ `sweetsSatisfied` / `warnings[]` / `rejected[]`）
- `.devlogs/morning/<date>/note-drafts.json`：Stage 5 の生成物（atomic write）
  （`date` / `generatedAt` / `method:'template'` / `selectionRecordSelectedAt` /
  `drafts[]`（`discoveredContentId` / `title` / `titleCandidates` / `noteBody` /
  `charCount` / `hashtags` / `provenance` / `callToAction` / `category` /
  `facilityLabel` / `sourceUrl`)）。**noteへの転記・投稿・公開はしない**——この
  ファイルはマロンが確認したうえで手動転記するための下書きデータ

## 9. CLI コマンド一覧

| コマンド | 段階 | 費用 |
|---|---|---|
| `./p2 am-run` / `./p2 morning` | Stage 0〜3（ArticleFacts自動導出・判定・分類・ボード保存） | 0円（--fetch時のみ許可ドメインへのGETのみ。`--no-write`でStage 0の書き込みも抑止） |
| `./p2 morning-select <date> <dc1> <dc2> <dc3>` | Stage 4 | 0円（ファイルI/Oのみ） |
| `./p2 morning-draft-selected <date>` | Stage 5 | 0円（有料APIを一切呼ばない決定論的生成） |

## 10. 10月1日V1運用に残る具体的な未達事項

- **2026-09-16続き7で解消**：ArticleFactsのready化は「人間が事後入力する」運用を
  廃止し、Stage 0（`autoArticleFacts.ts`）による自動導出へ全面置き換えた。実データ
  （2026-09-16保存済みDB、1181件）で実際に`./p2 am-run`（書き込みあり）を1回実行し
  検証：**現行A候補4件（DC#59・#438・#441・#779）はすべて自動ready化に成功**
  （`templateType:'generic'`、`humanReviewedBy`は未設定のまま・`notes`に
  `[auto:readyFromSavedDcFacts]`の機械記録あり）。この実行で対象条件を満たす
  候補39件のArticleFactsが新規作成された（B判定のまま残る候補にも他の理由
  〈facilityCooldown等〉とは独立にArticleFacts自体は導出・保存される設計のため）。
  DB検証用の事前バックアップは`_backups/article_facts_before_auto_ready_20260916.sql`。
  **ただしDiscoveredContentに`venue`等の構造化フィールドが無いため、導出できる
  ArticleFactsは`templateType:'generic'`（最小構成）に限られる**——venues／
  eventTime／areaLead／audienceNoteを要求するexhibition/recurring_event等の
  リッチなテンプレートは自動導出の対象外のまま（DC側に該当フィールドが増えない
  限り、これらの種別は引き続き未ready＝Bにとどまる）
- SWEETS・その他カテゴリーの母数不足（本日の保存済みデータでは A=4、SWEETS
  候補0件）——収集・スコアリング側の改善が必要（本V1確定作業のスコープ外）
- 複数日にまたがる選定記録のスキャン範囲（既定400日）が運用上十分か、実運用で
  再確認が必要
- `selection.json` / `note-drafts.json` の同時書き込みは atomic write で
  「壊れたファイルを読む」事故は防げるが、「2人が同時に別内容で選定・生成しようと
  した場合にどちらが勝つか」という完全な排他制御ではない（現状は単一オペレーター
  運用を前提とした実用的な対策）
- Stage 5 が生成した `note-drafts.json` を、実際に note へ転記する際の具体的な
  手順（コピー方法・画像添付・マストヘッド挿入等）は、既存の
  `GINZA_JOHOKYOKU_SPEC.md` §3・§7 の方針を踏襲する想定だが、本V1確定作業では
  自動化・手順書化していない（マロンが `note-drafts.json` の `noteBody` を見て
  手動転記する）

## 11. 明朝（2026-09-17）の運用手順

各段階の実行コマンド・成功時表示・失敗時の停止理由をこの順で実行する。

### ① 6時処理結果の確認

```
./p2 status   またはログ確認：cat .devlogs/morning/2026-09-17/report.txt
```
- **成功時**：6:00収集のDiscoveredContent件数・完了ログが表示される
- **失敗時の停止理由**：収集ジョブ未実行／DB未起動——`./p2 start` でDocker/Postgres/
  Payloadを起動してから再確認する

### ② 候補ボード生成（Stage 0のArticleFacts自動導出を含む）

```
./p2 am-run --limit=1500 --json
```
- `--no-write` を付けない——Stage 0（ArticleFacts自動導出・DC保存済み公式情報だけ
  からの決定論的な書き込みのみ、追加課金なし）を実行するため。読み取り専用の
  事前確認だけしたい場合は `--no-write` を付けてよいが、その場合Stage 0は
  スキップされ、既存のArticleFactsだけでA/B/C判定される
- **成功時**：標準出力の `[machine]` 行に `counts:{A,B,C}` と
  `.devlogs/morning/2026-09-17/report.json`（`report.candidateBoard` を含む）の
  保存パスが表示される
- **失敗時の停止理由**：DB接続失敗／ロック（`.devlogs/morning/.lock`）が残っている
  場合は前回実行が異常終了している可能性——ロックファイルの状況を確認してから
  再実行する

### ③ マロンが3件のDC番号を選定（候補ボードを見て判断）

候補ボードは `report.json` の `report.candidateBoard`、または
`.devlogs/morning/2026-09-17/report.txt`（`■ Stage 3：A候補ボード` 節）で確認する。
SWEETS枠・その他カテゴリー別に並んでいるDC番号から3件（SWEETS最低1件）を選ぶ。

### ④ 選定記録作成

```
./p2 morning-select 2026-09-17 <dc1> <dc2> <dc3>
```
- **成功時**：`{"saved":true,"path":".../selection.json",...}` が表示され、
  `selection.json` が作成される
- **失敗時の停止理由**：3件指定でない／SWEETSが無い／候補ボードに存在しないDC番号を
  含む、のいずれか——エラーメッセージの箇条書きを見て選び直す（自動代替はしない）。
  既に本日分の `selection.json` がある場合は「既に存在します」——上書きする場合は
  `--force` を明示指定する

### ⑤ 追加費用0円のnote原稿生成

```
./p2 morning-draft-selected 2026-09-17
```
- **成功時**：`{"saved":true,"path":".../note-drafts.json","count":3,...}` が表示され、
  3件分の `noteBody`・`hashtags`・`callToAction` 等を含む `note-drafts.json` が
  作成される
- **失敗時の停止理由**：選定した3件のいずれかで①選定時と現在のDB値が食い違う
  （データ不整合）②`ArticleFacts` が `ready` 化されていない／必須項目が不足、の
  いずれか——`stopped` の一覧に理由が出る。②は候補ボードに載った時点（Stage 1の
  A判定がArticleFacts readyを必須条件にしているため）で通常は発生しないが、
  ②の候補ボード生成から⑤の実行までの間にデータが変わった場合の保険として
  存在する。人間がArticleFactsを手動入力してready化する運用は行わない——
  発生した場合は ②（`./p2 am-run`）を再実行してStage 0の自動導出をやり直し、
  それでも解消しなければDiscoveredContent側の情報（タイトル・公式URL・
  開催/販売期間）が自動導出に必要な最低限を満たしていない（`autoArticleFacts.ts`
  の対象外）と判断し、その3件目の選定をやり直す（`--force`は「二重生成の上書き
  許可」のみで、データ不足そのものは解消しない）

### ⑥ 生成内容をマロンが確認

```
cat .devlogs/morning/2026-09-17/note-drafts.json
```
- 3件それぞれの `title` / `noteBody` / `hashtags` / `callToAction` を確認する
- 確認の結果、内容を修正したい場合は `note-drafts.json` を直接編集するか、
  `ArticleFacts` を修正のうえ `./p2 morning-draft-selected 2026-09-17 --force` で
  再生成する

### ⑦ マロンがnoteへ手動転記

このV1確定作業ではnoteへの自動転記・投稿・公開は実装していない。`note-drafts.json`
の `noteBody` をマロンが note の編集画面へ手動で貼り付け、画像・マストヘッド等
（`GINZA_JOHOKYOKU_SPEC.md` §3・§6・§7 の既存方針）を人手で整えたうえで、
マロンの判断で公開する。
