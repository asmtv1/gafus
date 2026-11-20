/** Apple App Store provider: environment, signed payload verifier, API client.
 * No persistence or subscription state transitions here; one cache per payment service. */
import { readFileSync } from "node:fs";
import { AppStoreServerAPIClient, SignedDataVerifier } from "@apple/app-store-server-library";
import { resolveAppleEnvironment } from "./appleEnvironment";

export function createAppleProvider() {
  const APPLE_ROOT_CA_G3_DER_BASE64 =
    "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

  let appleVerifierSingleton: SignedDataVerifier | null = null;
  let appleVerifierConfigKey: string | null = null;
  let appleServerApiClientSingleton: AppStoreServerAPIClient | null = null;
  let appleServerApiClientConfigKey: string | null = null;

  function getAppleEnvironment(): ReturnType<typeof resolveAppleEnvironment> {
    return resolveAppleEnvironment({
      bundleIdRaw: process.env.APPLE_BUNDLE_ID,
      useSandboxRaw: process.env.APPLE_USE_SANDBOX,
      appIdRaw: process.env.APPLE_APP_ID,
    });
  }

  function getAppleVerifier(): SignedDataVerifier | { ok: false; code: string; message: string } {
    const config = getAppleEnvironment();
    if (!config.ok) return config;
    const { bundleId, environment, appAppleId } = config;
    const configKey = `${bundleId}|${environment}|${appAppleId ?? ""}`;
    if (appleVerifierSingleton && appleVerifierConfigKey === configKey) {
      return appleVerifierSingleton;
    }

    const appleRootCAs = [Buffer.from(APPLE_ROOT_CA_G3_DER_BASE64, "base64")];
    appleVerifierSingleton = new SignedDataVerifier(
      appleRootCAs,
      true,
      environment,
      bundleId,
      appAppleId,
    );
    appleVerifierConfigKey = configKey;
    return appleVerifierSingleton;
  }

  function getApplePrivateKey():
    | { ok: true; privateKey: string; sourceKey: string }
    | { ok: false; code: string; message: string } {
    const inlineKey = process.env.APPLE_PRIVATE_KEY?.trim();
    if (inlineKey) {
      return {
        ok: true,
        privateKey: inlineKey.replace(/\\n/g, "\n"),
        sourceKey: `inline:${inlineKey.length}`,
      };
    }

    const privateKeyPath = process.env.APPLE_PRIVATE_KEY_PATH?.trim();
    if (!privateKeyPath) {
      return {
        ok: false,
        code: "CONFIG_APPLE_SERVER_API",
        message: "APPLE_PRIVATE_KEY или APPLE_PRIVATE_KEY_PATH не задан",
      };
    }

    try {
      return {
        ok: true,
        privateKey: readFileSync(privateKeyPath, "utf8"),
        sourceKey: `path:${privateKeyPath}`,
      };
    } catch {
      return {
        ok: false,
        code: "CONFIG_APPLE_SERVER_API",
        message: "Не удалось прочитать APPLE_PRIVATE_KEY_PATH",
      };
    }
  }

  function getAppleServerApiClient():
    | AppStoreServerAPIClient
    | { ok: false; code: string; message: string } {
    const env = getAppleEnvironment();
    if (!env.ok) return env;

    const issuerId = process.env.APPLE_ISSUER_ID?.trim();
    const keyId = process.env.APPLE_KEY_ID?.trim();
    if (!issuerId || !keyId) {
      return {
        ok: false,
        code: "CONFIG_APPLE_SERVER_API",
        message: "APPLE_ISSUER_ID или APPLE_KEY_ID не задан",
      };
    }

    const privateKey = getApplePrivateKey();
    if (!privateKey.ok) return privateKey;

    const configKey = [env.bundleId, env.environment, issuerId, keyId, privateKey.sourceKey].join(
      "|",
    );
    if (appleServerApiClientSingleton && appleServerApiClientConfigKey === configKey) {
      return appleServerApiClientSingleton;
    }

    appleServerApiClientSingleton = new AppStoreServerAPIClient(
      privateKey.privateKey,
      keyId,
      issuerId,
      env.bundleId,
      env.environment,
    );
    appleServerApiClientConfigKey = configKey;
    return appleServerApiClientSingleton;
  }

  return { getAppleVerifier, getAppleServerApiClient };
}
