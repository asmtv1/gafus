import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedImpressionInput, FeedRankingEventInput } from "@gafus/types";

const fake = vi.hoisted(() => ({
  store: new Map<string, string>(),
  impressions: vi.fn(),
  outcomes: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => fake.store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { fake.store.set(key, value); }),
  },
}));
vi.mock("@/shared/lib/api/feed", () => ({
  feedApi: { recordImpressions: fake.impressions, recordRankingEvents: fake.outcomes },
}));

const impression = (eventId: string): FeedImpressionInput => ({
  eventId, postId: "post-1", rankingSessionId: "session-1",
  exposureToken: "token-1", algorithmVersion: "smart-rule-2026-10-a",
  rank: 0, visibleMs: 2000,
});
const dwell = (eventId: string): FeedRankingEventInput => ({
  eventId, postId: "post-1", rankingSessionId: "session-1",
  exposureToken: "token-1", algorithmVersion: "smart-rule-2026-10-a",
  rank: 0, kind: "dwell", durationMs: 8700,
});

beforeEach(() => {
  vi.resetModules();
  fake.store.clear();
  fake.impressions.mockReset();
  fake.outcomes.mockReset();
  fake.impressions.mockResolvedValue({ accepted: 1 });
  fake.outcomes.mockResolvedValue({ accepted: 1 });
});

describe("iOS/Android production telemetry adapter", () => {
  it("recovers from network loss after background flush with stable UUIDs", async () => {
    const { mobileFeedTelemetry } = await import("./telemetry");
    const adapter = mobileFeedTelemetry("android-offline");
    await adapter.ready;
    adapter.enqueueImpression(impression("stable-uuid"));
    fake.impressions.mockRejectedValueOnce(new Error("NETWORK_OFFLINE"));
    expect(await adapter.flush()).toBe(false);
    expect(adapter.impressions.size).toBe(1);
    expect(fake.store.get("gafus:feed:telemetry:v2:impressions:android-offline"))
      .toContain("stable-uuid");
    expect(await adapter.flush()).toBe(true);
    expect(adapter.impressions.size).toBe(0);
    expect(fake.impressions.mock.calls.map(([events]) => events[0].eventId))
      .toEqual(["stable-uuid", "stable-uuid"]);
  });

  it("preserves post-open/dwell outcomes until a qualified impression succeeds", async () => {
    const { mobileFeedTelemetry } = await import("./telemetry");
    const adapter = mobileFeedTelemetry("ios-background");
    await adapter.ready;
    adapter.enqueueImpression(impression("show-1"));
    adapter.enqueueOutcome(dwell("dwell-1"));
    fake.impressions.mockRejectedValueOnce(new Error("offline"));
    expect(await adapter.flush()).toBe(false);
    expect(fake.outcomes).not.toHaveBeenCalled();
    expect(await adapter.flush()).toBe(true);
    expect(fake.outcomes).toHaveBeenCalledTimes(1);
    expect(fake.outcomes.mock.calls[0]![0][0].eventId).toBe("dwell-1");
  });

  it("restores pending events after simulated app process restart", async () => {
    const first = (await import("./telemetry")).mobileFeedTelemetry("ios-restarted");
    await first.ready;
    first.enqueueImpression(impression("post-restart-id"));
    fake.impressions.mockRejectedValueOnce(new Error("background-network-failed"));
    expect(await first.flush()).toBe(false);

    vi.resetModules(); // simulate fresh iOS/Android JS runtime
    const second = (await import("./telemetry")).mobileFeedTelemetry("ios-restarted");
    await second.ready;
    expect(second.impressions.size).toBe(1);
    expect(await second.flush()).toBe(true);
    expect(second.impressions.size).toBe(0);
    expect(fake.impressions.mock.calls.at(-1)![0][0].eventId).toBe("post-restart-id");
  });
});
