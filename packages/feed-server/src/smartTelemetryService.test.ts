import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  feedPersonalizationPreference: { findUnique: vi.fn() },
  feedPost: { findMany: vi.fn(), findFirst: vi.fn() },
  feedImpression: { createMany: vi.fn(), findMany: vi.fn() },
  feedRankingEvent: { createMany: vi.fn() },
  feedUserPostFeedback: { upsert: vi.fn() },
}));
vi.mock("@gafus/prisma", async importOriginal => ({
  ...(await importOriginal<typeof import("@gafus/prisma")>()),
  prisma: db,
}));
import {
  hasSmartFeedActor, getSmartFeedTelemetryPreference, eligibleSmartImpressionPostIds,
  recordSmartFeedImpressions, getQualifiedSmartImpressions, recordSmartFeedRankingEvents,
  storeSmartFeedPostFeedback,
} from "./smartTelemetryService.js";

describe("Smart feed persistence actor scope and replay safety", () => {
  beforeEach(() => vi.resetAllMocks());
  it("verifies the exact actor and fetches only its private preference", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "owner" }).mockResolvedValueOnce(null);
    expect(await hasSmartFeedActor("owner")).toBe(true);
    expect(await hasSmartFeedActor("missing")).toBe(false);
    expect(db.user.findUnique).toHaveBeenCalledWith({where:{id:"owner"},select:{id:true}});
    db.feedPersonalizationPreference.findUnique.mockResolvedValue(null);
    expect(await getSmartFeedTelemetryPreference("owner")).toBeNull();
    expect(db.feedPersonalizationPreference.findUnique).toHaveBeenCalledWith({where:{userId:"owner"}});
  });
  it("screens post visibility and user suppression before impressions are stored", async () => {
    db.feedPost.findMany.mockResolvedValue([{id:"visible"}]);
    expect(await eligibleSmartImpressionPostIds("viewer",["visible","foreign"])).toEqual(["visible"]);
    expect(db.feedPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status:"published", deletedAt:null, moderationState:"visible",
        feedback:{none:{userId:"viewer",kind:"not_interested"}},
        author:{feedSubscribers:{none:{userId:"viewer",hidden:true}}},
      }),
      select:{id:true},
    }));
  });
  it("stores replayed impressions/ranking event only via database unique dedup", async () => {
    db.feedImpression.createMany.mockResolvedValue({count:0});
    db.feedRankingEvent.createMany.mockResolvedValue({count:0});
    expect(await recordSmartFeedImpressions([{eventId:"same-event"}] as never)).toBe(0);
    expect(await recordSmartFeedRankingEvents([{eventId:"same-event"}] as never)).toBe(0);
    expect(db.feedImpression.createMany).toHaveBeenCalledWith({
      data:[{eventId:"same-event"}],skipDuplicates:true,
    });
    expect(db.feedRankingEvent.createMany).toHaveBeenCalledWith({
      data:[{eventId:"same-event"}],skipDuplicates:true,
    });
  });
  it("qualifies outcomes only for matching viewer/ranking-session pairs", async () => {
    db.feedImpression.findMany.mockResolvedValue([]);
    await getQualifiedSmartImpressions("viewer",[{postId:"p",rankingSessionId:"s"}]);
    expect(db.feedImpression.findMany).toHaveBeenCalledWith({
      where:{userId:"viewer",OR:[{postId:"p",rankingSessionId:"s"}]},
      select:{postId:true,rankingSessionId:true},
    });
  });
  it("never writes feedback for an invisible/foreign post", async () => {
    db.feedPost.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:"p"});
    await expect(storeSmartFeedPostFeedback({actorId:"actor",postId:"p",kind:"not_interested"}))
      .rejects.toMatchObject({code:"NOT_FOUND",status:404});
    expect(db.feedUserPostFeedback.upsert).not.toHaveBeenCalled();
    expect(await storeSmartFeedPostFeedback({actorId:"actor",postId:"p",kind:"show_more"}))
      .toEqual({saved:true});
    expect(db.feedPost.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({
        id:"p",status:"published",deletedAt:null,moderationState:"visible",
        author:{feedSubscribers:{none:{userId:"actor",hidden:true}}},
      }),
    }));
    expect(db.feedUserPostFeedback.upsert).toHaveBeenCalledWith({
      where:{userId_postId_kind:{userId:"actor",postId:"p",kind:"show_more"}},
      create:{userId:"actor",postId:"p",kind:"show_more"},update:{},
    });
  });
});