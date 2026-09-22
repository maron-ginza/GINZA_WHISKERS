// GINZA WHISKERS / Project 02（2026-09-22）— fieldMaterialProvenance の回帰テスト。
//
//   node --import=tsx/esm src/lib/crawler/fieldMaterialProvenance.check.ts

import { runSuite, type CheckCase } from '../__checks__/_harness'
import { computeContentFingerprint, validateDiscoveredContentSourceFields } from './fieldMaterialProvenance'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cases: CheckCase[] = [
  {
    name: 'computeContentFingerprint: 同じpartsなら常に同じ値を返す（決定的）',
    fn: () => {
      const a = computeContentFingerprint(['doc1', 'p.6', '銀茶会'])
      const b = computeContentFingerprint(['doc1', 'p.6', '銀茶会'])
      assert(a === b, '同じ入力は同じハッシュになるはず')
    },
  },
  {
    name: 'computeContentFingerprint: 1文字でも異なれば異なる値を返す',
    fn: () => {
      const a = computeContentFingerprint(['doc1', 'p.6', '銀茶会'])
      const b = computeContentFingerprint(['doc1', 'p.7', '銀茶会'])
      assert(a !== b, 'ページ番号が違えば別のハッシュになるはず')
    },
  },
  {
    name: 'computeContentFingerprint: 64文字のhex文字列（sha256）を返す',
    fn: () => {
      const h = computeContentFingerprint(['x'])
      assert(/^[0-9a-f]{64}$/.test(h), `sha256 hexのはず（実際 ${h}）`)
    },
  },
  {
    name: 'validate: collectionMethod未指定（既定web_crawl）でarticleUrlがあれば有効',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({ articleUrl: 'https://example.com/x' })
      assert(r.valid === true, '既存のWeb巡回パターンは従来どおり有効なはず')
    },
  },
  {
    name: 'validate: collectionMethod未指定でarticleUrlが無ければ無効（既存の挙動を壊さない）',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({})
      assert(r.valid === false, 'articleUrl無しは無効のはず')
      assert(r.errors.some((e) => e.includes('articleUrl')), 'articleUrl不足のエラーを含むはず')
    },
  },
  {
    name: 'validate: collectionMethod=web_crawl でarticleUrlが無ければ無効',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({ collectionMethod: 'web_crawl' })
      assert(r.valid === false, 'web_crawlはarticleUrl必須のはず')
    },
  },
  {
    name: 'validate: collectionMethod=field_material で全必須項目が揃っていれば有効（articleUrl無しでも可）',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({
        collectionMethod: 'field_material',
        articleUrl: null,
        sourceDocumentId: 'autumn-ginza-2026-booklet',
        sourcePage: 'p.6-7',
        contentFingerprint: computeContentFingerprint(['autumn-ginza-2026-booklet', 'p.6-7', '銀茶会']),
        sourceMaterialName: 'AUTUMN GINZA 2026',
        sourceMaterialHash: 'a'.repeat(64),
        sourceMaterialLocation: 'media/manual-source-inbox/autumn-ginza-2026/オータムギンザ.pdf',
        collectedBy: 'Maron',
      })
      assert(r.valid === true, `全項目揃っていれば有効のはず（実際のエラー: ${r.errors.join(', ')}）`)
    },
  },
  {
    name: 'validate: collectionMethod=field_material でcontentFingerprintが無ければ無効',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({
        collectionMethod: 'field_material',
        sourceDocumentId: 'doc1',
        sourcePage: 'p.1',
        sourceMaterialName: 'X',
        sourceMaterialHash: 'a'.repeat(64),
        sourceMaterialLocation: 'media/x',
        collectedBy: 'Maron',
      })
      assert(r.valid === false, 'contentFingerprint無しは無効のはず')
      assert(r.errors.some((e) => e.includes('contentFingerprint')), 'contentFingerprint不足のエラーを含むはず')
    },
  },
  {
    name: 'validate: collectionMethod=field_material でcollectedByが無ければ無効（推測補完しない）',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({
        collectionMethod: 'field_material',
        sourceDocumentId: 'doc1',
        sourcePage: 'p.1',
        contentFingerprint: 'x'.repeat(64),
        sourceMaterialName: 'X',
        sourceMaterialHash: 'a'.repeat(64),
        sourceMaterialLocation: 'media/x',
      })
      assert(r.valid === false, 'collectedBy無しは無効のはず')
    },
  },
  {
    name: 'validate: field_material は複数の不足項目を同時に報告する（1件ずつ直させない）',
    fn: () => {
      const r = validateDiscoveredContentSourceFields({ collectionMethod: 'field_material' })
      assert(r.errors.length >= 5, `複数の不足項目が同時に報告されるはず（実際 ${r.errors.length}件）`)
    },
  },
]

export const suite = (): ReturnType<typeof runSuite> => runSuite('fieldMaterialProvenance', cases)
