/*
 * GINZA WHISKERS / Project 02 — 候補選定の自動化 検証（2026-09-04）
 *
 * 実行:  cd cms && node --import=tsx/esm src/lib/pipeline/selectRecommendedThemes.check.ts
 *
 * 決定的・DB 非接続・AI 呼び出しなし。
 *   ・安全性 gate（必須・加点で救わない）
 *   ・偏りハードキャップ（マロン指示 2026-09-04）：
 *       推奨10件中 同一施設 ≤ 2（原則1・例外は3条件＋理由）／同一情報源 ≤ 2（20%）
 *       予備5件中 同一施設 ≤ 2／推奨＋予備15件 同一施設 ≤ 3・同一情報源 ≤ 3
 *   ・不足時は GINZA SIX 等で穴埋めせず shortfall（finalized=false）
 *   ・venue 空でも sourceName/URL/【店名】から施設キーを解決（推測はしない）
 *   ・暫定カテゴリー（明記から）を選定前に確認・全件未確定なら finalized=false
 */
import {
  selectRecommendedThemes,
  evaluateSafetyGate,
  evaluateReadiness,
  DEFAULT_SELECT_THEMES_CONFIG,
  loadSelectThemesConfigFromEnv,
  type ThemeCandidate,
} from './selectRecommendedThemes'
import { buildSelectionBalance } from './selectionBalance'
import { facilityKeyFromVenue, resolveFacilityKey } from '../curation/facilityKey'
import { deriveProvisionalCategory } from './provisionalCategory'

let fail = 0
const ok = (c: boolean, label: string) => {
  console.log(`  ${c ? '✅' : '❌'} ${label}`)
  if (!c) fail++
}
const section = (t: string) => console.log(`\n──────── ${t} ────────`)
const NOW = new Date('2026-09-04T00:00:00.000Z')
const iso = (d: string) => new Date(d + 'T00:00:00.000Z').toISOString()

// 実在する施設名（facilityKeyFromVenue が別々のキーへ正規化する）
const STORE_VENUES = [
  'ポーラ ミュージアム アネックス', '松屋銀座', '銀座三越', '和光本館', 'GINZA PLACE',
  '資生堂ギャラリー', 'エルメス Le Forum', 'ライカギャラリー銀座', 'ggg', 'クリエイションギャラリー',
  '銀座 蔦屋書店', 'シャネル・ネクサス・ホール', '無名ギャラリーA', '無名ギャラリーB', '無名ギャラリーC',
  '無名ギャラリーD', '無名ギャラリーE', '無名ギャラリーF', '無名ギャラリーG', '無名ギャラリーH',
]

let uid = 100
function safe(over: Partial<ThemeCandidate> = {}): ThemeCandidate {
  const id = ++uid
  return {
    discoveredContentId: id,
    title: `百世 作品展 ${id}`,
    sourceName: 'GINZA OFFICIAL',
    sourceUrl: `https://www.ginza.jp/event/${id}`,
    verifiedAt: iso('2026-09-03'),
    verdict: 'A',
    expired: false,
    ginzaRelevant: true,
    hasTraceableSource: true,
    duplicate: false,
    factKind: 'event',
    templateType: 'exhibition',
    templateTypeConfidence: 'high',
    templateEligible: true,
    factsSource: 'ready',
    precheckDecision: '投稿可能',
    primaryCategory: 'ART',
    uxType: 'exhibition_viewing',
    eventStartAt: iso('2026-09-06'),
    eventEndAt: iso('2026-09-20'),
    venue: 'ポーラ ミュージアム アネックス',
    contentType: 'exhibition',
    eventPeriod: '2026年9月6日〜9月20日',
    ...over,
  }
}

// ---------------------------------------------------------------------------
section('S1: facilityKey — 会場テキスト＋（venue 空なら）情報源/URL/【店名】から解決')
{
  const r = facilityKeyFromVenue('銀座 蔦屋書店 文具売り場（GINZA SIX 6F）')
  ok(r.key === 'ginza-tsutaya', `蔦屋書店 → key=ginza-tsutaya（実際: ${r.key}）`)
  ok(r.areaKey === 'ginza-six', `共有ビル → areaKey=ginza-six（実際: ${r.areaKey}）`)
  ok(facilityKeyFromVenue('松屋銀座 8階 イベントスクエア').key === 'matsuya-ginza', '松屋銀座')
  ok(facilityKeyFromVenue('').key === null, '空文字 → key=null')

  // venue 空 → 情報源が施設（GINZA SIX）
  const g6 = resolveFacilityKey({ venue: '', sourceName: 'GINZA SIX', sourceUrl: 'https://ginza6.tokyo/news/detail/shopnews/224249', title: 'CFCL Collection – GINZA SIX' })
  ok(g6.key === 'ginza-six', `venue 空でも GINZA SIX → ginza-six（実際: ${g6.key}）`)
  // venue 空 → 蔦屋（URL ホスト）
  const ts = resolveFacilityKey({ venue: null, sourceName: '銀座 蔦屋書店', sourceUrl: 'https://store.tsite.jp/ginza/event/art/56496-1.html', title: '【フェア】原画展' })
  ok(ts.key === 'ginza-tsutaya', `venue 空でも 蔦屋 → ginza-tsutaya（実際: ${ts.key}）`)
  // 集約サイト GINZA OFFICIAL：URL スラッグから個店
  const oj = resolveFacilityKey({ venue: '', sourceName: 'GINZA OFFICIAL', sourceUrl: 'https://www.ginza.jp/shopnews/shopnews-joliesse/35814', title: '【ジョリエス】華雅展' })
  ok(oj.key === 'shop:joliesse', `GINZA OFFICIAL /shopnews-joliesse/ → shop:joliesse（実際: ${oj.key}）`)
  const om = resolveFacilityKey({ venue: '', sourceName: 'GINZA OFFICIAL', sourceUrl: 'https://www.ginza.jp/shopnews/shopnews-matsuya-ginza/35702', title: 'アニメ天官賜福展' })
  ok(om.key === 'matsuya-ginza', `GINZA OFFICIAL /shopnews-matsuya-ginza/ → matsuya-ginza（実際: ${om.key}）`)
  // 集約サイト 中央区：施設が分からない → null（会場不明。推測しない）
  const ch = resolveFacilityKey({ venue: '', sourceName: '中央区観光関連', sourceUrl: 'https://www.chuo-kanko.or.jp/blogs/event/202607291349', title: '第16回 銀座シャンソン＆音楽祭' })
  ok(ch.key === null, `中央区の集約ページ・施設不明 → key=null（推測しない。実際: ${ch.key}）`)
}

