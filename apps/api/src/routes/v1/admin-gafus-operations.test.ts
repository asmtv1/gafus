import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), registration: vi.fn(), fraud: vi.fn(), review: vi.fn(),
  preflight: vi.fn(), importBatch: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.registration }));
vi.mock("@gafus/core/services/adminGafus", () => ({
  listGafusFraudSignalsAdmin: f.fraud, reviewGafusFraudSignalAdmin: f.review,
}));
vi.mock("@gafus/core/services/gafus", () => ({
  getLegacyGafusImportPreflight: f.preflight,
  importLegacyRewardedBatch: f.importBatch,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminGafusOperationsRoutes } from "./admin-gafus-operations";
const root = "/api/v1/admin/gafus-operations";
function app() {
  const h = new Hono();
  h.use(`${root}/*`, async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
  h.use(`${root}/*`, authMiddleware);
  h.route(root, adminGafusOperationsRoutes);
  return h;
}
function request(path: string, method = "GET", body?: object, auth = true) {
  return app().request("http://localhost" + root + path, {
    method,
    headers: {
      ...(auth ? { authorization: "Bearer test-token" } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const validReview = { action: "CONFIRM", requestedReversal: 5, reason: "Подтверждено нарушение" };
const validImport = { confirmation: "IMPORT_LEGACY_GAFUS", cursor: "next1" };

beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin-1", role: "ADMIN", username: "admin" });
  f.registration.mockResolvedValue(true);
  f.fraud.mockResolvedValue([{ id: "signal1" }]);
  f.review.mockResolvedValue({ status: "RESOLVED", recovered: 5 });
  f.preflight.mockResolvedValue({
    cutoverDisabled: true, importEnabled: true, pendingRefundCredits: 0, unsettledSessions: 0,
  });
  f.importBatch.mockResolvedValue({ imported: 1, credits: 3, nextCursor: null });
});

describe("Gafus admin fraud and operator legacy import", () => {
  it("unauthenticated access is blocked before ALL sensitive Core operations", async () => {
    for (const [method, path] of [
      ["GET", "/fraud"], ["GET", "/legacy/preflight"],
      ["POST", "/fraud/signal1/review"], ["POST", "/legacy/import"],
    ]) {
      const response = await request(path, method, undefined, false);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(f.fraud).not.toHaveBeenCalled();
    expect(f.review).not.toHaveBeenCalled();
    expect(f.preflight).not.toHaveBeenCalled();
    expect(f.importBatch).not.toHaveBeenCalled();
  });

  it.each(["MODERATOR", "TRAINER", "USER"])("%s cannot operate Gafus finances", async role => {
    f.verify.mockResolvedValue({ id: "other", username: "other", role });
    expect((await request("/fraud")).status).toBe(403);
    expect((await request("/legacy/import", "POST", validImport)).status).toBe(403);
    expect(f.fraud).not.toHaveBeenCalled();
    expect(f.importBatch).not.toHaveBeenCalled();
  });

  it("lists fraud signals via Core with authenticated actor and default OPEN status", async () => {
    const result = await request("/fraud");
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(f.fraud).toHaveBeenCalledWith({ actorId: "admin-1", status: "OPEN" });
  });

  it("lists resolved signals and rejects unknown statuses", async () => {
    expect((await request("/fraud?status=RESOLVED")).status).toBe(200);
    expect(f.fraud).toHaveBeenCalledWith({ actorId: "admin-1", status: "RESOLVED" });
    vi.clearAllMocks();
    expect((await request("/fraud?status=all")).status).toBe(400);
    expect(f.fraud).not.toHaveBeenCalled();
  });

  it("confirms a fraud signal through idempotent Core reversal", async () => {
    const response = await request("/fraud/signal1/review", "POST", validReview);
    expect(response.status).toBe(200);
    expect(f.review).toHaveBeenCalledWith({
      actorId: "admin-1", signalId: "signal1", ...validReview,
    });
  });

  it("dismisses a fraud signal with reversal zero", async () => {
    const response = await request("/fraud/signal1/review", "POST", {
      action: "DISMISS", reason: "Нарушение не подтвердилось",
    });
    expect(response.status).toBe(200);
    expect(f.review).toHaveBeenCalledWith({
      actorId: "admin-1", signalId: "signal1", action: "DISMISS",
      requestedReversal: 0, reason: "Нарушение не подтвердилось",
    });
  });

  it("rejects unconfirmed reversal, reason too short or extra actor before Core", async () => {
    for (const invalid of [
      { action: "CONFIRM", reason: "valid reason" },
      { ...validReview, reason: "bad" },
      { ...validReview, actorId: "forged" },
      { ...validReview, requestedReversal: 10001 },
      { action: "DISMISS", reason: "valid reason", requestedReversal: 1 },
    ]) {
      expect((await request("/fraud/signal1/review", "POST", invalid)).status).toBe(400);
    }
    expect(f.review).not.toHaveBeenCalled();
  });

  it("maps already reviewed fraud signals to 409 and masks internal details", async () => {
    f.review.mockRejectedValue(new Error("FRAUD_SIGNAL_ALREADY_REVIEWED"));
    const response = await request("/fraud/signal1/review", "POST", validReview);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "CONFLICT" });
  });

  it("preflight is read-only and receives the authenticated actor", async () => {
    const response = await request("/legacy/preflight");
    expect(response.status).toBe(200);
    expect(f.preflight).toHaveBeenCalledWith("admin-1");
    expect(f.importBatch).not.toHaveBeenCalled();
  });

  it("never runs an import without precise operator acknowledgement", async () => {
    for (const invalid of [
      { confirmation: "YES" }, {}, { ...validImport, actorId: "forged" },
      { ...validImport, cursor: "../../outside" },
    ]) {
      expect((await request("/legacy/import", "POST", invalid)).status).toBe(400);
    }
    expect(f.importBatch).not.toHaveBeenCalled();
  });

  it("confirmed import delegates maximum 50 to Core and not a larger request batch", async () => {
    const response = await request("/legacy/import", "POST", validImport);
    expect(response.status).toBe(200);
    expect(f.importBatch).toHaveBeenCalledWith({
      actorId: "admin-1", confirmed: true, batchSize: 50, cursor: "next1",
    });
    expect(await response.json()).toEqual({
      success: true, data: { imported: 1, credits: 3, nextCursor: null },
    });
  });

  it("Core blocks import while refunds or ad sessions remain unsettled", async () => {
    f.importBatch.mockRejectedValue(new Error("LEGACY_IMPORT_UNSETTLED_STATE"));
    const response = await request("/legacy/import", "POST", validImport);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "CONFLICT" });
  });

  it("redacts internal database errors", async () => {
    f.preflight.mockRejectedValue(new Error("database-private-secret"));
    const response = await request("/legacy/preflight");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database-private-secret");
  });
});
