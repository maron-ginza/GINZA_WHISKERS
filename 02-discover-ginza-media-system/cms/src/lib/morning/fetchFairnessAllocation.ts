// GINZA WHISKERS / Project 02（2026-09-24 続き）— 同一ホスト内でのカテゴリー偏りにより
// 特定カテゴリー（特にSWEETS）が公式ページ取得の機会そのものを得られない問題への対応。
//
// 【背景】maxPerHost（同一ホストあたりの公式ページ取得本数上限）自体は2026-09-24に
// 8→30へ引き上げたが、1ホストが持つ候補が更新日時順（-updatedAt）に単純消費される
// 従来ロジードのままだと、1ホストの候補が特定カテゴリーに偏っている場合（例：ある
// ホストの直近更新30件がすべてSHOPPING/EVENTで、SWEETSが更新順で30件目より後ろに
// 埋もれている）、そのホストの予算がSWEETS以外のカテゴリーだけで使い切られ、
// SWEETS候補が公式ページ取得の機会を一度も得られない——実データ（9/24 6:00実行分）
// でこのパターンを確認した。
//
// 【設計】推測でA判定を作らない・重複判定/掲載期間確認/施設クールダウンの各条件は
// 一切変更しない。本モジュールが変えるのは「公式ページ取得を試みる順序」のみ——
// 決定的・DB非依存・ネットワーク非依存の純粋関数。カテゴリーはタイトル・会場の
// 明記語のみから決まる暫定カテゴリー（deriveProvisionalCategory と同じ判定源、
// 呼び出し側が渡す）を使う——本モジュール自体はカテゴリー判定ロジックを持たない。
//
// アルゴリズム：ホストごとに候補をカテゴリー別へグループ化し（各グループ内の順序は
// 呼び出し順＝既存の -updatedAt 順を維持）、カテゴリーを一巡するラウンドロビンで
// maxPerHost 件まで選ぶ。1ホストに複数カテゴリーが存在する限り、件数の少ない
// カテゴリー（SWEETS等）は必ず1巡目で選ばれる——多数派カテゴリーに埋もれない。

export interface FetchFairnessCandidate {
  id: number
  /** 正規化済みホスト名（articleUrl が無い／不正な場合は null＝予算管理の対象外） */
  host: string | null
  /** 暫定カテゴリー（deriveProvisionalCategory の category。null＝未分類として1つのグループにまとめる） */
  category: string | null
}

export interface HostAllocationSummary {
  totalEligible: number
  allowed: number
  categoryCounts: Record<string, number>
}

export interface FetchFairnessAllocation {
  /** このrunで公式ページ取得を試みてよい候補id（host!==nullのみ対象。host===nullは呼び出し側で従来どおり扱う） */
  allowedIds: Set<number>
  /** 監査・報告用：ホストごとの内訳 */
  hostSummary: Record<string, HostAllocationSummary>
}

/**
 * ホストごとにカテゴリー・ラウンドロビンで maxPerHost 件までの取得許可リストを作る。
 * 既存の「同一ホストの取得本数上限」自体（total budget）は変更しない——
 * その上限の中身の選び方だけを、更新日時順の先着順からカテゴリー公平な選び方へ変える。
 */
export function allocateFetchFairness(
  candidates: FetchFairnessCandidate[],
  maxPerHost: number,
): FetchFairnessAllocation {
  const byHost = new Map<string, FetchFairnessCandidate[]>()
  for (const c of candidates) {
    if (!c.host) continue
    const list = byHost.get(c.host)
    if (list) list.push(c)
    else byHost.set(c.host, [c])
  }

  const allowedIds = new Set<number>()
  const hostSummary: Record<string, HostAllocationSummary> = {}

  for (const [host, items] of byHost) {
    // カテゴリー別グループ（各グループ内は入力順＝-updatedAt順のまま維持）
    const byCategory = new Map<string, FetchFairnessCandidate[]>()
    const categoryOrder: string[] = []
    for (const item of items) {
      const key = item.category ?? '(未分類)'
      let group = byCategory.get(key)
      if (!group) {
        group = []
        byCategory.set(key, group)
        categoryOrder.push(key)
      }
      group.push(item)
    }

    const selected: FetchFairnessCandidate[] = []
    const cursors = new Map<string, number>()
    let remaining = items.length
    while (selected.length < maxPerHost && remaining > 0) {
      let pickedThisRound = false
      for (const cat of categoryOrder) {
        if (selected.length >= maxPerHost) break
        const group = byCategory.get(cat)!
        const cursor = cursors.get(cat) ?? 0
        if (cursor >= group.length) continue
        selected.push(group[cursor])
        cursors.set(cat, cursor + 1)
        remaining -= 1
        pickedThisRound = true
      }
      if (!pickedThisRound) break // 全カテゴリー枯渇（理論上到達しないが無限ループ防止）
    }

    for (const s of selected) allowedIds.add(s.id)

    const categoryCounts: Record<string, number> = {}
    for (const s of selected) {
      const key = s.category ?? '(未分類)'
      categoryCounts[key] = (categoryCounts[key] ?? 0) + 1
    }
    hostSummary[host] = { totalEligible: items.length, allowed: selected.length, categoryCounts }
  }

  return { allowedIds, hostSummary }
}
