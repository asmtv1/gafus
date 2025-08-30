// Современный Service Worker для всех браузеров с оптимизацией для Safari

// Определяем браузер
const isSafari = () => {
  const userAgent = navigator.userAgent;
  return /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
};

// Safari-специфичные настройки
const getSafariSettings = () => {
  const safari = isSafari();
  return {
    isSafari: safari,
    // Safari: минимальная логика, быстрая активация
    useMinimalLogic: safari,
    // Safari: простые уведомления без сложных опций
    useSimpleNotifications: safari,
  };
};

// Функция для создания уведомления
const createNotificationOptions = (data, baseUrl) => {
  const settings = getSafariSettings();
  
  // Базовые опции для всех браузеров
  let iconUrl = data.icon ? (data.icon.startsWith('http') ? data.icon : baseUrl + data.icon) : baseUrl + '/icons/icon192.png';
  
  if (!data.icon) {
    iconUrl = baseUrl + '/icons/icon192.png';
  }
  
  // Safari: только базовые опции
  if (settings.useSimpleNotifications) {
    return {
      body: data.body || data.message || 'Новое уведомление',
      icon: iconUrl,
      tag: data.tag || 'gafus-notification',
      data: data,
      requireInteraction: false,
      silent: false
    };
  }
  
  // Другие браузеры: полный набор опций
  const badgeUrl = data.badge ? (data.badge.startsWith('http') ? data.badge : baseUrl + data.badge) : baseUrl + '/icons/badge-72.png';
  
  return {
    body: data.body || data.message || 'Новое уведомление',
    icon: iconUrl,
    badge: badgeUrl,
    tag: data.tag || 'gafus-notification',
    data: data,
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'Открыть' },
      { action: 'close', title: 'Закрыть' }
    ],
    silent: false,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };
};

// Современная установка Service Worker
self.addEventListener('install', (event) => {
  console.log('🔄 SW: Устанавливаемся...');
  
  const settings = getSafariSettings();
  
  if (settings.useMinimalLogic) {
    // Safari: минимальная установка
    console.log('🦁 Safari: Минимальная установка');
    event.waitUntil(self.skipWaiting());
  } else {
    // Другие браузеры: полная установка
    event.waitUntil(
      Promise.resolve()
        .then(() => {
          console.log('✅ SW: Установка завершена');
          return self.skipWaiting();
        })
        .catch(error => {
          console.error('❌ SW: Ошибка установки:', error);
        })
    );
  }
});

