// GINZA WHISKERS / Project 02（2026-09-09、事実確認改善）の回帰テスト。
//
// 目的：
//   ・「公式記載なし（確認済み）」／「取得失敗（再取得で解消しうる）」／「記事タイプ上該当なし」を
//     明確に区別できること。
//   ・記事タイプごとに適用項目を判定できること（admissionApplicable='no' で event 系の paid 必須免除、
//     saleAvailability='no_period_stated' で sale の販売期間・過去/未来ゲート免除）。
//   ・公式記載なしを推測で埋めないこと（fetch 失敗時は免除フラグを立てない）。
//   ・会場住所は同一登録可能ドメインの施設ページからのみ補完すること。
//   ・ready 化の人間承認ゲートは不変（この経路は draft のみ）。
//
// すべて決定的・オフライン（DB・ネットワーク・AI・課金なし）。

import { runSuite, reportAndExit, type CheckCase } from './_harness'
import {
  fetchOfficialSignals,
  pickVenueDetailUrl,
  registrableDomain,
  sameRegistrableDomain,
} from '../morning/fetchOfficialSignals'
import {
  extractArticleFactsCandidate,
  extractVenueAddressFromSignals,
} from '../morning/extractArticleFactsCandidate'
import { extractProductNewsFactsCandidate } from '../morning/extractProductNewsFacts'
import { assessCandidate, type AssessCandidateInput } from '../morning/assessCandidate'
import { evaluateReadyGate, type CommonArticleFacts } from '../template/readyGate'
import type { DiscoveredContentLike } from '../template/mapDiscoveredContentToEventFields'
import type { ImagePreflightResult, OfficialPageSignals } from '../morning/types'

function assert(c: unknown, m: string): void {
  if (!c) throw new Error(m)
}

const NOW = new Date('2026-09-09T09:00:00+09:00')
const FUTURE_ISO = '2026-10-01T00:00:00.000Z'
const PAST_ISO = '2026-08-01T00:00:00.000Z'
const NO_IMAGE: ImagePreflightResult = { available: false, policy: '画像なし', externalImageProhibited: true }

function dc(over: Partial<DiscoveredContentLike> = {}): DiscoveredContentLike {
  return {
    id: 700,
    title: '銀座テスト展 開催のお知らせ',
    excerpt: '銀座で開かれる展示です。',
    articleUrl: 'https://www.ginza.jp/shopnews/shopnews-x/1',
    sourceSiteName: 'GINZA OFFICIAL',
    eventStartAt: null,
    eventEndAt: null,
    venue: '銀座中央通り',
    contentType: 'exhibition',
    uxType: null,
    lastCheckedAt: '2026-09-09T00:00:00.000Z',
    detectedAt: '2026-09-09T00:00:00.000Z',
    dateExtraction: null,
    ...over,
  }
}
function sig(over: Partial<OfficialPageSignals> = {}): OfficialPageSignals {
  return { requested: true, ok: true, fetchOutcome: 'ok', httpStatus: 200, fetchedAt: '2026-09-09T00:00:00.000Z', bodyText: '', ...over }
}
function baseSaleFacts(over: Partial<CommonArticleFacts> = {}): CommonArticleFacts {
  return {
    templateType: 'sale',
    contentTitle: '商品X',
    contentSummary: '概要。',
    priceText: '1,000円（税込）',
    officialInfoNote: '補足。',
    hashtags: [{ tag: '#銀座' }],
    sourceProvenanceFacts: [{ fact: '価格 1,000円', verificationStatus: 'confirmed' }],
    enrichmentStatus: 'ready',
    ...over,
  }
}
function baseEventFacts(over: Partial<CommonArticleFacts> = {}): CommonArticleFacts {
  return {
    templateType: 'exhibition',
    contentTitle: '展示X',
    contentSummary: '何が行われるか。',
    availablePeriod: '2026年10月1日〜10月20日',
    eventDateISO: FUTURE_ISO,
    eventTime: '11時から19時まで',
    areaLead: '会場は1か所です。',
    audienceNote: 'アートに関心のある方へ。',
    officialInfoNote: '補足。',
    venues: [{ name: '展示X', place: '中央区銀座8-1-1' }],
    hashtags: [{ tag: '#銀座' }],
    sourceProvenanceFacts: [{ fact: '会期 2026年10月1日〜', verificationStatus: 'confirmed' }],
    enrichmentStatus: 'ready',
    ...over,
  }
}
function mk(over: Partial<AssessCandidateInput> = {}): AssessCandidateInput {
  return { dc: dc(), facts: undefined, dedup: { duplicate: false }, imageInventory: [], now: NOW, ...over }
}

