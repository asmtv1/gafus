import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const STORAGE_KEY = "gafus:analytics:anonymousId";

export async function getOrCreateMobileAnalyticsId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const id = await Crypto.randomUUID();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}
