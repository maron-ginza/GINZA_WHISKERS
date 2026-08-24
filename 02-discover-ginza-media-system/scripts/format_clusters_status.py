#!/usr/bin/env python3
"""./p2 clusters 用の集計結果フォーマッタ。
clustersStatus.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
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
    fail("Story Clusters計算結果の解析に失敗しました")

mode = "実書き込みあり（StoryClustersコレクションへ反映）" if data.get("persisted") else "Dry Run（DB書き込みなし）"
print(f"--- Story Clustering 再計算（{mode}） ---")
print(f"  走査したDiscoveredContent: {data.get('scannedContents', 0)}件")
print(f"  Story Cluster数: {data.get('clusterCount', 0)}件")
print(f"  単独クラスタ: {data.get('singletonCount', 0)}件")
print(f"  複数メンバークラスタ: {data.get('multiMemberCount', 0)}件")
print(f"  統合された重複コンテンツ数: {data.get('totalMembersInMultiClusters', 0)}件")
print(f"  新規作成: {data.get('created', 0)}件 / 更新: {data.get('updated', 0)}件")
