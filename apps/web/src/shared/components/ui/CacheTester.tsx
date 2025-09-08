"use client";

import { useState } from "react";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";

interface CacheTestResult {
  type: string;
  url: string;
  cached: boolean;
  size?: number;
  timestamp?: Date;
  error?: string;
}

export function CacheTester() {
  const [results, setResults] = useState<CacheTestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const { isSyncing, pendingChanges } = useSyncStatus();

  // Тестовые URL для проверки кэширования
  const testUrls = [
    // HTML страницы
    { type: "HTML_PAGES", url: "/trainings/beginner" },
    { type: "HTML_PAGES", url: "/trainings/intermediate" },
    { type: "HTML_PAGES", url: "/trainings/advanced" },
    
    // RSC данные
    { type: "RSC_DATA", url: "/api/courses/all" },
    { type: "RSC_DATA", url: "/api/favorites" },
    
    // Статические ресурсы
    { type: "STATIC", url: "/_next/static/chunks/webpack-1288dfd2083207e8.js" },
    { type: "STATIC", url: "/_next/static/css/app/layout.css" },
    
    // Изображения
    { type: "IMAGES", url: "/images/logo.png" },
    { type: "IMAGES", url: "/images/hero-bg.webp" },
    
    // Данные курсов
    { type: "COURSE_DATA", url: "/api/courses/beginner" },
    { type: "COURSE_DATA", url: "/api/training/progress" },
  ];

  const checkCache = async (type: string, url: string): Promise<CacheTestResult> => {
    try {
      const cacheNames = await caches.keys();
      const cacheName = getCacheName(type);
      
      if (!cacheNames.includes(cacheName)) {
        return {
          type,
          url,
          cached: false,
          error: `Кэш ${cacheName} не найден`
        };
      }

      const cache = await caches.open(cacheName);
      const response = await cache.match(url);
      
      if (!response) {
        return {
          type,
          url,
          cached: false,
          error: "Ресурс не найден в кэше"
        };
      }

      const headers = response.headers;
      const contentLength = headers.get('content-length');
      const lastModified = headers.get('last-modified');
      
      return {
        type,
        url,
        cached: true,
        size: contentLength ? parseInt(contentLength) : undefined,
        timestamp: lastModified ? new Date(lastModified) : new Date(),
      };
    } catch (error) {
      return {
        type,
        url,
        cached: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка"
      };
    }
  };

  const getCacheName = (type: string): string => {
    const cacheMap: Record<string, string> = {
      'HTML_PAGES': 'gafus-html-v2',
      'RSC_DATA': 'gafus-rsc-v2',
      'STATIC': 'gafus-static-v2',
      'IMAGES': 'gafus-images-v2',
      'COURSE_DATA': 'gafus-course-v2',
    };
    return cacheMap[type] || 'unknown';
  };

  const runCacheTest = async () => {
    setIsTesting(true);
    setResults([]);
    
    console.log("🧪 Начинаем тестирование кэширования...");
    
    for (const test of testUrls) {
      const result = await checkCache(test.type, test.url);
      setResults(prev => [...prev, result]);
      
      // Небольшая задержка между проверками
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setIsTesting(false);
    console.log("✅ Тестирование кэширования завершено");
  };

  const testOfflineMode = async () => {
    console.log("🌐 Тестируем офлайн режим...");
    
    // Симулируем офлайн режим
    setOfflineMode(true);
    
    // Пытаемся загрузить страницу
    try {
      const response = await fetch('/trainings/beginner', {
        method: 'GET',
        cache: 'only-if-cached'
      });
      
      if (response.ok) {
        console.log("✅ Офлайн режим работает - страница загружена из кэша");
      } else {
        console.log("❌ Офлайн режим не работает - страница не найдена в кэше");
      }
    } catch (error) {
      console.log("❌ Ошибка в офлайн режиме:", error);
    }
    
    // Возвращаем онлайн режим
    setTimeout(() => setOfflineMode(false), 2000);
  };

  const clearAllCaches = async () => {
    console.log("🗑️ Очищаем все кэши...");
    
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      
      console.log("✅ Все кэши очищены");
      setResults([]);
    } catch (error) {
      console.error("❌ Ошибка при очистке кэшей:", error);
    }
  };

  const getStatusColor = (result: CacheTestResult) => {
    if (result.cached) return "text-green-600";
    if (result.error) return "text-red-600";
    return "text-yellow-600";
  };

  const getStatusIcon = (result: CacheTestResult) => {
    if (result.cached) return "✅";
    if (result.error) return "❌";
    return "⏳";
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, CacheTestResult[]>);

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">🧪 Тестер кэширования и офлайн режима</h2>
      
      {/* Статус синхронизации */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800">Статус синхронизации:</h3>
        <div className="flex items-center gap-4 mt-2">
          <span className={isSyncing ? "text-blue-600" : "text-gray-600"}>
            {isSyncing ? "🔄 Синхронизация..." : "✅ Готово"}
          </span>
          {pendingChanges > 0 && (
            <span className="text-yellow-600">
              ⏳ Ожидает синхронизации: {pendingChanges}
            </span>
          )}
        </div>
      </div>

      {/* Кнопки управления */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={runCacheTest}
          disabled={isTesting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isTesting ? "🔄 Тестируем..." : "🧪 Проверить кэши"}
        </button>
        
        <button
          onClick={testOfflineMode}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          🌐 Тест офлайн режима
        </button>
        
        <button
          onClick={clearAllCaches}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          🗑️ Очистить кэши
        </button>
      </div>

      {/* Результаты тестирования */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Результаты тестирования:</h3>
          
          {Object.entries(groupedResults).map(([type, typeResults]) => (
            <div key={type} className="border rounded-lg p-4">
              <h4 className="font-semibold text-lg mb-2">{type}</h4>
              <div className="space-y-2">
                {typeResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className={getStatusColor(result)}>
                        {getStatusIcon(result)}
                      </span>
                      <span className="font-mono text-sm">{result.url}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {result.cached ? (
                        <span>
                          {formatSize(result.size)} • {result.timestamp?.toLocaleTimeString()}
                        </span>
                      ) : (
                        <span className="text-red-600">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Информация о режиме */}
      {offlineMode && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800">
            🌐 Офлайн режим активен (тестирование в процессе...)
          </p>
        </div>
      )}
    </div>
  );
}
