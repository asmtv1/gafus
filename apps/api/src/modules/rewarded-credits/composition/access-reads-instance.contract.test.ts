import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  role:vi.fn(async(_owner:string)=>({role:"USER"})),
  grant:vi.fn(async(_owner:string,_type:string,_id:string)=>null),
}));
vi.mock("@gafus/subscription-read-server", () => ({
  getAppSubscriptionAccess: vi.fn(async (userId: string) => ({
    hasActiveSubscription: userId === "subscribed-user",
  })),
  getCynologistEntitlements: vi.fn(),
}));
vi.mock("@gafus/feature-flags-server/appFeatureFlagsService", () => ({
  getAppFeatureFlagEnabled: vi.fn(async () => true),
  getMobileFeatureFlagEnabled: vi.fn(),
  getMobileReleaseControl: vi.fn(),
  getMobileAppPublicConfig: vi.fn(),
  setAppFeatureFlagEnabled: vi.fn(),
  updateMobileReleaseControl: vi.fn(),
}));
vi.mock("@gafus/entitlements-server/rewarded-access-reads",()=>({
  readOwnedCourseDayRewardedSteps:vi.fn(),
  readOwnedRewardedUserStep:vi.fn(),
  readRewardedPrivateCourseAssignment:vi.fn(),
  readOwnedDailyRewardedUserStep:vi.fn(),
  readPublishedDailyRewardedVideo:vi.fn(),
  readOwnedRewardedVideoStep:vi.fn(),
  readActiveLegacyRewardedGrant:sql.grant,
  readRewardedViewerRole:sql.role,
  readRewardedCourseVideoOccurrences:vi.fn(async()=>[]),
  readPendingRewardedStepNotificationUrl:vi.fn(),
}));
describe("API rewarded course/video SQL read composition",()=>{
  it("uses the account subscription for paid course steps", async () => {
    const core = await import("@gafus/core/services/rewardedCredits");
    const {rewardedAccessReader}=await import("./access-reads-instance");
    const policy=core.createRewardedAccessPolicy(rewardedAccessReader,async()=>true,async()=>false);
    const step = {
      platform: "ANDROID",
      target: { targetType: "COURSE_STEP", targetId: "step-1" },
    } as const;
    await expect(policy.getPremiumOrRewardedAccess({ ...step, userId: "subscribed-user" }))
      .resolves.toMatchObject({ allowed: true, source: "PREMIUM" });
    await expect(policy.getPremiumOrRewardedAccess({ ...step, userId: "unsubscribed-user" }))
      .rejects.toBeInstanceOf(core.SubscriptionOrCreditsRequiredError);
  });

  it("passes owner and exact target to SQL without invented authorization",async()=>{
    const core=await import("@gafus/core/services/rewardedCredits");
    const {rewardedAccessReader}=await import("./access-reads-instance");
    const policy=core.createRewardedAccessPolicy(rewardedAccessReader,async()=>true,async()=>false);
    await expect(policy.hasRewardedTargetUnlock({
      userId:"owner-1",platform:"ANDROID",target:{targetType:"ARTICLE",targetId:"article-2"},
    })).resolves.toBe(false);
    expect(sql.grant).toHaveBeenCalledWith("owner-1","ARTICLE","article-2",expect.any(Date));

  });
});