// AMBUSH 型（販売期間ラベル・日付レンジなし・店頭取扱明示・発売中なし）
const AMBUSH_BODY =
  'AMBUSH® WORKSHOP GINZA Fashion New Era®を象徴するクラシックなフォルムに大胆な素材使いを融合したコレクション。 ' +
  'NEW ERA A-PATCH CAP 価格：16,500円(税込) カラー：Black サイズ：Free ' +
  '是非、店頭にてご覧くださいませ。 AMBUSH® WORKSHOP GINZA フロア: 3F 店舗情報はこちら 2026.08.30 UP'
const dcAmbush = dc({
  id: 370,
  title: 'AMBUSH® x New Era® – GINZA SIX',
  articleUrl: 'https://ginza6.tokyo/news/detail/shopnews/224269',
  sourceSiteName: 'GINZA SIX',
  contentType: 'news',
  eventStartAt: null,
  eventEndAt: null,
  venue: null,
  dateExtraction: null,
})

const cases: CheckCase[] = [
  // ---------- registrableDomain / sameRegistrableDomain / pickVenueDetailUrl ----------
  {
    name: 'registrableDomain: co.jp / jp / com を正しく畳む',
    fn: () => {
      assert(registrableDomain('www.motoji.co.jp') === 'motoji.co.jp', registrableDomain('www.motoji.co.jp'))
      assert(registrableDomain('store.tsite.jp') === 'tsite.jp', registrableDomain('store.tsite.jp'))
      assert(registrableDomain('a.b.ginza6.tokyo') === 'ginza6.tokyo', registrableDomain('a.b.ginza6.tokyo'))
    },
  },
  {
    name: 'pickVenueDetailUrl: 同一登録可能ドメインの /access/ リンクだけを1件返す（別ドメインは無視）',
    fn: () => {
      const html = `
        <a href="/shopnews/shopnews-x/1">記事自身</a>
        <a href="https://other-domain.example/access/">別ドメインのアクセス</a>
        <a href="/shop/ginza-yanagi/access/">施設アクセス</a>
        <a href="/shop/ginza-yanagi/access/detail/deep">より深い</a>
        <a href="mailto:x@y.jp">メール</a>`
      const u = pickVenueDetailUrl(html, 'https://www.ginza.jp/shopnews/shopnews-x/1')
      assert(u === 'https://www.ginza.jp/shop/ginza-yanagi/access/', `実際: ${u}`)
      assert(sameRegistrableDomain(u!, 'https://www.ginza.jp/x'), '同一登録可能ドメイン')
    },
  },
  {
    name: 'pickVenueDetailUrl: 施設ページらしいリンクが無ければ null',
    fn: () => {
      const u = pickVenueDetailUrl('<a href="/news/2">別記事</a><a href="/blog/3">ブログ</a>', 'https://www.ginza.jp/news/1')
      assert(u === null, `実際: ${u}`)
    },
  },

  // ---------- readyGate: admissionApplicable ----------
  {
    name: 'readyGate: exhibition + admissionApplicable=no → paid 未確認でも eligible（paid を missing に入れない）',
    fn: () => {
      const g = evaluateReadyGate(baseEventFacts({ admissionApplicable: 'no' }), 'exhibition', { now: NOW })
      assert(g.eligible === true, `missing=${JSON.stringify(g.missing)}`)
      assert(!g.missing.some((m) => m.includes('paid')), `paid を免除（実際: ${JSON.stringify(g.missing)}）`)
    },
  },
  {
    name: 'readyGate: exhibition + admissionApplicable=not_stated → 従来どおり paid を必須（緩めていない）',
    fn: () => {
      const g = evaluateReadyGate(baseEventFacts({ admissionApplicable: 'not_stated' }), 'exhibition', { now: NOW })
      assert(g.eligible === false && g.missing.some((m) => m.includes('paid')), `paid 必須のまま（実際: ${JSON.stringify(g.missing)}）`)
    },
  },
  {
    name: 'readyGate: exhibition + admissionApplicable=no でも会場（venues[].place）は必須のまま',
    fn: () => {
      const g = evaluateReadyGate(baseEventFacts({ admissionApplicable: 'no', venues: [] }), 'exhibition', { now: NOW })
      assert(g.eligible === false && g.missing.some((m) => m.includes('venues')), `venues 必須（実際: ${JSON.stringify(g.missing)}）`)
    },
  },

  // ---------- readyGate: saleAvailability='no_period_stated' ----------
  {
    name: 'readyGate: sale + saleAvailability=no_period_stated → eventDateISO / availablePeriod を免除し eligible',
    fn: () => {
      const g = evaluateReadyGate(baseSaleFacts({ saleAvailability: 'no_period_stated', eventDateISO: '', availablePeriod: '' }), 'sale', { now: NOW })
      assert(g.eligible === true, `missing=${JSON.stringify(g.missing)}`)
      assert(!g.missing.some((m) => m.includes('eventDateISO') || m.includes('availablePeriod')), `期日ゲートを免除（実際: ${JSON.stringify(g.missing)}）`)
    },
  },
  {
    name: 'readyGate: sale + saleAvailability=unknown（未チェック）→ 従来どおり eventDateISO を missing（緩めていない）',
    fn: () => {
      const g = evaluateReadyGate(baseSaleFacts({ saleAvailability: 'unknown', eventDateISO: '', availablePeriod: '' }), 'sale', { now: NOW })
      assert(g.missing.some((m) => m.includes('eventDateISO')), `eventDateISO 必須のまま（実際: ${JSON.stringify(g.missing)}）`)
    },
  },
  {
    name: 'readyGate: sale + saleAvailability=has_end_date + 過去日 → 従来どおり「会期・有効期間が過去」で ineligible',
    fn: () => {
      const g = evaluateReadyGate(baseSaleFacts({ saleAvailability: 'has_end_date', eventDateISO: PAST_ISO, availablePeriod: '2026年8月1日' }), 'sale', { now: NOW })
      assert(g.eligible === false && g.missing.some((m) => m.includes('過去')), `過去判定は不変（実際: ${JSON.stringify(g.missing)}）`)
    },
  },

  // ---------- extractProductNewsFacts: no_period_stated / 取得失敗の区別 ----------
  {
    name: 'extract(product): AMBUSH 型（期間ラベル・日付レンジなし＋店頭取扱＋発売中なし）→ no_period_stated・officiallyNotStated に販売期間',
    fn: () => {
      const c = extractProductNewsFactsCandidate({ dc: dcAmbush, image: NO_IMAGE, officialSignals: sig({ bodyText: AMBUSH_BODY }), trustedSource: true, now: NOW })
      assert(c.fields.saleAvailability === 'no_period_stated', `実際: ${c.fields.saleAvailability}`)
      assert(c.officiallyNotStated.some((x) => x.includes('販売期間')), `officiallyNotStated（実際: ${JSON.stringify(c.officiallyNotStated)}）`)
      assert(!c.unknownItems.some((x) => x.includes('saleStartAt') || x.includes('saleEndAt')), '販売期間を unknownItems に入れない')
      assert(c.missingBecauseFetchFailed.length === 0, '取得成功なので取得失敗リストは空')
    },
  },
  {
    name: 'extract(product): 「発売中」あり・終了語なし → ongoing_no_end_stated（回帰）',
    fn: () => {
      const body = '花西子 FLORASISでは、新作チークを発売中！ 価格：3,190円(税込) 花西子 GINZA フロア: B1F 2026.08.31 UP'
      const c = extractProductNewsFactsCandidate({ dc: dcAmbush, image: NO_IMAGE, officialSignals: sig({ bodyText: body }), trustedSource: true, now: NOW })
      assert(c.fields.saleAvailability === 'ongoing_no_end_stated', `実際: ${c.fields.saleAvailability}`)
    },
  },
  {
    name: 'extract(product): 「数量限定」あり → no_period_stated にしない（終了示唆語がある）',
    fn: () => {
      const body = 'NEW ERA CAP 価格：16,500円(税込) 数量限定。是非、店頭にてご覧くださいませ。 GINZA フロア: 3F 2026.08.30 UP'
      const c = extractProductNewsFactsCandidate({ dc: dcAmbush, image: NO_IMAGE, officialSignals: sig({ bodyText: body }), trustedSource: true, now: NOW })
      assert(c.fields.saleAvailability !== 'no_period_stated', `実際: ${c.fields.saleAvailability}`)
    },
  },
  {
    name: 'extract(product): fetch 失敗（fetchOutcome=http_error）→ missingBecauseFetchFailed に販売開始/終了日・officiallyNotStated は空',
    fn: () => {
      const c = extractProductNewsFactsCandidate({
        dc: dcAmbush,
        image: NO_IMAGE,
        officialSignals: { requested: true, ok: false, fetchOutcome: 'http_error', httpStatus: 403, fetchedAt: 'x' },
        trustedSource: true,
        now: NOW,
      })
      assert(c.fields.saleAvailability === 'unknown', `取得失敗時は no_period_stated にしない（実際: ${c.fields.saleAvailability}）`)
      assert(c.missingBecauseFetchFailed.some((x) => x.includes('saleStartAt')), `取得失敗リスト（実際: ${JSON.stringify(c.missingBecauseFetchFailed)}）`)
      assert(!c.officiallyNotStated.some((x) => x.includes('販売期間')), '取得失敗を「公式記載なし」と混同しない')
    },
  },
  {
    name: 'extract(product): 「YYYY.MM.DD UP」（掲載日）を販売期間ラベルとみなさない（no_period_stated 判定を阻害しない）',
    fn: () => {
      const c = extractProductNewsFactsCandidate({ dc: dcAmbush, image: NO_IMAGE, officialSignals: sig({ bodyText: AMBUSH_BODY }), trustedSource: true, now: NOW })
      assert(c.fields.saleAvailability === 'no_period_stated', `UP 表記があっても no_period_stated（実際: ${c.fields.saleAvailability}）`)
    },
  },

  // ---------- extractArticleFactsCandidate: admissionApplicable / 会場住所 / 取得失敗 ----------
  {
    name: 'extract(event): 画廊型＋料金ラベル皆無＋取得成功 → admissionApplicable=no・notApplicable に入場料',
    fn: () => {
      const body = '銀座柳画廊「秋の名品展」 2026年9月6日（日）〜23日（水） 平日10時〜19時 20世紀の巨匠作品を展示販売。'
      const c = extractArticleFactsCandidate({
        dc: dc({ title: '銀座柳画廊「秋の名品展」', venue: '銀座柳画廊', contentType: 'exhibition', articleUrl: 'https://www.ginza.jp/shopnews/shopnews-ginza-yanagi-gallery/35821' }),
        image: NO_IMAGE,
        officialSignals: sig({ bodyText: body, finalUrl: 'https://www.ginza.jp/shopnews/shopnews-ginza-yanagi-gallery/35821' }),
        trustedSource: true,
        now: NOW,
      })
      assert(c.admissionApplicable === 'no', `実際: ${c.admissionApplicable}`)
      assert(c.notApplicable.some((x) => x.includes('入場料')), `notApplicable（実際: ${JSON.stringify(c.notApplicable)}）`)
      assert(c.missingBecauseFetchFailed.length === 0, '取得成功なので取得失敗リストは空')
    },
  },
  {
    name: 'extract(event): 料金ラベルが本文にある → admissionApplicable=yes（免除しない）',
    fn: () => {
      const body = '銀座柳画廊「秋の名品展」 観覧料：500円 2026年9月6日〜23日 巨匠作品を展示。'
      const c = extractArticleFactsCandidate({
        dc: dc({ title: '銀座柳画廊「秋の名品展」', venue: '銀座柳画廊', contentType: 'exhibition', articleUrl: 'https://www.ginza.jp/shopnews/shopnews-ginza-yanagi-gallery/35821' }),
        image: NO_IMAGE, officialSignals: sig({ bodyText: body }), trustedSource: true, now: NOW,
      })
      assert(c.admissionApplicable === 'yes', `実際: ${c.admissionApplicable}`)
    },
  },
  {
    name: 'extract(event): 会場種別を機械分類できない → admissionApplicable=not_stated（推測しない）',
    fn: () => {
      const body = '謎のイベント 2026年10月1日開催。詳細は後日。'
      const c = extractArticleFactsCandidate({
        dc: dc({ title: '謎のイベント', venue: 'どこかの会場', contentType: 'event', articleUrl: 'https://www.ginza.jp/event/999' }),
        image: NO_IMAGE, officialSignals: sig({ bodyText: body }), trustedSource: true, now: NOW,
      })
      assert(c.admissionApplicable === 'not_stated', `実際: ${c.admissionApplicable}`)
    },
  },
  {
    name: 'extract(event): fetch 失敗 → missingBecauseFetchFailed 非空・officiallyNotStated 空・admissionApplicable=not_stated（免除しない）',
    fn: () => {
      const c = extractArticleFactsCandidate({
        dc: dc({ title: '銀座柳画廊「秋の名品展」', venue: '銀座柳画廊', contentType: 'exhibition' }),
        image: NO_IMAGE,
        officialSignals: { requested: true, ok: false, fetchOutcome: 'timeout', fetchedAt: 'x' },
        trustedSource: true,
        now: NOW,
      })
      assert(c.admissionApplicable === 'not_stated', `取得失敗時は 'no' にしない（実際: ${c.admissionApplicable}）`)
      assert(c.missingBecauseFetchFailed.length > 0, '取得失敗リストに載る')
      assert(c.officiallyNotStated.length === 0, '取得失敗を「公式記載なし」にしない')
    },
  },
  {
    name: 'extract(event): 同一登録可能ドメインの施設ページ（venueDetail）の JSON-LD address から会場住所を補完',
    fn: () => {
      const venueDetail: OfficialPageSignals = sig({
        finalUrl: 'https://www.ginza.jp/shop/ginza-yanagi/access/',
        jsonLd: [{ '@type': 'ArtGallery', address: { '@type': 'PostalAddress', postalCode: '104-0061', addressRegion: '東京都', addressLocality: '中央区銀座8-8-15', streetAddress: '青柳ビル1F' } }],
      })
      const c = extractArticleFactsCandidate({
        dc: dc({ title: '銀座柳画廊「秋の名品展」', venue: '銀座柳画廊', contentType: 'exhibition', articleUrl: 'https://www.ginza.jp/shopnews/shopnews-ginza-yanagi-gallery/35821' }),
        image: NO_IMAGE,
        officialSignals: sig({ bodyText: '銀座柳画廊「秋の名品展」 2026年9月6日〜23日 巨匠作品を展示販売。', finalUrl: 'https://www.ginza.jp/shopnews/shopnews-ginza-yanagi-gallery/35821', venueDetail }),
        trustedSource: true,
        now: NOW,
      })
      assert(!!c.venueAddress && c.venueAddress.value.includes('中央区銀座8-8-15'), `venueAddress（実際: ${JSON.stringify(c.venueAddress)}）`)
      assert(c.venueAddress!.sourceUrl === 'https://www.ginza.jp/shop/ginza-yanagi/access/', '住所の出典は施設ページ URL')
      assert(c.extractedEventFacts.venuePlace.confirmationStatus === 'confirmed' && (c.extractedEventFacts.venuePlace.value ?? '').includes('中央区銀座8-8-15'), '会場名＋住所を confirmed 会場に')
    },
  },
  {
    name: 'extractVenueAddressFromSignals: 別ドメイン相当（venueDetail が ok=false）→ null（取得失敗を住所として使わない）',
    fn: () => {
      const r = extractVenueAddressFromSignals(sig({ venueDetail: { requested: true, ok: false, fetchOutcome: 'not_allowed_host', fetchedAt: 'x' }, bodyText: '住所の記載なし' }))
      assert(r === null, `実際: ${JSON.stringify(r)}`)
    },
  },

  // ---------- assessCandidate: 取得失敗を B の理由に明示（「公式記載なし」と別文言・verdict は動かさない） ----------
  {
    name: 'assessCandidate: officialFetchOutcome=http_error → B の理由に「取得失敗（再取得で解消しうる）」・「公式記載なし」とは別文言',
    fn: () => {
      const a = assessCandidate(mk({ factKind: 'event', officialFetchOutcome: 'http_error' }))
      assert(a.verdict === 'B', `実際: ${a.verdict}`)
      const joined = a.reasons.join(' / ')
      assert(/取得失敗/.test(joined) && /fetchOutcome=http_error/.test(joined), `理由に取得失敗（実際: ${joined}）`)
      assert(!/公式記載なし/.test(joined), '「公式記載なし」と混同しない')
    },
  },
  {
    name: 'assessCandidate: officialFetchOutcome=ok → 取得失敗の理由を足さない（回帰）',
    fn: () => {
      const a = assessCandidate(mk({ factKind: 'event', officialFetchOutcome: 'ok' }))
      assert(!a.reasons.join(' / ').includes('取得失敗'), '取得成功なら足さない')
    },
  },
  {
    name: 'assessCandidate: dedup.duplicate=true は officialFetchOutcome に関係なく C（順序の回帰）',
    fn: () => {
      const a = assessCandidate(mk({ factKind: 'event', officialFetchOutcome: 'timeout', dedup: { duplicate: true, existingArticleId: 5 } }))
      assert(a.verdict === 'C', `実際: ${a.verdict}`)
    },
  },
]

