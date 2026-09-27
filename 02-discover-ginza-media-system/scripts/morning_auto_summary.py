#!/usr/bin/env python3
"""GINZA WHISKERS / Project 02 — 朝刊自動化（morningAutoRun.sh）の最終サマリを組み立てる。

.devlogs/morning/auto/<date>.jsonl（フェーズごとの実行結果）と
.devlogs/morning/brief/<date>.json（候補選定結果、morning-brief.tsが生成）を読み、
監視用の1画面サマリ（正常終了・取得件数・有効候補数・カテゴリー別候補数・
除外件数と主な理由・エラー内容）を1つのJSONにまとめてstdoutへ出す。

DB・ネットワーク・AIには一切触れない（ファイル読み込みのみ）。
"""
import argparse
import json
import os
from collections import Counter


def read_jsonl(path):
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def read_json(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


# 2026-09-27追加（マロン指示：「毎朝6時の情報収集・候補選定プロンプト」§7の
# 「収集、データベース保存、分類、候補表示の各処理の成功・失敗」を、マロンが
# 直接読む人間可読テキストにも明示する）。フェーズ名→この4区分＋日本語ラベルへの
# 写像（表示専用・判定ロジックには影響しない）。
PHASE_GROUPS = [
    ("収集", ["crawl", "sweets_detail_fetch", "matsuya_sweets_fetch", "matsuya_gourmet_fetch",
             "mitsukoshi_health_check", "mitsukoshi_food_events_fetch"]),
    ("データベース保存", ["db"]),
    ("分類（A/B/C判定・ArticleFacts）", ["am_run"]),
    ("候補表示（Morning Board）", ["morning_brief", "candidate_fallback"]),
]
PHASE_LABELS = {
    "db": "DB起動確認",
    "crawl": "収集（SOURCE_LEDGER 巡回）",
    "sweets_detail_fetch": "収集補完（スイーツ詳細取得）",
    "matsuya_sweets_fetch": "収集（松屋銀座スイーツ）",
    "matsuya_gourmet_fetch": "収集（松屋銀座グルメ）",
    "mitsukoshi_health_check": "収集（銀座三越 到達確認）",
    "mitsukoshi_food_events_fetch": "収集（銀座三越 食料品催事）",
    "am_run": "分類（A/B/C判定・ArticleFacts抽出）",
    "morning_brief": "候補表示（Morning Board生成）",
    "candidate_fallback": "候補不足フォールバック判定",
}
STATUS_LABELS = {"ok": "✅成功", "retry": "🔁リトライ中", "error": "❌失敗"}


def render_human_summary(out: dict) -> str:
    """out（main()が組み立てた最終サマリdict）から、マロンが直接読む人間可読テキストを
    組み立てる。数値・文言はoutにある値をそのまま転記するだけ（新たな判定はしない）。
    「実行は成功したが結果が乏しい」（status=degraded）を「失敗」と混同表示しない一方、
    実際にフェーズが失敗した場合は必ずここにも❌として現れる。"""
    lines = []
    L = lines.append
    L(f"=== 本日（{out['date']}）の処理成否（収集・DB保存・分類・候補表示） ===")
    if out.get("fatal"):
        L(f"❌ 致命的エラーのため後続フェーズ未実行: {out['fatal']}")
    phases = out.get("phases") or {}
    for group_label, phase_keys in PHASE_GROUPS:
        group_statuses = [phases[k]["status"] for k in phase_keys if k in phases]
        if not group_statuses:
            L(f"  ◆ {group_label}: （未実行）")
            continue
        group_ok = all(s == "ok" for s in group_statuses)
        L(f"  ◆ {group_label}: {'✅全フェーズ成功' if group_ok else '⚠一部失敗・要確認'}")
        for k in phase_keys:
            if k not in phases:
                continue
            p = phases[k]
            label = PHASE_LABELS.get(k, k)
            st = STATUS_LABELS.get(p["status"], p["status"])
            L(f"      - {label}: {st}（試行 {p['attempt']}/{p['maxAttempts']}・{p['elapsedSec']}秒）")
    L("")
    sig = out.get("signals") or {}
    new_count = sig.get("todayNewOrChangedCount")
    L(
        f"本日の新規/更新DiscoveredContent件数: {new_count}"
        if new_count is not None
        else "本日の新規/更新DiscoveredContent件数: 不明（./p2 crawl が構造化出力を返していないため取得できない。既知の別課題・推測で埋めない）"
    )
    a_count = sig.get("candidateBoardACount")
    sweets_count = sig.get("candidateBoardSweetsCount")
    L(f"A判定（公式確認済み）実数: {a_count if a_count is not None else '（report.json未検出のため不明）'}")
    L(f"うちSWEETS: {sweets_count if sweets_count is not None else '（report.json未検出のため不明）'}")
    L(f"候補不足フォールバック最終判定: {sig.get('candidateFallbackStage') or '（未実行）'}")
    L("")
    L(f"総合ステータス: {out['status']}（success={out['success']}）")
    if out.get("degradedReasons"):
        L("劣化理由（実行は成功・結果が乏しい）:")
        for r in out["degradedReasons"]:
            L(f"  - {r}")
    if out.get("errors"):
        L("フェーズ失敗（実行そのものが失敗）:")
        for e in out["errors"]:
            L(f"  - {e}")
    L("（新規取得件数と前日持ち越し件数の分離集計は未実装——現状は合算のA判定実数のみ。"
      "この点は既知の未反映事項として別途対応予定）")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--log", required=True, help=".devlogs/morning/auto/<date>.jsonl")
    ap.add_argument("--brief", required=True, help=".devlogs/morning/brief/<date>.json")
    ap.add_argument("--report", default=None, help=".devlogs/morning/<date>/report.json（省略時は--logと同じ親から自動推定しない＝明示指定のみ読む）")
    ap.add_argument("--fatal", default=None, help="db起動失敗など、フェーズ実行前の致命的エラー")
    ap.add_argument("--text-out", default=None, help="人間可読サマリ（render_human_summary）の書き出し先パス（省略時は書き出さない）")
    args = ap.parse_args()

    phase_rows = read_jsonl(args.log)
    # フェーズごとに最後の状態（ok/retry/error）と試行回数を集計。
    # 各行のoutput（フェーズが標準出力へ吐いた1行JSON、morning_auto_logline.py
    # が既に抽出済み）は phases dict 自体には含めない（crawlのoutputは実測
    # 1MB超になることがあり、"1画面サマリ"の目的に反する）——2026-09-22追加：
    # 必要な数値だけをこの場で抜き出し、degraded判定にのみ使う。
    phases = {}
    last_output_by_phase = {}
    for r in phase_rows:
        name = r.get("phase")
        if not name:
            continue
        phases[name] = {
            "status": r.get("status"),
            "attempt": r.get("attempt"),
            "maxAttempts": r.get("maxAttempts"),
            "elapsedSec": r.get("elapsedSec"),
        }
        if r.get("output") is not None:
            last_output_by_phase[name] = r.get("output")
    errors = [f"{name}: {v['attempt']}/{v['maxAttempts']}回失敗" for name, v in phases.items() if v["status"] == "error"]

    brief = read_json(args.brief)

    candidates_summary = None
    if brief:
        buckets = brief.get("buckets", [])
        by_bucket = {}
        excluded_reason_counter = Counter()
        for b in buckets:
            key = b.get("bucketKey")
            pick = b.get("pick")
            considered = b.get("considered", [])
            for c in considered:
                reason = (c.get("skipped") or "").split("（")[0].strip()
                if reason:
                    excluded_reason_counter[reason] += 1
            by_bucket[key] = {
                "label": b.get("bucketLabel"),
                "picked": pick is not None,
                "dcId": (pick or {}).get("dcId"),
                "consideredCount": len(considered),
                "reasonIfEmpty": b.get("reasonIfEmpty"),
            }
        sweets = brief.get("sweetsCandidates", {})
        sweets_summary = sweets.get("summary", {})
        for ex in sweets.get("excluded", []):
            reason = (ex.get("reason") or "").split("（")[0].strip()
            if reason:
                excluded_reason_counter[reason] += 1
        candidates_summary = {
            "filledCount": brief.get("filledCount"),
            "byBucket": by_bucket,
            "sweets": {
                "rawSweetsCount": sweets_summary.get("rawSweetsCount"),
                "excludedPublished": sweets_summary.get("excludedPublished"),
                "excludedIncomplete": sweets_summary.get("excludedIncomplete"),
                "excludedFacilityCap": sweets_summary.get("excludedFacilityCap"),
                "shortfall": sweets.get("shortfall"),
                "shortfallReason": sweets.get("shortfallReason"),
            },
            "topExclusionReasons": excluded_reason_counter.most_common(5),
        }

    success = args.fatal is None and not errors and brief is not None

    # --- degraded判定（2026-09-22追加）---------------------------------
    # 「技術的にはエラーが無いが、結果が実質的に空／不足」を検出する。
    # crawl・分類（am_run）・保存（write-facts）自体のエラーは既存の
    # errors（フェーズstatus=error）で捕捉済みのため、ここでは
    # 「フェーズは成功したが中身が空」の3条件だけを見る：
    #   1) 新規取得0件（crawlのarticlesSummary.todayNewOrChangedCount）
    #      ＝DiscoveredContent件数が実質増えていないことの代理指標でもある
    #      （新規/更新0件なら総数も増えない。逆に総数だけを別途before/after
    #      追跡すると二重の仕組みになるため、この1指標に統一する）
    #   2) 本日のA候補0件（report.jsonのcounts.A）
    #   3) 本日のSWEETS候補0件（report.jsonのcandidateBoard.sweets）
    #   4) candidate_fallbackの最終判定がinsufficient_stop
    #      （＝上記1〜3の不足がフォールバック・補完取得を経てもなお解消しなかった）
    degraded_reasons = []

    crawl_output = last_output_by_phase.get("crawl") or {}
    today_new_or_changed = ((crawl_output.get("articlesSummary") or {}).get("todayNewOrChangedCount"))
    if today_new_or_changed is not None and today_new_or_changed == 0:
        degraded_reasons.append("新規取得0件（本日のDiscoveredContent新規/更新が0件。DB件数も実質増えていない）")

    report = read_json(args.report) if args.report else None
    report_counts_a = None
    report_sweets_count = None
    if report:
        rep = report.get("report") or {}
        counts = rep.get("counts") or {}
        report_counts_a = counts.get("A")
        board = rep.get("candidateBoard") or {}
        sweets_list = board.get("sweets")
        if isinstance(sweets_list, list):
            report_sweets_count = len(sweets_list)
        if report_counts_a is not None and report_counts_a == 0:
            degraded_reasons.append("A候補0件（本日のcandidateBoardが空）")
        if report_sweets_count is not None and report_sweets_count == 0:
            degraded_reasons.append("SWEETS候補0件（本日のcandidateBoard.sweetsが空）")

    fallback_output = last_output_by_phase.get("candidate_fallback") or {}
    fallback_stage = (fallback_output.get("plan") or {}).get("stage")
    if fallback_stage == "insufficient_stop":
        degraded_reasons.append("候補不足フォールバック（既存台帳確認・SWEETS限定補完取得）を経てもなお候補不足（insufficient_stop）")

    if not success:
        status = "error"
    elif degraded_reasons:
        status = "degraded"
    else:
        status = "ok"

    out = {
        "date": args.date,
        "status": status,
        "success": success,
        "fatal": args.fatal,
        "phases": phases,
        "errors": errors,
        "degradedReasons": degraded_reasons,
        "signals": {
            "todayNewOrChangedCount": today_new_or_changed,
            "candidateBoardACount": report_counts_a,
            "candidateBoardSweetsCount": report_sweets_count,
            "candidateFallbackStage": fallback_stage,
        },
        "candidates": candidates_summary,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if args.text_out:
        with open(args.text_out, "w", encoding="utf-8") as f:
            f.write(render_human_summary(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
