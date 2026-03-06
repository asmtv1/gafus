"use client";

import { reportClientError } from "@gafus/error-handling";
import { initiateVkIdAuth, prepareVkIdOneTap } from "@shared/server-actions";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./VkIdOneTap.module.css";

type ViewState = "idle" | "loading" | "success" | "error";

/** Логи VK ID: development или localhost/ngrok (для start:all + ngrok тестов) */
const vkIdDebug =
  typeof window !== "undefined" &&
  (process.env.NODE_ENV === "development" ||
    /localhost|ngrok/i.test(window.location.hostname));

/**
 * Виджет VK ID One Tap (skin: secondary) для входа/регистрации.
 * Lazy init: PKCE и SDK инициализируются только при клике пользователя.
 */
export function VkIdOneTap() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const returnPath = pathname === "/" ? "/" : pathname === "/register" ? "/register" : "/login";

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const handleFallbackClick = useCallback(async () => {
    if (vkIdDebug) console.log("[VK ID] Fallback: вызываем initiateVkIdAuth (redirect на id.vk.ru)...");

    setFallbackLoading(true);
    let result: Awaited<ReturnType<typeof initiateVkIdAuth>>;
    try {
      result = await initiateVkIdAuth(returnPath);
      if (vkIdDebug) console.log("[VK ID] initiateVkIdAuth ответ:", result.success ? { url: result.url } : result);
    } catch (e) {
      if (vkIdDebug) console.error("[VK ID] initiateVkIdAuth исключение:", e);
      reportClientError(e instanceof Error ? e : new Error("initiateVkIdAuth failed"), {
        issueKey: "VkIdAuthRedirect",
      });
      if (mountedRef.current) {
        setError("Ошибка соединения. Обновите страницу.");
        setFallbackLoading(false);
      }
      return;
    }
    if (!mountedRef.current) return;
    if (result.success) {
      if (vkIdDebug) console.log("[VK ID] Редирект на:", result.url);
      window.location.href = result.url;
    } else {
      if (vkIdDebug) console.warn("[VK ID] initiateVkIdAuth ошибка:", result.error);
      setError(result.error);
      setFallbackLoading(false);
    }
  }, [returnPath]);

  const handleInitClick = useCallback(async () => {
    if (vkIdDebug) console.log("[VK ID] Клик: вызываем prepareVkIdOneTap...");

    setViewState("loading");
    setError(null);

    let result: Awaited<ReturnType<typeof prepareVkIdOneTap>>;
    try {
      result = await prepareVkIdOneTap(returnPath);
      if (vkIdDebug) console.log("[VK ID] prepareVkIdOneTap ответ:", result);
    } catch (e) {
      if (vkIdDebug) console.error("[VK ID] prepareVkIdOneTap исключение:", e);
      reportClientError(e instanceof Error ? e : new Error("prepareVkIdOneTap failed"), {
        issueKey: "VkIdOneTapPrepare",
      });
      if (mountedRef.current) {
        setError("Ошибка соединения. Обновите страницу.");
        setViewState("error");
      }
      return;
    }

    if (!mountedRef.current) return;
    if (!result.success) {
      if (vkIdDebug) console.warn("[VK ID] prepareVkIdOneTap ошибка:", result.error);
      setError(result.error);
      setViewState("error");
      return;
    }

    const { state, codeVerifier, clientId, redirectUri } = result;

    if (!clientId || !redirectUri) {
      if (vkIdDebug) console.warn("[VK ID] VK ID не настроен: clientId=", !!clientId, "redirectUri=", redirectUri || "(пусто)");
      setError("VK ID не настроен");
      setViewState("error");
      return;
    }

    if (vkIdDebug) console.log("[VK ID] Конфиг OK: clientId=", clientId, "redirectUri=", redirectUri);

    // При ngrok SDK-чанк часто зависает при загрузке — сразу redirect flow
    const isNgrok = typeof window !== "undefined" && /ngrok/i.test(window.location.hostname);
    if (isNgrok) {
      if (vkIdDebug) console.log("[VK ID] ngrok detected — пропускаем SDK, сразу redirect...");
      return handleFallbackClick();
    }

    const container = containerRef.current;
    if (!container) {
      if (vkIdDebug) console.error("[VK ID] Контейнер для SDK не найден");
      setError("Не удалось загрузить VK ID");
      setViewState("error");
      return;
    }

    try {
      if (vkIdDebug) console.log("[VK ID] Загружаем @vkid/sdk...");
      const VKID = await import("@vkid/sdk");
      if (!mountedRef.current) return;
      VKID.Config.init({
        app: Number.parseInt(clientId, 10),
        redirectUrl: redirectUri,
        state,
        codeVerifier,
      });
      if (vkIdDebug) console.log("[VK ID] Config.init OK, рендерим One Tap...");
      // Контейнер должен быть видим при render — VK ID SDK не работает с display:none
      container.style.removeProperty("display");
      const oneTap = new VKID.OneTap();
      oneTap.render({
        container,
        skin: VKID.OneTapSkin.Secondary,
      });
      oneTap.on(VKID.WidgetEvents.ERROR, async (e: unknown) => {
        const payload = e && typeof e === "object" && "code" in e && "text" in e
          ? (e as { code: number; text: string })
          : null;
        if (vkIdDebug) console.error("[VK ID] One Tap ERROR:", payload ?? e);
        const err = payload
          ? new Error(`VK ID One Tap: ${payload.text}`)
          : new Error("VK ID One Tap error");
        reportClientError(err, {
          issueKey: "VkIdOneTap",
          keys: payload ? { code: payload.code, text: payload.text } : undefined,
        });
        container.innerHTML = "";
        if (!mountedRef.current) return;
        setError("Ошибка VK ID");
        setViewState("error");
        // При timeout (code 0) — часто ngrok/iframe; сразу fallback на redirect в id.vk.ru
        if (payload?.code === 0) {
          if (vkIdDebug) console.log("[VK ID] Timeout — автоматический fallback на redirect...");
          try {
            const fallback = await initiateVkIdAuth(returnPath);
            if (fallback.success) {
              window.location.href = fallback.url;
            }
          } catch {
            // ignore, кнопка уже покажет состояние error
          }
        }
      });
      if (mountedRef.current) {
        if (vkIdDebug) console.log("[VK ID] One Tap отрендерен, viewState=success");
        setViewState("success");
      }
    } catch (e) {
      if (vkIdDebug) console.error("[VK ID] Инициализация SDK исключение:", e);
      reportClientError(e instanceof Error ? e : new Error("VK ID init failed"), {
        issueKey: "VkIdOneTapInit",
      });
      if (container) container.innerHTML = "";
      if (mountedRef.current) {
        setError("Не удалось загрузить VK ID");
        setViewState("error");
      }
    }
  }, [handleFallbackClick, returnPath]);

  return (
    <>
      {/* containerRef всегда в DOM — SDK рендерит в него; скрыт до success */}
      <div
        ref={containerRef}
        className={styles.container}
        id="VkIdSdkOneTap"
        style={viewState !== "success" ? { display: "none" } : undefined}
      />

      {viewState !== "success" && (
        <div className={styles.wrapper}>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          <button
            type="button"
            className={styles.fallbackButton}
            disabled={viewState === "loading" || fallbackLoading}
            onClick={viewState === "error" ? handleFallbackClick : handleInitClick}
          >
            {viewState === "loading" || fallbackLoading
              ? "Загрузка..."
              : "Войти через VK"}
          </button>
        </div>
      )}
    </>
  );
}
