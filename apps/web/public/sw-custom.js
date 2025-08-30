// Safari-specific settings
function getSafariSettings() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  
  return {
    isSafari,
    isIOS,
    isStandalone,
    useMinimalLogic: isSafari,
    useSimpleNotifications: isSafari,
    // Для PWA Safari: более агрессивная логика
    usePWALogic: isSafari && isStandalone,
  };
}

const settings = getSafariSettings();

console.log('🦁 Service Worker loaded', {
  isSafari: settings.isSafari,
  isIOS: settings.isIOS,
  isStandalone: settings.isStandalone,
  usePWALogic: settings.usePWALogic
});

// Упрощенная функция создания уведомлений
function createNotificationOptions(title, options = {}) {
  if (settings.useSimpleNotifications) {
    // Для Safari: только базовые опции
    return {
      body: options.body || 'Новое уведомление',
      icon: options.icon || '/icons/icon192.png',
      badge: options.badge || '/icons/icon192.png',
      tag: options.tag || 'default',
      requireInteraction: false,
      silent: false,
    };
  }
  
  // Для других браузеров: полные опции
  return {
    body: options.body || 'Новое уведомление',
    icon: options.icon || '/icons/icon192.png',
    badge: options.badge || '/icons/icon192.png',
    tag: options.tag || 'default',
    requireInteraction: options.requireInteraction || false,
    silent: options.silent || false,
    data: options.data || {},
    actions: options.actions || [],
    ...options,
  };
}

// Install event
self.addEventListener('install', (event) => {
  console.log('🦁 SW: Install event');
  
  if (settings.useMinimalLogic) {
    // Safari: простая установка
    console.log('🦁 Safari: Простая установка SW');
    self.skipWaiting();
  } else {
    // Другие браузеры: стандартная установка
    console.log('✅ SW: Standard install');
    event.waitUntil(
      Promise.resolve().then(() => {
        console.log('✅ SW: Install completed');
        return self.skipWaiting();
      })
    );
  }
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('🦁 SW: Activate event');
  
  if (settings.useMinimalLogic) {
    // Safari: простая активация
    console.log('🦁 Safari: Простая активация SW');
    event.waitUntil(
      self.clients.claim().catch(error => {
        console.warn('⚠️ Safari: Claim warning:', error);
      })
    );
  } else {
    // Другие браузеры: стандартная активация
    console.log('✅ SW: Standard activate');
    event.waitUntil(
      Promise.resolve()
        .then(() => {
          console.log('✅ SW: Activate completed');
          return self.clients.claim();
        })
        .catch(error => {
          console.error('❌ SW: Activate error:', error);
        })
    );
  }
});

// Fetch event
self.addEventListener('fetch', (event) => {
  if (settings.useMinimalLogic) {
    // Safari: минимальная обработка fetch
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Fallback для офлайн
          if (event.request.destination === 'document') {
            return new Response(
              '<html><body><h1>Gafus</h1><p>Нет подключения к интернету</p></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          }
          return new Response('Offline');
        })
    );
  } else {
    // Другие браузеры: полная обработка fetch
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(event.request);
        })
        .catch(() => {
          if (event.request.destination === 'document') {
            return caches.match('/offline.html');
          }
        })
    );
  }
});

// Push event
self.addEventListener('push', (event) => {
  console.log('🦁 SW: Push event received');
  
  if (settings.useMinimalLogic) {
    // Safari: простая обработка push
    console.log('🦁 Safari: Простая обработка push');
    
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (error) {
      console.warn('⚠️ Safari: Не удалось распарсить push данные:', error);
      data = { title: 'Gafus', body: 'Новое уведомление' };
    }
    
    const options = createNotificationOptions(data.title || 'Gafus', {
      body: data.body || 'Новое уведомление',
      icon: data.icon || '/icons/icon192.png',
      data: data,
    });
    
    event.waitUntil(
      self.registration.showNotification(options.body, options)
        .catch(error => {
          console.error('❌ Safari: Ошибка показа уведомления:', error);
        })
    );
  } else {
    // Другие браузеры: полная обработка push
    console.log('✅ SW: Standard push handling');
    
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (error) {
      console.warn('⚠️ Не удалось распарсить push данные:', error);
      data = { title: 'Gafus', body: 'Новое уведомление' };
    }
    
    const options = createNotificationOptions(data.title || 'Gafus', {
      body: data.body || 'Новое уведомление',
      icon: data.icon || '/icons/icon192.png',
      badge: data.badge || '/icons/icon192.png',
      tag: data.tag || 'default',
      requireInteraction: data.requireInteraction || false,
      data: data,
      actions: data.actions || [],
    });
    
    event.waitUntil(
      Promise.resolve()
        .then(() => {
          console.log('✅ SW: Showing notification');
          return self.registration.showNotification(options.body, options);
        })
        .catch(error => {
          console.error('❌ SW: Error showing notification:', error);
        })
    );
  }
});

// Message event
self.addEventListener('message', (event) => {
  console.log('🦁 SW: Message event', event.data);
  
  if (settings.useMinimalLogic) {
    // Safari: простая обработка сообщений
    if (event.data && event.data.type === 'SKIP_WAITING') {
      console.log('🦁 Safari: Skip waiting');
      self.skipWaiting();
    }
  } else {
    // Другие браузеры: полная обработка сообщений
    if (event.data && event.data.type === 'SKIP_WAITING') {
      console.log('✅ SW: Skip waiting');
      self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLAIM') {
      console.log('✅ SW: Claim clients');
      self.clients.claim();
    }
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('🦁 SW: Notification click', event.notification);
  
  if (settings.useMinimalLogic) {
    // Safari: простая обработка клика
    console.log('🦁 Safari: Простая обработка клика уведомления');
    
    event.notification.close();
    
    event.waitUntil(
      self.clients.matchAll({ type: 'window' })
        .then((clients) => {
          if (clients.length > 0) {
            // Открываем существующее окно
            return clients[0].focus();
          } else {
            // Открываем новое окно
            return self.clients.openWindow('/');
          }
        })
        .catch(error => {
          console.error('❌ Safari: Ошибка обработки клика:', error);
        })
    );
  } else {
    // Другие браузеры: полная обработка клика
    console.log('✅ SW: Standard notification click handling');
    
    event.notification.close();
    
    event.waitUntil(
      Promise.resolve()
        .then(() => {
          return self.clients.matchAll({ type: 'window' });
        })
        .then((clients) => {
          if (clients.length > 0) {
            console.log('✅ SW: Focusing existing window');
            return clients[0].focus();
          } else {
            console.log('✅ SW: Opening new window');
            return self.clients.openWindow('/');
          }
        })
        .catch(error => {
          console.error('❌ SW: Error handling notification click:', error);
        })
    );
  }
});

// Background sync (если поддерживается)
if ('sync' in self.registration) {
  self.addEventListener('sync', (event) => {
    console.log('🦁 SW: Background sync event', event.tag);
    
    if (settings.useMinimalLogic) {
      // Safari: простая обработка sync
      console.log('🦁 Safari: Простая обработка background sync');
    } else {
      // Другие браузеры: полная обработка sync
      console.log('✅ SW: Standard background sync handling');
    }
  });
}

console.log('🦁 Service Worker setup completed');



