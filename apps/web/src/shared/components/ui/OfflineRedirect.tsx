"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-offline-redirect");

/**
 * Компонент для автоматического редиректа на страницу офлайна при детекте офлайна
 * Немедленный редирект на /~offline при любом отсутствии сети
 */
export default function OfflineRedirect() {
  const isOnline = useOfflineStore((state) => state.isOnline);
  const pathname = usePathname();
  const router = useRouter();
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // Очищаем предыдущий таймаут
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    // Если онлайн, сбрасываем флаг редиректа
    if (isOnline) {
      hasRedirectedRef.current = false;
      return;
    }

    // Если уже на странице офлайна, ничего не делаем
    if (pathname === "/~offline") {
      return;
    }

    // Если уже был редирект, не делаем повторный
    if (hasRedirectedRef.current) {
      return;
    }

    // Немедленный редирект на страницу офлайна
    logger.warn("Redirecting to offline page", {
      pathname,
      navigatorOnLine: navigator.onLine,
    });

    hasRedirectedRef.current = true;

    // Используем window.location для гарантированного редиректа
    // Это работает даже если Next.js router не может выполнить навигацию
    redirectTimeoutRef.current = setTimeout(() => {
      if (window.location.pathname !== "/~offline") {
        window.location.href = "/~offline";
      }
    }, 0);
  }, [isOnline, pathname, router]);

  // Также слушаем события online/offline напрямую
  useEffect(() => {
    const handleOffline = () => {
      logger.warn("Window offline event detected");
      const store = useOfflineStore.getState();
      store.setOnlineStatus(false);

      // Немедленный редирект на страницу офлайна
      if (window.location.pathname !== "/~offline") {
        logger.warn("Redirecting to offline page from offline event");
        window.location.href = "/~offline";
      }
    };

    const handleOnline = () => {
      logger.info("Window online event detected");
      // При восстановлении сети проверяем реальное подключение
      // но не сразу устанавливаем онлайн, пусть NetworkDetector проверит
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Проверяем начальное состояние
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // Компонент не рендерит ничего
  return null;
}
