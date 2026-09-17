// GINZA WHISKERS / Project 02（2026-09-17新設・マロン指示：朝処理の統合仕上げ・
// 旧Claude API原稿経路の停止）
//
// 朝6時の通常自動チェーン（morningAutoRun.sh）から呼ばれるスクリプト群が、
// Claude／OpenAI等の有料AI APIを一切参照していないことを静的に検証する
// （DB/ネットワークなし・ソースコードのテキスト検査のみ）。あわせて
// morning-brief（選定前の候補提示）の呼び出し連鎖にAI/原稿生成関数への参照が
// 無いこと、SOURCE_LEDGERシードに指定5店舗の重複IDが無いことも確認する。
//
//   node --import=tsx/esm src/lib/morning/paidApiAutomationAudit.check.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runSuite, type CheckCase } from '../__checks__/_harness'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(__dirname, '../../scripts')

function readScript(name: string): string {
  return readFileSync(resolve(SCRIPTS_DIR, name), 'utf-8')
}

const AI_REFERENCE_RE = /anthropic|Anthropic|ANTHROPIC|openai|OpenAI|OPENAI|generateMultiAngleArticleDrafts|generateArticleDraft|createMultiAngleDraftsFromDiscoveredContent|createDraftFromSource/

// morningAutoRun.sh が呼ぶ ./p2 サブコマンドに対応するスクリプト本体
// （2026-09-17時点。db起動確認・am_run・morning_briefを含む通常朝チェーン）。
const MORNING_CHAIN_SCRIPTS = [
  'crawlSources.ts',
  'sweetsDetailPageFetch.ts',
  'matsuyaSweetsWeeklyFetch.ts',
  'matsuyaGourmetEventsFetch.ts',
  'mitsukoshiGinzaHealthCheck.ts',
  'mitsukoshiGinzaFoodEventsFetch.ts',
  'morningRun.ts',
  'morningBrief.ts',
]

const cases: CheckCase[] = [
  {
    name: '朝6時の通常自動チェーンを構成する全スクリプトがAI/有料API関数を一切参照しない',
    fn: () => {
      for (const file of MORNING_CHAIN_SCRIPTS) {
        const src = readScript(file)
        const m = src.match(AI_REFERENCE_RE)
        assert(!m, `${file} はAI/有料API参照を含まないはず（実際: "${m?.[0]}" を検出）`)
      }
    },
  },
  {
    name: 'morningAutoRun.sh 自体（フェーズ一覧）にAI/有料APIコマンドが含まれない',
    fn: () => {
      const src = readFileSync(resolve(__dirname, '../../../../scripts/morningAutoRun.sh'), 'utf-8')
      const runPhaseLines = src.split('\n').filter((l) => l.trim().startsWith('run_phase'))
      assert(runPhaseLines.length > 0, 'run_phase呼び出しが存在する')
      for (const line of runPhaseLines) {
        assert(!/draft-today|draft-interest|candidate-review-server|tns next|crossculture derive/.test(line), `${line} にAI課金を伴うコマンドが含まれない`)
      }
    },
  },
  {
    name: 'morningBriefSelect.ts（選定前の候補提示ロジック）はAI/原稿生成関数を参照しない',
    fn: () => {
      const src = readFileSync(resolve(__dirname, '../pipeline/morningBriefSelect.ts'), 'utf-8')
      const m = src.match(AI_REFERENCE_RE)
      assert(!m, `morningBriefSelect.ts はAI参照を含まないはず（実際: "${m?.[0]}"）`)
    },
  },
  {
    name: 'assessInboxPool.ts（morning-briefの候補母集団）はAI/原稿生成関数を参照しない（assessCandidateの利用を除く）',
    fn: () => {
      const src = readFileSync(resolve(__dirname, '../pipeline/assessInboxPool.ts'), 'utf-8')
      const m = src.match(/anthropic|Anthropic|ANTHROPIC|openai|OpenAI|OPENAI|generateMultiAngleArticleDrafts|generateArticleDraft/)
      assert(!m, `assessInboxPool.ts はAI参照を含まないはず（実際: "${m?.[0]}"）`)
    },
  },
  {
    name: 'candidateReviewServer.ts（旧有料原稿経路）はDEPRECATED明記があり、launchd自動起動から切り離されている',
    fn: () => {
      const src = readScript('candidateReviewServer.ts')
      assert(src.includes('DEPRECATED'), 'DEPRECATED明記がある')
      const plistTemplate = readFileSync(
        resolve(__dirname, '../../../../scripts/launchd/com.ginzawhiskers.p2-candidate-review.plist.template'),
        'utf-8',
      )
      assert(plistTemplate.includes('DEPRECATED'), 'plistテンプレートにもDEPRECATED明記がある')
      const loadScript = readFileSync(resolve(__dirname, '../../../../scripts/launchd/load-candidate-review.sh'), 'utf-8')
      assert(
        loadScript.includes('--i-understand-this-enables-paid-api-approve-button'),
        '再稼働には明示フラグが必要（誤起動防止）',
      )
    },
  },
  {
    name: 'noteDraftFromSelection.ts（V1 Stage 5）は外部fetch・AI呼び出しを一切行わない',
    fn: () => {
      const src = readFileSync(resolve(__dirname, './noteDraftFromSelection.ts'), 'utf-8')
      assert(!/\bfetch\s*\(/.test(src), '外部fetch呼び出しが無い')
      assert(!AI_REFERENCE_RE.test(src), 'AI/有料API参照が無い')
    },
  },
  {
    name: 'SOURCE_LEDGERシードに指定5店舗（資生堂パーラー・アンリ・シャルパンティエ・銀座コージーコーナー・キル フェ ボン・源吉兆庵）の重複登録が無い',
    fn: () => {
      const src = readFileSync(resolve(__dirname, '../sourceLedger/seedData.ts'), 'utf-8')
      const requiredIds = [
        'shiseido-parlour-ginza',
        'henri-charpentier',
        'ginza-cozycorner',
        'kil-fe-bon-ginza',
        'kitchoan',
      ]
      for (const id of requiredIds) {
        const matches = src.match(new RegExp(`id:\\s*'${id}'`, 'g')) ?? []
        assert(matches.length === 1, `${id} はシード内に1件のみ存在するはず（実際 ${matches.length}件）`)
      }
    },
  },
  {
    name: '指定5店舗はいずれも専用抽出スクリプトを持たず、共通の通常HTML取得（generic_html）で処理される',
    fn: () => {
      // 松屋銀座・銀座三越のような専用アダプター用スクリプトが、指定5店舗向けに
      // 個別新設されていないことを、朝チェーンのスクリプト一覧に対する否定確認で行う
      // （店舗名を含むファイル名が新設されていないことの簡易確認）。
      const dedicatedAdapterNames = ['shiseidoParlour', 'henriCharpentier', 'ginzaCozycorner', 'kilFeBon', 'kitchoan']
      for (const n of dedicatedAdapterNames) {
        let exists = true
        try {
          readScript(`${n}Fetch.ts`)
        } catch {
          exists = false
        }
        assert(!exists, `${n}Fetch.ts のような専用スクリプトは新設されていないはず`)
      }
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('paidApiAutomationAudit', cases)
