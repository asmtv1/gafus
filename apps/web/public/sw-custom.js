// Кастомный Service Worker для улучшения offline режима

// Определяем, является ли браузер Safari
const isSafari = () => {
  const userAgent = navigator.userAgent;
  return /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
};

// Safari-специфичные настройки
const getSafariSettings = () => {
  const safari = isSafari();
  return {
    isSafari: safari,
    // Safari: упрощенная логика, меньше кэширования
    useSimpleCache: safari,
    // Safari: таймауты для предотвращения зависаний
    timeoutMs: safari ? 3000 : 10000,
  };
};

// Функция для создания уведомления с учетом особенностей Safari
const createNotificationOptions = (data, baseUrl) => {
  // Safari 2025: требует иконки в формате PNG, размеры 192x192, 256x256, 512x512
  // Safari НЕ поддерживает badge, actions, vibrate, timestamp
  let iconUrl = data.icon ? (data.icon.startsWith('http') ? data.icon : baseUrl + data.icon) : baseUrl + '/icons/icon192.png';
  
  // Fallback для Safari - используем иконки в правильных размерах
  if (!data.icon) {
    iconUrl = baseUrl + '/icons/icon192.png';
  }
  
  // Safari поддерживает только базовые опции
  if (isSafari()) {
    return {
      body: data.body || data.message || 'Новое уведомление',
      icon: iconUrl,
      tag: data.tag || 'gafus-notification',
      data: data,
      // Safari не поддерживает: badge, actions, vibrate, timestamp, renotify, dir
      requireInteraction: false,
      silent: false
    };
  }
  
  // Для других браузеров используем полный набор опций
  const badgeUrl = data.badge ? (data.badge.startsWith('http') ? data.badge : baseUrl + data.badge) : baseUrl + '/icons/badge-72.png';
  
  return {
    body: data.body || data.message || 'Новое уведомление',
    icon: iconUrl,
    badge: badgeUrl,
    tag: data.tag || 'gafus-notification',
    data: data,
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'Открыть',
      },
      {
        action: 'close',
        title: 'Закрыть',
      }
    ],
    silent: false,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };
};

// Упрощенная установка для Safari
self.addEventListener('install', (event) => {
  console.log('🔄 Custom SW installing...');
  
  const settings = getSafariSettings();
  
  if (settings.isSafari) {
    // Safari: простая установка без сложной логики
    console.log('🦁 Safari: упрощенная установка');
    event.waitUntil(self.skipWaiting());
  } else {
    // Другие браузеры: обычная установка
    event.waitUntil(
      Promise.resolve().then(() => {
        console.log('✅ Custom SW installed successfully');
        return self.skipWaiting();
      })
    );
  }
});

// Упрощенная активация для Safari
self.addEventListener('activate', (event) => {
  console.log('✅ Custom SW activated');
  
  const settings = getSafariSettings();
  
  if (settings.isSafari) {
    // Safari: простая активация без сложной логики
    console.log('🦁 Safari: упрощенная активация');
    event.waitUntil(self.clients.claim());
  } else {
    // Другие браузеры: обычная активация
    event.waitUntil(
      self.clients.claim()
        .then(() => {
          console.log('✅ Clients claimed successfully');
        })
        .catch((error) => {
          console.error('❌ Failed to claim clients:', error);
        })
    );
  }
});

// Упрощенная обработка fetch для Safari
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const settings = getSafariSettings();
  
  // Обрабатываем только GET запросы
  if (request.method !== 'GET') return;
  
  // Для push-уведомлений не используем кэширование
  if (request.url.includes('/api/push')) {
    return;
  }
  
  // Safari: упрощенная логика fetch
  if (settings.useSimpleCache) {
    console.log('🦁 Safari: упрощенная обработка fetch');
    
    // Простая обработка без сложного кэширования
    event.respondWith(
      fetch(request)
        .catch(async (error) => {
          console.log('🌐 Network failed, trying simple cache...', error);
          
          try {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
              console.log('✅ Serving from cache:', request.url);
              return cachedResponse;
            }
          } catch (cacheError) {
            console.warn('⚠️ Cache error:', cacheError);
          }
          
          // Простой fallback для Safari
          return new Response(
            '<html><body><h1>Offline</h1><p>No internet connection</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
  } else {
    // Другие браузеры: полная логика кэширования
    try {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // Если запрос успешен и это страница, кэшируем
            if (response.status === 200 && request.mode === 'navigate') {
              const responseClone = response.clone();
              caches.open('pages').then((cache) => {
                cache.put(request, responseClone).catch(err => {
                  console.warn('⚠️ Failed to cache page:', err);
                });
              });
            }
            return response;
          })
          .catch(async (error) => {
            console.log('🌐 Network failed, trying cache...', error);
            
            // Пытаемся найти в кэше
            try {
              const cachedResponse = await caches.match(request);
              if (cachedResponse) {
                console.log('✅ Serving from cache:', request.url);
                return cachedResponse;
              }
            } catch (cacheError) {
              console.warn('⚠️ Cache error:', cacheError);
            }
            
            // Fallback на пустую страницу
            return new Response(
              '<html><body><h1>Offline</h1><p>No internet connection</p></body></html>',
              {
                headers: { 'Content-Type': 'text/html' },
              }
            );
          })
      );
    } catch (error) {
      console.warn('⚠️ Fetch handler error:', error);
      // В случае ошибки просто пропускаем
      return;
    }
  }
});

