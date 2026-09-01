import type { Payload } from 'payload'

import { CONTENT_TYPE_TO_PILLAR_NAME } from '../curation/contentTypeToPillar'
import { computeEventTiming } from '../curation/eventTiming'
import {
  generateMultiAngleArticleDrafts,
  type MultiAngleKey,
  type ArticleVolume,
} from './generateMultiAngleArticleDrafts'
import { findRelatedArticles } from './relatedArticles'
import { slugify } from './slugify'

// Project 02-1「核情報→最大5記事」拡張（2026-08-27）。
//
// 1件のDiscoveredContent（Maron Editor's Choiceでcurationstatus:approved
// 済み＝核となる旬の銀座情報）-> 最大5件のArticle(reviewStatus: draft)への
// 変換オーケストレーション。
//
// 既存のcreateDraftFromSource.ts（Source単体）・
// createWeeklyDraftFromDiscoveredContent.ts（複数DiscoveredContent→1記事）
// とは独立した第3の並行エントリーポイントとして追加した——既存2系統・
// Sources/DiscoveredContent/Articlesのスキーマ・フックは一切変更していない。
//
// 生成された下書きはすべてreviewStatus: draftで作成され、編集長レビュー
// （review以降）を経ないと公開されない（既存フローと同じ人間承認ゲート、
// Articles.tsのbeforeChangeフックは無変更のためそのまま機能する）。
const MULTI_ANGLE_AI_GENERATED_BY_PREFIX = 'claude-sonnet-5 (multi-angle'

export interface CreatedMultiAngleArticle {
  id: number
  title: string
  angle: MultiAngleKey
  volume: ArticleVolume
  /** Project 02-2 収益化② Tier 1：この角度の post-gate WARNING コード（あれば） */
  warnings?: string[]
}

export interface CreateMultiAngleDraftsResult {
  discoveredContentId: string | number
  createdArticles: CreatedMultiAngleArticle[]
  skipped: { angle: MultiAngleKey; reason: string }[]
  /** Project 02-2 収益化② Tier 1：角度別の post-gate WARNING 詳細（ログ用） */
  warnings: {
    angle: MultiAngleKey
    codes: string[]
    details: Record<string, string>
    socialCopyChanged: string[]
  }[]
}

export interface CreateMultiAngleDraftsOptions {
  /**
   * 生成・保存する角度を絞る（既定は5角度すべて）。日次オーケストレーション
   * （createDailyDraftsFromApproved.ts）が「1トピック=1本（CORE のみ）」で
   * 呼ぶために追加。AI ツールスキーマは変更せず、生成対象角度をプロンプトと
   * 保存ループの両方で絞るだけ。
   */
  angles?: MultiAngleKey[]
  /**
   * Project 02-2 収益化②（2026-08-28）：Phase A 由来の読者関心テーマ。
   * generateMultiAngleArticleDrafts へそのまま渡す（user メッセージへ注入）。
   * 指定時は aiGeneratedBy に `|interestTheme=<正規化テーマ>` を付けて
   * トレーサビリティと冪等判定に使えるようにする。
   */
  readerInterestTheme?: string
  /** aiGeneratedBy 用に事前正規化したテーマキー（呼び出し元が normalizeThemeKey 済みで渡す） */
  interestThemeKey?: string
  /**
   * Project 02-2 収益化② Tier 1（2026-08-30）：この角度が included に無ければ
   * 何も生成しない（補助稿も抑止）。主稿（ginza_whiskers）が品質基準を満たさなかった
   * DC からは interest 補助稿も作らない、という運用のためのガード。
   */
  requirePrimaryAngle?: MultiAngleKey
  /**
   * 指定時、生成後に interestArticlePostGate（4品質ゲートの本判定）＋ Social Copy 正規化＋
   * socialCopyGate（媒体別 WARNING、Tier S2）を実行し、WARNING を aiGeneratedBy の
   * `|warnings=` と結果へ載せる（9月Trial は WARNING のみ）。未指定なら従来どおり。
   */
  enableInterestPostGate?: {
    restateSim: number
    edNoteMinChars: number
    socialCopyCaps?: { note: number; x: number; instagram: number }
    socialCopyDupSim?: number
    socialCopyBoilerplate?: string[]
  }
  /**
   * 再発防止 #1/#2/#4（2026-09-01 Trial）：draft-today の CORE 経路向けの決定的ガードを
   * 有効化する。DC の eventStartAt/eventEndAt から computeEventTiming を算出し、
   * DC の title/excerpt/venue を裏付けテキストとして generateMultiAngleArticleDrafts へ
   * 渡す。WARNING は aiGeneratedBy の `|warnings=` へ載る（既定は WARNING のみ・非 block）。
   * 未指定なら従来どおり（no-op）。
   */
  enableCoreGuards?: boolean
}

