/** Stable, non-account-scoped OTA cohort key, installed before any update check. */
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { apiClient } from "@/shared/lib/api/client";
import { captureOtaSession, type OtaSession } from "./session";

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

/** Refresh a short-lived tester entitlement before *every* manual OTA request.
 * A stale token must never survive logout, account switch or refresh failure.
 * The server checks the actual JWT principal and DB username, not this client.
 */
export async function refreshOtaTesterGrant(
  session: OtaSession | null = captureOtaSession(),
): Promise<void> {
  if (!selfHostedOtaActive() || !Updates.isEnabled) return;
  const installationId = await ensureOtaInstallationIdentity();
  // Clear the previous account's token BEFORE any network request. Fail closed.
  await Updates.setExtraParamAsync("gafus-tester-grant", null);
  const nativeFingerprint = Constants.expoConfig?.extra?.otaNativeFingerprint;
  const runtimeVersion = Updates.runtimeVersion;
  if (!installationId || !session?.userId || !session.isCurrent() || (Platform.OS !== "ios" && Platform.OS !== "android") ||
    typeof nativeFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(nativeFingerprint) ||
    typeof runtimeVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(runtimeVersion)) return;
  try {
    const response = await apiClient<{token:string}>("/api/v1/mobile-ota-tester/grant", {
      method:"POST",body:{installationId,platform:Platform.OS,runtimeVersion,nativeFingerprint},
      // Grant issuance is idempotent; replay after JWT refresh, but not account switch.
      requestGuard: session.isCurrent,
    });
    if (!response.success || !response.data?.token ||
      !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(response.data.token)) return;
    if (!session.isCurrent()) return;
    await Updates.setExtraParamAsync("gafus-tester-grant", response.data.token);
    // If logout raced with native parameter persistence, clear it again.
    if (!session.isCurrent()) await Updates.setExtraParamAsync("gafus-tester-grant", null);
  } catch { /* diagnostic: expected Tester identity lookup fails closed; stable rollout remains available. */
    // The stable OTA rollout remains available; no tester grant on failure.
  }
}
