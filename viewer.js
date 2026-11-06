/* The viewer is embedded in the page with its own extension origin and media permission. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const stage = $("stage");
  const parentOrigin = new URLSearchParams(location.search).get("parentOrigin");
  if (parent !== window && /^https:\/\/(?:www\.)?(?:x|twitter)\.com$/.test(parentOrigin || "")) {
    document.body.classList.add("embedded");
    addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        parent.postMessage({type: "x-stitch:close"}, parentOrigin);
      }
    }, true);
  }
  let images = [], order = [], selected = null, fitting = true, payload, rotation = 0;
  const controls = ["save", "layout", "reset", "fit", "actual", "zoom", "rotate-left", "rotate-right", "rotation-reset"];
  function columns() {
    return $("layout").value === "horizontal" ? images.length : $("layout").value === "vertical" ? 1 : 2;
  }

  async function loadImage(url) {
    for (const size of ["orig", "large"]) {
      try {
        const response = await fetch(StitchCore.mediaURL(url, size), {credentials: "omit", redirect: "error", signal: AbortSignal.timeout(25000)});
        if (!response.ok) throw new Error(`图片服务器返回 ${response.status}`);
        if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("图片服务器返回了非图片内容");
        const blob = await response.blob();
        if (blob.size > 32 * 1024 * 1024) throw new Error("单张图片超过 32 MB");
        const bitmap = await createImageBitmap(blob);
        const objectURL = URL.createObjectURL(blob);
        return {bitmap, objectURL, width: bitmap.width, height: bitmap.height, size};
      } catch (error) { if (size === "large") throw error; }
    }
  }

  function setZoom(percent) {
    const value = Math.max(1, Math.min(200, percent));
    canvas.style.width = `${Math.max(1, Math.round(canvas.width * value / 100))}px`;
    canvas.style.height = `${Math.max(1, Math.round(canvas.height * value / 100))}px`;
    $("zoom").value = String(Math.max(10, value));
    $("dimensions").textContent = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} px · ${Math.round(value)}%`;
    canvas.style.cursor = fitting ? "zoom-in" : "zoom-out";
  }
  function fit() {
    fitting = true;
    const css = getComputedStyle(stage);
    const width = stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const height = stage.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    setZoom(Math.min(100, width / canvas.width * 100, height / canvas.height * 100));
  }
  function thumbnails() {
    $("tiles").replaceChildren(...order.map((index, position) => {
      const button = document.createElement("button");
      button.className = selected === position ? "selected" : "";
      button.setAttribute("aria-label", `位置 ${position + 1}，原图 ${index + 1}；点击两张交换`);
      button.setAttribute("aria-pressed", String(selected === position));
      const img = document.createElement("img");
      img.src = images[index].objectURL;
      img.alt = `原图 ${index + 1}`;
      const label = document.createElement("span");
      label.textContent = `${position + 1} · 原图 ${index + 1}`;
      button.append(img, label);
      button.addEventListener("click", () => {
        if (selected === null) selected = position;
        else {
          [order[selected], order[position]] = [order[position], order[selected]];
          selected = null;
          render();
        }
        thumbnails();
      });
      return button;
    }));
  }
  function render() {
    try {
      const sorted = order.map(i => images[i]);
      const result = StitchCore.geometry(sorted, columns());
      canvas.width = rotation % 2 ? result.height : result.width;
      canvas.height = rotation % 2 ? result.width : result.height;
      // Integer quarter-turn matrices preserve pixels without an extra full-size canvas.
      if (rotation === 1) ctx.setTransform(0, 1, -1, 0, result.height, 0);
      else if (rotation === 2) ctx.setTransform(-1, 0, 0, -1, result.width, result.height);
      else if (rotation === 3) ctx.setTransform(0, -1, 1, 0, 0, result.width);
      sorted.forEach((img, i) => ctx.drawImage(img.bitmap, result.cells[i].x, result.cells[i].y));
      ctx.resetTransform();
      $("rotation-angle").textContent = `${rotation * 90}°`;
      $("rotation-reset").disabled = rotation === 0;
      canvas.hidden = false;
      $("status").hidden = true;
      $("save").disabled = false;
      if (fitting) fit(); else setZoom(Number($("zoom").value));
    } catch (error) {
      canvas.hidden = true;
      $("save").disabled = true;
      $("status").hidden = false;
      $("status").textContent = error.message;
    }
  }
  $("layout").addEventListener("change", () => {
    selected = null;
    render(); thumbnails();
  });
  $("reset").addEventListener("click", () => { order = images.map((_, i) => i); selected = null; render(); thumbnails(); });
  $("rotate-left").addEventListener("click", () => { rotation = (rotation + 3) % 4; render(); });
  $("rotate-right").addEventListener("click", () => { rotation = (rotation + 1) % 4; render(); });
  $("rotation-reset").addEventListener("click", () => { rotation = 0; render(); });
  $("fit").addEventListener("click", fit);
  $("actual").addEventListener("click", () => { fitting = false; setZoom(100); });
  $("zoom").addEventListener("input", () => { fitting = false; setZoom(Number($("zoom").value)); });
  canvas.addEventListener("click", () => { if (fitting) { fitting = false; setZoom(100); } else fit(); });
  new ResizeObserver(() => { if (images.length && fitting && !canvas.hidden) fit(); }).observe(stage);
  $("retry").addEventListener("click", () => location.reload());
  $("save").addEventListener("click", () => {
    $("save").disabled = true;
    const filename = `x-${payload.id}-stitched-${columns()}col${rotation ? `-${rotation * 90}deg` : ""}.png`;
    canvas.toBlob(blob => {
      $("save").disabled = false;
      if (!blob) { $("quality").textContent = "导出失败，请切换布局后重试"; return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, "image/png");
  });
  addEventListener("pagehide", event => {
    if (!event.persisted) images.forEach(img => { img.bitmap.close(); URL.revokeObjectURL(img.objectURL); });
  });

  (async () => {
    try {
      payload = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      payload.urls = StitchCore.validateImages(payload.urls);
      payload.id = /^\d{1,30}$/.test(payload.id || "") ? payload.id : "tweet";
      const results = await Promise.allSettled(payload.urls.map(loadImage));
      const failed = results.findIndex(result => result.status === "rejected");
      if (failed !== -1) {
        results.filter(r => r.status === "fulfilled").forEach(r => { r.value.bitmap.close(); URL.revokeObjectURL(r.value.objectURL); });
        throw new Error(`第 ${failed + 1} 张图片加载失败：${results[failed].reason.message}\n请检查网络后点击“重新加载”。`);
      }
      images = results.map(r => r.value);
      order = images.map((_, i) => i);
      controls.forEach(id => $(id).disabled = false);
      const fallback = images.some(img => img.size !== "orig");
      $("quality").textContent = fallback ? "部分原图不可用，已使用 large 尺寸图片" : "已读取原尺寸图片 · 在本机完成拼接";
      if (new Set(images.map(img => `${img.width}x${img.height}`)).size !== 1) {
        $("quality").textContent += " · 切图尺寸不同，按原尺寸对齐，空白处透明";
      }
      thumbnails(); render();
    } catch (error) {
      $("status").textContent = error.message || "无法读取图片信息，请从推文重新打开。";
      $("retry").hidden = false;
      $("dimensions").textContent = "图片尚未加载";
    }
  })();
})();
