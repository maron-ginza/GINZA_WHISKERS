#!/usr/bin/env python3
"""./p2 refresh-dates 用の集計結果フォーマッタ。
refreshDates.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
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
    fail("日付再確認結果の解析に失敗しました")

mode = "実書き込みあり（DiscoveredContentを更新）" if data.get("persisted") else "Dry Run（DB書き込みなし）"
print(f"--- 個別ページ日付再確認（{mode}） ---")
print(f"  対象（日付未取得のDiscoveredContent）: {data.get('scanned', 0)}件")
print(f"  再取得試行: {data.get('attempted', 0)}件")
print(f"  再取得成功: {data.get('fetchSucceeded', 0)}件")
print(f"  新たに日付が取得できた件数: {data.get('newDatesFound', 0)}件")
if data.get('errors', 0) > 0:
    print(f"  エラー（分離済み、他の項目には影響なし）: {data.get('errors', 0)}件")
