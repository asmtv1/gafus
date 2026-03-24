import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const STORAGE_KEY = "gafus:articleVisitorKey:v1";

/**
 * Стабильный идентификатор для дедупликации гостевых просмотров статей.
 */
export async function getOrCreateArticleGuestVisitorKey(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}
