/**
 * Authentication token persistence.
 *
 * Simulator-only E2E builds do not have a provisioned iOS Keychain access
 * group. Keep production/physical-device credentials in SecureStore; the
 * intentionally isolated Simulator uses AsyncStorage so QA can exercise
 * login, refresh and logout without weakening any physical-device storage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const simulatorOnly = Platform.OS === "ios" && Device.isDevice === false;
const prefix = "@gafus/ios-simulator/auth/";

export const authTokenStorage = {
  getItemAsync(key: string): Promise<string | null> {
    return simulatorOnly ? AsyncStorage.getItem(prefix + key) : SecureStore.getItemAsync(key);
  },
  setItemAsync(key: string, value: string): Promise<void> {
    return simulatorOnly
      ? AsyncStorage.setItem(prefix + key, value)
      : SecureStore.setItemAsync(key, value);
  },
  deleteItemAsync(key: string): Promise<void> {
    return simulatorOnly ? AsyncStorage.removeItem(prefix + key) : SecureStore.deleteItemAsync(key);
  },
};
