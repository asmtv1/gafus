/** Opt-in local-only G1 integration: actual rate-limit middleware and isolated Redis.
 * Run with G1_LOCAL_REDIS_INTEGRATION=1 and G1_LOCAL_REDIS_URL=redis://127.0.0.1:16381.
 * Never connect to shared port 6379; no production/default Redis URL is used.
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The global vitest.setup.ts queues client returns a scalar evalsha value.
// Override this suite ONLY, with a lazy connection to the dedicated G1 Redis.
vi.unmock("ioredis");
vi.mock("@gafus/queues", async () => {
  if (process.env.G1_LOCAL_REDIS_INTEGRATION !== "1") {
    return {
      connection: {
        script: async () => "disabled-test-script",
        evalsha: async () => [0, 0],
        decr: async () => 0,
        del: async () => 0,
        ping: async () => "PONG",
        disconnect: () => undefined,
      },
    };
  }
  const { default: Redis } = await import("ioredis");
  const url = process.env.G1_LOCAL_REDIS_URL ?? "redis://127.0.0.1:16381";
  return {
    connection: new Redis(url, {
      lazyConnect: true, connectTimeout: 2_000, maxRetriesPerRequest: 1,
    }),
  };
});

import { connection } from "@gafus/queues";
import { authRateLimiter, consultationBookRateLimiter } from "./rate-limit";

const enabled = process.env.G1_LOCAL_REDIS_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;

function app() {
  const h = new Hono();
  h.use("/book", async (c, next) => {
    c.set("user", { id: c.req.header("x-g1-user") ?? "g1-anonymous", role: "USER", username: "g1" });
    await next();
  });
  h.post("/book", consultationBookRateLimiter, c => c.json({ success: true }));
  h.post("/auth", authRateLimiter, c => c.json({ success: true }));
  return h;
}

suite("G1 isolated Redis: REAL Lua script, 429 and actor isolation", () => {
  beforeAll(async () => {
    const raw = process.env.G1_LOCAL_REDIS_URL;
    if (raw !== "redis://127.0.0.1:16381") {
      throw new Error("G1 Redis tests require exact isolated 127.0.0.1:16381 URL");
    }
    expect(await connection.ping()).toBe("PONG");
  });

  afterAll(async () => { connection.disconnect(); });

  it("permits 10 booking attempts per actor, then 429 with rate-limit headers", async () => {
    const h = app();
    const id = `g1-${randomUUID()}`;
    for (let i = 0; i < 10; i++) {
      const r = await h.request("http://local.test/book", {
        method: "POST", headers: { "x-g1-user": id },
      });
      expect(r.status).toBe(200);
    }
    const denied = await h.request("http://local.test/book", {
      method: "POST", headers: { "x-g1-user": id },
    });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("ratelimit-limit")).toBe("10");
  });

  it("does not share quota between two logged-in actors", async () => {
    const h = app();
    const a = `g1-${randomUUID()}`;
    const b = `g1-${randomUUID()}`;
    for (let i = 0; i < 10; i++) {
      const r = await h.request("http://local.test/book", {
        method: "POST", headers: { "x-g1-user": a },
      });
      expect(r.status).toBe(200);
    }
    expect((await h.request("http://local.test/book", {
      method: "POST", headers: { "x-g1-user": a },
    })).status).toBe(429);
    expect((await h.request("http://local.test/book", {
      method: "POST", headers: { "x-g1-user": b },
    })).status).toBe(200);
  });

  it("auth limiter uses x-real-ip rather than caller-supplied x-forwarded-for", async () => {
    const h = app();
    const ip = `g1-${randomUUID()}`;
    for (let i = 0; i < 10; i++) {
      const r = await h.request("http://local.test/auth", {
        method: "POST", headers: { "x-real-ip": ip, "x-forwarded-for": `fake-${i}` },
      });
      expect(r.status).toBe(200);
    }
    const denied = await h.request("http://local.test/auth", {
      method: "POST", headers: { "x-real-ip": ip, "x-forwarded-for": "fake-fresh" },
    });
    expect(denied.status).toBe(429);
  });
});
