document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const emailLink = document.getElementById("contact-email");
  if (emailLink) {
    const user = "ginzashowaromanticclub";
    const domain = "gmail.com";
    const address = `${user}@${domain}`;
    emailLink.href = `mailto:${address}`;
    emailLink.textContent = address;
  }

  initLatestJournal();
  initY400LangToggle();
});

// 「最新のジャーナル」：Project 02（Discover GINZA）が公開する疎結合フィード
// (/ja/latest.json) を読み、published 最新3件を描画する。
// - 母艦は Payload API / DB を直接参照しない。読むのは公開フィードだけ。
// - フィードURLは #latest-list[data-endpoint] から取る（コードに本番URLを固定しない）。
// - data-endpoint が空 / 取得失敗 / タイムアウト / 0件 のときは何もせず、
//   既存の .latest-fallback（note 連載への案内）をそのまま残す。
function initLatestJournal() {
  const list = document.getElementById("latest-list");
  if (!list) return;

  const endpoint = (list.dataset.endpoint || "").trim();
  if (!endpoint) return;

  const fallback = document.querySelector(".latest-fallback");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  fetch(endpoint, { signal: controller.signal, credentials: "omit" })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => {
      const items = normalizeLatestItems(data);
      if (items.length === 0) return;

      renderLatestCards(list, items.slice(0, 3));
      list.hidden = false;
      if (fallback) fallback.hidden = true;
    })
    .catch(() => {
      /* 取得失敗・中断・JSON不正：fallback を維持する（意図的に無視） */
    })
    .finally(() => clearTimeout(timer));
}

// フィードの items から、描画に必要な最小限を検証して取り出す。
// url は http(s) のみ許可（javascript: 等を弾く）。title と url が無い項目は捨てる。
function normalizeLatestItems(data) {
  const raw = data && Array.isArray(data.items) ? data.items : [];
  return raw
    .map((it) => {
      const url = typeof it.url === "string" && /^https?:\/\//i.test(it.url) ? it.url : null;
      const title = typeof it.title === "string" ? it.title.trim() : "";
      if (!url || !title) return null;
      return {
        url,
        title,
        excerpt: typeof it.excerpt === "string" ? it.excerpt.trim() : "",
        pillar: typeof it.pillar === "string" ? it.pillar.trim() : "",
        publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : "",
      };
    })
    .filter(Boolean);
}

function formatLatestDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function renderLatestCards(container, items) {
  container.textContent = "";

  items.forEach((item) => {
    const card = document.createElement("a");
    card.className = "latest-card";
    card.href = item.url;

    const dateText = formatLatestDate(item.publishedAt);
    if (item.pillar || dateText) {
      const meta = document.createElement("p");
      meta.className = "latest-card-meta";
      if (item.pillar) {
        const pillar = document.createElement("span");
        pillar.className = "latest-card-pillar";
        pillar.textContent = item.pillar;
        meta.appendChild(pillar);
      }
      if (dateText) {
        const time = document.createElement("time");
        time.dateTime = item.publishedAt;
        time.textContent = dateText;
        meta.appendChild(time);
      }
      card.appendChild(meta);
    }

    const title = document.createElement("h3");
    title.className = "latest-card-title";
    title.textContent = item.title;
    card.appendChild(title);

    if (item.excerpt) {
      const excerpt = document.createElement("p");
      excerpt.className = "latest-card-excerpt";
      excerpt.textContent = item.excerpt;
      card.appendChild(excerpt);
    }

    container.appendChild(card);
  });
}

// GINZA 400 YEARS（400years.html）のページ共通 日本語／ENGLISH 切り替え。
// #y400-lang-toggle が無いページ（他の全ページ）では即 return するため、
// 既存機能・他ページへの影響はない。
// - 対象はページ上部1か所のトグルのみ（作品ごとの個別トグルは廃止）。
// - data-text-ja / data-text-en を持つ全要素の textContent を一括で切替
//   （見出し・場所表記・説明文・注記・CTA・ヘッダーナビの対象4項目など）。
// - data-html-ja / data-html-en を持つ要素は innerHTML を切替（hero-lead の
//   <br> を保持するため。値はHTML実体参照でエスケープ済みの信頼できる
//   静的文言のみで、ユーザー入力は含まない）。
// - 画像（.y400-media-img）は data-src-ja/en・data-alt-ja/en を1612・1882の
//   2枚とも同時に切り替える。
// - document.documentElement.lang を "ja"/"en" に同期する。
// - 選択言語は localStorage（キー: y400-lang）に保存し、次回訪問時に復元する
//   （保存値が無い、または "en" 以外の場合は既定どおり日本語のまま）。
function initY400LangToggle() {
  const toggle = document.getElementById("y400-lang-toggle");
  if (!toggle) return;

  const STORAGE_KEY = "y400-lang";
  const buttons = toggle.querySelectorAll(".y400-lang-btn");

  function applyLang(lang) {
    document.documentElement.lang = lang;

    document.querySelectorAll("[data-text-ja]").forEach((el) => {
      const text = lang === "en" ? el.dataset.textEn : el.dataset.textJa;
      if (text !== undefined) el.textContent = text;
    });

    document.querySelectorAll("[data-html-ja]").forEach((el) => {
      const html = lang === "en" ? el.dataset.htmlEn : el.dataset.htmlJa;
      if (html !== undefined) el.innerHTML = html;
    });

    document.querySelectorAll(".y400-media-img").forEach((img) => {
      const src = lang === "en" ? img.dataset.srcEn : img.dataset.srcJa;
      if (src) img.src = src;
      const alt = lang === "en" ? img.dataset.altEn : img.dataset.altJa;
      if (alt) img.alt = alt;
    });

    buttons.forEach((b) => {
      const isActive = b.dataset.lang === lang;
      b.classList.toggle("is-active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* プライベートブラウズ等で保存できない場合は無視（表示自体には影響しない） */
    }
  }

  toggle.addEventListener("click", (event) => {
    const btn = event.target.closest(".y400-lang-btn");
    if (!btn || !toggle.contains(btn)) return;
    applyLang(btn.dataset.lang === "en" ? "en" : "ja");
  });

  // フッターの「日本語ページへ／Japanese Site」：常に日本語表示へ戻す
  // 機能ボタン（別URLへは遷移しない）。存在しないページでは何もしない。
  const footerLangBtn = document.getElementById("y400-footer-lang");
  if (footerLangBtn) {
    footerLangBtn.addEventListener("click", () => applyLang("ja"));
  }

  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    /* 読み取り不可時は既定の日本語表示のまま */
  }
  if (stored === "en") applyLang("en");
}
