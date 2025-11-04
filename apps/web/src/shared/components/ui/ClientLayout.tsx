"use client";

import { CSRFProvider } from "@gafus/csrf";
import { setupGlobalErrorHandling } from "@shared/lib/global-error-handler";
import LoadingScreen from "@shared/components/ui/LoadingScreen";
import { useState, useEffect } from "react";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Начальная загрузка - показываем полноэкранный loading screen только при первой загрузке приложения
  useEffect(() => {
    let loadComplete = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let maxTimerId: NodeJS.Timeout | null = null;
    let listenerAdded = false;
    
    const minDisplayTime = 800; // Минимальное время показа loading screen (800ms)
    const startTime = Date.now();

    const handleLoad = () => {
      if (loadComplete) return; // Защита от повторных вызовов
      
      loadComplete = true;
      listenerAdded = false; // Listener уже автоматически удален из-за { once: true }
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDisplayTime - elapsed);
      
      timeoutId = setTimeout(() => {
        setIsInitialLoad(false);
        timeoutId = null;
      }, remaining);
    };

    if (document.readyState === "complete") {
      // Страница уже загружена, но все равно показываем минимум
      handleLoad();
    } else {
      // Ждем загрузки страницы
      window.addEventListener("load", handleLoad, { once: true });
      listenerAdded = true;
      
      // Максимальное время показа (на случай если load не сработает)
      maxTimerId = setTimeout(() => {
        if (!loadComplete) {
          loadComplete = true;
          listenerAdded = false;
          setIsInitialLoad(false);
        }
        maxTimerId = null;
      }, 2000);
    }

    return () => {
      // Безопасно удаляем listener только если он еще не был вызван
      // При использовании { once: true } listener автоматически удаляется после первого вызова
      if (listenerAdded) {
        window.removeEventListener("load", handleLoad);
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (maxTimerId) clearTimeout(maxTimerId);
    };
  }, []);

  // Настройка глобального отлова ошибок
  useEffect(() => {
    setupGlobalErrorHandling();
  }, []);

  return (
    <CSRFProvider>
      <div style={{ position: "relative" }}>
        {/* Начальный loading screen при первой загрузке приложения */}
        {/* z-index 9999 гарантирует, что он будет поверх любых Suspense fallback */}
        {/* Блокируем взаимодействие во время начальной загрузки для предотвращения race conditions */}
        {isInitialLoad && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 9999,
            }}
          >
            <LoadingScreen />
          </div>
        )}

        {children}
      </div>
    </CSRFProvider>
  );
}
