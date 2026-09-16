// GINZA WHISKERS / Project 02（2026-09-17新設）— 銀座三越の取得障害時の安全動作の回帰テスト。
//
//   node --import=tsx/esm src/lib/crawler/mitsukoshiFetchGate.check.ts
//
// マロン指示の検証項目：①銀座三越の取得成功テスト（healthStatus='ok'のときは
// 取得へ進み、抽出パイプラインが実際に候補を作れること）②銀座三越の取得失敗・
// sourceUnavailableテスト（healthStatus='unreachable'のときは候補を一切生成せず
// 明示的にsourceUnavailableとして扱うこと）③fixtureを本番候補に使用しないテスト
// （本番スクリプトのソースコード自体がfixtureファイルを一切参照していないことを
// 静的に確認する）。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runSuite, type CheckCase } from '../__checks__/_harness'
import { decideMitsukoshiFetchGate } from './mitsukoshiFetchGate'
import { extractMitsukoshiGinzaFoodEvents } from './extractMitsukoshiGinzaFoodEvents'
import { extractExplicitPeriod } from '../pipeline/extractExplicitPeriod'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const __dirname = dirname(fileURLToPath(import.meta.url))

// マロン確認済みの実在情報（2026-09-16、extractMitsukoshiGinzaFoodEvents.check.ts と同一の
// 出所）。ここでは「healthStatus='ok'で取得へ進んだ場合、抽出パイプライン自体は実際に
// 候補を作れる」ことを示す取得成功シナリオの確認に使う（fetch自体はモックしない・
// 抽出ロジックの健全性のみを確認する）。
const FIXTURE_TEXT = `アンリ・シャルパンティエ　期間限定出店
2026年9月14日(月)〜9月29日(火)
シャインマスカットのタルト
栗のモンブラン

恵那寿や
2026年9月16日(水)〜9月23日(水)
栗きんとん

京都北山マールブランシュ
2026年9月16日(水)〜9月22日(火)
お濃茶ラングドシャ

BELTZ
2026年9月16日(水)〜9月22日(火)
バスクチーズケーキ`

const cases: CheckCase[] = [
  {
    name: '取得成功: healthStatus=okならproceed:true（取得へ進む）',
    fn: () => {
      const r = decideMitsukoshiFetchGate({ healthStatus: 'ok' })
      assert(r.proceed === true, `proceed:true（実際 ${r.proceed}）`)
      assert(r.status === 'ok', `status:'ok'（実際 ${r.status}）`)
    },
  },
  {
    name: '取得成功: healthStatus未設定（初回・未チェック）でもproceed:true（既存挙動を維持）',
    fn: () => {
      const r = decideMitsukoshiFetchGate({})
      assert(r.proceed === true, 'healthStatus未設定はunreachable確定ではないため進む')
    },
  },
  {
    name: '取得成功パイプライン全体: gate=okのとき抽出ロジックは実際にマロン確認済み4候補を作れる',
    fn: () => {
      const gate = decideMitsukoshiFetchGate({ healthStatus: 'ok' })
      assert(gate.proceed, '前提：gateがproceed:true')
      const events = extractMitsukoshiGinzaFoodEvents(FIXTURE_TEXT, (line) => extractExplicitPeriod(line))
      assert(events.length === 4, `4候補抽出（実際 ${events.length}）`)
      const brands = events.map((e) => e.brand)
      assert(brands.some((b) => b.includes('アンリ・シャルパンティエ')), 'アンリ・シャルパンティエを含む')
      assert(brands.includes('恵那寿や'), '恵那寿やを含む')
      assert(brands.includes('京都北山マールブランシュ'), '京都北山マールブランシュを含む')
      assert(brands.includes('BELTZ'), 'BELTZを含む')
    },
  },
  {
    name: '取得失敗・sourceUnavailable: healthStatus=unreachableならproceed:false・status:sourceUnavailable',
    fn: () => {
      const r = decideMitsukoshiFetchGate({ healthStatus: 'unreachable', healthNote: '4経路すべて失敗' })
      assert(r.proceed === false, `proceed:false（実際 ${r.proceed}）`)
      assert(r.status === 'sourceUnavailable', `status:'sourceUnavailable'（実際 ${r.status}）`)
      assert(r.reason.includes('unreachable'), '理由にunreachableを含む')
      assert(r.reason.includes('4経路すべて失敗'), '既存のhealthNoteを理由に含める（推測で埋めない）')
    },
  },
  {
    name: '取得失敗・sourceUnavailable: 「0件」と「確認不能」は別のstatus値で区別される',
    fn: () => {
      const unreachable = decideMitsukoshiFetchGate({ healthStatus: 'unreachable' })
      const ok = decideMitsukoshiFetchGate({ healthStatus: 'ok' })
      assert(unreachable.status !== ok.status, 'sourceUnavailableとokは異なるstatus値')
      assert(unreachable.status === 'sourceUnavailable', 'unreachableはsourceUnavailable')
    },
  },
  {
    // 本番スクリプト（mitsukoshiGinzaFoodEventsFetch.ts）が __fixtures__ 配下の
    // fixtureファイルを一切参照していないことを静的に確認する——fixtureデータが
    // 誤って本番候補生成に混入することを構造的に防ぐ（このテスト自体が回帰検知）。
    name: 'fixtureを本番候補に使用しない: mitsukoshiGinzaFoodEventsFetch.ts のソースは fixture を一切参照しない',
    fn: () => {
      const scriptPath = resolve(__dirname, '../../scripts/mitsukoshiGinzaFoodEventsFetch.ts')
      const src = readFileSync(scriptPath, 'utf-8')
      assert(!/__fixtures__/.test(src), 'スクリプトが__fixtures__ディレクトリを参照していない')
      assert(!/\.fixture\.json/.test(src), 'スクリプトが.fixture.jsonファイルを参照していない')
      assert(/decideMitsukoshiFetchGate/.test(src), '決定的ゲート（mitsukoshiFetchGate.ts）を経由している')
    },
  },
  {
    name: 'fixtureを本番候補に使用しない: matsuyaGourmetEventsFetch.ts / matsuyaSweetsWeeklyFetch.ts も fixture を参照しない',
    fn: () => {
      for (const file of ['matsuyaGourmetEventsFetch.ts', 'matsuyaSweetsWeeklyFetch.ts']) {
        const src = readFileSync(resolve(__dirname, '../../scripts', file), 'utf-8')
        assert(!/__fixtures__/.test(src), `${file} が__fixtures__ディレクトリを参照していない`)
        assert(!/\.fixture\.json/.test(src), `${file} が.fixture.jsonファイルを参照していない`)
      }
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('mitsukoshiFetchGate', cases)
