import { describe, expect, it, vi } from "vitest";
import { galleryRedirectProbeResponse } from "./redirectProbe.js";

const key = "albums/beget-smoke-0123456789abcdef0123456789abcdef/beget-smoke-0123456789abcdef0123456789abcdef/photos/0123456789abcdef0123456789abcdef/full.webp";
const secret = "T".repeat(36);
const env = {
  GALLERY_REDIRECT_PROBE_ENABLED: "true",
  GALLERY_REDIRECT_PROBE_ORIGIN_SECRET: secret,
  GALLERY_REDIRECT_PROBE_OBJECT_KEY: key,
};
const url = "https://api.gafus.ru/__gafus_gallery_redirect_probe__/fixture.webp";
const target = `https://s3.cloud.ru/gafus-gallery-private/${key}?X-Amz-Signature=test`;
const request = (method = "GET", password = secret, href = url) =>
  new Request(href, { method, headers: { "x-gafus-gallery-redirect-probe": password } });

describe("isolated Beget Gallery redirect probe", () => {
  it("is closed by default and without exact origin secret", async () => {
    const sign = vi.fn(async () => target);
    expect((await galleryRedirectProbeResponse(request(), {}, sign)).status).toBe(404);
    expect((await galleryRedirectProbeResponse(request("GET", "wrong"), env, sign)).status).toBe(404);
    expect((await galleryRedirectProbeResponse(request(), { ...env, GALLERY_REDIRECT_PROBE_ORIGIN_SECRET: "" }, sign)).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it("permits only the fixed full.webp Gallery fixture and exact route", async () => {
    const sign = vi.fn(async () => target);
    expect((await galleryRedirectProbeResponse(request(), { ...env, GALLERY_REDIRECT_PROBE_OBJECT_KEY: "users/a/pets/b/vet-visits/c/d/thumb.webp" }, sign)).status).toBe(404);
    expect((await galleryRedirectProbeResponse(request(), { ...env, GALLERY_REDIRECT_PROBE_OBJECT_KEY: "albums/a/b/incoming/c/source.jpg" }, sign)).status).toBe(404);
    expect((await galleryRedirectProbeResponse(request("GET", secret, url + "?key=foo"), env, sign)).status).toBe(404);
    expect((await galleryRedirectProbeResponse(request("POST"), env, sign)).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it("returns a 307 to a private Cloud.ru URL without serving any file bytes", async () => {
    const sign = vi.fn(async () => target);
    for (const method of ["GET", "HEAD"] as const) {
      const response = await galleryRedirectProbeResponse(request(method), env, sign);
      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(target);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.arrayBuffer()).toHaveProperty("byteLength", 0);
    }
    expect(sign).toHaveBeenNthCalledWith(1, key, "GET");
    expect(sign).toHaveBeenNthCalledWith(2, key, "HEAD");
  });
  it("rejects external destinations and a failed signer", async () => {
    const redirected = await galleryRedirectProbeResponse(request(), env, async () =>
      "https://example.net/file.webp?X-Amz-Signature=bad");
    expect(redirected.status).toBe(404);
    const unsigned = await galleryRedirectProbeResponse(request(), env, async () =>
      `https://s3.cloud.ru/gafus-gallery-private/${key}`);
    expect(unsigned.status).toBe(404);
    const failed = await galleryRedirectProbeResponse(request(), env, async () => { throw Error("S3_DOWN"); });
    expect(failed.status).toBe(503);
  });
});
