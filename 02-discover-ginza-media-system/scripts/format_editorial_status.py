#!/usr/bin/env python3
"""./p2 editorial 用の集計結果フォーマッタ。
editorialStatus.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
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

SOURCE_LABELS = {
    "inbox": "受信箱 (Inbox)",
    "review": "レビュー中 (Review)",
    "editors-choice": "Editor's Choice候補",
    "approved": "承認済み (Approved)",
    "published": "公開済み (Published)",
    "rejected": "却下 (Rejected)",
}

REVIEW_LABELS = {
    "draft": "下書き (Draft)",
    "review": "レビュー中 (Review)",
    "approved": "承認済み (Approved)",
    "published": "公開済み (Published)",
}

print("--- Sources（情報収集）: 編集パイプライン状況 ---")
for key, count in data["sources"]["byStatus"].items():
    label = SOURCE_LABELS.get(key, key)
    print(f"  {label:24s}: {count}")
print(f"  合計: {data['sources']['total']}")

print()
print("--- Articles（記事）: 承認キュー状況 ---")
for key, count in data["articles"]["byStatus"].items():
    label = REVIEW_LABELS.get(key, key)
    print(f"  {label:24s}: {count}")
print(f"  合計: {data['articles']['total']}")

pending = data.get("editorsChoicePending", [])
print()
if pending:
    print(f"--- 人間の承認待ち（Editor's Choice候補）: {len(pending)}件 ---")
    for s in pending[:10]:
        print(f"  #{s['id']}: {s['contentRef']}")
else:
    print("人間の承認待ち（Editor's Choice候補）: なし")
