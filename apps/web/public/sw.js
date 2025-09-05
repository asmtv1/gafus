// Кастомный Service Worker для Gafus
// Отвечает за push-уведомления и офлайн кэширование

console.log('🚀 SW: Starting Gafus Service Worker for Push Notifications & Offline Caching');

// 🎯 ГИБРИДНАЯ СТРАТЕГИЯ КЭШИРОВАНИЯ ДЛЯ NEXT.JS RSC
// Решает проблему офлайн-доступа к страницам в Next.js с React Server Components

const CACHE_CONFIG = {
  // 🏗️ Архитектура кэшей
  CACHES: {
    // Полные HTML-страницы (для офлайн-навигации)
    HTML_PAGES: 'gafus-html-v1',
    
    // RSC-данные (для динамических обновлений)
    RSC_DATA: 'gafus-rsc-v1',
    
    // Статические ресурсы
    STATIC: 'gafus-static-v1',
    
    // API-ответы
    API: 'gafus-api-v1',
    
    // Изображения
    IMAGES: 'gafus-images-v1',
  },
  
  // ⚡ Стратегии кэширования
  STRATEGIES: {
    HTML_PAGES: 'cacheFirst',    // HTML - кэш в первую очередь (критично для офлайна)
    RSC_DATA: 'networkFirst',    // RSC - сеть в первую очередь, но кэшируем
    STATIC: 'cacheFirst',        // Статика - кэш в первую очередь
    API: 'networkFirst',         // API - сеть в первую очередь
    IMAGES: 'cacheFirst',        // Изображения - кэш в первую очередь
  },
  
  // 🎯 Приоритеты кэширования
  PRIORITIES: {
    CRITICAL: ['HTML_PAGES'],           // Критично для офлайна
    HIGH: ['RSC_DATA', 'STATIC'],       // Высокий приоритет
    NORMAL: ['API', 'IMAGES'],          // Обычный приоритет
  },
  
  // ⏰ TTL для разных типов ресурсов
  TTL: {
    HTML_PAGES: 7 * 24 * 60 * 60 * 1000,  // 7 дней
    RSC_DATA: 2 * 60 * 60 * 1000,         // 2 часа
    STATIC: 7 * 24 * 60 * 60 * 1000,      // 7 дней
    API: 2 * 60 * 60 * 1000,              // 2 часа
    IMAGES: 30 * 24 * 60 * 60 * 1000,     // 30 дней
  },
  
  // 📊 Лимиты кэша
  LIMITS: {
    HTML_PAGES: 50,    // Максимум 50 HTML-страниц
    RSC_DATA: 200,     // Максимум 200 RSC-запросов
    STATIC: 500,       // Максимум 500 статических файлов
    API: 100,          // Максимум 100 API-ответов
    IMAGES: 300,       // Максимум 300 изображений
  },
  
  // 🔍 Паттерны для определения типов ресурсов
  PATTERNS: {
    HTML_PAGES: [
      /^\/$/,
      /^\/courses/,
      /^\/profile/,
      /^\/achievements/,
    ],
    RSC_DATA: [
      /_rsc=/,
      /Accept.*text\/x-component/,
    ],
    STATIC: [
      /\.(?:js|css|woff2?|ttf|eot|mp3|mp4|webm|ogg|wav|m4a)$/,
      /\/_next\/static\//,
      /\/icons\//,
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

// Таймаут для сетевых запросов RSC (best practice: быстрый failover к кэшу)
const RSC_NETWORK_TIMEOUT_MS = 500;

// 🧠 УМНАЯ СИСТЕМА ОПРЕДЕЛЕНИЯ ТИПОВ РЕСУРСОВ
// Анализирует запросы и определяет оптимальную стратегию кэширования

function getResourceType(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search;
  const accept = request.headers.get('Accept') || '';
  const method = request.method;
  
  console.log(`🔍 SW: Analyzing request: ${pathname}${search}, Accept: ${accept}, Method: ${method}`);
  
  // 1. 🧭 НАВИГАЦИОННЫЕ ЗАПРОСЫ (HTML-страницы)
  // Это запросы, которые должны возвращать полные HTML-страницы
  const isNavigation = request.mode === 'navigate' || 
                      (method === 'GET' && accept.includes('text/html') && !accept.includes('image/'));
  
  if (isNavigation) {
    console.log(`🧭 SW: Navigation request detected - will cache as HTML page`);
    return 'HTML_PAGES';
  }
  
  // 1.5. (удалено) Специальная обработка тренинговых страниц при навигации
  
  // 1.5. 🎯 СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ NEXT.JS RSC
  // Кэшируем HTML-страницы при первой загрузке через RSC-запросы
  if (method === 'GET' && !search.includes('_rsc') && !accept.includes('text/x-component')) {
    // Это может быть запрос HTML-страницы без RSC параметров
    for (const pattern of CACHE_CONFIG.PATTERNS.HTML_PAGES) {
      if (pattern.test(pathname)) {
        console.log(`📄 SW: Potential HTML page request detected: ${pathname}`);
        return 'HTML_PAGES';
      }
    }
  }
  
  // 2. 🔄 RSC-ЗАПРОСЫ (React Server Components)
  // Это запросы Next.js для получения данных компонентов
  const isRSC = search.includes('_rsc=') || 
                accept.includes('text/x-component') ||
                (method === 'POST' && accept.includes('text/x-component'));
  
  if (isRSC) {
    console.log(`🔄 SW: RSC request detected - will cache as RSC data`);
    return 'RSC_DATA';
  }
  
  // 3. 📁 СТАТИЧЕСКИЕ РЕСУРСЫ
  for (const pattern of CACHE_CONFIG.PATTERNS.STATIC) {
    if (pattern.test(pathname)) {
      console.log(`📁 SW: Static resource detected`);
      return 'STATIC';
    }
  }
  
  // 4. 🖼️ ИЗОБРАЖЕНИЯ
  // Специальная обработка для favicon.ico
  if (pathname === '/favicon.ico') {
    console.log(`🖼️ SW: Favicon detected - special handling`);
    return 'IMAGES';
  }
  
  // Проверяем по Accept заголовку и по паттернам
  if (accept.includes('image/') || accept.includes('image/*')) {
    console.log(`🖼️ SW: Image resource detected by Accept header`);
    return 'IMAGES';
  }
  
  // Специальная обработка для Next.js Image Optimization API
  if (pathname.startsWith('/_next/image')) {
    console.log(`🖼️ SW: Next.js Image Optimization detected`);
    return 'IMAGES';
  }
  
  for (const pattern of CACHE_CONFIG.PATTERNS.IMAGES) {
    if (pattern.test(pathname)) {
      console.log(`🖼️ SW: Image resource detected by pattern`);
      return 'IMAGES';
    }
  }
  
  // 5. 🔌 API-ЗАПРОСЫ
  for (const pattern of CACHE_CONFIG.PATTERNS.API) {
    if (pattern.test(pathname)) {
      console.log(`🔌 SW: API request detected`);
      return 'API';
    }
  }
  
  // 6. 📄 СТРАНИЦЫ (fallback)
  for (const pattern of CACHE_CONFIG.PATTERNS.HTML_PAGES) {
    if (pattern.test(pathname)) {
      console.log(`📄 SW: Page request detected (fallback)`);
      return 'HTML_PAGES';
    }
  }
  
  // 6.5. 🎯 ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ДЛЯ СТРАНИЦ
  // Если это GET-запрос к корню или известным страницам, считаем это HTML-страницей
  if (method === 'GET' && (pathname === '/' || pathname.startsWith('/profile') || pathname.startsWith('/statistics') || pathname.startsWith('/achievements') || pathname.startsWith('/courses') || pathname.startsWith('/favorites'))) {
    console.log(`📄 SW: Page request detected by path: ${pathname}`);
    return 'HTML_PAGES';
  }
  
  // 6.6. (удалено) Спец. обработка HTML для тренинговых страниц
  
  // 7. ❓ НЕИЗВЕСТНЫЙ ТИП
  console.log(`❓ SW: Unknown resource type, defaulting to API`);
  return 'API';
}

// 🎯 ОПРЕДЕЛЕНИЕ СТРАТЕГИИ КЭШИРОВАНИЯ
function getCachingStrategy(resourceType) {
  return CACHE_CONFIG.STRATEGIES[resourceType] || 'networkFirst';
}

// 🏗️ ПОЛУЧЕНИЕ ИМЕНИ КЭША
function getCacheName(resourceType) {
  return CACHE_CONFIG.CACHES[resourceType] || CACHE_CONFIG.CACHES.API;
}

// ⚡ УМНЫЕ СТРАТЕГИИ КЭШИРОВАНИЯ
// Реализуют различные подходы к кэшированию в зависимости от типа ресурса

// 🎯 CACHE FIRST - кэш в первую очередь (для статики и HTML)
async function cacheFirstStrategy(request, resourceType) {
  const cacheName = getCacheName(resourceType);
  const cache = await caches.open(cacheName);
  
  console.log(`🎯 SW: Cache First strategy for ${resourceType}: ${request.url}`);
  
  // (удалено) Спец. retry для HTML /trainings — используем RSC
  
  // 1. Проверяем кэш
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    console.log(`✅ SW: Cache hit for ${request.url}`);
    return cachedResponse;
  }
  
  // 2. Если нет в кэше - идем в сеть
  console.log(`🌐 SW: Cache miss, fetching from network: ${request.url}`);
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 3. Кэшируем успешный ответ
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      headers.set('sw-cache-type', resourceType);
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      
      await cache.put(request, modifiedResponse);
      // Для HTML страниц тренировок: также кешируем под нормализованным ключом без _rsc
      if (resourceType === 'HTML_PAGES' && request.url.includes('/trainings/')) {
        try {
          const normalizedRequest = getNormalizedRSCRequest(request);
          await cache.put(normalizedRequest, modifiedResponse.clone());
          console.log(`💾 SW: Also cached normalized HTML key: ${normalizedRequest.url}`);
        } catch (e) {
          console.warn('⚠️ SW: Failed to cache normalized HTML key', e);
        }
      }
      console.log(`💾 SW: Cached ${resourceType}: ${request.url}`);
      
      // 4. Очищаем старые записи
      await cleanupCache(cacheName, resourceType);
    }
    
    return networkResponse;
  } catch (error) {
    console.log(`❌ SW: Network error for ${request.url}:`, error);
    
    // 5. Специальный fallback для favicon.ico
    if (request.url.endsWith('/favicon.ico')) {
      console.log(`🖼️ SW: Providing favicon fallback for ${request.url}`);
      return new Response('', {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'image/x-icon',
          'sw-cache-time': Date.now().toString(),
          'sw-cache-type': 'IMAGES'
        }
      });
    }
    
    // 6. Fallback для HTML-страниц
    if (resourceType === 'HTML_PAGES') {
      return await getOfflineFallback(request);
    }
    
    throw error;
  }
}

