#!/bin/bash
# GINZA WHISKERS / Project 02 — 朝刊自動化オーケストレーター（2026-09-12）。
#
# マロンが毎朝 `./p2 morning-brief` を手入力する運用をやめ、以下を毎朝6:00に
# launchd から無人実行する（scripts/launchd/com.ginzawhiskers.p2-morning-auto.plist.template）。
#
#   ① Docker/PostgreSQL 起動確認（既存 wait_docker/start_db と同じ方式・自動再試行込み）
#   ② ./p2 crawl              … 公式情報源の巡回＋一覧ページ発見＋個別ページ取得
#   ③ ./p2 sweets-detail-fetch … crawl共有予算切れで未取得のまま残った候補の追加取得
#   ③.5 ./p2 matsuya-sweets-fetch … 松屋銀座（JSレンダリングが必要なSPA、2026-09-14新設）
#        の週替わりGINZAスイート催事を取得。Chromeが無い環境では自動スキップ（失敗にしない）。
#   ④ ./p2 am-run --fetch --register-facts --write-facts
#        … 公開済み重複除外・ArticleFacts抽出・登録（enrichmentStatus:draftのみ、
#          ready化は引き続き人間が行う）
#   ⑤ ./p2 morning-brief --json … ①ビューティー②グルメ・スイーツ③文化・アート
#        各1件の候補選定＋レポート生成（.devlogs/morning/brief/<date>.{txt,json}）
#
# 新しいパイプラインロジックは実装していない——既存の、個別にテスト済みの
# ./p2 サブコマンドをこの順で自動的に呼ぶだけ（item 1「既存の実行基盤を確認し、
# 最適な既存方式で」を最も安全に満たす設計）。
#
# 各フェーズは失敗時に間隔を空けて自動再試行する（既定3回・180秒間隔）。
# Docker/PostgreSQL起動そのものが失敗した場合は、以降のフェーズが全滅すると
# わかっているため早期に打ち切り、エラーとして記録する（無駄な待機を避ける）。
# 個々のURL取得の再試行は既存の crawler/fetchArticlePage.ts 側の仕組み
# （SSRF防止込みのタイムアウト・ロボット規約遵守）がそのまま効く——このスクリプトは
# フェーズ（コマンド）単位の再試行だけを追加する。
#
# 実行ログ（監視用）: .devlogs/morning/auto/<date>.jsonl（フェーズごとの1行JSON）
#                     .devlogs/morning/auto/<date>-summary.json（最終サマリ）
#
# 記事生成・承認・note転記・外部公開はこのスクリプトでは一切行わない
# （それらは candidateReviewServer.ts が「マロンの承認クリック」をトリガーに行う、
# 別の常駐プロセス。詳細は scripts/launchd/com.ginzawhiskers.p2-candidate-review.plist.template）。

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_CONTAINER="cms-postgres-1"
DATE="$(TZ=Asia/Tokyo date '+%Y-%m-%d')"
LOG_DIR="$ROOT/.devlogs/morning/auto"
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/${DATE}.jsonl"
SUMMARY_JSON="$LOG_DIR/${DATE}-summary.json"
PY="$SCRIPT_DIR/morning_auto_logline.py"
PY_SUMMARY="$SCRIPT_DIR/morning_auto_summary.py"

now_iso() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log_phase() {
  # $1=phase $2=status(ok|retry|error) $3=attempt $4=maxAttempts $5=elapsed $6=outfile
  python3 "$PY" "$1" "$2" "$3" "$4" "$(now_iso)" "$5" "$RUN_LOG" < "$6"
}

wait_and_start_db() {
  # 既存 wait_docker（scripts/project02）と同じ方式：Docker Desktop自動起動＋最大120秒待機。
  if ! docker info >/dev/null 2>&1; then
    open -a Docker >/dev/null 2>&1 || true
    for _ in $(seq 1 60); do
      docker info >/dev/null 2>&1 && break
      sleep 2
    done
  fi
  docker info >/dev/null 2>&1 || return 1
  docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || return 1
  if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" != "true" ]; then
    docker start "$DB_CONTAINER" >/dev/null 2>&1 || return 1
  fi
  return 0
}

