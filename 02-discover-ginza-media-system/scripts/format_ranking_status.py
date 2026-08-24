#!/usr/bin/env python3
"""./p2 ranking 用の集計結果フォーマッタ。
curationRanking.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""

TOP_N = 5

RICHNESS_LABELS = {
    "rich": "rich",
    "thin": "thin（本文情報が乏しい）",
    "boilerplate": "boilerplate（実質本文なし）",
}

GENDER_LABELS = {"female": "Female", "male": "Male", "all": "All"}
GENERATION_LABELS = {"next": "NEXT", "core": "CORE", "mature": "MATURE", "timeless": "TIMELESS"}
VISIT_STYLE_LABELS = {
    "solo": "SOLO",
    "couple": "COUPLE",
    "friends": "FRIENDS",
    "family": "FAMILY",
    "business": "BUSINESS",
    "all": "ALL",
}


def fail(message: str) -> None:
    print(message)
    if log_hint:
        print(f"詳細は {log_hint} を確認してください")
    sys.exit(1)


def tags_line(tags: dict) -> str:
    gender = "/".join(GENDER_LABELS.get(t, t) for t in tags.get("genderAffinity", []))
    generation = "/".join(GENERATION_LABELS.get(t, t) for t in tags.get("generation", []))
    visit = "/".join(VISIT_STYLE_LABELS.get(t, t) for t in tags.get("visitStyle", []))
    parts = []
    if gender:
        parts.append(f"Gender:{gender}")
    if generation:
        parts.append(f"Gen:{generation}")
    if visit:
        parts.append(f"Visit:{visit}")
    return " / ".join(parts) if parts else "(未付与)"


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("ランキング結果の解析に失敗しました")

scored = data.get("scored", [])
unscored = data.get("unscored", [])

print(f"--- Editorial Score ランキング（採点済み {len(scored)}件 / 未採点 {len(unscored)}件） ---")

if not scored:
    print("  採点済みの候補はまだありません（./p2 score で採点してください）")
else:
    print()
    print(f"=== Top{min(TOP_N, len(scored))}候補（Maron Editor's Choiceの検討材料） ===")
    for i, entry in enumerate(scored[:TOP_N], start=1):
        method = entry.get("scoringMethod") or "-"
        tier = entry.get("contentRichnessTier")
        raw_total = entry.get("rawTotal")
        richness_note = ""
        if tier and raw_total is not None and raw_total != entry.get("total"):
            richness_note = f"（本文情報量ペナルティ適用: 素点{raw_total}点 → {RICHNESS_LABELS.get(tier, tier)}）"
        print(f"  #{i} [{entry.get('total')}点/100] Source #{entry.get('id')} ({method}){richness_note}")
        print(f"      {entry.get('contentRefExcerpt')}")
        b = entry.get("breakdown", {})
        print(
            f"      NOW:{b.get('now')} GINZA:{b.get('ginza')} UX:{b.get('ux')} "
            f"STORY:{b.get('story')} DISCOVERY:{b.get('discovery')}"
        )
        print(f"      Audience: {tags_line(entry.get('audienceTags', {}))}")

    if len(scored) > TOP_N:
        print()
        print(f"--- 残り{len(scored) - TOP_N}件（全ランキング） ---")
        for i, entry in enumerate(scored[TOP_N:], start=TOP_N + 1):
            print(f"  #{i} [{entry.get('total')}点] Source #{entry.get('id')}: {entry.get('contentRefExcerpt')}")

if unscored:
    print()
    print(f"--- 未採点: {len(unscored)}件（./p2 score で採点してください） ---")
    for entry in unscored[:10]:
        print(f"  Source #{entry.get('id')}: {entry.get('contentRefExcerpt')}")
    if len(unscored) > 10:
        print(f"  ...他{len(unscored) - 10}件")
