import { describe, expect, it, vi } from "vitest";
import { galleryCdnRedirectResponse } from "./cdnRedirect.js";
const secret = "S".repeat(48);
const key = "albums/o/a/photos/p/full.webp";
const origin = "https://api.gafus.ru/";
const uri = `${origin}${key}`;
const signed = `https://s3.cloud.ru/gafus-gallery-private/${key}?X-Amz-Expires=60&X-Amz-Signature=${"a".repeat(64)}`;
const env = { GALLERY_CDN_ORIGIN_ROUTE_ENABLED: "true", GALLERY_CDN_REDIRECT_ENABLED: "false", GALLERY_CDN_REDIRECT_ORIGIN_SECRET: secret };
const request = (target = uri, method = "GET", supplied = secret) => new Request(target, {
  method, headers: { "x-gafus-gallery-origin-secret": supplied },
});

describe("Gallery private CDN origin redirect", () => {
  it("stays closed until explicitly enabled and origin secret verified", async () => {
    const sign = vi.fn(async () => signed);
    expect((await galleryCdnRedirectResponse(request(), {}, sign)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(), { ...env, GALLERY_CDN_ORIGIN_ROUTE_ENABLED: "false" }, sign)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(uri, "GET", "wrong"), env, sign)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(uri, "GET", ""), env, sign)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(), { ...env, GALLERY_CDN_REDIRECT_ORIGIN_SECRET: "weak" }, sign)).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it("permits a signed canary with legacy Gallery viewer URLs unaffected", async () => {
    const response = await galleryCdnRedirectResponse(request(), env, async () => signed);
    expect(env.GALLERY_CDN_REDIRECT_ENABLED).toBe("false");
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(signed);
  });
  it("presigns GET and HEAD but never streams bytes", async () => {
    const sign = vi.fn(async () => signed);
    for (const method of ["GET", "HEAD"]) {
      const response = await galleryCdnRedirectResponse(request(uri, method), env, sign);
      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(signed);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect((await response.arrayBuffer()).byteLength).toBe(0);
    }
    expect(sign).toHaveBeenCalledWith(key, "GET");
    expect(sign).toHaveBeenCalledWith(key, "HEAD");
  });
  it("allows only finalized photos and veterinary thumbnails", async () => {
    const sign = vi.fn(async () => signed);
    for (const target of [
      `${origin}albums/o/a/incoming/id/source.jpg`,
      `${origin}users/u/pets/p/vet-visits/v/a/original.pdf`,
      `${uri}?signature=leak`, `${origin}albums/o/a/photos/p/%2e%2e/full.webp`,
      `${origin}albums/o/a/photos/p/../full.webp`, `${origin}albums//a/photos/p/full.webp`,
      `${origin}albums/o/a/photos/p/full.webp%3fquery`,
    ]) expect((await galleryCdnRedirectResponse(request(target), env, sign)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(uri, "POST"), env, sign)).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it("rejects redirects to any other host, bucket, key or unsigned S3 URLs", async () => {
    for (const bad of [
      signed.replace("s3.cloud.ru", "attacker.example"),
      signed.replace("gafus-gallery-private", "gafus-documents-private"),
      signed.replace("/photos/p/", "/photos/other/"),
      signed.replace(/&X-Amz-Signature=.*/, ""),
      signed.replace("X-Amz-Expires=60", "X-Amz-Expires=3600"),
    ]) expect((await galleryCdnRedirectResponse(request(), env, async () => bad)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(), env, async () => { throw Error("S3_UNAVAILABLE"); })).status).toBe(503);
  });
});
