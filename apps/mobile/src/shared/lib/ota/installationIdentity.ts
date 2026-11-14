/** Stable, non-account-scoped OTA cohort key, installed before any update check. */
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";

const KEY = "gafus_ota_installation_id_v1";
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
let inflight: Promise<string | null> | undefined;
export function selfHostedOtaActive(): boolean {
  return Constants.expoConfig?.extra?.otaTransport === "self-hosted";
}
async function prepare(): Promise<string | null> {
  if (!selfHostedOtaActive() || !Updates.isEnabled) return null;
  let id = await SecureStore.getItemAsync(KEY);
  if (!id || !UUID.test(id)) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEY, id);
  }
  // Native expo-updates sends this SFV dictionary as expo-extra-params.
  // Fail closed if it cannot be set: never check an early rollout without it.
  await Updates.setExtraParamAsync("gafus-installation-id", id);
  return id;
}
/** Also used by a forced update; both hooks share one initialization promise. */
export function ensureOtaInstallationIdentity(): Promise<string | null> {
  if (!inflight) {
    inflight = prepare().catch(error => {
      inflight = undefined;
      throw error;
    });
  }
  return inflight;
}
