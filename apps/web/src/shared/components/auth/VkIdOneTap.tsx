"use client";

import { reportClientError } from "@gafus/error-handling";
import { initiateVkIdAuth, prepareVkIdOneTap } from "@shared/server-actions";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./VkIdOneTap.module.css";

type ViewState = "idle" | "loading" | "success" | "error";

/**
 * Виджет VK ID One Tap (skin: secondary) для входа/регистрации.
 * Lazy init: PKCE и SDK инициализируются только при клике пользователя.
 */
export function VkIdOneTap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const handleInitClick = useCallback(async () => {
    setViewState("loading");
    setError(null);

    let result: Awaited<ReturnType<typeof prepareVkIdOneTap>>;
    try {
      result = await prepareVkIdOneTap();
    } catch (e) {
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
      setError(result.error);
      setViewState("error");
      return;
    }

    const { state, codeVerifier, clientId, redirectUri } = result;

    if (!clientId || !redirectUri) {
      setError("VK ID не настроен");
      setViewState("error");
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setError("Не удалось загрузить VK ID");
      setViewState("error");
      return;
    }

    try {
      const VKID = await import("@vkid/sdk");
      if (!mountedRef.current) return;
      VKID.Config.init({
        app: Number.parseInt(clientId, 10),
        redirectUrl: redirectUri,
        state,
        codeVerifier,
      });
      const oneTap = new VKID.OneTap();
      oneTap.render({
        container,
        skin: VKID.OneTapSkin.Secondary,
      });
      oneTap.on(VKID.WidgetEvents.ERROR, (e: unknown) => {
        const payload = e && typeof e === "object" && "code" in e && "text" in e
          ? (e as { code: number; text: string })
          : null;
        const err = payload
          ? new Error(`VK ID One Tap: ${payload.text}`)
          : new Error("VK ID One Tap error");
        reportClientError(err, {
          issueKey: "VkIdOneTap",
          keys: payload ? { code: payload.code, text: payload.text } : undefined,
        });
        container.innerHTML = "";
        if (mountedRef.current) {
          setError("Ошибка VK ID");
          setViewState("error");
        }
      });
      setViewState("success");
    } catch (e) {
      reportClientError(e instanceof Error ? e : new Error("VK ID init failed"), {
        issueKey: "VkIdOneTapInit",
      });
      if (container) container.innerHTML = "";
      if (mountedRef.current) {
        setError("Не удалось загрузить VK ID");
        setViewState("error");
      }
    }
  }, []);

  const handleFallbackClick = useCallback(async () => {
    setFallbackLoading(true);
    let result: Awaited<ReturnType<typeof initiateVkIdAuth>>;
    try {
      result = await initiateVkIdAuth();
    } catch (e) {
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
      window.location.href = result.url;
    } else {
      setError(result.error);
      setFallbackLoading(false);
    }
  }, []);

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
              : "Войти через VK ID"}
          </button>
        </div>
      )}
    </>
  );
}
