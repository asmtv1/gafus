import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ConsentPayload } from "@/shared/constants/consent";
import { authApi, type User } from "@/shared/lib/api";
import type { UpdatedUserProfile } from "@/shared/lib/api/user";
import { identifyUser, resetAnalyticsUser } from "@/shared/lib/analytics";
import { reportClientError } from "@/shared/lib/tracer";

import { setGetUserId } from "./getUserId";
import { resetUserStores } from "./resetAll";
import { zustandStorage } from "./storage";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingVkPhone: boolean;
  /** Новый VK-пользователь — нужно собрать согласия */
  pendingVkConsent: boolean;
  vkConsentToken: string | null;
  vkConsentState: string | null;
  vkConsentTempSessionId: string | null;
  vkConsentPromoCode: string | null;
  vkConsentExpiresAt: number | null;
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
  loginViaVk: (params: {
    code: string;
    code_verifier: string;
    device_id: string;
    state: string;
    platform?: "ios" | "android";
    promoCode?: string;
  }) => Promise<{ success: boolean; error?: string; code?: string; needsPhone?: boolean; needsConsent?: boolean }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setUserProfile: (profile: UpdatedUserProfile) => void;
  handleSessionExpired: () => void;
  clearPendingVkPhone: () => void;
  setVkPhoneComplete: (phone: string) => Promise<{ success: boolean; error?: string }>;
  clearPendingVkConsent: () => Promise<void>;
  updateVkConsentPromoCode: (promoCode: string) => Promise<void>;
  submitVkConsentComplete: (
    consentPayload: ConsentPayload,
    promoCode?: string,
  ) => Promise<{ success: boolean; error?: string; code?: string }>;
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

let authCheckPromise: Promise<void> | null = null;
let authSessionGeneration = 0;
const VK_REGISTRATION_CONTEXT_KEY = "vk_registration_context";
const VK_REGISTRATION_CONTEXT_TTL_MS = 5 * 60 * 1000;

type PersistedVkRegistrationContext = {
  contextToken: string;
  state: string;
  tempSessionId: string;
  promoCode: string | null;
  expiresAt: number;
};

async function saveVkRegistrationContext(context: PersistedVkRegistrationContext): Promise<void> {
  await SecureStore.setItemAsync(VK_REGISTRATION_CONTEXT_KEY, JSON.stringify(context));
}

async function readVkRegistrationContext(): Promise<PersistedVkRegistrationContext | null> {
  const raw = await SecureStore.getItemAsync(VK_REGISTRATION_CONTEXT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedVkRegistrationContext>;
    if (
      typeof value.contextToken !== "string" ||
      typeof value.state !== "string" ||
      typeof value.tempSessionId !== "string" ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      value.expiresAt <= Date.now()
    ) {
      await clearVkRegistrationContext();
      return null;
    }
    return {
      contextToken: value.contextToken,
      state: value.state,
      tempSessionId: value.tempSessionId,
      promoCode: typeof value.promoCode === "string" ? value.promoCode : null,
      expiresAt: value.expiresAt,
    };
  } catch {
    await clearVkRegistrationContext();
    return null;
  }
}

