importScripts("core.js");

async function postPhotos(id) {
  // X's public embed includes all attachments even when the gallery mounts a subset.
  const token = (Number(id) / 1e15 * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  const endpoint = new URL("https://cdn.syndication.twimg.com/tweet-result");
  endpoint.search = new URLSearchParams({id, token});
  const response = await fetch(endpoint, {credentials: "omit", redirect: "error", signal: AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error("无法读取 X 的完整图片列表");
  const post = await response.json();
  if (post.id_str !== id || !Array.isArray(post.photos)) return [];
  const photos = post.photos.map(photo => {
    const link = new URL(photo.expandedUrl);
    const match = link.pathname.match(/^\/[^/]+\/status\/(\d+)\/photo\/(\d+)\/?$/);
    if (!/^https:\/\/(?:www\.)?(?:x|twitter)\.com$/.test(link.origin) || match?.[1] !== id) {
      throw new Error("图片列表与当前推文不匹配");
    }
    return {index: Number(match[2]), url: StitchCore.mediaURL(photo.url)};
  });
  photos.sort((a, b) => a.index - b.index);
  if (photos.length > StitchCore.MAX_IMAGES || photos.some(({index}, i) =>
    index < 1 || index > StitchCore.MAX_IMAGES || index === photos[i - 1]?.index)) {
    throw new Error("图片列表的数量或顺序无效");
  }
  return photos.map(photo => photo.url);
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!["x-stitch:open", "x-stitch:check"].includes(message?.type)) return;
  (async () => {
    if (!sender.tab || !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//.test(sender.url || "")) {
      throw new Error("请从 X / Twitter 推文打开拼图");
    }
    const id = /^\d{1,30}$/.test(message.id || "") ? message.id : "tweet";
    if (message.type === "x-stitch:check") {
      if (id === "tweet" || new URL(sender.url).pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1] !== id) {
        throw new Error("请从推文详情页读取完整图片列表");
      }
      reply({ok: true, urls: await postPhotos(id)});
      return;
    }
    let urls = message.urls;
    if (id !== "tweet" && (!Array.isArray(urls) || urls.length < StitchCore.MAX_IMAGES)) {
      const full = await postPhotos(id).catch(() => []);
      if (full.length > (urls?.length || 0)) urls = full;
    }
    urls = StitchCore.validateImages(urls);
    const hash = encodeURIComponent(JSON.stringify({urls, id}));
    const url = chrome.runtime.getURL("viewer.html") + "?parentOrigin=" +
      encodeURIComponent(new URL(sender.url).origin) + "#" + hash;
    reply({ok: true, url});
  })().catch(error => reply({ok: false, error: error.message}));
  return true;
});
