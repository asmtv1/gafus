import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { subscriptionsApi } from "@/shared/lib/api";

// Настройка поведения уведомлений в foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Регистрация для получения push уведомлений
 * @returns Expo Push Token или null если не удалось
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Проверяем, что это реальное устройство
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Проверяем/запрашиваем разрешения
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
    // Получаем токен
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;

    // Настройки для Android
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
 * Полная регистрация: получить токен и сохранить на сервере
 */
export async function setupPushNotifications(): Promise<boolean> {
  const token = await registerForPushNotifications();
  if (!token) return false;

  return savePushToken(token);
}
