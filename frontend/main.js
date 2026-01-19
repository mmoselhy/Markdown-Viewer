const elements = {
  openBtn: document.getElementById("openBtn"),
  content: document.getElementById("content"),
  fileName: document.getElementById("fileName"),
  status: document.getElementById("status"),
  statusPill: document.getElementById("statusPill"),
  statusText: document.getElementById("statusText"),
  searchInput: document.getElementById("searchInput"),
  searchClear: document.getElementById("searchClear"),
  searchCount: document.getElementById("searchCount"),
  themeToggle: document.getElementById("themeToggle"),
  fontSmaller: document.getElementById("fontSmaller"),
  fontLarger: document.getElementById("fontLarger"),
  widthToggle: document.getElementById("widthToggle"),
  dropOverlay: document.getElementById("dropOverlay"),
  copyPath: document.getElementById("copyPath"),
  revealPath: document.getElementById("revealPath"),
};

let currentMarks = [];
let currentIndex = -1;
let currentPath = null;
let currentWidthMode = "comfort";
let currentFontSize = 1;

function getApi() {
  return window.mdreader || null;
}

let markedLoadPromise = null;

function loadMarked() {
  if (window.marked && typeof window.marked.parse === "function") {
    return Promise.resolve(window.marked);
  }
  if (markedLoadPromise) {
    return markedLoadPromise;
  }
  markedLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/marked.min.js";
    script.defer = true;
    script.onload = () => resolve(window.marked);
    script.onerror = () => reject(new Error("Failed to load marked."));
    document.head.appendChild(script);
  });
  return markedLoadPromise;
}

async function parseMarkdown(text) {
  try {
    const marked = await loadMarked();
    if (marked && typeof marked.parse === "function") {
      return marked.parse(text, {
        gfm: true,
        breaks: false,
        mangle: false,
        headerIds: false,
      });
    }
  } catch (_err) {
    // Fall back to plain text when marked fails to load.
  }
  return text;
}

function setStatus(message) {
  setStatusWithLevel(message, "info");
}

function setStatusWithLevel(message, level) {
  elements.statusPill.textContent = level === "error" ? "Error" : level === "loading" ? "Loading" : "Ready";
  elements.statusText.textContent = message || "";
  elements.status.dataset.level = level;
}

