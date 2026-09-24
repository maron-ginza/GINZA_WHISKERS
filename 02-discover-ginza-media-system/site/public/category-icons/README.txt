GINZA WHISKERS / Project 02（2026-09-24追加）

主カテゴリー8分類の完成版アイコン（マロン提供）。
正本は ../../../media/discover-ginza-category-icons/ 配下（このディレクトリはそこから
astro の public/ へコピーしたもの＝サイト公開用の複製。中身の変更は正本側で行い、
再度ここへコピーすること）。

ファイル名とカテゴリーの対応（cms/src/lib/pipeline/primaryCategory8.ts が正本）：
  01_sweets.png               スイーツ
  02_gourmet.png               グルメ
  03_shopping.png              ショッピング
  04_art_culture.png           アート・文化
  05_music_stage.png           音楽・舞台
  06_beauty_wellness.png       ビューティー・ウェルネス
  07_learning_experience.png   学び・体験
  08_seasonal_events.png       季節の催し

公開URL（このサイトのデプロイ後）： <site>/category-icons/<ファイル名>

現時点では、このフォルダに置いただけで自動的に画面へ出るわけではない。
Project 01母艦「最新のジャーナル」フィード（/ja/latest.json）・Project 02自サイトの
記事一覧/詳細ページのいずれも、現状 Articles（記事）から18/8カテゴリーへの参照を
持っていない（primaryCategoryはArticleFactsのみに存在し、Articlesへは未配線）。
実際に画面へアイコンを出すには、Articlesへカテゴリー参照を追加する
（新規フィールド＋migration＋既存公開記事のバックフィル）か、editorialProvenance経由で
DiscoveredContent→ArticleFactsを都度たどって解決するか、いずれかの設計判断が必要
——2026-09-24時点ではまだ未決定・未実装（マロン確認待ち）。
