/**
 * Native dependencies for the NEW-only v2 queue. No old persist stores,
 * offline file paths, API calls or ACK/dequeue operations are imported.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

import { createNewOnlyV2Queues } from "./newOnlyV2Queues";

export const newOnlyV2NativeQueues = createNewOnlyV2Queues({
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  },
  secure: {
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  },
  makeId: () => Crypto.randomUUID(),
  now: () => Date.now(),
});
