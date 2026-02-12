import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

/**
 * AsyncStorage адаптер для Zustand persist middleware.
 * Работает в Expo Go и Development Build.
 * stepStorage (по userId) вынесен в stepStorage.ts, чтобы избежать цикла authStore ↔ storage.
 */
export const zustandStorage: StateStorage = {
  getItem: async (name) => {
    return (await AsyncStorage.getItem(name)) ?? null;
  },
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};
