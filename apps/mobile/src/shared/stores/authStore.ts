import { clearRegisteredGallerySession } from "./galleryCleanupBridge";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ConsentPayload } from "@/shared/constants/consent";
import { authApi, type User } from "@/shared/lib/api";
import type { UpdatedUserProfile } from "@/shared/lib/api/user";
import { identifyUser, resetAnalyticsUser } from "@/shared/lib/analytics";
import { reportClientError } from "@/shared/lib/error-reporting";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";

import { setGetUserId } from "./getUserId";
import { resetUserStores } from "./resetAll";
import { zustandStorage } from "./storage";
import { acknowledgePendingLogout, rememberPendingLogout, retryPendingLogouts } from "./pendingLogoutRevocations";

async function retryPendingLogout(): Promise<void> {
  await retryPendingLogouts(
    (token) => authApi.logout(token),
    (error) => reportClientError(error, { issueKey: "PendingLogoutRevocation" }),
  );
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Memory-only verified native session epoch; never persisted or inferred from cached user. */
  verifiedSessionEpoch: string | null;

}

interface AuthActions {
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    tempSessionId: string,
    consentPayload: ConsentPayload,
    promoCode?: string,
  ) => Promise<{ success: boolean; error?: string; code?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setUserProfile: (profile: UpdatedUserProfile) => void;
  handleSessionExpired: () => void;

}

type AuthStore = AuthState & AuthActions;

function isTransientAuthCheckError(response: { code?: string; error?: string }): boolean {
  return (
    response.code === "NETWORK_ERROR" ||
    response.code === "REQUEST_TIMEOUT" ||
    response.code === "AUTH_REFRESH_UNAVAILABLE" ||
    response.error === "Нет подключения к интернету"
  );
}

/** V2 Phase1 is local-only. A failed store must never break ordinary login. */
async function beginV2AfterVerifiedProfile(principalId: string): Promise<void> {
  try {
    await newOnlyV2NativeQueues.beginVerifiedLogin(principalId);
  } catch (error) {
    reportClientError(error, { issueKey: "V2OfflineAuthBinding" });
  }
}
async function restoreV2AfterVerifiedProfile(
  principalId: string,
  sessionIsCurrent: () => boolean,
): Promise<void> {
  try {
    const restored = await newOnlyV2NativeQueues.restoreVerifiedSession(principalId);
    if (!restored && sessionIsCurrent()) {
      // An app upgraded from a pre-V2 build can have a valid JWT and profile
      // but no native V2 session binding. Bootstrap ONLY after the server has
      // verified the profile; do not promote an unverified cached user.
      await newOnlyV2NativeQueues.beginVerifiedLogin(principalId);
    }
  } catch (error) {
    reportClientError(error, { issueKey: "V2OfflineAuthRestore" });
  }
}
function fenceV2OnSignOut(): void {
  void newOnlyV2NativeQueues.endSession().catch((error: unknown) => {
    reportClientError(error, { issueKey: "V2OfflineAuthSignOut" });
  });
}

