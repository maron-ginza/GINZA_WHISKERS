#!/bin/bash
# GINZA WHISKERS / Project 02 — 朝刊候補レビュー画面 常駐サーバー LaunchAgent を解除する。
# plistファイル自体は残す（再開は scripts/launchd/load-candidate-review.sh）。
# --purge を付けるとplistも削除する。

set -u

LABEL="com.ginzawhiskers.p2-candidate-review"
DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" && echo "✅ 解除完了: gui/$(id -u)/${LABEL}"
else
  echo "ℹ️  ロードされていません（何もしません）"
fi

if [ "${1:-}" = "--purge" ]; then
  if [ -f "$DEST" ]; then
    rm -f "$DEST" && echo "🗑  削除: $DEST"
  fi
fi
