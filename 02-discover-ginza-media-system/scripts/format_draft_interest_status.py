#!/usr/bin/env python3
"""./p2 draft-interest 用の結果フォーマッタ（Project 02-2 収益化②）。
draftInterest.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
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
    fail("draft-interest の結果解析に失敗しました")

mode = data.get("mode", "?")
print(f"  モード: {mode}（{'選定計画のみ・AI/DB書き込みなし' if mode == 'dry-run' else '実生成'}）")
print(f"  W_PAID = {data.get('wPaid')} / C_MATCH = {data.get('cMatch')} / 上限 = {data.get('maxDrafts')} 本/日"
      + ("  [--strict]" if data.get("strict") else ""))
print(f"  承認済み interest-themes: {data.get('approvedThemeRecords', 0)}行 / "
      f"{data.get('approvedThemeClusters', 0)}クラスタ")
print(f"  プレマッチ対象の承認済み DiscoveredContent: {data.get('approvedDiscoveredContent', 0)}件")

plan = data.get("plan", [])

STATUS_LABEL = {
    "selected": "採用",
    "deferred": "繰り越し",
    "no_ginza_match": "銀座接続なし",
    "already_generated": "生成済み",
    "strict_skipped": "strict除外",
}

def fmt_row(r: dict) -> str:
    pr = r.get("paidRatio")
    pr_str = f"{pr*100:.2f}%" if isinstance(pr, (int, float)) else "—"
    dc = r.get("matchedDc")
    dc_str = ""
    if dc:
        dc_str = (f"  → DC #{dc.get('discoveredContentId')} "
                  f"[score {dc.get('editorialScore')}] "
                  f"({dc.get('matchMethod')}) {dc.get('title','')[:40]}")
    line = (f"  [{STATUS_LABEL.get(r.get('status'), r.get('status'))}] "
            f"「{r.get('originalTheme')}」  "
            f"topic={r.get('topicInterestScore')} × mon={r.get('monetizationMultiplier')} "
            f"(paid {pr_str}) = final {r.get('finalRankScore')}{dc_str}")
    if r.get("note"):
        line += f"\n      ↳ {r['note']}"
    if r.get("monetizationNote"):
        line += f"\n      ↳ monetization: {r['monetizationNote']}"
    return line

print()
print(f"--- finalRankScore 降順 計画（{len(plan)}クラスタ） ---")
for r in plan:
    print(fmt_row(r))

created = data.get("createdDrafts", [])
if created:
    print()
    print(f"--- 生成された Article ドラフト（reviewStatus:draft、承認待ち）: {len(created)}件 ---")
    for c in created:
        print(f"  Article #{c.get('articleId')}  ← DC #{c.get('discoveredContentId')} "
              f"× 関心「{c.get('interestTheme')}」  [{c.get('angle')}/{c.get('volume')}]  "
              f"{c.get('title','')[:50]}")

failures = data.get("failures", [])
if failures:
    print()
    print(f"--- 生成失敗 / 銀座接続不成立: {len(failures)}件 ---")
    for f in failures:
        print(f"  関心「{f.get('interestTheme')}」 (DC #{f.get('discoveredContentId')}): {f.get('reason')}")

selected = [r for r in plan if r.get("status") == "selected"]
if mode == "dry-run":
    print()
    if selected:
        print(f"  → この{len(selected)}件を実際に生成するには: ./p2 draft-interest --yes（Claude API課金あり）")
    else:
        print("  → 生成対象なし（承認済みテーマの追加、または ./p2 interest paid-ratio / 承認済み DiscoveredContent の拡充が必要）")
elif created:
    print()
    print("  → Payload管理画面の Articles（reviewStatus=draft）で編集長レビューへ進めてください")
