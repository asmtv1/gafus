"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

import { useClearAllCache } from "@shared/lib/utils/clearAllCache";
import OfflineNotification from "@shared/components/ui/OfflineNotification";

import styles from "./SettingsActions.module.css";

export default function SettingsActions() {
  const { clearCache } = useClearAllCache();
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
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

    try {
      setIsClearing(true);
      await clearCache();
      setNotification({
        message: "Кэш успешно очищен",
        type: "success",
      });
      // Скрываем уведомление через 3 секунды
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setNotification(null), 3000);
    } catch {
      setNotification({
        message: "Ошибка при очистке кэша",
        type: "error",
      });
      // Скрываем уведомление через 5 секунд
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setNotification(null), 5000);
    } finally {
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

