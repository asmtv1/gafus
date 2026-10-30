import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  public: vi.fn(), get: vi.fn(), put: vi.fn(), tour: vi.fn(),
  seen: vi.fn(), avatar: vi.fn(), code: vi.fn(), del: vi.fn(),
  preflight: vi.fn(), log: vi.fn(),
}));
vi.mock("@gafus/core/services/user", async () => {
  const { z } = await import("zod");
  return {
    getPublicProfile: m.public, getUserProfileForApi: m.get,
    updateUserProfile: m.put, getOnboardingTourStatus: m.tour,
    markOnboardingTourSeen: m.seen, updateAvatar: m.avatar,
    requestAccountDeletionCode: m.code, deleteUserAccount: m.del,
    readAccountDeletionPreflight: m.preflight,
    deleteUserAccountBodySchema: z.object({ code: z.string() }),
  };
});
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: m.log }) }));
import { userRoutes } from "./user";
const ACTOR = "SYNTHETIC_PRIVATE_OWNER_USER_ID";
const CANARY = "SYNTHETIC_PROFILE_ACCOUNT_TOKEN_DO_NOT_LOG";
const BASE = "/api/v1/user";
function app() {
  const h = new Hono();
  h.use("/api/v1/user/*", async (c, next) => { c.set("user", { id: ACTOR, username: "test", role: "USER" }); await next(); });
  h.route(BASE, userRoutes); return h;
}
function request(path: string, method = "GET", body?: unknown) {
  return app().request(path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
}
function upload() {
  const f = new FormData();
  f.append("file", new Blob(["image"], { type: "image/png" }), "image.png");
  return app().request(`${BASE}/avatar`, { method: "POST", body: f });
}
beforeEach(() => vi.resetAllMocks());
describe("mounted user route error log privacy; Core synthetic only", () => {
  const cases: {
    label: string; fn: ReturnType<typeof vi.fn>;
    invoke: () => Response | Promise<Response>;
  }[] = [
    { label: "public", fn: m.public, invoke: () => request(`${BASE}/profile/public?username=guest`) },
    { label: "profile GET", fn: m.get, invoke: () => request(`${BASE}/profile`) },
    { label: "tour GET", fn: m.tour, invoke: () => request(`${BASE}/onboarding-tour`) },
    { label: "tour POST", fn: m.seen, invoke: () => request(`${BASE}/onboarding-tour/complete`, "POST") },
    { label: "profile PUT", fn: m.put, invoke: () => request(`${BASE}/profile`, "PUT", { city: "Demo" }) },
    { label: "avatar POST", fn: m.avatar, invoke: upload },
    { label: "deletion preflight", fn: m.preflight,
      invoke: () => request(`${BASE}/account/deletion-preflight`) },
    { label: "deletion-code", fn: m.code, invoke: () => request(`${BASE}/account/deletion-code`, "POST") },
    { label: "delete-account", fn: m.del, invoke: () => request(`${BASE}/account/delete`, "POST", { code: "synthetic" }) },
  ];
  for (const t of cases) {
    it(`${t.label} 500 has no raw logged error/stack/actor`, async () => {
      const e = new Error(CANARY); e.stack = `Error: ${CANARY}\nSYNTHETIC_PRIVATE_STACK`;
      t.fn.mockRejectedValueOnce(e);
      const r = await t.invoke();
      expect(r.status).toBe(500); expect(await r.text()).not.toContain(CANARY);
      expect(m.log).toHaveBeenCalledTimes(1);
      const log = m.log.mock.calls.flat().map((x: unknown) => x instanceof Error ? [x.message, x.stack, String(x.cause)].join(" ") : JSON.stringify(x)).join(" ");
      expect(log).not.toContain(CANARY); expect(log).not.toContain(ACTOR); expect(log).not.toContain("SYNTHETIC_PRIVATE_STACK");
    });
  }
  it("GET onboarding-tour returns unseen status and forwards exact authenticated userId", async () => {
    const status = { hasSeenV1: false, completedAt: null };
    m.tour.mockResolvedValueOnce(status);
    const response = await request(`${BASE}/onboarding-tour`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: status });
    expect(m.tour).toHaveBeenCalledExactlyOnceWith(ACTOR);
    expect(m.seen).not.toHaveBeenCalled();
    expect(m.log).not.toHaveBeenCalled();
  });

  it("GET onboarding-tour preserves existing completedAt ISO string without conversion", async () => {
    const status = { hasSeenV1: true, completedAt: "2026-10-24T00:00:00.000Z" };
    m.tour.mockResolvedValueOnce(status);
    const response = await request(`${BASE}/onboarding-tour`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: status });
    expect(m.tour).toHaveBeenCalledExactlyOnceWith(ACTOR);
    expect(m.seen).not.toHaveBeenCalled();
  });

  it("POST onboarding-tour/complete calls only the Core write port for actor and returns unchanged DTO", async () => {
    const status = { hasSeenV1: true, completedAt: "2026-10-24T01:00:00.000Z" };
    m.seen.mockResolvedValueOnce(status);
    const response = await request(`${BASE}/onboarding-tour/complete`, "POST");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: status });
    expect(m.seen).toHaveBeenCalledExactlyOnceWith(ACTOR);
    expect(m.tour).not.toHaveBeenCalled();
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST repeated completion preserves one Core call per request; no added dedupe or retry", async () => {
    const first = { hasSeenV1: true, completedAt: "2026-10-24T01:00:00.000Z" };
    const second = { hasSeenV1: true, completedAt: "2026-10-24T02:00:00.000Z" };
    m.seen.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const responseA = await request(`${BASE}/onboarding-tour/complete`, "POST");
    const responseB = await request(`${BASE}/onboarding-tour/complete`, "POST");
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    await expect(responseA.json()).resolves.toEqual({ success: true, data: first });
    await expect(responseB.json()).resolves.toEqual({ success: true, data: second });
    expect(m.seen.mock.calls).toEqual([[ACTOR], [ACTOR]]);
    expect(m.tour).not.toHaveBeenCalled();
    expect(m.log).not.toHaveBeenCalled();
  });

  it("public not found keeps 404", async () => {
    m.public.mockResolvedValueOnce(null);
    const r = await request(`${BASE}/profile/public?username=guest`);
    expect(r.status).toBe(404); expect(m.log).not.toHaveBeenCalled();
  });
  it("own profile keeps private 200", async () => {
    m.get.mockResolvedValueOnce({ city: "Demo" });
    const r = await request(`${BASE}/profile`);
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.json()).toEqual({ success: true, data: { city: "Demo" } });
  });
  it("minimal deletion preflight returns own email presence without email or avatar", async () => {
    const data = { id: ACTOR, username: "test", hasEmail: true };
    m.preflight.mockResolvedValueOnce(data);
    const r = await request(`${BASE}/account/deletion-preflight`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    await expect(r.json()).resolves.toEqual({ success: true, data });
    expect(m.preflight).toHaveBeenCalledExactlyOnceWith(ACTOR);
    expect(m.get).not.toHaveBeenCalled();
  });
  it("missing deletion preflight owner does not expose any private fields", async () => {
    m.preflight.mockResolvedValueOnce(null);
    const r = await request(`${BASE}/account/deletion-preflight`);
    expect(r.status).toBe(404);
    expect((await r.text())).not.toContain(CANARY);
  });
  it("typed deletion-code forbidden 403 not logged", async () => {
    m.code.mockResolvedValueOnce({ success: false, code: "FORBIDDEN", error: "Недостаточно прав" });
    const r = await request(`${BASE}/account/deletion-code`, "POST");
    expect(r.status).toBe(403); expect(m.log).not.toHaveBeenCalled();
  });
  it("typed invalid delete code 401 has no real delete", async () => {
    m.del.mockResolvedValueOnce({ success: false, code: "INVALID_CODE", error: "Неверный или просроченный код" });
    const r = await request(`${BASE}/account/delete`, "POST", { code: "synthetic" });
    expect(r.status).toBe(401); expect(m.del).toHaveBeenCalledExactlyOnceWith({ actorUserId: ACTOR, code: "synthetic" });
    expect(m.log).not.toHaveBeenCalled();
  });
});
