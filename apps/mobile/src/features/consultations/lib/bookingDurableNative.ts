/** Dedicated v1 booking tombstone namespace; never reads/migrates legacy offline keys. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { createBookingTombstoneStore } from "./bookingDurableTombstone";
export const bookingDurableNative = createBookingTombstoneStore({
  storage: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  },
  getBinding: () => newOnlyV2NativeQueues.getVerifiedBinding(),
  now: () => Date.now(),
});
