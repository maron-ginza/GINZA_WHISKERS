#!/usr/bin/env python3
"""./p2 daily 用の集計結果フォーマッタ（2026-08-17、Story Clustering拡張）。
dailyDesk.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json
from datetime import datetime, timedelta, timezone

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""
TOP_N = 10
JST = timezone(timedelta(hours=9))

DISPLAY_STATUS_LABELS = {
    "new": "new（本日新規検知）",
    "updated": "updated（本日更新検知）",
    "ongoing": "ongoing（開催中）",
    "upcoming": "upcoming（近日開催）",
    "unchanged": "unchanged",
}

REASON_LABELS = {
    "today_new": "本日新規検知",
    "today_updated": "本日更新検知",
    "ongoing": "現在開催中",
    "upcoming_soon": "近日開催",
}

UX_TYPE_LABELS = {
    "participate_workshop": "参加・体験・ワークショップ",
    "food_drink": "グルメ・飲食",
    "live_performance": "ライブ・公演・観覧",
    "exhibition_viewing": "展覧会・鑑賞",
    "shopping_discovery": "ショッピング・新商品発見",
    "other": "その他（未分類）",
}

TEMPORAL_RELEVANCE_LABELS = {
    "now": "NOW（現在開催中・体験可能）",
    "soon": "SOON（1〜7日以内に開始）",
    "next": "NEXT（8〜14日以内に開始）",
    "later": "LATER（15日以上先）",
    "expired": "EXPIRED（終了済み）",
    "unknown": "不明（開催日情報が不十分）",
}

GENDER_LABELS = {"female": "Female", "male": "Male", "all": "All"}
GENERATION_LABELS = {"next": "NEXT", "core": "CORE", "mature": "MATURE", "timeless": "TIMELESS"}
VISIT_STYLE_LABELS = {
    "solo": "SOLO", "couple": "COUPLE", "friends": "FRIENDS",
    "family": "FAMILY", "business": "BUSINESS", "all": "ALL",
}


def fail(message: str) -> None:
    print(message)
    if log_hint:
        print(f"詳細は {log_hint} を確認してください")
    sys.exit(1)


def to_jst(iso_str):
    if not iso_str:
        return "-"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(JST).strftime("%Y-%m-%d %H:%M JST")
    except ValueError:
        return iso_str


def to_jst_date(iso_str):
    if not iso_str:
        return None
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(JST).strftime("%Y-%m-%d")
    except ValueError:
        return iso_str


def tags_line(tags: dict) -> str:
    gender = "/".join(GENDER_LABELS.get(t, t) for t in tags.get("genderAffinity", []))
    generation = "/".join(GENERATION_LABELS.get(t, t) for t in tags.get("generation", []))
    visit = "/".join(VISIT_STYLE_LABELS.get(t, t) for t in tags.get("visitStyle", []))
    parts = [p for p in [f"Gender:{gender}" if gender else "", f"Gen:{generation}" if generation else "", f"Visit:{visit}" if visit else ""] if p]
    return " / ".join(parts) if parts else "(未付与)"


def event_period_line(e: dict) -> str:
    s = to_jst_date(e.get("eventStartAt"))
    en = to_jst_date(e.get("eventEndAt"))
    if not s and not en:
        return "不明（構造化データから取得できず）"
    return f"{s or '?'} 〜 {en or '?'}"


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("Daily Editorial Desk結果の解析に失敗しました")

print("--- Daily Editorial Desk（本日新規/更新 + 開催中 + 近日開催のみ、Story Cluster単位） ---")
print(f"  採点済み総数: {data.get('totalScored', 0)}件")
print(f"  Story Cluster数: {data.get('clusterCount', 0)}件")
print(f"  Daily候補プール（Cluster単位）: {data.get('dailyPoolSize', 0)}件")
print(f"  除外（古いInbox残留候補、Dailyには混入させない）: {data.get('staleExcludedCount', 0)}件（個別コンテンツ数換算）")
print(f"  近日開催の判定窓: {data.get('upcomingWindowDays', '-')}日以内")
diversified = data.get("diversified", True)
print(f"  施設多様性を考慮した並べ替え: {'適用' if diversified else '未適用（Editorial Score純粋降順）'}")

entries = data.get("entries", [])
if not entries:
    print()
    print("Daily候補プールは空です（本日の新規/更新検知、開催中、近日開催のいずれもありません）")
else:
    print()
    print(f"=== Daily Top{min(TOP_N, len(entries))}（Story Cluster単位） ===")
    for i, e in enumerate(entries[:TOP_N], start=1):
        status = DISPLAY_STATUS_LABELS.get(e.get("displayStatus"), e.get("displayStatus"))
        reasons = "・".join(REASON_LABELS.get(r, r) for r in e.get("inclusionReasons", []))
        member_note = f"（関連{e.get('memberCount')}件を統合）" if e.get("memberCount", 1) > 1 else ""
        diversity_note = ""
        if e.get("diversityAdjusted") and e.get("pureScoreRank") != i:
            diversity_note = f"（施設多様性のため繰り下げ・本来のスコア順位: #{e.get('pureScoreRank')}）"
        richness_note = ""
        tier = e.get("contentRichnessTier")
        raw_total = e.get("rawTotal")
        if tier and raw_total is not None and raw_total != e.get("total"):
            richness_note = f"（本文情報量ペナルティ適用: 素点{raw_total}点 → {tier}）"
        print(f"  #{i} [{e.get('total')}点/100] {e.get('storyTitle') or '(タイトルなし)'}{member_note}{diversity_note}{richness_note}")
        print(f"      Venue: {e.get('sourceSiteName') or '-'} ・ 状態: {status}")
        print(f"      開催期間: {event_period_line(e)}")
        print(f"      代表URL: {e.get('representativeUrl')}")
        b = e.get("breakdown", {})
        print(
            f"      NOW:{b.get('now')} GINZA:{b.get('ginza')} UX:{b.get('ux')} "
            f"STORY:{b.get('story')} DISCOVERY:{b.get('discovery')}"
        )
        print(f"      Audience: {tags_line(e.get('audienceTags', {}))}")
        ux_type = e.get("uxType")
        print(f"      体験タイプ: {UX_TYPE_LABELS.get(ux_type, ux_type or '(未分類)')}")
        temporal_tier = e.get("temporalRelevanceTier")
        temporal_label = TEMPORAL_RELEVANCE_LABELS.get(temporal_tier, temporal_tier or "不明")
        days_until_start = e.get("daysUntilStart")
        days_until_end = e.get("daysUntilEnd")
        temporal_detail = ""
        if days_until_start is not None:
            temporal_detail = f"（開始まで{days_until_start}日）"
        elif days_until_end is not None:
            temporal_detail = f"（終了まで{days_until_end}日）"
        print(f"      Temporal Relevance: {temporal_label}{temporal_detail}（参考情報——ランキングには影響しません）")
        print(f"      今日選ばれた理由: {reasons or '-'}")

    top_venues = [e.get("sourceSiteName") or "(不明)" for e in entries[:TOP_N]]
    venue_counts = {}
    for v in top_venues:
        venue_counts[v] = venue_counts.get(v, 0) + 1
    venue_summary = " / ".join(f"{v}:{c}件" for v, c in sorted(venue_counts.items(), key=lambda x: -x[1]))
    print()
    print(f"  Top{min(TOP_N, len(entries))}の施設構成: {venue_summary}")

    top_ux_types = [e.get("uxType") or "other" for e in entries[:TOP_N]]
    ux_type_counts = {}
    for t in top_ux_types:
        ux_type_counts[t] = ux_type_counts.get(t, 0) + 1
    ux_summary = " / ".join(
        f"{UX_TYPE_LABELS.get(t, t)}:{c}件" for t, c in sorted(ux_type_counts.items(), key=lambda x: -x[1])
    )
    print(f"  Top{min(TOP_N, len(entries))}の体験タイプ構成: {ux_summary}"
          f"（参考情報——ランキング自体には影響しません）")

    top_temporal = [e.get("temporalRelevanceTier") or "unknown" for e in entries[:TOP_N]]
    temporal_counts = {}
    for t in top_temporal:
        temporal_counts[t] = temporal_counts.get(t, 0) + 1
    temporal_summary = " / ".join(
        f"{TEMPORAL_RELEVANCE_LABELS.get(t, t)}:{c}件" for t, c in sorted(temporal_counts.items(), key=lambda x: -x[1])
    )
    print(f"  Top{min(TOP_N, len(entries))}のTemporal Relevance構成: {temporal_summary}"
          f"（参考情報——ランキング自体には影響しません）")

    if len(entries) > TOP_N:
        print()
        print(f"--- 残り{len(entries) - TOP_N}件 ---")
        for i, e in enumerate(entries[TOP_N:], start=TOP_N + 1):
            member_note = f"（関連{e.get('memberCount')}件）" if e.get("memberCount", 1) > 1 else ""
            print(f"  #{i} [{e.get('total')}点] {e.get('storyTitle') or '(タイトルなし)'}{member_note}")

    if data.get("entriesTruncated"):
        pool_size = data.get("dailyPoolSize", len(entries))
        print()
        print(f"  ※CLI出力サイズの都合によりTop{len(entries)}件のみ表示（Daily候補プール全体は{pool_size}件）")
