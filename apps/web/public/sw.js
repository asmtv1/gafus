// Кастомный Service Worker для Gafus
// Отвечает за push-уведомления и офлайн кэширование

console.log('🚀 SW: Starting Gafus Service Worker for Push Notifications & Offline Caching');

// Конфигурация кэширования
const CACHE_CONFIG = {
  // Версии кэшей для независимого обновления
  STATIC_CACHE: 'gafus-static-v1',
  PAGES_CACHE: 'gafus-pages-v1',
  API_CACHE: 'gafus-api-v1',
  IMAGES_CACHE: 'gafus-images-v1',
  
  // Максимальное количество записей в кэше
  MAX_CACHE_ENTRIES: 100,
  
  // TTL для разных типов ресурсов (в миллисекундах)
  TTL: {
    STATIC: 7 * 24 * 60 * 60 * 1000, // 7 дней
    PAGES: 24 * 60 * 60 * 1000,      // 1 день
    API: 30 * 60 * 1000,             // 30 минут
    IMAGES: 30 * 24 * 60 * 60 * 1000, // 30 дней
  },
  
  // Паттерны для кэширования
  PATTERNS: {
    STATIC: [
      /\.(?:js|css|woff2?|ttf|eot)$/,
      /\/_next\/static\//,
      /\/icons\//,
    ],
    PAGES: [
      /^\/$/,
      /^\/courses/,
      /^\/profile/,
      /^\/achievements/,
      /^\/trainings/,
    ],
    API: [
      /^\/api\//,
    ],
    IMAGES: [
      /\.(?:png|jpg|jpeg|gif|webp|svg)$/,
      /\/uploads\//,
    ],
  },
};

// Safari/WebKit-specific settings для уведомлений
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

// Утилиты для работы с кэшем
class CacheManager {
  constructor() {
    this.caches = new Map();
  }

  // Определение типа ресурса по URL
  getResourceType(url) {
    const pathname = new URL(url).pathname;
    
    for (const [type, patterns] of Object.entries(CACHE_CONFIG.PATTERNS)) {
      if (patterns.some(pattern => pattern.test(pathname))) {
        return type;
      }
    }
    
    return 'API'; // По умолчанию считаем API
  }

  // Получение имени кэша для типа ресурса
  getCacheName(type) {
    const cacheMap = {
      STATIC: CACHE_CONFIG.STATIC_CACHE,
      PAGES: CACHE_CONFIG.PAGES_CACHE,
      API: CACHE_CONFIG.API_CACHE,
      IMAGES: CACHE_CONFIG.IMAGES_CACHE,
    };
    return cacheMap[type] || CACHE_CONFIG.API_CACHE;
  }

  // Проверка, нужно ли кэшировать ресурс
  shouldCache(url, type) {
    // Не кэшируем запросы с no-cache заголовками
    if (url.includes('no-cache')) return false;
    
    // Не кэшируем запросы к внешним доменам
    try {
      const urlObj = new URL(url);
      if (urlObj.origin !== self.location.origin) return false;
    } catch {
      return false;
    }
    
    return true;
  }

  // Очистка старых записей из кэша
  async cleanupCache(cacheName, maxEntries = CACHE_CONFIG.MAX_CACHE_ENTRIES) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      
      if (keys.length > maxEntries) {
        const keysToDelete = keys.slice(0, keys.length - maxEntries);
        await Promise.all(keysToDelete.map(key => cache.delete(key)));
        console.log(`🧹 SW: Cleaned up ${keysToDelete.length} old entries from ${cacheName}`);
      }
    } catch (error) {
      console.warn(`⚠️ SW: Failed to cleanup cache ${cacheName}:`, error);
    }
  }

  // Проверка TTL для записи в кэше
  async isCacheEntryValid(request, cacheName) {
    try {
      const cache = await caches.open(cacheName);
      const response = await cache.match(request);
      
      if (!response) return false;
      
      const cacheTime = response.headers.get('sw-cache-time');
      if (!cacheTime) return true; // Если нет времени кэширования, считаем валидным
      
      const resourceType = this.getResourceType(request.url);
      const ttl = CACHE_CONFIG.TTL[resourceType];
      const age = Date.now() - parseInt(cacheTime);
      
      return age < ttl;
    } catch {
      return false;
    }
  }
}

const cacheManager = new CacheManager();