async function clearVkRegistrationContext(): Promise<void> {
  await SecureStore.deleteItemAsync(VK_REGISTRATION_CONTEXT_KEY);
}

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
      pendingVkPhone: false,
      pendingVkConsent: false,
      vkConsentToken: null,
      vkConsentState: null,
      vkConsentTempSessionId: null,
      vkConsentPromoCode: null,
      vkConsentExpiresAt: null,

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
          if (__DEV__) {
            console.log("[authStore] profile", { id: user.id });
          }

          set({
            user,
            isAuthenticated: true,
            pendingVkPhone: false,
            pendingVkConsent: false,
            vkConsentToken: null,
            vkConsentState: null,
            vkConsentTempSessionId: null,
            vkConsentPromoCode: null,
            vkConsentExpiresAt: null,
          });
          await clearVkRegistrationContext();
          identifyUser(user.id);
          void import("@/shared/lib/api/mobile-intro").then(({ trackMobileIntroAuthOutcome }) => trackMobileIntroAuthOutcome("LOGGED_IN", user.id)).catch(() => undefined);
          if (__DEV__) console.log("[authStore] login → isAuthenticated: true");
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthLogin" });
          console.error("Login error:", error);
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Авторизация через VK ID (мобильный, PKCE)
       */
      loginViaVk: async (params) => {
        try {
          const response = await authApi.loginViaVk(params);

          if (!response.success || !response.data) {
            return { success: false, error: response.error || "Ошибка авторизации VK" };
          }

          const { accessToken, refreshToken, needsPhone, needsConsent, contextToken, vkConsentToken, savedPromoCode, user } =
            response.data;

          const pendingContextToken = contextToken ?? vkConsentToken;
          if (needsConsent && pendingContextToken) {
            const tempSessionId = Crypto.randomUUID();
            const promoCode = savedPromoCode?.trim() || params.promoCode?.trim() || null;
            const expiresAt = Date.now() + VK_REGISTRATION_CONTEXT_TTL_MS;
            await saveVkRegistrationContext({
              contextToken: pendingContextToken,
              state: params.state,
              tempSessionId,
              promoCode,
              expiresAt,
            });
            resetUserStores();
            set({
              user: { ...user, phone: "", email: null } as User,
              isAuthenticated: false,
              pendingVkPhone: false,
              pendingVkConsent: true,
              vkConsentToken: pendingContextToken,
              vkConsentState: params.state,
              vkConsentTempSessionId: tempSessionId,
              vkConsentPromoCode: promoCode,
              vkConsentExpiresAt: expiresAt,
            });
            return { success: true, needsConsent: true };
          }

          if (!accessToken || !refreshToken) {
            return { success: false, error: "VK ID не завершил вход. Повторите попытку.", code: "VK_TOKENS_MISSING" };
          }

          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken!);
          await SecureStore.setItemAsync("refresh_token", refreshToken!);

          if (needsPhone) {
            // Телефон не задан — направляем на экран установки телефона
            set({
              user: { ...user, phone: "", email: null } as User,
              isAuthenticated: false,
              pendingVkPhone: true,
            });
            return { success: true, needsPhone: true };
          }

          const profileRes = await authApi.getProfile();
          if (!profileRes.success || !profileRes.data) {
            return { success: false, error: "Ошибка загрузки профиля" };
          }

          set({
            user: profileRes.data,
            isAuthenticated: true,
            pendingVkPhone: false,
            pendingVkConsent: false,
            vkConsentToken: null,
            vkConsentState: null,
            vkConsentTempSessionId: null,
            vkConsentPromoCode: null,
            vkConsentExpiresAt: null,
          });
          await clearVkRegistrationContext();
          identifyUser(profileRes.data.id);
          void import("@/shared/lib/api/mobile-intro").then(({ trackMobileIntroAuthOutcome }) => trackMobileIntroAuthOutcome("LOGGED_IN", profileRes.data!.id)).catch(() => undefined);
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthVkLogin" });
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Регистрация нового пользователя
       */
      register: async (name, email, password, tempSessionId, consentPayload, promoCode) => {
        try {
          if (__DEV__) console.log("[authStore] register start", { name, email, tempSessionId });
          const registrationChannel =
            Platform.OS === "ios"
              ? "IOS"
              : Platform.OS === "android"
                ? "ANDROID"
                : "WEB";
          const response = await authApi.register(
            name,
            email,
            password,
            tempSessionId,
            consentPayload,
            registrationChannel,
            promoCode,
          );

          if (__DEV__) console.log("[authStore] register API response", { success: response.success });

          if (!response.success) {
            return { success: false, error: response.error || "Ошибка регистрации", code: response.code };
          }

          const { accessToken, refreshToken } = response.data;

          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken);
          await SecureStore.setItemAsync("refresh_token", refreshToken);

          set({
            user: response.data.user,
            isAuthenticated: true,
            pendingVkPhone: false,
            pendingVkConsent: false,
            vkConsentToken: null,
            vkConsentState: null,
            vkConsentTempSessionId: null,
            vkConsentPromoCode: null,
            vkConsentExpiresAt: null,
          });
          await clearVkRegistrationContext();
          identifyUser(response.data.user.id);
          void import("@/shared/lib/api/mobile-intro").then(({ trackMobileIntroAuthOutcome }) => trackMobileIntroAuthOutcome("REGISTERED", response.data.user.id)).catch(() => undefined);
          if (__DEV__) console.log("[authStore] register success");
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthRegister" });
          console.error("Register error:", error);
          if (__DEV__) console.log("[authStore] register catch", { error, message: (error as Error)?.message });
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * Выход из системы
       */
      logout: async () => {
        authSessionGeneration += 1;
        try {
          const refreshToken = await SecureStore.getItemAsync("refresh_token");
          if (refreshToken) {
            await authApi.logout(refreshToken);
          }
        } catch (error) {
          reportClientError(error, { issueKey: "AuthLogout", userId: useAuthStore.getState().user?.id });
          console.error("Logout API error:", error);
        }

        // Удаляем оба токена из SecureStore
        await SecureStore.deleteItemAsync("auth_token");
        await SecureStore.deleteItemAsync("refresh_token");

        resetUserStores();
        set({
          user: null,
          isAuthenticated: false,
          pendingVkPhone: false,
          pendingVkConsent: false,
          vkConsentToken: null,
          vkConsentState: null,
          vkConsentTempSessionId: null,
          vkConsentPromoCode: null,
          vkConsentExpiresAt: null,
        });
        await clearVkRegistrationContext();
        resetAnalyticsUser();
      },

      /**
       * Проверка текущей авторизации при запуске приложения
       */
      checkAuth: () => {
        if (authCheckPromise) return authCheckPromise;

        const runCheck = async () => {
          const generation = authSessionGeneration;
          if (__DEV__) console.log("[authStore] checkAuth start");
          set({ isLoading: true });

          try {
            // Persisted user data is the startup cache. Wait for it before deciding
            // whether the app can render immediately while validation continues.
            await waitForAuthHydration();
            const token = await SecureStore.getItemAsync("auth_token");

            if (!token) {
              const pendingContext = await readVkRegistrationContext();
              if (pendingContext) {
                const contextResponse = await authApi.getVkConsentContext(
                  pendingContext.contextToken,
                  pendingContext.state,
                );
                if (contextResponse.success && contextResponse.data && !contextResponse.data.completed) {
                  set({
                    isLoading: false,
                    isAuthenticated: false,
                    user: null,
                    pendingVkPhone: false,
                    pendingVkConsent: true,
                    vkConsentToken: pendingContext.contextToken,
                    vkConsentState: pendingContext.state,
                    vkConsentTempSessionId: pendingContext.tempSessionId,
                    vkConsentPromoCode: contextResponse.data.savedPromoCode ?? pendingContext.promoCode,
                    vkConsentExpiresAt: pendingContext.expiresAt,
                  });
                  return;
                }
                if (!contextResponse.success && isTransientAuthCheckError(contextResponse)) {
                  // The persisted context is still inside its local five-minute TTL.
                  // Keep it resumable instead of discarding a consent form because of
                  // a transient launch-time connectivity failure.
                  set({
                    isLoading: false,
                    isAuthenticated: false,
                    user: null,
                    pendingVkPhone: false,
                    pendingVkConsent: true,
                    vkConsentToken: pendingContext.contextToken,
                    vkConsentState: pendingContext.state,
                    vkConsentTempSessionId: pendingContext.tempSessionId,
                    vkConsentPromoCode: pendingContext.promoCode,
                    vkConsentExpiresAt: pendingContext.expiresAt,
                  });
                  return;
                }
                if (contextResponse.success || !isTransientAuthCheckError(contextResponse)) {
                  await clearVkRegistrationContext();
                }
              }
              if (__DEV__) console.log("[authStore] checkAuth: no token");
              set({
                isLoading: false,
                isAuthenticated: false,
                user: null,
                pendingVkPhone: false,
                pendingVkConsent: false,
                vkConsentExpiresAt: null,
              });
              return;
            }

            const persistedUser = useAuthStore.getState().user;
            if (persistedUser) {
              const pendingVkPhone = persistedUser.phone?.startsWith("vk_") === true;
              set({
                user: persistedUser,
                isAuthenticated: !pendingVkPhone,
                isLoading: false,
                pendingVkPhone,
              });
              if (!pendingVkPhone) identifyUser(persistedUser.id);
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

              // VK-пользователь с временным phone (vk_xxx) — экран установки телефона
              if (userData.phone?.startsWith("vk_")) {
                set({
                  user: userData,
                  isAuthenticated: false,
                  isLoading: false,
                  pendingVkPhone: true,
                });
                if (__DEV__) {
                  console.log("[authStore] checkAuth: VK user without phone → pendingVkPhone");
                }
                return;
              }

              set({
                user: userData,
                isAuthenticated: true,
                isLoading: false,
                pendingVkPhone: false,
                pendingVkConsent: false,
                vkConsentExpiresAt: null,
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
                pendingVkPhone: false,
              });
            } else {
              if (__DEV__) console.log("[authStore] checkAuth: invalid token", response);
              await SecureStore.deleteItemAsync("auth_token");
              await SecureStore.deleteItemAsync("refresh_token");
              set({
                isLoading: false,
                isAuthenticated: false,
                user: null,
                pendingVkPhone: false,
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
        resetUserStores();
        set({
          user: null,
          isAuthenticated: false,
          pendingVkPhone: false,
          pendingVkConsent: false,
          vkConsentToken: null,
          vkConsentState: null,
          vkConsentTempSessionId: null,
          vkConsentPromoCode: null,
          vkConsentExpiresAt: null,
        });
        void clearVkRegistrationContext();
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
      clearPendingVkPhone: () => set({ pendingVkPhone: false }),
      clearPendingVkConsent: async () => {
        await clearVkRegistrationContext();
        set({
          pendingVkConsent: false,
          vkConsentToken: null,
          vkConsentState: null,
          vkConsentTempSessionId: null,
          vkConsentPromoCode: null,
          vkConsentExpiresAt: null,
        });
      },
      updateVkConsentPromoCode: async (promoCode) => {
        const { vkConsentToken, vkConsentState, vkConsentTempSessionId, vkConsentExpiresAt } = useAuthStore.getState();
        if (!vkConsentToken || !vkConsentState || !vkConsentTempSessionId || !vkConsentExpiresAt) return;
        if (vkConsentExpiresAt <= Date.now()) {
          await clearVkRegistrationContext();
          set({
            pendingVkConsent: false,
            vkConsentToken: null,
            vkConsentState: null,
            vkConsentTempSessionId: null,
            vkConsentPromoCode: null,
            vkConsentExpiresAt: null,
          });
          return;
        }
        const normalizedPromoCode = promoCode.trim() || null;
        await saveVkRegistrationContext({
          contextToken: vkConsentToken,
          state: vkConsentState,
          tempSessionId: vkConsentTempSessionId,
          promoCode: normalizedPromoCode,
          expiresAt: vkConsentExpiresAt,
        });
        set({ vkConsentPromoCode: normalizedPromoCode });
      },

      submitVkConsentComplete: async (consentPayload, promoCode) => {
        const {
          vkConsentToken: token,
          vkConsentState: state,
          vkConsentTempSessionId: tempSessionId,
          vkConsentExpiresAt: expiresAt,
        } = useAuthStore.getState();
        if (!token || !state || !tempSessionId || !expiresAt || expiresAt <= Date.now()) {
          await clearVkRegistrationContext();
          set({
            user: null,
            isAuthenticated: false,
            pendingVkPhone: false,
            pendingVkConsent: false,
            vkConsentToken: null,
            vkConsentState: null,
            vkConsentTempSessionId: null,
            vkConsentPromoCode: null,
            vkConsentExpiresAt: null,
          });
          return { success: false, error: "Токен устарел. Повторите вход через VK.", code: "CONTEXT_EXPIRED" };
        }
        try {
          await saveVkRegistrationContext({
            contextToken: token,
            state,
            tempSessionId,
            promoCode: promoCode?.trim() || null,
            expiresAt,
          });
          const response = await authApi.submitVkConsent(token, state, tempSessionId, consentPayload, promoCode);
          if (!response.success || !response.data) {
            if (["CONTEXT_INVALID", "CONTEXT_EXPIRED", "VK_CONTEXT_PURPOSE_INVALID"].includes(response.code ?? "")) {
              // The form keeps its locally entered promo code; the opaque context
              // itself is no longer reusable and must never be restored.
              await clearVkRegistrationContext();
              set({
                user: null,
                isAuthenticated: false,
                pendingVkPhone: false,
                pendingVkConsent: false,
                vkConsentToken: null,
                vkConsentState: null,
                vkConsentTempSessionId: null,
                vkConsentPromoCode: null,
                vkConsentExpiresAt: null,
              });
            }
            return { success: false, error: response.error || "Ошибка сохранения согласий", code: response.code };
          }
          const { accessToken, refreshToken, needsPhone, user } = response.data;
          resetUserStores();
          await SecureStore.setItemAsync("auth_token", accessToken!);
          await SecureStore.setItemAsync("refresh_token", refreshToken!);
          if (needsPhone) {
            set({
              user: { ...user, phone: "", email: null } as User,
              isAuthenticated: false,
              pendingVkPhone: true,
              pendingVkConsent: false,
              vkConsentToken: null,
              vkConsentState: null,
              vkConsentTempSessionId: null,
              vkConsentPromoCode: null,
              vkConsentExpiresAt: null,
            });
          } else {
            set({
              user: user as User,
              isAuthenticated: true,
              pendingVkPhone: false,
              pendingVkConsent: false,
              vkConsentToken: null,
              vkConsentState: null,
              vkConsentTempSessionId: null,
              vkConsentPromoCode: null,
              vkConsentExpiresAt: null,
            });
            identifyUser(user.id);
          }
          await clearVkRegistrationContext();
          void import("@/shared/lib/api/mobile-intro").then(({ trackMobileIntroAuthOutcome }) => trackMobileIntroAuthOutcome("REGISTERED", user.id)).catch(() => undefined);
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthVkConsent" });
          return { success: false, error: "Ошибка подключения к серверу" };
        }
      },

      /**
       * После установки телефона VK-пользователем: POST vk-phone-set → getProfile
       */
      setVkPhoneComplete: async (phone) => {
        try {
          const response = await authApi.setVkPhone(phone);
          if (!response.success) {
            return { success: false, error: response.error || "Ошибка" };
          }

          const profileRes = await authApi.getProfile();
          if (!profileRes.success || !profileRes.data) {
            return { success: false, error: "Ошибка загрузки профиля" };
          }

          const user = profileRes.data;
          set({
            user,
            isAuthenticated: true,
            pendingVkPhone: false,
          });
          identifyUser(user.id);
          void import("@/shared/lib/api/mobile-intro").then(({ trackMobileIntroAuthOutcome }) => trackMobileIntroAuthOutcome("LOGGED_IN", user.id)).catch(() => undefined);
          return { success: true };
        } catch (error) {
          reportClientError(error, { issueKey: "AuthVkPhoneSet" });
          return { success: false, error: "Ошибка подключения" };
        }
      },
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