// ---------------------------------------------------------------------------
section('S2: 安全性 gate は必須（加点で救わない・緩めていない）')
{
  const C = DEFAULT_SELECT_THEMES_CONFIG
  ok(evaluateSafetyGate(safe(), C).length === 0, 'A/ready/eligible/known-type は gate 通過')
  ok(evaluateSafetyGate(safe({ verdict: 'C' }), C).includes('verdict_c'), 'C は落ちる')
  ok(evaluateSafetyGate(safe({ expired: true }), C).includes('expired'), 'expired は落ちる')
  ok(evaluateSafetyGate(safe({ duplicate: true }), C).includes('duplicate'), 'duplicate は落ちる')
  ok(evaluateSafetyGate(safe({ ginzaRelevant: false }), C).includes('not_ginza'), '銀座関連性なしは落ちる')
  ok(evaluateSafetyGate(safe({ hasTraceableSource: false }), C).includes('no_source'), '追跡可能な出典なしは落ちる')
  ok(evaluateSafetyGate(safe({ sourceUrl: 'not-a-url' }), C).includes('no_source'), 'URL 形式でない出典は落ちる')
  ok(evaluateSafetyGate(safe({ templateType: 'unknown' }), C).includes('unknown_type'), 'templateType=unknown は落ちる')
  ok(evaluateSafetyGate(safe({ templateType: 'exhibition', templateTypeConfidence: 'low' }), C).includes('unknown_type'), 'confidence=low は落ちる')
  ok(evaluateSafetyGate(safe({ factKind: 'unknown' }), C).includes('unknown_factkind'), 'factKind=unknown は落ちる')
  ok(evaluateSafetyGate(safe({ title: '' }), C).includes('no_title'), '正式タイトルが無いは落ちる（2026-09-06追加・根本改善）')
  ok(evaluateSafetyGate(safe({ title: '', displayTitle: '仮タイトル' }), C).length === 0, 'displayTitle があれば title 空でも通過')
  ok(
    evaluateSafetyGate(safe({ verdict: 'B', factsSource: 'none', templateEligible: false }), C).length === 0,
    'B（ArticleFacts なし）でも安全なら gate 通過（承諾前だから）',
  )
}

// ---------------------------------------------------------------------------
section('S2b: readiness（gate ではない）')
{
  ok(evaluateReadiness(safe({ factsSource: 'ready', primaryCategory: 'ART' })).readiness === 'ready', 'ready facts ＋ カテゴリー確定 → ready')
  ok(evaluateReadiness(safe({ factsSource: 'ready', primaryCategory: null })).readiness === 'needs-category', 'primaryCategory 未 → needs-category')
  const nf = evaluateReadiness(safe({ factsSource: 'none', templateType: 'sale', missingForTemplate: [] }))
  ok(nf.readiness === 'needs-facts', 'ArticleFacts なし → needs-facts')
  ok(nf.missing.some((m) => m.includes('ArticleFacts 未作成')), 'needs-facts に「ArticleFacts 未作成」')
}

