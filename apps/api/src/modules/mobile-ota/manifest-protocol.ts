/** Expo Updates protocol v1: strict, signed JSON profile for verified binaries. */
import { Hono } from "hono";
import type { Context } from "hono";
import { parseOtaInstallationId } from "@gafus/mobile-ota-server/rollout-policy";
import { parseOtaTesterGrant, verifyOtaTesterGrant } from "@gafus/mobile-ota-server/tester-access";

import type { OtaLookup, OtaManifestRepository, OtaManifestRow } from "@gafus/mobile-ota-server/contracts";
export type { OtaLookup, OtaManifestRepository, OtaManifestRow } from "@gafus/mobile-ota-server/contracts";

const TOKEN = /^[A-Za-z0-9_.+-]{1,100}$/;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const KEY_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const NATIVE_FINGERPRINT = /^[a-f0-9]{64}$/i;
const SIGNATURE = /^sig="[A-Za-z0-9+/=_-]+",\s*keyid="([A-Za-z0-9_-]+)",\s*alg="rsa-v1_5-sha256"$/;

function parseExpectedSignature(value: string | undefined): string | null {
  if (!value || value.length > 240 || !value.includes("sig")) return null;
  if (!/(?:^|,)\s*alg="rsa-v1_5-sha256"(?:,|$)/.test(value)) return null;
  const match = /(?:^|,)\s*keyid="([a-zA-Z0-9_-]{1,64})"(?:,|$)/.exec(value);
  return match?.[1] ?? null;
}

function commonHeaders(c: Context, channel?: string): void {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "expo-protocol-version, expo-platform, expo-runtime-version, expo-channel-name, expo-expect-signature, x-gafus-native-fingerprint, expo-extra-params, Accept");
  c.header("expo-protocol-version", "1");
  c.header("expo-sfv-version", "0");
  // Empty SFV dictionaries are legal; only named values enter filters.
  c.header("expo-manifest-filters", channel ? `channel="${channel}"` : "");
  c.header("expo-server-defined-headers", "");
}

/**
 * This route is available only with an explicitly configured delivery environment.
 * No mutable manifest generation, external provider call or signing happens on GET.
 */
export function createOtaManifestRoutes(
  repository: OtaManifestRepository,
  config: Readonly<{ appId: string; environment?: string; testerSecret?: string }>,
) {
  const routes = new Hono();
  routes.get("/manifest", async (c) => {
    commonHeaders(c);
    if (config.environment !== "production" && config.environment !== "preview") {
      return c.body(null, 404);
    }
    const protocol = c.req.header("expo-protocol-version");
    if (protocol !== "1") return c.json({ error: "UNSUPPORTED_PROTOCOL" }, 406);
    const platform = c.req.header("expo-platform");
    const runtimeVersion = c.req.header("expo-runtime-version") ?? "";
    const channel = c.req.header("expo-channel-name") ?? "";
    const accept = c.req.header("accept") ?? "";
    if (platform !== "ios" && platform !== "android")
      return c.json({ error: "INVALID_PLATFORM" }, 400);
    if (!TOKEN.test(runtimeVersion) || !CHANNEL.test(channel))
      return c.json({ error: "INVALID_RUNTIME_CHANNEL" }, 400);
    if (!/(^|,)\s*(application\/expo\+json|application\/json)(\s*;|\s*,|\s*$)/i.test(accept))
      return c.json({ error: "UNSUPPORTED_FORMAT" }, 406);
    const keyId = parseExpectedSignature(c.req.header("expo-expect-signature"));
    if (!keyId || !KEY_ID.test(keyId))
      return c.json({ error: "SIGNED_CLIENT_REQUIRED" }, 400);
    const nativeFingerprint = c.req.header("x-gafus-native-fingerprint") ?? "";
    if (!NATIVE_FINGERPRINT.test(nativeFingerprint))
      return c.json({ error: "VERIFIED_NATIVE_FINGERPRINT_REQUIRED" }, 400);
    commonHeaders(c, channel);

    try {
      const manifest = await repository.findPublishedManifest({
        appId: config.appId,
        environment: config.environment,
        platform,
        runtimeVersion,
        channel,
        keyId,
        nativeFingerprint: nativeFingerprint.toLowerCase(),
        installationId: parseOtaInstallationId(c.req.header("expo-extra-params")),
        ...(config.testerSecret ? {testerAllowed: verifyOtaTesterGrant(
          parseOtaTesterGrant(c.req.header("expo-extra-params")),
          parseOtaInstallationId(c.req.header("expo-extra-params")), config.testerSecret,
          {platform,runtimeVersion,nativeFingerprint})} : {}),
      });
      if (!manifest) {
        // Expo v1 permits an empty 204 only when the client accepts multipart.
        // A JSON-only response cannot represent a no-update directive.
        return /(?:^|,)\s*multipart\/mixed(?:\s*;|\s*,|\s*$)/i.test(accept)
          ? c.body(null, 204)
          : c.json({ error: "NO_UPDATE_IN_JSON_FORMAT" }, 406);
      }
      if (!SIGNATURE.test(manifest.signatureHeader) ||
        SIGNATURE.exec(manifest.signatureHeader)?.[1] !== keyId ||
        manifest.manifestBody.byteLength === 0 || manifest.manifestBody.byteLength > 1024 * 1024) {
        return c.json({ error: "UNVERIFIED_MANIFEST" }, 503);
      }
      // Preserve signed bytes verbatim: never JSON.parse/stringify or transform content.
      c.header("expo-signature", manifest.signatureHeader);
      c.header("Content-Type", "application/expo+json");
      return c.body(new Uint8Array(manifest.manifestBody), 200);
    } catch {
      return c.json({ error: "OTA_REGISTRY_UNAVAILABLE" }, 503);
    }
  });
  return routes;
}
