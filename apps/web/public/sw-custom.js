// Кастомная логика кеширования для критических файлов
const CACHE_VERSION = 'v1.0.0';
const CRITICAL_CACHE = `critical-files-${CACHE_VERSION}`;
const STATIC_CACHE = `static-resources-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  console.warn('Service Worker: Установка...');
  event.waitUntil(
    caches.open(CRITICAL_CACHE).then((cache) => {
      // Кешируем только критически важные файлы
      return cache.addAll([
        '/~offline',
        '/icons/icon192.png',
        '/icons/badge-72.png'
      ]);
    }).catch((error) => {
      console.log('Service Worker: Ошибка кеширования критических файлов:', error);
    })
  );
});

// Очистка старых кешей при активации
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Активация...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CRITICAL_CACHE && cacheName !== STATIC_CACHE) {
            console.log('Service Worker: Удаление старого кеша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Обработка ошибок кеширования
// Не перехватываем fetch — оставляем стратегию Workbox из next-pwa
// Если нужен офлайн фолбек для навигаций, он настроен в next.config.ts через fallback.document

self.addEventListener("push", (event) => {
  
  let payload = {};
  try {
    if (event.data) {
      try {
        payload = event.data.json();
      } catch (e) {
        payload = { body: event.data.text() };
      }
    }
  } catch (e) {
  }

  const title = payload.title || "Гафус";
  const body = payload.body || "Новое уведомление";
  const icon = payload.icon || "/icons/icon192.png";
  const badge = payload.badge || "/icons/badge-72.png";
  const tag = payload.tag || "gafus";
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge, tag, data, requireInteraction: false,
    }).then(() => {
    }).catch((error) => {
      console.error("❌ Ошибка показа уведомления:", error);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    (async () => {
      const url = new URL(targetUrl, self.location.origin).href;
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })(),
  );
});