// (удалено) cacheFirstWithRetry — не требуется

// 🌐 NETWORK FIRST - сеть в первую очередь (для API и RSC)
async function networkFirstStrategy(request, resourceType) {
  const cacheName = getCacheName(resourceType);
  const cache = await caches.open(cacheName);
  
  console.log(`🌐 SW: Network First strategy for ${resourceType}: ${request.url}`);
  
  // Специальная retry логика для RSC-запросов
  if (resourceType === 'RSC_DATA') {
    console.log(`🔄 SW: Using timeout strategy for RSC: ${request.url}`);
    return await networkFirstWithTimeout(request, cache, resourceType, RSC_NETWORK_TIMEOUT_MS);
  }
  
  try {
    // 1. Пробуем сеть
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 2. Кэшируем успешный ответ
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      headers.set('sw-cache-type', resourceType);
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      
      // Кладем под оригинальным ключом
      await cache.put(request, modifiedResponse);
      // И под нормализованным ключом без _rsc (чтобы офлайн работал с первого раза)
      try {
        const normalizedRequest = getNormalizedRSCRequest(request);
        // Клонируем response до его использования
        const normalizedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: headers,
        });
        await cache.put(normalizedRequest, normalizedResponse);
        console.log(`💾 SW: Also cached normalized RSC key: ${normalizedRequest.url}`);
      } catch (e) {
        console.warn('⚠️ SW: Failed to cache normalized RSC key', e);
      }
      console.log(`💾 SW: Cached ${resourceType}: ${request.url}`);
      
      // 3. Очищаем старые записи
      await cleanupCache(cacheName, resourceType);
    }
    
    return networkResponse;
  } catch (error) {
    console.log(`❌ SW: Network error, trying cache: ${request.url}`);
    
    // 4. Если сеть недоступна - пробуем кэш
    // Сначала пробуем точный ключ
    let cachedResponse = await cache.match(request);
    // Если промах — пробуем нормализованный ключ без _rsc
    if (!cachedResponse) {
      try {
        const normalizedRequest = getNormalizedRSCRequest(request);
        cachedResponse = await cache.match(normalizedRequest);
        if (cachedResponse) {
          console.log(`✅ SW: RSC normalized cache hit for ${normalizedRequest.url}`);
        }
      } catch (e) {
        console.warn('⚠️ SW: Failed to match normalized RSC key', e);
      }
    }
    if (cachedResponse) {
      console.log(`✅ SW: Cache fallback for ${request.url}`);
      return cachedResponse;
    }
    
    // 5. Fallback для RSC-запросов -> корректный RSC-ответ
    if (resourceType === 'RSC_DATA') {
      return await getRSCFallback(request);
    }
    
    // 6. Fallback для HTML-страниц
    if (resourceType === 'HTML_PAGES') {
      return await getOfflineFallback(request);
    }
    
    throw error;
  }
}

