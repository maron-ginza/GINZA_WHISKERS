// 「核情報→最大5記事」の品質ゲート（2026-08-27、Project 02-1拡張）。
//
// マロンの指示：「毎回機械的に5本作るのではなく、内容の重複・価値の薄さを
// 判定し、品質基準を満たすものだけを記事候補にしてください」への対応。
//
// AI（generateMultiAngleArticleDrafts.ts）にも自己選別を指示しているが
// （includeフラグ・skipReason）、それだけに依存せず、コード側でも決定的な
// 二重チェックを行う——Editorial Trust Layer等、本プロジェクトの他の
// 「AIの自己申告を信用せずサーバー側で再検証する」設計（contentRichness.ts
// のtotal再計算、Articles.tsのeditorsChoiceItems件数一致チェック等）と
// 同じ考え方。AI呼び出しは行わない。
//
// 判定は2段階：
// 1. 薄さ判定：既存のassessContentRichness（contentRichness.ts、AI採点の
//    Editorial Scoreに使っているものと同一関数）を候補本文へ流用する。
//    「boilerplate」（実質本文なし）相当と判定された候補のみを除外する——
//    「thin」まで除外すると、意図的に短く書かれた"short"ボリューム角度を
//    誤って弾いてしまう恐れがあるため、閾値はboilerplateのみに留める。
// 2. 重複判定：優先順位順（呼び出し元が渡す順序——本機能ではCORE→NEED→
//    EXPERIENCE→INTEREST→GINZA_WHISKERSのユーザー指定順）に走査し、既に
//    採用した候補と文字バイグラムJaccard類似度が閾値以上の場合、後から
//    出てきた方を「重複」として除外する（先勝ち、優先順位の高い角度を残す）。
import { assessContentRichness } from './contentRichness'
import { computeCharBigramJaccardSimilarity } from './textSimilarity'

export interface MultiAngleQualityGateCandidate {
  angle: string
  /** 薄さ・重複判定に使う代表テキスト（hook/content/editorsNote/closing等を連結したもの） */
  text: string
}

export interface MultiAngleQualityGateDrop {
  angle: string
  reason: string
}

export interface MultiAngleQualityGateResult<T extends MultiAngleQualityGateCandidate> {
  kept: T[]
  dropped: MultiAngleQualityGateDrop[]
}

// 実データでの再調整を想定した初期値（contentRichness.tsの各定数と同じ位置づけ）。
const DUPLICATE_SIMILARITY_THRESHOLD = 0.6

export function applyMultiAngleQualityGate<T extends MultiAngleQualityGateCandidate>(
  candidatesInPriorityOrder: T[],
): MultiAngleQualityGateResult<T> {
  const kept: T[] = []
  const dropped: MultiAngleQualityGateDrop[] = []

  for (const candidate of candidatesInPriorityOrder) {
    const richness = assessContentRichness(candidate.text)
    if (richness.tier === 'boilerplate') {
      dropped.push({
        angle: candidate.angle,
        reason: `本文情報量が不十分（boilerplate相当、文末句点${richness.sentenceEndingCount}回・${richness.contentLength}文字）のため除外`,
      })
      continue
    }

    const duplicateOf = kept.find(
      (k) => computeCharBigramJaccardSimilarity(k.text, candidate.text) >= DUPLICATE_SIMILARITY_THRESHOLD,
    )
    if (duplicateOf) {
      dropped.push({
        angle: candidate.angle,
        reason: `既に採用した「${duplicateOf.angle}」角度と内容が重複するため除外（類似度がしきい値${DUPLICATE_SIMILARITY_THRESHOLD}以上）`,
      })
      continue
    }

    kept.push(candidate)
  }

  return { kept, dropped }
}
