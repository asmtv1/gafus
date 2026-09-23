"use client";

import { reportClientError } from "@gafus/error-handling";
import { initiateVkIdAuth } from "@shared/server-actions";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./VkIdOneTap.module.css";

/**
 * Кнопка «Войти через VK ID» — redirect flow на id.vk.ru.
 */
export function VkIdOneTap({ promoCode }: { promoCode?: string }) {
  const pathname = usePathname();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnPath = pathname === "/" ? "/" : pathname === "/register" ? "/register" : "/login";

  const handleClick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const redirectUri =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/auth/callback/vk-id`
          : undefined;
      const result = await initiateVkIdAuth(
        returnPath,
        redirectUri,
        promoCode?.trim() || undefined,
      );
      if (!mounted.current) return;
      if (result.success) {
        window.location.href = result.url;
      } else {
        setError(result.error);
        inFlight.current = false;
        setLoading(false);
      }
    } catch (e) {
      if (!mounted.current) return;
      reportClientError(e instanceof Error ? e : new Error("initiateVkIdAuth failed"), {
        issueKey: "VkIdAuthRedirect",
      });
      setError("Ошибка соединения. Обновите страницу.");
      inFlight.current = false;
      setLoading(false);
    }
  }, [promoCode, returnPath]);

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
                <path d="M19.665 13.826c-.272-.362-1.99-2.076-2.268-2.369-.28-.294-.382-.476-.099-.862.283-.386 1.209-1.531 1.47-1.997.259-.466.129-.628-.247-.628h-1.519c-.323 0-.472.17-.594.429 0 0-1.043 2.479-2.52 4.09-.478.52-.697.683-.957.683-.13 0-.318-.163-.318-.627V8.555c0-.51-.144-.74-.555-.74H9.73c-.307 0-.492.229-.492.444 0 .466.698.574.77 1.887v2.969c0 .65-.118.769-.378.769-.697 0-2.392-2.49-3.397-5.338-.2-.573-.402-.806-.728-.806H4.001c-.363 0-.435.17-.435.43 0 .465.697 2.774 3.242 5.826 1.696 2.083 4.086 3.214 6.261 3.214 1.305 0 1.467-.293 1.467-.798v-1.84c0-.587.124-.704.531-.704.299 0 .81.15 2.006 1.302 1.367 1.367 1.594 1.995 2.364 1.995h1.519c.432 0 .648-.216.523-.643-.137-.427-.632-1.047-1.814-2.376Z" />
              </svg>
            </span>
            <span>{"Войти через VK"}</span>
          </>
        )}
      </button>
    </div>
  );
}
