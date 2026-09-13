import assert from 'node:assert/strict'

import { checkUnsourcedPeriodClaims } from '../curation/unsourcedPeriodClaimGate'
import { runSuite, type CheckCase } from './_harness'

const cases: CheckCase[] = [
  {
    // 再発防止 #5 の直接の契機：Article #64「ISHIYA G アイガトー」。
    // GINZA SIXニュース掲載日（2026年8月17日）しか出典に無いのに、本文が
    // 「2026年8月29日から9月16日まで」という具体的な販売期間を主張していた。
    name: 'Article #64 実データ再現：出典に無い販売期間→ unsourcedPeriodClaim',
    fn: () => {
      const backing = [
        'ISHIYA Gの「アイガトー」がGINZA SIX B2Fで案内中',
        'プレーン・ショコラ1個237円、抹茶1個324円',
      ]
      const body =
        '案内は2026年8月17日付でGINZA SIXニュースに掲載され、2026年8月29日から9月16日までの期間で紹介されている。'
      const r = checkUnsourcedPeriodClaims(body, backing)
      assert.ok(r.hits.some((h) => h.code === 'unsourcedPeriodClaim'), JSON.stringify(r.hits))
      assert.ok(r.hits.some((h) => h.unbackedPart === 'both'), JSON.stringify(r.hits))
    },
  },
  {
    name: '開始日のみ出典にある→ unbackedPart:"end"',
    fn: () => {
      const backing = ['8月29日から店頭に並ぶ']
      const body = '8月29日から9月16日まで販売される。'
      const r = checkUnsourcedPeriodClaims(body, backing)
      assert.equal(r.hits.length, 1)
      assert.equal(r.hits[0].unbackedPart, 'end')
    },
  },
  {
    name: '終了日のみ出典にある→ unbackedPart:"start"',
    fn: () => {
      const backing = ['9月16日で販売終了予定']
      const body = '8月29日から9月16日まで販売される。'
      const r = checkUnsourcedPeriodClaims(body, backing)
      assert.equal(r.hits.length, 1)
      assert.equal(r.hits[0].unbackedPart, 'start')
    },
  },
  {
    // 裏付けあり：Article #65「八代目市川染五郎写真展」のような、公式ページに
    // 明記された会期をそのまま本文化したケースはヒットしない
    name: '裏付けあり（公式に明記された会期をそのまま記載）→ ヒットなし',
    fn: () => {
      const backing = [
        '【フェア】写真集『HAMLET』発売記念 八代目市川染五郎写真展',
        '会期：2026年10月2日（金）〜10月25日（日）',
      ]
      const body =
        '銀座 蔦屋書店 BOOK売場（アート）で、2026年10月2日（金）から10月25日（日）まで開催される。'
      const r = checkUnsourcedPeriodClaims(body, backing)
      assert.equal(r.hits.length, 0, JSON.stringify(r.hits))
    },
  },
  {
    name: '年表記の有無・全角波ダッシュ表記ゆれを吸収する',
    fn: () => {
      const backing = ['10月2日〜10月25日開催']
      const body = '2026年10月2日～2026年10月25日まで開催される。'
      const r = checkUnsourcedPeriodClaims(body, backing)
      assert.equal(r.hits.length, 0, JSON.stringify(r.hits))
    },
  },
  {
    name: '本文に日付レンジ表現が無い→ ヒットなし（no-op）',
    fn: () => {
      const r = checkUnsourcedPeriodClaims('ISHIYA Gが焼き菓子を案内している。価格は237円。', [])
      assert.equal(r.hits.length, 0)
    },
  },
  {
    name: '同一フレーズの重複ヒットを除去する',
    fn: () => {
      const body = '8月29日から9月16日まで販売。詳細は8月29日から9月16日まで、店頭で。'
      const r = checkUnsourcedPeriodClaims(body, [])
      assert.equal(r.hits.length, 1, JSON.stringify(r.hits))
    },
  },
]

export const suite = () => runSuite('unsourcedPeriodClaimGate', cases)

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = suite()
  console.log(`${r.fail === 0 ? 'PASS' : 'FAIL'} unsourcedPeriodClaimGate (${r.pass}/${r.pass + r.fail})`)
  for (const f of r.failures) console.log('  ✗ ' + f)
  process.exit(r.fail > 0 ? 1 : 0)
}