export const suite = () => runSuite('factVerification(2026-09-09)', cases)

// ── fetchOutcome の非同期テスト（実ネットワークに触れず弾く経路のみ・run-all では実行しない） ──
export async function runFetchOutcomeTests(): Promise<{ pass: number; fail: number; failures: string[] }> {
  const failures: string[] = []
  const check = async (name: string, url: string | null, hosts: string[], want: string): Promise<void> => {
    try {
      const r = await fetchOfficialSignals(url as string, { allowedHosts: hosts })
      if (r.fetchOutcome !== want || r.ok !== false) failures.push(`${name}: fetchOutcome=${want} を期待（got ${r.fetchOutcome}）`)
    } catch (e) {
      failures.push(`${name}: 例外を投げてはいけない（${e instanceof Error ? e.message : String(e)}）`)
    }
  }
  await check('空 URL → bad_url', '', ['ginza.jp'], 'bad_url')
  await check('不正 URL → bad_url', 'not-a-url', ['ginza.jp'], 'bad_url')
  await check('allowedHosts 空 → not_allowed_host', 'https://example.com/x', [], 'not_allowed_host')
  await check('localhost → ssrf_blocked', 'http://localhost/x', ['localhost'], 'ssrf_blocked')
  await check('クラウドメタデータ IP → ssrf_blocked', 'http://169.254.169.254/latest', ['ginza.jp'], 'ssrf_blocked')
  await check('file:// → bad_url（URL 形式チェックが SSRF より先。どちらでも ok:false）', 'file:///etc/passwd', ['ginza.jp'], 'bad_url')
  await check('許可ドメイン外（似せた別ドメイン）→ not_allowed_host', 'https://ginza.jp.evil.example/x', ['ginza.jp'], 'not_allowed_host')
  await check('認証情報埋め込み → ssrf_blocked', 'http://u:p@www.ginza.jp/x', ['www.ginza.jp'], 'ssrf_blocked')
  return { pass: 8 - failures.length, fail: failures.length, failures }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = suite()
  void (async () => {
    const f = await runFetchOutcomeTests()
    console.log(`[${f.fail === 0 ? 'PASS' : 'FAIL'}] fetchOutcome(async, no-network)  (${f.pass} passed, ${f.fail} failed)`)
    for (const x of f.failures) console.log('  ✗ ' + x)
    s.pass += f.pass
    s.fail += f.fail
    s.failures.push(...f.failures)
    reportAndExit([s])
  })()
}
