/**
 * Хук для интеграции с Service Worker
 * Обеспечивает коммуникацию между приложением и SW
 */

import { useEffect, useCallback } from 'react';
import { useOfflineStore } from '@shared/stores/offlineStore';

export function useServiceWorker() {
  const { 
    isOnline, 
    setOnlineStatus, 
    syncQueue, 
    syncOfflineActions 
  } = useOfflineStore();

  // Отправка сообщения в Service Worker
  const sendMessageToSW = useCallback((message: Record<string, unknown>) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }, []);

  // Получение ответа от Service Worker
  const getMessageFromSW = useCallback((messageType: string): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        reject(new Error('Service Worker not available'));
        return;
      }

      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === messageType) {
          resolve(event.data);
        } else if (event.data.error) {
          reject(new Error(event.data.error));
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'CACHE_STATUS' },
        [messageChannel.port2]
      );

      // Таймаут для запроса
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 5000);
    });
  }, []);

  // Уведомление SW об изменении офлайн статуса
  const notifyOfflineStatus = useCallback((online: boolean) => {
    sendMessageToSW({
      type: 'OFFLINE_STATUS',
      isOnline: online,
    });
  }, [sendMessageToSW]);

  // Отправка очереди синхронизации в SW
  const sendSyncQueue = useCallback(() => {
    if (syncQueue.length > 0) {
      sendMessageToSW({
        type: 'SYNC_QUEUE',
        actions: syncQueue,
      });
    }
  }, [syncQueue, sendMessageToSW]);

  // Получение статуса кэша
  const getCacheStatus = useCallback(async () => {
    try {
      const response = await getMessageFromSW('CACHE_STATUS_RESPONSE');
      return response.status;
    } catch (error) {
      console.warn('Failed to get cache status:', error);
      return null;
    }
  }, [getMessageFromSW]);

  // Обработка сообщений от Service Worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const { data } = event;
      
      switch (data.type) {
        case 'NETWORK_STATUS_CHANGED':
          console.log('🌐 SW: Network status changed:', data.isOnline);
          setOnlineStatus(data.isOnline);
          break;
          
        case 'NETWORK_RESTORED':
          console.log('🔄 SW: Network restored, syncing...');
          // При восстановлении сети синхронизируем очередь
          setTimeout(() => {
            syncOfflineActions();
          }, 1000);
          break;
          
        case 'OFFLINE_ACTION_PROCESSED':
          console.log('✅ SW: Offline action processed:', data.actionId);
          break;
          
        default:
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [setOnlineStatus, syncOfflineActions]);

  // Уведомляем SW об изменении офлайн статуса
  useEffect(() => {
    notifyOfflineStatus(isOnline);
  }, [isOnline, notifyOfflineStatus]);

  // Отправляем очередь синхронизации при изменении
  useEffect(() => {
    if (isOnline && syncQueue.length > 0) {
      sendSyncQueue();
    }
  }, [isOnline, syncQueue, sendSyncQueue]);

  return {
    sendMessageToSW,
    getMessageFromSW,
    notifyOfflineStatus,
    sendSyncQueue,
    getCacheStatus,
  };
}