// Современная активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('✅ SW: Активируемся...');
  
  const settings = getSafariSettings();
  
  if (settings.useMinimalLogic) {
    // Safari: минимальная активация
    console.log('🦁 Safari: Минимальная активация');
    event.waitUntil(
      self.clients.claim()
        .catch(error => {
          console.warn('⚠️ Safari: Ошибка claim (но это нормально):', error);
        })
    );
  } else {
    // Другие браузеры: полная активация
    event.waitUntil(
      self.clients.claim()
        .then(() => {
          console.log('✅ SW: Активация завершена');
        })
        .catch(error => {
          console.error('❌ SW: Ошибка активации:', error);
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
  if (request.url.includes('/api/push')) return;
  
  if (settings.useMinimalLogic) {
    // Safari: минимальная обработка fetch
    console.log('🦁 Safari: Минимальная обработка fetch');
    
    event.respondWith(
      fetch(request)
        .catch(async (error) => {
          console.log('🌐 Safari: Сеть недоступна, пробуем кэш');
          
          try {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
              console.log('✅ Safari: Обслуживаем из кэша');
              return cachedResponse;
            }
          } catch (cacheError) {
            console.warn('⚠️ Safari: Ошибка кэша:', cacheError);
          }
          
          // Простой fallback для Safari
          return new Response(
            '<html><body><h1>Offline</h1><p>Нет подключения к интернету</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
  } else {
    // Другие браузеры: полная обработка fetch
    try {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // Кэшируем страницы
            if (response.status === 200 && request.mode === 'navigate') {
              const responseClone = response.clone();
              caches.open('pages').then((cache) => {
                cache.put(request, responseClone).catch(err => {
                  console.warn('⚠️ Не удалось кэшировать страницу:', err);
                });
              });
            }
            return response;
          })
          .catch(async (error) => {
            console.log('🌐 Сеть недоступна, пробуем кэш');
            
            try {
              const cachedResponse = await caches.match(request);
              if (cachedResponse) {
                console.log('✅ Обслуживаем из кэша');
                return cachedResponse;
              }
            } catch (cacheError) {
              console.warn('⚠️ Ошибка кэша:', cacheError);
            }
            
            return new Response(
              '<html><body><h1>Offline</h1><p>Нет подключения к интернету</p></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          })
      );
    } catch (error) {
      console.warn('⚠️ Ошибка обработки fetch:', error);
    }
  }
});

// Упрощенная обработка push уведомлений
self.addEventListener('push', (event) => {
  console.log('🔔 Push событие получено');
  
  const settings = getSafariSettings();
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('🔔 Push данные:', data);
      
      const baseUrl = self.location.origin;
      const options = createNotificationOptions(data, baseUrl);
      
      console.log('🔔 Показываем уведомление с опциями:', options);
      
      if (settings.useMinimalLogic) {
        // Safari: минимальная обработка push
        console.log('🦁 Safari: Минимальная обработка push');
        
        event.waitUntil(
          self.registration.showNotification(data.title || 'Gafus', options)
            .catch((error) => {
              console.error('❌ Safari: Ошибка показа уведомления:', error);
              
              // Fallback для Safari
              const safariFallback = {
                body: data.body || data.message || 'Новое уведомление',
                icon: baseUrl + '/icons/icon192.png',
                tag: 'gafus-notification-safari-fallback'
              };
              
              return self.registration.showNotification(data.title || 'Gafus', safariFallback);
            })
        );
      } else {
        // Другие браузеры: полная обработка push
        event.waitUntil(
          self.registration.showNotification(data.title || 'Gafus', options)
            .then(() => {
              console.log('✅ Уведомление показано успешно');
            })
            .catch((error) => {
              console.error('❌ Ошибка показа уведомления:', error);
            })
        );
      }
    } catch (error) {
      console.error('❌ Ошибка обработки push данных:', error);
      
      // Fallback уведомление
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
    console.log('🔔 Push событие без данных');
    
    // Fallback уведомление
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

// Упрощенная обработка сообщений
self.addEventListener('message', (event) => {
  console.log('📨 Сообщение получено в SW:', event.data);
  
  const settings = getSafariSettings();
  
  if (event.data && event.data.type === 'TEST_PUSH') {
    console.log('🔔 Обрабатываем тестовое push уведомление');
    
    const { data } = event.data;
    const baseUrl = self.location.origin;
    const options = createNotificationOptions(data, baseUrl);
    
    if (settings.useMinimalLogic) {
      // Safari: минимальная обработка тестового push
      console.log('🦁 Safari: Минимальная обработка тестового push');
      
      event.waitUntil(
        self.registration.showNotification(data.title || 'Тест Gafus', options)
          .then(() => {
            console.log('✅ Safari: Тестовое уведомление показано');
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: true });
            }
          })
          .catch((error) => {
            console.error('❌ Safari: Ошибка тестового уведомления:', error);
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
            console.log('✅ Тестовое уведомление показано');
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: true });
            }
          })
          .catch((error) => {
            console.error('❌ Ошибка тестового уведомления:', error);
            if (event.ports && event.ports.length > 0) {
              event.ports[0].postMessage({ success: false, error: error.message });
            }
          })
      );
    }
  } else if (event.data && event.data.type === 'PING') {
    console.log('🏓 PING получен, отвечаем PONG');
    
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

// Упрощенная обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Клик по уведомлению:', event);
  event.notification.close();
  
  const settings = getSafariSettings();
  
  if (event.action === 'open') {
    if (settings.useMinimalLogic) {
      // Safari: минимальная обработка клика
      console.log('🦁 Safari: Минимальная обработка клика');
      
      event.waitUntil(
        self.clients.openWindow('./')
          .catch((error) => {
            console.error('❌ Safari: Ошибка открытия окна:', error);
            return self.clients.openWindow(self.location.origin);
          })
      );
    } else {
      // Другие браузеры: полная обработка
      event.waitUntil(
        self.clients.openWindow('./')
          .then((windowClient) => {
            if (windowClient) {
              console.log('✅ Окно открыто успешно');
            }
          })
          .catch((error) => {
            console.error('❌ Ошибка открытия окна:', error);
            self.clients.openWindow(self.location.origin);
          })
      );
    }
  }
});

console.log('🚀 Современный Service Worker загружен');



