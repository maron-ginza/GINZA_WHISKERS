#!/bin/bash
# GINZA WHISKERS / Project 02-2 — 9月Trial 日次収集 LaunchAgent を登録・有効化する。
#
# このスクリプトは「実行したときだけ」launchd へ登録する。リポジトリを clone した
# だけでは何も起きない（設計どおり、既定では未登録）。
#
# 動作:
#   1. テンプレート（scripts/launchd/*.plist.template）の __REPO__ を実パスへ置換し
#      ~/Library/LaunchAgents/com.ginzawhiskers.p2-trial-collect.plist を生成
#   2. launchctl bootstrap で現在のGUIセッションへロード
#   3. 次回 07:00 から毎朝 `./p2 interest trial-morning` が走る
#
# 解除は scripts/launchd/unload.sh。

set -u

LABEL="com.ginzawhiskers.p2-trial-collect"
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
mkdir -p "$REPO/.devlogs/trial"

# __REPO__ を実パスへ置換して配置（| をデリミタにしてパス中の / を避ける）
sed "s|__REPO__|$REPO|g" "$TEMPLATE" > "$DEST"
echo "✅ 配置: $DEST"

# 既にロード済みなら一度 bootout してから入れ直す（冪等）
if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  echo "ℹ️  既存のロードを解除しました"
fi

if launchctl bootstrap "gui/$(id -u)" "$DEST"; then
  echo "✅ ロード完了: gui/$(id -u)/${LABEL}"
  echo "   次回 07:00 から毎朝 './p2 interest trial-morning' が実行されます。"
  echo "   状態確認: launchctl print gui/$(id -u)/${LABEL}"
  echo "   解除:     scripts/launchd/unload.sh"
else
  echo "❌ launchctl bootstrap に失敗しました。$DEST を確認してください。"
  exit 1
fi