// Install event
self.addEventListener('install', (event) => {
  console.log('📦 SW: Install event - Setting up caches');
  
  event.waitUntil(
    (async () => {
      try {
        // Создаем все необходимые кэши
        const cacheNames = [
          CACHE_CONFIG.STATIC_CACHE,
          CACHE_CONFIG.PAGES_CACHE,
          CACHE_CONFIG.API_CACHE,
          CACHE_CONFIG.IMAGES_CACHE,
        ];
        
        await Promise.all(
          cacheNames.map(cacheName => caches.open(cacheName))
        );
        
        console.log('✅ SW: All caches created successfully');
        self.skipWaiting();
      } catch (error) {
        console.error('❌ SW: Failed to create caches:', error);
      }
    })()
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('🔄 SW: Activate event - Cleaning up old caches');
  
  event.waitUntil(
    (async () => {
      try {
        // Удаляем старые версии кэшей
        const cacheNames = await caches.keys();
        const currentCacheNames = [
          CACHE_CONFIG.STATIC_CACHE,
          CACHE_CONFIG.PAGES_CACHE,
          CACHE_CONFIG.API_CACHE,
          CACHE_CONFIG.IMAGES_CACHE,
        ];
        
        const cachesToDelete = cacheNames.filter(
          cacheName => !currentCacheNames.includes(cacheName)
        );
        
        await Promise.all(
          cachesToDelete.map(cacheName => caches.delete(cacheName))
        );
        
        if (cachesToDelete.length > 0) {
          console.log(`🧹 SW: Deleted ${cachesToDelete.length} old caches`);
        }
        
        // Очищаем старые записи из текущих кэшей
        await Promise.all(
          currentCacheNames.map(cacheName => 
            cacheManager.cleanupCache(cacheName)
          )
        );
        
        console.log('✅ SW: Cache cleanup completed');
        await self.clients.claim();
      } catch (error) {
        console.error('❌ SW: Failed to cleanup caches:', error);
      }
    })()
  );
});

// Fetch event handler для кэширования
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Пропускаем не-GET запросы (кроме API)
  if (request.method !== 'GET' && !url.pathname.startsWith('/api/')) {
    return;
  }
  
  // Пропускаем chrome-extension и другие протоколы
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  const resourceType = cacheManager.getResourceType(request.url);
  
  if (!cacheManager.shouldCache(request.url, resourceType)) {
    return;
  }
  
  event.respondWith(handleRequest(request, resourceType));
});

// Обработка запросов с разными стратегиями кэширования
async function handleRequest(request, resourceType) {
  const cacheName = cacheManager.getCacheName(resourceType);
  
  try {
    switch (resourceType) {
      case 'STATIC':
      case 'IMAGES':
        return await cacheFirstStrategy(request, cacheName);
      
      case 'PAGES':
        return await cacheFirstStrategy(request, cacheName);
      
      case 'API':
        return await networkFirstStrategy(request, cacheName);
      
      default:
        return await networkFirstStrategy(request, cacheName);
    }
  } catch (error) {
    console.warn(`⚠️ SW: Request failed for ${request.url}:`, error);
    
    // Fallback для страниц - показываем офлайн страницу
    if (resourceType === 'PAGES') {
      return await getOfflinePage();
    }
    
    // Для остальных типов возвращаем ошибку
    return new Response('Offline', { 
      status: 503, 
      statusText: 'Service Unavailable' 
    });
  }
}

// Стратегия Cache First (для статических ресурсов и страниц)
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  // Проверяем кэш
  const cachedResponse = await cache.match(request);
  if (cachedResponse && await cacheManager.isCacheEntryValid(request, cacheName)) {
    console.log(`📦 SW: Serving from cache: ${request.url}`);
    return cachedResponse;
  }
  
  // Если нет в кэше или истек TTL, запрашиваем из сети
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Клонируем ответ и добавляем метаданные кэширования
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      
      await cache.put(request, modifiedResponse);
      console.log(`💾 SW: Cached: ${request.url}`);
      
      // Очищаем старые записи
      await cacheManager.cleanupCache(cacheName);
    }
    
    return networkResponse;
  } catch (error) {
    // Если сеть недоступна, возвращаем кэшированную версию (даже если TTL истек)
    if (cachedResponse) {
      console.log(`📦 SW: Network failed, serving stale cache: ${request.url}`);
      return cachedResponse;
    }
    throw error;
  }
}

// Стратегия Network First (для API запросов)
async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    // Сначала пытаемся получить из сети
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Кэшируем успешные ответы
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      
      await cache.put(request, modifiedResponse);
      console.log(`💾 SW: Cached API response: ${request.url}`);
      
      // Очищаем старые записи
      await cacheManager.cleanupCache(cacheName);
    }
    
    return networkResponse;
  } catch (error) {
    // Если сеть недоступна, возвращаем из кэша
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log(`📦 SW: Network failed, serving cached API: ${request.url}`);
      return cachedResponse;
    }
    throw error;
  }
}