// 🔄 Network-first with timeout для RSC-запросов
async function networkFirstWithTimeout(request, cache, resourceType, timeoutMs) {
  function fetchWithTimeout(req, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      fetch(req).then((res) => {
        clearTimeout(timer);
        resolve(res);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // 1) Быстрая попытка сети с таймаутом
  try {
    const networkResponse = await fetchWithTimeout(request, timeoutMs);
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      headers.set('sw-cache-type', resourceType);
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      // Под оригинальным ключом
      await cache.put(request, modifiedResponse);
      // И под нормализованным ключом без _rsc
      try {
        const normalizedRequest = getNormalizedRSCRequest(request);
        // Клонируем response до его использования
        const normalizedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: headers,
        });
        await cache.put(normalizedRequest, normalizedResponse);
        console.log(`💾 SW: Also cached normalized RSC key: ${normalizedRequest.url}`);
      } catch (e) {
        console.warn('⚠️ SW: Failed to cache normalized RSC key', e);
      }
      return networkResponse;
    }
  } catch (e) {
    console.log(`❌ SW: RSC network attempt failed or timed out for ${request.url}`);
  }

  // 2) Падаем в кэш: сначала точный ключ
  let cachedResponse = await cache.match(request);
  // Затем нормализованный без _rsc
  if (!cachedResponse) {
    try {
      const normalizedRequest = getNormalizedRSCRequest(request);
      cachedResponse = await cache.match(normalizedRequest);
      if (cachedResponse) {
        console.log(`✅ SW: RSC normalized cache hit for ${normalizedRequest.url}`);
      }
    } catch (e) {
      console.warn('⚠️ SW: Failed to match normalized RSC key', e);
    }
  }
  // Затем поиск по pathname без query
  if (!cachedResponse) {
    try {
      const cacheName = getCacheName(resourceType);
      const rscCache = await caches.open(cacheName);
      const keys = await rscCache.keys();
      const reqUrl = new URL(request.url);
      const matchKey = keys.find(k => {
        try {
          const kUrl = new URL(k.url);
          return kUrl.origin === reqUrl.origin && kUrl.pathname === reqUrl.pathname;
        } catch { return false; }
      });
      if (matchKey) {
        console.log(`✅ SW: RSC pathname cache hit for ${reqUrl.pathname} via ${matchKey.url}`);
        cachedResponse = await rscCache.match(matchKey);
      }
    } catch (e) {
      console.warn('⚠️ SW: Pathname-based RSC lookup failed', e);
    }
  }
  if (cachedResponse) return cachedResponse;

  // 3) Последний fallback — HTML офлайн-страница (поведение Next заглушки)
  console.log(`🆘 SW: No RSC data available, using HTML offline fallback: ${request.url}`);
  return await getOfflineFallback(request);
}

