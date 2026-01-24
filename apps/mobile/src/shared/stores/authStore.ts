import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import { zustandStorage } from "./storage";
import { authApi, type User } from "@/shared/lib/api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    phone: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  handleSessionExpired: () => void;
}

type AuthStore = AuthState & AuthActions;

/**
 * Store для управления аутентификацией
 * Токены хранятся в SecureStore, данные пользователя в AsyncStorage
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      user: null,
      isLoading: true,
      isAuthenticated: false,

      /**
       * Авторизация пользователя
       */
      login: async (username, password) => {
        try {
          const response = await authApi.login(username, password);

          if (!response.success || !response.data) {
            return { success: false, error: response.error || "Ошибка авторизации" };
          }

          const { user, accessToken, refreshToken } = response.data;

          // Сохраняем оба токена в SecureStore
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          set({ user, isAuthenticated: true });
          return { success: true };
        } catch (error) {
          console.error("Login error:", error);
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Регистрация нового пользователя
       */
      register: async (name, phone, password) => {
        try {
          const response = await authApi.register(name, phone, password);

          if (!response.success || !response.data) {
            return { success: false, error: response.error || "Ошибка регистрации" };
          }

          const { user, accessToken, refreshToken } = response.data;

          // Сохраняем оба токена в SecureStore
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          set({ user, isAuthenticated: true });
          return { success: true };
        } catch (error) {
          console.error("Register error:", error);
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

        set({ user: null, isAuthenticated: false });
      },

      /**
       * Проверка текущей авторизации при запуске приложения
       */
      checkAuth: async () => {
        set({ isLoading: true });

        try {
          const token = await SecureStore.getItemAsync("auth_token");

          if (!token) {
            set({ isLoading: false, isAuthenticated: false });
            return;
          }

          // Проверяем токен через API
          const response = await authApi.getProfile();

          if (response.success && response.data) {
            set({
              user: response.data,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Токен невалиден (auto-refresh уже попробовал обновить)
            await SecureStore.deleteItemAsync("auth_token");
            await SecureStore.deleteItemAsync("refresh_token");
            set({ isLoading: false, isAuthenticated: false, user: null });
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
        set({ user: null, isAuthenticated: false });
      },

      /**
       * Установка данных пользователя (например, после обновления профиля)
       */
      setUser: (user) => set({ user }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => zustandStorage),
      // Персистим только данные пользователя
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
