"use client";

import { CSRFProvider } from "@gafus/csrf";
import { setupGlobalErrorHandling } from "@shared/lib/global-error-handler";
import LoadingScreen from "@shared/components/ui/LoadingScreen";
import { useState, useEffect } from "react";

// Сохраняем состояние между ремонтированиями компонента
let hasInitialLoadCompleted = false;

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isInitialLoad, setIsInitialLoad] = useState(!hasInitialLoadCompleted);

  // Начальная загрузка - показываем полноэкранный loading screen только при первой загрузке приложения
  useEffect(() => {
    // Если уже загружали, не показываем loading screen
    if (hasInitialLoadCompleted) {
      return;
    }

    let loadComplete = false;
    const minDisplayTime = 800; // Минимальное время показа loading screen (800ms)
    const startTime = Date.now();

    const handleLoad = () => {
      loadComplete = true;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDisplayTime - elapsed);
      
      setTimeout(() => {
        hasInitialLoadCompleted = true;
        setIsInitialLoad(false);
      }, remaining);
    };

    if (document.readyState === "complete") {
      // Страница уже загружена, но все равно показываем минимум
      handleLoad();
    } else {
      // Ждем загрузки страницы
      window.addEventListener("load", handleLoad);
      
      // Максимальное время показа (на случай если load не сработает)
      const maxTimer = setTimeout(() => {
        if (!loadComplete) {
          hasInitialLoadCompleted = true;
          setIsInitialLoad(false);
        }
      }, 2000);

      return () => {
        window.removeEventListener("load", handleLoad);
        clearTimeout(maxTimer);
      };
    }
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
