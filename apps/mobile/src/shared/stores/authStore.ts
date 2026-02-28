import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";

import type { ConsentPayload } from "@/shared/constants/consent";
import { authApi, type User } from "@/shared/lib/api";

import { setGetUserId } from "./getUserId";
import { resetUserStores } from "./resetAll";
import { zustandStorage } from "./storage";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingConfirmPhone: string | null;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    phone: string,
    password: string,
    tempSessionId: string,
    consentPayload: ConsentPayload,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  handleSessionExpired: () => void;
  setPendingConfirmPhone: (phone: string) => void;
  clearPendingConfirmPhone: () => void;
}

type AuthStore = AuthState & AuthActions;

/**
 * Store для управления аутентификацией
 * Токены хранятся в SecureStore, данные пользователя в AsyncStorage
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // Начальное состояние
      user: null,
      isLoading: true,
      isAuthenticated: false,
      pendingConfirmPhone: null,

      /**
       * Авторизация пользователя
       */
      login: async (username, password) => {
        try {
          if (__DEV__) console.log("[authStore] login start", { username });
          const response = await authApi.login(username, password);

          if (!response.success || !response.data) {
            if (__DEV__) console.log("[authStore] login API fail", response);
            return { success: false, error: response.error || "Ошибка авторизации" };
          }

          const { accessToken, refreshToken } = response.data;
          if (__DEV__) console.log("[authStore] tokens received");

          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          const profileRes = await authApi.getProfile();
          if (!profileRes.success || !profileRes.data) {
            if (__DEV__) console.log("[authStore] getProfile fail", profileRes);
            return { success: false, error: "Ошибка загрузки профиля" };
          }

          const user = profileRes.data;
          // undefined = считаем неподтверждённым (безопасно; API должен возвращать isConfirmed)
          const isConfirmed = user.isConfirmed === true;
          if (__DEV__) console.log("[authStore] profile", { id: user.id, isConfirmed: user.isConfirmed });

          if (!isConfirmed) {
            set({ user, isAuthenticated: false, pendingConfirmPhone: user.phone });
            if (__DEV__) console.log("[authStore] user NOT confirmed → pendingConfirmPhone");
            return { success: true };
          }

          set({ user, isAuthenticated: true, pendingConfirmPhone: null });
          if (__DEV__) console.log("[authStore] user confirmed → isAuthenticated: true");
          return { success: true };
        } catch (error) {
          console.error("Login error:", error);
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Регистрация нового пользователя
       */
      register: async (name, phone, password, tempSessionId, consentPayload) => {
        try {
          if (__DEV__) console.log("[authStore] register start", { name, phone, tempSessionId });
          const response = await authApi.register(
            name,
            phone,
            password,
            tempSessionId,
            consentPayload,
          );

          if (__DEV__) console.log("[authStore] register API response", {
            success: response.success,
            error: response.error,
            code: response.code,
            hasData: !!response.data,
          });

          if (!response.success || !response.data) {
            return { success: false, error: response.error || "Ошибка регистрации" };
          }

          const { user, accessToken, refreshToken } = response.data;

          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          // API не возвращает phone в user — берём из параметра
          set({ user, isAuthenticated: false, pendingConfirmPhone: phone });
          if (__DEV__) console.log("[authStore] register success, userId:", user.id);
          return { success: true };
        } catch (error) {
          console.error("Register error:", error);
          if (__DEV__) console.log("[authStore] register catch", { error, message: (error as Error)?.message });
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Выход из системы
       */
      logout: async () => {
        try {
          const refreshToken = await SecureStore.getItemAsync("refresh_token");
          if (refreshToken) {
            await authApi.logout(refreshToken);
          }
        } catch (error) {
          console.error("Logout API error:", error);
        }

        // Удаляем оба токена из SecureStore
        await SecureStore.deleteItemAsync("auth_token");
        await SecureStore.deleteItemAsync("refresh_token");

        resetUserStores();
        set({ user: null, isAuthenticated: false, pendingConfirmPhone: null });
      },

      /**
       * Проверка текущей авторизации при запуске приложения
       */
      checkAuth: async () => {
        if (__DEV__) console.log("[authStore] checkAuth start");
        set({ isLoading: true });

        try {
          const token = await SecureStore.getItemAsync("auth_token");

          if (!token) {
            if (__DEV__) console.log("[authStore] checkAuth: no token");
            set({ isLoading: false, isAuthenticated: false, user: null, pendingConfirmPhone: null });
            return;
          }

          const response = await authApi.getProfile();

          if (response.success && response.data) {
            const userData = response.data;
            const isConfirmed = userData.isConfirmed === true;
            if (__DEV__) {
              console.log("[authStore] checkAuth profile", { isConfirmed: userData.isConfirmed });
              if (userData.isConfirmed === undefined) {
                console.warn("[authStore] API не возвращает isConfirmed — считаем неподтверждённым. Добавьте поле в GET /user/profile");
              }
            }

            if (!isConfirmed) {
              set({
                user: userData,
                isAuthenticated: false,
                isLoading: false,
                pendingConfirmPhone: userData.phone,
              });
              if (__DEV__) console.log("[authStore] checkAuth: NOT confirmed");
              return;
            }

            set({
              user: userData,
              isAuthenticated: true,
              isLoading: false,
              pendingConfirmPhone: null,
            });
            if (__DEV__) console.log("[authStore] checkAuth: confirmed, isAuthenticated: true");
          } else {
            if (__DEV__) console.log("[authStore] checkAuth: invalid token", response);
            await SecureStore.deleteItemAsync("auth_token");
            await SecureStore.deleteItemAsync("refresh_token");
            set({ isLoading: false, isAuthenticated: false, user: null, pendingConfirmPhone: null });
          }
        } catch (error) {
          console.error("Auth check error:", error);
          set({ isLoading: false });
        }
      },

      /**
       * Вызывается когда сессия истекла (refresh не удался)
       */
      handleSessionExpired: () => {
        resetUserStores();
        set({ user: null, isAuthenticated: false, pendingConfirmPhone: null });
      },

      /**
       * Установка данных пользователя (например, после обновления профиля)
       */
      setUser: (user) => set({ user }),
      setPendingConfirmPhone: (phone) => set({ pendingConfirmPhone: phone }),
      clearPendingConfirmPhone: () => set({ pendingConfirmPhone: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => zustandStorage),
      // Персистим только данные пользователя
      partialize: (state) => ({ user: state.user, pendingConfirmPhone: state.pendingConfirmPhone }),
    },
  ),
);

setGetUserId(() => useAuthStore.getState().user?.id);
