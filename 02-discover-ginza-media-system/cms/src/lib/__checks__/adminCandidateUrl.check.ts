// 候補確認・一括承諾URLの回帰テスト。
// Payload 3 admin と同じパーサ（qs-esm.parse）で復元し、id "is in" が
// 配列として復元されること・件数・順序・status・limit を検証する。
import { parse } from 'qs-esm'

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import { buildAdminCandidateReviewUrl, parseAdminCandidateReviewUrl } from '../pipeline/adminCandidateUrl'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const IDS = [334, 367, 527, 327, 549, 328, 376, 352, 365, 520]

/** Payload admin と同じ where 復元（search 文字列 → where オブジェクト） */
function payloadWhereFromUrl(url: string): any {
  const search = new URL(url).search.replace(/^\?/, '')
  return parse(search, { depth: 10, ignoreQueryPrefix: true })
}

const cases: CheckCase[] = [
  {
    name: 'qs-esm 復元：id.in が 10件の配列（カンマ文字列でない）',
    fn: () => {
      const url = buildAdminCandidateReviewUrl({ dcIds: IDS, curationStatus: 'inbox' })
      const q = payloadWhereFromUrl(url)
      const idIn = q?.where?.or?.[0]?.and?.[0]?.id?.in
      assert(Array.isArray(idIn), `id.in は配列であること（実際: ${JSON.stringify(idIn)}）`)
      assert(idIn.length === 10, `10件（実際: ${idIn.length}）`)
      assert(idIn.every((x: unknown) => typeof x === 'string'), 'qs は文字列で復元')
      assert(!idIn.some((x: string) => x.includes(',')), 'カンマ結合の単一文字列になっていない')
      assert(JSON.stringify(idIn.map(Number)) === JSON.stringify(IDS), `順序も一致（実際: ${JSON.stringify(idIn)}）`)
    },
  },
  {
    name: 'qs-esm 復元：curationStatus.equals = inbox',
    fn: () => {
      const q = payloadWhereFromUrl(buildAdminCandidateReviewUrl({ dcIds: IDS, curationStatus: 'inbox' }))
      const eq = q?.where?.or?.[0]?.and?.[1]?.curationStatus?.equals
      assert(eq === 'inbox', `inbox（実際: ${eq}）`)
    },
  },
  {
    name: 'limit は件数（最低10）',
    fn: () => {
      const url = buildAdminCandidateReviewUrl({ dcIds: IDS, curationStatus: 'inbox' })
      assert(/[?&]limit=10(&|$)/.test(url), `limit=10（URL: ${url}）`)
      const u2 = buildAdminCandidateReviewUrl({ dcIds: [1, 2, 3], curationStatus: 'inbox' })
      assert(/[?&]limit=10(&|$)/.test(u2), '3件でも最低 limit=10')
      const u3 = buildAdminCandidateReviewUrl({ dcIds: IDS, curationStatus: 'inbox', limit: 25 })
      assert(/[?&]limit=25(&|$)/.test(u3), 'limit 明示は尊重')
    },
  },
  {
    name: 'コレクション slug は discovered-content',
    fn: () => {
      const url = buildAdminCandidateReviewUrl({ dcIds: IDS, curationStatus: 'inbox' })
      assert(url.includes('/admin/collections/discovered-content?'), url)
    },
  },
  {
    name: 'baseUrl 末尾スラッシュを正規化・CMS_URL 相当を尊重',
    fn: () => {
      const url = buildAdminCandidateReviewUrl({ baseUrl: 'http://localhost:3000/', dcIds: [1], curationStatus: 'inbox' })
      assert(url.startsWith('http://localhost:3000/admin/'), url)
      assert(!url.includes('3000//admin'), '二重スラッシュにしない')
    },
  },
  {
    name: '重複IDは除去・順序保持',
    fn: () => {
      const url = buildAdminCandidateReviewUrl({ dcIds: [5, 5, 3, 3, 9], curationStatus: 'inbox' })
      const idIn = payloadWhereFromUrl(url)?.where?.or?.[0]?.and?.[0]?.id?.in
      assert(JSON.stringify(idIn) === JSON.stringify(['5', '3', '9']), JSON.stringify(idIn))
    },
  },
  {
    name: '自前の逆パーサでも一致（ids / status / limit）',
    fn: () => {
      const url = buildAdminCandidateReviewUrl({ dcIds: IDS, curationStatus: 'inbox' })
      const p = parseAdminCandidateReviewUrl(url)
      assert(JSON.stringify(p.ids) === JSON.stringify(IDS), JSON.stringify(p.ids))
      assert(p.curationStatus === 'inbox', String(p.curationStatus))
      assert(p.limit === 10, String(p.limit))
      assert(p.collectionSlug === 'discovered-content', p.collectionSlug)
    },
  },
  {
    name: '旧形式（カンマ結合）は id.in が単一文字列になり不正＝この形は使わない',
    fn: () => {
      const legacy = `http://localhost:3000/admin/collections/discovered-content?where[or][0][and][0][id][in]=${IDS.join(',')}&where[or][0][and][1][curationStatus][equals]=inbox`
      const idIn = payloadWhereFromUrl(legacy)?.where?.or?.[0]?.and?.[0]?.id?.in
      assert(typeof idIn === 'string' && idIn.includes(','), `旧形式は単一文字列（実際: ${JSON.stringify(idIn)}）＝Payload の ID 欄が空欄になる`)
    },
  },
]

export const suite = () => runSuite('adminCandidateUrl', cases)
if (import.meta.url === `file://${process.argv[1]}`) reportAndExit([suite()])
