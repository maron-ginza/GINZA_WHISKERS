// GINZA WHISKERS / Project 02（2026-09-17新設・マロン指示：取得障害時の安全動作）
//
// 銀座三越の収集スクリプト（mitsukoshiGinzaFoodEventsFetch.ts）が「ライブ取得・
// 候補生成へ進んでよいか」を判定する決定的ゲート（純粋関数・DB/ネットワークなし）。
// SOURCE_LEDGER.healthStatusが'ok'以外の間は候補を一切生成しない——fixtureデータ・
// 過去のキャッシュ・推測データで代替しない。「該当情報0件」（取得成功のうえ0件）と
// 「sourceUnavailable」（取得不能で確認できていない）を明確に区別するための型を返す。

export interface MitsukoshiSourceDocLike {
  healthStatus?: string | null
  healthNote?: string | null
}

export interface MitsukoshiFetchGateResult {
  proceed: boolean
  reason: string
  /** 'ok'＝取得へ進んでよい／'sourceUnavailable'＝取得不能で確認できていない（0件とは区別する） */
  status: 'ok' | 'sourceUnavailable'
}

/**
 * SOURCE_LEDGERに情報源自体が見つからない場合（未登録・設定不備）は、この関数の
 * 対象外——呼び出し元が従来どおり別途エラーとして扱う（sourceUnavailableと混同
 * しない。前者は運用上想定内の一時的な取得不能、後者は設定不備で本来あってはならない）。
 */
export function decideMitsukoshiFetchGate(sourceDoc: MitsukoshiSourceDocLike): MitsukoshiFetchGateResult {
  if (sourceDoc.healthStatus === 'unreachable') {
    return {
      proceed: false,
      status: 'sourceUnavailable',
      reason: `healthStatus=unreachableのため取得へ進まない（${sourceDoc.healthNote ?? '(理由未記録)'}）`,
    }
  }
  return {
    proceed: true,
    status: 'ok',
    reason: `healthStatus=${sourceDoc.healthStatus ?? '(未設定)'}のため取得へ進む`,
  }
}
