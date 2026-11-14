import { beforeEach, describe, expect, it, vi } from "vitest";
const flags=vi.hoisted(()=>({enabled:vi.fn(async()=>true)}));
vi.mock("../appFeatureFlags",()=>({
  APP_FEATURE_APP_SUBSCRIPTION_GATING:"app_subscription_gating_enabled",
  getAppFeatureFlagEnabled:flags.enabled,
}));
vi.mock("../appSubscription",()=>({
  getAppSubscriptionAccess:vi.fn(async()=>({hasActiveSubscription:false})),
}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();flags.enabled.mockResolvedValue(true);});
function port() {
 return {
  readOwnedCourseDayRewardedSteps:vi.fn(async()=>null),
  readOwnedRewardedUserStep:vi.fn(async()=>null),
  readRewardedPrivateCourseAssignment:vi.fn(async()=>null),
  readOwnedDailyRewardedUserStep:vi.fn(async()=>null),
  readPublishedDailyRewardedVideo:vi.fn(async()=>null),
  readOwnedRewardedVideoStep:vi.fn(async()=>null),
  readActiveLegacyRewardedGrant:vi.fn(async()=>null),
  readRewardedViewerRole:vi.fn(async()=>({role:"USER"})),
  readRewardedCourseVideoOccurrences:vi.fn(async()=>[]),
  readPendingRewardedStepNotificationUrl:vi.fn(async()=>null),
 };
}
describe("Rewarded paid course and video occurrence read port",()=>{
  it("without SQL actor role/owner reads rejects all gated premium unlocks",async()=>{
    const svc=await import("./accessService");
    await expect(svc.getPremiumOrRewardedAccess({
      userId:"owner-A",platform:"IOS",target:{targetType:"COURSE_STEP",targetId:"step-1"},
    })).rejects.toThrow("REWARDED_ACCESS_READ_PORT_UNBOUND");
    await expect(svc.hasRewardedTargetUnlock({
      userId:"owner-A",platform:"ANDROID",target:{targetType:"ARTICLE",targetId:"article-A"},
    })).rejects.toThrow("REWARDED_ACCESS_READ_PORT_UNBOUND");
  });
  it("reads exact owner role and exact target, never grants global Step-based credit",async()=>{
    const p=await import("./rewardedAccessReadPort");const svc=await import("./accessService");
    const db=port();p.registerRewardedAccessReadPort(db);
    await expect(svc.hasRewardedTargetUnlock({
      userId:"owner-A",platform:"ANDROID",target:{targetType:"ARTICLE",targetId:"article-B"},
    })).resolves.toBe(false);
    expect(db.readActiveLegacyRewardedGrant).toHaveBeenCalledWith(
      "owner-A","ARTICLE","article-B",expect.any(Date),
    );
    await expect(svc.getPremiumOrRewardedAccess({
      userId:"owner-A",platform:"WEB_DESKTOP",target:{targetType:"COURSE_STEP",targetId:"step-1"},
    })).rejects.toThrow();
    expect(db.readRewardedViewerRole).toHaveBeenCalledExactlyOnceWith("owner-A");
  });
  it("refuses runtime replacement of owner-scoped server reader",async()=>{
    const p=await import("./rewardedAccessReadPort");const db=port();
    p.registerRewardedAccessReadPort(db);p.registerRewardedAccessReadPort(db);
    expect(()=>p.registerRewardedAccessReadPort(port()))
      .toThrow("REWARDED_ACCESS_READ_PORT_ALREADY_BOUND");
  });
});
