# Discover GINZA CMS (Payload)

`CONTENT_MODEL.md` / `TECH_SELECTION_DRAFT.md` に基づく、手書きのPayload CMS
プロジェクト（Payload公式 `create-payload-app` の対話式CLIがこのサンドボックス
環境のTTY制約で使えなかったため、`blank`テンプレート相当の構成を直接記述した）。

## セットアップ

```bash
npm install
cp .env.example .env   # DATABASE_URI / PAYLOAD_SECRET 等を設定
npm run generate:importmap
npm run generate:types
npm run dev
```

- `DATABASE_URI` に接続可能なPostgresが必要（ローカルDocker、またはRailway等）。
- 初回起動時、管理画面（`/admin`）からユーザー作成が求められる。

## 収録コレクション

`src/collections/` 配下、`CONTENT_MODEL.md` のエンティティに1:1対応。

- `Articles`（`articles`）— Content Asset Repository本体
- `Sources`（`sources`）
- `ImageAssets`（`image-assets`）— Payload標準の`imageSizes`で
  `derived_variants`（CONTENT_MODEL.md 4.1節）を自動生成
- `Tags`（`tags`）— 収蔵室（6本柱固定値）＋自由タグ
- `Users`（`users`）— Payload標準の認証コレクション（編集長/編集ロール）

## 設計上のメモ

- `body`（Article）はCONTENT_MODEL.md 2.2節のBlock型を手作りせず、Payload
  標準のLexicalリッチテキストで表現している（見出し/段落/引用/画像埋め込みが
  標準ノードとして揃うため）。
- `title` / `slug` / `body` / `seo.*` / `socialCopy.*` はPayloadの
  `localized: true` を使い、`{ ja, en }` 構造を1フィールドの多言語値として
  表現している（`localization.locales = ['ja', 'en']`、`payload.config.ts`）。
- `accessionNumber`（資料番号）は`Articles`の`beforeChange`フックで、
  `status`が初めて`approved`になった瞬間に自動採番し、以後不変（読み取り専用
  フィールド）。
- `historicalPeriod`（年代から辿る）は`representedYear`から自動分類し、
  編集長が明示的に値を指定した場合はそちらを優先する（CONTENT_MODEL.md 2.1節）。
- 画像ストレージは`@payloadcms/storage-s3`でCloudflare R2（S3互換API）に接続する
  想定（`TECH_SELECTION_DRAFT.md` 3節）。

## 未検証事項（このサンドボックス環境の制約）

このサンドボックスにはNode.js/npmは導入済みだが、Docker・ローカルPostgres・
実ネットワーク経由のDBがないため、以下は**未実行・未検証**：

- `npm install` の完全な依存解決（レジストリ到達性は`npm view`で確認済み）
- 実際の`next dev` / `next build` 起動
- Payloadマイグレーション・管理画面からの疎通確認

ローカル環境（Docker Postgresが使えるマシン）で上記セットアップ手順を
実行し、動作確認すること。