# $1=phase名（ログ用） $2以降=実行コマンド。既定3回・180秒間隔で再試行。
run_phase() {
  local name="$1"; shift
  local max_attempts="${MORNING_AUTO_MAX_ATTEMPTS:-3}"
  local delay="${MORNING_AUTO_RETRY_DELAY_SEC:-180}"
  local attempt=1
  local out_file
  out_file="$(mktemp)"
  while [ "$attempt" -le "$max_attempts" ]; do
    local start_ts elapsed
    start_ts=$(date +%s)
    "$@" > "$out_file" 2>&1
    local rc=$?
    elapsed=$(( $(date +%s) - start_ts ))
    cp "$out_file" "$LOG_DIR/${DATE}-${name}.attempt${attempt}.log"
    if [ "$rc" -eq 0 ]; then
      log_phase "$name" "ok" "$attempt" "$max_attempts" "$elapsed" "$out_file"
      rm -f "$out_file"
      return 0
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      log_phase "$name" "retry" "$attempt" "$max_attempts" "$elapsed" "$out_file"
      sleep "$delay"
    else
      log_phase "$name" "error" "$attempt" "$max_attempts" "$elapsed" "$out_file"
    fi
    attempt=$((attempt + 1))
  done
  rm -f "$out_file"
  return 1
}

echo "=== GINZA WHISKERS / Project 02 朝刊自動化（morning-auto） $DATE 開始 ==="

cd "$ROOT" || exit 1

DB_TMP="$(mktemp)"
DB_START_ATTEMPT=1
DB_OK=0
while [ "$DB_START_ATTEMPT" -le 3 ]; do
  start_ts=$(date +%s)
  if wait_and_start_db > "$DB_TMP" 2>&1; then
    elapsed=$(( $(date +%s) - start_ts ))
    log_phase "db" "ok" "$DB_START_ATTEMPT" 3 "$elapsed" "$DB_TMP"
    DB_OK=1
    break
  fi
  elapsed=$(( $(date +%s) - start_ts ))
  if [ "$DB_START_ATTEMPT" -lt 3 ]; then
    log_phase "db" "retry" "$DB_START_ATTEMPT" 3 "$elapsed" "$DB_TMP"
    sleep 120
  else
    log_phase "db" "error" "$DB_START_ATTEMPT" 3 "$elapsed" "$DB_TMP"
  fi
  DB_START_ATTEMPT=$((DB_START_ATTEMPT + 1))
done
rm -f "$DB_TMP"

if [ "$DB_OK" -ne 1 ]; then
  echo "❌ PostgreSQL/Docker が起動できませんでした。後続フェーズは実行せず終了します。"
  python3 "$PY_SUMMARY" --date "$DATE" --log "$RUN_LOG" --brief "$ROOT/.devlogs/morning/brief/${DATE}.json" --fatal "db起動失敗" > "$SUMMARY_JSON"
  cat "$SUMMARY_JSON"
  exit 1
fi

# ①〜④は個別に失敗しても後続フェーズを試す（1件失敗で全体を止めない、既存方針を踏襲）。
run_phase "crawl" ./p2 crawl
run_phase "sweets_detail_fetch" ./p2 sweets-detail-fetch
run_phase "matsuya_sweets_fetch" ./p2 matsuya-sweets-fetch
run_phase "mitsukoshi_health_check" ./p2 mitsukoshi-health-check
run_phase "am_run" ./p2 am-run --fetch --register-facts --write-facts
run_phase "morning_brief" ./p2 morning-brief --json

python3 "$PY_SUMMARY" --date "$DATE" --log "$RUN_LOG" --brief "$ROOT/.devlogs/morning/brief/${DATE}.json" > "$SUMMARY_JSON"
echo "=== morning-auto $DATE 完了。サマリ: $SUMMARY_JSON ==="
cat "$SUMMARY_JSON"
