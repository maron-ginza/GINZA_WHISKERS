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
    ap.add_argument("--fatal", default=None, help="db起動失敗など、フェーズ実行前の致命的エラー")
    args = ap.parse_args()

    phase_rows = read_jsonl(args.log)
    # フェーズごとに最後の状態（ok/retry/error）と試行回数を集計
    phases = {}
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

    out = {
        "date": args.date,
        "success": success,
        "fatal": args.fatal,
        "phases": phases,
        "errors": errors,
        "candidates": candidates_summary,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
