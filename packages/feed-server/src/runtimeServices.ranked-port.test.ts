import { describe, expect, it, vi } from "vitest";

const p = vi.hoisted(() => ({
  db: { name: "disposable-sql-connection" },
  ranked: vi.fn(),
  smart: vi.fn(),
  feedService: vi.fn(() => ({ marker: "feed-service" })),
  cache: { status: "ready" },
}));
vi.mock("@gafus/prisma", () => ({ prisma: p.db }));
vi.mock("@gafus/queues", () => ({ connection: p.cache }));
vi.mock("@gafus/media-server/feed-ranked-rows", () => ({
  readRankedFeedRows: p.ranked,
}));
vi.mock("./smartStats.js", () => ({
  readSmartFeedPostStats: p.smart,
}));
vi.mock("@gafus/core/services/feed", () => ({
  createFeedService: p.feedService,
  createFeedSocial: vi.fn(),
  createFeedPolls: vi.fn(),
  createFeedPreferences: vi.fn(),
  createSmartFeedPreferences: vi.fn(),
  createFeedStorageJobs: vi.fn(),
  createFeedMaintenance: vi.fn(),
  createFeedUploadRecovery: vi.fn(),
}));

import { createCurrentFeedRuntime } from "./runtimeServices.js";

describe("production feed-ranked SQL composition", () => {
  it("injects the exact server query and existing SQL/Redis dependencies", () => {
    const storage = { enabled: true } as const;
    const enabled = () => true;
    const runtime = createCurrentFeedRuntime(storage as never, enabled);
    expect(runtime.service).toEqual({ marker: "feed-service" });
    expect(p.feedService).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        db: p.db,
        storage,
        enabled,
        readRankedFeedRows: p.ranked,
        readSmartFeedPostStats: p.smart,
        smartSessionCache: p.cache,
      }),
    );
  });
});
