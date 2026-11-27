import { afterEach, describe, expect, it } from "vitest";
import { chmodSync } from "node:fs";
import { localReadonlyCdnSecret } from "@gafus/cdn-upload/local-readonly-cdn";
import { createGalleryStorageFromEnv } from "./index.js";
import { installMediaCredentialFixture, syntheticCdnCredentials } from "../../../tests/support/media-credentials-fixture.cjs";
let fixture: ReturnType<typeof installMediaCredentialFixture> | undefined;
const env = {
  NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_LOCAL_READONLY_CDN: "enabled",
  GAFUS_ISOLATED_NONPROD_S3: "enabled", GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
  CLOUDRU_MEDIA_JOBS_ENABLED: "false", GALLERY_MEDIA_FALLBACK_ENABLED: "false", FEED_MEDIA_FALLBACK_ENABLED: "false",
  GALLERY_ENABLED: "true",
};
afterEach(() => { fixture?.restore(); fixture = undefined; });

describe("opt-in real CDN media URLs (local DB and writes isolated)", () => {
  it("is disabled by default and fails closed on unsafe flags or absent secrets", () => {
    expect(localReadonlyCdnSecret("gallery", { ...env, GAFUS_LOCAL_READONLY_CDN: undefined })).toBeNull();
    expect(() => localReadonlyCdnSecret("gallery", { ...env, GAFUS_LOCAL_READONLY_CDN: "garbage" })).toThrow("LOCAL_READONLY_CDN_ISOLATION_DENIED");
    expect(() => localReadonlyCdnSecret("gallery", { ...env, CLOUDRU_MEDIA_JOBS_ENABLED: "true" })).toThrow("LOCAL_READONLY_CDN_ISOLATION_DENIED");
    fixture = installMediaCredentialFixture({ readonlyCdn: false });
    expect(() => localReadonlyCdnSecret("gallery", env)).toThrow("LOCAL_READONLY_CDN_SECRETS_UNAVAILABLE");
  });

  it("rejects a world-readable fixture even with safe environment", () => {
    fixture = installMediaCredentialFixture();
    chmodSync(fixture.cdnFile, 0o644);
    expect(() => localReadonlyCdnSecret("gallery", env)).toThrow("LOCAL_READONLY_CDN_SECRETS_UNAVAILABLE");
  });

  it("signs only ready-style final gallery keys for Beget, never local MinIO URLs", async () => {
    fixture = installMediaCredentialFixture();
    expect(localReadonlyCdnSecret("gallery", env)).toBe(syntheticCdnCredentials.gallery);
    expect(localReadonlyCdnSecret("feed", env)).toBe(syntheticCdnCredentials.feed);
    const storage = createGalleryStorageFromEnv(env);
    const key = `albums/${"a".repeat(26)}/${"b".repeat(26)}/photos/${"c".repeat(36)}/thumb.webp`;
    const url = await storage.signCdn({ key, expiresAt: new Date(Date.now() + 120_000) });
    expect(new URL(url).origin).toBe("https://fupiquafifeswu.begetcdn.cloud");
    expect(new URL(url).pathname).toMatch(/^\/md5\([A-Za-z0-9_-]+,\d+\)\/albums\//);
    expect(url).not.toContain("X-Amz");
    await expect(storage.signCdn({
      key: `albums/${"a".repeat(26)}/${"b".repeat(26)}/incoming/${"c".repeat(36)}/source.jpg`,
      expiresAt: new Date(Date.now() + 120_000),
    })).rejects.toThrow();
  });
});
