// GINZA WHISKERS / Project 02（2026-09-18、マロン指示：V1 Stage 5 → 既存Chrome拡張
// 転記経路への最小限の自動ブリッジ）。
//
// note-drafts.json（Stage 5・morningDraftSelected.ts が生成、AI/DB/外部fetchなしの
// 決定的テンプレート生成）の各 draft から、既存Chrome拡張が読み取れる
// Articles(reviewStatus:'draft') レコードを自動作成する。
//
//   ・対象は呼び出し元が渡した drafts のみ（このファイル自体は日付・件数を
//     限定しない——「2026-09-18の3件だけ」という運用上の限定は呼び出し元
//     （morningBridgeArticles.ts）が note-drafts.json の中身をそのまま渡すことで
//     自然に満たされる）。
//   ・二重生成防止（idempotency）：editorialProvenance.discoveredContentSource の
//     逆引き ＋ aiGeneratedBy が `bridge:note-drafts:dc#` で始まる既存 Article が
//     あれば再作成しない（createDraftFromProductSweetsTemplate.ts と同じ設計。
//     他経路で同じDCから作られたArticleはブロック要因にしない）。
//   ・Claude API・他の生成AI は一切呼ばない（このファイルは fetch も
//     anthropic 系 import も持たない。note-drafts.json は既に決定的生成済み）。
//   ・pillars は既存の CONTENT_TYPE_TO_PILLAR_NAME を再利用する（新規タクソノミー
//     を作らない）。
//   ・本文は既存 blocksToLexicalState をそのまま使う（Lexical構築を独自実装しない）。
//   ・カテゴリー正確性：deriveProvisionalCategory の ART 判定規則
//     （【フェア】等の全角角括弧タグを文字列中どこでも検出する）が、タイトルに
//     混入した内部ラベルによって誤判定を起こすため、Article.title / slug の
//     構成時だけ角括弧タグを除去する（note-drafts.json・ArticleFacts.primaryCategory・
//     selection.json 自体は変更しない・deriveProvisionalCategory 本体も変更しない）。
//   ・既存Chrome拡張の転記経路（.devlogs/night/queue/<date>/<articleId>/note-draft.json
//     ＋ _index.json）への受け渡しは、既存の buildNoteDraftPackage / writePackage /
//     upsertQueueIndex（nightBuild.ts から export、挙動無変更）をそのまま再利用する
//     ——キュー書き出しロジックを再実装しない。
//   ・reviewStatus は必ず 'draft'。このモジュールは reviewStatus を 'approved' へ
//     昇格させない（既存の人間承認ゲートを維持——マロンがCMS管理画面で承認した
//     時点で初めて既存の note-transfer サーバーが /pending へ含める設計を変更しない）。
//   ・note への公開・自動投稿は一切行わない。

import type { Payload } from 'payload'

import { blocksToLexicalState } from '../ai/lexical'
import { slugify } from '../ai/slugify'
import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import { buildNoteDraftPackage } from '../night/buildNoteDraftPackage'
import { writePackage, upsertQueueIndex } from '../night/queueWriter'
import type { EditorialProvenanceEntry } from '../ai/generateArticleDraft'
import type { PreparedNoteDraft } from './noteDraftFromSelection'

export interface BridgeArticleResult {
  discoveredContentId: number
  status: 'created' | 'already_drafted' | 'would_create' | 'skipped'
  dryRun: boolean
  reason?: string
  missing?: string[]
  articleId?: number | null
  title?: string
  slug?: string
  pillar?: string
  category: string | null
  package?: {
    status: string
    blockers: { code: string; message: string }[]
    warnings: { code: string; message: string }[]
    dir: string | null
  }
}

function clip(s: string, max: number): string {
  const arr = [...s]
  return arr.length <= max ? s : arr.slice(0, max - 1).join('') + '…'
}

/** 全角角括弧タグ（例：【フェア】）を文字列中どこにあっても除去する。
 * deriveProvisionalCategory の ART 判定規則がこのタグを文字列中のどこでも
 * 検出してしまうため（例：DC#1171「秋の銀座の話題——「【フェア】Sutta POP UP
 * STORE」」がARTに誤判定される。slugify.ts の stripBracketTags は先頭・末尾
 * のみ対応で今回のケース〈文中〉には効かない）、Article の title / slug
 * 構成時にだけ適用する。 */
function stripInternalBracketTag(s: string): string {
  return s.replace(/【[^】]*】/g, '').replace(/\s{2,}/g, ' ').trim()
}

