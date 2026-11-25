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

describe('Yandex isolated streaming origin', () => {
  const signing = 'A'.repeat(32);
  const yenv = {...env, GALLERY_CDN_REDIRECT_SIGNING_SECRET:signing};
  const req = async (mode:string, token: 'valid'|'missing'|'wrong', range?:string) => {
    const {createHash}=await import('node:crypto');
    const expires=Math.floor(Date.now()/1000)+90;
    const md5=createHash('md5').update(`${expires}/${key} ${token==='wrong'?'B'.repeat(32):signing}`).digest('base64url');
    return new Request(`${origin}${key}${token==='missing'?'':`?md5=${md5}&expires=${expires}`}`,{headers:{'x-gafus-gallery-origin-secret':secret,'x-gafus-gallery-origin-mode':mode,...(range?{Range:range}:{})}});
  };
  it('requires valid token before accessing S3 and never leaks presign',async()=>{
    const get=vi.fn(async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp','Content-Length':'3'}}));
    const signer=vi.fn(async()=>signed(key));
    for(const token of ['missing','wrong'] as const) expect((await galleryCdnRedirectResponse(await req('yandex-stream-v1',token),yenv,signer,get)).status).toBe(404);
    expect(signer).not.toHaveBeenCalled();
    const response=await galleryCdnRedirectResponse(await req('yandex-stream-v1','valid'),yenv,signer,get);
    expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.has('location')).toBe(false);expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1,2,3]));
  });
  it('forwards a single range and rejects invalid or oversized upstream',async()=>{
    const get=vi.fn(async()=>new Response(new Uint8Array([1,2]),{status:206,headers:{'Content-Type':'image/webp','Content-Length':'2','Content-Range':'bytes 0-1/3'}}));
    const response=await galleryCdnRedirectResponse(await req('yandex-stream-v1','valid','bytes=0-1'),yenv,async()=>signed(key),get);
    expect(response.status).toBe(206);expect(response.headers.get('Content-Range')).toBe('bytes 0-1/3');expect(get).toHaveBeenCalledWith(signed(key),expect.objectContaining({headers:{Range:'bytes=0-1'},redirect:'error'}));
    expect((await galleryCdnRedirectResponse(await req('yandex-stream-v1','valid','bytes=0-1,3-4'),yenv,async()=>signed(key),get)).status).toBe(416);
    const bad=async()=>new Response(null,{headers:{'Content-Type':'image/webp','Content-Length':'10485761'}});
    expect((await galleryCdnRedirectResponse(await req('yandex-stream-v1','valid'),yenv,async()=>signed(key),bad)).status).toBe(503);
  });
});
