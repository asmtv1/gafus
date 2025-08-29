// Кастомный Service Worker для улучшения offline режима
self.addEventListener('install', (event) => {
  console.log('🔄 Custom SW installing...');
  event.waitUntil(
    Promise.resolve().then(() => {
      console.log('✅ Custom SW installed successfully');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('✅ Custom SW activated');
  event.waitUntil(
    self.clients.claim()
      .then(() => {
        console.log('✅ Clients claimed successfully');
      })
      .catch((error) => {
        console.error('❌ Failed to claim clients:', error);
      })
  );
});

// Перехватываем fetch запросы для лучшего offline режима
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Обрабатываем только GET запросы
  if (request.method !== 'GET') return;
  
  // Для push-уведомлений не используем кэширование
  if (request.url.includes('/api/push')) {
    return;
  }
  
  // Упрощенная логика для Safari - только базовое кэширование
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
});

// Обработка push уведомлений
self.addEventListener('push', (event) => {
  console.log('🔔 Push event received:', event);
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('🔔 Push data:', data);
      
      // Специальный формат для iOS Safari
      const options = {
        body: data.body || data.message || 'Новое уведомление',
        icon: data.icon || '/icons/icon192.png',
        badge: data.badge || '/icons/icon192.png',
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
        // Специальные опции для iOS Safari
        silent: false,
        vibrate: [200, 100, 200],
        timestamp: Date.now()
      };
      
      console.log('🔔 Showing notification with options:', options);
      
      event.waitUntil(
        self.registration.showNotification(data.title || 'Gafus', options)
          .then(() => {
            console.log('✅ Notification shown successfully');
          })
          .catch((error) => {
            console.error('❌ Failed to show notification:', error);
          })
      );
    } catch (error) {
      console.error('❌ Error processing push data:', error);
      
      // Fallback notification
      event.waitUntil(
        self.registration.showNotification('Gafus', {
          body: 'Новое уведомление',
          icon: '/icons/icon192.png',
          tag: 'gafus-notification-fallback'
        })
      );
    }
  } else {
    console.log('🔔 Push event without data');
    
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('Gafus', {
        body: 'Новое уведомление',
        icon: '/icons/icon192.png',
        tag: 'gafus-notification-fallback'
      })
    );
  }
});

// Обработка сообщений от основного потока (для тестовых уведомлений)
self.addEventListener('message', (event) => {
  console.log('📨 Message received in Service Worker:', event.data);
  
  if (event.data && event.data.type === 'TEST_PUSH') {
    console.log('🔔 Processing test push notification');
    
    const { data } = event.data;
    
    const options = {
      body: data.body || 'Тестовое уведомление',
      icon: data.icon || '/icons/icon192.png',
      badge: data.badge || '/icons/icon192.png',
      tag: 'test-notification',
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

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      // Используем относительный путь для Safari
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
});

console.log('🚀 Custom Service Worker loaded');



