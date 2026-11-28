/**
 * Native storage dependencies for the owner-scoped v2 journal.
 * Legacy stores and ownerless files are deliberately not imported.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authTokenStorage as SecureStore } from "@/shared/lib/authTokenStorage";
import * as Crypto from "expo-crypto";

import { createNewOnlyV2Queues } from "./newOnlyV2Queues";

export const newOnlyV2NativeQueues = createNewOnlyV2Queues({
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    getAllKeys: () => AsyncStorage.getAllKeys(),
    removeItem: key => AsyncStorage.removeItem(key),
  },
  secure: {
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  },
  makeId: () => Crypto.randomUUID(),
  now: () => Date.now(),
});
