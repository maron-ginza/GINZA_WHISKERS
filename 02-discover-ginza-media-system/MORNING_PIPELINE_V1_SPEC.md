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
| 1 | A/B/Cスクリーニング | `assessCandidate.ts` / `targetOrDiscoveryEligibility.ts`（無変更） | 記事化に必要な裏どりが完了した候補をAとする |
| 2 | 18カテゴリー分類 | `targetOrDiscoveryEligibility.ts`（無変更、`deriveProvisionalCategory`） | A候補を18カテゴリーへ分類する。A/B/Cとは独立 |
| 3 | A候補ボード作成 | `candidateBoard.ts`（新規） | Aかつ未選定の候補をSWEETS独立枠＋その他カテゴリー別＋未分類、に整理して表示する。最終3本は確定しない |
| 4 | マロンによる3本選定 | `selectionRecord.ts`（新規）＋ `./p2 morning-select` | 候補ボードから人間が3本を選ぶ。A/B/Cとは別の記録として保存する |
| 5 | 選定後のnote原稿作成 | `./p2 morning-draft-selected` | 選定済みの3本だけを対象に、保存済み情報だけで原稿を作る。再裏どりはしない |

いずれの段階も、**後段の都合で前段の判定結果（A/B/C・カテゴリー）を書き換えない**。
これが V1 の中核原則。

## 2. Stage 1：A/B/Cスクリーニング

実装は既存のまま固定する（今回の作業では変更していない）。

**Aの必須条件**（すべて満たす）：
1. 公式情報である
2. 公式URLが保存されている（`hasTraceableSource`）
3. 銀座で利用・参加・購入できる（`ginzaRelevant`）
4. 開催・販売・提供の現在性が確認できる（構造化期間、またはタイトルに明示された
   具体的な年月日。「開催中」等の語だけでは現在性を認めない）
5. 終了済みではない（`expired`）
6. 記事に必要な事実がDBへ保存されている（DiscoveredContentの構造化フィールド由来）
7. 近似重複ではない（`recentBrandVenueDuplicate`）
8. 施設・親施設クールダウン（14日間）に該当しない

**B**：現在性不明・開催期間不明・近似重複・施設/親施設クールダウン・裏どり不足など、
「現段階では安全に記事候補として提示できない」状態。**削除しない**——条件を満たせば
次回の再判定で自動的にAへ戻る。

**C**：終了済み・銀座対象外・公式情報なし・明確に古い情報・記事候補として利用不可。

**恒久ルール**：
- 本日の3本に選ばれなかったことを理由にAからBへ変更しない
- 本日選ばれなかったAは、翌日も有効条件を満たす限りAのまま保持する
- A/B/Cを目標件数へ合わせない・DC番号や件数をハードコードしない
- 不明点を推測で補完しない・不明な候補を追加調査で追い続けずBとして次へ進める

## 3. Stage 2：18カテゴリー分類

`targetOrDiscoveryEligibility.ts` 内で `deriveProvisionalCategory` により算出する。
**A/B/Cが確定した後の付随情報**であり、分類結果によってA/B/Cを書き換えない。
分類できない候補は推測せず `category: null`（未分類）のまま返す——未分類であること
だけを理由にAからBへ変更することもしない（2026-09-16続き4で確定済み）。

## 4. Stage 3：A候補ボード（`candidateBoard.ts`）

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

## 5. Stage 4：マロンによる3本選定（`selectionRecord.ts` / `./p2 morning-select`）

```
./p2 morning-select <date> <dc1> [dc2] [dc3] [--by=<名前>] [--force]
```

- 入力：`.devlogs/morning/<date>/report.json` の `report.candidateBoard`（Stage 3の
  保存済み出力）。DBへの再クエリ・再取得はしない
- 出力：`.devlogs/morning/<date>/selection.json`（`MorningSelectionRecord`）
- 検証：候補ボードに実在する（未使用のA）候補だけを `picks` にする。ボードに無い
  DC番号（未分類・使用済み・存在しない等）は `rejected` へ理由つきで記録し、
  推測で補完しない
- **1日3本・SWEETSから必ず1本**という条件を満たさない選定にも警告
  （`warnings`）を出すのみで、**自動代替はしない**——記録自体はそのまま保存する
