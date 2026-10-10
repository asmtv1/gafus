import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests exercise actual HTTP dispatcher, auth, Redis session gate and Prisma
// integration contract, with no live DB or user data.
const redis = vi.hoisted(() => ({
  status: "ready",
  get: vi.fn(),
  incrby: vi.fn(),
  expire: vi.fn(),
}));
vi.mock("@gafus/queues", () => ({ connection: redis }));
const database = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  feedPersonalizationPreference: { findUnique: vi.fn() },
  feedPost: { findMany: vi.fn() },
  feedImpression: { createMany: vi.fn(), findMany: vi.fn() },
  feedRankingEvent: { createMany: vi.fn() },
}));
vi.mock("@gafus/prisma", async importOriginal => ({
  ...(await importOriginal<typeof import("@gafus/prisma")>()),
  prisma: database,
}));
const prisma = database;

import { dispatchFeedRequest } from "./index.js";
import type { FeedService, FeedSocialService } from "@gafus/core/services/feed";

const owner = "viewer_1";
const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const impressionId = "123e4567-e89b-42d3-a456-426614174001";
const eventId = "123e4567-e89b-42d3-a456-426614174002";
const exposureToken = "123e4567-e89b-42d3-a456-426614174003";
const postId = "post_a";
const version = "smart-rule-2026-10-a";
const snapshot = {
  actorId: owner,
  version, preferencesUpdatedAt: 0,
  rows: [{ id: postId, exposureToken, sources: ["recent"] }],
};
const impression = {
  eventId: impressionId,
  postId, rankingSessionId: sessionId,
  algorithmVersion: version, rank: 0, visibleMs: 2500, exposureToken,
};
const outcome = {
  eventId, postId, rankingSessionId: sessionId,
  algorithmVersion: version, rank: 0, exposureToken,
  kind: "dwell", durationMs: 9400,
};
async function post(path: string, events: object[], viewer = owner) {
  const req = new Request("http://feed.local/api/v1/feed/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  return dispatchFeedRequest(viewer, req, "/" + path, {} as FeedService, {} as FeedSocialService);
}

beforeEach(() => {
  vi.stubEnv("FEED_SMART_ENABLED", "true");
  vi.stubEnv("FEED_SMART_EVENTS_ENABLED", "true");
  vi.stubEnv("FEED_SMART_EXPOSURE_TOKENS_REQUIRED", "true");
  redis.status = "ready";
  redis.get.mockReset().mockResolvedValue(JSON.stringify(snapshot));
  redis.incrby.mockReset().mockResolvedValue(1);
  redis.expire.mockReset().mockResolvedValue(1);
  prisma.user.findUnique.mockReset().mockResolvedValue({ id: owner });
  prisma.feedPersonalizationPreference.findUnique.mockReset().mockResolvedValue(null);
  prisma.feedPost.findMany.mockReset().mockResolvedValue([{ id: postId }]);
  prisma.feedImpression.createMany.mockReset().mockResolvedValue({ count: 1 });
  prisma.feedImpression.findMany.mockReset().mockResolvedValue([{ postId, rankingSessionId: sessionId }]);
  prisma.feedRankingEvent.createMany.mockReset().mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("smart feed HTTP integration: verified exposure -> outcome", () => {
  it("accepts valid impression and only then the dwell outcome", async () => {
    expect(await post("impressions/batch", [impression])).toEqual({ accepted: 1 });
    expect(prisma.feedImpression.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: owner, postId, rankingSessionId: sessionId })],
      skipDuplicates: true,
    }));
    expect(await post("ranking-events/batch", [outcome])).toEqual({ accepted: 1 });
    expect(prisma.feedRankingEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ durationMs: 9400, userId: owner, postId })],
      skipDuplicates: true,
    }));
  });

  it("rejects wrong viewer, rank, token and missing qualified impression", async () => {
    expect(await post("impressions/batch", [{ ...impression, exposureToken: "123e4567-e89b-42d3-a456-426614174004" }]))
      .toEqual({ accepted: 0 });
    expect(await post("ranking-events/batch", [{ ...outcome, rank: 1 }]))
      .toEqual({ accepted: 0 });
    expect(await post("ranking-events/batch", [outcome], "another_viewer")).toEqual({ accepted: 0 });
    prisma.feedImpression.findMany.mockResolvedValueOnce([]);
    expect(await post("ranking-events/batch", [outcome])).toEqual({ accepted: 0 });
    expect(prisma.feedRankingEvent.createMany).not.toHaveBeenCalled();
  });

  it("returns retryable on temporarily disconnected Redis instead of losing queued UUID", async () => {
    redis.status = "end";
    expect(await post("impressions/batch", [impression])).toEqual({ accepted: 0, retryable: true });
    expect(await post("ranking-events/batch", [outcome])).toEqual({ accepted: 0, retryable: true });
    redis.status = "ready";
    redis.get.mockRejectedValueOnce(new Error("Redis timeout"));
    expect(await post("impressions/batch", [impression])).toEqual({ accepted: 0, retryable: true });
    redis.get.mockRejectedValueOnce(new Error("Redis timeout"));
    expect(await post("ranking-events/batch", [outcome])).toEqual({ accepted: 0, retryable: true });
  });

  it("does not trust client event metadata for owner or author and uses Prisma dedup", async () => {
    await expect(post("ranking-events/batch", [{ ...outcome, userId: "attacker" }]))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    prisma.feedRankingEvent.createMany.mockResolvedValueOnce({ count: 0 });
    expect(await post("ranking-events/batch", [outcome])).toEqual({ accepted: 0 });
    expect(prisma.feedRankingEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.not.objectContaining({ userId: "attacker" })],
    }));
  });
});
