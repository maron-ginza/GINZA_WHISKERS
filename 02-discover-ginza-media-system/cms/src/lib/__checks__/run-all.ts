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

const results: SuiteResult[] = [
  eventTiming(),
  eventTimingClaimGate(),
  normalizeVenueText(),
  htmlEntities(),
  slugify(),
  unsourcedClaimGate(),
]

reportAndExit(results)
