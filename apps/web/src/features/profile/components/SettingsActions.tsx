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
      
      // Операция завершена успешно
      setNotification({
        message: "Кэш успешно очищен",
        type: "success",
      });
      
      // Скрываем уведомление через 3 секунды
      timeoutRef.current = setTimeout(() => {
        setNotification(null);
        timeoutRef.current = null;
      }, 3000);
    } catch (error) {
      // Ошибка при очистке (должна быть редкой, так как clearAllCache теперь не бросает ошибки)
      logger.warn("Ошибка при очистке кэша в компоненте", { error, operation: 'warn' });
      
      setNotification({
        message: "Кэш очищен с предупреждениями. Основные данные удалены.",
        type: "warning",
      });
      
      // Скрываем уведомление через 5 секунд
      timeoutRef.current = setTimeout(() => {
        setNotification(null);
        timeoutRef.current = null;
      }, 5000);
    } finally {
      // Всегда сбрасываем состояние загрузки
      setIsClearing(false);
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

