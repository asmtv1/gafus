/* GAFUS Refactor: push-only Service Worker. No PWA install, caches, or fetch interception. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function safeUrl(raw) {
  try {
    const url = new URL(typeof raw === "string" ? raw : "/courses", self.location.origin);
    return url.origin === self.location.origin && ["http:", "https:"].includes(url.protocol)
      ? url.href : new URL("/courses", self.location.origin).href;
  } catch { return new URL("/courses", self.location.origin).href; }
}

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
  const title = typeof payload.title === "string" ? payload.title : "Гафус";
  const body = typeof payload.body === "string" ? payload.body : "Новое уведомление";
  const target = safeUrl(payload.data && payload.data.url || payload.url);
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/icons/icon192.png", badge: "/icons/badge-72.png",
    tag: typeof payload.tag === "string" ? payload.tag : "gafus-push",
    data: { url: target },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const windowClient = windows.find(client => {
      try { return new URL(client.url).origin === self.location.origin; }
      catch { return false; }
    });
    if (windowClient) {
      await windowClient.focus();
      if (typeof windowClient.navigate === "function") await windowClient.navigate(target);
    } else if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
