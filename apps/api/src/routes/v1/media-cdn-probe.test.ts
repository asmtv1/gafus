import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { mediaCdnProbeRoutes } from "./media-cdn-probe.js";

const signed = () => `https://fupiquafifeswu.begetcdn.cloud/md5(ABCDEFGHIJKLMNOPQRSTUV,${Math.floor(Date.now()/1000)+120})/albums/owner/album/photos/photo/thumb.webp`;
function testApp(actor = true) {
  const app = new Hono();
  if (actor) app.use("*", async (c, next) => {
    c.set("user" as never, { id: "viewer" } as never);
    await next();
  });
  app.route("/api/v1/media-cdn-probe", mediaCdnProbeRoutes);
  return app;
}
afterEach(() => vi.unstubAllGlobals());
describe("Hono CDN status probe", () => {
  it("requires an actor and never contacts CDN for unauthenticated requests", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const res = await testApp(false).request(`http://localhost/api/v1/media-cdn-probe?url=${encodeURIComponent(signed())}`);
    expect(res.status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects external hosts, extra parameters and unsigned URLs", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const app = testApp();
    for (const suffix of ["?url=https%3A%2F%2Fevil.example%2Fimg", "?url=x&url=y", "?url=https%3A%2F%2Ffupiquafifeswu.begetcdn.cloud%2Fprivate"]) {
      const res = await app.request(`http://localhost/api/v1/media-cdn-probe${suffix}`);
      expect(res.status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([200, 401, 403, 404, 410, 504])("preserves CDN HEAD status %i without a body", async status => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", fetcher);
    // Clock can cross a one-second boundary during await. Compare the exact
    // URL sent, not a freshly issued token with a different expiry second.
    const url = signed();
    const res = await testApp().request(`http://localhost/api/v1/media-cdn-probe?url=${encodeURIComponent(url)}`);
    expect(res.status).toBe(status); expect(await res.text()).toBe("");
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD", credentials: "omit", redirect: "manual" }));
  });
  it.each([
    ['questions', 'https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/v2/owner-1/01234567-89ab-4def-8123-456789abcdef/v1/image/s.webp'],
    ['chat2', 'https://gonomudedoje.begetcdn.cloud/chat2/room/user/00000000-0000-4000-8000-000000000000/v1/video/360.mp4'],
  ])("confirms %s CDN DNS failures server-side and preserves 403/404", async (_kind,url) => {
    const upstream = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {throw new TypeError('getaddrinfo ENOTFOUND');});
    vi.stubGlobal('fetch', upstream);
    const app = testApp();
    const target = `/api/v1/media-cdn-probe?url=${encodeURIComponent(url)}`;
    expect((await app.request('http://localhost'+target)).status).toBe(503);
    expect(upstream).toHaveBeenCalledWith(url,expect.objectContaining({method:'HEAD'}));
    for(const status of [403,404]) {
      upstream.mockImplementationOnce(async()=>new Response(null,{status}));
      const result=await app.request('http://localhost'+target);
      expect(result.status).toBe(status);
      expect(result.headers.get('cache-control')).toBe('private, no-store');
    }
  });
  it("rejects malicious, unexpected, non-final chat/questions URLs before network", async () => {
    const upstream=vi.fn(); vi.stubGlobal('fetch',upstream);
    const root='https://gonomudedoje.begetcdn.cloud/chat2/room/user/00000000-0000-4000-8000-000000000000/v1/image/s.webp';
    const q='https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/v2/owner-1/01234567-89ab-4def-8123-456789abcdef/v1/image/s.webp';
    for(const invalid of [root.replace('/image/s.webp','/incoming/original.jpg'),
      root.replace('/image/s.webp','/image/original.webp'),root+'?token=secret',
      root.replace('gonomudedoje','attacker'),
      q.replace('/image/s.webp','/image/original.webp'),q+'?x=1',
      q.replace('ebiteskukingusk','unknown'),
    ]) expect((await testApp().request('http://localhost/api/v1/media-cdn-probe?url='+encodeURIComponent(invalid))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("reports upstream network failure as outage without leaking details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Error("PRIVATE UPSTREAM DETAIL"); }));
    const res = await testApp().request(`http://localhost/api/v1/media-cdn-probe?url=${encodeURIComponent(signed())}`);
    expect(res.status).toBe(503); expect(await res.text()).toBe("");
  });
});
