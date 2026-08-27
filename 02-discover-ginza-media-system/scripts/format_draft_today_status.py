#!/usr/bin/env python3
"""./p2 draft-today 用の結果フォーマッタ。
draftToday.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json


def fail(message: str) -> None:
    print(message)
    sys.exit(1)


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("draft-today の結果解析に失敗しました")


def topic_line(t: dict) -> str:
    score = t.get("editorialScore")
    score_str = f"{score}点" if isinstance(score, (int, float)) else "未採点"
    return f"  #{t.get('discoveredContentId')} [{score_str}] {t.get('title', '(無題)')}"


mode = data.get("mode", "?")
print(f"  モード: {mode}（{'選定計画のみ・AI/DB書き込みなし' if mode == 'dry-run' else '実生成'}）")
print(f"  承認取得の起点(since): {data.get('since', '?')}")
print(f"  当日approvedで見つかった候補: {data.get('approvedFound', 0)}件")
print(f"  1日あたり上限(maxDrafts): {data.get('maxDrafts', 5)} / 類似統合しきい値: {data.get('similarityThreshold')}")

already = data.get("alreadyDrafted", [])
if already:
    print()
    print(f"--- 既にドラフト化済みのため除外: {len(already)}件 ---")
    for t in already:
        print(topic_line(t))

merged = data.get("mergedAway", [])
if merged:
    print()
    print(f"--- 類似テーマとして代表へ統合: {len(merged)}件 ---")
    for t in merged:
        print(
            topic_line(t)
            + f"  → #{t.get('mergedIntoDiscoveredContentId')} へ統合（類似度{t.get('similarity')}）"
        )

distinct = data.get("distinctTopics", [])
print()
print(f"--- 束ねた後の distinct トピック: {len(distinct)}件（Editorial Score降順） ---")
for t in distinct:
    print(topic_line(t))

selected = data.get("selectedTopics", [])
print()
print(f"--- 今日ドラフト化するトピック（上位{data.get('maxDrafts', 5)}）: {len(selected)}件 ---")
for t in selected:
    print(topic_line(t))

deferred = data.get("deferredTopics", [])
if deferred:
    print()
    print(f"--- 上限超過のため翌日以降へ繰り越し: {len(deferred)}件 ---")
    for t in deferred:
        print(topic_line(t))

created = data.get("createdDrafts", [])
if created:
    print()
    print(f"--- 生成された Article ドラフト（reviewStatus:draft、承認待ち）: {len(created)}件 ---")
    for c in created:
        print(
            f"  Article #{c.get('articleId')}  ← DiscoveredContent #{c.get('discoveredContentId')}"
            f"  [{c.get('angle')}/{c.get('volume')}]  {c.get('title', '(無題)')}"
        )

failures = data.get("failures", [])
if failures:
    print()
    print(f"--- 生成失敗（要確認）: {len(failures)}件 ---")
    for f in failures:
        print(f"  DiscoveredContent #{f.get('discoveredContentId')}: {f.get('reason')}")

if mode == "dry-run":
    print()
    print("  → 実際に生成するには: ./p2 draft-today --yes")
elif created:
    print()
    print("  → Payload管理画面の Articles（reviewStatus=draft）で編集長レビューへ進めてください")
