// Service worker is intentionally limited to web push. Course downloads and
// offline navigation are no longer served by the web application.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function notificationOptions(payload) {
  return {
    body: typeof payload.body === "string" ? payload.body : "Новое уведомление",
    icon: typeof payload.icon === "string" ? payload.icon : "/uploads/logo.png",
    badge: typeof payload.badge === "string" ? payload.badge : "/uploads/logo.png",
    tag: typeof payload.tag === "string" ? payload.tag : "default",
    requireInteraction: payload.requireInteraction === true,
    silent: payload.silent === true,
    data: payload,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
  };
}

function parsePushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = typeof payload.title === "string" ? payload.title : "Gafus";

  event.waitUntil(self.registration.showNotification(title, notificationOptions(payload)));
});

function notificationTargetUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin;
  } catch {
    return self.location.origin;
  }
}

async function trackNotificationClick(notificationId) {
  if (typeof notificationId !== "string" || notificationId.length === 0) {
    return;
  }

  try {
    await fetch("/api/track-reengagement-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
  } catch {
    // Opening the notification remains useful when click analytics is unavailable.
  }
}

self.addEventListener("notificationclick", (event) => {
  const payload = event.notification.data || {};
  const targetUrl = notificationTargetUrl(payload.url);
  event.notification.close();

  event.waitUntil(
    (async () => {
      await trackNotificationClick(payload.notificationId);

      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existingWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);

      if (existingWindow && "focus" in existingWindow) {
        await existingWindow.focus();
        if ("navigate" in existingWindow) {
          await existingWindow.navigate(targetUrl);
        }
        return;
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
