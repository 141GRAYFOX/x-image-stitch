/* Shared validation and pixel geometry. No site scripts or external libraries. */
(() => {
  "use strict";
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
    if (!Array.isArray(urls) || urls.length < 2 || urls.length > 4) throw new Error("需要同一条推文中的 2～4 张图片");
    const normalized = urls.map(url => mediaURL(url));
    if (new Set(normalized).size !== normalized.length) throw new Error("图片重复，无法确定切图顺序");
    return normalized;
  }
  function geometry(images, columns) {
    if (images.length < 2 || images.length > 4 || ![1, 2, images.length].includes(columns)) throw new Error("无效布局");
    const rows = Math.ceil(images.length / columns);
    const widths = Array(columns).fill(0);
    const heights = Array(rows).fill(0);
    images.forEach((img, i) => {
      if (!(img.width > 0 && img.height > 0)) throw new Error("图片尺寸无效");
      widths[i % columns] = Math.max(widths[i % columns], img.width);
      heights[Math.floor(i / columns)] = Math.max(heights[Math.floor(i / columns)], img.height);
    });
    const width = widths.reduce((a, b) => a + b, 0);
    const height = heights.reduce((a, b) => a + b, 0);
    if (width > 30000 || height > 30000 || width * height > 64000000) {
      throw new Error("合成图过大，请切换布局或使用较小的图片（上限 6400 万像素）");
    }
    return {width, height, cells: images.map((img, i) => ({
      x: widths.slice(0, i % columns).reduce((a, b) => a + b, 0),
      y: heights.slice(0, Math.floor(i / columns)).reduce((a, b) => a + b, 0),
      width: img.width, height: img.height
    }))};
  }
  globalThis.StitchCore = Object.freeze({mediaURL, validateImages, geometry});
})();
