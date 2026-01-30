// Кастомный Service Worker для Gafus
// Отвечает за push-уведомления и перехват сетевых запросов для определения офлайна
// Кэширование удалено - данные курсов хранятся в IndexedDB
// Исключение: страница офлайна кэшируется для работы в офлайне

// Логирование критичных ошибок для мониторинга в продакшене

const RSC_TIMEOUT_MS = 3000;

function isRscRequest(url, request) {
  if (!url || !request) {
    return false;
  }

  if (url.searchParams && url.searchParams.has('_rsc')) {
    return true;
  }

  const rscHeader = request.headers.get('RSC');
  if (rscHeader === '1' || rscHeader === 'true') {
    return true;
  }

  const acceptHeader = request.headers.get('Accept') || '';
  return acceptHeader.includes('text/x-component');
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Константы для IndexedDB (дублируем для Service Worker)
const IDB_DB_NAME = "gafus-offline-courses";
const IDB_DB_VERSION = 1;
const IDB_STORE_NAME = "courses";

/**
 * Открывает IndexedDB в Service Worker
 */
async function openIDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: "courseId" });
        store.createIndex("courseType", "courseType", { unique: false });
        store.createIndex("version", "version", { unique: false });
        store.createIndex("downloadedAt", "downloadedAt", { unique: false });
      }
    };
  });
}

/**
 * Получает курс из IndexedDB по типу
 */
