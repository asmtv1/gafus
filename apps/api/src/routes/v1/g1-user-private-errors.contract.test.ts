/** AG1-G1-001: private profile failures must have no-store without changing DTO. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const core = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), public: vi.fn() }));
vi.mock("@gafus/core/services/user", async () => {
  const { z } = await import("zod");
  return {
    getUserProfileForApi: core.get,
    updateUserProfile: core.update,
    getPublicProfile: core.public,
    deleteUserAccountBodySchema: z.object({}),
  };
});
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
import { userRoutes } from "./user";
const principal = { id: "user-A", username: "tester", role: "USER" } as const;
function api() {
  const server = new Hono();
  server.use("/api/v1/user/*", async (c, next) => {
    c.set("user", principal);
    await next();
  });
  server.route("/api/v1/user", userRoutes);
  return server;
}
function assertPrivate(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
}
function put(payload: unknown) {
  return api().request("/api/v1/user/profile", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
beforeEach(() => vi.resetAllMocks());

describe("AG1 owned private profile response error privacy (Core mocked)", () => {
  it("success retains full native DTO, no-store", async () => {
    const data = { id: principal.id, profile: { city: "Казань" } };
    core.get.mockResolvedValueOnce(data);
    const res = await api().request("/api/v1/user/profile");
    expect(res.status).toBe(200);assertPrivate(res);
    expect(await res.json()).toEqual({ success: true, data });
  });
  it("missing profile 404 is private and does not invent identity", async () => {
    core.get.mockResolvedValueOnce(null);
    const res = await api().request("/api/v1/user/profile");
    expect(res.status).toBe(404);assertPrivate(res);
    expect((await res.json()).success).toBe(false);
  });
  it("GET unexpected Core exception 500 private, no leaked error", async () => {
    core.get.mockRejectedValueOnce(new Error("PRIVATE_USER_SQL_CANARY"));
    const res = await api().request("/api/v1/user/profile");
    expect(res.status).toBe(500);assertPrivate(res);
    expect(await res.text()).not.toContain("PRIVATE_USER_SQL_CANARY");
  });
  it("PUT unexpected Core exception 500 private", async () => {
    core.update.mockRejectedValueOnce(new Error("PRIVATE_USER_SQL_CANARY"));
    const res = await put({ city: "Казань" });
    expect(res.status).toBe(500);assertPrivate(res);
    expect(await res.text()).not.toContain("PRIVATE_USER_SQL_CANARY");
  });
  it("PUT malformed field 400 private and never reaches Core", async () => {
    const res = await put({ city: 42 });
    expect(res.status).toBe(400);assertPrivate(res);
    expect(core.update).not.toHaveBeenCalled();
  });
  it("public profile remains separate and doesn't need JWT", async () => {
    core.public.mockResolvedValueOnce({ username: "visitor", profile: { city: "Сочи" } });
    const res = await api().request("/api/v1/user/profile/public?username=visitor");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { username: "visitor" } });
  });
});