// 🧹 УМНАЯ ОЧИСТКА КЭША
async function cleanupCache(cacheName, resourceType) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const limit = CACHE_CONFIG.LIMITS[resourceType] || 100;
  
  if (keys.length <= limit) return;
  
  console.log(`🧹 SW: Cleaning up ${cacheName}, current: ${keys.length}, limit: ${limit}`);
  
  // Сортируем по времени кэширования (старые первыми)
  const entries = await Promise.all(
    keys.map(async (key) => {
      const response = await cache.match(key);
      const cacheTime = response?.headers.get('sw-cache-time') || '0';
      return { key, cacheTime: parseInt(cacheTime) };
    })
  );
  
  entries.sort((a, b) => a.cacheTime - b.cacheTime);
  
  // Удаляем старые записи
  const toDelete = entries.slice(0, entries.length - limit);
  await Promise.all(toDelete.map(entry => cache.delete(entry.key)));
  
  console.log(`🗑️ SW: Deleted ${toDelete.length} old entries from ${cacheName}`);
}

// 🆘 FALLBACK ДЛЯ ОФЛАЙН-СТРАНИЦ
async function getOfflineFallback(request) {
  console.log(`🆘 SW: Providing offline fallback for: ${request.url}`);
  
  // Пробуем найти похожую страницу в кэше
  const htmlCache = await caches.open(CACHE_CONFIG.CACHES.HTML_PAGES);
  const keys = await htmlCache.keys();
  
  // Ищем страницу по пути (игнорируя query параметры)
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  for (const key of keys) {
    const keyUrl = new URL(key.url);
    if (keyUrl.pathname === pathname) {
      console.log(`🎯 SW: Found similar page in cache: ${key.url}`);
      return await htmlCache.match(key);
    }
  }
  
  // Если не нашли - возвращаем общую офлайн-страницу
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Офлайн - Gafus</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
               margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; 
                    padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .icon { font-size: 48px; text-align: center; margin-bottom: 20px; }
        h1 { color: #333; text-align: center; margin-bottom: 20px; }
        p { color: #666; line-height: 1.6; text-align: center; }
        .retry { background: #007bff; color: white; border: none; 
                padding: 12px 24px; border-radius: 6px; cursor: pointer; 
                margin-top: 20px; display: block; margin-left: auto; margin-right: auto; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📱</div>
        <h1>Нет подключения к интернету</h1>
        <p>Проверьте подключение к интернету и попробуйте снова.</p>
        <button class="retry" onclick="window.location.reload()">Попробовать снова</button>
      </div>
    </body>
    </html>
  `, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/html' }
  });
}

// 🔄 FALLBACK ДЛЯ RSC-ЗАПРОСОВ
async function getRSCFallback(request) {
  console.log(`🔄 SW: Providing RSC fallback for: ${request.url}`);
  
  // Возвращаем валидный RSC-ответ с минимальными данными
  // Next.js ожидает JSON с компонентами
  const rscData = {
    "0": ["$", "div", null, {"children": ["$", "div", null, {"children": "Нет подключения к интернету", "className": "text-center p-8"}]}]
  };
  
  return new Response(JSON.stringify(rscData), {
    status: 200,
    statusText: 'OK',
    headers: { 
      'Content-Type': 'text/x-component',
      'sw-fallback': 'rsc-offline'
    }
  });
}

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

// Нормализация запросов страниц: удаляем волатильные параметры (например, _rsc у Next.js)
function getNormalizedPageRequest(originalRequest) {
  try {
    const originalUrl = new URL(originalRequest.url);
    const normalizedUrl = new URL(originalUrl.toString());
    // Удаляем параметр _rsc, чтобы кэш не разрастался и хиты совпадали
    if (normalizedUrl.searchParams.has('_rsc')) {
      normalizedUrl.searchParams.delete('_rsc');
    }
    // Можно при необходимости очищать и другие метки трекинга (utm_* и т.п.)
    return new Request(normalizedUrl.toString(), { method: 'GET' });
  } catch {
    return originalRequest;
  }
}

// Нормализация RSC-запросов: удаляем волатильный параметр _rsc
function getNormalizedRSCRequest(originalRequest) {
  try {
    const originalUrl = new URL(originalRequest.url);
    const normalizedUrl = new URL(originalUrl.toString());
    if (normalizedUrl.searchParams.has('_rsc')) {
      normalizedUrl.searchParams.delete('_rsc');
    }
    return new Request(normalizedUrl.toString(), { method: 'GET' });
  } catch {
    return originalRequest;
  }
}

// Install event
self.addEventListener('install', (event) => {
  console.log('📦 SW: Install event - Setting up caches');
  
  event.waitUntil(
    (async () => {
      try {
        // Создаем все необходимые кэши
        const cacheNames = [
          CACHE_CONFIG.CACHES.HTML_PAGES,
          CACHE_CONFIG.CACHES.RSC_DATA,
          CACHE_CONFIG.CACHES.STATIC,
          CACHE_CONFIG.CACHES.API,
          CACHE_CONFIG.CACHES.IMAGES,
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
        const currentCacheNames = Object.values(CACHE_CONFIG.CACHES);
        
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
        
        // 🎯 ПРЕДВАРИТЕЛЬНОЕ КЭШИРОВАНИЕ HTML-СТРАНИЦ
        await precacheHTMLPages();
      } catch (error) {
        console.error('❌ SW: Failed to cleanup caches:', error);
      }
    })()
  );
});

// 🎯 ФУНКЦИЯ ПРЕДВАРИТЕЛЬНОГО КЭШИРОВАНИЯ HTML-СТРАНИЦ
async function precacheHTMLPages() {
  console.log('🎯 SW: Starting HTML pages precaching');
  
  try {
    const htmlCache = await caches.open(CACHE_CONFIG.CACHES.HTML_PAGES);
    const pagesToCache = [
      '/',
      '/profile?username=admin',
      '/statistics',
      '/achievements',
      '/courses',
      '/favorites'
    ];
    
    // Кэшируем favicon.ico
    const faviconUrl = '/favicon.ico';
    try {
      console.log(`🎯 SW: Precaching favicon: ${faviconUrl}`);
      
      const faviconRequest = new Request(faviconUrl, {
        method: 'GET',
        headers: {
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
      
      const faviconResponse = await fetch(faviconRequest);
      
      if (faviconResponse.ok) {
        const modifiedResponse = new Response(faviconResponse.body, {
          status: faviconResponse.status,
          statusText: faviconResponse.statusText,
          headers: {
            ...Object.fromEntries(faviconResponse.headers.entries()),
            'sw-cache-time': Date.now().toString(),
            'sw-cache-type': 'IMAGES'
          }
        });
        
        await htmlCache.put(faviconRequest, modifiedResponse);
        console.log(`✅ SW: Precached favicon: ${faviconUrl}`);
      } else {
        console.warn(`⚠️ SW: Favicon not found, creating fallback`);
        // Создаем простой favicon fallback
        const fallbackFavicon = new Response('', {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'image/x-icon',
            'sw-cache-time': Date.now().toString(),
            'sw-cache-type': 'IMAGES'
          }
        });
        
        await htmlCache.put(faviconRequest, fallbackFavicon);
        console.log(`✅ SW: Created favicon fallback`);
      }
    } catch (error) {
      console.warn(`⚠️ SW: Failed to precache favicon:`, error);
    }
    
    for (const pageUrl of pagesToCache) {
      try {
        console.log(`🎯 SW: Precaching HTML page: ${pageUrl}`);
        
        // Создаем запрос с правильными заголовками для получения HTML
        const request = new Request(pageUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Cache-Control': 'no-cache'
          },
          mode: 'cors'
        });
        
        const response = await fetch(request);
        
        if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
          const modifiedResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              ...Object.fromEntries(response.headers.entries()),
              'sw-cache-time': Date.now().toString(),
              'sw-cache-type': 'HTML_PAGES'
            }
          });
          
          await htmlCache.put(request, modifiedResponse);
          console.log(`✅ SW: Precached HTML page: ${pageUrl}`);
        } else {
          console.warn(`⚠️ SW: Response not HTML for ${pageUrl}:`, response.headers.get('Content-Type'));
        }
      } catch (error) {
        console.warn(`⚠️ SW: Failed to precache ${pageUrl}:`, error);
      }
    }
    
    console.log('✅ SW: HTML pages precaching completed');
  } catch (error) {
    console.error('❌ SW: Error in precacheHTMLPages:', error);
  }
}

// Fetch event handler для кэширования
// 🎯 ГЛАВНЫЙ ОБРАБОТЧИК FETCH СОБЫТИЙ
// Использует новую гибридную стратегию кэширования

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  console.log(`🌐 SW: Fetch intercepted: ${request.url}, method: ${request.method}, mode: ${request.mode}`);
  
  // Пропускаем не-GET запросы (кроме API)
  if (request.method !== 'GET' && !url.pathname.startsWith('/api/')) {
    console.log(`⏭️ SW: Skipping non-GET request: ${request.url}`);
    return;
  }
  
  // Пропускаем chrome-extension и другие протоколы
  if (!url.protocol.startsWith('http')) {
    console.log(`⏭️ SW: Skipping non-HTTP request: ${request.url}`);
    return;
  }
  
  try {
    // 🧠 Определяем тип ресурса с помощью умной системы
    const resourceType = getResourceType(request);
    const strategy = getCachingStrategy(resourceType);
    
    console.log(`🎯 SW: Resource type: ${resourceType}, Strategy: ${strategy}`);
    
    // 🚀 Обрабатываем запрос с соответствующей стратегией
    event.respondWith(handleRequest(request, resourceType, strategy));
  } catch (error) {
    console.error(`❌ SW: Error in fetch handler:`, error);
    // Возвращаем ошибку, чтобы браузер мог обработать запрос сам
    event.respondWith(new Response('Service Worker Error', { 
      status: 500, 
      statusText: 'Internal Server Error' 
    }));
  }
});

// 🚀 ГЛАВНАЯ ФУНКЦИЯ ОБРАБОТКИ ЗАПРОСОВ
// Использует новую гибридную стратегию кэширования

async function handleRequest(request, resourceType, strategy) {
  console.log(`🚀 SW: Handling ${resourceType} request with ${strategy} strategy: ${request.url}`);
  
  try {
    // Выбираем стратегию кэширования
    switch (strategy) {
      case 'cacheFirst':
        console.log(`🎯 SW: Using cacheFirst strategy for ${resourceType}`);
        return await cacheFirstStrategy(request, resourceType);
      
      case 'networkFirst':
        console.log(`🌐 SW: Using networkFirst strategy for ${resourceType}`);
        return await networkFirstStrategy(request, resourceType);
      
      default:
        console.warn(`⚠️ SW: Unknown strategy ${strategy}, using networkFirst`);
        return await networkFirstStrategy(request, resourceType);
    }
  } catch (error) {
    console.error(`❌ SW: Request failed for ${request.url}:`, error);
    console.error(`❌ SW: Error details:`, error.stack);
    
    // Fallback для страниц - показываем офлайн страницу
    if (resourceType === 'HTML_PAGES') {
      return await getOfflineFallback(request);
    }
    
    // Fallback для RSC-запросов
    if (resourceType === 'RSC_DATA') {
      return await getRSCFallback(request);
    }
    
    // Для остальных типов возвращаем ошибку
    return new Response('Offline', { 
      status: 503, 
      statusText: 'Service Unavailable' 
    });
  }
}

// 🗑️ УДАЛЕНЫ СТАРЫЕ ФУНКЦИИ - используются новые функции выше

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