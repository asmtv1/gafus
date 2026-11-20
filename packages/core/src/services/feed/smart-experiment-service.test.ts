import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedDb } from "@gafus/media-shared/media-db-ports";
import { createFeedService } from "../../../../feed-server/src/postRows";

const redisSet = vi.fn().mockResolvedValue("OK");

afterEach(() => vi.unstubAllEnvs());

describe("sticky experiment control session", () => {
  it("uses normal chronological retrieval and stores verified control exposure session", async () => {
    vi.stubEnv("FEED_SMART_ENABLED", "true");
    vi.stubEnv("FEED_SMART_AB_ENABLED", "true");
    vi.stubEnv("FEED_SMART_AB_PERCENT", "100");
    vi.stubEnv("FEED_SMART_AB_TREATMENT_PERCENT", "0");
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "viewer" }) },
      feedPost: { findMany },
      feedPersonalizationPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as FeedDb;
    const service = createFeedService({
      db, enabled: () => true, storage: { enabled: true } as never,
      smartSessionCache: { status: "ready", set: redisSet, get: vi.fn().mockResolvedValue(null) },
    });
    const result = await service.list("viewer", { sort: "smart", pageSize: 5 });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.feedMeta).toMatchObject({
      mode: "smart", personalized: false, experimentVariant: "control",
      algorithmVersion: "smart-rule-2026-10-a", fallback: null,
    });
    expect(redisSet).toHaveBeenCalledOnce();
    const session = JSON.parse(redisSet.mock.calls.at(-1)![1] as string);
    expect(session.actorId).toBe("viewer");
    expect(session.experimentVariant).toBe("control");
    expect(session.rows).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
