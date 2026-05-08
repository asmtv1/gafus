import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

import { reportAndroidDeviceIdFailure } from "./reportAndroidDeviceIdFailure";

let cachedDeviceId: string | null = null;

/**
 * Идентификатор устройства: Android ID на Android, UUID на iOS.
 * Кэшируется для избежания повторных вызовов.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  if (Platform.OS === "android") {
    try {
      cachedDeviceId = Application.getAndroidId();
      return cachedDeviceId;
      // eslint-disable-next-line @gafus/require-client-catch-tracer -- reports via tracer without getDeviceId recursion
    } catch (err) {
      reportAndroidDeviceIdFailure(err);
    }
  }
  cachedDeviceId = Crypto.randomUUID();
  return cachedDeviceId;
}
