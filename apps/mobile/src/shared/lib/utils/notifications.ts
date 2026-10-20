import * as Device from "expo-device";
import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscriptionsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";

const PUSH_PERMISSION_EDUCATION_SEEN_KEY = "gafus:push-permission-education-seen:v1";
const PUSH_DISABLED_KEY_PREFIX = "gafus:push-disabled-for-user:v1:";

/** Explicit opt-out applies to this GAFUS account on this device. */
export async function setDevicePushDisabled(userId: string, disabled: boolean): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(`${PUSH_DISABLED_KEY_PREFIX}${userId}`, disabled ? "1" : "0");
}

async function hasExplicitDevicePushOptIn(userId: string): Promise<boolean> {
  // "0" is written only after the user enables push in the app. Legacy
  // installs have no marker: don't silently undo a past in-app opt-out.
  return (await AsyncStorage.getItem(`${PUSH_DISABLED_KEY_PREFIX}${userId}`)) === "0";
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
export async function registerForPushNotifications(): Promise<string | null> {
  // Expo Go не поддерживает push (SDK 53+)
  if (Constants.appOwnership === "expo") return null;

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

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
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

  if (finalStatus !== "granted") {
    console.log("Push notification permissions denied");
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      reportClientError(new Error("Expo projectId отсутствует в конфиге сборки"), {
        issueKey: "PushNotifications",
        keys: { operation: "register_expo_push" },
      });
      return null;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#8936FF",
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "PushNotifications",
      keys: { operation: "register_expo_push" },
    });
    console.error("Error getting push token:", error);
    return null;
  }
}

/**
 * Пытается зарегистрировать RuStore Push (только Android).
 * @returns true если токен получен и сохранён на API
 */
async function tryRegisterRustorePush(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (Constants.appOwnership === "expo") return false; // Expo Go не содержит RuStore SDK
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
    if (!token || typeof token !== "string") return false;
    const result = await subscriptionsApi.savePushSubscription({
      endpoint: token,
      keys: { p256dh: "rustore", auth: "rustore" },
    });
    if (!result.success) {
      console.log("RuStore push: не удалось сохранить подписку");
    }
    return result.success;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "PushNotifications",
      keys: { operation: "register_rustore_push" },
    });
    return false;
  }
}

/**
 * Сохранить push токен на сервере
 */
export async function savePushToken(token: string): Promise<boolean> {
  try {
    const result = await subscriptionsApi.savePushSubscription({
      endpoint: token,
      keys: {
        p256dh: "expo",
        auth: "expo",
      },
    });
    return result.success;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "PushNotifications",
      keys: { operation: "save_push_token" },
    });
    console.error("Error saving push token:", error);
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
      // токен недоступен — продолжаем
    }
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
export async function setupPushNotifications(): Promise<boolean> {
  let expoSaved = false;
  try {
    const expoToken = await registerForPushNotifications();
    expoSaved = expoToken ? await savePushToken(expoToken) : false;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "PushNotifications",
      keys: { operation: "setup_expo_push" },
    });
  }

  // A failure of Expo / FCM must not prevent a RuStore-only Android device
  // from registering its independent token. Respect the OS notification permission.
  const permission = await getPushPermissionStatus();
  const rustoreSaved =
    Platform.OS === "android" && permission === "granted"
      ? await tryRegisterRustorePush()
      : false;
  return expoSaved || rustoreSaved;
}

const refreshInProgress = new Map<string, Promise<boolean>>();

/**
 * Refresh push tokens when an authenticated Android app starts or resumes.
 * No OS permission prompt: an explicit user denial/opt-out must be respected.
 * An expired server-side token is repaired simply by re-registering the
 * current native token; this requires no app-store binary update.
 */
export async function refreshAndroidPushRegistration(userId: string): Promise<boolean> {
  if (!userId || Platform.OS !== "android" || !Device.isDevice) return false;
  if (Constants.appOwnership === "expo") return false;
  const existing = refreshInProgress.get(userId);
  if (existing) return existing;

  const refresh = (async () => {
    try {
      if (!(await hasExplicitDevicePushOptIn(userId))) return false;
      if ((await getPushPermissionStatus()) !== "granted") return false;
      return await setupPushNotifications();
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        severity: "warning",
        issueKey: "PushNotifications",
        keys: { operation: "refresh_android_push" },
      });
      return false;
    }
  })();
  refreshInProgress.set(userId, refresh);
  try {
    return await refresh;
  } finally {
    if (refreshInProgress.get(userId) === refresh) refreshInProgress.delete(userId);
  }
}
