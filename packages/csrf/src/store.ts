"use client";

import React from "react"; // Added missing import for React
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для CSRF Store
const logger = createWebLogger('csrf-store');
// Типы для CSRF Store
interface CSRFState {
  token: string | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  retryCount: number;

  // Действия
  fetchToken: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  resetRetryCount: () => void;

  // Утилиты
  isTokenValid: () => boolean;
  getTokenAge: () => number | null;
  shouldRefreshToken: () => boolean;
}

// ===== КОНФИГУРАЦИЯ =====
const CSRF_STORE_CONFIG = {
  // Время жизни токена в миллисекундах (1 час)
  tokenLifetime: 60 * 60 * 1000,
  // Максимальное количество попыток получения токена
  maxRetries: 3,
  // Задержка между попытками в миллисекундах
  retryDelay: 1000,
  // Время до автоматического обновления токена (30 минут)
  autoRefreshThreshold: 30 * 60 * 1000,
} as const;

// ===== УТИЛИТАРНЫЕ ФУНКЦИИ =====
function isTokenExpired(lastFetched: number | null): boolean {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CSRF_STORE_CONFIG.tokenLifetime;
}

function shouldAutoRefresh(lastFetched: number | null): boolean {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > CSRF_STORE_CONFIG.autoRefreshThreshold;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== STORE =====
export const useCSRFStore = create<CSRFState>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      token: null,
      loading: false,
      error: null,
      lastFetched: null,
      retryCount: 0,

      // ===== ДЕЙСТВИЯ =====
      fetchToken: async () => {
        const state = get();

        // Если токен еще валиден, не делаем запрос
        if (state.token && !isTokenExpired(state.lastFetched)) {
          return;
        }

        // Проверяем количество попыток
        if (state.retryCount >= CSRF_STORE_CONFIG.maxRetries) {
          set({
            error: "Превышено максимальное количество попыток получения токена",
            loading: false,
          });
          return;
        }

        set({ loading: true, error: null });

        try {
          const response = await fetch("/api/csrf-token", {
            method: "GET",
            credentials: "same-origin",
            headers: {
              "Cache-Control": "no-cache",
            },
          });

          if (response.ok) {
            const data = await response.json();

            if (data.token && typeof data.token === "string") {
              set({
                token: data.token,
                loading: false,
                error: null,
                lastFetched: Date.now(),
                retryCount: 0,
              });
            } else {
              throw new Error("Неверный формат токена в ответе");
            }
          } else {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
          logger.error("Ошибка при получении CSRF токена", new Error(errorMessage), {
            retryCount: get().retryCount,
            lastFetched: get().lastFetched
          });

          const newRetryCount = state.retryCount + 1;

          if (newRetryCount < CSRF_STORE_CONFIG.maxRetries) {
            // Повторная попытка с задержкой
            set({
              loading: false,
              error: `Ошибка получения токена (попытка ${newRetryCount}/${CSRF_STORE_CONFIG.maxRetries})`,
              retryCount: newRetryCount,
            });

            // Автоматическая повторная попытка
            await delay(CSRF_STORE_CONFIG.retryDelay * newRetryCount);
            state.fetchToken();
          } else {
            // Все попытки исчерпаны
            set({
              token: null,
              loading: false,
              error: "Не удалось получить CSRF токен после всех попыток",
              retryCount: newRetryCount,
            });
          }
        }
      },

      refreshToken: async () => {
        const state = get();

        // Сбрасываем состояние
        set({
          token: null,
          error: null,
          retryCount: 0,
        });

        // Получаем новый токен
        await state.fetchToken();
      },

      setToken: (token: string | null) => {
        set({ token });
      },

      setLoading: (loading: boolean) => {
        set({ loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },

      resetRetryCount: () => {
        set({ retryCount: 0 });
      },

      // ===== УТИЛИТЫ =====
      isTokenValid: () => {
        const state = get();
        return !!(state.token && !isTokenExpired(state.lastFetched));
      },

      getTokenAge: () => {
        const state = get();
        if (!state.lastFetched) return null;
        return Date.now() - state.lastFetched;
      },

      shouldRefreshToken: () => {
        const state = get();
        return shouldAutoRefresh(state.lastFetched);
      },
    }),
    {
      name: "csrf-store",
      partialize: (state: CSRFState) => ({
        token: state.token,
        lastFetched: state.lastFetched,
        retryCount: state.retryCount,
      }),
    },
  ),
);

// Экспорт глобальной переменной для Safari совместимости
if (typeof window !== 'undefined') {
  (window as unknown as { __CSRF_STORE__?: typeof useCSRFStore }).__CSRF_STORE__ = useCSRFStore;
}

// ===== УТИЛИТАРНЫЕ ФУНКЦИИ =====
/**
 * Utility функция для добавления CSRF токена к fetch запросам
 */
export function createCSRFFetch(token: string) {
  return async (url: string, options: RequestInit = {}) => {
    // Проверяем валидность токена
    if (!token || token === "temp-token") {
      logger.warn("Invalid CSRF token, request may fail", {
        tokenLength: token.length,
        tokenValue: token === "temp-token" ? "temp-token" : "invalid"
      });
    }

    const headers = {
      ...options.headers,
      "x-csrf-token": token,
    };

    return fetch(url, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  };
}

/**
 * Хук для автоматического управления CSRF токеном
 */
export function useCSRFToken() {
  const { token, loading, error, fetchToken, refreshToken, isTokenValid, shouldRefreshToken } =
    useCSRFStore();

  // Автоматическая загрузка токена при монтировании
  React.useEffect(() => {
    if (!token && !loading) {
      fetchToken();
    }
  }, [token, loading, fetchToken]);

  // Автоматическое обновление токена
  React.useEffect(() => {
    if (shouldRefreshToken() && !loading) {
      refreshToken();
    }
  }, [shouldRefreshToken, loading, refreshToken]);

  return {
    token,
    loading,
    error,
    fetchToken,
    refreshToken,
    isTokenValid: isTokenValid(),
  };
}

