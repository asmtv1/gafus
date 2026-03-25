import { USER_CACHE_DURATION } from "@gafus/types";
import { getUserProfile, updateUserProfile } from "@shared/lib/user";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";
import { reportClientError } from "@gafus/error-handling";

import type { UserStore } from "./types";

const logger = createWebLogger("web-user-store");

const isStale = (timestamp: number, maxAge: number = USER_CACHE_DURATION) => {
  return Date.now() - timestamp > maxAge;
};

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: false,
      isUpdating: false,
      error: null,
      profileError: null,
      lastFetched: null,

      setUser: (user) => {
        set({ user, error: null });
      },

      setProfile: (profile) => {
        set({ profile, profileError: null, lastFetched: Date.now() });
      },

      fetchProfile: async () => {
        const state = get();

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

      clearUser: () => {
        set({
          user: null,
          profile: null,
          error: null,
          profileError: null,
          lastFetched: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      clearProfileError: () => {
        set({ profileError: null });
      },

      isProfileLoaded: () => {
        const state = get();
        return state.profile !== null && state.lastFetched !== null && !isStale(state.lastFetched);
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
      name: "user-store-v2",
      partialize: (state) => ({
        lastFetched: state.lastFetched,
      }),
    },
  ),
);

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__USER_STORE__ = useUserStore;
}

export const useUserInitializer = () => {
  const { setUser } = useUserStore();

  useEffect(() => {
    // Инициализация будет происходить в UserProvider
  }, [setUser]);
};

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