export async function bridgeNoteDraftsToArticles(
  payload: Payload,
  date: string,
  drafts: PreparedNoteDraft[],
  options: { dryRun?: boolean; skipQueue?: boolean } = {},
): Promise<BridgeArticleResult[]> {
  const dryRun = options.dryRun !== false
  const results: BridgeArticleResult[] = []

  for (const draft of drafts) {
    const dcId = draft.discoveredContentId

    // --- idempotency：このブリッジ自身が過去に作った Article があれば再作成しない ---
    const dupRes = await payload.find({
      collection: 'articles',
      depth: 0,
      limit: 10,
      overrideAccess: true,
      where: { 'editorialProvenance.discoveredContentSource': { equals: Number(dcId) } },
    })
    const existingDoc = (dupRes.docs as { id: number | string; aiGeneratedBy?: string | null }[]).find((d) =>
      String(d.aiGeneratedBy ?? '').startsWith('bridge:note-drafts:dc#'),
    )

    let articleId: number | null = existingDoc ? Number(existingDoc.id) : null
    let baseResult: BridgeArticleResult

    if (existingDoc) {
      baseResult = {
        discoveredContentId: dcId,
        status: 'already_drafted',
        dryRun,
        articleId,
        category: draft.category,
      }
    } else {
      // pillars は必須（Articles.ts minRows:1）。DC.contentType → 既存の共有
      // マッピング表（CONTENT_TYPE_TO_PILLAR_NAME）を再利用する。
      const dcRaw = (await payload.findByID({
        collection: 'discovered-content',
        id: dcId,
        depth: 0,
        overrideAccess: true,
      }).catch(() => null)) as unknown as Record<string, unknown> | null
      const contentType = dcRaw ? String(dcRaw.contentType ?? '') : ''
      const pillarName = CONTENT_TYPE_TO_PILLAR_NAME[contentType] ?? 'イベント'
      const pillarRes = await payload.find({
        collection: 'tags',
        limit: 1,
        overrideAccess: true,
        where: { and: [{ type: { equals: 'pillar' } }, { name: { equals: pillarName } }] },
      })
      const pillarDoc = pillarRes.docs[0] as { id: number | string } | undefined

      if (!pillarDoc) {
        results.push({
          discoveredContentId: dcId,
          status: 'skipped',
          dryRun,
          reason: 'pillar_tag_missing',
          missing: [`pillar Tag「${pillarName}」が存在しない`],
          category: draft.category,
        })
        continue
      }

      const articleTitle = stripInternalBracketTag(draft.title)
      const slug = slugify(articleTitle) || articleTitle
      const aiGeneratedBy = `bridge:note-drafts:dc#${dcId}`
      const leadLine = draft.blocks.find((b) => b.type === 'paragraph')?.text ?? ''
      const tagLine = draft.hashtags.join(' ')
      const seo = { metaTitle: clip(articleTitle, 60), metaDescription: clip(leadLine, 120) }
      const socialCopy = {
        note: clip(leadLine, 140) + (tagLine ? `\n${tagLine}` : ''),
        x: clip(articleTitle, 120) + (draft.hashtags.length ? ` ${draft.hashtags.slice(0, 2).join(' ')}` : ''),
        instagram: clip(leadLine, 120),
      }
      const editorialProvenance = (draft.provenance as EditorialProvenanceEntry[]).map((e) => ({
        discoveredContentSource: Number(e.discoveredContentId),
        sourceName: e.sourceName,
        sourceUrl: e.sourceUrl,
        verifiedAt: e.verifiedAt ?? null,
        fact: e.fact,
        sourceType: e.sourceType,
        factType: e.factType,
        verificationStatus: e.verificationStatus,
      }))

      if (dryRun) {
        results.push({
          discoveredContentId: dcId,
          status: 'would_create',
          dryRun: true,
          title: articleTitle,
          slug,
          pillar: pillarName,
          category: draft.category,
        })
        continue
      }

      const article = await payload.create({
        collection: 'articles',
        locale: 'ja',
        overrideAccess: true,
        data: {
          reviewStatus: 'draft', // ハードコード。このモジュールは承認・公開を一切行わない
          title: articleTitle,
          slug,
          body: blocksToLexicalState(draft.blocks),
          pillars: [Number(pillarDoc.id)],
          seo,
          socialCopy,
          callToAction: draft.callToAction ?? null,
          editorialProvenance,
          aiGeneratedBy,
        },
      })
      articleId = Number((article as { id: number | string }).id)
      baseResult = {
        discoveredContentId: dcId,
        status: 'created',
        dryRun: false,
        articleId,
        title: articleTitle,
        slug,
        pillar: pillarName,
        category: draft.category,
      }
    }

    // --- 既存Chrome拡張の転記経路へ渡す：キュー書き出しは既存関数をそのまま再利用 ---
    if (!dryRun && articleId != null && !options.skipQueue) {
      try {
        const pkg = await buildNoteDraftPackage(payload, articleId)
        const dir = writePackage(date, pkg)
        upsertQueueIndex(
          date,
          `bridge_${new Date().toISOString()}`,
          [pkg],
          { [pkg.articleId]: dir },
          [],
          { [pkg.articleId]: 'draft' },
        )
        baseResult.package = {
          status: pkg.status,
          blockers: pkg.validation.blockers,
          warnings: pkg.validation.warnings,
          dir,
        }
      } catch (err) {
        baseResult.package = {
          status: 'error',
          blockers: [{ code: 'packageError', message: err instanceof Error ? err.message : String(err) }],
          warnings: [],
          dir: null,
        }
      }
    }

    results.push(baseResult)
  }

  return results
}
