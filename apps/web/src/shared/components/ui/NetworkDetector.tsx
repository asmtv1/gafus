"use client";

import { useEffect } from "react";
import { Detector } from "react-detect-offline";
import { useOfflineStore } from "@shared/stores/offlineStore";

export default function NetworkDetector() {
  const setOnlineStatus = useOfflineStore((s) => s.setOnlineStatus);

  useEffect(() => {
    // В dev режиме дополнительно проверяем реальное подключение
    if (process.env.NODE_ENV === 'development') {
      const checkConnection = async () => {
        try {
          // Простой запрос для проверки реального подключения
          const response = await fetch('/api/ping', { 
            method: 'GET',
            cache: 'no-cache',
            signal: AbortSignal.timeout(3000) // 3 секунды таймаут
          });
          
          if (response.ok) {
            setOnlineStatus(true);
          }
        } catch (error) {
          // Если запрос не прошел, но navigator.onLine говорит что онлайн,
          // не меняем статус в dev режиме слишком агрессивно
          if (navigator.onLine) {
            // Оставляем статус как есть, если браузер считает что онлайн
            return;
          }
          setOnlineStatus(false);
        }
      };

      // Проверяем подключение при монтировании
      checkConnection();
      
      // Периодически проверяем в dev режиме
      const interval = setInterval(checkConnection, 30000); // каждые 30 секунд
      
      return () => clearInterval(interval);
    }
  }, [setOnlineStatus]);

  return (
    <Detector
      onChange={(isOnline: boolean) => {
        // В dev режиме более консервативно обновляем статус
        if (process.env.NODE_ENV === 'development') {
          // Если браузер говорит что офлайн, доверяем ему
          if (!isOnline) {
            setOnlineStatus(false);
          } else {
            // Если браузер говорит что онлайн, дополнительно проверяем
            // но не блокируем обновление статуса
            setOnlineStatus(true);
          }
        } else {
          // В prod режиме доверяем Detector полностью
          setOnlineStatus(isOnline);
        }
      }}
      render={() => null}
    />
  );
}