// Упрощенная обработка push уведомлений для Safari
self.addEventListener('push', (event) => {
  console.log('🔔 Push event received:', event);
  
  const settings = getSafariSettings();
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('🔔 Push data:', data);
      
      // Создаем абсолютные URL для иконок (требуется для Safari)
      const baseUrl = self.location.origin;
      const options = createNotificationOptions(data, baseUrl);
      
      console.log('🔔 Showing notification with options:', options);
      
      if (settings.isSafari) {
        // Safari: упрощенная обработка push
        console.log('🦁 Safari: упрощенная обработка push');
        
        event.waitUntil(
          self.registration.showNotification(data.title || 'Gafus', options)
            .catch((error) => {
              console.error('❌ Safari push failed, using fallback:', error);
              // Fallback для Safari - минимальные опции
              const safariFallback = {
                body: data.body || data.message || 'Новое уведомление',
                icon: baseUrl + '/icons/icon192.png',
                tag: data.tag || 'gafus-notification-safari-fallback'
              };
              return self.registration.showNotification(data.title || 'Gafus', safariFallback);
            })
        );
      } else {
        // Другие браузеры: полная обработка
        event.waitUntil(
          self.registration.showNotification(data.title || 'Gafus', options)
            .then(() => {
              console.log('✅ Notification shown successfully');
            })
            .catch((error) => {
              console.error('❌ Failed to show notification:', error);
            })
        );
      }
    } catch (error) {
      console.error('❌ Error processing push data:', error);
      
      // Fallback notification с абсолютным URL
      const baseUrl = self.location.origin;
      event.waitUntil(
        self.registration.showNotification('Gafus', {
          body: 'Новое уведомление',
          icon: baseUrl + '/icons/icon192.png',
          tag: 'gafus-notification-fallback'
        })
      );
    }
  } else {
    console.log('🔔 Push event without data');
    
    // Fallback notification с абсолютным URL
    const baseUrl = self.location.origin;
    event.waitUntil(
      self.registration.showNotification('Gafus', {
        body: 'Новое уведомление',
        icon: baseUrl + '/icons/icon192.png',
        tag: 'gafus-notification-fallback'
      })
    );
  }
});

// Упрощенная обработка сообщений для Safari
self.addEventListener('message', (event) => {
  console.log('📨 Message received in Service Worker:', event.data);
  
  const settings = getSafariSettings();
  
  if (event.data && event.data.type === 'TEST_PUSH') {
    console.log('🔔 Processing test push notification');
    
    const { data } = event.data;
    
    // Создаем абсолютные URL для иконок (требуется для Safari)
    const baseUrl = self.location.origin;
    const options = createNotificationOptions(data, baseUrl);
    
    if (settings.isSafari) {
      // Safari: упрощенная обработка тестовых уведомлений
      console.log('🦁 Safari: упрощенная обработка тестового push');
      
      event.waitUntil(
        self.registration.showNotification(data.title || 'Тест Gafus', options)
          .then(() => {
            console.log('✅ Test notification shown successfully');
            // Безопасная отправка ответа
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: true });
            }
          })
          .catch((error) => {
            console.error('❌ Safari test notification failed:', error);
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: false, error: error.message });
            }
          })
      );
    } else {
      // Другие браузеры: полная обработка
      event.waitUntil(
        self.registration.showNotification(data.title || 'Тест Gafus', options)
          .then(() => {
            console.log('✅ Test notification shown successfully');
            // Безопасная отправка ответа
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: true });
            }
          })
          .catch((error) => {
            console.error('❌ Failed to show test notification:', error);
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: false, error: error.message });
            }
          })
      );
    }
  } else if (event.data && event.data.type === 'PING') {
    console.log('🏓 PING received, responding with PONG');
    
    // Безопасная отправка ответа
    if (event.ports && event.ports.length > 0) {
      event.ports[0].postMessage({ 
        success: true, 
        message: 'PONG',
        timestamp: event.data.timestamp,
        swTimestamp: Date.now()
      });
    }
  }
});

// Упрощенная обработка кликов по уведомлениям для Safari
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  event.notification.close();
  
  const settings = getSafariSettings();
  
  if (event.action === 'open') {
    if (settings.isSafari) {
      // Safari: упрощенная обработка клика
      console.log('🦁 Safari: упрощенная обработка клика по уведомлению');
      
      event.waitUntil(
        self.clients.openWindow('./')
          .catch((error) => {
            console.error('❌ Safari failed to open window:', error);
            // Fallback - открываем текущий URL
            return self.clients.openWindow(self.location.origin);
          })
      );
    } else {
      // Другие браузеры: полная обработка
      event.waitUntil(
        self.clients.openWindow('./')
          .then((windowClient) => {
            if (windowClient) {
              console.log('✅ Window opened successfully');
            }
          })
          .catch((error) => {
            console.error('❌ Failed to open window:', error);
            // Fallback - открываем текущий URL
            self.clients.openWindow(self.location.origin);
          })
      );
    }
  }
});

console.log('🚀 Custom Service Worker loaded');



