import { beforeEach, describe, expect, it, vi } from "vitest";
const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: session }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
import { GET } from "./route";
const media = `https://garaquachegasourn.begetcdn.cloud/md5(${"A".repeat(22)},${Math.floor(Date.now()/1000)+85})/posts/owner/post/attachments/item/thumb.webp`;
const request = (url: string) => new Request("https://gafus.ru/api/v1/media-cdn-probe?url="+encodeURIComponent(url));
beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); session.mockReset(); session.mockResolvedValue({user:{id:"authorized"}}); });
describe("authenticated Web CDN status proxy (no storage URL disclosed)", () => {
  it("does not fetch any origin for unauthenticated session", async () => {
    session.mockResolvedValueOnce(null);
    const fn = vi.fn(); vi.stubGlobal("fetch",fn);
    expect((await GET(request(media))).status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });
  it("rejects arbitrary external hosts and paths (SSRF closed)", async () => {
    const fn = vi.fn(); vi.stubGlobal("fetch",fn);
    for(const bad of [media.replace("garaquachegasourn.begetcdn.cloud","localhost"),media.replace("/posts/","/admin/"),media+"&redirect=x"]) {
      expect((await GET(request(bad))).status).toBe(400);
    }
    expect(fn).not.toHaveBeenCalled();
  });
  it("probes only approved unsigned public Feed final media when configured", async () => {
    const url = "https://new-feed.begetcdn.cloud/posts/owner/post/attachments/media/thumb.webp";
    vi.stubEnv("FEED_BUCKET_PUBLIC", "true");
    vi.stubEnv("FEED_CDN_BASE_URL", "https://new-feed.begetcdn.cloud");
    const head = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", head);
    expect((await GET(request(url))).status).toBe(503);
    expect(head).toHaveBeenCalledWith(url, expect.objectContaining({ method: "HEAD" }));
    head.mockClear();
    for (const bad of [url + "?x=1", url.replace("thumb.webp", "source.mp4"),
      url.replace("/attachments/", "/incoming/"), url.replace("new-feed.begetcdn.cloud", "evil.test")])
      expect((await GET(request(bad))).status).toBe(400);
    expect(head).not.toHaveBeenCalled();
    vi.stubEnv("FEED_BUCKET_PUBLIC", "false");
    expect((await GET(request(url))).status).toBe(400);
  });
  it("passes 403 and 404 exactly, preserves 504 without bypass", async () => {
    for(const code of [200,403,404,504]){
      const f=vi.fn(async()=>new Response(null,{status:code})); vi.stubGlobal("fetch",f);
      const response=await GET(request(media));expect(response.status).toBe(code);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(f).toHaveBeenCalledWith(media,expect.objectContaining({method:"HEAD",redirect:"manual",credentials:"omit"}));
      vi.unstubAllGlobals();
    }
  });
  it("returns outage-only 503 when source connection fails", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>{throw new TypeError("network error");}));
    expect((await GET(request(media))).status).toBe(503);
  });
});
