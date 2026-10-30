/** G1 mocked Core route-shape characterization; actual ADMIN policy belongs to Core. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  isRegistrationCompleted: vi.fn(),
  dashboard: vi.fn(),
  settings: vi.fn(),
  adjust: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fakes.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fakes.isRegistrationCompleted }));
vi.mock("@gafus/core/services/adminGafus", () => ({
  getGafusAdminDashboard: fakes.dashboard,
  updateGafusSettingsAdmin: fakes.settings,
  adjustGafusBalanceAdmin: fakes.adjust,
}));

import { authMiddleware } from "../../middleware/auth";
import { gafusAdminRoutes } from "./gafus-admin";

function app() {
  const h = new Hono();
  h.use("/api/v1/gafus/admin/*", authMiddleware);
  h.route("/api/v1/gafus/admin", gafusAdminRoutes);
  return h;
}
function req(path: string, method: string, data?: object, headers: Record<string, string> = {}) {
  return app().request("http://local.test/api/v1/gafus/admin" + path, {
    method, headers: { authorization: "Bearer token", ...(data ? { "content-type": "application/json" } : {}), ...headers },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.verifyAccessToken.mockResolvedValue({ id: "actor-from-jwt", role: "ADMIN", username: "admin" });
  fakes.isRegistrationCompleted.mockResolvedValue(true);
  fakes.dashboard.mockResolvedValue({ wallets: { count: 0 } });
  fakes.settings.mockResolvedValue({ revision: 5 });
  fakes.adjust.mockResolvedValue({ transactionId: "test-tx", balance: 10, replay: false });
});

describe("G1 Hono Gafus admin route contract (Core mocked)", () => {
  it("unauthenticated dashboard never calls Core", async () => {
    const response = await app().request("/api/v1/gafus/admin/dashboard");
    expect(response.status).toBe(401);
    expect(fakes.dashboard).not.toHaveBeenCalled();
  });

  it("passes actorId from JWT to Core rather than accepting user-supplied ids", async () => {
    const response = await req("/dashboard?actorId=someone-else", "GET");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, data: { wallets: { count: 0 } } });
    expect(fakes.dashboard).toHaveBeenCalledWith("actor-from-jwt");
  });

  it("maps a Core FORBIDDEN decision to 403 (role must be checked in Core)", async () => {
    fakes.verifyAccessToken.mockResolvedValueOnce({ id: "user-from-jwt", role: "USER", username: "user" });
    fakes.dashboard.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const response = await req("/dashboard", "GET");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, code: "FORBIDDEN" });
    expect(fakes.dashboard).toHaveBeenCalledWith("user-from-jwt");
  });

  it("rejects browser cookie mutation from untrusted Origin before Core", async () => {
    const response = await app().request("/api/v1/gafus/admin/settings", {
      method: "PATCH", headers: { origin: "https://attacker.invalid", cookie: "gafus_access=token", "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 1, reason: "Audit update", patch: { earningEnabled: false } }),
    });
    expect(response.status).toBe(403);
    expect(fakes.settings).not.toHaveBeenCalled();
  });

  it("rejects privilege escalation via invalid setting keys before calling Core", async () => {
    const response = await req("/settings", "PATCH", {
      expectedRevision: 1, reason: "Audit update", patch: { revision: 99 },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, code: "GAFUS_VALIDATION_ERROR" });
    expect(fakes.settings).not.toHaveBeenCalled();
  });

  it("passes validated actor and revision to Core settings update", async () => {
    const response = await req("/settings", "PATCH", {
      expectedRevision: 4, reason: "Regular audit", patch: { earningEnabled: false },
    });
    expect(response.status).toBe(200);
    expect(fakes.settings).toHaveBeenCalledWith({
      actorId: "actor-from-jwt", expectedRevision: 4, reason: "Regular audit", patch: { earningEnabled: false },
    });
  });

  it("maps optimistic revision conflicts to 409", async () => {
    fakes.settings.mockRejectedValueOnce(new Error("SETTINGS_REVISION_CONFLICT"));
    const response = await req("/settings", "PATCH", {
      expectedRevision: 1, reason: "Regular audit", patch: { earningEnabled: false },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "GAFUS_CONFLICT" });
  });

  it("does not emit internal details on 500", async () => {
    fakes.dashboard.mockRejectedValueOnce(new Error("SECRET_INTERNAL_TEST_VALUE"));
    const response = await req("/dashboard", "GET");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SECRET_INTERNAL_TEST_VALUE");
  });

  it("passes idempotency requestId and actor to Core wallet adjustment", async () => {
    const response = await req("/adjust", "POST", {
      userId: "target-user", delta: 10, requestId: "request-123456", reason: "Manual review",
    });
    expect(response.status).toBe(200);
    expect(fakes.adjust).toHaveBeenCalledWith({
      actorId: "actor-from-jwt", userId: "target-user", delta: 10,
      requestId: "request-123456", reason: "Manual review",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects negative invalid zero amount without Core mutation", async () => {
    const response = await req("/adjust", "POST", {
      userId: "target-user", delta: 0, requestId: "request-123456", reason: "Manual review",
    });
    expect(response.status).toBe(400);
    expect(fakes.adjust).not.toHaveBeenCalled();
  });
});
