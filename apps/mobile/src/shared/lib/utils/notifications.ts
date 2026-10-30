import * as Device from "expo-device";
import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscriptionsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { createPushRegistrationCoordinator, type PushActor } from "./pushRegistrationOwner";

const PUSH_PERMISSION_EDUCATION_SEEN_KEY = "gafus:push-permission-education-seen:v1";
const pushRegistrationCoordinator = createPushRegistrationCoordinator();

/** Only a verified native login can own this device registration. */
export function getVerifiedPushActor(): PushActor | null {
  const auth = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (
    !auth.isAuthenticated ||
    auth.isLoading ||
    !auth.user?.id ||
    binding?.principalId !== auth.user.id ||
    !binding.authEpoch
  )
    return null;
  return { ownerId: auth.user.id, authEpoch: binding.authEpoch };
}

export function isSameVerifiedPushActor(actor: PushActor | null): boolean {
  if (!actor) return false;
  const current = getVerifiedPushActor();
  return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
}

export type PushPermissionStatus = "granted" | "denied" | "undetermined" | "unavailable";

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (Constants.appOwnership === "expo" || !Device.isDevice) return "unavailable";

  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      severity: "warning",
      issueKey: "PushNotifications",
      keys: { operation: "get_permission_status" },
    });
    return "unavailable";
  }
}

export async function shouldShowPushPermissionEducation(): Promise<boolean> {
  const status = await getPushPermissionStatus();
  if (status !== "undetermined") return false;
  try {
    return (await AsyncStorage.getItem(PUSH_PERMISSION_EDUCATION_SEEN_KEY)) !== "1";
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      severity: "warning",
      issueKey: "PushNotifications",
      keys: { operation: "read_education_seen" },
    });
    return true;
  }
}

export async function markPushPermissionEducationSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_PERMISSION_EDUCATION_SEEN_KEY, "1");
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      severity: "warning",
      issueKey: "PushNotifications",
      keys: { operation: "write_education_seen" },
    });
  }
}

/**
 * Регистрация для получения push уведомлений
 * @returns Expo Push Token или null если не удалось
 */
export async function registerForPushNotifications(
  isCurrent?: () => boolean,
): Promise<string | null> {
  // Expo Go не поддерживает push (SDK 53+).
  if (Constants.appOwnership === "expo" || (isCurrent && !isCurrent())) return null;

  try {
    const Notifications = await import("expo-notifications");

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (!Device.isDevice) {
      console.log("Push notifications require a physical device");
      return null;
    }

    // On Android 13+ the OS notification-permission prompt and Expo token
    // acquisition both require an existing channel. Configure it BEFORE
    // getPermissionsAsync/requestPermissionsAsync/getExpoPushTokenAsync.
    // If this fails, do not register a token that cannot receive alerts.
    if (isCurrent && !isCurrent()) return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#8936FF",
      });
    }
    if (isCurrent && !isCurrent()) return null;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (isCurrent && !isCurrent()) return null;
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }
    if (isCurrent && !isCurrent()) return null;

    if (finalStatus !== "granted") {
      console.log("Push notification permissions denied");
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      reportClientError(new Error("Expo projectId отсутствует в конфиге сборки"), {
        issueKey: "PushNotifications",
        keys: { operation: "register_expo_push" },
      });
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    return !isCurrent || isCurrent() ? tokenData.data : null;
  } catch {
    // Сбой Expo не должен блокировать независимый RuStore Push на Android.
    // SDK exceptions can include the private device endpoint; report only a fixed code.
    reportClientError(new Error("EXPO_PUSH_REGISTRATION_FAILED"), {
      issueKey: "PushNotifications",
      keys: { operation: "register_expo_push" },
    });
    return null;
  }
}

/**
 * Пытается зарегистрировать RuStore Push (только Android).
 * @returns true если токен получен и сохранён на API
 */
async function tryRegisterRustorePush(
  actor: PushActor,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (Constants.appOwnership === "expo") return false; // Expo Go не содержит RuStore SDK
  if (!Device.isDevice || !isCurrent()) return false; // Не отправлять чужой/старый token
  try {
    let RustorePush = NativeModules.RustorePush;
    if (!RustorePush) {
      const mod = await import("react-native-rustore-push");
      RustorePush = mod.default ?? (mod as { RustorePush?: unknown }).RustorePush;
    }
    const getToken =
      (RustorePush as { getToken?: () => Promise<string> })?.getToken ??
      (RustorePush as { getPushToken?: () => Promise<string> })?.getPushToken;
    if (typeof getToken !== "function") return false;
    const token = await getToken();
    if (typeof token !== "string" || !isCurrent()) return false;
    return pushRegistrationCoordinator.registerToken(
      actor,
      "rustore",
      token,
      isCurrent,
      async (endpoint, requestGuard) => {
        const result = await subscriptionsApi.savePushSubscription(
          { endpoint, keys: { p256dh: "rustore", auth: "rustore" } },
          requestGuard,
        );
        return result.success;
      },
    );
  } catch {
    // RuStore native errors can contain private device endpoints.
    reportClientError(new Error("RUSTORE_PUSH_REGISTRATION_FAILED"), {
      issueKey: "PushNotifications",
      keys: { operation: "register_rustore_push" },
    });
    return false;
  }
}

