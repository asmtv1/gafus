/**
 * Компонент для отображения офлайн статуса
 * Показывает уведомления о состоянии сети и синхронизации
 */

"use client";

import { useEffect, useState } from 'react';
import { useOfflineStore } from '@shared/stores/offlineStore';
import { useServiceWorker } from '@shared/hooks/useServiceWorker';

type CacheStatus = Record<string, {
  entries: number;
  size: number;
}>;

export function OfflineStatus() {
  const { isOnline, syncQueue, syncErrors } = useOfflineStore();
  const { getCacheStatus } = useServiceWorker();
  
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Получаем статус кэша
  useEffect(() => {
    const fetchCacheStatus = async () => {
      try {
        const status = await getCacheStatus();
        if (status && typeof status === 'object' && 'status' in status) {
          setCacheStatus(status.status as CacheStatus);
        }
      } catch (error) {
        console.warn('Failed to fetch cache status:', error);
      }
    };

    fetchCacheStatus();
    
    // Обновляем статус каждые 30 секунд
    const interval = setInterval(fetchCacheStatus, 30000);
    return () => clearInterval(interval);
  }, [getCacheStatus]);

  // Показываем статус при изменении сети
  useEffect(() => {
    if (!isOnline) {
      setShowStatus(true);
      // Скрываем через 5 секунд
      const timer = setTimeout(() => setShowStatus(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowStatus(false);
    }
  }, [isOnline]);

  // Отслеживаем синхронизацию
  useEffect(() => {
    if (syncQueue.length > 0) {
      setIsSyncing(true);
    } else {
      setIsSyncing(false);
    }
  }, [syncQueue.length]);

  // Форматирование размера кэша
  const formatCacheSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Подсчёт общего размера кэша
  const totalCacheSize = cacheStatus 
    ? Object.values(cacheStatus).reduce((sum, cache) => sum + cache.size, 0)
    : 0;

  const totalCacheEntries = cacheStatus
    ? Object.values(cacheStatus).reduce((sum, cache) => sum + cache.entries, 0)
    : 0;

  if (!showStatus && !isSyncing && syncQueue.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      {/* Офлайн уведомление */}
      {!isOnline && (
        <div className="bg-orange-500 text-white p-4 rounded-lg shadow-lg mb-2">
          <div className="flex items-center">
            <div className="text-2xl mr-3">📱</div>
            <div>
              <div className="font-semibold">Нет подключения к интернету</div>
              <div className="text-sm opacity-90">
                Данные загружаются из кэша
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Синхронизация */}
      {isSyncing && (
        <div className="bg-blue-500 text-white p-4 rounded-lg shadow-lg mb-2">
          <div className="flex items-center">
            <div className="text-2xl mr-3 animate-spin">🔄</div>
            <div>
              <div className="font-semibold">Синхронизация данных</div>
              <div className="text-sm opacity-90">
                {syncQueue.length} действий в очереди
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ошибки синхронизации */}
      {syncErrors.length > 0 && (
        <div className="bg-red-500 text-white p-4 rounded-lg shadow-lg mb-2">
          <div className="flex items-center">
            <div className="text-2xl mr-3">⚠️</div>
            <div>
              <div className="font-semibold">Ошибки синхронизации</div>
              <div className="text-sm opacity-90">
                {syncErrors.length} ошибок
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Статус кэша (только в dev режиме) */}
      {process.env.NODE_ENV === 'development' && cacheStatus && (
        <div className="bg-gray-800 text-white p-4 rounded-lg shadow-lg text-xs">
          <div className="font-semibold mb-2">📦 Статус кэша</div>
          <div className="space-y-1">
            <div>Всего записей: {totalCacheEntries}</div>
            <div>Общий размер: {formatCacheSize(totalCacheSize)}</div>
            {Object.entries(cacheStatus).map(([name, status]) => (
              <div key={name} className="opacity-75">
                {name.split('-')[1]}: {status.entries} записей ({formatCacheSize(status.size)})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}