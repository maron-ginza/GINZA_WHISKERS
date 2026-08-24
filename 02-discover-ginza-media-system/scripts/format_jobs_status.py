#!/usr/bin/env python3
"""./p2 jobs 用の集計結果フォーマッタ。
jobsStatus.ts が標準出力した1行JSONを標準入力から受け取り、人間向けに整形する。
"""
import sys
import json
from datetime import datetime, timedelta, timezone

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""

JST = timezone(timedelta(hours=9))


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


raw = sys.stdin.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    fail("Jobs Queue状態の解析に失敗しました")

print("--- SOURCE LEDGER 定期実行（Payload Jobs Queue） ---")
print(f"  queue: {data.get('queue', '-')}")

next_scheduled = data.get("nextScheduled")
if next_scheduled:
    print(f"  次回実行予定: {to_jst(next_scheduled.get('waitUntil'))} (job #{next_scheduled.get('jobId')})")
else:
    print("  次回実行予定: なし（handleSchedulesが未実行、またはCMSサーバーがcron初期化前）")

print(f"  累計完了回数: {data.get('totalCompletedRuns', 0)}")

last_success = data.get("lastSuccessfulRun")
print()
if last_success:
    output = last_success.get("output") or {}
    print(f"--- 直近の成功実行: {to_jst(last_success.get('completedAt'))} (job #{last_success.get('jobId')}) ---")
    print(f"  巡回対象: {output.get('scannedSources', '-')}件")
    print(
        f"  変化あり: {output.get('changedCount', '-')} / "
        f"初回取得: {output.get('firstSeenCount', '-')} / "
        f"変化なし: {output.get('unchangedCount', '-')} / "
        f"取得失敗: {output.get('fetchErrorCount', '-')}"
    )
    print(f"  Sources候補新規生成: {output.get('candidatesCreated', '-')}件")
else:
    print("直近の成功実行: なし（まだ一度も自動実行されていません）")

recent = data.get("recentRuns", [])
failures = [r for r in recent if r.get("hasError")]
print()
if failures:
    print(f"--- 直近の失敗実行: {len(failures)}件（要確認） ---")
    for f in failures:
        print(f"  job #{f.get('jobId')} ({to_jst(f.get('completedAt'))}): {f.get('error')}")
else:
    print("直近の失敗実行: なし")
