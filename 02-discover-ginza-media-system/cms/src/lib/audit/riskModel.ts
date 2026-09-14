// GINZA WHISKERS / Project 02（2026-09-03、自動制作パイプライン）
//
// green / yellow / red のリスク判定モデル（純粋・決定的・AI 呼び出しなし）。
//
// 【マロン承認の判定基準（2026-09-03）】
//   ・公式情報が揃い矛盾なし                                   → green
//   ・任意項目の不足 / 表記揺れ / 表現重複                      → yellow
//   ・必須事実の不足 / 出典なし / 数値矛盾 / 推測補完           → red
//   ・正規化後10文字以上の同一表現が別セクションで2回以上       → yellow
//   ・同一文の実質的重複                                        → yellow
//   ・公式確認済みの「完売」は本文1回まで                       → green
//   ・「完売」が本文2回以上                                     → yellow
//   ・未確認の「完売」表現                                      → red
//   ・店舗営業時間を催事固有の開催時間として記載               → red
//   ・固有名詞 / 正式商品名 / 会場名 / 日付 / 価格 / 出典表示は
//     重複判定の対象外
//
// findings は yellow / red のみ記録する（green は「指摘なし」で表す）。

export type RiskSeverity = 'green' | 'yellow' | 'red'

export interface AuditFinding {
  /** 検査 ID（例: crossSectionRepeat / unbackedClaim / soldOutUnverified） */
  checkId: string
  /** yellow か red のみ（green は finding にしない） */
  severity: 'yellow' | 'red'
  /** 指摘のあったセクション名（本文検査のみ。複数なら " / " 連結） */
  section?: string
  /** 指摘箇所の抜粋（yellow の「該当箇所だけ表示」に使う。最大120字） */
  excerpt?: string
  /** 人間向けの一文 */
  message: string
}

const RANK: Record<RiskSeverity, number> = { green: 0, yellow: 1, red: 2 }

/** findings を集計して記事全体の verdict を返す（最悪重大度）。空なら green。 */
export function aggregateVerdict(findings: AuditFinding[]): RiskSeverity {
  let worst: RiskSeverity = 'green'
  for (const f of findings) {
    if (RANK[f.severity] > RANK[worst]) worst = f.severity
  }
  return worst
}

export function verdictLabel(v: RiskSeverity): string {
  return v === 'green' ? '🟢 green' : v === 'yellow' ? '🟡 yellow' : '🔴 red'
}

export function verdictBucket(v: RiskSeverity): 'green' | 'yellow' | 'red' {
  return v
}

/** excerpt を最大 max 字に切り詰め（コードポイント単位） */
export function clipExcerpt(s: string, max = 120): string {
  const arr = [...s.trim().replace(/\s+/g, ' ')]
  return arr.length <= max ? arr.join('') : arr.slice(0, max - 1).join('') + '…'
}

export function countBySeverity(findings: AuditFinding[]): { red: number; yellow: number } {
  return {
    red: findings.filter((f) => f.severity === 'red').length,
    yellow: findings.filter((f) => f.severity === 'yellow').length,
  }
}
