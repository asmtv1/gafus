"use client";

import { CSRFProvider } from "@gafus/csrf";
import { setupGlobalErrorHandling } from "@shared/lib/global-error-handler";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const pathname = usePathname();

  // Начальная загрузка - показываем полноэкранный loading screen
  useEffect(() => {
    let loadComplete = false;
    const minDisplayTime = 800; // Минимальное время показа loading screen (800ms)
    const startTime = Date.now();

    const handleLoad = () => {
      loadComplete = true;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDisplayTime - elapsed);
      
      setTimeout(() => {
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
          setIsInitialLoad(false);
        }
      }, 2000);

      return () => {
        window.removeEventListener("load", handleLoad);
        clearTimeout(maxTimer);
      };
    }
  }, []);

  // Loading при смене маршрута
  useEffect(() => {
    if (!isInitialLoad) {
      setLoading(true);
      const timeout = setTimeout(() => setLoading(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [pathname, isInitialLoad]);

  // Настройка глобального отлова ошибок
  useEffect(() => {
    setupGlobalErrorHandling();
  }, []);

  return (
    <CSRFProvider>
      <div style={{ position: "relative" }}>
        {/* Начальный loading screen при первой загрузке */}
        {isInitialLoad && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "var(--bg-1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "32px",
              zIndex: 9999,
            }}
          >
            <Image
              src="/uploads/logo.png"
              alt="Гафус"
              width={200}
              height={200}
              priority
              style={{
                width: "200px",
                height: "200px",
                objectFit: "contain",
              }}
            />
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "6px solid rgba(99, 97, 40, 0.2)",
                borderTop: "6px solid var(--bg-2)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {/* Loading overlay при смене маршрута */}
        {loading && !isInitialLoad && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "6px solid #ccc",
                borderTop: "6px solid #333",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
          </div>
        )}

        {children}
      </div>
    </CSRFProvider>
  );
}
