import { describe, expect, it, vi } from "vitest";
import { galleryCdnRedirectResponse } from "./cdnRedirect.js";

const secret = "S".repeat(48);
const key = "albums/o/a/photos/p/full.webp";
const v2Key = "gallery/o/media/m/v2/full.webp";
const vetKey = "users/u/pets/p/vet-visits/v/a/thumb.webp";
const origin = "https://api.gafus.ru/";
const env = { GALLERY_CDN_ORIGIN_ROUTE_ENABLED: "true", GALLERY_CDN_REDIRECT_ORIGIN_SECRET: secret };
const signed = (key: string) =>
  `https://s3.cloud.ru/gafus-gallery-private/${key}?X-Amz-Expires=60&X-Amz-Signature=${"a".repeat(64)}`;
function request(target = `${origin}${key}`, method = "GET", supplied = secret) {
  return new Request(target, { method, headers: { "x-gafus-gallery-origin-secret": supplied } });
}
describe("Beget private Gallery CDN -> API 307 -> S3", () => {
  it("fails closed unless the separate origin header and route flag are valid", async () => {
    const signer = vi.fn(async () => signed(key));
    for (const [targetEnv, req] of [
      [{}, request()], [{...env,GALLERY_CDN_ORIGIN_ROUTE_ENABLED:"false"},request()],
      [env,request(undefined,"GET","")], [env,request(undefined,"GET","wrong")],
      [{...env,GALLERY_CDN_REDIRECT_ORIGIN_SECRET:"weak"},request()],
    ] as const) expect((await galleryCdnRedirectResponse(req,targetEnv,signer)).status).toBe(404);
    expect(signer).not.toHaveBeenCalled();
  });
  it("bootstraps the protected origin without enabling viewer cutover", async () => {
    const bootstrapEnv = {
      ...env,
      GALLERY_CDN_REDIRECT_ENABLED: "false",
      GALLERY_CDN_CACHEABLE_FINAL_ENABLED: "false",
    };
    const sign = vi.fn(async () => signed(key));
    const result = await galleryCdnRedirectResponse(request(), bootstrapEnv, sign);
    expect(result.status).toBe(307);
    expect(result.headers.get("Location")).toBe(signed(key));
    expect(sign).toHaveBeenCalledWith(key, "GET");
  });
  it("presigns GET/HEAD for legacy, V2 and vet thumbs without streaming bytes", async () => {
    for (const path of [key, v2Key, vetKey]) {
      for (const method of ["GET", "HEAD"] as const) {
        const sign = vi.fn(async (k:string) => signed(k));
        const result = await galleryCdnRedirectResponse(request(`${origin}${path}`,method),env,sign);
        expect(result.status).toBe(307);
        expect(result.headers.get("Location")).toBe(signed(path));
        expect(result.headers.get("Cache-Control")).toBe("private, no-store");
        expect((await result.arrayBuffer()).byteLength).toBe(0);
        expect(sign).toHaveBeenCalledWith(path,method);
      }
    }
  });
  it("rejects source uploads, original vet documents, traversal and query strings", async () => {
    const sign = vi.fn(async () => signed(key));
    for (const invalid of [
      `${origin}albums/o/a/incoming/id/source.jpg`,
      `${origin}users/u/pets/p/vet-visits/v/a/original.pdf`,
      `${origin}gallery/o/media/m/v2/source.webp`,
      `${origin}${key}?signed=1`, `${origin}albums/o/a/photos/p/%2e%2e/full.webp`,
      `${origin}albums/o/a/photos/p/../full.webp`,
      `${origin}albums//a/photos/p/full.webp`, `${origin}albums/o/a/photos/p/full.webp%3fquery`,
    ]) expect((await galleryCdnRedirectResponse(request(invalid),env,sign)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(undefined,"POST"),env,sign)).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it("rejects other destinations, buckets, keys, missing/long presigns; fails 503 on signer outage", async () => {
    const happy = signed(key);
    for (const bad of [
      happy.replace("s3.cloud.ru","evil.invalid"),
      happy.replace("gafus-gallery-private","other-private"),
      happy.replace("photos/p/","photos/other/"),
      happy.replace(/&X-Amz-Signature=.*/, ""),
      happy.replace("X-Amz-Expires=60","X-Amz-Expires=3600"),
    ]) expect((await galleryCdnRedirectResponse(request(),env,async()=>bad)).status).toBe(404);
    expect((await galleryCdnRedirectResponse(request(),env,async()=>{ throw Error("S3_OFFLINE"); })).status).toBe(503);
  });
});
