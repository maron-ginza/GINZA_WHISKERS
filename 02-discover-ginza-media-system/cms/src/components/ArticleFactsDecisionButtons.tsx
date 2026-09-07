'use client'

// GINZA WHISKERS / Project 02（2026-09-07、根本改善）
//
// ArticleFacts 管理画面の「候補要約」直下に常時表示する、承認／保留／却下の3ボタン。
// 各ボタンは1クリックで enrichmentStatus の変更と保存を同時に完了する
// （プルダウン操作＋別のSave操作という2手順を撤廃する）。
//
// 【設計】
//   ・「承認」＝enrichmentStatus:'ready'（ArticleFacts.beforeChange フックが必須項目を再検査し、
//     ログイン済みユーザーであれば humanReviewedBy/humanReviewedAt を自動記録する。ここでは
//     ステータス変更のみ送信し、判定・記録はサーバー側フックに一本化する）。
//   ・「保留」＝enrichmentStatus:'draft'。「却下」＝enrichmentStatus:'withdrawn'。
//   ・PATCH /api/article-facts/:id へ enrichmentStatus のみを直接送信する（フォーム全体の
//     Save を経由しない）。成功時は候補要約・監査項目（humanReviewedAt 等）が最新化される
//     ため、画面を再読み込みして反映する（sessionStorage に結果メッセージを一時保存し、
//     再読み込み後にバナー表示する）。失敗時は再読み込みせず、その場でエラーを表示する。

import { useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

type DecisionValue = 'ready' | 'draft' | 'withdrawn'

const LABELS: Record<DecisionValue, string> = {
  ready: '承認',
  draft: '保留',
  withdrawn: '却下',
}

const SUCCESS_TEXT: Record<DecisionValue, string> = {
  ready: '承認しました（ready化・保存完了）',
  draft: '保留にしました（保存完了）',
  withdrawn: '却下しました（保存完了）',
}

const COLORS: Record<DecisionValue, { bg: string; border: string; color: string }> = {
  ready: { bg: '#e6f4ea', border: '#34a853', color: '#1e7e34' },
  draft: { bg: '#f1f3f4', border: '#9aa0a6', color: '#5f6368' },
  withdrawn: { bg: '#fce8e6', border: '#ea4335', color: '#c5221f' },
}

function bannerKey(id: string | number): string {
  return `af-decision-msg:${id}`
}

function extractErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as { errors?: { message?: string }[]; message?: string }
    if (Array.isArray(b.errors) && b.errors[0]?.message) return b.errors[0].message
    if (typeof b.message === 'string' && b.message) return b.message
  }
  return `HTTPステータス ${status}`
}

export function ArticleFactsDecisionButtonsField(): React.ReactElement | null {
  const { id, collectionSlug, apiURL } = useDocumentInfo()
  const [pending, setPending] = React.useState<DecisionValue | null>(null)
  const [banner, setBanner] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null)

  React.useEffect(() => {
    if (id == null) return
    try {
      const raw = window.sessionStorage.getItem(bannerKey(id))
      if (raw) {
        const parsed = JSON.parse(raw) as { type: 'success' | 'error'; text: string }
        setBanner(parsed)
        window.sessionStorage.removeItem(bannerKey(id))
      }
    } catch {
      /* sessionStorage 不可（プライベートモード等）でも致命的ではない */
    }
  }, [id])

  if (id == null) return null

  const endpoint = apiURL || `/api/${collectionSlug || 'article-facts'}/${id}`

  const handleDecide = async (value: DecisionValue): Promise<void> => {
    if (pending) return
    setPending(value)
    setBanner(null)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrichmentStatus: value }),
      })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        /* ボディなし・JSON でない場合もある */
      }
      if (!res.ok) {
        setPending(null)
        setBanner({ type: 'error', text: `失敗：${extractErrorMessage(res.status, body)}` })
        return
      }
      try {
        window.sessionStorage.setItem(
          bannerKey(id),
          JSON.stringify({ type: 'success', text: SUCCESS_TEXT[value] }),
        )
      } catch {
        /* 保存できなくても再読み込みは続行する */
      }
      window.location.reload()
    } catch (e) {
      setPending(null)
      setBanner({ type: 'error', text: `失敗：${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return (
    <div style={{ margin: '0.5rem 0 1.5rem' }}>
      {banner && (
        <div
          role="status"
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.9rem',
            borderRadius: 4,
            border: `1px solid ${banner.type === 'success' ? '#34a853' : '#ea4335'}`,
            background: banner.type === 'success' ? '#e6f4ea' : '#fce8e6',
            color: banner.type === 'success' ? '#1e7e34' : '#c5221f',
            fontSize: 13,
          }}
        >
          {banner.text}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {(['ready', 'draft', 'withdrawn'] as DecisionValue[]).map((value) => {
          const c = COLORS[value]
          const isPending = pending === value
          return (
            <button
              key={value}
              type="button"
              disabled={pending !== null}
              onClick={() => void handleDecide(value)}
              style={{
                padding: '0.55rem 1.4rem',
                borderRadius: 4,
                border: `1px solid ${c.border}`,
                background: c.bg,
                color: c.color,
                fontWeight: 600,
                fontSize: 14,
                cursor: pending !== null ? 'not-allowed' : 'pointer',
                opacity: pending !== null && !isPending ? 0.5 : 1,
              }}
            >
              {isPending ? '処理中…' : LABELS[value]}
            </button>
          )
        })}
      </div>
      <p style={{ marginTop: '0.5rem', fontSize: 12, color: '#5f6368' }}>
        各ボタンは1クリックで状態変更と保存を同時に完了します（別途「Save」は不要です）。
      </p>
    </div>
  )
}
