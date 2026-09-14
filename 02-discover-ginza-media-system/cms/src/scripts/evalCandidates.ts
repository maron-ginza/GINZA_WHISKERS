import { getPayload } from 'payload'

import config from '../payload.config'
import { classifyFactKind } from '../lib/morning/classifyFactKind'
import { classifyTemplateType } from '../lib/morning/classifyTemplateType'
import { extractArticleFactsCandidate } from '../lib/morning/extractArticleFactsCandidate'
import { fetchOfficialSignals } from '../lib/morning/fetchOfficialSignals'
import { buildTemplatePrecheck } from '../lib/morning/templatePrecheck'
import type { OfficialPageSignals } from '../lib/morning/types'
import type { DiscoveredContentLike } from '../lib/template/mapDiscoveredContentToEventFields'

// 読み取り専用の候補評価（2026-09-03・第二投稿 候補選定）。
//   node --env-file=.env --import=tsx/esm src/scripts/evalCandidates.ts 390 344 98 331 349
// DB 書き込み・ready 化・note/X・記事生成なし。公式ページの公開 GET のみ（0円）。

async function main() {
  const ids = process.argv.slice(2).map(Number).filter(Number.isInteger)
  const payload = await getPayload({ config })

  for (const id of ids) {
    const dc = (await payload.findByID({
      collection: 'discovered-content',
      id,
      depth: 1,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    const ss = dc.sourceSite as { name?: string | null } | null
    const dcLike: DiscoveredContentLike = {
      id,
      title: (dc.title as string | null) ?? null,
      excerpt: (dc.excerpt as string | null) ?? null,
      articleUrl: (dc.articleUrl as string | null) ?? null,
      sourceSiteName: ss?.name ?? null,
      publishedAt: (dc.publishedAt as string | null) ?? null,
      eventStartAt: (dc.eventStartAt as string | null) ?? null,
      eventEndAt: (dc.eventEndAt as string | null) ?? null,
      venue: (dc.venue as string | null) ?? null,
      contentType: (dc.contentType as string | null) ?? null,
      uxType: (dc.uxType as string | null) ?? null,
      lastCheckedAt: (dc.lastCheckedAt as string | null) ?? null,
      detectedAt: (dc.detectedAt as string | null) ?? null,
      dateExtraction: (dc.dateExtraction as DiscoveredContentLike['dateExtraction']) ?? null,
    }
    const host = (() => {
      try { return new URL(dcLike.articleUrl ?? '').hostname.replace(/^www\./, '') } catch { return '' }
    })()
    let signals: OfficialPageSignals | null = null
    try {
      signals = await fetchOfficialSignals(dcLike.articleUrl ?? '', { allowedHosts: [host] })
    } catch (e) {
      signals = { requested: true, ok: false, fetchedAt: new Date().toISOString(), error: String(e) }
    }
    const now = new Date()
    const factKind = classifyFactKind({
      contentType: dcLike.contentType, uxType: dcLike.uxType, title: dcLike.title, excerpt: dcLike.excerpt, officialSignals: signals,
    }).factKind
    const tt = classifyTemplateType({ factKind, contentType: dcLike.contentType, uxType: dcLike.uxType, title: dcLike.title, excerpt: dcLike.excerpt })
    const ext = extractArticleFactsCandidate({
      dc: dcLike,
      image: { available: false, assetPath: null, policy: '画像なし', season: null } as never,
      officialSignals: signals,
      trustedSource: true,
    })
    const eef = ext.extractedEventFacts
    const tp = buildTemplatePrecheck({
      dc: dcLike, facts: undefined, factsSource: 'none', templateType: tt, extraction: ext, verdict: 'B' as const, now,
    })
    const conf = (k: keyof typeof eef) => {
      const f = eef[k] as { value: unknown; confirmationStatus: string }
      return f.confirmationStatus === 'confirmed' && f.value != null ? String(f.value) : null
    }

    console.log('\n════════ DC #' + id + ' ════════')
    console.log('title      :', dcLike.title)
    console.log('url        :', dcLike.articleUrl, ' fetch ok=' + signals?.ok + ' status=' + signals?.httpStatus)
    console.log('curation   :', dc.curationStatus, ' contentType=' + dcLike.contentType + ' uxType=' + dcLike.uxType)
    console.log('DC 会期     :', dcLike.eventStartAt, '〜', dcLike.eventEndAt)
    console.log('factKind   :', factKind, ' templateType=' + tt.templateType + '(' + tt.confidence + ')')
    console.log('  種別根拠 :', tt.reasons.join(' / '))
    console.log('── 自動抽出（confirmed のみ）──')
    console.log('  eventName :', conf('eventName'))
    console.log('  会期(表示):', conf('eventDate'), ' / ISO=' + conf('eventDateISO'))
    console.log('  開催時間  :', conf('eventTime'))
    console.log('  会場      :', conf('venuePlace'))
    console.log('  入場料    :', conf('paid'))
    console.log('  概要      :', conf('whatHappens')?.slice(0, 90))
    console.log('  注意事項  :', conf('officialInfoNote'))
    console.log('  targetNameFoundInBody:', eef.targetNameFoundInBody, ' adapter=' + eef.adapter)
    console.log('  conflicts :', JSON.stringify(ext.conflicts))
    console.log('── precheck ──')
    console.log('  自動入力可 :', tp.autoFillFields.join('・') || '（なし）')
    console.log('  人間確認   :', tp.humanInputFields.join('・'))
    console.log('  タグ候補   :', tp.hashtagCandidates.join(' '))
    console.log('  templateEligible 見込み:', tp.templateEligible, ' 判定=' + tp.decision + '/' + tp.recommendation)
    console.log('  判定理由   :', tp.decisionReason)
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
