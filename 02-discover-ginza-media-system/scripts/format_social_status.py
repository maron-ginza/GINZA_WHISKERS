#!/usr/bin/env python3
"""./p2 social 用の集計結果フォーマッタ。
socialStatus.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
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
    fail("集計結果の解析に失敗しました")

STATUS_LABELS = {
    "pending": "候補 (Pending)",
    "ready": "配信準備完了 (Ready)",
    "sent": "配信済み (Sent)",
    "failed": "失敗 (Failed)",
}

gen = data.get("generated", {})
print(f"--- 配信候補の自動生成（published/approved記事を走査、冪等） ---")
print(f"  走査した記事数: {gen.get('scannedArticles', 0)}")
print(f"  新規作成した候補: {gen.get('createdCount', 0)}")

dry = data.get("dryRun", {})
print()
print(f"--- Dry Run（実配信は行わない配信内容プレビュー） ---")
print(f"  プレビュー件数: {dry.get('previewedCount', 0)}")
print(f"  警告あり件数: {dry.get('warningCount', 0)}")

print()
print("--- SNS配信キュー状況 ---")
for key, count in data["byStatus"].items():
    label = STATUS_LABELS.get(key, key)
    print(f"  {label:24s}: {count}")
print(f"  合計: {data['total']}")

ready = data.get("readyItems", [])
print()
if ready:
    print(f"--- 人間の最終確認待ち（配信準備完了 / Ready）: {len(ready)}件 ---")
    for item in ready[:10]:
        print(f"  #{item['id']} [{item['channel']}] {item['articleTitle']}")
else:
    print("人間の最終確認待ち（配信準備完了 / Ready）: なし")

failed = data.get("failedItems", [])
print()
if failed:
    print(f"--- 配信失敗（Failed）: {len(failed)}件 ---")
    for item in failed[:10]:
        reason = item.get("failureReason", "")
        print(f"  #{item['id']} [{item['channel']}] {item['articleTitle']}: {reason}")
else:
    print("配信失敗（Failed）: なし")

warnings = data.get("warningItems", [])
print()
if warnings:
    print(f"--- Dry Runで検出した警告: {len(warnings)}件 ---")
    for item in warnings[:10]:
        joined = " / ".join(item.get("warnings", []))
        print(f"  #{item['id']} [{item['channel']}] {item['articleTitle']}: {joined}")
else:
    print("Dry Runで検出した警告: なし")
