importScripts("core.js");
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "x-stitch:open") return;
  (async () => {
    if (!sender.tab || !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//.test(sender.url || "")) {
      throw new Error("请从 X / Twitter 推文打开拼图");
    }
    const urls = StitchCore.validateImages(message.urls);
    const id = /^\d{1,30}$/.test(message.id || "") ? message.id : "tweet";
    const hash = encodeURIComponent(JSON.stringify({urls, id}));
    const url = chrome.runtime.getURL("viewer.html") + "?parentOrigin=" +
      encodeURIComponent(new URL(sender.url).origin) + "#" + hash;
    reply({ok: true, url});
  })().catch(error => reply({ok: false, error: error.message}));
  return true;
});
