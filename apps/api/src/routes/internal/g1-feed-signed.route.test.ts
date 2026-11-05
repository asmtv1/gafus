/** G1 isolated internal Feed Hono path, actual HMAC + raw-byte dispatcher.
 * Real Redis/DB/Cloud APIs are NOT used: only injectable Core/nonce spies.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signFeedRequest, type FeedInternalPath } from "@gafus/feed-cloud";

const m = vi.hoisted(() => ({
  key: new Uint8Array(32).fill(7),
  nonceSeen: new Set<string>(),
  nonceOutage: false,
  consumeNonce: vi.fn(),
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(), renew: vi.fn(),
  maintenance: vi.fn(), recover: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
vi.mock("@gafus/queues", () => ({ connection: { status: "ready" } }));
vi.mock("@gafus/feed-storage", () => ({ createFeedStorageFromEnv: vi.fn() }));
vi.mock("@gafus/core/services/feed", () => ({
  FeedError: class FeedError extends Error {
    constructor(public code: string, message = "Недопустимый запрос", public status = 400) {
      super(message);
    }
  },
}));
vi.mock("@gafus/feed-server", async () => {
  const { createFeedInternalDispatcher } = await import("../../../../../packages/feed-server/src/internal.js");
  const { FeedError } = await import("@gafus/core/services/feed");
  const dispatch = createFeedInternalDispatcher({
    key: m.key,
    nonces: { consume: async (id: string, expiresAt: number) => {
      m.consumeNonce(id, expiresAt);
      if (m.nonceOutage) throw new Error("NONCE_STORE_SECRET_ERROR");
      if (m.nonceSeen.has(id)) return false;
      m.nonceSeen.add(id);
      return true;
    } },
    jobs: {
      claim: m.claim,
      complete: m.complete,
      fail: m.fail,
      renew: m.renew,
    },
    maintenance: { run: m.maintenance },
    recovery: { run: m.recover },
  });
  return {
    dispatchFeedInternalRequest: dispatch,
    // The real Core/Feed HMAC dispatcher is used. This error envelope adapter
    // duplicates feedHttpError so its wrapper shape can be checked in isolation.
    feedHttpError: (error: unknown) => error instanceof FeedError ? {
      status: error.status,
      body: { success: false, code: error.code, error: error.message },
    } : {
      status: 500,
      body: { success: false, code: "INTERNAL_ERROR", error: "Не удалось выполнить запрос" },
    },
  };
});

import { internalFeedRoutes } from "./feed";
const path = "/internal/feed/jobs/claim" as const;
const app = new Hono().route("/internal/feed", internalFeedRoutes);
function signed(route: FeedInternalPath, body: string, extra: Record<string, string> = {}) {
  return {
    method: "POST", body,
    headers: {
      "content-type": "application/json",
      ...signFeedRequest({ path: route, body, key: m.key }),
      ...extra,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.nonceSeen.clear();
  m.nonceOutage = false;
  m.claim.mockResolvedValue([]);
  m.complete.mockResolvedValue({ accepted: true });
  m.fail.mockResolvedValue({ accepted: true });
  m.renew.mockResolvedValue({ accepted: true });
  m.maintenance.mockResolvedValue({ expired: 2 });
  m.recover.mockResolvedValue({ recovered: 1 });
});

describe("G1 mounted internal Feed: REAL signature verifier, fake disposable services", () => {
  it("returns bare Core DTO for authenticated claim; cache no-store", async () => {
    const response = await app.request(path, signed(path, '{"batchSize":2,"workerType":"video"}'));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
    expect(m.claim).toHaveBeenCalledWith(2, "video");
  });

  it("rejects unsigned request before nonce/Core consumption", async () => {
    const response = await app.request(path, {
      method: "POST", body: '{"batchSize":2,"workerType":"video"}',
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(m.consumeNonce).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("rejects signed-body substitution before nonce consumption", async () => {
    const opts = signed(path, '{"batchSize":2,"workerType":"video"}');
    const response = await app.request(path, { ...opts, body: '{"batchSize":3}' });
    expect(response.status).toBe(401);
    expect(m.consumeNonce).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("accepts only one of two simultaneous identical signed requests", async () => {
    const opts = signed(path, '{"batchSize":2,"workerType":"video"}');
    const [a, b] = await Promise.all([app.request(path, opts), app.request(path, opts)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    expect(m.claim).toHaveBeenCalledTimes(1);
  });

  it("fails closed on nonce store failure without leaking internal detail", async () => {
    m.nonceOutage = true;
    const response = await app.request(path, signed(path, '{"batchSize":2,"workerType":"video"}'));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("NONCE_STORE_SECRET_ERROR");
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("refuses a signed invalid batch command before Core", async () => {
    const response = await app.request(path, signed(path, '{"batchSize":21}'));
    expect(response.status).toBe(400);
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("refuses an unsigned oversized body without touching nonce or Core", async () => {
    const response = await app.request(path, {
      method: "POST", body: "x".repeat(16_385),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(413);
    expect(m.consumeNonce).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("rejects unsupported GET and query params before nonce Core", async () => {
    const get = await app.request(path);
    expect(get.status).toBe(405);
    const query = await app.request(path + "?owner=attacker", signed(path, '{"batchSize":2,"workerType":"video"}'));
    expect(query.status).toBe(404);
    expect(m.consumeNonce).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
  });

  it("renew passes signed jobId and UUID to Core without JSON wrapper", async () => {
    const route = "/internal/feed/jobs/renew" as const;
    const token = "12345678-1234-4234-8234-123456789012";
    const response = await app.request(route, signed(route,
      JSON.stringify({ jobId: "job-1", attemptToken: token }),
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(m.renew).toHaveBeenCalledWith("job-1", token);
  });

  it("maintenance returns merged cleanup/recovery DTO even with feature toggles off", async () => {
    const route = "/internal/feed/maintenance" as const;
    const response = await app.request(route, signed(route, '{"batchSize":2}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 2, recovered: 1 });
    expect(m.maintenance).toHaveBeenCalledWith(2);
    expect(m.recover).toHaveBeenCalledWith(2);
  });
});
