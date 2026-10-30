/** Existing mounted Gafus Hono status/history GET; no actual DB/providers. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  status: vi.fn(), history: vi.fn(), unlock: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: async () => ({
  sessionsRevokedAt: null, registrationPending: false, role: "USER",
}) } } }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/core/services/gafus", () => ({
  getGafusStatus: m.status, listGafusTransactions: m.history,
  unlockContentWithGafus: m.unlock,
  listGafusMiniGuides: vi.fn(),getGafusPostReactionProgress: vi.fn(),
  getAuthorizedMiniGuideContent: vi.fn(),
  GafusError: class GafusError extends Error { constructor(public code: string) { super(code); } },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { gafusRoutes } from "./gafus";
const h = new Hono();
h.use("/api/v1/gafus/*", authMiddleware);
h.route("/api/v1/gafus", gafusRoutes);
const prefix = "http://local.test/api/v1/gafus";
let a="";let b="";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  a = await generateAccessToken({ id: "owner-A", username: "a", role: "USER" });
  b = await generateAccessToken({ id: "owner-B", username: "b", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  m.status.mockImplementation(async (id: string) => ({wallet:{balance:id==="owner-A"?2:9},enabled:{economy:true}}));
  m.history.mockResolvedValue({
    items: [{id:"synthetic-tx",kind:"EARN",delta:1,balanceAfter:1,
      createdAt:new Date("2026-10-18T00:00:00Z"),rewardKind:"POST_PUBLISHED",
      sourceEntityType:"FEED_POST",sourceEntityId:"synthetic-post",targetKey:null}],
    nextCursor:null,
  });
});
const get = (path: string, jwt: string, cookie=false) => h.request(prefix+path, {headers:
  cookie ? {cookie:`gafus_access=${jwt}`} : {authorization:`Bearer ${jwt}`},
});
describe("Gafus Wallet live Hono GET status/history source audit", () => {
  it("A01 JWT owner A status is own balance, no-store, no mutation", async () => {
    const res=await get("/status",a);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({success:true,data:{wallet:{balance:2}}});
    expect(m.status).toHaveBeenCalledWith("owner-A");
    expect(m.unlock).not.toHaveBeenCalled();
  });
  it("A02 wallet status owner B cannot see A, actor only from signed JWT", async () => {
    const res=await get("/status?userId=owner-A",b);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({success:true,data:{wallet:{balance:9}}});
    expect(m.status).toHaveBeenCalledWith("owner-B");
    expect(m.unlock).not.toHaveBeenCalled();
  });
  it("A03 history preserves owner scoped pagination and DTO excludes metadata", async () => {
    const res=await get("/history?limit=1&cursor=synthetic-cursor",a);
    expect(res.status).toBe(200);
    expect(m.history).toHaveBeenCalledWith({userId:"owner-A",cursor:"synthetic-cursor",limit:1});
    expect(await res.json()).toEqual({success:true,data:{items:[{
      id:"synthetic-tx",kind:"EARN",delta:1,balanceAfter:1,
      createdAt:"2026-10-18T00:00:00.000Z",rewardKind:"POST_PUBLISHED",
      sourceEntityType:"FEED_POST",sourceEntityId:"synthetic-post",targetKey:null,
    }],nextCursor:null}});
    expect(m.unlock).not.toHaveBeenCalled();
  });
  it("A04 invalid paging is stable validation 400 before Core", async () => {
    for (const q of ["limit=0","limit=101","limit=abc","limit=1.5"]) {
      const res=await get("/history?"+q,a);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({success:false,code:"GAFUS_VALIDATION_ERROR"});
    }
    expect(m.history).not.toHaveBeenCalled();
  });
  it("A05 Core error sanitized 500; never reveal private transaction metadata", async () => {
    m.history.mockRejectedValueOnce(new Error("SECRET_WALLET_METADATA_ACCOUNT"));
    const res=await get("/history",a);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("SECRET_WALLET_METADATA_ACCOUNT");
  });
  it("A06 missing/invalid JWT denied, Cookie GET permitted without Origin", async () => {
    expect((await h.request(prefix+"/status")).status).toBe(401);
    expect((await get("/history","bad.jwt")).status).toBe(401);
    expect(m.status).not.toHaveBeenCalled();
    expect((await get("/status",a,true)).status).toBe(200);
    expect(m.unlock).not.toHaveBeenCalled();
  });
});
