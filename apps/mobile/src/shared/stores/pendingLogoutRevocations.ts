import * as SecureStore from "expo-secure-store";

// Each credential occupies a separate encrypted SecureStore record. A single
// JSON list can exceed platform SecureStore's per-value size limit.
const SLOTS = Array.from({ length: 24 }, (_, index) => `auth_pending_logout_${index}`);
const LEGACY_SLOT = "auth_pending_logout_token";
let mutation: Promise<void> = Promise.resolve();
let retryFlight: Promise<void> | null = null;

async function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutation.then(operation, operation);
  mutation = result.then(() => undefined, () => undefined);
  return result;
}

export async function rememberPendingLogout(token: string): Promise<void> {
  if (!token) return;
  await serialized(async () => {
    let firstEmpty: string | undefined;
    for (const slot of SLOTS) {
      const existing = await SecureStore.getItemAsync(slot);
      if (existing === token) return;
      if (!existing && !firstEmpty) firstEmpty = slot;
    }
    if (!firstEmpty) throw new Error("Pending logout queue capacity reached");
    await SecureStore.setItemAsync(firstEmpty, token);
  });
}

export async function acknowledgePendingLogout(token: string): Promise<void> {
  await serialized(async () => {
    for (const slot of SLOTS) {
      if ((await SecureStore.getItemAsync(slot)) === token) {
        await SecureStore.deleteItemAsync(slot);
      }
    }
  });
}

export function retryPendingLogouts(
  revoke: (token: string) => Promise<{ success: boolean }>,
  onError: (error: unknown) => void,
): Promise<void> {
  if (retryFlight) return retryFlight;
  const flight = (async () => {
    try {
      // Migrate the previous single-slot implementation without dropping an
      // already stored offline revocation when this app version upgrades.
      const legacy = await serialized(() => SecureStore.getItemAsync(LEGACY_SLOT));
      if (legacy) {
        await rememberPendingLogout(legacy);
        await serialized(() => SecureStore.deleteItemAsync(LEGACY_SLOT));
      }
    } catch (error) {
      onError(error);
    }
    // Snapshot before network I/O. A second offline logout queued during a
    // slow retry must remain for the NEXT attempt, not get raced or swallowed.
    const snapshot: string[] = [];
    for (const slot of SLOTS) {
      try {
        const token = await serialized(() => SecureStore.getItemAsync(slot));
        if (token) snapshot.push(token);
      } catch (error) {
        onError(error);
      }
    }
    for (const token of snapshot) {
      try {
        const result = await revoke(token);
        if (result.success) await acknowledgePendingLogout(token);
      } catch (error) {
        onError(error);
      }
    }
  })();
  retryFlight = flight;
  void flight.finally(() => { if (retryFlight === flight) retryFlight = null; });
  return flight;
}
