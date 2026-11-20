import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function internalCheckoutProfile(env = process.env) {
  const mode = env.OTA_PAYMENT_CONTENT ?? "standard";
  if (mode === "standard") return false;
  if (!["internal-yookassa", "android-qa-yookassa"].includes(mode) || !env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR)
    throw Error("UNKNOWN_PAYMENT_PROFILE");
  const n = JSON.parse(fs.readFileSync(env.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR, "utf8"));
  if (
    n.id !== env.OTA_NATIVE_ID ||
    n.verified !== true ||
    n.distribution !== "internal" ||
    n.platform !== (mode === "android-qa-yookassa" ? "android" : "ios") ||
    n.appId !== "gafus" ||
    n.bundleId !== "ru.gafus.app" ||
    n.environment !== "production" ||
    n.channel !== "production" ||
    (mode === "internal-yookassa" && n.runtimeVersion !== "1.7.5") ||
    (mode === "android-qa-yookassa" && !/^[a-f0-9]{64}$/.test(n.nativeFingerprint ?? "")) ||
    n.appVersion !== n.runtimeVersion ||
    n.platform !== env.OTA_PLATFORM ||
    env.OTA_RUNTIME !== n.runtimeVersion ||
    env.OTA_RECOVERY_FOR
  )
    throw Error("CHECKOUT_NATIVE_DISTRIBUTION_FORBIDDEN");
  return true;
}

/** Stamp only the selected JS entry in the isolated export, like the compiled revision. */
export async function withPaymentEntry(run, enabled = internalCheckoutProfile()) {
  if (!enabled) return run();
  const file = fileURLToPath(
    new URL(
      "../src/features/app-subscription/components/OptionalCardCheckout.tsx",
      import.meta.url,
    ),
  );
  const original = fs.readFileSync(file, "utf8");
  const entry =
    /export function OptionalCardCheckout\(_props:\s*CardCheckoutProps\)\s*\{\s*return null;\s*\}/;
  if (!entry.test(original)) throw Error("CHECKOUT_ENTRY_NOT_BASELINE");
  try {
    fs.writeFileSync(
      file,
      original.replace(
        entry,
        process.env.OTA_PAYMENT_CONTENT === "android-qa-yookassa"
          ? 'export {AndroidQaCardCheckout as OptionalCardCheckout} from "./AndroidQaCardCheckout";'
          : 'export {InternalCardCheckout as OptionalCardCheckout} from "./InternalCardCheckout";',
      ),
    );
    return await run();
  } finally {
    fs.writeFileSync(file, original);
  }
}
