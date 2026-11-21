/** Android and generic environments always use encrypted SecureStore. */
import * as SecureStore from "expo-secure-store";

export const authTokenStorage = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};
