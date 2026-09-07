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
import { suite as classifySourcePageType } from './classifySourcePageType.check'
import { suite as urlGranularity } from './urlGranularity.check'
import { suite as extractExplicitPeriod } from './extractExplicitPeriod.check'
import { suite as adminCandidateUrl } from './adminCandidateUrl.check'
import { suite as ginzaRelevance } from './ginzaRelevance.check'
import { suite as crossCultureFilter } from './crossCultureFilter.check'
import { suite as crossCultureDerivative } from './crossCultureDerivative.check'
import { suite as targetFitScore } from './targetFitScore.check'
import { suite as extractPriceHint } from './extractPriceHint.check'
import { suite as buildEditorialBrief } from './buildEditorialBrief.check'
import { suite as buildFinalCandidateDigest } from './buildFinalCandidateDigest.check'
import { suite as extractStructuredDates } from '../crawler/extractStructuredDates.check'
import { suite as eventEndBoundary } from './eventEndBoundary.check'
import { suite as extractProductNewsFacts } from './extractProductNewsFacts.check'
import { suite as ginzaSixAutoResolve } from './ginzaSixAutoResolve.check'
import { suite as p0Morning } from '../morning/verifyP0Morning.check'

const results: SuiteResult[] = [
  eventTiming(),
  eventTimingClaimGate(),
  normalizeVenueText(),
  htmlEntities(),
  slugify(),
  unsourcedClaimGate(),
  classifySourcePageType(),
  urlGranularity(),
  extractExplicitPeriod(),
  adminCandidateUrl(),
  ginzaRelevance(),
  crossCultureFilter(),
  crossCultureDerivative(),
  targetFitScore(),
  extractPriceHint(),
  buildEditorialBrief(),
  buildFinalCandidateDigest(),
  extractStructuredDates(),
  eventEndBoundary(),
  extractProductNewsFacts(),
  ginzaSixAutoResolve(),
  p0Morning(),
]

reportAndExit(results)
