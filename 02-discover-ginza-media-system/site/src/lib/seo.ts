// index,follow ⇄ noindex,follow ⇄ noindex,nofollow を呼び出し側で自由に
// 切り替えられるようにするための型（Phase 7、翻訳未完了の英語ページ向け
// noindex運用を主目的とするが、将来の他用途にも流用できる形にしておく）
export type RobotsDirective = 'index,follow' | 'noindex,follow' | 'noindex,nofollow'

// ローンチ前のインデックス抑止スイッチ（2026-08-13決定、CLAUDE.md第12章）。
// 本番サイトは2026-08-12に公開済みだが、記事0本の状態で検索エンジンに
// 拾われるとローンチ時の評価に不利なため、既定でクロールを拒否する。
// 10月ローンチ直前に site/.env へ SITE_INDEXABLE=true を設定してビルド
// し直せば、robots.txt と全ページの meta robots が同時にインデックス許可へ
// 切り替わる（切り替え箇所を1つに集約するのがこのモジュールの目的）。
// 未設定・空・'true'以外はすべて「インデックスさせない」と解釈する
// ——設定漏れが「意図せず公開される」side に倒れないようにするため。
export const isIndexable = (): boolean =>
  String(import.meta.env.SITE_INDEXABLE ?? '')
    .trim()
    .toLowerCase() === 'true'

// ページ側が望むディレクティブを受け取り、ローンチ前は問答無用で
// noindex,nofollow へ引き下げる。ローンチ後（SITE_INDEXABLE=true）は
// ページ側の指定をそのまま尊重する——英語未翻訳ページの noindex,follow
// （Phase 7）のような個別判断を潰さないため。
export const resolveRobots = (preferred: RobotsDirective = 'index,follow'): RobotsDirective =>
  isIndexable() ? preferred : 'noindex,nofollow'
