import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusTx } from "./types";

const mocks = vi.hoisted(() => ({
  count: 0,
  highWater: 0,
  enabled: true,
  awards: [] as string[],
  milestones: [] as number[],
  award: vi.fn(),
  signalCount: 0,
  program: { postId: "post-1", thresholdStep: 10, settingsRevision: 1 },
}));

vi.mock("./rewardService", () => ({
  awardActivityTx: vi.fn(),
  awardBonusTx: (...args: unknown[]) => mocks.award(...args),
}));
vi.mock("./settingsService", () => ({
  getGafusSettingsTx: vi.fn(async () => ({
    economyEnabled: mocks.enabled, earningEnabled: mocks.enabled,
    revision: 1, reactionThreshold: 10,
  })),
}));

import {
  advanceGafusReactionMilestonesTx,
  registerGafusPostPublicationTx,
} from "./reactionRewardService";
import { awardActivityTx } from "./rewardService";

function fixture() {
  return {
    gafusPostReactionProgram: {
      findUnique: async () => ({ ...mocks.program, highWaterReactionCount: mocks.highWater }),
      update: async ({ data }: { data: { highWaterReactionCount: number } }) => {
        mocks.highWater = data.highWaterReactionCount;
      },
      create: vi.fn(),
    },
    feedPostReaction: {
      count: async ({ where }: { where: { createdAt?: unknown } }) =>
        where.createdAt ? mocks.signalCount : mocks.count,
    },
    gafusFraudSignal: {
      findFirst: async () => null,
      create: vi.fn(),
    },
    gafusPostReactionMilestone: {
      create: async ({ data }: { data: { threshold: number } }) => {
        mocks.milestones.push(data.threshold);
      },
    },
  } as unknown as GafusTx;
}

describe("Gafus reaction high-water and idempotency", () => {
  const at = new Date("2026-10-11T00:00:00Z");
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count = 0;
    mocks.highWater = 0;
    mocks.enabled = true;
    mocks.awards = [];
    mocks.milestones = [];
    mocks.signalCount = 0;
    mocks.award.mockImplementation(async (_tx: unknown, input: { eventKey: string }) => {
      mocks.awards.push(input.eventKey);
      return { decision: "GRANTED", amount: 1 };
    });
  });

  it("grants every crossed ten-reaction milestone, including skipped buckets", async () => {
    const tx = fixture();
    mocks.count = 20;
    expect(await advanceGafusReactionMilestonesTx(tx, {
      postId: "post-1", authorId: "author-1", at,
    })).toBe(2);
    expect(mocks.milestones).toEqual([10, 20]);
    expect(mocks.awards).toEqual([
      "bonus:post-reaction:post-1:10",
      "bonus:post-reaction:post-1:20",
    ]);
    mocks.count = 8;
    expect(await advanceGafusReactionMilestonesTx(tx, {
      postId: "post-1", authorId: "author-1", at,
    })).toBe(0);
    mocks.count = 10;
    expect(await advanceGafusReactionMilestonesTx(tx, {
      postId: "post-1", authorId: "author-1", at,
    })).toBe(0);
    expect(mocks.awards).toHaveLength(2);
    mocks.count = 30;
    expect(await advanceGafusReactionMilestonesTx(tx, {
      postId: "post-1", authorId: "author-1", at,
    })).toBe(1);
    expect(mocks.milestones).toEqual([10, 20, 30]);
  });

  it("keeps high-water while earning is disabled and does not retroactively reward", async () => {
    const tx = fixture();
    mocks.enabled = false;
    mocks.count = 10;
    expect(await advanceGafusReactionMilestonesTx(tx, {
      postId: "post-1", authorId: "author-1", at,
    })).toBe(0);
    expect(mocks.highWater).toBe(10);
    mocks.enabled = true;
    expect(await advanceGafusReactionMilestonesTx(tx, {
      postId: "post-1", authorId: "author-1", at,
    })).toBe(0);
    expect(mocks.awards).toHaveLength(0);
  });

  it("does not retroactively award edits to already published posts", async () => {
    const tx = fixture();
    await registerGafusPostPublicationTx(
      tx, { id: "post-1", authorId: "author-1", publishedAt: at },
      { publishedAt: at, text: "Новый текст", hasPublishedMedia: false },
    );
    expect(awardActivityTx).not.toHaveBeenCalled();
  });
});
