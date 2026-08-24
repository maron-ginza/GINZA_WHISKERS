#!/usr/bin/env python3
"""./p2 crawl 用の集計結果フォーマッタ。
crawlSources.ts が標準出力した1行JSON（{"crawl": ..., "candidates": ...}）を
標準入力から受け取り、人間向けに整形する。
"""
import sys
import json

log_hint = sys.argv[1] if len(sys.argv) > 1 else ""


def fail(message: str) -> None:
    print(message)
    if log_hint:
        print(f"詳細は {log_hint} を確認してください")
    sys.exit(1)


raw = sys.stdin.read()

try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    fail("巡回結果の解析に失敗しました")

# 2026-08-17より前のcrawlSources.tsは{"crawl":...}でラップせずフラットな
# 巡回結果のみを出力していた。後方互換のため両形式を受け付ける。
data = payload.get("crawl", payload) if isinstance(payload, dict) else payload
candidates = payload.get("candidates") if isinstance(payload, dict) else None
articles_summary = payload.get("articlesSummary") if isinstance(payload, dict) else None

DIFF_LABELS = {
    "unchanged": "変化なし",
    "changed": "変化あり",
    "first_seen": "初回取得",
    "fetch_error": "取得失敗",
}

mode = "実書き込みあり（Snapshot保存・SourceLedger更新）" if data.get("persisted") else "Dry Run（DB書き込みなし）"
print(f"--- SOURCE LEDGER 自動巡回（{mode}） ---")
print(f"  巡回対象（enabled）: {data.get('scannedSources', 0)}件")

summary = data.get("summary", {})
print()
print("--- 差分ステータス集計 ---")
for key in ("first_seen", "changed", "unchanged", "fetch_error"):
    label = DIFF_LABELS.get(key, key)
    print(f"  {label:10s}: {summary.get(key, 0)}")

results = data.get("results", [])
print()
print(f"--- 個別結果: {len(results)}件 ---")
for item in results:
    status = DIFF_LABELS.get(item.get("diffStatus"), item.get("diffStatus"))
    http = item.get("httpStatus")
    http_str = f"HTTP {http}" if http is not None else "HTTP -"
    attempts = item.get("attemptCount")
    attempts_str = f" (試行{attempts}回)" if attempts and attempts > 1 else ""
    line = f"  [{status:6s}] {http_str:9s} {item.get('name')} ({item.get('sourceId')}){attempts_str}"
    print(line)
    if item.get("blockedByRobots"):
        print(f"           -> robots.txtによりスキップ")
    if item.get("errorMessage"):
        print(f"           -> {item['errorMessage']}")

skipped = data.get("skipped", [])
print()
if skipped:
    print(f"--- スキップ（url未設定等）: {len(skipped)}件 ---")
    for item in skipped:
        print(f"  {item.get('name')} ({item.get('sourceId')}): {item.get('reason')}")
else:
    print("スキップ: なし")

if candidates is not None:
    cand_mode = "実書き込みあり" if candidates.get("persisted") else "Dry Run（DB書き込みなし）"
    print()
    print(f"--- Sources候補生成（{cand_mode}） ---")
    print(f"  対象Snapshot（success かつ changed/first_seen）: {candidates.get('scannedSnapshots', 0)}件")
    print(f"  新規生成: {candidates.get('createdCount', 0)}件")
    for item in candidates.get("created", []):
        label = DIFF_LABELS.get(item.get("diffStatus"), item.get("diffStatus"))
        sid = item.get("sourceId")
        sid_str = f"Source #{sid}" if sid is not None else "(dry run)"
        print(f"  [{label:6s}] {item.get('sourceLedgerName')} -> {sid_str}")
    cand_skipped = candidates.get("skipped", [])
    if cand_skipped:
        print(f"  既存候補ありのためスキップ: {len(cand_skipped)}件")

listing_discovery = data.get("listingPageDiscovery")
if listing_discovery is not None:
    print()
    print("--- 一覧ページ発見・追加巡回（Source Coverage拡張、2026-08-17） ---")
    print(f"  対象サイト数: {listing_discovery.get('sitesScanned', 0)}件")
    print(f"  一覧ページを発見できたサイト数: {listing_discovery.get('sitesWithListingPages', 0)}件")
    print(f"  発見した一覧ページ候補数（合計）: {listing_discovery.get('totalDiscovered', 0)}件")
    print(
        f"  一覧ページ実取得: 試行 {listing_discovery.get('totalFetchAttempted', 0)}件 / "
        f"成功 {listing_discovery.get('totalFetchSucceeded', 0)}件"
    )

article_extraction = data.get("articleExtraction")
if article_extraction is not None:
    print()
    print("--- 個別記事・イベント抽出（トップページ更新検知 → 個別URL単位、2026-08-17） ---")
    print(f"  抽出総数（トップページ上の候補リンク走査数）: {article_extraction.get('scanned', 0)}件")
    print(f"  重複除外件数（同一ページ内の表記揺れ・重複リンク）: {article_extraction.get('duplicatesRemoved', 0)}件")
    print(
        f"  初回検知: {article_extraction.get('firstSeen', 0)} / "
        f"更新検知: {article_extraction.get('changed', 0)} / "
        f"変化なし: {article_extraction.get('unchanged', 0)}"
    )
    print(
        f"  個別ページ取得(Stage 2): 試行 {article_extraction.get('stage2Attempted', 0)}件 / "
        f"成功 {article_extraction.get('stage2Succeeded', 0)}件"
    )
    print(f"  公開日取得（今回の巡回で判明分）: {article_extraction.get('publishedDatesFound', 0)}件")
    print(f"  開催期間取得（今回の巡回で判明分）: {article_extraction.get('eventDatesFound', 0)}件")
    if article_extraction.get('errors', 0) > 0:
        print(f"  個別リンク処理エラー（分離済み、サイト全体は継続）: {article_extraction.get('errors', 0)}件")

if articles_summary is not None:
    print()
    print("--- DiscoveredContent 現在の状態（DB全体、今回の巡回結果を反映済み） ---")
    print(f"  ユニーク件数（1URL=1行）: {articles_summary.get('totalUnique', 0)}件")
    print(f"  公開日(publishedAt)取得済み: {articles_summary.get('publishedAtCount', 0)}件")
    print(f"  開催期間(eventStartAt/eventEndAt)取得済み: {articles_summary.get('eventDateCount', 0)}件")
    print(f"  本日新規/更新候補（discoveryStatus first_seen/changed かつ本日検知）: {articles_summary.get('todayNewOrChangedCount', 0)}件")
    by_type = articles_summary.get("byContentType", {})
    if by_type:
        type_str = " / ".join(f"{k}:{v}" for k, v in sorted(by_type.items(), key=lambda x: -x[1]))
        print(f"  contentType内訳: {type_str}")