// ---------------------------------------------------------------------------
section('S3: 15件（推奨10＋予備5）／同一情報源 ≤ 2／gate 落ちは対象外')
{
  const CATS = ['ART', 'FOOD', 'CAFE', 'SHOPPING', 'BEAUTY', 'MUSIC', 'PHOTO', 'GIFT', 'EVENT', 'WELLNESS', 'ARCHITECTURE', 'EXPERIENCE', 'WORKSHOP', 'HOTEL', 'FAMILY', 'NIGHT', 'RAINY_DAY', 'NIGHT_VIEW']
  uid = 200
  const good: ThemeCandidate[] = []
  for (let i = 0; i < 24; i++) {
    good.push(
      safe({
        primaryCategory: CATS[i % CATS.length],
        venue: STORE_VENUES[i % STORE_VENUES.length] + `（${i}）`, // 24 の distinct 施設
        sourceName: `情報源${i % 12}`, // 12 情報源 → 各2件（上限ちょうど）
        templateType: ['exhibition', 'sale', 'workshop', 'recurring_event'][i % 4],
        eventStartAt: iso(`2026-09-${String(4 + (i % 20)).padStart(2, '0')}`),
        eventEndAt: iso(`2026-09-${String(22 + (i % 6)).padStart(2, '0')}`),
      }),
    )
  }
  const bad = [safe({ verdict: 'C' }), safe({ expired: true }), safe({ templateType: 'unknown' })]
  const res = selectRecommendedThemes([...good, ...bad], { now: NOW })

  ok(res.rejected.length === 3, `gate 落ち 3件（実際: ${res.rejected.length}）`)
  ok(res.gatePassed === 24, `gate 通過 24件（実際: ${res.gatePassed}）`)
  ok(res.recommended.length === 10, `推奨 10件（実際: ${res.recommended.length}）`)
  ok(res.spare.length === 5, `予備 5件（実際: ${res.spare.length}）`)
  ok(res.shortfall === false, 'green 十分 → shortfall なし')
  const maxSrcRec = Math.max(...res.bias.sourceCounts.map((s) => s.count))
  ok(maxSrcRec <= 2, `推奨内の同一情報源は最大2件（実際 max: ${maxSrcRec}）`)
  const maxFacRec = Math.max(...res.bias.facilityCounts.map((f) => f.count))
  ok(maxFacRec <= 2, `推奨内の同一施設は最大2件（実際 max: ${maxFacRec}）`)
  ok(res.finalized === true, `偏りなし＋カテゴリー明記あり → finalized=true（実際: ${res.finalized} ／ ${res.notFinalizedReasons.join(';')}）`)
  ok(new Set(res.recommendedDcIds).size === 10, '推奨 DC id に重複なし')
  ok(!res.recommendedDcIds.some((id) => bad.map((b) => b.discoveredContentId).includes(id)), '推奨に gate 落ちが混ざらない')
  const res2 = selectRecommendedThemes([...good, ...bad], { now: NOW })
  ok(JSON.stringify(res.recommendedDcIds) === JSON.stringify(res2.recommendedDcIds), '2回実行で推奨が完全一致（決定的）')
}

// ---------------------------------------------------------------------------
section('S4: ランキング — 旬・鮮度が効く（施設・情報源は分散）')
{
  uid = 300
  const nowC = safe({ primaryCategory: 'ART', venue: '無名ギャラリーX', sourceName: 'S-A', eventStartAt: iso('2026-09-01'), eventEndAt: iso('2026-09-30') })
  const soonC = safe({ primaryCategory: 'FOOD', venue: '無名ギャラリーY', sourceName: 'S-B', eventStartAt: iso('2026-09-08'), eventEndAt: iso('2026-09-20') })
  const laterC = safe({ primaryCategory: 'CAFE', venue: '無名ギャラリーZ', sourceName: 'S-C', eventStartAt: iso('2026-10-15'), eventEndAt: iso('2026-10-30') })
  const res = selectRecommendedThemes([laterC, soonC, nowC], { now: NOW })
  ok(res.recommended.length === 3, `3件とも推奨（実際: ${res.recommended.length}）`)
  const order = res.recommended.map((e) => e.temporalTier)
  ok(order[0] === 'now', `1位が NOW（実際: ${order[0]}）`)
  ok(order[1] === 'soon', `2位が SOON（実際: ${order[1]}）`)
  ok(res.recommended[0].scores.freshness > res.recommended[2].scores.freshness, '旬スコアは NOW > LATER')
}

// ---------------------------------------------------------------------------
section('S5: 同一施設は原則1件／2件目は3条件＋理由（最大2件）')
{
  uid = 400
  const A = safe({ discoveredContentId: 401, primaryCategory: 'PHOTO', venue: '銀座 蔦屋書店', templateType: 'exhibition', uxType: 'exhibition_viewing', eventStartAt: iso('2026-09-01'), eventEndAt: iso('2026-09-10'), eventPeriod: '9/1〜9/10' })
  const B = safe({ discoveredContentId: 402, primaryCategory: 'PHOTO', venue: '銀座 蔦屋書店 別フロア', templateType: 'exhibition', uxType: 'exhibition_viewing', eventStartAt: iso('2026-09-01'), eventEndAt: iso('2026-09-10'), eventPeriod: '9/1〜9/10' })
  const Cc = safe({ discoveredContentId: 403, primaryCategory: 'PHOTO', venue: '銀座 蔦屋書店 WS室', templateType: 'workshop', uxType: 'participate_workshop', eventStartAt: iso('2026-09-20'), eventEndAt: iso('2026-09-25'), eventPeriod: '9/20〜9/25' })
  const other1 = safe({ discoveredContentId: 410, primaryCategory: 'ART', venue: '資生堂ギャラリー', sourceName: 'S1' })
  const other2 = safe({ discoveredContentId: 411, primaryCategory: 'FOOD', venue: '松屋銀座', sourceName: 'S2' })
  const res = selectRecommendedThemes([A, B, Cc, other1, other2], { now: NOW })
  const tsutayaRec = res.recommended.filter((e) => e.facilityBucket === 'ginza-tsutaya')
  ok(tsutayaRec.length === 2, `蔦屋は推奨内2件まで（B は推奨に入らない。実際: ${tsutayaRec.length}）`)
  const ids = tsutayaRec.map((e) => e.candidate.discoveredContentId).sort()
  ok(JSON.stringify(ids) === JSON.stringify([401, 403]), `推奨の蔦屋は 401 と 403（種別・期間・場面が異なる）実際: ${JSON.stringify(ids)}`)
  ok(res.candidates.filter((e) => e.facilityBucket === 'ginza-tsutaya').length <= 3, '推奨＋予備でも蔦屋は最大3件')
  const exc = res.recommended.find((e) => e.sameFacilityException)
  ok(!!exc && exc.candidate.discoveredContentId === 403, '推奨2件目 403 に理由が付く')
  ok(!!exc?.sameFacilityException?.includes('上限2件') && !!exc?.sameFacilityException?.includes('記事種別が異なる'), '理由に「上限2件」「編集的な差」が含まれる')
}

