import { beforeEach, describe, expect, it, vi } from "vitest";
const flags=vi.hoisted(()=>({enabled:vi.fn(async()=>true)}));
vi.mock("../appFeatureFlags",()=>({
  APP_FEATURE_APP_SUBSCRIPTION_GATING:"app_subscription_gating_enabled",
  getAppFeatureFlagEnabled:flags.enabled,
}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();flags.enabled.mockResolvedValue(true);});
function port() {
 return {
  getAppSubscriptionAccess:vi.fn(async()=>({hasActiveSubscription:false})),
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
  it("requires explicit dependencies",async()=>{
    const {createRewardedAccessPolicy}=await import("./accessService");
    expect(()=>createRewardedAccessPolicy(undefined as never,flags.enabled,async()=>false)).toThrow("REWARDED_ACCESS_DEPENDENCIES_REQUIRED");
  });
  it("reads exact owner role and exact target, never grants global Step-based credit",async()=>{
    const {createRewardedAccessPolicy}=await import("./accessService");
    const db=port();const svc=createRewardedAccessPolicy(db,flags.enabled,async()=>false);
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
  it("keeps two independent owner readers",async()=>{
    const {createRewardedAccessPolicy}=await import("./accessService");
    const a=port(),b=port();
    b.getAppSubscriptionAccess.mockResolvedValue({hasActiveSubscription:true});
    const first=createRewardedAccessPolicy(a,flags.enabled,async()=>false);
    const second=createRewardedAccessPolicy(b,flags.enabled,async()=>false);
    const input={userId:"owner-A",platform:"IOS",target:{targetType:"ARTICLE",targetId:"article-A"}} as const;
    await expect(first.getPremiumOrRewardedAccess(input)).rejects.toThrow();
    await expect(second.getPremiumOrRewardedAccess(input)).resolves.toMatchObject({allowed:true,source:"PREMIUM"});
  });
});
