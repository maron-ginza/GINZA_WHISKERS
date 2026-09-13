# GINZA WHISKERS Note Auto-Transfer（Chrome拡張）

2026-09-14新設。承認済み（`reviewStatus=approved`）のProject 02記事を、
`cms/src/scripts/noteTransferServer.ts`（`./p2 note-transfer serve`）経由で
note.comの下書きへ自動転記する。**公開（「公開する」ボタン）には一切触れない**。

## 背景

Claude in Chromeのscript injection（オンデマンドJS注入）はnote.comのSPAへ
繰り返しタイムアウトし（2026-09-02・2026-09-13で再現）、マロン指示によりこの
経路の使用・再試行を禁止した。本拡張は代わりに、Chromeの`content_scripts`
宣言的マッチング（ページ読み込み時にブラウザ自身が自動注入する仕組み。
Claude in Chromeのオンデマンド注入とは別の経路）を使うことで、同じ
タイムアウト障害を回避する設計。

## 構成

- `manifest.json`：Manifest V3。`https://note.com/notes/new*` への遷移時に
  `content.js`を自動注入する。
- `background.js`：ローカルサーバー（既定 `http://localhost:4601`）へ約20秒
  ごとに問い合わせ、未転記の承認済み記事があればnote.comの新規投稿タブを開く。
- `content.js`：note.comの新規投稿画面でタイトル・本文・ハッシュタグ・
  カテゴリーアイコンを入力し、「下書き保存」ボタンのみをクリックする
  （「公開」を含むテキストのボタンは対象から明示的に除外）。

## 導入手順（一回限り・マロンの手動操作が必要）

1. ターミナルで `./p2 note-transfer serve` を実行し、ローカルサーバーを起動した
   状態にしておく（このサーバーが動いている間だけ自動転記が機能する）。
2. Chromeで `chrome://extensions` を開く。
3. 右上の「デベロッパーモード」をONにする。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、この
   `chrome-extension/` ディレクトリを選択する。
5. 拡張機能がロードされると、以後は自動的に動作する——マロンが追加で
   note.comを開いたりログインしたりする操作は不要（既にnote.comへログイン
   済みのChromeであれば、拡張が自動的に新規投稿タブを開いて転記する）。

拡張のコード（`background.js`/`content.js`）を更新した場合は、
`chrome://extensions` の当該拡張の「再読み込み」ボタンを押す必要がある
（Chromeの仕様上、これは自動化できない）。

## 安全境界

- 「公開する」「公開に進む」等、テキストに「公開」を含むボタンは
  content.js内で明示的に除外しており、クリック対象にならない。
- ローカルサーバーは`127.0.0.1`のみで待ち受け、外部ネットワークには
  公開しない。
- 同一記事の二重転記は、ローカルサーバー側の状態管理
  （`.devlogs/night/transfer-state.json`、`in_progress`/`success`/`failed`）
  で防止する。
- 失敗は3回まで自動リトライし、3回失敗した記事はそれ以上再試行しない
  （`./p2 note-transfer status` で理由を確認できる）。
- パスワード等の認証情報は一切扱わない（マロンの既存ログインセッションを
  そのまま利用するのみ）。