async function getOfflineCourseByType(courseType) {
  try {
    const db = await openIDB();
    const transaction = db.transaction([IDB_STORE_NAME], "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const index = store.index("courseType");
    
    return new Promise((resolve, reject) => {
      const request = index.get(courseType);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Failed to get course from IndexedDB', error, { courseType });
    return null;
  }
}

/**
 * Обрабатывает Range-запрос для Blob
 */
function handleRangeRequest(blob, rangeHeader) {
  if (!rangeHeader) {
    return { start: 0, end: blob.size - 1, total: blob.size };
  }
  
  const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!matches) {
    return { start: 0, end: blob.size - 1, total: blob.size };
  }
  
  const start = parseInt(matches[1], 10);
  const end = matches[2] ? parseInt(matches[2], 10) : blob.size - 1;
  
  return {
    start: Math.max(0, start),
    end: Math.min(end, blob.size - 1),
    total: blob.size
  };
}

/**
 * Создает Response с правильными заголовками для Range-запроса
 */
function createRangeResponse(blob, range) {
  const blobSlice = blob.slice(range.start, range.end + 1);
  const contentLength = range.end - range.start + 1;
  
  const headers = {
    'Content-Type': blob.type || 'application/octet-stream',
    'Content-Length': contentLength.toString(),
    'Content-Range': `bytes ${range.start}-${range.end}/${range.total}`,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Cache-Control': 'public, max-age=31536000, immutable'
  };
  
  return new Response(blobSlice, {
    status: 206,
    statusText: 'Partial Content',
    headers
  });
}

/**
 * Обрабатывает запрос к офлайн HLS манифесту
 */
async function handleOfflineHLSManifest(courseType, videoId) {
  try {
    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      return null;
    }
    
    const hlsVideos = offlineCourse.mediaFiles.hlsVideos;
    
    // Ищем видео по videoId
    let hlsVideo = null;
    for (const [, video] of Object.entries(hlsVideos)) {
      if (video.videoId === videoId) {
        hlsVideo = video;
        break;
      }
    }
    
    if (!hlsVideo) {
      return null;
    }
    
    // Создаем модифицированный манифест с Service Worker URLs для сегментов
    const manifestLines = hlsVideo.manifest.split('\n');
    const modifiedLines = manifestLines.map((line) => {
      const trimmed = line.trim();
      // Пропускаем комментарии и пустые строки
      if (trimmed && !trimmed.startsWith('#')) {
        // Нормализуем имя файла и заменяем путь сегмента на Service Worker URL
        const segmentFileName = getFileNameFromPath(trimmed);
        return `/offline-hls/${courseType}/${videoId}/segment/${segmentFileName}`;
      }
      return line;
    });
    
    const modifiedManifest = modifiedLines.join('\n');
    const manifestBlob = new Blob([modifiedManifest], {
      type: 'application/vnd.apple.mpegurl'
    });
    
    return new Response(manifestBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Content-Length': manifestBlob.size.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  } catch (error) {
    console.error('[SW] Error handling offline HLS manifest', error, { courseType, videoId });
    return null;
  }
}

/**
 * Нормализует имя файла из пути (извлекает только имя файла)
 */
function getFileNameFromPath(path) {
  const normalized = path.trim().replace(/^\/+/, "").replace(/^\.\.\//, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

/**
 * Обрабатывает запрос к офлайн HLS сегменту
 */
async function handleOfflineHLSSegment(courseType, videoId, segmentName) {
  try {
    const offlineCourse = await getOfflineCourseByType(courseType);
    if (!offlineCourse) {
      return null;
    }
    
    const hlsVideos = offlineCourse.mediaFiles.hlsVideos;
    
    // Ищем видео по videoId
    let hlsVideo = null;
    for (const [, video] of Object.entries(hlsVideos)) {
      if (video.videoId === videoId) {
        hlsVideo = video;
        break;
      }
    }
    
    if (!hlsVideo) {
      return null;
    }
    
    // Нормализуем имя сегмента (на случай если пришло с путем)
    const normalizedSegmentName = getFileNameFromPath(segmentName);
    
    // Получаем сегмент
    const segmentBlob = hlsVideo.segments[normalizedSegmentName];
    if (!segmentBlob) {
      console.warn('[SW] Segment not found', {
        courseType,
        videoId,
        segmentName,
        normalizedSegmentName,
        availableSegments: Object.keys(hlsVideo.segments).slice(0, 5)
      });
      return null;
    }
    
    return segmentBlob;
  } catch (error) {
    console.error('[SW] Error handling offline HLS segment', error, { courseType, videoId, segmentName });
    return null;
  }
}

// Перехват fetch запросов для определения сетевых ошибок
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNavigationRequest = event.request.mode === 'navigate';
  
  // Обработка офлайн HLS запросов (должно быть ПЕРВЫМ, до других проверок)
  if (url.pathname.startsWith('/offline-hls/')) {
    event.respondWith(
      (async () => {
        try {
          // Парсим путь: /offline-hls/{courseType}/{videoId}/manifest.m3u8
          // или /offline-hls/{courseType}/{videoId}/segment/{segmentName}
          const pathParts = url.pathname.split('/').filter(Boolean);
          
          if (pathParts.length < 3) {
            return new Response('Invalid path', { status: 400 });
          }
          
          const [, courseType, videoId, ...rest] = pathParts;
          
          if (!courseType || !videoId) {
            return new Response('Missing courseType or videoId', { status: 400 });
          }
          
          // Запрос к манифесту
          if (rest.length === 1 && rest[0].endsWith('.m3u8')) {
            const manifestResponse = await handleOfflineHLSManifest(courseType, videoId);
            if (manifestResponse) {
              return manifestResponse;
            }
            return new Response('Manifest not found', { status: 404 });
          }
          
          // Запрос к сегменту
          if (rest.length === 2 && rest[0] === 'segment') {
            const segmentName = rest[1];
            const segmentBlob = await handleOfflineHLSSegment(courseType, videoId, segmentName);
            
            if (!segmentBlob) {
              return new Response('Segment not found', { status: 404 });
            }
            
            // Обрабатываем Range-запросы
            const rangeHeader = event.request.headers.get('Range');
            const range = handleRangeRequest(segmentBlob, rangeHeader);
            
            if (rangeHeader) {
              return createRangeResponse(segmentBlob, range);
            }
            
            // Обычный запрос без Range
            return new Response(segmentBlob, {
              status: 200,
              headers: {
                'Content-Type': segmentBlob.type || 'video/mp2t',
                'Content-Length': segmentBlob.size.toString(),
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': 'Range',
                'Cache-Control': 'public, max-age=31536000, immutable'
              }
            });
          }
          
          return new Response('Invalid path', { status: 400 });
        } catch (error) {
          console.error('[SW] Error in offline HLS handler', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      })()
    );
    return;
  }
  
  // Игнорируем статические ресурсы и API
  // Также игнорируем /uploads/ - эти запросы обрабатываются через useOfflineMediaUrl
  // который заменяет URL на blob URL из IndexedDB перед загрузкой
  if (
    url.pathname === '/api/ping' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.protocol === 'data:' ||
    url.protocol === 'blob:'
  ) {
    return; // Пропускаем обработку - браузер обработает сам
  }

  // Для статических файлов Next.js (_next/static/) используем Cache-First стратегию
  // Это необходимо для работы приложения в офлайне
  // Chunks кэшируются при скачивании курса через cacheChunksFromHtml
  // Должно быть ПЕРЕД общей проверкой на /_next/
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        
        // Если файл есть в кэше, возвращаем его (из офлайн-скачанного курса)
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Если файла нет в кэше, пытаемся загрузить из сети
        try {
          const response = await fetch(event.request);
          
          // Если запрос успешен, кэшируем и возвращаем
          if (response.ok) {
            notifyClient('ONLINE');
            // Кэшируем только успешные ответы
            cache.put(event.request, response.clone());
            return response;
          }
          
          // Если ответ не успешен, возвращаем его как есть
          return response;
        } catch (error) {
          // Если не удалось загрузить и файла нет в кэше, возвращаем ошибку
          // Это вызовет ChunkLoadError, но это ожидаемо для нескачанных chunks
          notifyClient('OFFLINE', { error: 'Static file not cached' });
          throw error;
        }
      })()
    );
    return;
  }

  // Для chunks страницы офлайна используем Cache-First стратегию
  if (url.pathname.startsWith('/_next/') && url.pathname.includes('~offline')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        
        if (cachedResponse) {
          return cachedResponse;
        }
        
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (error) {
          // Если нет в кэше и сеть недоступна, возвращаем пустой ответ
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'Content-Type': 'application/javascript',
              'Cache-Control': 'no-cache'
            }
          });
        }
      })()
    );
    return;
  }

  // Игнорируем остальные статические ресурсы Next.js (но не /_next/static/)
  if (url.pathname.startsWith('/_next/')) {
    return; // Пропускаем обработку - браузер обработает сам
  }

  // Для страницы офлайна используем Cache-First стратегию (лучшая практика для статического контента)
  if (isNavigationRequest && url.pathname === '/~offline') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_PAGE_URL);
        
        if (cachedResponse) {
          // Если есть в кэше, возвращаем и пытаемся обновить в фоне
          event.waitUntil(
            (async () => {
              try {
                const response = await fetch(event.request);
                if (response.ok) {
                  await cache.put(OFFLINE_PAGE_URL, response.clone());
                  // Также пытаемся кэшировать chunks из HTML
                  await cacheOfflinePageChunks(response, cache);
                }
              } catch (error) {
                // Игнорируем ошибки обновления
              }
            })()
          );
          return cachedResponse;
        }
        
        // Если нет в кэше, пытаемся загрузить из сети
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            // Кэшируем HTML
            await cache.put(OFFLINE_PAGE_URL, response.clone());
            // Кэшируем все chunks страницы
            await cacheOfflinePageChunks(response, cache);
            return response;
          }
        } catch (error) {
          // Если не удалось загрузить, возвращаем fallback
        }
        
        // Fallback HTML если ничего не сработало
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Офлайн</title></head><body><h1>Нет соединения</h1><p>Приложение работает в офлайн-режиме.</p><script>(function(){function redirectIfOnline(){if(navigator.onLine){window.location.replace("/courses");}}window.addEventListener("online",redirectIfOnline);setInterval(redirectIfOnline,3000);redirectIfOnline();})();</script></body></html>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      })()
    );
    return;
  }

  // Для страниц курсов разрешаем навигацию даже в офлайне
  // Данные курсов хранятся в IndexedDB, клиент сам их загрузит через useCachedTrainingDays
  // Service Worker кэширует только HTML структуру страницы
  if (isNavigationRequest && isCoursePage(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const coursesCache = await caches.open(COURSES_CACHE_NAME);
          const cacheKey = event.request.url;
        
          try {
            // Пытаемся загрузить HTML страницы из сети (Network-First)
            const controller = new AbortController();
            const timeoutMs = 10000; // 10s — даём время на редирект/ответ сервера, иначе попадаем в IndexedDB и белый экран
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            
            const response = await fetch(event.request, {
              cache: 'no-cache',
              signal: controller.signal,
              redirect: 'manual' // не следовать редиректу — отдавать 302 браузеру (иначе под /trainings/xxx кэшируется HTML с / и белый экран)
            });
            
            clearTimeout(timeoutId);
            
            // Редирект (3xx) — отдаём как есть, браузер сам перейдёт
            if (response.status >= 300 && response.status < 400) {
              return response;
            }
            
            // Если запрос успешен (200), кэшируем HTML и возвращаем
            if (response.ok) {
              notifyClient('ONLINE');
              // Кэшируем HTML структуру страницы для офлайн-доступа
              // Данные курса клиент возьмет из IndexedDB
              coursesCache.put(cacheKey, response.clone());
              
              // Кэшируем chunks страницы для офлайн-доступа
              // Извлекаем ссылки на chunks из HTML и кэшируем их
              cachePageChunks(response.clone(), OFFLINE_CACHE_NAME);
              
              return response;
            }
            
            // Ошибки (4xx, 5xx) — возвращаем как есть
            if (response.status >= 400) {
              return response;
            }
          } catch (error) {
            // Обрабатываем все типы ошибок, включая AbortError
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAbortError = errorMessage.includes('aborted') || errorMessage.includes('AbortError');
            
            // AbortError и другие сетевые ошибки - пробуем вернуть HTML страницы из кэша
            const cachedResponse = await coursesCache.match(cacheKey);
            if (cachedResponse) {
              notifyClient('OFFLINE', { 
                error: isAbortError ? 'Request aborted, using cached HTML' : 'Using cached course page HTML' 
              });
              return cachedResponse;
            }
            
            // Если это AbortError и нет кэша, продолжаем обработку ниже (получение из IndexedDB)
            // Не пробрасываем ошибку дальше, чтобы не вызвать ошибку в event.respondWith
          }
          
          // Если HTML нет в кэше, пробуем получить через клиента из IndexedDB
          // (Service Worker не может напрямую читать IndexedDB)
          // Нормализуем URL (убираем trailing slash)
          const requestKey = url.pathname.replace(/\/$/, '') || url.pathname;
          
          // Создаем Promise, который резолвится когда клиент отправит HTML
          const htmlPromise = new Promise((resolve) => {
            pendingHtmlRequests.set(requestKey, resolve);
          });
          
          // Отправляем запрос клиенту
          notifyClient('OFFLINE', { 
            error: 'Course page HTML not in cache',
            action: 'GET_HTML_FROM_INDEXEDDB',
            url: requestKey
          });
          
          // Определяем таймаут: 5 секунд для всех платформ
          const timeoutMs = 5000;
          
          console.log('[SW] Waiting for HTML from IndexedDB', {
            url: requestKey,
            timeoutMs,
          });
          
          // Ждем HTML от клиента с таймаутом (5 сек по всей платформе)
          let htmlFromIndexedDB = null;
          try {
            htmlFromIndexedDB = await Promise.race([
              htmlPromise.then((html) => html),
              new Promise((resolve) => {
                setTimeout(() => resolve(null), timeoutMs);
              })
            ]);
          } catch (error) {
            // Игнорируем ошибки ожидания HTML
          } finally {
            pendingHtmlRequests.delete(requestKey);
          }
          
          // Если HTML пришел от клиента, сохраняем в кэш и возвращаем
          if (htmlFromIndexedDB) {
            const htmlResponse = new Response(htmlFromIndexedDB, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
              }
            });
            
            // Сохраняем в кэш для следующего раза
            coursesCache.put(cacheKey, htmlResponse.clone()).catch(() => {
              // Игнорируем ошибки сохранения в кэш
            });
            return htmlResponse;
          }
          
          // Если HTML не пришел, проверяем кэш еще раз (на случай если клиент успел сохранить)
          const cachedAfterRequest = await coursesCache.match(cacheKey);
          if (cachedAfterRequest) {
            return cachedAfterRequest;
          }
          
          // Нет HTML (сеть упала/таймаут, кэш пуст, IndexedDB не ответил) — редирект на / вместо пустой оболочки (белый экран)
          const origin = new URL(event.request.url).origin;
          return Response.redirect(origin + '/', 302);
        } catch (outerError) {
          // Защита от любых необработанных ошибок
          // Всегда возвращаем валидный Response, чтобы не показать ошибку пользователю
          const outerErrorMessage = outerError instanceof Error ? outerError.message : String(outerError);
          console.error('[SW] Unhandled error in course page handler', outerError, {
            url: url.pathname,
            error: outerErrorMessage
          });
          
          // Пробуем вернуть базовый HTML
          const fallbackHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Загрузка...</title>
</head>
<body>
  <div id="__next"></div>
  <script>
    // Next.js обработает навигацию на клиенте
    // Данные будут загружены из IndexedDB через useCachedTrainingDays
  </script>
</body>
</html>`;
          
          return new Response(fallbackHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache'
            }
          });
        }
      })()
    );
    return;
  }

  // Для остальных навигационных запросов используем Network-First с fallback на страницу офлайна
  // ВАЖНО: НЕ обрабатываем страницы курсов здесь - они обрабатываются выше
  // Это предотвращает редирект на офлайн страницу для скачанных курсов
  if (isNavigationRequest && !isCoursePage(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          try {
            // Используем AbortController для таймаута
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const response = await fetch(event.request, { 
              cache: 'no-cache',
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Если запрос успешен, отправляем сообщение клиенту что мы онлайн
            if (response.ok) {
              notifyClient('ONLINE');
            }
            return response;
          } catch (error) {
          // Определяем все типы сетевых ошибок, включая AbortError
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorName = error instanceof Error ? error.name : '';
          
          // AbortError - это тоже сетевая ошибка (запрос был прерван)
          const isAbortError = errorName === 'AbortError' || 
                               errorMessage.includes('aborted') || 
                               errorMessage.includes('AbortError');
          
          const isNetworkError = 
            isAbortError ||
            (error instanceof TypeError &&
            (errorMessage.includes('Failed to fetch') ||
              errorMessage.includes('NetworkError') ||
              errorMessage.includes('Network request failed') ||
              errorMessage.includes('Load failed') ||
              errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
              errorMessage.includes('ERR_NETWORK_CHANGED') ||
              errorMessage.includes('ERR_CONNECTION_REFUSED') ||
              errorMessage.includes('ERR_CONNECTION_RESET') ||
              errorMessage.includes('ERR_CONNECTION_CLOSED') ||
              errorMessage.includes('ERR_CONNECTION_ABORTED') ||
              errorMessage.includes('ERR_NAME_NOT_RESOLVED')));

          // При сетевой ошибке - отправляем сообщение клиенту, но НЕ делаем редирект
          // Редирект должен обрабатываться в offlineDetector.ts с проверкой на скачанные курсы
          if (isNetworkError) {
            notifyClient('OFFLINE', { error: errorMessage });
            
            const cache = await caches.open(OFFLINE_CACHE_NAME);
            const cachedResponse = await cache.match(OFFLINE_PAGE_URL);
            
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Fallback HTML без автоматического редиректа
            // Редирект обрабатывается в offlineDetector.ts
            const fallbackHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Нет соединения</title>
</head>
<body>
  <p style="text-align: center; padding: 20px; font-family: sans-serif;">
    Нет соединения с сервером. Ожидание обработки...
  </p>
</body>
</html>`;
            
            return new Response(fallbackHtml, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
              }
            });
          }
          
          // Если это не сетевая ошибка, все равно возвращаем fallback
          // Не пробрасываем ошибку, чтобы не вызвать "Load failed" в event.respondWith
          logger.warn('Non-network error in navigation request, returning offline page', {
            error: errorMessage,
            url: event.request.url
          });
          
          const cache = await caches.open(OFFLINE_CACHE_NAME);
          const cachedResponse = await cache.match(OFFLINE_PAGE_URL);
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Fallback HTML
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body><h1>Ошибка загрузки</h1><p>Попробуйте обновить страницу.</p></body></html>',
            {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
          }
        } catch (outerError) {
          // Дополнительная защита - если что-то пошло не так в обработке ошибок
          const outerErrorMessage = outerError instanceof Error ? outerError.message : String(outerError);
          console.error('[SW] Unhandled error in navigation request handler', outerError, {
            url: event.request.url,
            error: outerErrorMessage
          });
          
          // Всегда возвращаем валидный Response
          try {
            const cache = await caches.open(OFFLINE_CACHE_NAME);
            const cachedResponse = await cache.match(OFFLINE_PAGE_URL);
            if (cachedResponse) {
              return cachedResponse;
            }
          } catch (cacheError) {
            // Игнорируем ошибки кэша
          }
          
          // Последний fallback
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body><h1>Ошибка загрузки</h1><p>Попробуйте обновить страницу.</p></body></html>',
            {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        }
      })()
    );
    return;
  }

  // Для всех остальных запросов пытаемся выполнить их
  // Если запрос не удался, это будет сетевой ошибка
  // Для не-навигационных запросов обрабатываем ошибки gracefully
  event.respondWith(
    (async () => {
      try {
        const shouldTimeout = isRscRequest(url, event.request);
        const response = shouldTimeout
          ? await fetchWithTimeout(event.request, RSC_TIMEOUT_MS)
          : await fetch(event.request);
        
        // Если запрос успешен, отправляем сообщение клиенту что мы онлайн
        if (response.ok) {
          notifyClient('ONLINE');
        }
        return response;
      } catch (error) {
        // Определяем все типы сетевых ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : '';
        const isAbortError = errorName === 'AbortError' || 
                             errorMessage.includes('aborted') || 
                             errorMessage.includes('AbortError');
        
        const isNetworkError = 
          isAbortError ||
          (error instanceof TypeError &&
          (errorMessage.includes('Failed to fetch') ||
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('Network request failed') ||
            errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMessage.includes('ERR_NETWORK_CHANGED') ||
            errorMessage.includes('ERR_CONNECTION_REFUSED') ||
            errorMessage.includes('ERR_CONNECTION_RESET') ||
            errorMessage.includes('ERR_CONNECTION_CLOSED') ||
            errorMessage.includes('ERR_CONNECTION_ABORTED') ||
            errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
            errorMessage.includes('Load failed')));

        // При сетевой ошибке отправляем сообщение клиенту что мы офлайн
        if (isNetworkError) {
          notifyClient('OFFLINE', { error: errorMessage });
        }
        
        // Для не-навигационных запросов возвращаем пустой ответ вместо проброса ошибки
        // Это предотвращает необработанные исключения в консоли
        if (!isNavigationRequest) {
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache'
            }
          });
        }
        
        // Для навигационных запросов проверяем, не является ли запрос страницей курса
        // Если это страница курса, не возвращаем страницу офлайна - пусть обрабатывается выше
        // (хотя страницы курсов должны обрабатываться выше, но на всякий случай проверяем)
        if (isCoursePage(url.pathname)) {
          // Если это страница курса, возвращаем базовый HTML вместо страницы офлайна
          // Редирект должен обрабатываться в offlineDetector.ts с проверкой на скачанные курсы
          const baseHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Загрузка...</title>
</head>
<body>
  <div id="__next"></div>
  <script>
    // Next.js обработает навигацию на клиенте
    // Данные будут загружены из IndexedDB через useCachedTrainingDays
  </script>
</body>
</html>`;
          
          return new Response(baseHtml, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache'
            }
          });
        }
        
        // Для остальных навигационных запросов возвращаем страницу офлайна
        // НЕ пробрасываем ошибку, чтобы не вызвать "Load failed"
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_PAGE_URL);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Fallback HTML
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body><h1>Ошибка загрузки</h1><p>Попробуйте обновить страницу.</p></body></html>',
          {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      }
    })()
  );
});

// Утилита для отправки сообщений клиенту
function notifyClient(type, data = {}) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'NETWORK_STATUS',
          status: type,
          ...data,
        });
      });
    })
    .catch((error) => {
      console.warn('[SW] Failed to notify client:', error, { type, data });
    });
}

// Утилиты для работы с localStorage из Service Worker
async function getLocalStorageItem(key) {
  try {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sw-localstorage', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('storage')) {
          db.createObjectStore('storage');
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction(['storage'], 'readonly');
          const store = transaction.objectStore('storage');
          const getRequest = store.get(key);
          
          getRequest.onsuccess = () => resolve(getRequest.result);
          getRequest.onerror = () => reject(getRequest.error);
        } catch (e) {
          reject(e);
        }
      };
    });
  } catch (e) {
    console.warn('[SW] Failed to get localStorage item:', e, { key });
    return null;
  }
}

async function setLocalStorageItem(key, value) {
  try {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sw-localstorage', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('storage')) {
          db.createObjectStore('storage');
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction(['storage'], 'readwrite');
          const store = transaction.objectStore('storage');
          const putRequest = store.put(value, key);
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } catch (e) {
          reject(e);
        }
      };
    });
  } catch (e) {
    console.warn('[SW] Failed to set localStorage item:', e, { key });
  }
}

// Кэши для офлайн-контента
const OFFLINE_CACHE_NAME = 'gafus-offline-v1';
const COURSES_CACHE_NAME = 'gafus-courses-v1';
const OFFLINE_PAGE_URL = '/~offline';

// Универсальная функция для кэширования chunks страницы
async function cachePageChunks(htmlResponse, cacheName) {
  try {
    const html = await htmlResponse.clone().text();
    const baseUrl = new URL(htmlResponse.url).origin;
    const cache = await caches.open(cacheName);
    const chunksToCache = new Set();
    
    // Ищем все script теги с chunks
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.startsWith('/_next/static/')) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        chunksToCache.add(fullUrl);
      }
    }
    
    // Ищем все link теги с CSS chunks
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.startsWith('/_next/static/')) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        chunksToCache.add(fullUrl);
      }
    }
    
    // Кэшируем все найденные chunks
    const cachePromises = Array.from(chunksToCache).map(async (chunkUrl) => {
      try {
        const response = await fetch(chunkUrl);
        if (response.ok) {
          await cache.put(chunkUrl, response.clone());
        }
      } catch (error) {
        // Игнорируем ошибки кэширования отдельных chunks
      }
    });
    
    await Promise.allSettled(cachePromises);
  } catch (error) {
    // Игнорируем ошибки кэширования chunks
  }
}

// Функция для кэширования chunks страницы офлайна
async function cacheOfflinePageChunks(htmlResponse, cache) {
  try {
    const html = await htmlResponse.clone().text();
    const baseUrl = new URL(htmlResponse.url).origin;
    const chunksToCache = new Set();
    
    // Ищем все script и link теги с chunks для страницы офлайна
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
    
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.includes('~offline') || url.startsWith('/_next/')) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        chunksToCache.add(fullUrl);
      }
    }
    
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (url.includes('~offline') || (url.startsWith('/_next/') && url.includes('css'))) {
        const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
        chunksToCache.add(fullUrl);
      }
    }
    
    // Ищем chunks в __NEXT_DATA__
    const nextDataMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([^<]+)<\/script>/i);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Next.js хранит информацию о chunks в разных местах
        if (nextData.buildId) {
          // Можно добавить логику для поиска chunks по buildId
        }
      } catch (e) {
        // Игнорируем ошибки парсинга
      }
    }
    
    // Кэшируем все найденные chunks
    const cachePromises = Array.from(chunksToCache).map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        // Игнорируем ошибки кэширования отдельных chunks
      }
    });
    
    await Promise.allSettled(cachePromises);
  } catch (error) {
    // Игнорируем ошибки кэширования chunks
  }
}

// Хранилище ожидающих запросов HTML из IndexedDB
const pendingHtmlRequests = new Map();

// Проверяем, является ли URL страницей курса
function isCoursePage(pathname) {
  return pathname.startsWith('/trainings/');
}

// Install event - кэшируем страницу офлайна и её chunks
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        
        // Пытаемся закэшировать страницу офлайна
        try {
          const response = await fetch(OFFLINE_PAGE_URL);
          if (response.ok) {
            await cache.put(OFFLINE_PAGE_URL, response.clone());
            // Кэшируем все chunks страницы офлайна
            await cacheOfflinePageChunks(response, cache);
          }
        } catch (error) {
          console.warn('[SW] Failed to cache offline page on install:', error);
        }
        
        self.skipWaiting();
      } catch (error) {
        console.error('[SW] Install error:', error);
        self.skipWaiting();
      }
    })()
  );
});

// Activate event - очистка старых кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Удаляем все старые кэши, кроме кэшей офлайн-страницы и курсов
        const cacheNames = await caches.keys();
        const gafusCaches = cacheNames.filter(
          name => name.startsWith('gafus-') && 
                  name !== OFFLINE_CACHE_NAME && 
                  name !== COURSES_CACHE_NAME
        );
        
        await Promise.all(
          gafusCaches.map(cacheName => caches.delete(cacheName))
        );
        
        // Убеждаемся, что страница офлайна закэширована
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cached = await cache.match(OFFLINE_PAGE_URL);
        if (!cached) {
          try {
            const response = await fetch(OFFLINE_PAGE_URL);
            if (response.ok) {
              await cache.put(OFFLINE_PAGE_URL, response);
            }
          } catch (error) {
            console.warn('[SW] Failed to cache offline page on activate:', error);
          }
        }
        
        await self.clients.claim();
      } catch (error) {
        console.error('[SW] Failed to cleanup caches:', error);
      }
    })()
  );
});

// Fetch event обрабатывается выше для определения сетевых ошибок
// Кэширование не используется, данные курсов в IndexedDB

// Создание опций для уведомлений
function createNotificationOptions(title, options = {}) {
  return {
    body: options.body || '',
    icon: options.icon || '/uploads/logo.png',
    badge: options.badge || '/uploads/logo.png',
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
  let data = {};
  try {
    if (event.data) {
      // Сначала пробуем распарсить как JSON
      try {
        data = event.data.json();
      } catch (jsonError) {
        // Если не JSON, пробуем получить как текст
        try {
          const textData = event.data.text();
          // Если это простой текст, создаем объект уведомления
          data = {
            title: 'Gafus',
            body: textData || 'Новое уведомление'
          };
        } catch (textError) {
          console.warn('[SW] Failed to parse push data as text:', textError);
          data = { title: 'Gafus', body: 'Новое уведомление' };
        }
      }
    } else {
      data = { title: 'Gafus', body: 'Новое уведомление' };
    }
  } catch (error) {
    console.error('[SW] Failed to parse push event data:', error);
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
  
  event.waitUntil(
    self.registration.showNotification(title, options).catch((error) => {
      console.error('[SW] Failed to show push notification:', error, { title, body: options.body });
    })
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || '/';
  const notificationId = notificationData.notificationId;
  
  event.notification.close();
  
  event.waitUntil(
    (async () => {
      try {
        // Отслеживаем клик по re-engagement уведомлению
        if (notificationId) {
          try {
            const response = await fetch('/api/track-reengagement-click', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ notificationId }),
            });
            if (!response.ok) {
              console.warn('[SW] Failed to track reengagement click:', response.status, { notificationId });
            }
          } catch (error) {
            console.warn('[SW] Error tracking reengagement click:', error, { notificationId });
          }
        }
        
        // Открываем окно
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        
        // Ищем уже открытое окно приложения
        for (const client of clients) {
          if (client.url.includes('gafus.ru') && 'focus' in client) {
            await client.focus();
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return;
          }
        }
        
        // Если нет открытого окна, открываем новое с нужным URL
        if (self.clients.openWindow) {
          try {
            await self.clients.openWindow(targetUrl);
          } catch (error) {
            console.warn('[SW] Failed to open window:', error, { targetUrl });
          }
        }
      } catch (error) {
        console.error('[SW] Error handling notification click:', error, { targetUrl, notificationId });
      }
    })()
  );
});

// Message event handler для коммуникации с клиентом
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Обработка запроса HTML из IndexedDB (резервный вариант)
  if (event.data && event.data.type === 'HTML_FROM_INDEXEDDB') {
    const { url: urlPath, html } = event.data;
    
    if (html && urlPath) {
      // Нормализуем URL (убираем trailing slash)
      const normalizedUrl = urlPath.replace(/\/$/, '') || urlPath;
      
      // Если есть ожидающий запрос для этого URL, резолвим Promise
      const resolve = pendingHtmlRequests.get(normalizedUrl);
      if (resolve) {
        resolve(html);
      }
      
      // Также сохраняем HTML в Cache API для следующего раза
      event.waitUntil(
        (async () => {
          try {
            const coursesCache = await caches.open(COURSES_CACHE_NAME);
            // Создаем полный URL для кэша
            const fullUrl = new URL(normalizedUrl, self.location.origin).href;
            await coursesCache.put(fullUrl, new Response(html, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }));
          } catch (error) {
            console.warn('[SW] Failed to save HTML to cache from IndexedDB:', error, { url: normalizedUrl });
          }
        })()
      );
    }
  }
});
