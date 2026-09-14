// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：候補抽出の根本原因対応）
//
// DiscoveredContent 候補を、記事タイプ分類（classifyFactKind）・18カテゴリー分類
// （deriveProvisionalCategory）へ進める**前**に、そもそも「個別の商品・イベント・
// 催事・新店情報」として扱ってよいかを決定的に判定する。
//
//   対象外として識別するもの（マロン指示）：
//     一覧ページ／カテゴリーページ／アーカイブ／検索結果／共通案内／
//     システム告知／My account／通信販売トップ／本文を確認できないページ
//
// 判定材料は URL 構造（classifySourcePageType）＋ 本文（excerpt、内容量のみを見る。
// hasUsableBodyContent）の2つだけ。どちらも「確信が持てるときだけ除外」の設計
// （過剰除外で正常な個別記事を落とさない）。
//
// 【安全条件】AIを使わない／推測で補完しない／1件の判定失敗が全体を止めない
// （呼び出し側で try/catch する前提。この関数自体は例外を投げない純粋関数）。

import { classifySourcePageType, type SourcePageInput } from './classifySourcePageType'
import { hasUsableBodyContent } from './hasUsableBodyContent'

export interface ExcludeNonArticleInput extends SourcePageInput {}

export interface ExcludeNonArticleResult {
  excluded: boolean
  /** 除外理由（複数該当する場合は全て記録）。excluded=false のときは空配列 */
  reasons: string[]
  pageKind: 'article' | 'index' | 'unknown'
  bodyUsable: boolean
}

export function excludeNonArticleCandidate(input: ExcludeNonArticleInput): ExcludeNonArticleResult {
  const reasons: string[] = []

  const sp = classifySourcePageType(input)
  if (sp.pageKind === 'index') {
    reasons.push(`一覧・索引・アーカイブ・共通案内ページ（${sp.evidence.join(' ／ ')}）`)
  }

  // pageKind==='article' が確定しているページは、URL構造で個別記事だと分かっているので
  // excerptのナビ混入があっても「除外」まではしない（タイトル・URLは既に個別記事として
  // 確定済みのため、その情報は使ってよい。excerpt由来の期間・本文情報だけを使わなければ
  // 安全——この関数は「候補そのものを外すか」だけを判定し、excerptの取り扱いは
  // 呼び出し側〈期間抽出等が既にexcerptを使わない設計になっている〉に委ねる）。
  // pageKind==='unknown'（URL構造で個別記事と確定できない）のときだけ、本文量で補助判定する。
  const body = hasUsableBodyContent(input.excerpt ?? null)
  if (sp.pageKind === 'unknown' && !body.usable) {
    reasons.push(body.reason)
  }

  return {
    excluded: reasons.length > 0,
    reasons,
    pageKind: sp.pageKind,
    bodyUsable: body.usable,
  }
}
