// Кастомный Service Worker для Gafus
// Полная замена Workbox - простой и понятный код

const CACHE_VERSION = 'v1';
const CACHE_NAME = `gafus-cache-${CACHE_VERSION}`;

console.log('🚀 SW: Starting Gafus Service Worker', { version: CACHE_VERSION });

// Safari/WebKit-specific settings
function getSafariSettings() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isWebKit = /webkit/i.test(navigator.userAgent);
  const isChrome = /chrome/i.test(navigator.userAgent);
  const isSafari = isWebKit && (/safari/i.test(navigator.userAgent) && !isChrome || isIOS);
  const isStandalone = navigator.standalone;
  
  return {
    isSafari,
    isIOS,
    isWebKit,
    isStandalone,
    useSimpleNotifications: isSafari,
    usePWALogic: isSafari && isStandalone,
  };
}

const settings = getSafariSettings();

console.log('🦁 SW: Settings loaded', {
  isSafari: settings.isSafari,
  isIOS: settings.isIOS,
  isStandalone: settings.isStandalone,
  usePWALogic: settings.usePWALogic
});

// Install event - простая установка
self.addEventListener('install', (event) => {
  console.log('📦 SW: Install event');
  self.skipWaiting();
});

// Activate event - захват клиентов
self.addEventListener('activate', (event) => {
  console.log('🔄 SW: Activate event');
  event.waitUntil(self.clients.claim());
});

// Fetch event - минимальная обработка для офлайн
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          '<!DOCTYPE html><html><head><title>Gafus - Офлайн</title></head><body><h1>Gafus</h1><p>Нет подключения к интернету</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
  }
});

// Функция создания уведомлений с Safari-оптимизацией
function createNotificationOptions(title, options = {}) {
  const safariIcon = settings.isSafari ? '/icons/icon-256-safari.png' : '/icons/icon192.png';
  const safariBadge = settings.isSafari ? '/icons/badge-72.png' : '/icons/icon192.png';
  
  if (settings.useSimpleNotifications) {
    // Для Safari: только базовые опции с Safari-специфичными иконками
    return {
      body: options.body || 'Новое уведомление',
      icon: options.icon || safariIcon,
      badge: options.badge || safariBadge,
      tag: options.tag || 'default',
      requireInteraction: false,
      silent: false,
    };
  }
  
  // Для других браузеров: полные опции
  return {
    body: options.body || 'Новое уведомление',
    icon: options.icon || safariIcon,
    badge: options.badge || safariBadge,
    tag: options.tag || 'default',
    requireInteraction: options.requireInteraction || false,
    silent: options.silent || false,
    data: options.data || {},
    actions: options.actions || [],
    ...options,
  };
}

// Push event handler
self.addEventListener('push', (event) => {
  console.log('🦁 SW Custom: Push event received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    console.warn('⚠️ SW Custom: Не удалось распарсить push данные:', error);
    data = { title: 'Gafus', body: 'Новое уведомление' };
  }
  
  const title = data.title || 'Gafus';
  const options = createNotificationOptions(title, {
    body: data.body || 'Новое уведомление',
    icon: data.icon,
    badge: data.badge,
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    data: data,
    actions: data.actions || [],
  });
  
  console.log('🦁 SW Custom: Showing notification:', title);
  
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('✅ SW Custom: Notification shown successfully');
      })
      .catch(error => {
        console.error('❌ SW Custom: Error showing notification:', error);
      })
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  console.log('🦁 SW Custom: Notification click event');
  
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Ищем уже открытое окно приложения
        for (const client of clients) {
          if (client.url.includes('gafus.ru') && 'focus' in client) {
            console.log('✅ SW Custom: Focusing existing window');
            return client.focus();
          }
        }
        
        // Если нет открытого окна, открываем новое
        if (clients.openWindow) {
          console.log('✅ SW Custom: Opening new window');
          return clients.openWindow('/');
        }
      })
      .catch(error => {
        console.error('❌ SW Custom: Error handling notification click:', error);
      })
  );
});

// Message event handler для коммуникации с клиентом
self.addEventListener('message', (event) => {
  console.log('🦁 SW Custom: Message event', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('🦁 SW Custom: Skip waiting requested');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      type: 'VERSION_INFO',
      version: CACHE_VERSION,
      safari: settings.isSafari,
      ios: settings.isIOS,
    });
  }
});

console.log('✅ SW: Gafus Service Worker loaded successfully');