/** G1 JSON parse failure must be client 400, not a leaked Core failure. Core is mocked. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  completed: vi.fn(),
  dashboard: vi.fn(),
  settings: vi.fn(),
  adjust: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.completed }));
vi.mock("@gafus/core/services/adminGafus", () => ({
  getGafusAdminDashboard: f.dashboard,
  updateGafusSettingsAdmin: f.settings,
  adjustGafusBalanceAdmin: f.adjust,
}));
import { authMiddleware } from "../../middleware/auth";
import { gafusAdminRoutes } from "./gafus-admin";
function app() {
  const h = new Hono();
  h.use("/api/v1/gafus/admin/*", authMiddleware);
  h.route("/api/v1/gafus/admin", gafusAdminRoutes);
  return h;
}
function send(path: string, method: string, body: string) {
  return app().request("http://local.test/api/v1/gafus/admin" + path, {
    method,
    headers: { authorization: "Bearer synthetic", "content-type": "application/json" },
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  f.verifyAccessToken.mockResolvedValue({ id: "admin-jwt", username: "admin", role: "ADMIN" });
  f.completed.mockResolvedValue(true);
  f.settings.mockResolvedValue({ revision: 2 });
  f.adjust.mockResolvedValue({ transactionId: "synthetic-tx", balance: 5 });
});
describe("G1 staff admin malformed JSON source contract (real Hono, mock Core)", () => {
  it("AJ01 malformed PATCH JSON returns 400 private envelope without settings side effect", async () => {
    const res = await send("/settings", "PATCH", '{"expectedRevision":');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, code: "GAFUS_VALIDATION_ERROR" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(f.settings).not.toHaveBeenCalled();
  });
  it("AJ02 malformed POST JSON returns 400 private envelope without wallet side effect", async () => {
    const res = await send("/adjust", "POST", '{"requestId":');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, code: "GAFUS_VALIDATION_ERROR" });
    expect(f.adjust).not.toHaveBeenCalled();
  });
  it("AJ03 empty JSON body rejects with 400 and no Core write", async () => {
    const res = await send("/settings", "PATCH", "");
    expect(res.status).toBe(400);
    expect(f.settings).not.toHaveBeenCalled();
  });
  it("AJ04 legitimate settings JSON still delegates validated actor only", async () => {
    const res = await send(
      "/settings",
      "PATCH",
      JSON.stringify({
        expectedRevision: 1,
        reason: "Audit update",
        patch: { earningEnabled: false },
      }),
    );
    expect(res.status).toBe(200);
    expect(f.settings).toHaveBeenCalledWith({
      actorId: "admin-jwt",
      expectedRevision: 1,
      reason: "Audit update",
      patch: { earningEnabled: false },
    });
  });
  it("AJ05 Core SyntaxError is an internal error 500 and never reclassified as JSON 400", async () => {
    f.settings.mockRejectedValueOnce(new SyntaxError("PRIVATE_CORE_SYNTAX_FAILURE"));
    const res = await send(
      "/settings",
      "PATCH",
      JSON.stringify({
        expectedRevision: 1,
        reason: "Audit update",
        patch: { earningEnabled: false },
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, code: "GAFUS_INTERNAL_ERROR" });
  });
});
