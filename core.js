/* Shared validation and pixel geometry. No site scripts or external libraries. */
(() => {
  "use strict";
  const MAX_IMAGES = 20;
  // Measured on Chromium / Edge 157: above these limits canvas.width/height keep
  // the requested value but drawing silently fails (fully transparent pixels).
  const MAX_DIMENSION = 65535;
  const MAX_PIXELS = 268435456; // 2^28
  const WARN_PIXELS = 160000000;
  function mediaURL(input, size = "orig") {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || url.port ||
        url.username || url.password || !/^\/media\/[\w-]+(?:\.(?:jpg|jpeg|png|webp))?$/.test(url.pathname)) {
      throw new Error("仅支持 X 图片服务器上的静态图片");
    }
    const extension = url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)?.[1];
    const format = extension || url.searchParams.get("format") || "jpg";
    if (!/^(jpg|jpeg|png|webp)$/.test(format)) throw new Error("不支持的图片格式");
    url.pathname = url.pathname.replace(/\.(jpg|jpeg|png|webp)$/i, "");
    url.search = new URLSearchParams({format, name: size}).toString();
    url.hash = "";
    return url.href;
  }
  function validateImages(urls) {
    if (!Array.isArray(urls) || urls.length < 2 || urls.length > MAX_IMAGES) throw new Error(`需要同一条推文中的 2～${MAX_IMAGES} 张图片`);
    const normalized = urls.map(url => mediaURL(url));
    if (new Set(normalized).size !== normalized.length) throw new Error("图片重复，无法确定切图顺序");
    return normalized;
  }
  function geometry(images, columns, uniform = false) {
    if (images.length < 2 || images.length > MAX_IMAGES || ![1, 2, images.length].includes(columns)) throw new Error("无效布局");
    images.forEach(img => {
      if (!(img.width > 0 && img.height > 0)) throw new Error("图片尺寸无效");
    });
    if (uniform && columns !== images.length) throw new Error("等高模式只支持单行横拼");

    let width, height, cells;
    if (uniform) {
      // Equal-height strip: scale every image (keeping its aspect ratio) to the
      // tallest image's height, then lay them out left to right with no gaps.
      const base = Math.max(...images.map(img => img.height));
      const widths = images.map(img => Math.round(img.width * base / img.height));
      let x = 0;
      cells = images.map((img, i) => {
        const cell = {x, y: 0, width: widths[i], height: base};
        x += widths[i];
        return cell;
      });
      width = x;
      height = base;
    } else {
      const rows = Math.ceil(images.length / columns);
      const widths = Array(columns).fill(0);
      const heights = Array(rows).fill(0);
      images.forEach((img, i) => {
        widths[i % columns] = Math.max(widths[i % columns], img.width);
        heights[Math.floor(i / columns)] = Math.max(heights[Math.floor(i / columns)], img.height);
      });
      width = widths.reduce((a, b) => a + b, 0);
      height = heights.reduce((a, b) => a + b, 0);
      cells = images.map((img, i) => ({
        x: widths.slice(0, i % columns).reduce((a, b) => a + b, 0),
        y: heights.slice(0, Math.floor(i / columns)).reduce((a, b) => a + b, 0),
        width: img.width, height: img.height
      }));
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error("合成图单边超过 65,535 像素，请改用两列或竖向布局");
    }
    if (width * height > MAX_PIXELS) {
      throw new Error("合成图超过 2.68 亿像素，请切换布局或使用较小的图片");
    }
    return {width, height, cells};
  }
  globalThis.StitchCore = Object.freeze({MAX_IMAGES, MAX_DIMENSION, MAX_PIXELS, WARN_PIXELS, mediaURL, validateImages, geometry});
})();