/**
 * Сохранить push токен на сервере
 */
export async function savePushToken(token: string, requestGuard?: () => boolean): Promise<boolean> {
  try {
    if (requestGuard && !requestGuard()) return false;
    const data = { endpoint: token, keys: { p256dh: "expo", auth: "expo" } };
    const result = requestGuard
      ? await subscriptionsApi.savePushSubscription(data, requestGuard)
      : await subscriptionsApi.savePushSubscription(data);
    return result.success;
  } catch {
    reportClientError(new Error("PUSH_DEVICE_TOKEN_SAVE_FAILED"), {
      issueKey: "PushNotifications",
      keys: { operation: "save_push_token" },
    });
    return false;
  }
}

/**
 * Возвращает токены текущего устройства без запроса разрешений.
 * Используется при отключении пушей — удаляем только текущее устройство.
 */
export async function getCurrentDeviceTokens(): Promise<{ expo?: string; rustore?: string }> {
  const tokens: { expo?: string; rustore?: string } = {};

  if (Constants.appOwnership === "expo") return tokens;
  if (!Device.isDevice) return tokens;

  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();

    if (status === "granted") {
      try {
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (projectId) {
          const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
          if (tokenData.data) tokens.expo = tokenData.data;
        }
      } catch {
        // Токен Expo недоступен — продолжаем с другими провайдерами.
      }
    }
  } catch (error) {
    // Сбой Expo permissions не должен мешать отзыву RuStore токена на Android.
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      severity: "warning",
      issueKey: "PushNotifications",
      keys: { operation: "get_current_device_tokens" },
    });
  }

  if (Platform.OS === "android") {
    try {
      let RustorePush = NativeModules.RustorePush;
      if (!RustorePush) {
        const mod = await import("react-native-rustore-push");
        RustorePush = mod.default ?? (mod as { RustorePush?: unknown }).RustorePush;
      }
      const getToken =
        (RustorePush as { getToken?: () => Promise<string> })?.getToken ??
        (RustorePush as { getPushToken?: () => Promise<string> })?.getPushToken;
      if (typeof getToken === "function") {
        const token = await getToken();
        if (token && typeof token === "string") tokens.rustore = token;
      }
    } catch {
      // RuStore недоступен — продолжаем
    }
  }

  return tokens;
}

/**
 * Полная регистрация: получить токен и сохранить на сервере.
 * На Android без FCM Expo может не выдать токен — тогда достаточно успешного RuStore.
 */
/**
 * Unregister ONLY current device tokens using the existing owner-scoped DELETE.
 * Never infer success from missing token, timeout, network error or session change.
 */
export async function unregisterCurrentDevicePushNotifications(options?: {
  isLive?: () => boolean;
}): Promise<boolean> {
  const actor = getVerifiedPushActor();
  if (!actor) return false;
  return pushRegistrationCoordinator.unregister(
    actor,
    getVerifiedPushActor,
    options?.isLive ?? (() => true),
    async (isCurrent) => {
      if (!isCurrent()) return false;
      const tokens = await getCurrentDeviceTokens();
      if (!isCurrent()) return false;
      const endpoints = [
        ...new Set(
          [tokens.expo, tokens.rustore].filter(
            (token): token is string => typeof token === "string" && token.length > 0,
          ),
        ),
      ];
      if (endpoints.length === 0) return false;
      for (const endpoint of endpoints) {
        if (!isCurrent()) return false;
        const result = await subscriptionsApi.deletePushSubscription(endpoint, isCurrent);
        if (!result.success || !isCurrent()) return false;
      }
      return true;
    },
  );
}

/** Clear only local successful-send dedup after acknowledged owner-scoped DELETE. */
export function invalidateCurrentPushRegistrationCache(): void {
  const actor = getVerifiedPushActor();
  if (actor) pushRegistrationCoordinator.invalidateActor(actor);
}

export async function setupPushNotifications(options?: {
  isLive?: () => boolean;
}): Promise<boolean> {
  const actor = getVerifiedPushActor();
  if (!actor) return false;
  return pushRegistrationCoordinator.run(
    actor,
    getVerifiedPushActor,
    options?.isLive ?? (() => true),
    async (captured, isCurrent) => {
      const expoToken = await registerForPushNotifications(isCurrent);
      const expoSaved = expoToken
        ? await pushRegistrationCoordinator.registerToken(
            captured,
            "expo",
            expoToken,
            isCurrent,
            (endpoint, requestGuard) => savePushToken(endpoint, requestGuard),
          )
        : false;
      if (!isCurrent()) return false;
      // Expo and RuStore are independent; a failed Expo token does not suppress RuStore.
      const rustoreSaved =
        Platform.OS === "android" ? await tryRegisterRustorePush(captured, isCurrent) : false;
      return isCurrent() && (expoSaved || rustoreSaved);
    },
  );
}
