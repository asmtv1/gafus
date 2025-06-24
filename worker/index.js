// 1) Подключаем Workbox из CDN (если не собираете через bundler)
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Проверяем, что Workbox загрузился
if (workbox) {
  console.log('✅ Workbox is loaded');
} else {
  console.error('❌ Workbox failed to load');
}

// 2) Моментальное переключение на новый SW
self.skipWaiting();
self.addEventListener('activate', () => {
  clients.claim();
  console.log('Service Worker activated and clients claimed');
});

// 3) Стратегия кеширования аудио (CacheFirst + Range + Expiration + CacheableResponse)
const { CacheFirst } = workbox.strategies;
const { RangeRequestsPlugin } = workbox.rangeRequests;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

const audioStrategy = new CacheFirst({
  cacheName: 'static-audio-assets',
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new RangeRequestsPlugin(),
    new ExpirationPlugin({
      maxEntries: 20,
      maxAgeSeconds: 60 * 60 * 24 * 30,
    }),
  ],
});

// 4) Регистрируем маршрут для всех аудио-файлов (.mp3)
workbox.routing.registerRoute(
  ({ request, url }) =>
    request.destination === 'audio' || url.pathname.endsWith('.mp3'),
  audioStrategy
);

// 5) Прогрев кеша аудио при установке
workbox.recipes.warmStrategyCache({
  urls: ['/music/success.mp3'],
  strategy: audioStrategy,
});

// 6) Обработка PushEvent — показ уведомления
self.addEventListener('push', (event) => {
  let payload = { title: 'Новое уведомление', body: '', url: '/' };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon192.png',
    badge: '/icons/badge-72.png',
    data: { url: payload.url },
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// 7) Обработчик клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  const targetUrl = event.notification.data.url;
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windows) => {
      for (const win of windows) {
        if (win.url === targetUrl) {
          return win.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});