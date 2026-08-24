#!/usr/bin/env python3
"""./p2 articles 用の集計結果フォーマッタ。
articlesStatus.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""

CONTENT_TYPE_LABELS = {
    "event": "イベント", "news": "ニュース", "exhibition": "展覧会",
    "food": "グルメ", "shopping": "ショッピング", "culture": "文化・歴史", "other": "その他",
}
DISCOVERY_LABELS = {"first_seen": "初回検知", "changed": "更新検知", "unchanged": "変化なし"}


def fail(message: str) -> None:
    print(message)
    if log_hint:
        print(f"詳細は {log_hint} を確認してください")
    sys.exit(1)


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("DiscoveredContent状態の解析に失敗しました")

print("--- 個別記事・イベント（DiscoveredContent）現在の状態 ---")
print(f"  ユニーク件数（1URL=1行）: {data.get('totalUnique', 0)}件")
print(f"  公開日(publishedAt)取得済み: {data.get('publishedAtCount', 0)}件")
print(f"  開催期間(eventStartAt/eventEndAt)取得済み: {data.get('eventDateCount', 0)}件")
any_rate = data.get('anyDateRate', 0) * 100
print(f"  日付いずれか1つでも取得済み: {data.get('anyDateCount', 0)}件 ({any_rate:.1f}%)")
print(f"  本日新規/更新候補: {data.get('todayNewOrChangedCount', 0)}件")

print()
print("--- イベント開催状態（Event Date Extraction） ---")
print(f"  ongoing（開催中）: {data.get('ongoingCount', 0)}件")
print(f"  upcoming（開始日が未来と確定）: {data.get('upcomingCount', 0)}件")
print(f"    うち近日開催（{data.get('upcomingWindowDays', 14)}日以内、Daily候補Dの母集団）: {data.get('upcomingSoonCount', 0)}件")
print(f"  ended（終了済み）: {data.get('endedCount', 0)}件")
print(f"  unknown（判定不可）: {data.get('unknownEventStatusCount', 0)}件")

print()
print("--- Story Clustering ---")
print(f"  Story Cluster数: {data.get('clusterCount', 0)}件")
print(f"  単独クラスタ（重複なし）: {data.get('singletonClusterCount', 0)}件")
print(f"  複数メンバークラスタ: {data.get('multiMemberClusterCount', 0)}件")
print(f"  統合された重複コンテンツ数（複数メンバークラスタ内の合計）: {data.get('consolidatedDuplicateCount', 0)}件")

print()
print("--- contentType内訳 ---")
by_type = data.get("byContentType", {})
for k, v in sorted(by_type.items(), key=lambda x: -x[1]):
    label = CONTENT_TYPE_LABELS.get(k, k)
    print(f"  {label:10s}: {v}")

print()
print("--- discoveryStatus内訳 ---")
by_status = data.get("byDiscoveryStatus", {})
for k, v in sorted(by_status.items(), key=lambda x: -x[1]):
    label = DISCOVERY_LABELS.get(k, k)
    print(f"  {label:10s}: {v}")
