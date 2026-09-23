// GINZA WHISKERS / Project 02（2026-09-14、マロン指示：候補抽出の根本原因対応）
//
// morningRun.ts（./p2 morning の唯一のオーケストレーター）の配線が退行していないことを
// ソーステキストのアサーションで確認する（selectDailySecondCandidates.check.ts の
// morningRun.ts importガード確認と同じ方式）。実行時テストではなく静的な配線確認——
// 「approved限定に戻っていないか」「classifyFactKind/classifyTemplateTypeへの
// url/sourceName/venue引き渡しが外れていないか」「除外ゲートの呼び出しが外れて
// いないか」を将来の変更から守る。

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runSuite, reportAndExit, type CheckCase } from './_harness'

const ROOT = resolve(process.cwd(), '..')

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: 'DiscoveredContent読み込みが curationStatus=approved 限定に戻っていない（inbox/approved両方を対象にする）',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      assert(
        src.includes(`curationStatus: { in: ['inbox', 'approved'] }`),
        'DiscoveredContentの読み込みが inbox+approved の両方を対象にしていない（approved限定に退行している可能性）',
      )
    },
  },
  {
    name: 'classifyFactKindの呼び出しにurl/sourceName/venueが渡っている（渡さないとclassifySourcePageTypeが常にunknownになる既知バグの再発防止）',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      const idx = src.indexOf('const classification = classifyFactKind({')
      assert(idx >= 0, 'classifyFactKind呼び出しが見つからない')
      const end = src.indexOf('const factKind = classification.factKind', idx)
      assert(end > idx, 'classifyFactKind呼び出しの終端が見つからない')
      const block = src.slice(idx, end)
      assert(/url:\s*dcLike\.articleUrl/.test(block), 'classifyFactKindにurlが渡っていない')
      assert(/sourceName:\s*dcLike\.sourceSiteName/.test(block), 'classifyFactKindにsourceNameが渡っていない')
      assert(/venue:\s*dcLike\.venue/.test(block), 'classifyFactKindにvenueが渡っていない')
    },
  },
  {
    name: 'classifyTemplateTypeの呼び出しにもurl/sourceName/venueが渡っている',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      const idx = src.indexOf('const templateTypeCls = classifyTemplateType({')
      assert(idx >= 0, 'classifyTemplateType呼び出しが見つからない')
      const end = src.indexOf('a.templateType = templateTypeCls.templateType', idx)
      assert(end > idx, 'classifyTemplateType呼び出しの終端が見つからない')
      const block = src.slice(idx, end)
      assert(/url:\s*dcLike\.articleUrl/.test(block), 'classifyTemplateTypeにurlが渡っていない')
      assert(/sourceName:\s*dcLike\.sourceSiteName/.test(block), 'classifyTemplateTypeにsourceNameが渡っていない')
      assert(/venue:\s*dcLike\.venue/.test(block), 'classifyTemplateTypeにvenueが渡っていない')
    },
  },
  {
    name: '候補対象外の除外ゲート（excludeNonArticleCandidate）が候補ループへ配線されている',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      assert(src.includes("import { excludeNonArticleCandidate } from '../lib/morning/excludeNonArticleCandidate'"), 'excludeNonArticleCandidateがimportされていない')
      assert(src.includes('const excl = excludeNonArticleCandidate({'), '候補ループ内でexcludeNonArticleCandidateが呼ばれていない')
      const ifIdx = src.indexOf('if (excl.excluded) {')
      assert(ifIdx >= 0, 'if (excl.excluded) 分岐が見つからない')
      const nextContinueIdx = src.indexOf('continue', ifIdx)
      const nextBraceCloseIdx = src.indexOf('\n        }\n', ifIdx) // このifブロックの閉じ位置の目安
      assert(
        nextContinueIdx >= 0 && (nextBraceCloseIdx < 0 || nextContinueIdx < nextBraceCloseIdx + 10),
        '除外時にcontinueして以降の処理をスキップしていない',
      )
    },
  },
  {
    // 【2026-09-24追加・候補不足の主因調査】9/24 6:00実行の実データで、B判定407件中
    // 298件（73%）が「同一ホストの取得本数上限（8）に達したためスキップ」だった
    // （SWEETSタイトル候補だけでも12件が未着手のまま埋もれていた）。既定値を8→30へ
    // 引き上げた変更が退行しないことを確認する（実行時計測は run-all.ts の対象外
    // ——他の静的配線確認と同じくソーステキストのアサーションで守る）。
    name: '同一ホストの取得本数上限（maxPerHost）の既定値が8へ退行していない（候補不足の主因、既定30を維持）',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      const m = src.match(/maxPerHost:\s*num\('--fetch-max-per-host=',\s*(\d+)\)/)
      assert(m !== null, `maxPerHostのデフォルト指定が見つからない`)
      const def = Number(m![1])
      assert(def >= 30, `maxPerHostの既定値が8付近へ退行している疑い（実際 ${def}。候補不足の主因だったため30以上を維持すること）`)
    },
  },
  {
    // 【2026-09-24続き・候補不足の主因対応】同一ホスト予算の「中身の選び方」が
    // カテゴリー公平割当（fetchFairnessAllocation.ts）へ実際に配線されていることを
    // 確認する——退行すると、更新日時順の先着順へ静かに戻りSWEETS埋没が再発する。
    name: '主ループの公式ページ取得判定が fetchAllocation.allowedIds（カテゴリー公平割当）を参照している',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/scripts/morningRun.ts'), 'utf8')
      assert(
        src.includes("import { allocateFetchFairness, type FetchFairnessCandidate } from '../lib/morning/fetchFairnessAllocation'"),
        'allocateFetchFairnessがimportされていない',
      )
      assert(src.includes('const fetchAllocation = allocateFetchFairness('), 'fetchAllocationが計算されていない')
      assert(
        src.includes('const allowedByFairness = !dcHost || fetchAllocation.allowedIds.has(dcId)'),
        '主ループの取得判定がfetchAllocation.allowedIdsを参照していない（更新日時順の先着順に退行している可能性）',
      )
    },
  },
  {
    name: 'assessInboxPool.ts にも同じ除外ゲートが配線されている（themesRecommend等の共有経路）',
    fn: () => {
      const src = readFileSync(resolve(ROOT, 'cms/src/lib/pipeline/assessInboxPool.ts'), 'utf8')
      assert(src.includes("import { excludeNonArticleCandidate } from '../morning/excludeNonArticleCandidate'"), 'assessInboxPool.tsにexcludeNonArticleCandidateがimportされていない')
      assert(src.includes('const excl = excludeNonArticleCandidate({'), 'assessInboxPool.tsの候補ループ内で呼ばれていない')
    },
  },
]

export const suite = () => runSuite('morningRunWiring', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
