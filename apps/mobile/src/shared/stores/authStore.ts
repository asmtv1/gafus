import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import { zustandStorage } from "./storage";
import { authApi, type User } from "@/shared/lib/api";
import { API_BASE_URL } from "@/constants";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

type AuthStore = AuthState & AuthActions;

/**
 * Store для управления аутентификацией
 * Токен хранится в SecureStore, данные пользователя в AsyncStorage
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      user: null,
      token: null,
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

          const { user, token } = response.data;

          // Сохраняем токен в SecureStore (безопасное хранилище)
          await SecureStore.setItemAsync("auth_token", token);

          set({
            user,
            token,
            isAuthenticated: true,
          });

          return { success: true };
        } catch (error) {
          console.error("Login error:", error);
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Выход из системы
       */
      logout: async () => {
        try {
          // Пытаемся инвалидировать токен на сервере
          await authApi.logout();
        } catch (error) {
          console.error("Logout API error:", error);
        }

        // Удаляем токен из SecureStore
        await SecureStore.deleteItemAsync("auth_token");

        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
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

          // Проверяем токен на сервере
          const response = await fetch(`${API_BASE_URL}/api/v1/user/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const result = await response.json();
            set({
              user: result.data,
              token,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            // Токен невалиден — удаляем
            await SecureStore.deleteItemAsync("auth_token");
            set({ isLoading: false, isAuthenticated: false, user: null, token: null });
          }
        } catch (error) {
          console.error("Auth check error:", error);
          set({ isLoading: false });
        }
      },

      /**
       * Установка данных пользователя (например, после обновления профиля)
       */
      setUser: (user) => set({ user }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => zustandStorage),
      // Персистим только данные пользователя, токен хранится отдельно в SecureStore
      partialize: (state) => ({ user: state.user }),
    }
  )
);
