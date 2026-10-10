import { afterEach, describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import type { FeedDb } from "./ports";
import { createFeedService } from "./service";
import { calculateSmartFeedScore, rerankSmartFeed } from "./smart-ranking";
import { smartRedisTimeout } from "./smart-redis";
import { SMART_ML_FEATURES, scoreSmartMl, type SmartMlModel } from "./smart-ml";

vi.mock("@gafus/queues", () => ({ connection: { status: "end" } }));
afterEach(() => vi.unstubAllEnvs());

const sample = {
  ageHours: 5, cityMatch: 1, petTypeOverlap: 0.5, breedOverlap: 0,
  authorAffinity: 0.2, reactions: 15, uniqueCommenters: 5,
  bookmarks: 4, exploration: 0.2, seenRecently: false,
};

describe("smart feed resilience and local CPU load", () => {
  it("falls back to chronological feed if ranking flag is off or Redis is down", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "viewer_1" }) },
      feedPost: { findMany: query },
    } as unknown as FeedDb;
    const service = createFeedService({
      db, enabled: () => true,
      storage: { enabled: true } as never,
    });
    vi.stubEnv("FEED_SMART_ENABLED", "false");
    const disabled = await service.list("viewer_1", { sort: "smart", pageSize: 10 });
    expect(disabled.feedMeta).toEqual({ mode: "smart", personalized: false, fallback: "new" });
    expect(disabled.nextCursor).toBeNull();
    vi.stubEnv("FEED_SMART_ENABLED", "true");
    const preference = vi.fn().mockResolvedValue({
      enabled: true, updatedAt: new Date(), useCity: true,
    });
    (db as unknown as { feedPersonalizationPreference: { findUnique: typeof preference } })
      .feedPersonalizationPreference = { findUnique: preference };
    const offline = await service.list("viewer_1", { sort: "smart", pageSize: 10 });
    expect(offline.items).toEqual([]);
    expect(offline.feedMeta?.fallback).toBe("new");
    expect(offline.nextCursor).toBeNull();
    expect(query).toHaveBeenCalled();
  });
  it("bounds Redis waits rather than hanging indefinitely", async () => {
    await expect(smartRedisTimeout(new Promise(() => {}), 20))
      .rejects.toThrow(/timeout/);
    await expect(smartRedisTimeout(Promise.resolve("ok"), 20))
      .resolves.toBe("ok");
  });
  it("measures pure ranking and scoring p95 with 500 candidates", () => {
    const model: SmartMlModel = {
      schemaVersion: 1, trainedAt: "2026-10-10", version: "test",
      trainRows: 2000, validationRows: 500,
      heads: Object.fromEntries(["reacted", "commented", "bookmarked", "negative"].map(key =>
        [key, { bias: -0.5, weights: Array(SMART_ML_FEATURES.length).fill(0.02),
          auc: 0.65, brier: 0.15, baselineBrier: 0.2 }],
      )) as SmartMlModel["heads"],
    };
    const rounds = 60;
    const elapsed: number[] = [];
    for (let round = 0; round < rounds; round += 1) {
      const start = performance.now();
      const posts = Array.from({ length: 500 }, (_, i) => {
        const factors = { ...sample,
          ageHours: i % 168, cityMatch: i % 2,
          reactions: (i * 17) % 51,
          seenRecently: i % 9 === 0,
        };
        const base = calculateSmartFeedScore(factors);
        const ml = scoreSmartMl(model, Array(SMART_ML_FEATURES.length).fill((i % 10) / 10));
        return {
          id: "post_" + i, authorId: "author_" + (i % 200),
          publishedAt: new Date(1791600000000 - i * 60_000),
          score: base.score * 0.3 + ml * 0.7,
          discovery: i % 3 === 0, reason: base.reason,
        };
      });
      const ranked = rerankSmartFeed(posts, 200);
      expect(ranked).toHaveLength(200);
      expect(new Set(ranked.map(post => post.id)).size).toBe(200);
      elapsed.push(performance.now() - start);
    }
    const sorted = elapsed.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    // This is a CPU-only microbenchmark, not a claim about real DB or HTTP latency.
    console.info(`smart CPU benchmark: 500 candidates, 200 ranked, 60 runs; p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(1000);
  }, 30_000);
});
