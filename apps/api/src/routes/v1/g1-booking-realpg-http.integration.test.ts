/** AG1 opt-in actual JWT/Hono booking lookup backed by real isolated PostgreSQL. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// API test setup mocks ioredis, not the RedisStore Lua shape. Stub ONLY store,
// preserving actual Hono consultation route, limiter, JWT and SQL lookup.
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    counts = new Map<string, number>();
    init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
    async increment(key: string) {
      const totalHits = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement(key: string) {
      this.counts.set(key, Math.max(0, (this.counts.get(key) ?? 0) - 1));
    }
    async resetKey(key: string) { this.counts.delete(key); }
  },
}));
import { generateAccessToken } from "@gafus/auth/jwt";
import { prisma } from "@gafus/prisma";
import { authMiddleware } from "../../middleware/auth";
import { consultationsRoutes } from "./consultations";

const dbName = "gafus_ag1_booking_atomicity_synthetic_20261017";
const path = "/api/v1/consultations/book/lookup";
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cases = process.env.AG1_BOOKING_REALPG_HTTP === "1" ? describe : describe.skip;

function createApp() {
  const h = new Hono();
  h.use("/api/v1/consultations/*", authMiddleware);
  h.route("/api/v1/consultations", consultationsRoutes);
  return h;
}

cases("AG1 actual PostgreSQL + Hono + signed JWT /book/lookup", () => {
  let tokenA: string;
  let tokenB: string;
  const h = createApp();
  const json = (idempotencyKey: string) => JSON.stringify({ idempotencyKey });
  const request = (idempotencyKey: string, token: string, extra: Record<string, string> = {}) =>
    h.request(path, { method: "POST", headers: {
      "content-type": "application/json", authorization: `Bearer ${token}`, ...extra,
    }, body: json(idempotencyKey) });

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(`postgresql://ag1_booking_atomic_synthetic@127.0.0.1:55460/${dbName}`);
    tokenA = await generateAccessToken({ id: "ag1bk_owner_a", username: "ag1bk_owner_a", role: "USER" });
    tokenB = await generateAccessToken({ id: "ag1bk_owner_b", username: "ag1bk_owner_b", role: "USER" });
    expect(await prisma.consultationBooking.count()).toBe(5);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("H01 actual signed JWT owner A FOUND; owner B and absent are identical UNKNOWN", async () => {
    const found = await request(key(104), tokenA);
    expect(found.status).toBe(200);
    const parsed = await found.json();
    expect(parsed.data.state).toBe("FOUND");
    expect(parsed.data.booking.slotId).toBe("ag1bk_slot1");
    expect(JSON.stringify(parsed)).not.toContain("+79990000000");
    expect(JSON.stringify(parsed)).not.toContain(key(104));
    expect(found.headers.get("cache-control")).toBe("private, no-store");
    const foreign = await request(key(104), tokenB);
    const absent = await request(key(999), tokenB);
    expect(foreign.status).toBe(200);
    expect(absent.status).toBe(200);
    expect((await foreign.json()).data).toEqual({ state: "UNKNOWN" });
    expect((await absent.json()).data).toEqual({ state: "UNKNOWN" });
    console.warn("AG1_BOOKING_REALPG_HTTP", JSON.stringify({ caseId: "H01_SIGNED_JWT_OWNER_FOUND_UNKNOWN", status: 200, privacy: true }));
  });

  it("H02 expired, dangling, absent rows return the same UNKNOWN envelope", async () => {
    const unknownCases: [string, string][] = [
      [tokenA, key(109)], [tokenB, key(110)], [tokenB, key(999)],
    ];
    for (const [token, idempotencyKey] of unknownCases) {
      const response = await request(idempotencyKey, token);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: { state: "UNKNOWN" } });
    }
    console.warn("AG1_BOOKING_REALPG_HTTP", JSON.stringify({ caseId: "H02_EXPIRED_DANGLING_ABSENT", unknown: 3 }));
  });

  it("H03 cookie with missing or untrusted Origin is 403 before SQL", async () => {
    for (const origin of [undefined, "null", "https://evil.example"]) {
      const response = await h.request(path, { method: "POST", headers: {
        cookie: `gafus_access=${tokenA}`, "content-type": "application/json",
        ...(origin ? { origin } : {}),
      }, body: json(key(104)) });
      expect(response.status).toBe(403);
    }
    const accepted = await h.request(path, { method: "POST", headers: {
      cookie: `gafus_access=${tokenA}`, "content-type": "application/json", origin: "https://gafus.ru",
    }, body: json(key(104)) });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).data.state).toBe("FOUND");
    console.warn("AG1_BOOKING_REALPG_HTTP", JSON.stringify({ caseId: "H03_COOKIE_CSRF", denied: 3, trusted: 200 }));
  });

  it("H04 invalid JWT and invalid JSON payload fail safely; no SQL writes", async () => {
    const missing = await h.request(path, { method: "POST" });
    expect(missing.status).toBe(401);
    const invalid = await request(key(104), "invalid.JWT.token");
    expect(invalid.status).toBe(401);
    const malformed = await request("not-uuid", tokenA);
    expect(malformed.status).toBe(400);
    expect(await prisma.consultationBooking.count()).toBe(5);
    console.warn("AG1_BOOKING_REALPG_HTTP", JSON.stringify({ caseId: "H04_AUTH_VALIDATION", missing: 401, invalid: 401, malformed: 400 }));
  });
});