let authCheckPromise: Promise<void> | null = null;
let authSessionGeneration = 0;
async function waitForAuthHydration(): Promise<void> {
  if (useAuthStore.persist.hasHydrated()) return;

  await new Promise<void>((resolve) => {
    const finish = () => {
      unsubscribe();
      resolve();
    };

    const unsubscribe = useAuthStore.persist.onFinishHydration(finish);
    if (useAuthStore.persist.hasHydrated()) finish();
  });
}

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
      verifiedSessionEpoch: null,

      /**
       * Авторизация пользователя
       */
      login: async (username, password) => {
        void retryPendingLogout();
        try {
          if (__DEV__) console.log("[authStore] login start", { username });
          const response = await authApi.login(username, password);

          if (!response.success || !response.data) {
            if (__DEV__) console.log("[authStore] login API fail", response);
            return { success: false, error: response.error || "Ошибка авторизации" };
          }

          const { accessToken, refreshToken } = response.data;
          if (__DEV__) console.log("[authStore] tokens received");

          // A verified new login fences a still-pending startup checkAuth.
          authSessionGeneration += 1;
          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          const profileRes = await authApi.getProfile();
          if (!profileRes.success || !profileRes.data) {
            if (__DEV__) console.log("[authStore] getProfile fail", profileRes);
            return { success: false, error: "Ошибка загрузки профиля" };
          }

          const user = profileRes.data;
          await beginV2AfterVerifiedProfile(user.id);
          if (__DEV__) {
            console.log("[authStore] profile", { id: user.id });
          }

          set({
            user,
            isAuthenticated: true,
            verifiedSessionEpoch: newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null,
            isLoading: false,
          });
          identifyUser(user.id);
          void import("@/shared/lib/api/mobile-intro")
            .then(({ trackMobileIntroAuthOutcome }) =>
              trackMobileIntroAuthOutcome("LOGGED_IN", user.id),
            )
            .catch(() => undefined);
          if (__DEV__) console.log("[authStore] login → isAuthenticated: true");
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthLogin" });
          console.error("Login error:", error);
          const keychainError = (error as { code?: string } | null)?.code === "ERR_KEY_CHAIN" ||
            (error instanceof Error && error.message.includes("KeyChainException"));
          return { success: false, error: keychainError
            ? "Не удалось сохранить данные входа в защищённом хранилище устройства"
            : "Ошибка подключения к серверу" };
        }
      },

      /**
       * Регистрация нового пользователя
       */
      register: async (name, email, password, tempSessionId, consentPayload, promoCode) => {
        try {
          if (__DEV__) console.log("[authStore] register start", { name, email, tempSessionId });
          const registrationChannel =
            Platform.OS === "ios" ? "IOS" : Platform.OS === "android" ? "ANDROID" : "WEB";
          const response = await authApi.register(
            name,
            email,
            password,
            tempSessionId,
            consentPayload,
            registrationChannel,
            promoCode,
          );

          if (__DEV__)
            console.log("[authStore] register API response", { success: response.success });

          if (!response.success) {
            return {
              success: false,
              error: response.error || "Ошибка регистрации",
              code: response.code,
            };
          }

          const { accessToken, refreshToken } = response.data;

          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          await beginV2AfterVerifiedProfile(response.data.user.id);
          set({
            user: response.data.user,
            isAuthenticated: true,
            verifiedSessionEpoch: newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null,
          });
          identifyUser(response.data.user.id);
          void import("@/shared/lib/api/mobile-intro")
            .then(({ trackMobileIntroAuthOutcome }) =>
              trackMobileIntroAuthOutcome("REGISTERED", response.data.user.id),
            )
            .catch(() => undefined);
          if (__DEV__) console.log("[authStore] register success");
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthRegister" });
          console.error("Register error:", error);
          if (__DEV__)
            console.log("[authStore] register catch", {
              error,
              message: (error as Error)?.message,
            });
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Выход из системы
       */
      logout: async () => {
        const generation = ++authSessionGeneration;
        fenceV2OnSignOut();
        clearRegisteredGallerySession();
        // Deauthenticate the UI immediately. Waiting for a disconnected API
        // must never leave protected screens displaying an active session.
        resetUserStores();
        set({
          user: null,
          isAuthenticated: false,
          verifiedSessionEpoch: null,
        });
        resetAnalyticsUser();

        let oldRefreshToken: string | null = null;
        try {
          oldRefreshToken = await SecureStore.getItemAsync("refresh_token");
          // Another verified login has taken over: never delete or revoke
          // credentials belonging to that newer auth generation.
          if (generation !== authSessionGeneration) return;
          if (oldRefreshToken) {
            try {
              await rememberPendingLogout(oldRefreshToken);
            } catch (storageError) {
              reportClientError(storageError, { issueKey: "LogoutRevocationQueueUnavailable" });
            }
          }
          // Clear credentials before network I/O, so offline logout does not
          // permit background API clients to continue authenticating.
          if (generation !== authSessionGeneration) return;
          await SecureStore.deleteItemAsync("auth_token");
          await SecureStore.deleteItemAsync("refresh_token");
        } catch (error) {
          reportClientError(error, { issueKey: "AuthLogoutLocalCleanup" });
          // Make a best effort to remove both tokens even after storage errors.
          if (generation === authSessionGeneration) {
            await Promise.allSettled([
              SecureStore.deleteItemAsync("auth_token"),
              SecureStore.deleteItemAsync("refresh_token"),
            ]);
          }
        }

        if (oldRefreshToken) {
          try {
            const result = await authApi.logout(oldRefreshToken);
            if (result.success) await acknowledgePendingLogout(oldRefreshToken);
          } catch (error) {
            reportClientError(error, { issueKey: "AuthLogoutServerRevocation" });
          }
        }
      },

      /**
       * Проверка текущей авторизации при запуске приложения
       */
      checkAuth: () => {
        if (authCheckPromise) return authCheckPromise;

        const runCheck = async () => {
          void retryPendingLogout();
          const generation = authSessionGeneration;
          if (__DEV__) console.log("[authStore] checkAuth start");
          set({ isLoading: true });

          try {
            // Persisted user data is the startup cache. Wait for it before deciding
            // whether the app can render immediately while validation continues.
            await waitForAuthHydration();
            const token = await SecureStore.getItemAsync("auth_token");

            if (!token) {
              if (__DEV__) console.log("[authStore] checkAuth: no token");
              set({
                isLoading: false,
                isAuthenticated: false,
                verifiedSessionEpoch: null,
                user: null,
              });
              return;
            }

            const persistedUser = useAuthStore.getState().user;
            if (persistedUser) {
              set({
                user: persistedUser,
                isAuthenticated: true,
                verifiedSessionEpoch: null,
                isLoading: false,
              });
              identifyUser(persistedUser.id);
            }

            // Refresh cached profile in the background. The root UI no longer waits
            // for this request when a local user is available.
            const response = await authApi.getProfile();
            if (generation !== authSessionGeneration) return;
            const isTransientError = isTransientAuthCheckError(response);

            if (response.success && response.data) {
              const userData = response.data;
              if (__DEV__) {
                console.log("[authStore] checkAuth profile", { id: userData.id });
              }

              // Migrate an existing, server-verified login from a pre-V2 app.
              await restoreV2AfterVerifiedProfile(
                userData.id, () => generation === authSessionGeneration,
              );
              if (generation !== authSessionGeneration) return;

              set({
                user: userData,
                isAuthenticated: true,
                verifiedSessionEpoch: newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null,
                isLoading: false,
              });
              identifyUser(userData.id);
              if (__DEV__) console.log("[authStore] checkAuth: isAuthenticated: true");
            } else if (isTransientError && persistedUser) {
              if (__DEV__) {
                console.log("[authStore] checkAuth: offline fallback with persisted user", {
                  id: persistedUser.id,
                });
              }
              // Cache-first state is already active; keep it until connectivity returns.
            } else if (isTransientError) {
              set({
                isLoading: false,
                isAuthenticated: false,
                verifiedSessionEpoch: null,
              });
            } else {
              if (__DEV__) console.log("[authStore] checkAuth: invalid token", response);
              await SecureStore.deleteItemAsync("auth_token");
              await SecureStore.deleteItemAsync("refresh_token");
              set({
                isLoading: false,
                isAuthenticated: false,
                verifiedSessionEpoch: null,
                user: null,
              });
            }
          } catch (error) {
            reportClientError(error, {
              issueKey: "AuthCheck",
              userId: useAuthStore.getState().user?.id,
            });
            console.error("Auth check error:", error);
            set({ isLoading: false });
          }
        };

        const promise = runCheck().finally(() => {
          if (authCheckPromise === promise) authCheckPromise = null;
        });
        authCheckPromise = promise;
        return promise;
      },

      /**
       * Вызывается когда сессия истекла (refresh не удался)
       */
      handleSessionExpired: () => {
        authSessionGeneration += 1;
        fenceV2OnSignOut();
        clearRegisteredGallerySession();
        resetUserStores();
        set({
          user: null,
          isAuthenticated: false,
          verifiedSessionEpoch: null,
        });
        resetAnalyticsUser();
      },

      /**
       * Установка данных пользователя (например, после обновления профиля)
       */
      setUser: (user) => set({ user }),
      setUserProfile: (profile) =>
        set((state) => {
          if (!state.user || state.user.id !== profile.userId) return state;
          return { user: { ...state.user, profile } };
        }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => zustandStorage),
      // Персистим только данные пользователя
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

setGetUserId(() => useAuthStore.getState().user?.id);
