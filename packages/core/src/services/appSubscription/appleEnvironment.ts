/**
 * Pure, shared Apple IAP configuration parser. Never reads process.env, S3,
 * keys, provider HTTP, or payment tables. Both the JWS verifier and the
 * App Store API client must derive their trust context from exactly this rule.
 */
import { Environment } from "@apple/app-store-server-library";

export type AppleEnvironmentConfig =
  | { ok: true; bundleId: string; environment: Environment; appAppleId?: number }
  | { ok: false; code: "CONFIG_APPLE_IAP"; message: string };

export function resolveAppleEnvironment(input: {
  bundleIdRaw?: string;
  useSandboxRaw?: string;
  appIdRaw?: string;
}): AppleEnvironmentConfig {
  const bundleId = input.bundleIdRaw?.trim();
  if (!bundleId) {
    return { ok: false, code: "CONFIG_APPLE_IAP", message: "APPLE_BUNDLE_ID не задан" };
  }
  const useSandbox = input.useSandboxRaw === "1" ||
    input.useSandboxRaw?.toLowerCase() === "true";
  const environment = useSandbox ? Environment.SANDBOX : Environment.PRODUCTION;
  const appIdRaw = input.appIdRaw?.trim();
  let appAppleId: number | undefined;
  if (appIdRaw) {
    // parseInt('123garbage')/parseInt('1e10') would silently authorize a
    // DIFFERENT Apple application. Require the complete decimal identifier.
    // Leading zeroes remain accepted for backwards-compatible configuration.
    if (!/^\d+$/.test(appIdRaw)) {
      return { ok: false, code: "CONFIG_APPLE_IAP", message: "Некорректный APPLE_APP_ID" };
    }
    const parsed = Number(appIdRaw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return { ok: false, code: "CONFIG_APPLE_IAP", message: "Некорректный APPLE_APP_ID" };
    }
    appAppleId = parsed;
  } else if (environment === Environment.PRODUCTION) {
    return { ok: false, code: "CONFIG_APPLE_IAP", message: "Для production требуется APPLE_APP_ID" };
  }
  return { ok: true, bundleId, environment, appAppleId };
}
