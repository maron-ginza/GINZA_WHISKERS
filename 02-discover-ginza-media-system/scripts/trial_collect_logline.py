#!/usr/bin/env python3
"""GINZA WHISKERS / Project 02-2 収益化② — 9月Trial 日次収集の1ステップ分をログ化する。

`./p2 interest trial-morning`（scripts/project02 の interest_trial_morning）から
ステップごとに呼ばれる。既存 CLI（interest_fetch_note_* / interest_score）の
標準出力を stdin で受け取り、その中の JSON オブジェクトを1つ取り出して:

  1. <runlog>  へ 1行 JSON（JSONL）を追記   … 取得件数・warning 等の機械可読ログ
  2. <summ_tmp> へ 人間可読の1行を追記        … あとで trial_collect.log にまとめる
  3. warning があれば <warn_tmp> へ追記

を行う。DB・ネットワーク・AI には一切触れない。終了コードは受け取った rc をそのまま返す
（呼び出し側が失敗ステップを集計できるように）。

使い方:
  <step-cmd> 2>&1 | python3 scripts/trial_collect_logline.py \\
      <label> <rc> <ts_iso> <elapsed_sec> <runlog> <summ_tmp> <warn_tmp>
"""
import json
import sys


def extract_json_object(raw: str):
    """混在テキストから最初に完全パースできる JSON オブジェクトを返す。無ければ None。"""
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
            "usage: trial_collect_logline.py <label> <rc> <ts> <elapsed> "
            "<runlog> <summ_tmp> <warn_tmp>\n"
        )
        return 2

    label = sys.argv[1]
    try:
        rc = int(sys.argv[2])
    except ValueError:
        rc = 1
    ts = sys.argv[3]
    try:
        elapsed = int(sys.argv[4])
    except ValueError:
        elapsed = -1
    runlog, summ_tmp, warn_tmp = sys.argv[5], sys.argv[6], sys.argv[7]

    raw = sys.stdin.read()
    obj = extract_json_object(raw)

    rec = {"ts": ts, "step": label, "exitCode": rc, "elapsedSec": elapsed}
    warn_val = None

    if isinstance(obj, dict):
        def count(v):
            return len(v) if isinstance(v, list) else v

        if "fetchedCount" in obj:
            rec["fetchedCount"] = obj["fetchedCount"]
        if "created" in obj:
            rec["createdCount"] = count(obj["created"])
        if "skippedAlreadyCapturedToday" in obj:
            rec["skippedTodayCount"] = count(obj["skippedAlreadyCapturedToday"])
        if "skippedAlreadyCaptured" in obj:
            rec["skippedCount"] = count(obj["skippedAlreadyCaptured"])
        if "skippedDuplicateInBatch" in obj:
            rec["skippedDupInBatchCount"] = count(obj["skippedDuplicateInBatch"])
        if "relatedTagCount" in obj:
            rec["relatedTagCount"] = obj["relatedTagCount"]
        if "rows" in obj:
            rec["rowCount"] = count(obj["rows"])
        if "warning" in obj:
            warn_val = obj["warning"]
            rec["warning"] = warn_val

    # 機械可読ログ（JSONL）
    try:
        with open(runlog, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError as e:
        sys.stderr.write(f"[trial_collect_logline] runlog 書き込み失敗: {e}\n")

    # 人間可読サマリ（1行）
    parts = []
    for k in (
        "fetchedCount",
        "createdCount",
        "skippedTodayCount",
        "skippedCount",
        "rowCount",
    ):
        if k in rec:
            parts.append(f"{k}={rec[k]}")
    status = "OK  " if rc == 0 else "FAIL"
    line = f"  {label:<22} : {status}  {' '.join(parts)}".rstrip()
    if obj is None and rc == 0:
        line += "   (JSON出力なし)"
    if warn_val:
        line += f"   ⚠ warning={warn_val}"
    try:
        with open(summ_tmp, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError as e:
        sys.stderr.write(f"[trial_collect_logline] summ_tmp 書き込み失敗: {e}\n")
    print(line)

    if warn_val:
        try:
            with open(warn_tmp, "a", encoding="utf-8") as f:
                f.write(f"{label}: {warn_val}\n")
        except OSError as e:
            sys.stderr.write(f"[trial_collect_logline] warn_tmp 書き込み失敗: {e}\n")

    return rc


if __name__ == "__main__":
    sys.exit(main())
