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
