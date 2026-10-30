/** Hono push owner session gate: real HS256 JWT, no real PostgreSQL/push. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { save, logs } = vi.hoisted(() => ({ save: vi.fn(), logs: vi.fn() }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: logs, warn: logs, error: logs }),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findUnique: async () => ({
    sessionsRevokedAt: null, registrationPending: false, role: "USER",
  }) } },
}));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("../../../../../packages/core/src/services/subscriptions/pushSubscriptionService.js", () => ({
  savePushSubscription: save,
  PushEndpointOwnerConflictError: class PushEndpointOwnerConflictError extends Error {
    code = "PUSH_ENDPOINT_OWNER_CONFLICT";
  },
  PushSessionStaleError: class PushSessionStaleError extends Error {
    code = "PUSH_SESSION_STALE";
  },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { subscriptionsRoutes } from "./subscriptions";

const app = new Hono();
app.use("/api/v1/subscriptions/*", authMiddleware);
app.route("/api/v1/subscriptions", subscriptionsRoutes);
const path = "/api/v1/subscriptions/push";
const endpoint = "ExpoPushToken[SECRET_PRIVATE_ENDPOINT]";
const keys = { p256dh: "SECRET_P256DH", auth: "SECRET_AUTH" };
let jwt = "";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  jwt = await generateAccessToken({ id: "A", username: "synthetic-a", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue({ id: "row", userId: "A" });
});
function post(body: object, cookie = false, origin?: string) {
  return app.request(path, { method: "POST", headers: {
    "content-type": "application/json",
    ...(cookie ? { cookie: `gafus_access=${jwt}` } : { authorization: `Bearer ${jwt}` }),
    ...(origin ? { origin } : {}),
  }, body: JSON.stringify(body) });
}

describe("NOTIF050 signed JWT Hono session ownership", () => {
  it("H01 verified signed epoch only; forged userId/authEpoch body rejected", async () => {
    expect((await post({ endpoint, keys, userId: "B", authEpoch: 777 })).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
    expect((await post({ endpoint, keys })).status).toBe(200);
    const params = save.mock.calls[0]?.[0];
    expect(params).toMatchObject({ userId: "A", endpoint, keys });
    expect(params.verifiedSessionAuthenticatedAtMs).toBeGreaterThan(Date.now() - 60_000);
    expect(params.verifiedSessionAuthenticatedAtMs).toBeLessThanOrEqual(Date.now());
  });

  it("H02 cookie missing/wrong Origin 403; trusted HTTPS and same JWT 200", async () => {
    expect((await post({ endpoint, keys }, true)).status).toBe(403);
    expect((await post({ endpoint, keys }, true, "http://127.0.0.1:4136")).status).toBe(403);
    expect((await post({ endpoint, keys }, true, "https://gafus.ru")).status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("H03 foreign-owner conflict maps to deterministic 409, no secret", async () => {
    const { PushEndpointOwnerConflictError } = await import(
      "../../../../../packages/core/src/services/subscriptions/pushSubscriptionService.js"
    );
    save.mockRejectedValueOnce(new PushEndpointOwnerConflictError());
    const res = await post({ endpoint, keys });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, code: "PUSH_ENDPOINT_OWNER_CONFLICT" });
    expect(JSON.stringify(logs.mock.calls)).not.toContain(endpoint);
  });

  it("H04 post-auth stale session maps to 401 and no client epoch fallback", async () => {
    const { PushSessionStaleError } = await import(
      "../../../../../packages/core/src/services/subscriptions/pushSubscriptionService.js"
    );
    save.mockRejectedValueOnce(new PushSessionStaleError());
    const res = await post({ endpoint, keys });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, code: "PUSH_SESSION_STALE" });
  });

  it("H05 raw DB failure sanitized in body and logs", async () => {
    save.mockRejectedValueOnce(new Error(`sensitive ${endpoint} ${keys.auth}`));
    const res = await post({ endpoint, keys });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(endpoint);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(endpoint.slice(0, 50));
    expect(JSON.stringify(logs.mock.calls)).not.toContain(keys.auth);
  });
});
