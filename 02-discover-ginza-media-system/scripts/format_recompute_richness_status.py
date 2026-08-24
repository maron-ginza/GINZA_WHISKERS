#!/usr/bin/env python3
"""./p2 recompute-richness 用の集計結果フォーマッタ（2026-08-18）。
recomputeContentRichness.ts が標準出力した1行JSONを標準入力から受け取り、
人間向けに整形する。
"""
import sys
import json

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""

TIER_LABELS = {
    "rich": "rich（実質的な本文あり）",
    "thin": "thin（本文情報が乏しい）",
    "boilerplate": "boilerplate（ナビ文言等が大半、実質本文なし）",
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
    fail("本文情報量ペナルティ再計算結果の解析に失敗しました")

mode = "実書き込みあり（Editorial Score.total/rawTotal等を更新）" if data.get("persisted") else "Dry Run（DB書き込みなし、判定のみ）"
print(f"--- 本文情報量ペナルティ再計算（{mode}） ---")
print(f"  Sources: 対象{data.get('sourcesScanned', 0)}件 / 更新{data.get('sourcesUpdated', 0)}件")
print(f"  DiscoveredContent: 対象{data.get('discoveredContentScanned', 0)}件 / 更新{data.get('discoveredContentUpdated', 0)}件")
print()
print("  --- 本文情報量の判定内訳（Sources+DiscoveredContent合計） ---")
tier_counts = data.get("tierCounts", {})
for tier in ("rich", "thin", "boilerplate"):
    print(f"    {TIER_LABELS.get(tier, tier)}: {tier_counts.get(tier, 0)}件")
