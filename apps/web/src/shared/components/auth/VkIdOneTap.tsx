"use client";

import { reportClientError } from "@gafus/error-handling";
import { initiateVkIdAuth } from "@shared/server-actions";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import styles from "./VkIdOneTap.module.css";

/**
 * Кнопка «Войти через VK ID» — redirect flow на id.vk.ru.
 */
export function VkIdOneTap() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnPath = pathname === "/" ? "/" : pathname === "/register" ? "/register" : "/login";

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectUri =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/auth/callback/vk-id`
          : undefined;
      const result = await initiateVkIdAuth(returnPath, redirectUri);
      if (result.success) {
        window.location.href = result.url;
      } else {
        setError(result.error);
        setLoading(false);
      }
    } catch (e) {
      reportClientError(e instanceof Error ? e : new Error("initiateVkIdAuth failed"), {
        issueKey: "VkIdAuthRedirect",
      });
      setError("Ошибка соединения. Обновите страницу.");
      setLoading(false);
    }
  }, [returnPath]);

  return (
    <div className={styles.wrapper}>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className={styles.fallbackButton}
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? "Загрузка..." : "Войти через VK"}
      </button>
    </div>
  );
}
