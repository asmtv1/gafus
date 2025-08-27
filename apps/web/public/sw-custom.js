// Кастомный Service Worker для улучшения offline режима
self.addEventListener('install', (event) => {
  console.log('🔄 Custom SW installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Custom SW activated');
  event.waitUntil(self.clients.claim());
});

// Перехватываем fetch запросы для лучшего offline режима
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Обрабатываем только GET запросы
  if (request.method !== 'GET') return;
  
  // Для навигационных запросов используем специальную логику
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Если запрос успешен, кэшируем его
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open('pages').then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async (error) => {
          console.log('🌐 Network failed, trying cache...', error);
          
          // Пытаемся найти в кэше
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            console.log('✅ Serving from cache:', request.url);
            return cachedResponse;
          }
          
          // Если в кэше нет, показываем offline страницу
          console.log('📱 No cache found, showing offline page');
          const offlineResponse = await caches.match('/~offline');
          if (offlineResponse) {
            return offlineResponse;
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
    return;
  }
  
  // Для API запросов используем NetworkFirst с коротким таймаутом
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Если запрос успешен, кэшируем его
          if (response.status === 200) {
            const responseClone = response.clone();
            // Определяем подходящий кэш в зависимости от типа API
            let cacheName = 'api-cache';
            if (request.url.includes('/api/courses')) {
              cacheName = 'courses-api';
            } else if (request.url.includes('/api/timer') || request.url.includes('/api/progress')) {
              cacheName = 'timer-progress-api';
            }
            
            caches.open(cacheName).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async (error) => {
          console.log('🌐 API failed, trying cache:', request.url);
          
          // Пытаемся найти в соответствующем кэше
          let cacheName = 'api-cache';
          if (request.url.includes('/api/courses')) {
            cacheName = 'courses-api';
          } else if (request.url.includes('/api/timer') || request.url.includes('/api/progress')) {
            cacheName = 'timer-progress-api';
          }
          
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            console.log('✅ Serving API from cache:', request.url);
            return cachedResponse;
          }
          
          // Если в кэше нет, возвращаем ошибку
          throw error;
        })
    );
    return;
  }
});

// Обработка push уведомлений
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Новое уведомление',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'gafus-notification',
      data: data,
      actions: [
        {
          action: 'open',
          title: 'Открыть',
        },
        {
          action: 'close',
          title: 'Закрыть',
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Gafus', options)
    );
  }
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

console.log('🚀 Custom Service Worker loaded');



