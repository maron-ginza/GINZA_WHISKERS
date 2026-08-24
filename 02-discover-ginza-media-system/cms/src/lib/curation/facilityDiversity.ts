// Editorial Score順ランキングに「施設多様性」を考慮した並べ替えを適用する
// 汎用ユーティリティ（2026-08-18、Daily Ranking施設偏り抑制セッション）。
//
// 【設計方針（マロン指示を反映）】
// ・Editorial Score自体は一切変更しない——このモジュールはスコア確定後の
//   並び順のみを調整する後処理であり、scoreSource.ts/heuristicScore.ts等の
//   採点ロジックには一切触れない。
// ・「同一施設だから低品質」という判定はしない——除外や減点ではなく、
//   高スコア候補を可能な限り温存しつつ並び順だけを調整する
//   「多様性を考慮した再ランキング」として設計する。
// ・特定施設名（GINZA SIX等）はハードコードしない——施設を識別する
//   キー（facilityKey）は呼び出し側が渡す汎用パラメータとし、
//   百貨店・ギャラリー・ホテル・飲食店等、SourceLedgerに登録される
//   あらゆる施設種別に等しく適用される。
// ・過度なハード除外を避ける——lookahead窓内に多様性を満たす代替候補が
//   見つからない場合は、無理に除外せず本来の最高スコア候補をそのまま
//   採用する（良い情報を機械的に消さない）。
//
// 【アルゴリズム】スコア降順（呼び出し側の責務）で渡された候補列に対し、
// 貪欲法で1件ずつ確定していく。次の1件を選ぶ際、本来の最高スコア候補が
// 「同一施設の連続表示」または「直近ウィンドウ内での同一施設占有率」の
// いずれかの制約に抵触する場合のみ、lookahead窓内で制約に抵触しない
// 代替候補を探して先に採用する（見つからなければ本来の最高スコア候補を
// そのまま採用——ハード除外はしない）。

export interface DiversityRankable {
  /** 施設を識別するキー。nullの場合は多様性判定の対象外（常にそのまま採用） */
  facilityKey: string | null
}

export interface DiversityOptions {
  /** 同一施設が連続して何件まで許容されるか（既定2件＝3件目から抑制対象） */
  maxConsecutiveSameFacility?: number
  /** 直近何件の窓の中で同一施設の占有率を見るか（既定10件、Top10相当） */
  shareWindowSize?: number
  /** 上記窓の中で同一施設が占めてよい最大件数（既定4件＝40%） */
  maxPerShareWindow?: number
  /**
   * 多様性のための代替候補をどこまで先読みして探すか（既定20件）。
   * 実データ検証（2026-08-18）で、狭い窓（6件程度）ではTop10圏内に
   * 同程度スコアの他施設候補が見つからず、実質的に多様性調整が働かない
   * ケースが判明した（本プロジェクトはSourceLedgerが14件と少なく、
   * 上位が2〜3施設に集中しやすいデータ特性のため）。shareWindowSize
   * （既定10）のおよそ2倍を既定とすることで、「Top候補内」という
   * ユーザー意図に届く範囲まで代替候補を探しつつ、プール全体
   * （数十〜数百件規模）を無制限に掘り下げて極端に低スコアの候補まで
   * 引き上げてしまうことは避ける。
   */
  lookaheadWindow?: number
}

export interface DiversityRankedEntry<T extends DiversityRankable> {
  item: T
  /** 元の並び（スコア降順を想定）における1始まりの順位 */
  pureScoreRank: number
  /** 多様性調整後の最終順位（1始まり） */
  finalRank: number
  /** スコア順位から動かされたか（true=施設多様性の制約により後方へ繰り下げられた） */
  diversityAdjusted: boolean
}

// 既定値は実データ観察に基づく編集判断上の初期値であり、固定の正解ではない
// （UPCOMING_WINDOW_DAYS等、本プロジェクトの他の定数と同じ位置づけ）。
export const DEFAULT_DIVERSITY_OPTIONS: Required<DiversityOptions> = {
  maxConsecutiveSameFacility: 2,
  shareWindowSize: 10,
  maxPerShareWindow: 4,
  lookaheadWindow: 20,
}

/**
 * スコア降順で渡された候補列に、施設多様性を考慮した並べ替えを適用する。
 * 純粋関数——Payload・DB・特定施設名への依存を一切持たない。
 */
export function applyFacilityDiversity<T extends DiversityRankable>(
  scoreSortedItems: readonly T[],
  options: DiversityOptions = {},
): DiversityRankedEntry<T>[] {
  const opts = { ...DEFAULT_DIVERSITY_OPTIONS, ...options }

  const remaining = scoreSortedItems.map((item, index) => ({ item, pureScoreRank: index + 1 }))
  const result: Array<{ item: T; pureScoreRank: number }> = []

  let lastFacility: string | null = null
  let consecutiveCount = 0

  const violatesConstraint = (facilityKey: string | null): boolean => {
    // facility不明の候補（sourceSite未解決等）は多様性判定の対象外とし、
    // 常にスコア順のまま採用する（判定できない情報で除外しない）。
    if (facilityKey === null) return false

    if (
      lastFacility !== null &&
      facilityKey === lastFacility &&
      consecutiveCount >= opts.maxConsecutiveSameFacility
    ) {
      return true
    }

    const windowStart = Math.max(0, result.length - (opts.shareWindowSize - 1))
    const countInWindow = result
      .slice(windowStart)
      .filter((e) => e.item.facilityKey === facilityKey).length
    if (countInWindow + 1 > opts.maxPerShareWindow) {
      return true
    }

    return false
  }

  while (remaining.length > 0) {
    const top = remaining[0]

    let chosenIndex = 0
    if (violatesConstraint(top.item.facilityKey)) {
      const lookaheadEnd = Math.min(remaining.length, opts.lookaheadWindow)
      let altIndex = -1
      for (let i = 1; i < lookaheadEnd; i += 1) {
        if (!violatesConstraint(remaining[i].item.facilityKey)) {
          altIndex = i
          break
        }
      }
      // 窓内に代替候補が見つからない場合は、無理に除外せず本来の
      // 最高スコア候補（chosenIndex=0のまま）をそのまま採用する。
      if (altIndex !== -1) chosenIndex = altIndex
    }

    const chosen = remaining.splice(chosenIndex, 1)[0]
    result.push(chosen)

    if (chosen.item.facilityKey !== null && chosen.item.facilityKey === lastFacility) {
      consecutiveCount += 1
    } else {
      consecutiveCount = 1
      lastFacility = chosen.item.facilityKey
    }
  }

  return result.map((entry, index) => ({
    item: entry.item,
    pureScoreRank: entry.pureScoreRank,
    finalRank: index + 1,
    diversityAdjusted: entry.pureScoreRank !== index + 1,
  }))
}