function setLoading(isLoading) {
  elements.content.classList.toggle("loading", isLoading);
  if (isLoading) {
    elements.status.dataset.level = "loading";
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "light";
  setTheme(current === "light" ? "dark" : "light");
}

function setFontSize(value) {
  currentFontSize = Math.min(1.6, Math.max(0.8, value));
  document.documentElement.style.setProperty("--reader-scale", String(currentFontSize));
  localStorage.setItem("fontScale", String(currentFontSize));
}

function setWidthMode(mode) {
  const valid = ["narrow", "comfort", "wide"];
  currentWidthMode = valid.includes(mode) ? mode : "comfort";
  document.documentElement.dataset.width = currentWidthMode;
  localStorage.setItem("widthMode", currentWidthMode);
  elements.widthToggle.textContent = currentWidthMode === "narrow" ? "Narrow" : currentWidthMode === "wide" ? "Wide" : "Comfort";
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    setTheme(saved);
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

function initReadingPrefs() {
  const scale = parseFloat(localStorage.getItem("fontScale") || "1");
  if (!Number.isNaN(scale)) {
    setFontSize(scale);
  } else {
    setFontSize(1);
  }
  const widthMode = localStorage.getItem("widthMode") || "comfort";
  setWidthMode(widthMode);
}

function loadFullStyles() {
  const existing = document.querySelector('link[rel="stylesheet"][href="styles.css"]');
  if (existing) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "styles.css";
  link.media = "print";
  link.onload = () => {
    link.media = "all";
  };
  document.head.appendChild(link);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clearHighlights() {
  currentMarks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  currentMarks = [];
  currentIndex = -1;
  updateSearchCount();
}

function highlightMatches(query) {
  clearHighlights();
  if (!query) {
    updateSearchCount();
    return;
  }

  const regex = new RegExp(escapeRegExp(query), "gi");
  const walker = document.createTreeWalker(
    elements.content,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    if (!regex.test(text)) {
      return;
    }
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        fragment.appendChild(document.createTextNode(before));
      }
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = match[0];
      fragment.appendChild(mark);
      currentMarks.push(mark);
      lastIndex = match.index + match[0].length;
    }

    const after = text.slice(lastIndex);
    if (after) {
      fragment.appendChild(document.createTextNode(after));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  });

  if (currentMarks.length) {
    currentIndex = 0;
    focusCurrent();
  }
  updateSearchCount();
}

function focusCurrent() {
  currentMarks.forEach((mark) => mark.classList.remove("is-active"));
  if (currentIndex < 0 || currentIndex >= currentMarks.length) {
    return;
  }
  const current = currentMarks[currentIndex];
  current.classList.add("is-active");
  current.scrollIntoView({ block: "center" });
  updateSearchCount();
}

function nextMatch(direction) {
  if (!currentMarks.length) {
    return;
  }
  const total = currentMarks.length;
  currentIndex = (currentIndex + direction + total) % total;
  focusCurrent();
}

function updateSearchCount() {
  if (!elements.searchCount) {
    return;
  }
  if (!currentMarks.length) {
    elements.searchCount.textContent = "";
    return;
  }
  elements.searchCount.textContent = `${currentIndex + 1} of ${currentMarks.length}`;
}

function setErrorState(message) {
  elements.content.innerHTML = `
    <div class="error">
      <div class="error-title">Couldn't open that file</div>
      <div class="error-sub">${message}</div>
      <div class="error-actions">
        <button id="retryOpen" class="btn">Open another file</button>
      </div>
    </div>
  `;
  const retry = document.getElementById("retryOpen");
  if (retry) {
    retry.addEventListener("click", openDialog);
  }
  setStatusWithLevel(message, "error");
  setFileActionsEnabled(false);
}

function setFileActionsEnabled(enabled) {
  elements.copyPath.disabled = !enabled;
  elements.revealPath.disabled = !enabled;
  elements.copyPath.classList.toggle("is-disabled", !enabled);
  elements.revealPath.classList.toggle("is-disabled", !enabled);
}

async function loadFile(path) {
  const api = getApi();
  if (!api) {
    setErrorState("Electron API not available. Run via Electron.");
    return;
  }
  setLoading(true);
  setStatusWithLevel("Loading file...", "loading");

  try {
    const text = await api.readFile(path);
    const html = await parseMarkdown(text);
    elements.content.innerHTML = `<div class="markdown">${html}</div>`;
    elements.fileName.textContent = path.split(/[/\\]/).pop();
    currentPath = path;
    setFileActionsEnabled(true);
    setStatusWithLevel(`Loaded ${path}`, "info");
  } catch (err) {
    setErrorState(String(err));
  } finally {
    setLoading(false);
  }
}

async function openDialog() {
  const api = getApi();
  if (!api) {
    setErrorState("Electron API not available. Run via Electron.");
    return;
  }
  setStatusWithLevel("Opening...", "loading");
  try {
    const path = await api.openDialog();
    if (path) {
      await loadFile(path);
    } else {
      setStatusWithLevel("Open cancelled.", "info");
    }
  } catch (err) {
    setErrorState(`Open failed: ${String(err)}`);
  }
}

function onDrop(event) {
  event.preventDefault();
  elements.dropOverlay.classList.remove("is-visible");
  const files = event.dataTransfer.files;
  if (!files || !files.length) {
    return;
  }
  const file = files[0];
  const path = file.path || file.webkitRelativePath;
  if (!path) {
    setStatus("Drop from file explorer to open.");
    return;
  }
  loadFile(path);
}

function onDragOver(event) {
  event.preventDefault();
}

function onDragEnter(event) {
  event.preventDefault();
  elements.dropOverlay.classList.add("is-visible");
}

function onDragLeave(event) {
  if (event.target === document || event.target === elements.dropOverlay) {
    elements.dropOverlay.classList.remove("is-visible");
  }
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function onSearchKey(event) {
  if (event.key === "Enter") {
    nextMatch(event.shiftKey ? -1 : 1);
  }
}

function clearSearch() {
  elements.searchInput.value = "";
  clearHighlights();
}

function cycleWidthMode() {
  const order = ["narrow", "comfort", "wide"];
  const index = order.indexOf(currentWidthMode);
  const next = order[(index + 1) % order.length];
  setWidthMode(next);
}

function handleShortcuts(event) {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && event.key.toLowerCase() === "o") {
    event.preventDefault();
    openDialog();
    return;
  }
  if (mod && event.key.toLowerCase() === "f") {
    event.preventDefault();
    elements.searchInput.focus();
    elements.searchInput.select();
    return;
  }
  if (mod && event.key.toLowerCase() === "t") {
    event.preventDefault();
    toggleTheme();
    return;
  }
  if (mod && (event.key === "=" || event.key === "+")) {
    event.preventDefault();
    setFontSize(currentFontSize + 0.1);
    return;
  }
  if (mod && event.key === "-") {
    event.preventDefault();
    setFontSize(currentFontSize - 0.1);
    return;
  }
  if (event.key === "Escape") {
    clearSearch();
  }
}

function init() {
  initTheme();
  initReadingPrefs();
  loadFullStyles();
  if (document.body) {
    window.requestAnimationFrame(() => {
      document.body.classList.add("is-ready");
    });
  }
  elements.openBtn.addEventListener("click", openDialog);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.searchClear.addEventListener("click", clearSearch);
  elements.fontSmaller.addEventListener("click", () => setFontSize(currentFontSize - 0.1));
  elements.fontLarger.addEventListener("click", () => setFontSize(currentFontSize + 0.1));
  elements.widthToggle.addEventListener("click", cycleWidthMode);
  elements.copyPath.addEventListener("click", async () => {
    const api = getApi();
    if (api && currentPath) {
      await api.copyPath(currentPath);
      setStatusWithLevel("Path copied", "info");
    }
  });
  elements.revealPath.addEventListener("click", async () => {
    const api = getApi();
    if (api && currentPath) {
      await api.revealInFolder(currentPath);
    }
  });
  document.addEventListener("drop", onDrop);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("dragenter", onDragEnter);
  document.addEventListener("dragleave", onDragLeave);
  document.addEventListener("keydown", handleShortcuts);
  const attachSearch = () => {
    elements.searchInput.addEventListener(
      "input",
      debounce((event) => highlightMatches(event.target.value.trim()), 200)
    );
    elements.searchInput.addEventListener("keydown", onSearchKey);
  };
  if (window.requestIdleCallback) {
    window.requestIdleCallback(attachSearch, { timeout: 1000 });
  } else {
    setTimeout(attachSearch, 0);
  }

  const api = getApi();
  if (api && api.onOpenFile) {
    api.onOpenFile((path) => {
      if (path) {
        loadFile(path);
      }
    });
  }

  setFileActionsEnabled(false);
  if (!api) {
    setErrorState("Electron API not available. Run via Electron.");
  } else {
    setStatusWithLevel("Ready", "info");
  }
}

document.addEventListener("DOMContentLoaded", init);
