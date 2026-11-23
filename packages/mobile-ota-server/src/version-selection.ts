import { createHmac } from "node:crypto";
import { mayOfferCheckoutToAudience } from "./checkout-audience.js";
import { hasVersionPublication, recordVersionObservation, readVersionCandidate } from "./version-selection-repository.js";
import type { OtaManifestRow, OtaPlatform } from "./contracts.js";
import { isRegisteredOtaTester } from "./tester-grant-service.js";

export type Context = {
  platform: OtaPlatform;
  runtimeVersion: string;
  nativeFingerprint: string;
  installationId?: string | null;
  keyId?: string;
  embeddedUpdateId?: string | null;
  currentUpdateId?: string | null;
  nativeReleaseId?: string;
  testerAllowed?: boolean;
};
export type Choice = OtaManifestRow & {
  revision: number;
  required: boolean;
  allowsCheckout: boolean;
  running: boolean;
  publicationAction: "TEST" | "ALL" | "RECOVER" | "STOP";
  publishedToAll: boolean;
  distribution?: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function observationKey(c: Context) {
  const secret = process.env.MOBILE_OTA_INSTALLATION_HASH_KEY;
  return c.installationId && uuid.test(c.installationId) && secret && secret.length >= 32
    ? createHmac("sha256", secret)
        .update(
          JSON.stringify([
            "ota-native-v1",
            c.platform,
            c.runtimeVersion,
            c.nativeFingerprint,
            c.installationId,
          ]),
        )
        .digest("hex")
    : null;
}

// Undefined delegates to the pre-existing deployment. Null is an explicit no-update decision.
export async function selectVersionUpdate(
  c: Context,
  source: "manifest" | "policy",
  actorId?: string,
): Promise<Choice | null | undefined> {
  if (!(await hasVersionPublication(c))) return undefined;
  const tester =
    source === "manifest"
      ? c.testerAllowed === true
      : !!actorId &&
        (process.env.MOBILE_OTA_INSTALLATION_HASH_KEY?.length ?? 0) >= 32 &&
        (await isRegisteredOtaTester(actorId));
  const identity = observationKey(c);
  const embedded = c.embeddedUpdateId && uuid.test(c.embeddedUpdateId) ? c.embeddedUpdateId : null;
  if (source === "manifest" && identity && embedded) {
    const running = c.currentUpdateId && uuid.test(c.currentUpdateId) ? c.currentUpdateId : null;
    await recordVersionObservation(c, identity, embedded, running);
  }
  const row = await readVersionCandidate(c, source, tester, identity, embedded);
  if (!row) return undefined;
  return row.matched ? (row as Choice) : null;
}

async function allowsInternalCheckout(
  platform: OtaPlatform,
  actorId: string,
  version: string | null,
  installationId: string | undefined,
  fingerprint: string | undefined,
  updateId: string | undefined,
) {
  const enabled = platform === "ios"
    ? process.env.MOBILE_OTA_IOS_YOOKASSA_ENABLED
    : process.env.MOBILE_OTA_ANDROID_QA_YOOKASSA_ENABLED;
  if (
    enabled !== "true" ||
    process.env.MOBILE_OTA_DELIVERY_ENV !== "production" ||
    !version || !/^\d+\.\d+\.\d+$/.test(version) ||
    !installationId || !uuid.test(installationId) ||
    !fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint) ||
    !updateId || !uuid.test(updateId)
  ) return false;
  const selected = await selectVersionUpdate(
    { platform, runtimeVersion: version, installationId, nativeFingerprint: fingerprint },
    "policy",
    actorId,
  );
  // QA permission never authorizes a PUBLIC RuStore release. Its audience
  // and distribution must remain internal even if an iOS public flag is set.
  if (platform === "android") {
    return selected?.updateId === updateId && selected?.distribution === "internal" &&
      selected.publicationAction === "TEST" && !selected.publishedToAll &&
      selected.allowsCheckout && selected.running;
  }
  return selected?.updateId === updateId && mayOfferCheckoutToAudience(
    { platform, runtimeVersion: version }, selected, process.env.MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED,
  );
}

export function allowsAndroidQaCheckout(
  ...args: [actorId: string, version: string | null, installationId: string | undefined,
    fingerprint: string | undefined, updateId: string | undefined]
) {
  return allowsInternalCheckout("android", ...args);
}

export function allowsVersionCheckout(...args: Parameters<typeof allowsAndroidQaCheckout>) {
  return allowsInternalCheckout("ios", ...args);
}

/** Public RuStore 1.7.5 has its own explicit deployment permission, separate
 * from internal Android QA and all Google Play distributions. Release identity
 * must be observed from a verified binary and the signed OTA must be running.
 */
export async function allowsAndroidRustoreCheckout(
  ...args: Parameters<typeof allowsAndroidQaCheckout>
) {
  const [actorId, version, installationId, fingerprint, updateId] = args;
  if (process.env.MOBILE_OTA_ANDROID_RUSTORE_YOOKASSA_ENABLED !== "true" ||
      process.env.MOBILE_OTA_DELIVERY_ENV !== "production" ||
      version !== "1.7.5" || !installationId || !uuid.test(installationId) ||
      !fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !updateId || !uuid.test(updateId)) return false;
  const selected = await selectVersionUpdate(
    { platform:"android", runtimeVersion:version, installationId, nativeFingerprint:fingerprint },
    "policy", actorId,
  );
  return selected?.distribution === "rustore" && selected.updateId === updateId &&
    mayOfferCheckoutToAudience({platform:"android", runtimeVersion:version}, selected,
      process.env.MOBILE_OTA_ANDROID_RUSTORE_YOOKASSA_PUBLIC_ENABLED);
}