// ---------------------------------------------------------------------------
section('S6: 同一施設は推奨中最大2件（単純キャップ・3件目以降は採らない）')
{
  uid = 500
  const A = safe({ discoveredContentId: 501, primaryCategory: 'PHOTO', venue: '銀座 蔦屋書店', templateType: 'exhibition', uxType: 'exhibition_viewing', eventStartAt: iso('2026-09-01'), eventEndAt: iso('2026-09-10') })
  const C2 = safe({ discoveredContentId: 502, primaryCategory: 'ART', venue: '銀座 蔦屋書店 B', templateType: 'workshop', uxType: 'participate_workshop', eventStartAt: iso('2026-09-20'), eventEndAt: iso('2026-09-25') })
  const C3 = safe({ discoveredContentId: 503, primaryCategory: 'GIFT', venue: '銀座 蔦屋書店 C', templateType: 'sale', uxType: 'shopping_discovery', eventStartAt: iso('2026-10-01'), eventEndAt: iso('2026-10-10') })
  const alt = safe({ discoveredContentId: 510, primaryCategory: 'FOOD', venue: '資生堂ギャラリー', sourceName: 'S9', templateType: 'exhibition' })
  const res = selectRecommendedThemes([A, C2, C3, alt], { now: NOW })
  const tsutayaRec = res.recommended.filter((e) => e.facilityBucket === 'ginza-tsutaya')
  ok(tsutayaRec.length === 2, `蔦屋は推奨中2件まで（3件目 503 は入らない。実際: ${tsutayaRec.length}）`)
  ok(res.recommended.some((e) => e.candidate.discoveredContentId === 510), '別施設の候補が推奨に入る')
  ok(res.candidates.filter((e) => e.facilityBucket === 'ginza-tsutaya').length <= 3, '推奨＋予備でも蔦屋は最大3件')
}

// ---------------------------------------------------------------------------
section('S7: green<10 は無理に10件にしない（穴埋めしない・情報源は分散）')
{
  uid = 600
  const few = [
    safe({ primaryCategory: 'ART', venue: '無名ギャラリーA', sourceName: 'src-a' }),
    safe({ primaryCategory: 'FOOD', venue: '無名ギャラリーB', sourceName: 'src-b' }),
    safe({ primaryCategory: 'CAFE', venue: '無名ギャラリーC', sourceName: 'src-c' }),
  ]
  const res = selectRecommendedThemes(few, { now: NOW })
  ok(res.recommended.length === 3, `推奨は 3件のまま（水増ししない。実際: ${res.recommended.length}）`)
  ok(res.spare.length === 0, '予備は 0件')
  ok(res.shortfall === true && res.shortfallBy === 7, `shortfall=true / 不足7件（実際 by: ${res.shortfallBy}）`)
  ok(res.finalized === false && res.notFinalizedReasons.some((r) => r.includes('不足') && r.includes('穴埋め')), 'shortfall → finalized=false（穴埋めしない明記）')
}

