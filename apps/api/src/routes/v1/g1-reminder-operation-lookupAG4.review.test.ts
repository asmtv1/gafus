/** AG4 GET operation owner lookup; real JWT/Origin auth, mocked SQL only. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findUnique: async () => ({
    sessionsRevokedAt: null, registrationPending: false, role: "USER",
  }) } },
}));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/core/services/reminders", () => ({
  lookupReminderAG4: lookup,
  ReminderUnknownError: class ReminderUnknownError extends Error {
    code = "REMINDER_OPERATION_UNKNOWN";
  },
  ReminderInvalidError: class ReminderInvalidError extends Error {
    code = "REMINDER_IDEMPOTENCY_INVALID";
  },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { reminderOperationLookupAG4ReviewRoutes } from "./g1-reminder-operation-lookupAG4.review";
const h = new Hono();
h.use("/api/v1/reminders/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
h.use("/api/v1/reminders/*", authMiddleware);
h.route("/api/v1/reminders", reminderOperationLookupAG4ReviewRoutes);
const key = "c9a32b84-65a5-43c2-975e-e96b122e173f";
const route = `/api/v1/reminders/operations/${key}`;
let a = ""; let b = "";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  a = await generateAccessToken({ id: "owner-a", username: "a", role: "USER" });
  b = await generateAccessToken({ id: "owner-b", username: "b", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  lookup.mockImplementation(async (owner: string) => {
    if (owner === "owner-a") return { status: "COMMITTED", reminder: { id: "r-a" } };
    const { ReminderUnknownError } = await import(
      "@gafus/core/services/reminders"
    );
    throw new ReminderUnknownError();
  });
});
const get = (token: string, cookie = false, origin?: string, p = route) =>
  h.request(p, { method: "GET", headers: {
    ...(cookie ? { cookie: `gafus_access=${token}` } : { authorization: `Bearer ${token}` }),
    ...(origin ? { origin } : {}),
  } });
describe("AG4 GET /operations/:uuid candidate mounted in isolated Hono", () => {
  it("G01 owner A committed with private no-store, owner B masked 404", async () => {
    const mine = await get(a);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toBe("private, no-store");
    expect(await mine.json()).toEqual({ success: true, data: {
      status: "COMMITTED", reminder: { id: "r-a" },
    } });
    expect(lookup).toHaveBeenCalledWith("owner-a", key);
    const foreign = await get(b);
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ success: false, code: "REMINDER_OPERATION_UNKNOWN" });
    expect(foreign.headers.get("cache-control")).toBe("private, no-store");
  });
  it("G02 401 without JWT; invalid signed token is private", async () => {
    const missing = await h.request(route);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    const invalid = await get("invalid.jwt");
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
  });
  it("G03 cookie GET permitted without Origin; changing state never occurs", async () => {
    const response = await get(a, true);
    expect(response.status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("G04 invalid UUID 400, typed unknown 404, raw fault sanitized 500", async () => {
    const invalidKey = "/api/v1/reminders/operations/NO_UUID";
    const { ReminderInvalidError, ReminderUnknownError } = await import(
      "@gafus/core/services/reminders"
    );
    lookup.mockRejectedValueOnce(new ReminderInvalidError());
    expect((await get(a, false, undefined, invalidKey)).status).toBe(400);
    lookup.mockRejectedValueOnce(new ReminderUnknownError());
    expect((await get(a)).status).toBe(404);
    lookup.mockRejectedValueOnce(new Error(`SECRET-${key}`));
    const response = await get(a);
    expect(response.status).toBe(500);
    expect((await response.text())).not.toContain(key);
  });
});
