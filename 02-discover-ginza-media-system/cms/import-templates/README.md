# TNS MusicTracks 候補曲インポートテンプレート

🌈Tokyo Nostalgic Soundtrack（TNS）の`MusicTracks`（楽曲マスタ）へ候補曲を
一括登録するためのテンプレート。実行は`./p2 tns import-tracks <file> [--dry-run]`
（`cms/src/scripts/importTnsMusicTracks.ts`）。

**重要**：ここに登録される曲はすべて`verified=false`（候補・未確認）として
扱われる想定です。`verified=true`への変更は、必ずPayload管理画面で人間が
1件ずつ確認してから行ってください（一括インポートではverified=trueを
一括で流し込まない運用を推奨します）。

## 必須項目

| 項目 | 内容 |
|---|---|
| `title` | 曲名 |
| `artist` | アーティスト名 |
| `releaseYear` | 発表年（整数）。**年代の上限・下限は設けていません**——TNSは1990年代以降の楽曲を機械的に除外する企画ではないため。**実在確認できた正式な発表年のみを記入し、確認できない場合はこの時点で記入せず、先に人間が確認してから記入すること** |
| `japaneseOrWestern` | `japanese` または `international` のみ |
| `verified` | `TRUE` / `FALSE`（空欄は`FALSE`扱い） |
| `active` | `TRUE` / `FALSE`（空欄は`TRUE`扱い） |
| `sourceNote` | なぜこの曲を候補にしたか・どう確認したかを一言（このインポートでは空欄不可） |

## 任意項目

| 項目 | 内容 |
|---|---|
| `genre` | 昭和歌謡／City Pop／日本映画音楽／Jazz／Standard／Oldies／Pops／映画音楽／その他 のいずれか |
| `country` | 自由記述（例：Japan／United States） |
| `language` | 自由記述（例：Japanese／English） |
| `moodTags` | 複数値。CSVはセミコロン`;`区切り（例：`夜;静けさ`）、JSONは配列 |
| `weatherTags` | 同上（例：`雨;曇り`） |
| `seasonTags` | `SPRING`/`SUMMER`/`AUTUMN`/`CHRISTMAS`/`NEW_YEAR`/`WINTER`のみ、複数可 |
| `ginzaCodeTags` | `code1`〜`code7`のみ、複数可 |

## 記入例（CSV1行分）

```
September,Earth Wind & Fire,1978,international,FALSE,TRUE,自分の記憶で確認・要検証,,,,,,,
```

## 記入例（JSON1件分）

```json
{
  "title": "September",
  "artist": "Earth, Wind & Fire",
  "releaseYear": 1978,
  "japaneseOrWestern": "international",
  "verified": false,
  "active": true,
  "sourceNote": "自分の記憶で確認・要検証"
}
```

## 安全機構（自動）

- **重複チェック**：title×artistを正規化したフィンガープリントで、①インポートファイル内の重複、②既存MusicTracks全件との重複、の両方を検出しスキップする（`lib/tns/trackIdentity.ts`を再利用）
- **必須項目不足はエラーとして登録しない**：該当行はスキップされ、理由付きでレポートされる
- **dry-runモード**：`--dry-run`を付けると、実際にはDBへ何も書き込まず「何が作成されるか」だけを確認できる
- **eraEligibility**：1926〜1989年なら自動的に`showa`、それ以外は`exception`として登録する（`out_of_scope`にはならない——TNSは年代で機械的に除外しないため）。これは選曲対象からの除外を意味せず、`verified=false`である限りいずれにせよ自動選曲の対象にはならない