export async function createMultiAngleDraftsFromDiscoveredContent(
  payload: Payload,
  discoveredContentId: string | number,
  options: CreateMultiAngleDraftsOptions = {},
): Promise<CreateMultiAngleDraftsResult> {
  const doc = await payload.findByID({
    collection: 'discovered-content',
    id: discoveredContentId,
    depth: 1,
  })

  // 要件（マロン指示）：核情報はMaron Editor's Choiceで承認済みのものに限定する
  // （createWeeklyDraftFromDiscoveredContent.tsのcurationStatusガードと同じ考え方）。
  if (doc.curationStatus !== 'approved') {
    throw new Error(
      `curationStatusが"approved"ではありません（現在: ${doc.curationStatus}）。` +
        "Maron Editor's Choiceで承認済みの候補のみを核情報として使用してください。",
    )
  }

  const sourceSite = doc.sourceSite
  const sourceName =
    typeof sourceSite === 'object' && sourceSite !== null ? sourceSite.name : String(sourceSite)

  const period =
    doc.eventStartAt && doc.eventEndAt
      ? `${doc.eventStartAt}〜${doc.eventEndAt}`
      : (doc.eventStartAt ?? undefined)

  // pillar解決：createWeeklyDraftFromDiscoveredContent.tsと同じcontentType対応表を再利用する
  const pillarName = CONTENT_TYPE_TO_PILLAR_NAME[doc.contentType] ?? '文化'
  const { docs: pillarDocs } = await payload.find({
    collection: 'tags',
    where: {
      and: [{ type: { equals: 'pillar' } }, { name: { equals: pillarName } }],
    },
    limit: 1,
  })
  const pillarDoc = pillarDocs[0]
  if (!pillarDoc) {
    throw new Error(
      `収蔵室（pillar）"${pillarName}"に対応する既存Tagが見つかりません。既存のpillar Tagを作成してください。`,
    )
  }
  const pillarIds = [Number(pillarDoc.id)]

  // 回遊導線（2026-08-26追加の既存関数を再利用）：同じ収蔵室を持つ公開済み記事をDBから機械的に拾う
  const related = await findRelatedArticles(payload, pillarIds)

  const { included, skipped, warnings } = await generateMultiAngleArticleDrafts({
    sourceText: [doc.title, doc.excerpt].filter(Boolean).join('\n'),
    sourceName,
    sourceUrl: doc.articleUrl,
    venue: doc.venue ?? undefined,
    period: period ?? undefined,
    // Human Editor Review P0-1の原則（週次フローと同じ）：システムが実際に
    // 確認した日時のみを使う。AIには生成させない。
    verifiedAt: doc.lastCheckedAt ?? doc.detectedAt ?? undefined,
    pillars: [pillarDoc.name],
    relatedArticles: related.map((r) => ({ title: r.title })),
    discoveredContentId,
    angles: options.angles,
    readerInterestTheme: options.readerInterestTheme,
    postGate: options.enableInterestPostGate
      ? {
          restateSim: options.enableInterestPostGate.restateSim,
          edNoteMinChars: options.enableInterestPostGate.edNoteMinChars,
          dcContext: {
            venue: doc.venue ?? null,
            excerpt: doc.excerpt ?? null,
            title: doc.title ?? null,
            contentType: doc.contentType ?? null,
          },
          socialCopyCaps: options.enableInterestPostGate.socialCopyCaps,
          socialCopyDupSim: options.enableInterestPostGate.socialCopyDupSim,
          socialCopyBoilerplate: options.enableInterestPostGate.socialCopyBoilerplate,
        }
      : undefined,
    coreGuards: options.enableCoreGuards
      ? {
          // 日付が揃わない場合は computeEventTiming が phase:'unknown' を返し、
          // eventTimingClaimGate は相対表現を timingClaimUnverifiable として扱う（計算しない）。
          eventTiming: computeEventTiming(doc.eventStartAt, doc.eventEndAt, new Date()),
          backingTexts: [doc.title, doc.excerpt, doc.venue].filter(
            (s): s is string => typeof s === 'string' && s.length > 0,
          ),
        }
      : undefined,
  })

  // 収益化② Tier 1：主稿（primary angle）が included に無ければ、この DC からは
  // 補助稿も含め一切生成しない。
  if (options.requirePrimaryAngle && !included.some((i) => i.angle === options.requirePrimaryAngle)) {
    return {
      discoveredContentId,
      createdArticles: [],
      skipped: [
        ...skipped,
        {
          angle: options.requirePrimaryAngle,
          reason:
            '主稿（primary angle）が品質基準を満たさなかったため、この DiscoveredContent からは生成しない（補助稿も抑止）',
        },
      ],
      warnings,
    }
  }

  // 収益化②：interest / ginza_whiskers がどちらも include:false（＝Phase Cの
  // 「銀座に接続しない」最終判定）だった場合、下の included.length===0 ガードで
  // まとめて弾かれる。skipped にその理由が入る。
  const interestSuffix = options.interestThemeKey
    ? `|interestTheme=${options.interestThemeKey}`
    : ''

  if (included.length === 0) {
    throw new Error(
      '全5角度が品質基準を満たさず記事候補を生成できませんでした（詳細: ' +
        skipped.map((s) => `${s.angle}=${s.reason}`).join(' / ') +
        '）',
    )
  }

  const warningsByAngle = new Map(warnings.map((w) => [w.angle, w.codes]))

  const createdArticles: CreatedMultiAngleArticle[] = []
  for (const { angle, volume, draft } of included) {
    const angleWarnings = warningsByAngle.get(angle) ?? []
    const warnSuffix = angleWarnings.length > 0 ? `|warnings=${angleWarnings.join(',')}` : ''
    const article = await payload.create({
      collection: 'articles',
      locale: 'ja',
      data: {
        reviewStatus: 'draft',
        title: draft.title,
        // 再発防止 #3（2026-09-01 Trial）：slug 生成前に文字参照デコード・施設
        // ボイラープレート除去・角括弧タグ除去・URL 危険文字除去を行う。
        // ローマ字化は将来課題（GINZA_JOHOKYOKU_SPEC §20）。空になった場合のみ
        // title へフォールバック。
        slug: slugify(draft.title) || draft.title,
        body: draft.body,
        pillars: pillarIds,
        seo: {
          metaTitle: draft.seo.metaTitle,
          metaDescription: draft.seo.metaDescription,
        },
        socialCopy: {
          note: draft.socialCopy.note,
          x: draft.socialCopy.x,
          instagram: draft.socialCopy.instagram,
        },
        callToAction: draft.callToAction,
        relatedArticles: related.map((r) => r.id),
        editorialProvenance: (draft.editorialProvenance ?? []).map((entry) => ({
          discoveredContentSource: Number(entry.discoveredContentId),
          sourceName: entry.sourceName,
          sourceUrl: entry.sourceUrl,
          verifiedAt: entry.verifiedAt ?? null,
          fact: entry.fact,
          sourceType: entry.sourceType,
          factType: entry.factType,
          verificationStatus: entry.verificationStatus,
        })),
        // volumeは専用スキーマフィールドを新設せず、aiGeneratedByへ角度と共に
        // 記録する（トレーサビリティ確保のための最小差分、Articles.ts無変更）。
        // 収益化②経由の場合は末尾に |interestTheme=<正規化テーマ> を付与する。
        // 収益化② Tier 1：post-gate WARNING があれば |warnings=<csv> も付与する
        // （9月Trial は WARNING 記録のみ・生成はブロックしない）。
        aiGeneratedBy: `${MULTI_ANGLE_AI_GENERATED_BY_PREFIX}:${angle}:${volume}${interestSuffix}${warnSuffix})`,
      },
    })

    createdArticles.push({
      id: Number(article.id),
      title: String(article.title),
      angle,
      volume,
      warnings: angleWarnings.length > 0 ? angleWarnings : undefined,
    })
  }

  return { discoveredContentId, createdArticles, skipped, warnings }
}
