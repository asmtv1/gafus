import * as Device from "expo-device";
import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";
import { subscriptionsApi } from "@/shared/lib/api";

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
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permissions denied");
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
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
    console.error("Error getting push token:", error);
    return null;
  }
}

/**
 * Пытается зарегистрировать RuStore Push (только Android).
 * Gracefully пропускает, если SDK недоступен (Expo Go, пакет не установлен).
 */
async function tryRegisterRustorePush(): Promise<void> {
  if (Platform.OS !== "android") return;
  if (Constants.appOwnership === "expo") return; // Expo Go не содержит RuStore SDK
  try {
    let RustorePush = NativeModules.RustorePush;
    if (!RustorePush) {
      const mod = await import("react-native-rustore-push");
      RustorePush = mod.default ?? (mod as { RustorePush?: unknown }).RustorePush;
    }
    const getToken = (RustorePush as { getToken?: () => Promise<string> })?.getToken ??
      (RustorePush as { getPushToken?: () => Promise<string> })?.getPushToken;
    if (typeof getToken !== "function") return;
    const token = await getToken();
    if (token && typeof token === "string") {
      const result = await subscriptionsApi.savePushSubscription({
        endpoint: token,
        keys: { p256dh: "rustore", auth: "rustore" },
      });
      if (!result.success) {
        console.log("RuStore push: не удалось сохранить подписку");
      }
    }
  } catch {
    // Expo Go, пакет не установлен или ошибка SDK — не критично
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
    console.error("Error saving push token:", error);
    return false;
  }
}

/**
 * Полная регистрация: получить токен и сохранить на сервере.
 * Expo — основной канал. RuStore — дополнительно на Android (независимо).
 */
export async function setupPushNotifications(): Promise<boolean> {
  const expoToken = await registerForPushNotifications();
  const expoSaved = expoToken ? await savePushToken(expoToken) : false;

  if (Platform.OS === "android") {
    await tryRegisterRustorePush();
  }

  return expoSaved;
}
