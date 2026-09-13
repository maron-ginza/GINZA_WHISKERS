// 再発防止 #1〜#4（2026-09-01 Trial）の回帰テストを一括実行する。
//
//   node --import=tsx/esm src/lib/__checks__/run-all.ts
//
// 失敗があれば非0で終了する。

import { reportAndExit, type SuiteResult } from './_harness'
import { suite as eventTiming } from './eventTiming.check'
import { suite as eventTimingClaimGate } from './eventTimingClaimGate.check'
import { suite as normalizeVenueText } from './normalizeVenueText.check'
import { suite as htmlEntities } from './htmlEntities.check'
import { suite as slugify } from './slugify.check'
import { suite as unsourcedClaimGate } from './unsourcedClaimGate.check'
import { suite as unsourcedPeriodClaimGate } from './unsourcedPeriodClaimGate.check'
import { suite as classifySourcePageType } from './classifySourcePageType.check'
import { suite as urlGranularity } from './urlGranularity.check'
import { suite as extractExplicitPeriod } from './extractExplicitPeriod.check'
import { suite as adminCandidateUrl } from './adminCandidateUrl.check'
import { suite as ginzaRelevance } from './ginzaRelevance.check'
import { suite as crossCultureFilter } from './crossCultureFilter.check'
import { suite as crossCultureDerivative } from './crossCultureDerivative.check'
import { suite as targetFitScore } from './targetFitScore.check'
import { suite as dailySelectionSupport } from './dailySelectionSupport.check'
import { suite as morningBriefSelect } from './morningBriefSelect.check'
import { suite as reviewTodayData } from './reviewTodayData.check'
import { suite as businessDate } from './businessDate.check'
import { suite as publishedThemes } from './publishedThemes.check'
import { suite as publishedRegistry } from './publishedRegistry.check'
import { suite as candidateCoverageScore } from './candidateCoverageScore.check'
import { suite as provisionalCategory } from './provisionalCategory.check'
import { suite as sweetsCandidateSelect } from './sweetsCandidateSelect.check'
import { suite as sweetsEligibility } from './sweetsEligibility.check'
import { suite as sweetsNewsworthiness } from './sweetsNewsworthiness.check'
import { suite as recurringEventYearGuard } from './recurringEventYearGuard.check'
import { suite as sweetsDiscoveryKeywords } from './sweetsDiscoveryKeywords.check'
import { suite as extractPriceHint } from './extractPriceHint.check'
import { suite as buildEditorialBrief } from './buildEditorialBrief.check'
import { suite as buildFinalCandidateDigest } from './buildFinalCandidateDigest.check'
import { suite as noteMasthead } from './noteMasthead.check'
import { suite as noteDraftPackage } from './noteDraftPackage.check'
import { suite as noteTransferChecks } from './noteTransferChecks.check'
import { suite as paid100 } from './paid100.check'
import { suite as extractStructuredDates } from '../crawler/extractStructuredDates.check'
import { suite as eventEndBoundary } from './eventEndBoundary.check'
import { suite as extractProductNewsFacts } from './extractProductNewsFacts.check'
import { suite as ginzaSixAutoResolve } from './ginzaSixAutoResolve.check'
import { suite as factVerification, runFetchOutcomeTests } from './factVerification.check'
import { suite as p0Morning } from '../morning/verifyP0Morning.check'

const results: SuiteResult[] = [
  eventTiming(),
  eventTimingClaimGate(),
  normalizeVenueText(),
  htmlEntities(),
  slugify(),
  unsourcedClaimGate(),
  unsourcedPeriodClaimGate(),
  classifySourcePageType(),
  urlGranularity(),
  extractExplicitPeriod(),
  adminCandidateUrl(),
  ginzaRelevance(),
  crossCultureFilter(),
  crossCultureDerivative(),
  targetFitScore(),
  dailySelectionSupport(),
  morningBriefSelect(),
  reviewTodayData(),
  businessDate(),
  publishedThemes(),
  publishedRegistry(),
  candidateCoverageScore(),
  provisionalCategory(),
  sweetsCandidateSelect(),
  sweetsEligibility(),
  sweetsNewsworthiness(),
  recurringEventYearGuard(),
  sweetsDiscoveryKeywords(),
  extractPriceHint(),
  buildEditorialBrief(),
  buildFinalCandidateDigest(),
  noteMasthead(),
  noteDraftPackage(),
  noteTransferChecks(),
  paid100(),
  extractStructuredDates(),
  eventEndBoundary(),
  extractProductNewsFacts(),
  ginzaSixAutoResolve(),
  factVerification(),
  p0Morning(),
]

void (async () => {
  // 実ネットワークに触れず弾く経路のみ（fetchOfficialSignals の fetchOutcome）。
  const f = await runFetchOutcomeTests()
  results.push({ suite: 'factVerification fetchOutcome(async, no-network)', pass: f.pass, fail: f.fail, failures: f.failures })
  reportAndExit(results)
})()
