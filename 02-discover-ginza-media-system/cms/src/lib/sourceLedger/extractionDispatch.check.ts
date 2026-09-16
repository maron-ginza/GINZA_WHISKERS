// GINZA WHISKERS / Project 02（2026-09-17新設）— 抽出方式ディスパッチの回帰テスト。
//
//   node --import=tsx/esm src/lib/sourceLedger/extractionDispatch.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { decideExtractionDispatch } from './extractionDispatch'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: 'generic_htmlは通常のHTML取得（runSourceLedgerCrawl）で処理する',
    fn: () => {
      const r = decideExtractionDispatch('generic_html')
      assert(r.handleAsGenericHtml === true, 'handleAsGenericHtml:true')
      assert(r.skipReason === null, 'skipReasonはnull')
    },
  },
  {
    name: '未設定（null/undefined）はgeneric_html相当として扱う（後方互換・推測で他アダプターへ割り当てない）',
    fn: () => {
      assert(decideExtractionDispatch(null).handleAsGenericHtml === true, 'null→generic_html扱い')
      assert(decideExtractionDispatch(undefined).handleAsGenericHtml === true, 'undefined→generic_html扱い')
    },
  },
  {
    name: 'storyblok_api（松屋銀座）はrunSourceLedgerCrawlの対象から除外され、専用アダプターに委ねる（二重取得防止）',
    fn: () => {
      const r = decideExtractionDispatch('storyblok_api')
      assert(r.handleAsGenericHtml === false, 'handleAsGenericHtml:false')
      assert(!!r.skipReason && r.skipReason.includes('storyblok_api'), 'skipReasonに抽出方式が明記される')
    },
  },
  {
    name: 'html_listing_blocks（銀座三越）はrunSourceLedgerCrawlの対象から除外され、専用アダプターに委ねる（二重取得防止）',
    fn: () => {
      const r = decideExtractionDispatch('html_listing_blocks')
      assert(r.handleAsGenericHtml === false, 'handleAsGenericHtml:false')
      assert(!!r.skipReason && r.skipReason.includes('html_listing_blocks'), 'skipReasonに抽出方式が明記される')
    },
  },
  {
    name: '未知の値（将来の新アダプター）もgeneric_html以外なら一律スキップする（新アダプター追加時にrunCrawl.ts側の変更を要求しない設計）',
    fn: () => {
      const r = decideExtractionDispatch('future_new_adapter')
      assert(r.handleAsGenericHtml === false, '未知の値もスキップされる')
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('extractionDispatch', cases)