- 選定記録はA/B/C・カテゴリー・DiscoveredContent等のDBデータを一切変更しない
- 既存の選定記録がある日付への再選定は `--force` が無い限り拒否する（誤上書き防止）
- 選定済み（過去のいずれかの `selection.json` の `picks` に含まれる）DCは、以後
  `collectUsedDcIds` により恒久的に候補ボードから除外される（時間窓なし）

## 6. Stage 5：選定後のnote原稿作成（`./p2 morning-draft-selected`）

```
./p2 morning-draft-selected <date> [--yes]
```

- 対象：`.devlogs/morning/<date>/selection.json` の `picks` のみ（Stage 4で選定済みの
  DCだけ）
- **URL再取得・再検索・再クロール・再裏どりを一切行わない**——選定時に記録した
  `sourceUrl` と現在のDBの `DiscoveredContent.articleUrl` を突合するだけ（外部
  ネットワークへは一切アクセスしない）
- 不一致があれば「データ不整合」としてそのDCだけ停止・報告する（再調査・推測はしない。
  他のDCの処理は続行する）
- 記事生成は既存の `createMultiAngleDraftsFromDiscoveredContent`（CORE角度のみ、
  `draft-today` と同じ方針）をそのまま再利用する。この関数は
  `DiscoveredContent.curationStatus === 'approved'` を必須とする既存ゲートを持つ——
  Stage 4の選定記録があっても未承認なら「承認が必要」としてブロックする
  （本スクリプトは承認状態を変更しない。既存のMaron Editor's Choice承認フローを
  別途通す必要がある）
- 公式情報に記載がない内容は「公式記載なし」として扱う（既存 Editorial Trust
  Layer の生成プロンプト側の方針をそのまま踏襲。新しい推測ロジックは追加していない）
- **費用ガード**：`--yes` 未指定（既定）はAPI呼び出しなしの計画表示のみ。`--yes`
  指定時のみ Claude API を選定件数分だけ呼ぶ（課金発生）。**本仕様確定作業の中では
  一度も実行していない**

## 7. データ形式

- `.devlogs/morning/<date>/report.json`：`report.candidateBoard` に Stage 3 の
  ボードを保持（既存の `report.json` 保存処理は変更していない・追加のみ）
- `.devlogs/morning/<date>/selection.json`：Stage 4 の選定記録
  （`MorningSelectionRecord`：`date` / `selectedAt` / `selectedBy` / `picks[]`
  （`discoveredContentId` / `title` / `category` / `facilityLabel` / `sourceUrl` /
  `rank`）/ `sweetsSatisfied` / `warnings[]` / `rejected[]`）

## 8. CLI コマンド一覧

| コマンド | 段階 | 費用 |
|---|---|---|
| `./p2 am-run` / `./p2 morning` | Stage 1〜3（判定・分類・ボード保存） | 0円（--fetch時のみ許可ドメインへのGETのみ） |
| `./p2 morning-select <date> <dc..>` | Stage 4 | 0円（ファイルI/Oのみ） |
| `./p2 morning-draft-selected <date> [--yes]` | Stage 5 | `--yes` 時のみ Claude API 課金 |

## 9. 10月1日V1運用に残る具体的な未達事項

- Stage 5 の実行未検証（`--yes` を一度も実行していない。実 Claude 呼び出し・
  `curationStatus=approved` との接続動線の実地確認が必要）
- Stage 4 → Stage 5 の間に必要な「Maron Editor's Choice承認」（既存の別UI／
  `curationStatus` 変更フロー）と、本V1の選定記録との接続手順が未文書化
  （現状は「別途承認してください」という警告表示のみ）
- SWEETS・その他カテゴリーの母数不足（本日の保存済みデータでは A=4、SWEETS
  候補0件）——収集・スコアリング側の改善が必要（本V1確定作業のスコープ外）
- 複数日にまたがる選定記録のスキャン範囲（既定400日）が運用上十分か、実運用で
  再確認が必要
- `selection.json` の同時書き込み競合（複数人・複数プロセスからの同時実行）は
  未考慮（現状は単一オペレーター運用を前提）
