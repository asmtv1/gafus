import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

import { useAuthStore } from "./authStore";

/**
 * AsyncStorage адаптер для Zustand persist middleware
 * Работает в Expo Go и Development Build
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

const STEP_STORAGE_VERSION = "v1";

function getStepStorageKey(): string {
  const userId = useAuthStore.getState().user?.id ?? "anonymous";
  return `step-storage:${STEP_STORAGE_VERSION}:${userId}`;
}

/**
 * Хранилище для stepStore с ключом по userId (как на web).
 * При anonymous не читаем, чтобы не подмешивать данные при смене пользователя.
 */
export const stepStorage: StateStorage = {
  getItem: async (_name) => {
    const key = getStepStorageKey();
    if (key.endsWith(":anonymous")) return null;
    return (await AsyncStorage.getItem(key)) ?? null;
  },
  setItem: async (_name, value) => {
    await AsyncStorage.setItem(getStepStorageKey(), value);
  },
  removeItem: async (_name) => {
    await AsyncStorage.removeItem(getStepStorageKey());
  },
};
