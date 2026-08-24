import { seikoHouseGinzaAdapter } from './seikoHouseGinza'
import type { SiteDateAdapter } from './types'

// サイト固有アダプタのレジストリ（2026-08-17、日付取得率改善セッション）。
// キーはSourceLedger.sourceId（kebab-case安定ID、lib/sourceLedger/seedData.ts
// 参照）。全サイト共通ロジックだけでは精度が上がらないと実データで確認できた
// サイトについてのみここに追加する——推測でアダプタを増やさない。
export const SITE_DATE_ADAPTERS: Record<string, SiteDateAdapter> = {
  'seiko-house-ginza': seikoHouseGinzaAdapter,
}

export function getSiteDateAdapter(sourceId: string | null | undefined): SiteDateAdapter | null {
  if (!sourceId) return null
  return SITE_DATE_ADAPTERS[sourceId] ?? null
}
