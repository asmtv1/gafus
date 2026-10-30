/** AG4-approved /pets/* + /gafus* cache headers: source placement + synthetic Hono negatives. */
import { readFileSync } from "node:fs";
import { Hono, type Context } from "hono";
import { describe, expect, it } from "vitest";
const source=readFileSync(new URL("../../app.ts",import.meta.url),"utf8");
const expectedHeader="private, no-store, max-age=0";
const privateBody=`c.header("Cache-Control", "${expectedHeader}")`;
const predicate=(path:string)=>path.startsWith("/api/v1/pets/")||
  path==="/api/v1/gafus"||path.startsWith("/api/v1/gafus/");
function app(mode:"missing"|"invalid"|"blocked"|"rate"|"valid") {
  const h=new Hono();
  let coreHits=0;
  // The in-memory harness duplicates the exact callback; source assertions
  // below prove its placement in real app.ts, but do not execute real Redis.
  const privateRead=async(c:Context,next:()=>Promise<void>)=>{
    c.header("Cache-Control",expectedHeader);
    c.header("Referrer-Policy","no-referrer");
    await next();
    c.header("Cache-Control",expectedHeader);
  };
  h.use("*",async(c,next)=>{
    if(!predicate(c.req.path))return c.json({success:false,code:"NOT_IN_SCOPE"},404);
    await privateRead(c,next);
  });
  h.use("*",async(c,next)=>{
    if(mode==="rate")return c.json({success:false,code:"RATE_LIMITED"},429);
    await next();
  });
  h.use("*",async(c,next)=>{
    if(mode==="blocked")return c.json({success:false,code:"ORIGIN_DENIED"},403);
    if(mode==="missing"||mode==="invalid")return c.json({success:false,code:"UNAUTHORIZED"},401);
    await next();
  });
  h.get("*",c=>{coreHits++;return c.json({success:true,data:[]});});
  return {h,hits:()=>coreHits};
}
const cases=["/api/v1/pets/pet-A/vet-visits", "/api/v1/gafus/status"] as const;
describe("AG1 additive cache privacy on /pets and /gafus only",()=>{
  it("P01 actual app.ts registers header ahead of Redis limiter/auth on both namespaces",()=>{
    expect(source).toContain(privateBody);
    expect(source).toContain('c.header("Referrer-Policy", "no-referrer")');
    expect(source).toContain('app.use("/api/v1/pets/*", ownerPrivateRead, apiRateLimiter)');
    expect(source).toContain('app.use("/api/v1/gafus", ownerPrivateRead, authMiddleware, apiRateLimiter)');
    expect(source).toContain('app.use("/api/v1/gafus/*", ownerPrivateRead, authMiddleware, apiRateLimiter)');
    const idx=source.indexOf("const ownerPrivateRead = async");
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(source.indexOf("app.use(\"/api/v1/pets/*\", authMiddleware)"));
  });
  it.each(cases)("P02 synthetic 401 without cookie stays private: %s",async path=>{
    const t=app("missing");const r=await t.h.request("http://local.test"+path);
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe(expectedHeader);
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(t.hits()).toBe(0);
  });
  it.each(cases)("P03 synthetic upstream rate 429 stays no-store: %s",async path=>{
    const t=app("rate");const r=await t.h.request("http://local.test"+path);
    expect(r.status).toBe(429);
    expect(r.headers.get("cache-control")).toBe(expectedHeader);
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(t.hits()).toBe(0);
  });
  it.each(cases)("P04 rejected Origin 403 before Core remains private: %s",async path=>{
    const t=app("blocked");const r=await t.h.request("http://local.test"+path);
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe(expectedHeader);
    expect(t.hits()).toBe(0);
  });
  it.each(cases)("P05 synthetic authenticated 200 remains no-store: %s",async path=>{
    const t=app("valid");const r=await t.h.request("http://local.test"+path);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe(expectedHeader);
    expect(t.hits()).toBe(1);
  });
  it("P06 independently AG4-approved Ach preauth doesn't reuse pets/gafus middleware",async()=>{
    expect(source).toContain('app.use("/api/v1/achievements/*", achievementPrivateNoStore, apiRateLimiter)');
    expect(source).not.toContain('app.use("/api/v1/achievements/*", ownerPrivateRead');
  });
});
