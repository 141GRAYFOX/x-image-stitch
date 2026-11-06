(() => {
  "use strict";
  const mounted = new WeakMap();
  const selector = 'article[data-testid="tweet"]';
  let closePreview = null;

  function openPreview(url, trigger) {
    closePreview?.();
    const previousFocus = trigger || document.activeElement?.shadowRoot?.activeElement || document.activeElement;
    const root = document.documentElement;
    const previousOverflow = root.style.getPropertyValue("overflow");
    const previousPriority = root.style.getPropertyPriority("overflow");
    const host = document.createElement("span");
    host.dataset.xStitchOverlay = "";
    const shadow = host.attachShadow({mode: "open"});
    const style = document.createElement("style");
    style.textContent = `:host{all:initial}dialog{position:fixed;inset:0;margin:auto;padding:0;
      width:calc(100vw - 48px);height:calc(100dvh - 48px);max-width:1440px;max-height:none;
      border:1px solid #ffffff30;border-radius:16px;background:#14171d;overflow:hidden;
      box-shadow:0 24px 100px #0009;color:#e9edf3}
      dialog::backdrop{background:#000b;backdrop-filter:blur(4px)}
      iframe{display:block;width:100%;height:100%;border:0}
      button{position:absolute;right:20px;top:26px;z-index:1;width:40px;height:40px;
      border:1px solid #ffffff30;border-radius:10px;background:#20252e;color:#e9edf3;
      font:24px system-ui;cursor:pointer}button:hover{background:#384251}
      button:focus-visible{outline:2px solid #b4f29a;outline-offset:3px}
      @media(max-width:720px){dialog{width:calc(100vw - 16px);height:calc(100dvh - 16px);border-radius:10px}}
      @media(prefers-reduced-motion:reduce){dialog::backdrop{backdrop-filter:none}}`;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "切图合一浮窗");
    const frame = document.createElement("iframe");
    frame.title = "拼接图片预览";
    frame.src = url;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "关闭预览（Esc）";
    closeButton.setAttribute("aria-label", "关闭预览");
    dialog.append(frame, closeButton);
    shadow.append(style, dialog);
    const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
    function onMessage(event) {
      if (event.source === frame.contentWindow && event.origin === extensionOrigin && event.data?.type === "x-stitch:close") close();
    }
    function close() {
      removeEventListener("message", onMessage);
      dialog.close();
      host.remove();
      if (previousOverflow) root.style.setProperty("overflow", previousOverflow, previousPriority);
      else root.style.removeProperty("overflow");
      if (closePreview === close) closePreview = null;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    }
    closePreview = close;
    closeButton.addEventListener("click", close);
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("click", event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom)) close();
    });
    frame.addEventListener("load", () => frame.focus(), {once: true});
    addEventListener("message", onMessage);
    root.style.setProperty("overflow", "hidden", "important");
    document.body.append(host);
    try { dialog.showModal(); } catch (error) { close(); throw error; }
  }

  function collect(article) {
    // A quote belongs to a different status ID even when it shares the outer article.
    const status = article.querySelector("time")?.closest("a[href]")?.href;
    const id = status?.match(/\/status\/(\d+)/)?.[1];
    if (!id) return null;
    const photos = new Map();
    for (const a of article.querySelectorAll('a[href*="/photo/"]')) {
      const match = a.href.match(/\/status\/(\d+)\/photo\/([1-4])(?:[/?#]|$)/);
      if (!match || match[1] !== id || a.closest(selector) !== article) continue;
      const index = Number(match[2]);
      if (!photos.has(index)) photos.set(index, null);
      const img = a.querySelector('img[src*="pbs.twimg.com/media/"]');
      if (!img) continue;
      try { photos.set(index, StitchCore.mediaURL(img.currentSrc || img.src)); }
      catch { /* Ignore avatars, videos and unsupported media. */ }
    }
    if (photos.size < 2 || photos.size > 4) return null;
    try { return {id, urls: StitchCore.validateImages(Array.from({length: photos.size}, (_, i) => photos.get(i + 1)))}; }
    catch { return null; }
  }

  function update(article) {
    const data = collect(article);
    const current = mounted.get(article);
    if (!data) { current?.host.remove(); mounted.delete(article); return; }
    if (current?.host.isConnected) return;
    const host = document.createElement("span");
    host.dataset.xStitchButton = "";
    const shadow = host.attachShadow({mode: "open"});
    const style = document.createElement("style");
    style.textContent = `:host{display:block;margin:10px 0;font:13px system-ui}
      button{display:flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid #53647177;
      border-radius:999px;background:transparent;color:#1d9bf0;font:600 13px system-ui;cursor:pointer}
      button:hover{background:#1d9bf018}button:focus-visible{outline:2px solid #1d9bf0;outline-offset:3px}
      button:disabled{opacity:.6;cursor:wait}.mark{letter-spacing:-3px;font-size:19px;padding-right:3px}
      small{display:block;color:#e45858;margin-top:6px}`;
    const button = document.createElement("button");
    button.type = "button";
    button.title = "将横向切图无缝拼成一张，支持调整排列顺序";
    const icon = document.createElement("span");
    icon.className = "mark";
    icon.textContent = "▦";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon, document.createTextNode("拼成单图"));
    const error = document.createElement("small");
    error.setAttribute("role", "status");
    error.hidden = true;
    shadow.append(style, button, error);
    mounted.set(article, {host});
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      error.hidden = true;
      try {
        const latest = collect(article);
        if (!latest) throw new Error("推文内容已变化，请刷新后重试");
        const response = await chrome.runtime.sendMessage({type: "x-stitch:open", ...latest});
        if (!response?.ok) throw new Error(response?.error || "无法打开预览");
        openPreview(response.url, button);
      } catch (e) {
        error.textContent = e.message.includes("Extension context invalidated") ? "扩展已更新，请刷新此网页后重试" : e.message;
        error.hidden = false;
      } finally { button.disabled = false; }
    });
    const group = article.querySelector('[role="group"]');
    if (group?.parentElement) group.before(host);
    else article.append(host);
  }

  // Only rescan affected tweets; ignore our own shadow DOM and insertion mutations.
  const pending = new Set();
  let timer;
  function enqueue(node) {
    if (!(node instanceof Element) || node.closest("[data-x-stitch-button], [data-x-stitch-overlay]")) return;
    const parent = node.closest(selector);
    if (parent) pending.add(parent);
    node.querySelectorAll(selector).forEach(article => pending.add(article));
    if (!timer && pending.size) timer = setTimeout(() => {
      timer = null;
      const articles = [...pending];
      pending.clear();
      articles.filter(a => a.isConnected).forEach(update);
    }, 120);
  }
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") enqueue(record.target);
      else {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length && nodes.every(n => n instanceof Element && n.matches("[data-x-stitch-button], [data-x-stitch-overlay]"))) continue;
        enqueue(record.target);
        record.addedNodes.forEach(enqueue);
      }
    }
  }).observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ["src", "href"]});
  enqueue(document.body);
})();
