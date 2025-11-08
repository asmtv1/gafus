"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

import { createWebLogger } from "@gafus/logger";
import { useClearAllCache } from "@shared/lib/utils/clearAllCache";
import OfflineNotification from "@shared/components/ui/OfflineNotification";

const logger = createWebLogger('settings-actions');

import styles from "./SettingsActions.module.css";

export default function SettingsActions() {
  const { clearCache } = useClearAllCache();
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Очищаем таймер при размонтировании компонента
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClearCache = async () => {
    if (isClearing) return; // Предотвращаем двойной клик

    setIsClearing(true);
    
    // Очищаем предыдущее уведомление
    setNotification(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    try {
      await clearCache();
      
      // Операция завершена успешно - показываем уведомление и перенаправляем на главную
      setNotification({
        message: "Кэш очищен. Перезагрузка...",
        type: "success",
      });
      
      logger.info("Кэш очищен, выполняем редирект на главную", { operation: 'clear_cache_redirect' });
      
      // Даем время на завершение операций очистки и показ уведомления,
      // затем делаем жесткий редирект на главную страницу
      timeoutRef.current = setTimeout(() => {
        window.location.href = '/';
      }, 800);
    } catch (error) {
      // Ошибка при очистке (должна быть редкой, так как clearAllCache теперь не бросает ошибки)
      logger.warn("Ошибка при очистке кэша в компоненте", { error, operation: 'warn' });
      
      setNotification({
        message: "Кэш очищен с предупреждениями. Перезагрузка...",
        type: "warning",
      });
      
      // Даже при ошибке перенаправляем на главную для перезагрузки
      timeoutRef.current = setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } finally {
      // Не сбрасываем состояние загрузки - страница перезагрузится
    }
  };

  return (
    <>
      <section className={styles.section}>
        <div className={styles.buttonsContainer}>
          <Link href="/passwordReset" className={styles.button}>
            🔐 Сменить пароль
          </Link>
          
          <button 
            onClick={handleClearCache}
            className={styles.button}
            type="button"
            disabled={isClearing}
            aria-label={isClearing ? "Очистка кэша..." : "Очистить кэш"}
            aria-busy={isClearing}
          >
            {isClearing ? "⏳ Очистка..." : "🗑️ Очистить кэш"}
          </button>
        </div>
      </section>

      {notification && (
        <OfflineNotification
          message={notification.message}
          type={notification.type}
          duration={notification.type === "success" ? 3000 : 5000}
          showOfflineIndicator={false}
        />
      )}
    </>
  );
}

