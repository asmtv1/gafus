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
vi.mock("../../../../../packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.js", () => ({
  lookupOwnReminderCreateReceipt: lookup,
  ReminderIdempotencyInvalidError: class extends Error { code = "REMINDER_IDEMPOTENCY_INVALID"; },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { reminderCreateLookupReviewRoutes } from "./g1-reminder-create-lookup.review";
const h = new Hono();
h.use("/api/v1/reminders/*", authMiddleware);
h.route("/api/v1/reminders", reminderCreateLookupReviewRoutes);
const path = "/api/v1/reminders/create/lookup";
const key = "a0b96eef-f6b2-4ebc-8805-b8617c2f1f4c";
let a = ""; let b = "";
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  a = await generateAccessToken({ id: "owner-a", username: "a", role: "USER" });
  b = await generateAccessToken({ id: "owner-b", username: "b", role: "USER" });
});
beforeEach(() => {
  vi.clearAllMocks();
  lookup.mockImplementation(async (id: string) => id === "owner-a"
    ? { state: "FOUND", reminder: { id: "r-1" } } : { state: "UNKNOWN" });
});
const post = (jwt: string, body: object, cookie = false, origin?: string) =>
  h.request(path, { method: "POST", headers: {
    "content-type": "application/json",
    ...(cookie ? { cookie: `gafus_access=${jwt}` } : { authorization: `Bearer ${jwt}` }),
    ...(origin ? { origin } : {}),
  }, body: JSON.stringify(body) });
describe("AG1 Hono receipt lookup source-only review", () => {
  it("owner A FOUND private no-store; B UNKNOWN", async () => {
    const result = await post(a, { idempotencyKey: key });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect((await result.json()).data.state).toBe("FOUND");
    expect(lookup).toHaveBeenCalledWith("owner-a", key);
    const foreign = await post(b, { idempotencyKey: key });
    expect((await foreign.json()).data).toEqual({ state: "UNKNOWN" });
    expect(lookup).toHaveBeenLastCalledWith("owner-b", key);
  });
  it("missing token and forged owner/invalid key rejected", async () => {
    expect((await h.request(path, { method: "POST" })).status).toBe(401);
    expect((await post(a, { idempotencyKey: "not-uuid" })).status).toBe(400);
    expect((await post(a, { idempotencyKey: key, userId: "owner-b" })).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("cookie without trusted Origin 403; HTTPS trusted 200", async () => {
    expect((await post(a, { idempotencyKey: key }, true)).status).toBe(403);
    expect((await post(a, { idempotencyKey: key }, true, "https://evil.example")).status)
      .toBe(403);
    expect(lookup).not.toHaveBeenCalled();
    expect((await post(a, { idempotencyKey: key }, true, "https://gafus.ru")).status)
      .toBe(200);
  });
  it("repository exceptions sanitized before HTTP response", async () => {
    lookup.mockRejectedValueOnce(new Error(`PRIVATE_${key}_OWNER`));
    const result = await post(a, { idempotencyKey: key });
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.text()).not.toContain(key);
  });
});
