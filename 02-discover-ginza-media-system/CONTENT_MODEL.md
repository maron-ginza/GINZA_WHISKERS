# Discover GINZA Media System — コンテンツモデル設計（Phase 1）

**位置づけ**：`ARCHITECTURE_DRAFT.md`（承認済み）第2.4節 Content Asset
Repositoryの具体スキーマ。技術選定（第6章）に先立つ論理データモデルの
設計であり、特定のCMS/DB製品を前提としない（憲章第6章の順序：情報設計・
コンテンツモデルが固まってから技術選定に進む、に従う）。

**2026-07-21更新**：デザイン方針（CLAUDE.md第5章）が「台紙・アーカイブ」に
正式確定したことを受け、アーカイブとしての構造要件（資料番号・年代軸・
台帳インデックス）をArticleスキーマに反映した。

---

## 1. エンティティ一覧

- **Article**（記事＝Content Asset Repositoryの本体）
- **Source**（情報収集で登録されるネタ・素材）
- **ImageAsset**（画像管理のアセット）
- **Tag**（6本柱＋自由タグ。マスタ管理）

---

## 2. Article（記事）

| フィールド | 型・構造 | 備考 |
|---|---|---|
| `id` | ID | |
| `status` | `draft` \| `review` \| `approved` \| `published` | 2.2節の状態遷移 |
| `title` | `{ ja: string, en: string }` | 言語別 |
| `slug` | `{ ja: string, en: string }` | URL用。言語別に発行 |
| `body` | `{ ja: Block[], en: Block[] }` | 構造化ブロック（後述） |
| `pillars` | `Tag[]`（6本柱、1件以上必須） | 歴史・文化・アート・建築・人物・イベント。デザイン上の「収蔵室（Collections）」に対応 |
| `free_tags` | `string[]` | 任意タグ |
| `accession_number` | `string`（一意） | 資料番号。形式 `GW・{represented_year もしくは登録年}・{連番3桁}`（例：`GW・1923・014`）。承認時に自動採番し、以後不変とする |
| `represented_year` | `number \| null` | 記事が扱う対象（写真・出来事）の年。特定の年に紐づかない記事は`null` |
| `historical_period` | `明治・大正` \| `昭和(戦前)` \| `昭和(戦後-30年代)` \| `昭和(40-50年代)` \| `平成以降` \| `null` | 「年代から辿る」ブラウズ軸。`represented_year`から下表（2.1節）の対応で自動分類し、必要に応じて編集長が手動で上書きできる |
| `images` | `ImageRef[]` | 役割付き（hero/inline/gallery） |
| `seo` | `SEOMetadata` | 後述 |
| `social_copy` | `SocialCopy` | 後述。本文と同時にAI生成、編集長レビュー対象 |
| `translation_status` | `{ ja: TranslationState, en: TranslationState }` | 第7章の未決事項に紐づく状態管理のみ先行実装 |
| `publish_history` | `PublishRecord[]` | 後述 |
| `source_refs` | `Source[]`（参照） | この記事の元になったソース |
| `ai_generated_by` | `string`（モデル/バージョン識別） | 生成物のトレーサビリティ |
| `reviewed_by` / `approved_by` | 人間の識別子 | 承認ログ（`ARCHITECTURE_DRAFT.md` 2.5節 承認キュー） |
| `created_at` / `updated_at` | timestamp | |

### 2.1 `historical_period` 分類表（年代から辿るブラウズ軸）

`represented_year`から以下の対応で自動分類する。デザイン確認セッションで
確定した「年代から辿る」チップ（`ARCHITECTURE_DRAFT.md`関連の精緻化
デザインで導入）に対応する。

| `represented_year` の範囲 | `historical_period` |
|---|---|
| 〜1925年 | 明治・大正 |
| 1926〜1945年 | 昭和(戦前) |
| 1946〜1959年 | 昭和(戦後-30年代) |
| 1960〜1988年 | 昭和(40-50年代) |
| 1989年〜 | 平成以降 |

複数の年代にまたがる記事（例：柳並木の通史）は、記事が最も重点的に
扱う年代を編集長が手動選択できるものとし、自動分類は初期値の提案に
留める。

### 2.2 `Block`（構造化本文の最小単位）

見出し・段落・引用・画像埋め込みをブロック単位で保持し、チャネルごとの
機械的な整形（note用Markdown化、抜粋生成等）を可能にする。

