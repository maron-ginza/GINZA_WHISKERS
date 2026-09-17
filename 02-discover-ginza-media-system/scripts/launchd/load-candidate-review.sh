#!/bin/bash
# GINZA WHISKERS / Project 02 — 朝刊候補レビュー画面 常駐サーバー LaunchAgent を
# 登録・有効化する。
#
# 【DEPRECATED（2026-09-17・マロン指示：旧Claude API原稿経路の停止）】このサーバーの
# 「承認」ボタンは即時にClaude API（有料）を呼び出す旧経路——通常運用はV1 Stage 4/5
# （`./p2 morning-select`→`./p2 morning-draft-selected`、無料の決定的テンプレート）へ
# 統合済み。誤って習慣的にこのスクリプトを再実行し有料経路を再稼働させないよう、
# 明示フラグ --i-understand-this-enables-paid-api-approve-button を必須にする。
#
# 動作（フラグ指定時）:
#   1. テンプレート（com.ginzawhiskers.p2-candidate-review.plist.template）の
#      __REPO__ を実パスへ置換し ~/Library/LaunchAgents/ へ生成
#   2. launchctl bootstrap で現在のGUIセッションへロード
#   3. ログイン時に自動起動＋KeepAliveで常駐。http://localhost:4600 をブックマークすれば
#      コマンド入力なしで毎朝の候補を承認/保留/却下できる
#
# 解除は scripts/launchd/unload-candidate-review.sh。

set -u

if [ "${1:-}" != "--i-understand-this-enables-paid-api-approve-button" ]; then
  echo "⚠️  このサーバーはDEPRECATEDです（2026-09-17）。「承認」ボタンがClaude API（有料）を"
  echo "    即時に呼び出す旧経路のため、通常運用ではV1 Stage 4/5"
  echo "    （./p2 morning-select → ./p2 morning-draft-selected、無料の決定的テンプレート）を"
  echo "    使ってください。それでもこの常駐サーバーを再稼働させる場合は、次のフラグを付けて"
  echo "    再実行してください："
  echo "      bash $0 --i-understand-this-enables-paid-api-approve-button"
  exit 1
fi

LABEL="com.ginzawhiskers.p2-candidate-review"
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
mkdir -p "$REPO/.devlogs/morning/review"

sed "s|__REPO__|$REPO|g" "$TEMPLATE" > "$DEST"
echo "✅ 配置: $DEST"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  echo "ℹ️  既存のロードを解除しました"
fi

if launchctl bootstrap "gui/$(id -u)" "$DEST"; then
  echo "✅ ロード完了: gui/$(id -u)/${LABEL}"
  echo "   http://localhost:4600 をブックマークしてください（ログイン時に自動起動・常駐）。"
  echo "   状態確認: launchctl print gui/$(id -u)/${LABEL}"
  echo "   解除: scripts/launchd/unload-candidate-review.sh"
else
  echo "❌ launchctl bootstrap に失敗しました。$DEST を確認してください。"
  exit 1
fi
