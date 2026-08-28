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
        {loading ? (
          "Загрузка..."
        ) : (
          <>
            <span className={styles.vkLogoSurface} aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M4.5 7.3c.2 3.8 2.1 6.8 5.6 8.4.4.2.8.3 1 .1.2-.1.3-.4.3-.9v-3.3c0-.5-.1-.7-.5-.8-.3-.1-.9-.2-1.4-.3-.2 0-.3-.1-.2-.3.1-.2.3-.3.6-.3h2.2c.4 0 .6.2.6.7v3.7c0 .3.1.4.2.4.2 0 .4-.1.7-.4 1.6-1.5 2.7-3.8 3.2-5.2.1-.3.3-.5.7-.5h2.1c.4 0 .5.2.4.5-.2 1-2.3 4-2.3 4-.2.3-.2.5 0 .8.2.3.7.8 1.2 1.3.8.9 1.4 1.6 1.6 2.2.2.5 0 .8-.5.8h-2.1c-.5 0-.8-.4-1.3-.9-.7-.8-1.2-1.2-1.5-1.2-.3 0-.4.1-.4.6v.9c0 .5-.2.7-.7.7-2.2 0-4.6-1.4-6.3-3.9C3.9 11.8 3.2 9.1 3.2 7.8c0-.3.1-.5.6-.5h.7Z" />
              </svg>
            </span>
            <span>{"Войти через VK"}</span>
          </>
        )}
      </button>
    </div>
  );
}
