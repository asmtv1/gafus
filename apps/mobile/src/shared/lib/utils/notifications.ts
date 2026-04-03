import * as Device from "expo-device";
import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";
import { subscriptionsApi } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";

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
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      reportClientError(new Error("Expo projectId отсутствует в конфиге сборки"), {
        issueKey: "PushNotifications",
        keys: { operation: "register_expo_push" },
      });
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#8936FF",
      });
    }

    return token;
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
    const getToken = (RustorePush as { getToken?: () => Promise<string> })?.getToken ??
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
  const expoToken = await registerForPushNotifications();
  const expoSaved = expoToken ? await savePushToken(expoToken) : false;

  const rustoreSaved = Platform.OS === "android" ? await tryRegisterRustorePush() : false;

  return expoSaved || rustoreSaved;
}
