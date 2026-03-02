import {
  USER_CACHE_DURATION,
  DEFAULT_USER_PREFERENCES,
  USER_PREFERENCES_CACHE_DURATION,
} from "@gafus/types";
import {
  getUserPreferences,
  getUserProfile,
  updateUserPreferences,
  updateUserProfile,
} from "@shared/lib/user";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";
import { reportClientError } from "@gafus/error-handling";

import type { UserStore } from "./types";

// Создаем логгер для user store
const logger = createWebLogger("web-user-store");

// Утилиты для проверки кэша
const isStale = (timestamp: number, maxAge: number = USER_CACHE_DURATION) => {
  return Date.now() - timestamp > maxAge;
};

const isPreferencesStale = (timestamp: number) => {
  return Date.now() - timestamp > USER_PREFERENCES_CACHE_DURATION;
};

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      // ===== СОСТОЯНИЕ =====
      user: null,
      profile: null,
      preferences: DEFAULT_USER_PREFERENCES,
      isLoading: false,
      isUpdating: false,
      isUpdatingPreferences: false,
      error: null,
      profileError: null,
      preferencesError: null,
      lastFetched: null,
      preferencesLastFetched: null,

      // ===== СЕТТЕРЫ =====
      setUser: (user) => {
        set({ user, error: null });
      },

      setProfile: (profile) => {
        set({ profile, profileError: null, lastFetched: Date.now() });
      },

      setPreferences: (preferences) => {
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
          preferencesError: null,
          preferencesLastFetched: Date.now(),
        }));
      },

      // ===== ДЕЙСТВИЯ =====
      fetchProfile: async () => {
        const state = get();

        // Проверяем кэш
        if (state.profile && state.lastFetched && !isStale(state.lastFetched)) {
          return;
        }

        set({ isLoading: true, profileError: null });

        try {
          logger.info("🔄 Получаем профиль через server action", {
            operation: "fetch_profile_start",
          });
          const profile = await getUserProfile();
          logger.success("✅ Профиль получен", {
            operation: "fetch_profile_success",
            profile: profile,
          });

          set({
            profile,
            isLoading: false,
            lastFetched: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки профиля";
          set({
            profileError: errorMessage,
            isLoading: false,
          });
          reportClientError(error, {
            issueKey: "UserStore",
            keys: { operation: "fetch_profile" },
          });
        }
      },

      fetchPreferences: async () => {
        const state = get();

        // Проверяем кэш
        if (state.preferencesLastFetched && !isPreferencesStale(state.preferencesLastFetched)) {
          return;
        }

        set({ isUpdatingPreferences: true, preferencesError: null });

        try {
          logger.info("🔄 Получаем настройки через server action", {
            operation: "fetch_preferences_start",
          });
          const preferences = await getUserPreferences();

          if (preferences) {
            set({
              preferences,
              isUpdatingPreferences: false,
              preferencesLastFetched: Date.now(),
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки настроек";
          set({
            preferencesError: errorMessage,
            isUpdatingPreferences: false,
          });
          reportClientError(error, {
            issueKey: "UserStore",
            keys: { operation: "fetch_preferences" },
          });
        }
      },

      updateProfile: async (data) => {
        set({ isUpdating: true, profileError: null });

        try {
          logger.info("🔄 Обновляем профиль через server action", {
            operation: "update_profile_start",
          });
          const updatedProfile = await updateUserProfile(data);
          logger.success("✅ Профиль обновлен", {
            operation: "update_profile_success",
            updatedProfile: updatedProfile,
          });

          set({
            profile: updatedProfile,
            isUpdating: false,
            lastFetched: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ошибка обновления профиля";
          set({
            profileError: errorMessage,
            isUpdating: false,
          });
          reportClientError(error, {
            issueKey: "UserStore",
            keys: { operation: "update_profile" },
          });
          throw error;
        }
      },

      updatePreferences: async (prefs) => {
        set({ isUpdatingPreferences: true, preferencesError: null });

        try {
          logger.info("🔄 Обновляем настройки через server action", {
            operation: "update_preferences_start",
          });
          const updatedPreferences = await updateUserPreferences(prefs);

          if (updatedPreferences) {
            set({
              preferences: updatedPreferences,
              isUpdatingPreferences: false,
              preferencesLastFetched: Date.now(),
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Ошибка обновления настроек";
          set({
            preferencesError: errorMessage,
            isUpdatingPreferences: false,
          });
          reportClientError(error, {
            issueKey: "UserStore",
            keys: { operation: "update_preferences" },
          });
          throw error;
        }
      },

      // ===== ОЧИСТКА =====
      clearUser: () => {
        set({
          user: null,
          profile: null,
          preferences: DEFAULT_USER_PREFERENCES,
          error: null,
          profileError: null,
          preferencesError: null,
          lastFetched: null,
          preferencesLastFetched: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      clearProfileError: () => {
        set({ profileError: null });
      },

      clearPreferencesError: () => {
        set({ preferencesError: null });
      },

      // ===== УТИЛИТЫ =====
      isProfileLoaded: () => {
        const state = get();
        return state.profile !== null && state.lastFetched !== null && !isStale(state.lastFetched);
      },

      isPreferencesLoaded: () => {
        const state = get();
        return (
          state.preferencesLastFetched !== null && !isPreferencesStale(state.preferencesLastFetched)
        );
      },

      hasProfile: () => {
        return get().profile !== null;
      },

      getUserDisplayName: () => {
        const state = get();
        if (state.profile?.fullName) {
          return state.profile.fullName;
        }
        if (state.user?.username) {
          return state.user.username;
        }
        return "Пользователь";
      },
    }),
    {
      name: "user-store",
      partialize: (state) => ({
        // Сохраняем только важные данные
        preferences: state.preferences,
        lastFetched: state.lastFetched,
        preferencesLastFetched: state.preferencesLastFetched,
      }),
    },
  ),
);

// Экспорт глобальной переменной для Safari совместимости
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__USER_STORE__ = useUserStore;
}

// ===== ХУКИ ДЛЯ УДОБСТВА =====

/**
 * Хук для инициализации пользователя
 */
export const useUserInitializer = () => {
  const { setUser } = useUserStore();

  useEffect(() => {
    // Инициализация будет происходить в UserProvider
  }, [setUser]);
};

/**
 * Хук для получения данных пользователя
 */
export const useUserData = () => {
  const {
    user,
    profile,
    isLoading,
    error,
    profileError,
    fetchProfile,
    updateProfile,
    clearError,
    clearProfileError,
  } = useUserStore();

  return {
    user,
    profile,
    isLoading,
    error,
    profileError,
    fetchProfile,
    updateProfile,
    clearError,
    clearProfileError,
  };
};

/**
 * Хук для работы с настройками пользователя
 */
export const useUserPreferences = () => {
  const {
    preferences,
    isUpdatingPreferences,
    preferencesError,
    fetchPreferences,
    updatePreferences,
    clearPreferencesError,
  } = useUserStore();

  return {
    preferences,
    isUpdatingPreferences,
    preferencesError,
    fetchPreferences,
    updatePreferences,
    clearPreferencesError,
  };
};
