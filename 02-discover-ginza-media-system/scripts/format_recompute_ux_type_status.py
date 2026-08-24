#!/usr/bin/env python3
"""./p2 recompute-ux-type 用の集計結果フォーマッタ（2026-08-18）。
recomputeUxType.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""

TYPE_LABELS = {
    "participate_workshop": "参加・体験・ワークショップ",
    "food_drink": "グルメ・飲食",
    "live_performance": "ライブ・公演・観覧",
    "exhibition_viewing": "展覧会・鑑賞",
    "shopping_discovery": "ショッピング・新商品発見",
    "other": "その他（未分類）",
}


def fail(message: str) -> None:
    print(message)
    if log_hint:
        print(f"詳細は {log_hint} を確認してください")
    sys.exit(1)


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("UXタイプ再計算結果の解析に失敗しました")

mode = "実書き込みあり（uxTypeを更新）" if data.get("persisted") else "Dry Run（DB書き込みなし、判定のみ）"
print(f"--- 参加／体験型UXタイプ再計算（{mode}） ---")
print(f"  対象: {data.get('scanned', 0)}件 / 更新: {data.get('updated', 0)}件")
print()
print("  --- UXタイプ分布 ---")
type_counts = data.get("typeCounts", {})
for t, label in TYPE_LABELS.items():
    print(f"    {label}: {type_counts.get(t, 0)}件")
