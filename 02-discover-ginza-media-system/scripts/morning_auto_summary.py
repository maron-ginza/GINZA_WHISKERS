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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--log", required=True, help=".devlogs/morning/auto/<date>.jsonl")
    ap.add_argument("--brief", required=True, help=".devlogs/morning/brief/<date>.json")
    ap.add_argument("--report", default=None, help=".devlogs/morning/<date>/report.json（省略時は--logと同じ親から自動推定しない＝明示指定のみ読む）")
    ap.add_argument("--fatal", default=None, help="db起動失敗など、フェーズ実行前の致命的エラー")
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
