import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

let cachedDeviceId: string | null = null;
let sessionUuid: string | null = null;

/**
 * Идентификатор устройства: Android ID на Android, UUID на iOS.
 * Кэшируется для избежания повторных вызовов.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (Platform.OS === "android") {
    try {
      cachedDeviceId = Application.getAndroidId();
      return cachedDeviceId;
    } catch {
      // fallback
    }
  }
  cachedDeviceId = Crypto.randomUUID();
  return cachedDeviceId;
}

/** Идентификатор сессии — in-memory singleton, генерируется один раз. */
export function getSessionUuid(): string {
  if (!sessionUuid) {
    sessionUuid = Crypto.randomUUID();
  }
  return sessionUuid;
}
