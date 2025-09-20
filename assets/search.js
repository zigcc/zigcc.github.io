import Fuse from "/libs/fuse.min.js";

const DEFAULT_FEEDS = [
  { url: "/learn/index.xml", module: "学习" },
  { url: "/monthly/index.xml", module: "月刊" },
  { url: "/post/index.xml", module: "文章" },
];

class Search {
  constructor({ feeds = DEFAULT_FEEDS } = {}) {
    this.feeds = feeds;
    this.fuse = null;

    this.dom = {
      modal: document.getElementById("search-modal"),
      input: document.getElementById("search-input"),
      results: document.getElementById("search-results"),
      btn: document.getElementById("search-btn"),
      closeBtn: document.getElementById("search-close"),
      overlay: document.getElementById("search-overlay"),
    };

    this._debouncedSearch = this.debounce((q) => this.performSearch(q), 300);
  }

  // ---- utilities ----
  static stripHtml(s) {
    return s ? s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  }

  static escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  debounce(fn, wait = 300) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }

  // ---- feed / fuse ----
  async fetchFeed(feed) {
    try {
      const res = await fetch(feed.url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`无法获取 Feed: ${feed.url} (HTTP ${res.status})`);
      }
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, "application/xml");
      const items = Array.from(doc.querySelectorAll("item"));
      return items.map((item) => ({
        title: Search.stripHtml(item.querySelector("title")?.textContent || ""),
        description: Search.stripHtml(item.querySelector("description")?.textContent || ""),
        url: Search.stripHtml(item.querySelector("link")?.textContent || ""),
        module: feed.module,
      }));
    } catch (e) {
      // 向上抛出错误，供上层提示使用
      throw new Error(e?.message ? e.message : `无法获取 Feed: ${feed.url}`);
    }
  }

  async initSearch() {
    if (this.fuse) return this.fuse;
    const all = await Promise.all(this.feeds.map((f) => this.fetchFeed(f)));
    const index = all.flat();
    this.fuse = new Fuse(index, { keys: ["title", "description"], threshold: 0.1, ignoreLocation: true, shouldSort: true });
    return this.fuse;
  }

  // ---- rendering / highlighting ----
  getOptimalDescription(description, query) {
      const regex = new RegExp(Search.escapeRegExp(q), 'i');
      const idx = (description || '').search(regex);

      return this.highlightText(description.slice(Math.max(description.lastIndexOf("\n", idx) + 1, Math.max(0, idx - 100)), Math.min(idx + 100, description.indexOf("\n", idx))), q);
  }

  highlightText(text, query) {
    if (!query || !text) return text;
    try {
      const regex = new RegExp(Search.escapeRegExp(query), "gi");
      return text.replace(regex, (m) => `<span class="search-highlight">${m}</span>`);
    } catch (e) {
      return text;
    }
  }

  renderResults(results = [], query = "") {
    const container = this.dom.results;
    if (!container) return;
    if (!results?.length) {
      container.innerHTML = "<p>没有找到结果</p>";
      return;
    }

    container.innerHTML = results.slice(0, 20).map((res) => {
      const item = res.item || res;
      return `
        <div class="search-item">
          <a href="${item.url}${query ? '#search=' + encodeURIComponent(query) : ''}">
            <h4>${this.highlightText(item.title, query)}</h4>
            <p>${this.getOptimalDescription(item.description, query)}</p>
          </a>
          <span class="label">${item.module}</span>
        </div>
      `;
    }).join("");
  }

  // ---- modal controls ----
  async open() {
    try {
      await this.initSearch();
      if (this.dom.modal) this.dom.modal.hidden = false;
      this.dom.input?.focus();
    } catch (e) {
      if (this.dom.modal) this.dom.modal.hidden = false;
      if (this.dom.results) this.dom.results.innerHTML = `<p>无法获取 Feed：${e.message}</p>`;
      this.dom.input?.focus();
    }
  }

  close() {
    if (this.dom.modal) this.dom.modal.hidden = true;
    if (this.dom.results) this.dom.results.innerHTML = "";
    history.replaceState(null, "", location.pathname + location.search);
  }

  // ---- search action ----
  async performSearch(query) {
    if (!query) {
      this.renderResults([]);
      return;
    }
    try {
      await this.initSearch();
      const results = this.fuse.search(query);
      this.renderResults(results, query);
    } catch (e) {
      if (this.dom.results) this.dom.results.innerHTML = `<p>无法获取 Feed：${e.message}</p>`;
      console.error(e);
    }
  }

  // ---- DOM text highlighting on page ----
  clearHighlights(container) {
    if (!container) return;
    const highlights = container.querySelectorAll('.search-highlight');
    highlights.forEach((span) => {
      const textNode = document.createTextNode(span.textContent);
      span.parentNode.replaceChild(textNode, span);
    });
  }

  domHighlight(container, query) {
    if (!container || !query) return;
    this.clearHighlights(container);
    const regex = new RegExp(Search.escapeRegExp(query), 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const forbidden = ['SCRIPT', 'STYLE'];
        if (forbidden.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    nodes.forEach((textNode) => {
      const text = textNode.nodeValue;
      regex.lastIndex = 0;
      let match;
      let lastIndex = 0;
      const frag = document.createDocumentFragment();
      let found = false;

      while ((match = regex.exec(text)) !== null) {
        found = true;
        const before = text.slice(lastIndex, match.index);
        if (before) frag.appendChild(document.createTextNode(before));
        const span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = match[0];
        frag.appendChild(span);
        lastIndex = match.index + match[0].length;
      }

      if (!found) return;
      const after = text.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  highlightPageContent() {
    if (!location.hash?.startsWith("#search=")) return;
    const query = decodeURIComponent(location.hash.slice(8));
    if (!query) return;
    const article = document.querySelector("article");
    if (article) {
      this.domHighlight(article, query);
      document.querySelector(".search-highlight")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // ---- event bindings ----
  attachHandlers() {
    this.dom.btn?.addEventListener("click", () => this.open());
    this.dom.closeBtn?.addEventListener("click", () => this.close());
    this.dom.overlay?.addEventListener("click", () => this.close());

    if (this.dom.input) {
      this.dom.input.addEventListener("input", (e) => this._debouncedSearch(e.target.value.trim()));
      this.dom.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const first = document.querySelector("#search-results .search-item a");
          first?.click();
          if (location.pathname == first?.pathname) {
            location.reload();
          }
        }
      });
    }

    this.dom.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "s" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const inputs = ["INPUT", "TEXTAREA", "SELECT"];
        if (!inputs.includes(active?.tagName)) {
          e.preventDefault();
          this.open();
        }
      }
    });

    this.dom.results.addEventListener("click", () => {
      const active = document.activeElement;
      if (location.pathname == active.pathname) {
        active.click();
        location.reload();
      }
    });
  }
}

// 实例化并导出兼容旧接口
const searchInstance = new Search({ feeds: DEFAULT_FEEDS });

window.addEventListener("DOMContentLoaded", () => {
  searchInstance.attachHandlers();
  searchInstance.highlightPageContent();
});
