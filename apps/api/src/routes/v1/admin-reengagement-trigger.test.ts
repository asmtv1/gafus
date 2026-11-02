import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  verify: vi.fn(), registration: vi.fn(), role: vi.fn(), set: vi.fn(), eval: vi.fn(), run: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fake.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fake.registration }));
vi.mock("@gafus/core/services/adminUser", () => ({ readAdminActorRole: fake.role }));
vi.mock("@gafus/queues", () => ({ connection: { set: fake.set, eval: fake.eval } }));
vi.mock("@gafus/reengagement", () => ({ manualTriggerScheduler: fake.run }));
import { authMiddleware } from "../../middleware/auth";
import { adminReengagementTriggerRoutes } from "./admin-reengagement-trigger";
const base = "/api/v1/admin/reengagement";
function app() {
  const h = new Hono();
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminReengagementTriggerRoutes);
  return h;
}
const req = (body: object | null = { confirmation: "RUN_REENGAGEMENT" }, authenticated = true) =>
  app().request(`http://local.test${base}/run`, {
    method: "POST", headers: {
      ...(authenticated ? { authorization: "Bearer token" } : {}),
      "content-type": "application/json",
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  fake.verify.mockResolvedValue({ id: "staff-1", username: "admin", role: "ADMIN" });
  fake.registration.mockResolvedValue(true);
  fake.role.mockResolvedValue("ADMIN");
  fake.set.mockResolvedValue("OK");
  fake.eval.mockResolvedValue(1);
  fake.run.mockResolvedValue({ success: true, result: {
    newCampaigns: 2, scheduledNotifications: 4, closedCampaigns: 1,
  } });
});

describe("admin manual reengagement Next action parity", () => {
  it("guest is blocked without touching scheduler or Redis", async () => {
    expect((await req(undefined, false)).status).toBe(401);
    expect(fake.run).not.toHaveBeenCalled();
    expect(fake.set).not.toHaveBeenCalled();
  });

  it.each(["USER", "PARTNER", "MODERATOR", "TRAINER"])("%s denied", async role => {
    fake.verify.mockResolvedValue({ id: "other", username: "other", role });
    expect((await req()).status).toBe(403);
    expect(fake.run).not.toHaveBeenCalled();
  });

  it("checks current database role, not stale ADMIN JWT", async () => {
    fake.role.mockResolvedValue("USER");
    expect((await req()).status).toBe(403);
    expect(fake.set).not.toHaveBeenCalled();
    expect(fake.run).not.toHaveBeenCalled();
  });

  it.each([null, {}, { confirmation: "yes" },
    { confirmation: "RUN_REENGAGEMENT", actorId: "forged" },
  ])("rejects ambiguous or forged input", async body => {
    expect((await req(body)).status).toBe(400);
    expect(fake.set).not.toHaveBeenCalled();
    expect(fake.run).not.toHaveBeenCalled();
  });

  it("requires a distributed lock and delegates to legacy scheduler exactly once", async () => {
    const res = await req();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await res.json()).data).toEqual({
      newCampaigns: 2, scheduledNotifications: 4, closedCampaigns: 1,
    });
    expect(fake.set).toHaveBeenCalledWith(
      "gafus:admin:reengagement:manual-run", expect.any(String), "PX", 900000, "NX");
    expect(fake.run).toHaveBeenCalledOnce();
    expect(fake.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("GET"'), 1,
      "gafus:admin:reengagement:manual-run", expect.any(String));
    expect(fake.set.mock.calls[0][1]).toBe(fake.eval.mock.calls[0][3]);
  });

  it("does not execute concurrent duplicate launch", async () => {
    fake.set.mockResolvedValue(null);
    const res = await req();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, code: "ALREADY_RUNNING" });
    expect(fake.run).not.toHaveBeenCalled();
  });

  it("fails closed if Redis lock cannot be obtained", async () => {
    fake.set.mockRejectedValue(new Error("redis authentication token"));
    const res = await req();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("authentication token");
    expect(fake.run).not.toHaveBeenCalled();
  });

  it("masks scheduler errors and tries to safely release own lock", async () => {
    fake.run.mockRejectedValue(new Error("private credential"));
    const res = await req();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private credential");
    expect(fake.eval).toHaveBeenCalledOnce();
  });

  it("reports a structured business failure without claiming success", async () => {
    fake.run.mockResolvedValue({ success: false, error: "private error" });
    const res = await req();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private error");
    expect(fake.eval).toHaveBeenCalledOnce();
  });
});