// ---------------------------------------------------------------------------
section('S8: 同一情報源のハードキャップ — 推奨内 ≤ 2（20%）')
{
  uid = 700
  // 同一情報源から distinct 施設・カテゴリーの安全候補を 6 件
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 6; i++) {
    list.push(safe({
      primaryCategory: ['ART', 'FOOD', 'CAFE', 'PHOTO', 'MUSIC', 'GIFT'][i],
      venue: STORE_VENUES[i],
      sourceName: '同じ情報源',
      eventStartAt: iso(`2026-09-0${i + 1}`),
      eventEndAt: iso('2026-09-28'),
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const srcRec = res.bias.sourceCounts.find((s) => s.name === '同じ情報源')?.count ?? 0
  ok(srcRec <= 2, `推奨内の「同じ情報源」は最大2件（実際: ${srcRec}）`)
  ok(res.recommended.length <= 2, `他情報源が無ければ推奨は2件で止まる（実際: ${res.recommended.length}）`)
  ok(res.shortfall === true, 'shortfall=true（情報源キャップで不足・穴埋めしない）')
  ok(res.finalized === false, 'finalized=false')
  ok(res.broadenAxes.sources.some((x) => x.includes('同じ情報源')), 'broadenAxes.sources に「同じ情報源」')
}

// ---------------------------------------------------------------------------
section('S9: 同一施設のハードキャップ — 推奨内 ≤ 2（3件目以降は採らない）')
{
  uid = 800
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 5; i++) {
    list.push(safe({
      primaryCategory: ['PHOTO', 'ART', 'GIFT', 'FOOD', 'MUSIC'][i],
      venue: '銀座 蔦屋書店',
      sourceName: `src${i}`,
      templateType: ['exhibition', 'workshop', 'sale', 'recurring_event', 'exhibition'][i],
      uxType: ['exhibition_viewing', 'participate_workshop', 'shopping_discovery', 'attend_event', 'exhibition_viewing'][i],
      eventStartAt: iso(`2026-09-0${i + 1}`),
      eventEndAt: iso(`2026-09-${10 + i}`),
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const tsutayaRec = res.bias.facilityCounts.find((f) => f.key === 'ginza-tsutaya')?.count ?? 0
  ok(tsutayaRec <= 2, `蔦屋は推奨内で最大2件（3件目以降は採らない。実際: ${tsutayaRec}）`)
  ok(res.finalized === false, '施設キャップで不足 → finalized=false')
  ok(res.broadenAxes.facilities.some((x) => x.includes('蔦屋')), 'broadenAxes.facilities に蔦屋（別施設を増やす）')
}

// ---------------------------------------------------------------------------
section('S10: 予備は単一施設に偏らない（予備内 同一施設 ≤ 2）／推奨＋予備 同一施設 ≤ 3')
{
  uid = 900
  // GINZA SIX を大量に、他情報源を少しだけ
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 12; i++) {
    list.push(safe({
      primaryCategory: ['SHOPPING', 'BEAUTY', 'FOOD', 'ART'][i % 4],
      venue: '',
      sourceName: 'GINZA SIX',
      sourceUrl: `https://ginza6.tokyo/news/detail/shopnews/2242${i}`,
      title: `新作コレクション ${i} – GINZA SIX`,
      templateType: 'sale',
      factKind: 'product_news',
      eventStartAt: iso('2026-09-02'),
      eventEndAt: iso('2026-10-31'),
    }))
  }
  for (let i = 0; i < 6; i++) {
    list.push(safe({ primaryCategory: ['ART', 'FOOD', 'CAFE', 'PHOTO', 'MUSIC', 'GIFT'][i], venue: STORE_VENUES[i], sourceName: `他${i}` }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const g6rec = res.bias.facilityCounts.find((f) => f.key === 'ginza-six')?.count ?? 0
  const g6spare = res.bias.facilityCounts.find((f) => f.key === 'ginza-six')?.spare ?? 0
  ok(g6rec <= 2, `GINZA SIX は推奨内で最大2件（実際: ${g6rec}）`)
  ok(g6spare <= 2, `GINZA SIX は予備内でも最大2件（実際: ${g6spare}）`)
  ok(g6rec + g6spare <= 3, `GINZA SIX は推奨＋予備で最大3件（実際: ${g6rec + g6spare}）`)
  ok(res.spare.filter((e) => e.facilityBucket === 'ginza-six').length <= 2, '予備の GINZA SIX は最大2件（単一施設に偏らせない）')
}

// ---------------------------------------------------------------------------
section('S11: 会場不明のハードキャップ（推奨内 会場不明 ≤ 1）')
{
  uid = 1000
  // venue 空・集約サイト・施設特定不能 → 会場不明。6件
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 6; i++) {
    list.push(safe({
      primaryCategory: ['ART', 'FOOD', 'MUSIC', 'PHOTO', 'CAFE', 'GIFT'][i],
      venue: '',
      sourceName: '中央区観光関連',
      sourceUrl: `https://www.chuo-kanko.or.jp/blogs/event/26080${i}`,
      title: `第${i + 1}回 銀座◯◯フェスティバル`,
      templateType: 'recurring_event',
      eventStartAt: iso(`2026-09-1${i}`),
      eventEndAt: iso(`2026-09-2${i}`),
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const unknownRec = res.recommended.filter((e) => e.facilityKey == null).length
  ok(unknownRec <= 1, `会場不明は推奨内で最大1件（実際: ${unknownRec}）`)
  ok(res.finalized === false, '会場不明キャップで不足 → finalized=false')
  ok(res.notFinalizedReasons.some((r) => r.includes('不足') || r.includes('会場不明')), 'notFinalized に不足/会場不明')
}

// ---------------------------------------------------------------------------
section('S11b: 時期不明は推奨から完全除外（既定 unknownTemporalMaxInRec=0・2026-09-06根本改善）')
{
  uid = 1050
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 6; i++) {
    list.push(safe({
      primaryCategory: ['ART', 'FOOD', 'MUSIC', 'PHOTO', 'CAFE', 'GIFT'][i],
      venue: STORE_VENUES[i],
      sourceName: `src${i}`,
      title: `催し ${i}`,
      eventStartAt: null,
      eventEndAt: null,
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const unkT = res.recommended.filter((e) => e.temporalUnknown).length
  ok(unkT === 0, `時期不明（開催・販売期間が一切不明）は推奨に0件（実際: ${unkT}）`)
  ok(res.finalized === false, '時期不明のみ・穴埋めしない → finalized=false')

  // env で緩められることも確認（運用上の逃げ道は残す・既定は0）
  process.env.THEMES_UNKNOWN_TEMPORAL_MAX = '1'
  const loosened = selectRecommendedThemes(list, { now: NOW, config: loadSelectThemesConfigFromEnv() })
  const unkTLoosened = loosened.recommended.filter((e) => e.temporalUnknown).length
  ok(unkTLoosened <= 1, `THEMES_UNKNOWN_TEMPORAL_MAX=1 なら最大1件まで緩められる（実際: ${unkTLoosened}）`)
  delete process.env.THEMES_UNKNOWN_TEMPORAL_MAX
}

// ---------------------------------------------------------------------------
section('S11c: 同一カテゴリーのハードキャップ（推奨内 ≤ 3）＋ ≥6カテゴリーで finalized')
{
  uid = 1080
  const CATS = ['ART', 'ART', 'ART', 'ART', 'ART', 'FOOD', 'CAFE', 'MUSIC', 'PHOTO', 'BEAUTY', 'GIFT', 'SHOPPING', 'WORKSHOP', 'EVENT']
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 14; i++) {
    list.push(safe({
      primaryCategory: CATS[i],
      venue: STORE_VENUES[i % STORE_VENUES.length] + `（${i}）`,
      sourceName: `情報源${i % 8}`,
      templateType: ['exhibition', 'sale', 'workshop', 'recurring_event'][i % 4],
      eventStartAt: iso(`2026-09-0${(i % 9) + 1}`),
      eventEndAt: iso(`2026-09-2${i % 8}`),
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const artRec = res.recommended.filter((e) => e.categoryKey === 'ART').length
  ok(artRec <= 3, `ART は推奨内で最大3件（実際: ${artRec}）`)
  const kinds = new Set(res.recommended.map((e) => e.categoryKey)).size
  ok(kinds >= 6, `推奨のカテゴリー種類 ≥ 6（実際: ${kinds}）`)
  ok(res.recommended.length === 10, `推奨10件（実際: ${res.recommended.length}）`)
  ok(res.finalized === true, `偏りなし → finalized=true（実際: ${res.finalized} ／ ${res.notFinalizedReasons.join(';')}）`)
}

// ---------------------------------------------------------------------------
section('S12: 暫定カテゴリー — 明記から確定／全件未確定なら finalized=false')
{
  // タイトルの明記語からカテゴリー
  ok(deriveProvisionalCategory({ title: '山本浩二 写真展' }).category === 'PHOTO', '写真展 → PHOTO')
  ok(deriveProvisionalCategory({ title: 'アニメ天官賜福展 -天地流光-' }).category === 'ART', '◯◯展 → ART')
  // 2026-09-11：SWEETS を FOOD から分離。菓子・デザートは SWEETS を優先する（マロン指示）。
  ok(deriveProvisionalCategory({ title: '栗とはちみつのパウンドケーキ' }).category === 'SWEETS', 'パウンドケーキ → SWEETS（FOODから分離）')
  ok(deriveProvisionalCategory({ title: 'follow×JAPAN DENIM JEANS' }).category === 'SHOPPING', 'デニム/JEANS → SHOPPING')
  ok(deriveProvisionalCategory({ title: '第16回 銀座シャンソン＆音楽祭' }).category === 'MUSIC', 'シャンソン/音楽 → MUSIC')
  const noTok = deriveProvisionalCategory({ title: '銀座のなにか', templateType: 'exhibition' })
  ok(noTok.category === 'ART' && noTok.basis === 'templateType', '明記なし＋種別 exhibition → ART（basis=templateType）')
  ok(deriveProvisionalCategory({ title: '銀座のなにか' }).category === null, '明記も種別も無ければ null（推測しない）')

  uid = 1100
  // primaryCategory 未設定・タイトルも会場も無味・種別だけ → 全件「暫定:種別」＝明記確定 0件
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 6; i++) {
    list.push(safe({
      primaryCategory: null,
      title: `銀座の催し ${i}`,
      venue: `無名スペース${'ABCDEF'[i]}`,
      contentType: 'other',
      sourceName: `s${i % 3}`,
      factsSource: 'none',
      verdict: 'B',
      templateEligible: false,
      templateType: 'exhibition',
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  ok(res.provisionalCategories.resolvedCount === 0, `明記からカテゴリー確定 0件（実際: ${res.provisionalCategories.resolvedCount}）`)
  ok(res.finalized === false && res.notFinalizedReasons.some((r) => r.includes('カテゴリー')), '全件未確定（明記なし）→ finalized=false')
}

// ---------------------------------------------------------------------------
section('S13: バランス表 — カテゴリー / 旬 / 会場 / 情報源 / 種別')
{
  uid = 1200
  const list = [
    safe({ primaryCategory: 'ART', venue: '資生堂ギャラリー', sourceName: 'sA', templateType: 'exhibition' }),
    safe({ primaryCategory: 'ART', venue: '松屋銀座', sourceName: 'sB', templateType: 'exhibition' }),
    safe({ primaryCategory: 'ART', venue: 'ライカギャラリー銀座', sourceName: 'sC', templateType: 'exhibition' }),
    safe({ primaryCategory: 'FOOD', venue: 'ggg', sourceName: 'sD', templateType: 'sale' }),
    safe({ primaryCategory: null, title: '銀座のなにか', venue: '無名スペースE', contentType: 'other', sourceName: 'sE', templateType: 'generic', factsSource: 'draft', verdict: 'B', templateEligible: false, precheckDecision: '確認後可能', bAdditionalMinutes: 20 }),
  ]
  const res = selectRecommendedThemes(list, { now: NOW })
  const bal = buildSelectionBalance(res)
  ok(bal.categories.find((c) => c.key === 'ART')?.recommended === 3, 'ART が推奨3件')
  ok(bal.overRepresentedCategories.includes('ART'), 'ART が偏り（3件以上）として出る')
  ok(bal.categories.some((c) => c.key === '未確定' && c.recommended === 1), '未確定カテゴリーの行がある（明記も種別も無い）')
  ok(bal.templateTypes.some((t) => t.key === 'exhibition' && t.recommended === 3), '記事種別 exhibition 3件')
  ok(bal.temporal.length > 0, '旬（temporal）分散の行がある')
  ok(bal.facilities.length === 5, `会場5件を集計（実際: ${bal.facilities.length}）`)
  ok(bal.sources.length === 5, `情報源5件を集計（実際: ${bal.sources.length}）`)
  ok(typeof bal.categoryResolved.ratio === 'number', 'categoryResolved.ratio がある')
}

// ---------------------------------------------------------------------------
section('S14: enableTargetFitRanking 既定 false — targetFit / editorial / 履歴ペナルティを無視（回帰）')
{
  uid = 1400
  const plain = [
    safe({ primaryCategory: 'ART', venue: '松屋銀座', sourceName: 's1', templateType: 'exhibition' }),
    safe({ primaryCategory: 'FOOD', venue: 'ggg', sourceName: 's2', templateType: 'sale' }),
    safe({ primaryCategory: 'SHOPPING', venue: '銀座三越', sourceName: 's3', templateType: 'sale' }),
  ]
  // 同じ ID のまま targetFit 等だけ付けたコピー
  const withFields = plain.map((c, i) => ({
    ...c,
    targetFit: i === 2 ? 95 : 10,
    editorialScoreTotal: i === 2 ? 90 : 10,
    categoryHistoryPenalty: 0.2,
    venueHistoryPenalty: 0.2,
    sourceTypeKey: '百貨店',
  }))
  const a = selectRecommendedThemes(plain, { now: NOW }) // flag 未指定
  const b = selectRecommendedThemes(withFields, { now: NOW }) // flag 未指定
  const ids = (r: ReturnType<typeof selectRecommendedThemes>) => r.recommended.map((e) => e.candidate.discoveredContentId).join(',')
  ok(ids(a) === ids(b), `flag 未指定なら targetFit 等を付けても推奨の並びは不変（a=${ids(a)} / b=${ids(b)}）`)
  ok(b.recommended.every((e) => e.scores.targetFit === 0 && e.scores.editorial === 0 && e.scores.biasAdjust === 0), 'flag 未指定なら追加スコア寄与はすべて 0')
}

// ---------------------------------------------------------------------------
section('S15: enableTargetFitRanking true — 高 targetFit が同条件で優先／ART+CULTURE 合計を抑制')
{
  uid = 1500
  // 3件は施設・情報源・種別・カテゴリーがすべて別（分散の差は付かない）。targetFit だけ違う。
  const list = [
    safe({ primaryCategory: 'FOOD', venue: 'ggg', sourceName: 'sX', templateType: 'sale', targetFit: 20, editorialScoreTotal: 50, sourceTypeKey: 'A' }),
    safe({ primaryCategory: 'SHOPPING', venue: '松屋銀座', sourceName: 'sY', templateType: 'sale', targetFit: 90, editorialScoreTotal: 50, sourceTypeKey: 'B' }),
    safe({ primaryCategory: 'MUSIC', venue: '銀座三越', sourceName: 'sZ', templateType: 'recurring_event', targetFit: 55, editorialScoreTotal: 50, sourceTypeKey: 'C' }),
  ]
  const res = selectRecommendedThemes(list, { now: NOW, enableTargetFitRanking: true })
  ok(res.recommended[0].candidate.discoveredContentId === list[1].discoveredContentId, `高 targetFit(90) が先頭（実際: #${res.recommended[0].candidate.discoveredContentId}）`)
  ok(res.recommended[0].scores.targetFit > 0.1, `scores.targetFit が加算されている（${res.recommended[0].scores.targetFit}）`)

  uid = 1550
  // ART / CULTURE を大量に、他カテゴリーを少しだけ。旬度は全件同じ。
  const many = [
    ...Array.from({ length: 6 }, (_, i) =>
      safe({ primaryCategory: i % 2 === 0 ? 'ART' : 'CULTURE', venue: STORE_VENUES[i], sourceName: `a${i}`, templateType: 'exhibition', targetFit: 40, sourceTypeKey: `t${i}` }),
    ),
    safe({ primaryCategory: 'FOOD', venue: 'ggg', sourceName: 'f1', templateType: 'sale', targetFit: 60, sourceTypeKey: 'tf' }),
    safe({ primaryCategory: 'WELLNESS', venue: '和光本館', sourceName: 'w1', templateType: 'sale', targetFit: 60, sourceTypeKey: 'tw' }),
    safe({ primaryCategory: 'SHOPPING', venue: 'GINZA PLACE', sourceName: 's1', templateType: 'sale', targetFit: 60, sourceTypeKey: 'ts' }),
    safe({ primaryCategory: 'MUSIC', venue: '銀座三越', sourceName: 'm1', templateType: 'recurring_event', targetFit: 60, sourceTypeKey: 'tm' }),
  ]
  const r2 = selectRecommendedThemes(many, { now: NOW, enableTargetFitRanking: true })
  const artCultureRec = r2.recommended.filter((e) => e.categoryKey === 'ART' || e.categoryKey === 'CULTURE').length
  ok(artCultureRec <= 4, `ART+CULTURE 合計が抑制される（実際 ${artCultureRec} 件・非ART/CULTUREを優先採用）`)
}

// ---------------------------------------------------------------------------
section('S16: 会期の抽出信頼度が high 未満（body_label等）の候補は推奨から除外（既定0件・2026-09-06根本改善）')
{
  uid = 1600
  // 6件とも eventStartAt/EndAt はあるが、confidence='medium'（body_label由来の想定）
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 6; i++) {
    list.push(safe({
      primaryCategory: ['ART', 'FOOD', 'MUSIC', 'PHOTO', 'CAFE', 'GIFT'][i],
      venue: STORE_VENUES[i],
      sourceName: `srcLC${i}`,
      title: `要確認会期の候補 ${i}`,
      eventStartAt: iso(`2026-09-1${i}`),
      eventEndAt: iso(`2026-09-2${i}`),
      eventDateConfidence: 'medium',
    }))
  }
  const res = selectRecommendedThemes(list, { now: NOW })
  const lowConfRec = res.recommended.filter((e) => e.temporalLowConfidence).length
  ok(lowConfRec === 0, `会期信頼度medium（body_label相当）は推奨に0件（実際: ${lowConfRec}）`)
  ok(res.finalized === false, '要確認のみ・穴埋めしない → finalized=false')
  ok(
    res.broadenAxes.temporal.some((t) => t.includes('要確認')),
    'broadenAxes.temporal に「会期の抽出信頼度が要確認」の言及がある',
  )

  // high confidence なら通常どおり推奨に入る（回帰確認）
  const highList = list.map((c) => ({ ...c, eventDateConfidence: 'high' as const }))
  const resHigh = selectRecommendedThemes(highList, { now: NOW })
  ok(resHigh.recommended.length === 6, `confidence=high なら通常どおり推奨に入る（実際: ${resHigh.recommended.length}）`)

  // env で緩められることも確認（既定は0）
  process.env.THEMES_LOW_CONFIDENCE_TEMPORAL_MAX = '1'
  const loosened = selectRecommendedThemes(list, { now: NOW, config: loadSelectThemesConfigFromEnv() })
  const lowConfLoosened = loosened.recommended.filter((e) => e.temporalLowConfidence).length
  ok(lowConfLoosened <= 1, `THEMES_LOW_CONFIDENCE_TEMPORAL_MAX=1 なら最大1件まで緩められる（実際: ${lowConfLoosened}）`)
  delete process.env.THEMES_LOW_CONFIDENCE_TEMPORAL_MAX
}

// ---------------------------------------------------------------------------
section('S17: 収集カバレッジ（2026-09-11）— 公式情報未確認は最終候補に上げない／不足カテゴリー加点')
{
  uid = 1700
  // 6件中2件は公式情報が未確認（finalEligible=false）
  const list: ThemeCandidate[] = []
  for (let i = 0; i < 6; i++) {
    list.push(
      safe({
        primaryCategory: ['ART', 'FOOD', 'MUSIC', 'PHOTO', 'CAFE', 'GIFT'][i],
        venue: STORE_VENUES[i],
        sourceName: `srcCOV${i}`,
        title: `カバレッジ候補 ${i}`,
        finalEligible: i < 4, // #4,#5 は false
        officialMissing: i < 4 ? [] : ['開催・販売期間', '内容'],
        coverageAdjust: i === 0 ? 0.3 : 0, // #0 に不足カテゴリー加点相当
      }),
    )
  }
  // flag OFF（既定）＝ finalEligible / coverageAdjust を一切見ない（回帰）
  const off = selectRecommendedThemes(list, { now: NOW })
  ok(off.recommended.length === 6, `flag 未指定なら公式未確認でも従来どおり全件推奨（実際: ${off.recommended.length}）`)

  // flag ON ＝ finalEligible=false の2件は推奨・予備どちらにも出さず rejected へ
  const on = selectRecommendedThemes(list, { now: NOW, enableTargetFitRanking: true })
  const inFinal = [...on.recommended, ...on.spare].map((e) => e.candidate.discoveredContentId)
  ok(inFinal.length === 4, `公式情報4項目そろう4件だけが最終候補（実際: ${inFinal.length}）`)
  ok(
    on.rejected.some((r) => r.gateFails.includes('official_incomplete')),
    'finalEligible=false は official_incomplete で除外される',
  )

  // coverageAdjust が biasAdjust に合流している（#0 が加点で先頭寄り）
  const top = on.recommended[0]
  ok(top.scores.biasAdjust > 0.2, `coverageAdjust(+0.3) が biasAdjust に合流（実際: ${top.scores.biasAdjust.toFixed(2)}）`)

  // env で緩められる（THEMES_REQUIRE_OFFICIAL_COMPLETE=0）
  process.env.THEMES_REQUIRE_OFFICIAL_COMPLETE = '0'
  const loos = selectRecommendedThemes(list, { now: NOW, enableTargetFitRanking: true, config: loadSelectThemesConfigFromEnv() })
  ok(
    [...loos.recommended, ...loos.spare].length === 6,
    `THEMES_REQUIRE_OFFICIAL_COMPLETE=0 なら公式未確認も最終候補に含める（実際: ${[...loos.recommended, ...loos.spare].length}）`,
  )
  delete process.env.THEMES_REQUIRE_OFFICIAL_COMPLETE
}

console.log(`\n=== 結果: ${fail === 0 ? 'PASS ✅（全チェック合格）' : `FAIL ❌（${fail} 件）`} ===`)
process.exit(fail === 0 ? 0 : 1)
