#!/usr/bin/env python3
"""GINZA WHISKERS / Project 02 — 朝刊自動化（morningAutoRun.sh）の1フェーズ分をログ化する。

DB・ネットワーク・AIには一切触れない（標準入力のテキストからJSONを抜き出すだけ）。

使い方:
  <phase-cmd> 2>&1 | python3 scripts/morning_auto_logline.py \
      <phase> <status:ok|retry|error> <attempt> <maxAttempts> <ts_iso> <elapsed_sec> <runlog>
"""
import json
import sys


def extract_json_object(raw: str):
    """混在テキストから最初に完全パースできるJSONオブジェクトを返す。無ければNone。"""
    i = raw.find("{")
    while i != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(raw[i:])
            return obj
        except json.JSONDecodeError:
            i = raw.find("{", i + 1)
    return None


def main() -> int:
    if len(sys.argv) != 8:
        sys.stderr.write(
            "usage: morning_auto_logline.py <phase> <status> <attempt> <maxAttempts> "
            "<ts> <elapsed> <runlog>\n"
        )
        return 2

    phase, status, attempt_s, max_s, ts, elapsed_s, runlog = sys.argv[1:8]
    try:
        attempt = int(attempt_s)
    except ValueError:
        attempt = -1
    try:
        max_attempts = int(max_s)
    except ValueError:
        max_attempts = -1
    try:
        elapsed = int(elapsed_s)
    except ValueError:
        elapsed = -1

    raw = sys.stdin.read()
    obj = extract_json_object(raw)

    rec = {
        "ts": ts,
        "phase": phase,
        "status": status,
        "attempt": attempt,
        "maxAttempts": max_attempts,
        "elapsedSec": elapsed,
    }
    if obj is not None:
        rec["output"] = obj
    if status == "error":
        # 末尾800字だけ保持（ログ肥大化防止・原因調査に十分な量）
        rec["tail"] = raw[-800:]

    with open(runlog, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