```
Block = 
  | { type: "heading", level: 2 | 3, text: string }
  | { type: "paragraph", text: string }
  | { type: "quote", text: string, attribution?: string }
  | { type: "image", ref: ImageRef, caption?: string }
```

### 2.3 `TranslationState`

`not_started` | `in_progress` | `complete`
（第7章の翻訳ワークフロー決定後、フィールド単位の粒度に拡張する余地を
残す。MVPでは言語単位で十分とする）

### 2.4 `SEOMetadata`

| フィールド | 型 |
|---|---|
| `meta_title` | `{ ja: string, en: string }` |
| `meta_description` | `{ ja: string, en: string }` |
| `og_image` | `ImageRef` |

### 2.5 `SocialCopy`

チャネルごとに文字数制約・トーンが異なるため、独立したバリアントとして
保持する。

| フィールド | 型 |
|---|---|
| `note` | `{ ja: string, en: string } \| null` |
| `x` | `{ ja: string, en: string } \| null` |
| `instagram` | `{ ja: string, en: string } \| null` |

各バリアントはAIが記事本文と同時に下書き生成し、編集長レビューで本文と
一括承認される（`ARCHITECTURE_DRAFT.md` 2.2節）。

### 2.6 `PublishRecord`

| フィールド | 型 |
|---|---|
| `channel` | `site` \| `note` \| `x` \| `instagram` \| `newsletter` |
| `published_at` | timestamp \| null |
| `published_by` | 人間の識別子（API自動送信の場合は承認者） |
| `reference` | 配信先URL・投稿IDなど（noteは手動投稿のため空欄許容） |

同一記事の再利用・再配信時の二重配信防止に使う（`ARCHITECTURE_DRAFT.md`
2.4節）。

---

## 3. Source（情報収集）

| フィールド | 型 | 備考 |
|---|---|---|
| `id` | ID | |
| `type` | `url` \| `text_note` \| `image` \| `pdf` | |
| `content_ref` | URLまたはファイル参照 | |
| `pillars` | `Tag[]` | |
| `status` | `untouched` \| `in_progress` \| `used` | |
| `created_at` | timestamp | |

Phase 1では人間が手動登録する前提（`ARCHITECTURE_DRAFT.md` 2.1節）。
自動収集はPhase 3で拡張。

---

## 4. ImageAsset（画像管理）

| フィールド | 型 | 備考 |
|---|---|---|
| `id` | ID | |
| `original_file_ref` | ファイル参照 | |
| `rights` | `{ owner: string, license_type: string, usage_notes?: string, requires_attribution: boolean }` | archival photoの権利確認に必須 |
| `alt_text` | `{ ja: string, en: string }` | アクセシビリティ・多言語 |
| `pillars` | `Tag[]` | |
| `derived_variants` | `Variant[]` | チャネル別クロップ |

### 4.1 `Variant`

| フィールド | 型 |
|---|---|
| `purpose` | `gallery` \| `instagram_square` \| `instagram_portrait` \| `x_landscape` \| `note_header` |
| `file_ref` | ファイル参照 |
| `dimensions` | `{ width: number, height: number }` |

### 4.2 `ImageRef`（Article/Blockから参照される軽量参照型）

`{ asset_id: ID, variant?: Variant["purpose"] }`

---

## 5. Tag（マスタ）

- `pillar`タイプ：歴史／文化／アート／建築／人物／イベント（固定6値、
  Root第2章）
- `free`タイプ：自由入力（記事・ソース・画像に共通で使えるマスタとして
  正規化し、表記ゆれを防ぐ）

---

## 6. 未決事項（このモデルの前提として残るもの）

- 具体的な保存先（RDB／ドキュメントDB／ヘッドレスCMSのコンテンツタイプ
  としての実装）は第6章の技術選定セッションで確定する。本モデルは
  その選定に依存しない論理設計として維持する。
- `translation_status`のフィールド単位化は、第7章の翻訳ワークフロー
  決定後に再検討する。
- `Block`型の種類（引用・画像以外に年表・地図埋め込み等を追加するか）は
  実際の記事執筆運用を見ながら拡張する。

## 7. 次のステップ

1. 本モデルのレビュー・承認
2. Phase 1の残タスク（画像管理基盤、情報収集の受け皿、AI記事生成
   パイプライン、編集長レビューUI、02サイト公開パイプライン）に着手
3. 技術選定セッション（第6章）で、本モデルを実装する具体的な保存先を決定