// Получение офлайн страницы
async function getOfflinePage() {
  try {
    const cache = await caches.open(CACHE_CONFIG.PAGES_CACHE);
    const offlineResponse = await cache.match('/~offline');
    
    if (offlineResponse) {
      return offlineResponse;
    }
  } catch (error) {
    console.warn('⚠️ SW: Failed to get offline page from cache:', error);
  }
  
  // Fallback офлайн страница
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Gafus - Офлайн</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; padding: 20px; text-align: center; 
            background: #f5f5f5; color: #333;
          }
          .container { 
            max-width: 400px; margin: 50px auto; 
            background: white; padding: 40px; border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .icon { font-size: 48px; margin-bottom: 20px; }
          h1 { margin: 0 0 16px; color: #2563eb; }
          p { margin: 0 0 24px; line-height: 1.5; }
          .retry-btn {
            background: #2563eb; color: white; border: none;
            padding: 12px 24px; border-radius: 8px; cursor: pointer;
            font-size: 16px; transition: background 0.2s;
          }
          .retry-btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">📱</div>
          <h1>Нет подключения к интернету</h1>
          <p>Проверьте подключение к интернету и попробуйте снова.</p>
          <button class="retry-btn" onclick="window.location.reload()">
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}

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
      version: 'push-and-cache',
      safari: settings.isSafari,
      ios: settings.isIOS,
    });
  }
  
  // Обработка сообщений от offlineStore
  if (event.data && event.data.type === 'OFFLINE_STATUS') {
    handleOfflineStatusChange(event.data.isOnline);
  }
  
  if (event.data && event.data.type === 'SYNC_QUEUE') {
    handleSyncQueue(event.data.actions);
  }
  
  if (event.data && event.data.type === 'CACHE_STATUS') {
    handleCacheStatusRequest(event);
  }
});

// Обработка изменения офлайн статуса
async function handleOfflineStatusChange(isOnline) {
  console.log(`🌐 SW: Offline status changed: ${isOnline ? 'online' : 'offline'}`);
  
  // Уведомляем все клиенты об изменении статуса
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'NETWORK_STATUS_CHANGED',
      isOnline,
      timestamp: Date.now(),
    });
  });
  
  // Если стали онлайн, пытаемся синхронизировать кэш
  if (isOnline) {
    await syncCachedData();
  }
}

// Обработка очереди синхронизации
async function handleSyncQueue(actions) {
  console.log(`🔄 SW: Processing sync queue with ${actions.length} actions`);
  
  for (const action of actions) {
    try {
      await processOfflineAction(action);
    } catch (error) {
      console.warn(`⚠️ SW: Failed to process action ${action.id}:`, error);
    }
  }
}

// Обработка запроса статуса кэша
async function handleCacheStatusRequest(event) {
  try {
    const cacheNames = [
      CACHE_CONFIG.STATIC_CACHE,
      CACHE_CONFIG.PAGES_CACHE,
      CACHE_CONFIG.API_CACHE,
      CACHE_CONFIG.IMAGES_CACHE,
    ];
    
    const cacheStatus = {};
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      cacheStatus[cacheName] = {
        entries: keys.length,
        size: await estimateCacheSize(cache),
      };
    }
    
    event.ports[0].postMessage({
      type: 'CACHE_STATUS_RESPONSE',
      status: cacheStatus,
    });
  } catch (error) {
    console.warn('⚠️ SW: Failed to get cache status:', error);
    event.ports[0].postMessage({
      type: 'CACHE_STATUS_RESPONSE',
      error: error.message,
    });
  }
}

// Обработка офлайн действия
async function processOfflineAction(action) {
  console.log(`🔄 SW: Processing offline action: ${action.type}`);
  
  // Здесь можно добавить логику для обработки специфичных действий
  // Например, кэширование данных для последующей синхронизации
  
  // Уведомляем клиент об успешной обработке
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'OFFLINE_ACTION_PROCESSED',
      actionId: action.id,
      success: true,
    });
  });
}

// Синхронизация кэшированных данных при восстановлении сети
async function syncCachedData() {
  console.log('🔄 SW: Syncing cached data after network restoration');
  
  try {
    // Здесь можно добавить логику для синхронизации кэшированных данных
    // Например, отправка накопленных метрик или аналитики
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_RESTORED',
        timestamp: Date.now(),
      });
    });
  } catch (error) {
    console.warn('⚠️ SW: Failed to sync cached data:', error);
  }
}

// Оценка размера кэша
async function estimateCacheSize(cache) {
  try {
    const keys = await cache.keys();
    let totalSize = 0;
    
    for (const key of keys) {
      const response = await cache.match(key);
      if (response && response.body) {
        const reader = response.body.getReader();
        let size = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
        }
        
        totalSize += size;
      }
    }
    
    return totalSize;
  } catch {
    return 0;
  }
}

console.log('✅ SW: Gafus Service Worker loaded successfully - Push Notifications & Offline Caching enabled');