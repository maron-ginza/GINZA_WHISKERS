#!/usr/bin/env python3
"""./p2 score-articles 用の集計結果フォーマッタ。
scoreArticles.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""


def fail(message: str) -> None:
    print(message)
    if log_hint:
        print(f"詳細は {log_hint} を確認してください")
    sys.exit(1)


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("採点結果の解析に失敗しました")

print(f"  走査した個別記事・イベント候補: {data.get('scannedCandidates', 0)}件")
print(f"  新規採点: {data.get('scoredCount', 0)}件")
print(f"  失敗: {data.get('errorCount', 0)}件")

results = data.get("results", [])
scored = [r for r in results if r.get("status") == "scored"]
errored = [r for r in results if r.get("status") == "error"]

if scored:
    print()
    print("--- 採点結果 ---")
    for r in scored:
        print(f"  DiscoveredContent #{r.get('id')}: 合計 {r.get('total')}点")

if errored:
    print()
    print(f"--- 失敗（要確認）: {len(errored)}件 ---")
    for r in errored:
        print(f"  DiscoveredContent #{r.get('id')}: {r.get('error')}")
