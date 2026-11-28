import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ progress: vi.fn() }));
vi.mock("@gafus/feed-server/gafus-reaction-progress", () => ({
  getGafusPostReactionProgress: (...args: unknown[]) => fixtures.progress(...args),
}));
vi.mock("@gafus/core/services/gafus", () => ({
  getGafusStatus: vi.fn(),
  listGafusTransactions: vi.fn(),
  unlockContentWithGafus: vi.fn(),
  listGafusMiniGuides: vi.fn(),
  getAuthorizedMiniGuideContent: vi.fn(),
  GafusError: class MockGafusError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
}));

vi.mock("@gafus/course-server/mini-guides", () => ({
  listGafusMiniGuides: vi.fn(),
  getAuthorizedMiniGuideContent: vi.fn(),
}));
import { gafusRoutes } from "./gafus";

const route = "/api/v1/gafus";
function app() {
  const h = new Hono();
  h.use(route + "/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-fixture-actor") ?? "owner-A",
      username: "fixture", role: "USER",
    });
    await next();
  });
  h.route(route, gafusRoutes);
  return h;
}
beforeEach(() => vi.resetAllMocks());

describe("Gafus protected reaction-progress owner/HTTP boundary", () => {
  it("derives actor exclusively from verified middleware identity and keeps private state no-store", async () => {
    fixtures.progress.mockImplementation(async (userId: string, postId: string) => ({
      postId, actorScope: userId, current: 8, highWater: 0,
      nextThreshold: 10, thresholdStep: 10, progress: 0.8,
    }));
    const response = await app().request(route + "/reaction-progress/post-1?userId=owner-B", {
      headers: { "x-fixture-actor": "owner-A" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      success: true, data: { postId: "post-1", actorScope: "owner-A" },
    });
    expect(fixtures.progress).toHaveBeenCalledExactlyOnceWith("owner-A", "post-1");
  });
  it("does not reveal unpublished or foreign-owner reward state", async () => {
    fixtures.progress.mockResolvedValue(null);
    const response = await app().request(route + "/reaction-progress/post-foreign", {
      headers: { "x-fixture-actor": "owner-B" },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, code: "GAFUS_NOT_FOUND" });
    expect(fixtures.progress).toHaveBeenCalledExactlyOnceWith("owner-B", "post-foreign");
  });
  it("rejects malformed post ID before querying the persistence adapter", async () => {
    const response = await app().request(route + "/reaction-progress/" + "x".repeat(129));
    expect(response.status).toBe(400);
    expect(fixtures.progress).not.toHaveBeenCalled();
  });
  it("never exposes Prisma/provider diagnostics in the response", async () => {
    fixtures.progress.mockRejectedValueOnce(new Error("PRIVATE_DB_URL_AND_OWNER_TOKEN"));
    const response = await app().request(route + "/reaction-progress/post-1");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("PRIVATE_DB_URL_AND_OWNER_TOKEN");
  });
});

vi.mock("../../modules/gafus/composition/wallet-instance.js", () => ({ gafusWallet: { listGafusTransactions: vi.fn(), changeGafusBalanceTx: vi.fn(), ensureGafusWalletTx: vi.fn() } }));
vi.mock("../../modules/gafus/composition/wallet-lock-instance.js", () => ({ gafusLock: { lockGafusUser: vi.fn() } }));
vi.mock("../../modules/content-access/composition/transactional-policy-instance.js", () => ({ transactionalContentPolicy: {} }));
