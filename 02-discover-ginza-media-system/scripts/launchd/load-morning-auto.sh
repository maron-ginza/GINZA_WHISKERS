#!/bin/bash
# GINZA WHISKERS / Project 02 — 朝刊自動化 LaunchAgent を登録・有効化する。
#
# このスクリプトは「実行したときだけ」launchdへ登録する。リポジトリをcloneした
# だけでは何も起きない（設計どおり、既定では未登録）。
#
# 動作:
#   1. テンプレート（com.ginzawhiskers.p2-morning-auto.plist.template）の
#      __REPO__ を実パスへ置換し ~/Library/LaunchAgents/ へ生成
#   2. launchctl bootstrap で現在のGUIセッションへロード
#   3. 次回06:00から毎朝、朝刊自動化（crawl→sweets-detail-fetch→am-run→morning-brief）が走る
#
# 解除は scripts/launchd/unload-morning-auto.sh。
# 確実な06:00実行にはMacがスリープから復帰している必要がある。復帰を保証するには
# マロンが別途 `sudo pmset repeat wakeorpoweron MTWRFSU 05:55:00` を実行すること
# （OS電源設定の変更のためこのスクリプトには含めていない）。

set -u

LABEL="com.ginzawhiskers.p2-morning-auto"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$SCRIPT_DIR/${LABEL}.plist.template"
DEST_DIR="$HOME/Library/LaunchAgents"
DEST="$DEST_DIR/${LABEL}.plist"

if [ ! -f "$TEMPLATE" ]; then
  echo "❌ テンプレートが見つかりません: $TEMPLATE"
  exit 1
fi

mkdir -p "$DEST_DIR"
mkdir -p "$REPO/.devlogs/morning/auto"

sed "s|__REPO__|$REPO|g" "$TEMPLATE" > "$DEST"
echo "✅ 配置: $DEST"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  echo "ℹ️  既存のロードを解除しました"
fi

if launchctl bootstrap "gui/$(id -u)" "$DEST"; then
  echo "✅ ロード完了: gui/$(id -u)/${LABEL}"
  echo "   次回 06:00 から毎朝、朝刊自動化が実行されます。"
  echo "   状態確認: launchctl print gui/$(id -u)/${LABEL}"
  echo "   今すぐ1回試すには: ./p2 morning-auto"
  echo "   解除: scripts/launchd/unload-morning-auto.sh"
else
  echo "❌ launchctl bootstrap に失敗しました。$DEST を確認してください。"
  exit 1
fi
